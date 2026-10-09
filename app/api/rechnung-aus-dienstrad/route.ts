import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";
import { abrechnungPruefen } from "@/lib/nurGeschaeftsleitung";
import { quellSchreiber } from "@/lib/abrechnungServer";
import { berlinTag } from "@/lib/fahrzeugMiete";
import { postenPruefen, drRechnungMoeglich, drRechnungPosten, drRechnungText } from "@/lib/zweirad";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Paket 295 · Z1 „Rechnung aus Dienstrad-Vorgang"
// Rechnung an den LEASINGGEBER (Empfänger laut Portal), nicht an den
// Mitarbeiter und nicht an den Arbeitgeber.
//
// - Alles serverseitig gelesen: Positionen sind ab „genehmigt" in der
//   Datenbank eingefroren, die Rahmennummer kommt aus der Rad-Akte.
// - Erst nach der Übergabe (Datenbank-Wächter prüft das noch einmal).
// - Doppel-Schutz über dienstrad_vorgang.rechnung_id; ist die Rechnung
//   storniert, darf eine neue entstehen.
// - Positionsfehler: Rechnung wird STORNIERT, nicht gelöscht (Nummernfolge).
// - Keine Schnittstelle zum Leasing-Portal: Die Rechnung laden Sie selbst im
//   Portal hoch bzw. senden sie wie dort verlangt.
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const vorgangId = String(body?.vorgangId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(vorgangId)) {
      return NextResponse.json({ error: "Kein gültiger Vorgang übergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    // „Darf abrechnen": Chef oder Mitarbeiter mit Haken. Die Rechnung gehört immer dem Betrieb.
    const abr = await abrechnungPruefen(supabase, user.id);
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });
    const betrieb = abr.betrieb;
    const schreiber = quellSchreiber(supabase, abr);

    // ---------- 1) Vorgang laden (RLS: nur was die Person sehen darf) ----------
    const { data: vRoh, error: vErr } = await supabase.from("dienstrad_vorgang").select("*").eq("id", vorgangId).maybeSingle();
    if (vErr || !vRoh) return NextResponse.json({ error: "Vorgang nicht gefunden." }, { status: 404 });
    const v = vRoh as unknown as {
      id: string; owner_user_id: string; nummer: string | null; status: string; zweirad_id: string | null;
      arbeitnehmer_name: string; arbeitgeber_name: string; portal: string | null; portal_nr: string | null;
      leasinggeber_name: string | null; leasinggeber_anschrift: string | null; posten: unknown; uebergabe_am: string | null; rechnung_id: string | null;
    };
    if (v.owner_user_id !== betrieb) return NextResponse.json({ error: "Dieser Vorgang gehört nicht zu Ihrem Betrieb." }, { status: 403 });
    const moeglich = drRechnungMoeglich(v);
    if (!moeglich.ok) return NextResponse.json({ error: moeglich.grund }, { status: 400 });
    const pp = postenPruefen(v.posten);
    if (!pp.ok) return NextResponse.json({ error: `Die Positionen des Vorgangs sind nicht in Ordnung: ${pp.grund}` }, { status: 400 });

    // ---------- 2) Doppel-Schutz ----------
    if (v.rechnung_id) {
      const { data: vorhanden } = await supabase.from("rechnungen").select("id, zahlungsstatus").eq("id", v.rechnung_id).maybeSingle();
      if (vorhanden?.id && vorhanden.zahlungsstatus !== "storniert") {
        return NextResponse.json({ error: "Für diesen Vorgang gibt es bereits eine Rechnung.", rechnungId: vorhanden.id }, { status: 409 });
      }
    }

    // ---------- 3) Rad (Rahmennummer) ----------
    let rahmennummer: string | null = null;
    if (v.zweirad_id) {
      const { data: rad } = await supabase.from("zweirad").select("rahmennummer").eq("id", v.zweirad_id).maybeSingle();
      rahmennummer = (rad?.rahmennummer as string | null | undefined) ?? null;
    }
    const rechnungsPosten = drRechnungPosten(pp.posten, rahmennummer).map((p, i) => ({
      owner_user_id: betrieb, position: i + 1, bezeichnung: p.bezeichnung, menge: p.menge, einheit: p.einheit,
      einzelpreis: cent(p.einzelpreis_cent / 100), mwst_satz: p.mwst_satz, gesamt_netto: cent(p.summe_cent / 100),
    }));
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((x) => ({ netto: x.gesamt_netto, satz: x.mwst_satz })));
    const texte = drRechnungText(v);

    // ---------- 4) Rechnung anlegen (Nummer via Auslöser) ----------
    const heute = berlinTag(Date.now());
    const leistung = v.uebergabe_am ? berlinTag(Date.parse(v.uebergabe_am)) : heute;
    const faellig = new Date();
    faellig.setDate(faellig.getDate() + 14);
    const standortId = standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neu, error: rErr } = await supabase.from("rechnungen").insert({
      owner_user_id: betrieb, standort_id: standortId, auftrag_id: null, kontakt_id: null, firma_id: null,
      titel: texte.titel,
      empfaenger_name: v.leasinggeber_name || null, empfaenger_anschrift: v.leasinggeber_anschrift || null,
      zahlungsstatus: "offen", rechnungsdatum: heute, leistungsdatum: leistung, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: "EUR",
      notizen: texte.notiz,
    }).select("id").single();
    if (rErr || !neu) {
      console.error("Dienstrad-Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neu.id;

    // ---------- 5) Positionen ----------
    const { error: posErr } = await supabase.from("rechnung_positionen").insert(rechnungsPosten.map((x) => ({ ...x, rechnung_id: rechnungId })));
    if (posErr) {
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: Die Positionen aus dem Dienstrad-Vorgang konnten nicht übernommen werden.", updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    // ---------- 6) Vorgang mit der Rechnung verknüpfen (Datenbank setzt „abgerechnet") ----------
    const { error: updErr } = await schreiber.from("dienstrad_vorgang").update({ rechnung_id: rechnungId }).eq("id", v.id).eq("owner_user_id", betrieb);
    if (updErr) console.error("dienstrad_vorgang.rechnung_id konnte nicht gesetzt werden:", updErr.message);

    return NextResponse.json({ rechnungId });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Dienstrad Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
