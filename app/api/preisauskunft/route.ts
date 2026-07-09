// app/api/preisauskunft/route.ts
// ============================================================================
// ARGONAUT OS · Block 2 · Welle 1 · C4-3c
// Die Preisauskunft als Endpunkt — für n8n und jede andere Automatisierung.
//
// HIER LIEGT KEINE FACHLOGIK.
//   Diese Route lädt Daten, ruft erstellePreisauskunft() auf, gibt JSON zurück.
//   Dieselbe Rechnung wie auf der Seite (C4-2) und später im PDF (C4-4).
//   Drei Orte, eine Wahrheit. n8n macht nichts als anrufen und die Mail
//   schicken — ersetzt du n8n später, tauschst du zwei Knoten, keinen Code.
//
// DER BETRIEB KOMMT AUS DEM SCHLÜSSEL.
//   Es gibt kein owner_user_id im Anfrage-Körper. Ein gestohlener Schlüssel
//   öffnet genau einen Betrieb, nicht dreißig.
//
// VIER WÄCHTER — die Route antwortet lieber mit einem Grund als mit einer Zahl:
//   1. Ungültiger oder widerrufener Schlüssel  -> 401
//   2. Variante nicht gefunden / mehrdeutig    -> 409 mit Klartext
//   3. Kein Preis in der Einheit               -> 409, KEIN 0-Euro-Angebot
//   4. Verortung veraltet                      -> Anfahrt entfällt, Hinweis
//
//   n8n schickt bei ok=false KEINE Mail an den Kunden, sondern eine Nachricht
//   an den Betrieb. Lieber ein Anruf als eine peinliche Mail.
//
// EINGABE (Header: Authorization: Bearer argo_… )
//   Variante — entweder direkt oder beschreibend:
//     { sortiment_id: "uuid" }
//     { holzart: "buche", scheitlaenge_cm: 33, trocknungsgrad: "lufttrocken" }
//   Menge:
//     { menge: 8, einheit: "srm" }
//   Anfahrt — eines von dreien, alles optional:
//     { kontakt_id: "uuid" } | { firma_id: "uuid" } | { km: 42 }
//
// AUSGABE
//   { ok, netto, steuer, brutto, steuerGruppen[], positionen[],
//     text, kurztext, entfernung, geschaetzt, hinweise[] }
//
// FREITEXT WIRD NICHT GEPARST.
//   "Buche 33er trocken" zerlegt die KI-Qualifizierung der Vertriebswelle.
//   Diese Route rechnet mit Feldern. Jeder macht, was er kann.
// ============================================================================

import { createAdminClient } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { hasheSchluessel, schluesselAusAnfrage } from "@/lib/apiSchluessel";
import { routeEntfernung, luftlinieMeter, zentralerSchluessel, type Punkt } from "@/lib/ors";
import {
  ausKontakt, ausFirma, ausStandort, standardStandort, anrede,
  hatKoordinaten, verortungVeraltet, alsPunkt,
  type KontaktQuelle, type FirmaQuelle, type StandortQuelle,
} from "@/app/dashboard/_components/empfaengerLogik";
import { type HolzEinheit } from "@/app/dashboard/_components/holzLogik";
import { type Sortiment, type Trocknungsgrad } from "@/app/dashboard/_components/sortimentLogik";
import { type Preis, type Mengenrabatt } from "@/app/dashboard/_components/preisLogik";
import { type AnfahrtKonfig, type FahrtkostenStufe, type DistanzQuelle } from "@/app/dashboard/_components/anfahrtLogik";
import {
  erstellePreisauskunft, preisauskunftText, preisauskunftKurz, auskunftZeilen,
} from "@/app/dashboard/_components/preisauskunftLogik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EINHEITEN_ERLAUBT = new Set(["srm", "rm", "fm", "m3"]);

function fehler(nachricht: string, code: string, status: number) {
  return NextResponse.json({ ok: false, error: nachricht, code }, { status });
}

export async function POST(req: Request) {
  try {
    // --- 1. Wer fragt? Der Schlüssel entscheidet. -------------------------
    const roh = schluesselAusAnfrage(req);
    if (!roh) {
      return fehler(
        "Kein API-Schlüssel übergeben. Erwartet: Authorization: Bearer argo_…",
        "kein_schluessel", 401,
      );
    }

    const admin = createAdminClient();
    const { data: sk, error: skFehler } = await admin
      .from("api_schluessel")
      .select("id, owner_user_id, nutzungen")
      .eq("schluessel_hash", hasheSchluessel(roh))
      .eq("aktiv", true)
      .maybeSingle();

    if (skFehler) throw skFehler;
    if (!sk) {
      // Absichtlich unspezifisch: kein Hinweis darauf, ob der Schlüssel
      // existiert, widerrufen wurde oder nie existierte.
      return fehler("Schlüssel ungültig.", "schluessel_ungueltig", 401);
    }

    const owner = sk.owner_user_id as string;

    // Nutzung mitschreiben. Ein Fehler hier darf die Antwort nicht verhindern.
    void admin.from("api_schluessel").update({
      letzte_nutzung: new Date().toISOString(),
      nutzungen: (Number(sk.nutzungen) || 0) + 1,
    }).eq("id", sk.id);

    // --- 2. Eingabe ------------------------------------------------------
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const menge = Number(body?.menge);
    if (!Number.isFinite(menge) || menge <= 0) {
      return fehler("Bitte eine Menge größer als 0 angeben.", "menge_fehlt", 400);
    }

    const einheit = String(body?.einheit ?? "").toLowerCase();
    if (!EINHEITEN_ERLAUBT.has(einheit)) {
      return fehler("Unbekannte Einheit. Erlaubt: srm, rm, fm, m3.", "einheit_ungueltig", 400);
    }

    // --- 3. Stammdaten des Betriebs laden --------------------------------
    const [sRes, pRes, rRes, kRes, stRes, profRes] = await Promise.all([
      admin.from("holz_sortiment").select("*").eq("owner_user_id", owner),
      admin.from("holz_preise").select("*").eq("owner_user_id", owner),
      admin.from("holz_mengenrabatt").select("*").eq("owner_user_id", owner),
      admin.from("anfahrt_konfig").select("*").eq("owner_user_id", owner).maybeSingle(),
      admin.from("fahrtkosten_staffel").select("*").eq("owner_user_id", owner),
      admin.from("profiles").select("firma_name").eq("id", owner).maybeSingle(),
    ]);

    const sortimente = (sRes.data as Sortiment[]) ?? [];
    const preise = (pRes.data as Preis[]) ?? [];
    const rabatte = (rRes.data as Mengenrabatt[]) ?? [];
    const konfig = (kRes.data as AnfahrtKonfig) ?? null;
    const stufen = (stRes.data as FahrtkostenStufe[]) ?? [];
    const absender = (profRes.data?.firma_name as string) ?? null;

    // --- 4. Variante finden ----------------------------------------------
    let sortiment: Sortiment | null = null;

    if (typeof body?.sortiment_id === "string" && body.sortiment_id.trim()) {
      sortiment = sortimente.find((s) => s.id === body.sortiment_id) ?? null;
      if (!sortiment) return fehler("Variante nicht gefunden.", "variante_unbekannt", 409);
    } else {
      const holzart = String(body?.holzart ?? "").toLowerCase().trim();
      const laenge = Number(body?.scheitlaenge_cm);
      const trocknung = String(body?.trocknungsgrad ?? "").toLowerCase().trim();

      if (!holzart || !Number.isFinite(laenge) || !trocknung) {
        return fehler(
          "Bitte die Variante angeben: entweder sortiment_id, oder holzart + scheitlaenge_cm + trocknungsgrad.",
          "variante_fehlt", 400,
        );
      }

      const treffer = sortimente.filter(
        (s) =>
          s.holzart === holzart &&
          s.scheitlaenge_cm === laenge &&
          s.trocknungsgrad === (trocknung as Trocknungsgrad),
      );

      if (treffer.length === 0) {
        return fehler(
          `Für ${holzart}, ${laenge} cm, ${trocknung} ist keine Variante angelegt.`,
          "variante_unbekannt", 409,
        );
      }
      // Kann dank Unique-Index eigentlich nicht passieren — wir raten trotzdem nicht.
      if (treffer.length > 1) {
        return fehler("Die Angaben passen auf mehrere Varianten.", "variante_mehrdeutig", 409);
      }
      sortiment = treffer[0];
    }

    if (!sortiment.aktiv) {
      return fehler("Diese Variante ist derzeit nicht im Verkauf.", "variante_inaktiv", 409);
    }

    // --- 5. Entfernung ----------------------------------------------------
    let distanzMeter: number | null = null;
    let distanzQuelle: DistanzQuelle = "manuell";
    const hinweise: string[] = [];
    let empfAnrede: string | null = null;

    const kmFrei = Number(body?.km);
    const kontaktId = typeof body?.kontakt_id === "string" ? body.kontakt_id.trim() : "";
    const firmaId = typeof body?.firma_id === "string" ? body.firma_id.trim() : "";

    if (kontaktId || firmaId) {
      const art = kontaktId ? "kontakte" : "firmen";
      const id = kontaktId || firmaId;

      const { data: zeile } = await admin.from(art).select("*").eq("id", id).eq("owner_user_id", owner).maybeSingle();

      if (!zeile) {
        hinweise.push("Der angegebene Kunde wurde nicht gefunden — die Anfahrt fehlt im Preis.");
      } else {
        const empf = kontaktId
          ? ausKontakt(zeile as unknown as KontaktQuelle)
          : ausFirma(zeile as unknown as FirmaQuelle);
        empfAnrede = anrede(empf);

        if (!hatKoordinaten(empf)) {
          hinweise.push(`${empf.name} ist noch nicht verortet — die Anfahrt fehlt im Preis.`);
        } else if (verortungVeraltet(empf)) {
          hinweise.push(
            "Die Anschrift wurde geändert, seit die Koordinaten ermittelt wurden. " +
            "Die Anfahrt wurde deshalb nicht berechnet.",
          );
        } else {
          const erg = await entfernungErmitteln(admin, owner, alsPunkt(empf) as Punkt);
          if (erg) {
            distanzMeter = erg.meter;
            distanzQuelle = erg.quelle;
            if (erg.hinweis) hinweise.push(erg.hinweis);
          } else {
            hinweise.push("Der Betriebsstandort ist nicht verortet — die Anfahrt fehlt im Preis.");
          }
        }
      }
    } else if (Number.isFinite(kmFrei) && kmFrei >= 0) {
      distanzMeter = kmFrei * 1000;
      distanzQuelle = "manuell";
    }

    // --- 6. Rechnen -------------------------------------------------------
    const auskunft = erstellePreisauskunft({
      menge,
      einheit: einheit as HolzEinheit,
      sortiment,
      preise,
      rabatte,
      distanzMeter,
      distanzQuelle,
      konfig,
      stufen,
    });

    if (!auskunft.ok) {
      // Kein 0-Euro-Angebot. n8n informiert den Betrieb, nicht den Kunden.
      return NextResponse.json(
        { ok: false, error: auskunft.fehler.join(" "), code: "auskunft_unvollstaendig", fehler: auskunft.fehler },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      variante: {
        id: sortiment.id,
        holzart: sortiment.holzart,
        scheitlaenge_cm: sortiment.scheitlaenge_cm,
        trocknungsgrad: sortiment.trocknungsgrad,
      },
      menge,
      einheit,
      netto: auskunft.gesamt.netto,
      steuer: auskunft.gesamt.steuerBetrag,
      brutto: auskunft.gesamt.brutto,
      steuerGruppen: auskunft.gesamt.gruppen,
      positionen: auskunftZeilen(auskunft, sortiment),
      entfernung: distanzMeter !== null ? { meter: Math.round(distanzMeter), quelle: distanzQuelle } : null,
      geschaetzt: auskunft.geschaetzt,
      text: preisauskunftText(auskunft, sortiment, { anrede: empfAnrede, absender }),
      kurztext: preisauskunftKurz(auskunft, sortiment),
      hinweise: [...hinweise, ...auskunft.hinweise],
    });
  } catch (err: unknown) {
    console.error("Preisauskunft Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ ok: false, error: "Interner Fehler.", code: "intern" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Entfernung: Cache -> ORS -> Luftlinie. Gleiche Kette wie /api/entfernung,
// aber ohne eingeloggten Nutzer. Deshalb hier eigenständig.
// ---------------------------------------------------------------------------
type AdminClient = ReturnType<typeof createAdminClient>;

function gerundet(p: Punkt) {
  return { lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5 };
}

async function entfernungErmitteln(
  admin: AdminClient,
  owner: string,
  ziel: Punkt,
): Promise<{ meter: number; quelle: DistanzQuelle; hinweis: string | null } | null> {
  const { data: stRows } = await admin
    .from("betriebs_standort")
    .select("id, bezeichnung, strasse, plz, ort, land, geo_lat, geo_lon, geocode_adresse, ist_standard, aktiv")
    .eq("owner_user_id", owner);

  const std = standardStandort((stRows as unknown as StandortQuelle[]) ?? []);
  if (!std) return null;

  const start = alsPunkt(ausStandort(std));
  if (!start) return null;

  const s = gerundet(start);
  const z = gerundet(ziel);
  const PROFIL = "driving-car";

  const { data: geheim } = await admin
    .from("betriebs_geheimnisse")
    .select("geheimnis")
    .eq("owner_user_id", owner).eq("art", "ors").eq("aktiv", true)
    .maybeSingle();

  const orsKey: string | null = geheim ? (geheim.geheimnis as string) : zentralerSchluessel();

  // Cache. Eine gecachte Luftlinie ist überholt, sobald ein Kartendienst da ist.
  const { data: cache } = await admin
    .from("geo_routen")
    .select("distanz_m, quelle")
    .eq("owner_user_id", owner)
    .eq("start_lat", s.lat).eq("start_lon", s.lon)
    .eq("ziel_lat", z.lat).eq("ziel_lon", z.lon)
    .eq("profil", PROFIL)
    .maybeSingle();

  if (cache && !(cache.quelle === "luftlinie" && orsKey)) {
    return {
      meter: Number(cache.distanz_m),
      quelle: cache.quelle === "ors" ? "route" : "luftlinie",
      hinweis: null,
    };
  }

  let meter: number;
  let quelle: "ors" | "luftlinie" = "luftlinie";
  let hinweis: string | null = null;

  if (orsKey) {
    const erg = await routeEntfernung(orsKey, start, ziel, PROFIL);
    if (erg.ok && erg.treffer) {
      meter = erg.treffer.distanzMeter;
      quelle = "ors";
    } else {
      meter = luftlinieMeter(start, ziel);
      hinweis = `${erg.meldung} Es wurde stattdessen die Luftlinie geschätzt.`;
    }
  } else {
    meter = luftlinieMeter(start, ziel);
    hinweis = "Kein Kartendienst hinterlegt — die Entfernung ist eine Schätzung auf Basis der Luftlinie.";
  }

  await admin.from("geo_routen").upsert({
    owner_user_id: owner,
    start_lat: s.lat, start_lon: s.lon,
    ziel_lat: z.lat, ziel_lon: z.lon,
    profil: PROFIL,
    distanz_m: Math.round(meter),
    quelle,
    ermittelt_am: new Date().toISOString(),
  }, { onConflict: "owner_user_id,start_lat,start_lon,ziel_lat,ziel_lon,profil" });

  return { meter, quelle: quelle === "ors" ? "route" : "luftlinie", hinweis };
}
