// app/api/tour-planen/route.ts
// ============================================================================
// ARGONAUT OS · Bündel 1 · Schritt 3 — Tagestour für einen Monteur
//
// Nimmt alle Einsätze eines Monteurs an EINEM Tag und macht daraus eine
// fahrbare Tour: Startpunkt ist der Betriebsstandort, dann die Einsätze in
// sinnvoller Reihenfolge. Ergebnis ist ein fertiger Google-Maps-Link mit
// mehreren Stopps — ein Tipp, und die Navigation im Handy führt los.
//
// DREI STUFEN (fällt sauber zurück, nichts blockiert):
//   1. Mit Kartendienst-Schlüssel + verortbaren Adressen -> Reihenfolge nach
//      kürzestem Weg (Nächster-Nachbar ab Betriebsstandort), Link mit Koordinaten.
//   2. Ohne Schlüssel ODER wenn eine Adresse nicht verortbar ist -> Reihenfolge
//      wie geplant (nach Uhrzeit), Link mit den Adress-Texten. Immer noch nutzbar.
//   3. Kein Standort / keine Einsätze -> klare Meldung, kein Absturz.
//
// KEINE zusätzliche DB-Änderung: Adressen werden bei Bedarf frisch verortet.
//
// Body:    { mitarbeiterId: string, datum: 'YYYY-MM-DD' }
// Antwort: { ok, stops:[{titel, adresse, reihenfolge}], mapsUrl, quelle, hinweis }
// ============================================================================

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { geocodeAdresse, luftlinieMeter, zentralerSchluessel, type Punkt } from "@/lib/ors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StandortRow = {
  strasse: string | null; plz: string | null; ort: string | null; land: string | null;
  geo_lat: number | null; geo_lon: number | null; geocode_adresse: string | null;
  ist_standard: boolean | null; aktiv: boolean | null;
};
type EinsatzRow = {
  id: string; titel: string | null; einsatzort: string | null;
  beginn_am: string | null; status: string | null; kunde_name: string | null;
};

/** Adresse eines Standorts als Text — bevorzugt die verortete Schreibweise. */
function standortText(s: StandortRow): string {
  if (s.geocode_adresse && s.geocode_adresse.trim()) return s.geocode_adresse.trim();
  return [s.strasse, [s.plz, s.ort].filter(Boolean).join(" "), s.land]
    .map((t) => (t ?? "").trim()).filter(Boolean).join(", ");
}

/** Google-Maps-Routenlink mit mehreren Stopps. Werte sind bereits Strings. */
function mapsUrlAus(origin: string, punkte: string[]): string | null {
  if (punkte.length === 0) return null;
  const ziel = punkte[punkte.length - 1];
  const zwischen = punkte.slice(0, -1);
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("origin", origin);
  u.searchParams.set("destination", ziel);
  if (zwischen.length) u.searchParams.set("waypoints", zwischen.join("|"));
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}

/** Reihenfolge nach Nächster-Nachbar ab Start (reine Luftlinie, 0 API-Aufrufe). */
function naechsterNachbar<T extends { punkt: Punkt }>(start: Punkt, stopps: T[]): T[] {
  const offen = [...stopps];
  const reihe: T[] = [];
  let hier = start;
  while (offen.length) {
    let besterIdx = 0;
    let besteDist = Infinity;
    for (let i = 0; i < offen.length; i++) {
      const d = luftlinieMeter(hier, offen[i].punkt);
      if (d < besteDist) { besteDist = d; besterIdx = i; }
    }
    const naechster = offen.splice(besterIdx, 1)[0];
    reihe.push(naechster);
    hier = naechster.punkt;
  }
  return reihe;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mitarbeiterId = typeof body?.mitarbeiterId === "string" ? body.mitarbeiterId.trim() : "";
    const datum = typeof body?.datum === "string" ? body.datum.trim() : "";
    if (!mitarbeiterId) return NextResponse.json({ error: "Kein Monteur übergeben." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return NextResponse.json({ error: "Kein gültiges Datum übergeben." }, { status: 400 });

    // --- 1. Betriebsstandort (Start der Tour) -----------------------------
    const { data: stRows, error: stErr } = await supabase
      .from("betriebs_standort")
      .select("strasse, plz, ort, land, geo_lat, geo_lon, geocode_adresse, ist_standard, aktiv")
      .eq("owner_user_id", user.id);
    if (stErr) throw stErr;
    const standorte = (stRows as StandortRow[]) ?? [];
    const std = standorte.find((s) => s.ist_standard && s.aktiv !== false) ?? standorte.find((s) => s.aktiv !== false) ?? standorte[0];
    if (!std) {
      return NextResponse.json({ error: "Kein Betriebsstandort hinterlegt. Bitte in den Einstellungen eintragen.", code: "kein_standort" }, { status: 400 });
    }

    // --- 2. Einsätze des Tages (nur mit Adresse, nicht abgesagt) -----------
    const start = new Date(`${datum}T00:00:00`);
    const ende = new Date(`${datum}T23:59:59`);
    const { data: eRows, error: eErr } = await supabase
      .from("einsaetze")
      .select("id, titel, einsatzort, beginn_am, status, kunde_name")
      .eq("mitarbeiter_id", mitarbeiterId)
      .gte("beginn_am", start.toISOString())
      .lte("beginn_am", ende.toISOString())
      .order("beginn_am", { ascending: true });
    if (eErr) throw eErr;

    const einsaetze = ((eRows as EinsatzRow[]) ?? [])
      .filter((e) => (e.status ?? "") !== "abgesagt" && e.einsatzort && e.einsatzort.trim());

    if (einsaetze.length === 0) {
      return NextResponse.json({ error: "An diesem Tag sind keine Einsätze mit Adresse eingeplant.", code: "keine_stopps" }, { status: 400 });
    }

    const originText = standortText(std);

    // --- 3. Schlüssel bestimmen (eigener Betriebs-Schlüssel bevorzugt) -----
    const admin = createAdminClient();
    const { data: geheim } = await admin
      .from("betriebs_geheimnisse")
      .select("geheimnis")
      .eq("owner_user_id", user.id).eq("art", "ors").eq("aktiv", true)
      .maybeSingle();
    const orsKey: string | null = geheim ? (geheim.geheimnis as string) : zentralerSchluessel();

    const startPunkt: Punkt | null =
      Number.isFinite(std.geo_lat) && Number.isFinite(std.geo_lon)
        ? { lat: Number(std.geo_lat), lon: Number(std.geo_lon) } : null;

    // --- 4a. Mit Schlüssel + Standort-Koordinaten: optimierte Reihenfolge --
    if (orsKey && startPunkt) {
      const verortet: { e: EinsatzRow; punkt: Punkt }[] = [];
      let alleGefunden = true;
      for (const e of einsaetze) {
        const g = await geocodeAdresse(orsKey, e.einsatzort as string);
        if (g.ok && g.treffer) verortet.push({ e, punkt: { lat: g.treffer.lat, lon: g.treffer.lon } });
        else { alleGefunden = false; break; }
      }

      if (alleGefunden && verortet.length === einsaetze.length) {
        const sortiert = naechsterNachbar(startPunkt, verortet);
        const punkte = sortiert.map((s) => `${s.punkt.lat},${s.punkt.lon}`);
        return NextResponse.json({
          ok: true,
          quelle: "optimiert",
          hinweis: null,
          stops: sortiert.map((s, i) => ({
            reihenfolge: i + 1,
            titel: s.e.titel || "Einsatz",
            adresse: s.e.einsatzort,
            kunde: s.e.kunde_name,
          })),
          mapsUrl: mapsUrlAus(`${startPunkt.lat},${startPunkt.lon}`, punkte),
        });
      }
    }

    // --- 4b. Rückfall: geplante Reihenfolge (nach Uhrzeit), Adress-Texte ---
    const punkte = einsaetze.map((e) => e.einsatzort as string);
    const hinweis = orsKey
      ? "Mindestens eine Adresse ließ sich nicht automatisch verorten — die Tour folgt der geplanten Uhrzeit-Reihenfolge."
      : "Kein Kartendienst hinterlegt — die Tour folgt der geplanten Uhrzeit-Reihenfolge. Für die kürzeste Route einen OpenRouteService-Schlüssel in den Einstellungen eintragen.";
    return NextResponse.json({
      ok: true,
      quelle: "zeitlich",
      hinweis,
      stops: einsaetze.map((e, i) => ({
        reihenfolge: i + 1,
        titel: e.titel || "Einsatz",
        adresse: e.einsatzort,
        kunde: e.kunde_name,
      })),
      mapsUrl: mapsUrlAus(originText, punkte),
    });
  } catch (err: unknown) {
    console.error("Tour-Planen Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler bei der Tourplanung." }, { status: 500 });
  }
}
