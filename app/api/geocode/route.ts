// app/api/geocode/route.ts
// ============================================================================
// ARGONAUT OS · Block 2 · Welle 1 · B1-3c
// Verortet eine Adresse (Betriebsstandort, Privatkunde oder Firmenkunde) und
// schreibt die Koordinaten in den Datensatz.
//
// SCHLÜSSEL-KETTE
//   1. eigener Schlüssel des Betriebs (betriebs_geheimnisse)
//   2. zentraler ARGONAUT-Schlüssel (ENV ORS_API_KEY) — nur Notnagel
//   3. keiner -> ehrliche Fehlermeldung, KEINE stille Luftlinie
//
// SICHERHEIT
//   - Das Geheimnis wird nur hier gelesen und verlässt die Funktion nie.
//   - Gelesen/geschrieben wird der Kundendatensatz mit dem NORMALEN Server-
//     Client. Damit greift RLS: niemand kann fremde Adressen verorten.
//   - Der Admin-Client fasst ausschließlich betriebs_geheimnisse an.
//
// KONTINGENT
//   Nach jeder Anfrage wird der Reststand aus dem ORS-Header nachgeführt.
//   Ein ungültiger Schlüssel setzt sofort pruef_status = 'ungueltig', damit
//   die Oberfläche es beim nächsten Laden anzeigt.
//
// B1-4b: Der verwendete Suchtext wird in `geocode_adresse` festgehalten.
//   Nur so laesst sich spaeter erkennen, ob die Koordinaten noch zur heutigen
//   Anschrift gehoeren. Ohne das rechnet die Anfahrt nach einem Umzug still
//   die Entfernung zum alten Haus.
//
// Body:    { art: 'standort' | 'kontakt' | 'firma', id: string }
// Antwort: { ok, lat, lon, genauigkeit, label, kontingentRest, quelle }
// ============================================================================

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { geocodeAdresse, zentralerSchluessel } from "@/lib/ors";
import {
  ausKontakt, ausFirma, ausStandort, geocodeSuchtext,
  type KontaktQuelle, type FirmaQuelle, type StandortQuelle,
} from "@/app/dashboard/_components/empfaengerLogik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Art = "standort" | "kontakt" | "firma";

const TABELLE: Record<Art, string> = {
  standort: "betriebs_standort",
  kontakt: "kontakte",
  firma: "firmen",
};

const FELDER: Record<Art, string> = {
  standort: "id, bezeichnung, strasse, plz, ort, land, geo_lat, geo_lon, geocode_adresse, ist_standard, aktiv",
  kontakt: "id, vorname, nachname, firma, firma_id, email, telefon, strasse, plz, ort, land, geo_lat, geo_lon, geocode_am, geocode_status, geocode_adresse",
  firma: "id, name, email, telefon, strasse, plz, ort, land, geo_lat, geo_lon, geocode_am, geocode_status, geocode_adresse",
};

function istArt(w: unknown): w is Art {
  return w === "standort" || w === "kontakt" || w === "firma";
}

export async function POST(req: Request) {
  try {
    // --- 1. Wer fragt? ---------------------------------------------------
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const art = body?.art;
    const id = typeof body?.id === "string" ? body.id.trim() : "";

    if (!istArt(art)) {
      return NextResponse.json({ error: "Unbekannte Art. Erlaubt: standort, kontakt, firma." }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: "Keine ID übergeben." }, { status: 400 });
    }

    // --- 2. Datensatz laden (RLS schützt vor fremden Adressen) -----------
    const { data: zeile, error: ladeFehler } = await supabase
      .from(TABELLE[art])
      .select(FELDER[art])
      .eq("id", id)
      .maybeSingle();

    if (ladeFehler) throw ladeFehler;
    if (!zeile) return NextResponse.json({ error: "Datensatz nicht gefunden." }, { status: 404 });

    // --- 3. Einheitliche Sicht + Suchtext --------------------------------
    const empf =
      art === "standort" ? ausStandort(zeile as unknown as StandortQuelle)
      : art === "kontakt" ? ausKontakt(zeile as unknown as KontaktQuelle)
      : ausFirma(zeile as unknown as FirmaQuelle);

    const suchtext = geocodeSuchtext(empf);
    if (!suchtext) {
      return NextResponse.json(
        { error: "Die Anschrift reicht für eine Suche nicht aus. Mindestens PLZ oder Ort werden gebraucht." },
        { status: 400 },
      );
    }

    // --- 4. Schlüssel-Kette ----------------------------------------------
    const admin = createAdminClient();

    const { data: geheim, error: geheimFehler } = await admin
      .from("betriebs_geheimnisse")
      .select("id, geheimnis")
      .eq("owner_user_id", user.id)
      .eq("art", "ors")
      .eq("aktiv", true)
      .maybeSingle();

    if (geheimFehler) throw geheimFehler;

    const eigenerId: string | null = geheim ? (geheim.id as string) : null;
    const schluessel: string | null = geheim
      ? (geheim.geheimnis as string)
      : zentralerSchluessel();

    if (!schluessel) {
      return NextResponse.json(
        {
          error:
            "Es ist kein OpenRouteService-Schlüssel hinterlegt. " +
            "Trag ihn unter Einstellungen ein — dann rechnet ARGONAUT die Anfahrt automatisch.",
          code: "kein_schluessel",
        },
        { status: 400 },
      );
    }

    // --- 5. Verorten ------------------------------------------------------
    const erg = await geocodeAdresse(schluessel, suchtext);
    const jetzt = new Date().toISOString();

    // Kontingent bzw. Schlüsselstatus nachführen — nur beim eigenen Schlüssel.
    if (eigenerId) {
      const patch: Record<string, unknown> = { zuletzt_geprueft_am: jetzt };
      if (erg.status === "ungueltig" || erg.status === "kontingent") {
        patch.pruef_status = erg.status;
        patch.pruef_meldung = erg.meldung;
      } else if (erg.ok) {
        patch.pruef_status = "ok";
        patch.pruef_meldung = "Verbindung steht.";
      }
      const rest = erg.treffer?.kontingentRest ?? null;
      if (rest !== null) {
        patch.kontingent_rest = rest;
        patch.kontingent_stand_am = jetzt;
      }
      await admin.from("betriebs_geheimnisse").update(patch).eq("id", eigenerId);
    }

    // --- 6. Fehlerfälle ---------------------------------------------------
    if (!erg.ok) {
      const code = erg.status === "kontingent" ? 429 : erg.status === "ungueltig" ? 400 : 502;
      return NextResponse.json({ error: erg.meldung, status: erg.status }, { status: code });
    }

    if (!erg.treffer) {
      // Anfrage lief, Adresse wurde nicht gefunden. Das ist ein Ergebnis,
      // kein Systemfehler — und wird als solches festgehalten.
      await supabase
        .from(TABELLE[art])
        .update({
          geocode_status: "fehlgeschlagen",
          geocode_am: jetzt,
          geocode_quelle: "ors",
          geocode_adresse: suchtext,
        })
        .eq("id", id);

      return NextResponse.json(
        { ok: false, gefunden: false, error: erg.meldung, suchtext },
        { status: 404 },
      );
    }

    // --- 7. Koordinaten speichern -----------------------------------------
    const t = erg.treffer;
    const { error: schreibFehler } = await supabase
      .from(TABELLE[art])
      .update({
        geo_lat: t.lat,
        geo_lon: t.lon,
        geocode_am: jetzt,
        geocode_status: t.genauigkeit, // 'ok' | 'ungenau'
        geocode_quelle: "ors",
        // Genau der Text, der an den Kartendienst ging. Der Vergleichsanker.
        geocode_adresse: suchtext,
      })
      .eq("id", id);

    if (schreibFehler) throw schreibFehler;

    return NextResponse.json({
      ok: true,
      gefunden: true,
      lat: t.lat,
      lon: t.lon,
      genauigkeit: t.genauigkeit,
      label: t.label,
      suchtext,
      kontingentRest: t.kontingentRest,
      quelle: eigenerId ? "eigener_schluessel" : "argonaut_schluessel",
    });
  } catch (err: unknown) {
    // Niemals den rohen Fehler an den Client — er kann Interna enthalten.
    console.error("Geocode Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
