import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { abrechnungPruefen } from "@/lib/nurGeschaeftsleitung";
import { quellSchreiber } from "@/lib/abrechnungServer";
import { heuteIso } from "@/lib/nachweisMotor";
import { nachtragAbrechenbar, nachtragZeilen, nachtragZuRechnung, nachtragTitel, satzAusEingabe, type NachtragKopf } from "@/lib/nachtragAbrechnen";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · HW-15 (15.10.2026) · "Rechnung aus Nachtrag"
// Ein beauftragter Nachtrag, der NICHT ins LV übernommen wurde (z. B. weil das
// LV schon abgerechnet ist), bekommt eine eigene Rechnung.
//  · Steuersatz kommt von der Seite (nur 0, 7, 19).
//  · Doppel-Schutz über bau_nachtrag.rechnung_id (stornierte zählt nicht) und
//    in_lv_uebernommen (dann rechnet das LV ab).
//  · Positions-Insert scheitert -> Rechnung STORNIEREN (keine Nummernlücke).
//  · Danach: Nachtrag „abgerechnet" mit rechnung_id.
// SQL: supabase-sql/p378-nachtrag-rechnung.sql (Spalte rechnung_id).
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const nachtragId = String(body?.nachtragId || "").trim();
    if (!nachtragId) return NextResponse.json({ error: "Kein Nachtrag übergeben." }, { status: 400 });
    const satz = satzAusEingabe(body?.steuersatz);
    if (satz === null) return NextResponse.json({ error: "Bitte als Steuersatz 0, 7 oder 19 angeben." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    const abr = await abrechnungPruefen(supabase, user.id);
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });
    const betrieb = abr.betrieb;
    const schreiber = quellSchreiber(supabase, abr);

    const { data: n, error: nErr } = await supabase.from("bau_nachtrag")
      .select("id, nummer, titel, status, lv_id, projekt_id, positionen, in_lv_uebernommen, rechnung_id, ausfuehrung_ab")
      .eq("id", nachtragId).single();
    if (nErr || !n) return NextResponse.json({ error: "Nachtrag nicht gefunden (oder SQL p378 fehlt)." }, { status: 404 });

    let rechnungGueltig = false;
    if (n.rechnung_id) {
      const { data: vorhanden } = await supabase.from("rechnungen").select("id, zahlungsstatus").eq("id", n.rechnung_id).maybeSingle();
      rechnungGueltig = !!vorhanden?.id && vorhanden.zahlungsstatus !== "storniert";
    }
    const kopf = n as unknown as NachtragKopf;
    const pruef = nachtragAbrechenbar(kopf, rechnungGueltig);
    if (!pruef.ok) {
      if (pruef.bereitsVorhanden) return NextResponse.json({ rechnungId: n.rechnung_id, bereitsVorhanden: true });
      return NextResponse.json({ error: pruef.fehler }, { status: 400 });
    }
    const z = nachtragZeilen(kopf.positionen);
    if (!z.ok) return NextResponse.json({ error: z.fehler }, { status: 400 });
    const { posten, summen } = nachtragZuRechnung(z.zeilen, satz, n.nummer);

    // Empfänger aus dem LV (falls zugeordnet).
    let kundeName: string | null = null;
    let kontaktId: string | null = null;
    if (n.lv_id) {
      const { data: lv } = await supabase.from("bau_lv").select("id, kunde_name, kontakt_id").eq("id", n.lv_id).maybeSingle();
      kundeName = (lv?.kunde_name as string | null)?.trim() || null;
      kontaktId = (lv?.kontakt_id as string | null) ?? null;
    }

    const rechnungsdatum = heuteIso(new Date());
    const faellig = new Date(`${rechnungsdatum}T12:00:00Z`); faellig.setUTCDate(faellig.getUTCDate() + 14);
    const standortId = standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neueRechnung, error: rErr } = await supabase.from("rechnungen").insert({
      owner_user_id: betrieb, standort_id: standortId, auftrag_id: null, kontakt_id: kontaktId, firma_id: null,
      titel: nachtragTitel(kopf), empfaenger_name: kundeName, zahlungsstatus: "offen",
      rechnungsdatum, leistungsdatum: (n.ausfuehrung_ab as string | null) || rechnungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summen.netto, mwst_summe: summen.mwst, brutto_summe: summen.brutto, waehrung: "EUR",
    }).select("id").single();
    if (rErr || !neueRechnung) {
      console.error("Rechnung aus Nachtrag anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neueRechnung.id;

    const { error: insPosErr } = await supabase.from("rechnung_positionen")
      .insert(posten.map((p) => ({ ...p, owner_user_id: betrieb, rechnung_id: rechnungId })));
    if (insPosErr) {
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: Nachtragspositionen konnten nicht übernommen werden.",
        updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    await schreiber.from("bau_nachtrag").update({
      rechnung_id: rechnungId, status: "abgerechnet", betrag_netto: summen.netto, aktualisiert_am: new Date().toISOString(),
    }).eq("id", n.id).eq("owner_user_id", betrieb);

    return NextResponse.json({ rechnungId, bereitsVorhanden: false });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Nachtrag Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
