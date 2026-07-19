import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Bündel 19 · "Rechnung aus LV"
// Aus einem Leistungsverzeichnis (inkl. Nachträgen) eine Rechnung erzeugen.
//  · MwSt je Steuersatz auf die Gruppensumme (steuerLogik).
//  · Doppel-Schutz über bau_lv.rechnung_id.
//  · Positions-Insert scheitert -> Rechnung STORNIEREN (keine Nummernlücke).
// ============================================================

const MWST_STD = 19;

type LvPos = { kurztext: string | null; ordnungszahl: string | null; menge: number | null; einheit: string | null; einzelpreis: number | null; mwst_satz: number | null; ist_nachtrag: boolean | null };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const lvId = String(body?.lvId || "").trim();
    if (!lvId) return NextResponse.json({ error: "Kein LV übergeben." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const { data: lv, error: lErr } = await supabase.from("bau_lv")
      .select("id, titel, kunde_name, kontakt_id, rechnung_id").eq("id", lvId).single();
    if (lErr || !lv) return NextResponse.json({ error: "LV nicht gefunden." }, { status: 404 });

    if (lv.rechnung_id) {
      const { data: vorhanden } = await supabase.from("rechnungen").select("id").eq("id", lv.rechnung_id).maybeSingle();
      if (vorhanden?.id) return NextResponse.json({ rechnungId: vorhanden.id, bereitsVorhanden: true });
    }

    const { data: posRaw, error: pErr } = await supabase.from("bau_lv_positionen")
      .select("kurztext, ordnungszahl, menge, einheit, einzelpreis, mwst_satz, ist_nachtrag").eq("lv_id", lvId).order("position", { ascending: true });
    if (pErr) return NextResponse.json({ error: "Positionen konnten nicht geladen werden." }, { status: 500 });
    const positionen = (posRaw || []) as LvPos[];
    if (!positionen.length) return NextResponse.json({ error: "Das LV hat keine Positionen." }, { status: 400 });

    const rechnungsPosten = positionen.map((p, i) => {
      const menge = cent(Number(p.menge) || 0);
      const einzelpreis = cent(Number(p.einzelpreis) || 0);
      const oz = p.ordnungszahl ? `${p.ordnungszahl} · ` : "";
      const nt = p.ist_nachtrag ? "[Nachtrag] " : "";
      return {
        owner_user_id: user.id, position: i + 1,
        bezeichnung: `${nt}${oz}${p.kurztext || "Position"}`,
        menge, einheit: (p.einheit || "").trim() || "Stk", einzelpreis,
        mwst_satz: Number(p.mwst_satz) || MWST_STD,
        gesamt_netto: cent(menge * einzelpreis),
      };
    });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + 14);
    const { data: neueRechnung, error: rErr } = await supabase.from("rechnungen").insert({
      owner_user_id: user.id, auftrag_id: null, kontakt_id: lv.kontakt_id ?? null, firma_id: null,
      titel: lv.titel || "Leistungsverzeichnis", empfaenger_name: lv.kunde_name?.trim() || null, zahlungsstatus: "offen",
      rechnungsdatum, leistungsdatum: rechnungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: "EUR",
    }).select("id").single();
    if (rErr || !neueRechnung) {
      console.error("Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neueRechnung.id;

    const posMit = rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId }));
    const { error: insPosErr } = await supabase.from("rechnung_positionen").insert(posMit);
    if (insPosErr) {
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: LV-Positionen konnten nicht übernommen werden.",
        updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    await supabase.from("bau_lv").update({ rechnung_id: rechnungId, status: "abgerechnet", aktualisiert_am: new Date().toISOString() }).eq("id", lv.id);

    return NextResponse.json({ rechnungId, bereitsVorhanden: false });
  } catch (err: unknown) {
    console.error("Rechnung-aus-LV Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
