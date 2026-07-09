// app/api/entfernung/route.ts
// ============================================================================
// ARGONAUT OS · Block 2 · Welle 1 · B2
// Entfernung vom Betriebsstandort zu einem Kunden.
//
// DREI STUFEN, in dieser Reihenfolge:
//   1. Cache (geo_routen)  -> 0 Anfragen, sofort
//   2. ORS-Route           -> echte Fahrstrecke, wenn ein Schlüssel da ist
//   3. Luftlinie           -> Notnagel, IMMER als "geschätzt" gekennzeichnet
//
// EINE REGEL, DIE SPÄTER GELD SPART:
//   Liegt eine Luftlinie im Cache und ist inzwischen ein Kartendienst
//   hinterlegt, wird sie verworfen und neu gerechnet. Sonst blieben die
//   Entfernungen für immer Schätzwerte, obwohl der Schlüssel längst da ist.
//
// DER WÄCHTER:
//   Ist die Verortung veraltet (Adresse geändert, Koordinaten alt), wird
//   NICHT gerechnet. Lieber keine Entfernung als eine falsche.
//
// Body:    { art: 'kontakt' | 'firma', id: string, neu?: boolean }
// Antwort: { ok, distanzMeter, dauerSekunden, quelle, geschaetzt, ausCache }
// ============================================================================

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { routeEntfernung, luftlinieMeter, zentralerSchluessel, type Punkt } from "@/lib/ors";
import {
  ausKontakt, ausFirma, ausStandort, standardStandort,
  hatKoordinaten, verortungVeraltet, alsPunkt,
  type KontaktQuelle, type FirmaQuelle, type StandortQuelle,
} from "@/app/dashboard/_components/empfaengerLogik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Art = "kontakt" | "firma";

const TABELLE: Record<Art, string> = { kontakt: "kontakte", firma: "firmen" };
const FELDER: Record<Art, string> = {
  kontakt: "id, vorname, nachname, firma, firma_id, email, telefon, strasse, plz, ort, land, geo_lat, geo_lon, geocode_am, geocode_status, geocode_adresse",
  firma: "id, name, email, telefon, strasse, plz, ort, land, geo_lat, geo_lon, geocode_am, geocode_status, geocode_adresse",
};

const PROFIL = "driving-car";

/**
 * Koordinaten auf 5 Nachkommastellen (~1 m). Ohne das trifft der Cache nie,
 * weil sich die letzten Stellen einer Fließkommazahl fast immer unterscheiden.
 */
function schluessel(p: Punkt): { lat: number; lon: number } {
  return { lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5 };
}

function istArt(w: unknown): w is Art {
  return w === "kontakt" || w === "firma";
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const art = body?.art;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const neuRechnen = body?.neu === true;

    if (!istArt(art)) return NextResponse.json({ error: "Unbekannte Art. Erlaubt: kontakt, firma." }, { status: 400 });
    if (!id) return NextResponse.json({ error: "Keine ID übergeben." }, { status: 400 });

    // --- 1. Start: der Betriebsstandort -----------------------------------
    const { data: stRows, error: stFehler } = await supabase
      .from("betriebs_standort")
      .select("id, bezeichnung, strasse, plz, ort, land, geo_lat, geo_lon, geocode_adresse, ist_standard, aktiv")
      .eq("owner_user_id", user.id);
    if (stFehler) throw stFehler;

    const std = standardStandort((stRows as unknown as StandortQuelle[]) ?? []);
    if (!std) {
      return NextResponse.json(
        { error: "Es ist kein Betriebsstandort hinterlegt. Bitte unter Einstellungen eintragen.", code: "kein_standort" },
        { status: 400 },
      );
    }
    const startEmpf = ausStandort(std);
    const start = alsPunkt(startEmpf);
    if (!start) {
      return NextResponse.json(
        { error: "Der Betriebsstandort ist noch nicht verortet. Bitte unter Einstellungen verorten.", code: "standort_nicht_verortet" },
        { status: 400 },
      );
    }

    // --- 2. Ziel: der Kunde ------------------------------------------------
    const { data: zeile, error: ladeFehler } = await supabase
      .from(TABELLE[art]).select(FELDER[art]).eq("id", id).maybeSingle();
    if (ladeFehler) throw ladeFehler;
    if (!zeile) return NextResponse.json({ error: "Datensatz nicht gefunden." }, { status: 404 });

    const zielEmpf = art === "kontakt"
      ? ausKontakt(zeile as unknown as KontaktQuelle)
      : ausFirma(zeile as unknown as FirmaQuelle);

    if (!hatKoordinaten(zielEmpf)) {
      return NextResponse.json(
        { error: `${zielEmpf.name} ist noch nicht verortet. Bitte im Adressblock verorten.`, code: "nicht_verortet" },
        { status: 400 },
      );
    }

    // Der Wächter. Lieber keine Entfernung als eine falsche.
    if (verortungVeraltet(zielEmpf)) {
      return NextResponse.json(
        {
          error:
            "Die Anschrift wurde geändert, seit die Koordinaten ermittelt wurden. " +
            "Bitte neu verorten — sonst würde die Entfernung zur alten Adresse gerechnet.",
          code: "verortung_veraltet",
        },
        { status: 409 },
      );
    }

    const ziel = alsPunkt(zielEmpf) as Punkt;
    const s = schluessel(start);
    const z = schluessel(ziel);

    // --- 3. Schlüssel-Kette (bestimmt, was überhaupt möglich ist) ----------
    const admin = createAdminClient();
    const { data: geheim } = await admin
      .from("betriebs_geheimnisse")
      .select("id, geheimnis")
      .eq("owner_user_id", user.id).eq("art", "ors").eq("aktiv", true)
      .maybeSingle();

    const eigenerId: string | null = geheim ? (geheim.id as string) : null;
    const orsKey: string | null = geheim ? (geheim.geheimnis as string) : zentralerSchluessel();

    // --- 4. Cache befragen -------------------------------------------------
    const { data: cache } = await supabase
      .from("geo_routen")
      .select("id, distanz_m, dauer_s, quelle, ermittelt_am")
      .eq("owner_user_id", user.id)
      .eq("start_lat", s.lat).eq("start_lon", s.lon)
      .eq("ziel_lat", z.lat).eq("ziel_lon", z.lon)
      .eq("profil", PROFIL)
      .maybeSingle();

    // Eine gecachte Luftlinie ist überholt, sobald ein Kartendienst da ist.
    const cacheTaugt =
      !!cache && !neuRechnen && !(cache.quelle === "luftlinie" && orsKey !== null);

    if (cacheTaugt && cache) {
      const distanz = Number(cache.distanz_m);
      return NextResponse.json({
        ok: true,
        distanzMeter: distanz,
        dauerSekunden: cache.dauer_s !== null ? Number(cache.dauer_s) : null,
        quelle: cache.quelle,
        geschaetzt: cache.quelle === "luftlinie",
        ausCache: true,
        ermitteltAm: cache.ermittelt_am,
      });
    }

    // --- 5. Rechnen --------------------------------------------------------
    let distanzMeter: number;
    let dauerSekunden: number | null = null;
    let quelle: "ors" | "luftlinie" = "luftlinie";
    let hinweis: string | null = null;

    if (orsKey) {
      const erg = await routeEntfernung(orsKey, start, ziel, PROFIL);

      // Kontingent bzw. Schlüsselstatus nachführen — nur beim eigenen Schlüssel.
      if (eigenerId) {
        const jetzt = new Date().toISOString();
        const patch: Record<string, unknown> = { zuletzt_geprueft_am: jetzt };
        if (erg.status === "ungueltig" || erg.status === "kontingent") {
          patch.pruef_status = erg.status;
          patch.pruef_meldung = erg.meldung;
        } else if (erg.ok) {
          patch.pruef_status = "ok";
          patch.pruef_meldung = "Verbindung steht.";
        }
        const rest = erg.treffer?.kontingentRest ?? null;
        if (rest !== null) { patch.kontingent_rest = rest; patch.kontingent_stand_am = jetzt; }
        await admin.from("betriebs_geheimnisse").update(patch).eq("id", eigenerId);
      }

      if (erg.ok && erg.treffer) {
        distanzMeter = erg.treffer.distanzMeter;
        dauerSekunden = erg.treffer.dauerSekunden;
        quelle = "ors";
      } else {
        // Kein Totalausfall: wir schätzen, sagen es aber.
        distanzMeter = luftlinieMeter(start, ziel);
        hinweis = `${erg.meldung} Es wurde stattdessen die Luftlinie geschätzt.`;
      }
    } else {
      distanzMeter = luftlinieMeter(start, ziel);
      hinweis = "Kein Kartendienst hinterlegt — die Entfernung ist eine Schätzung auf Basis der Luftlinie.";
    }

    // --- 6. Cache schreiben ------------------------------------------------
    const jetzt = new Date().toISOString();
    const { error: cacheFehler } = await supabase.from("geo_routen").upsert({
      owner_user_id: user.id,
      start_lat: s.lat, start_lon: s.lon,
      ziel_lat: z.lat, ziel_lon: z.lon,
      profil: PROFIL,
      distanz_m: Math.round(distanzMeter),
      dauer_s: dauerSekunden !== null ? Math.round(dauerSekunden) : null,
      quelle,
      ermittelt_am: jetzt,
    }, { onConflict: "owner_user_id,start_lat,start_lon,ziel_lat,ziel_lon,profil" });

    // Ein kaputter Cache darf das Ergebnis nicht verhindern.
    if (cacheFehler) console.error("Entfernung: Cache-Schreibfehler:", cacheFehler.message);

    return NextResponse.json({
      ok: true,
      distanzMeter: Math.round(distanzMeter),
      dauerSekunden: dauerSekunden !== null ? Math.round(dauerSekunden) : null,
      quelle,
      geschaetzt: quelle === "luftlinie",
      ausCache: false,
      ermitteltAm: jetzt,
      hinweis,
    });
  } catch (err: unknown) {
    console.error("Entfernung Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
