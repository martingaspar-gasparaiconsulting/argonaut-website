import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Welle 4 · "Rechnung aus Abo" (wiederkehrende Rechnung)
// Erzeugt aus einer Abo-Vorlage die nächste echte Rechnung und schreibt die
// Vorlage fort (nächste Fälligkeit + Zähler). Gleiches sichere Muster wie
// rechnung-aus-projekt/-fachpaket (MwSt je Satz, Storno bei Positionsfehler).
// ============================================================

const MWST_STD = 19;

type Pos = { bezeichnung?: string; menge?: number; einheit?: string; einzelpreis?: number; mwst_satz?: number };

function naechstesDatum(iso: string, intervall: string): string {
  const d = new Date((iso || '').slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const add = intervall === 'jahr' ? 12 : intervall === 'quartal' ? 3 : 1;
  d.setMonth(d.getMonth() + add);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const aboId = String(body?.aboId || '').trim();
    if (!aboId) return NextResponse.json({ error: 'Kein Abo übergeben.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: abo, error: aErr } = await supabase.from('abo_rechnungen').select('*').eq('id', aboId).maybeSingle();
    if (aErr || !abo) return NextResponse.json({ error: 'Abo nicht gefunden.' }, { status: 404 });
    if (abo.aktiv === false) return NextResponse.json({ error: 'Abo ist pausiert.' }, { status: 400 });

    const eingang: Pos[] = Array.isArray(abo.positionen) ? (abo.positionen as Pos[]) : [];
    const gefiltert = eingang.filter((p) => (Number(p?.einzelpreis) || 0) > 0 || (Number(p?.menge) || 0) > 0);
    if (!gefiltert.length) return NextResponse.json({ error: 'Das Abo hat keine abrechenbaren Positionen.' }, { status: 400 });

    const rechnungsPosten = gefiltert.map((p, i) => {
      const menge = cent(Number(p.menge) || 1);
      const einzelpreis = cent(Number(p.einzelpreis) || 0);
      return {
        owner_user_id: user.id, position: i + 1,
        bezeichnung: String(p.bezeichnung || 'Leistung').slice(0, 300),
        menge, einheit: String(p.einheit || 'Leistung').slice(0, 20), einzelpreis,
        mwst_satz: Number(p.mwst_satz) || MWST_STD, gesamt_netto: cent(menge * einzelpreis),
      };
    });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + 14);
    const { data: neueRechnung, error: rErr } = await supabase.from('rechnungen').insert({
      owner_user_id: user.id, auftrag_id: null, kontakt_id: abo.kontakt_id || null, firma_id: null,
      titel: abo.titel || 'Wiederkehrende Rechnung', empfaenger_name: abo.empfaenger_name || null, zahlungsstatus: 'offen',
      rechnungsdatum, leistungsdatum: rechnungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: 'EUR',
    }).select('id').single();
    if (rErr || !neueRechnung) {
      console.error('Abo-Rechnung anlegen fehlgeschlagen:', rErr?.message || rErr);
      return NextResponse.json({ error: 'Rechnung konnte nicht erstellt werden.' }, { status: 500 });
    }
    const rechnungId = neueRechnung.id;

    const posMit = rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId }));
    const { error: insPosErr } = await supabase.from('rechnung_positionen').insert(posMit);
    if (insPosErr) {
      await supabase.from('rechnungen').update({
        zahlungsstatus: 'storniert', netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: 'Automatisch storniert: Positionen konnten nicht übernommen werden.', updated_at: new Date().toISOString(),
      }).eq('id', rechnungId);
      return NextResponse.json({ error: 'Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert.' }, { status: 500 });
    }

    // Abo fortschreiben: nächste Fälligkeit + Zähler.
    const naechste = naechstesDatum(String(abo.naechste_faellig), String(abo.intervall || 'monat'));
    const { error: updErr } = await supabase.from('abo_rechnungen').update({
      naechste_faellig: naechste, zuletzt_erzeugt: rechnungsdatum,
      anzahl_erzeugt: (Number(abo.anzahl_erzeugt) || 0) + 1, updated_at: new Date().toISOString(),
    }).eq('id', aboId);
    if (updErr) console.error('Abo fortschreiben fehlgeschlagen:', updErr.message);

    return NextResponse.json({ rechnungId, naechste_faellig: naechste });
  } catch (err: unknown) {
    console.error('Rechnung-aus-Abo Fehler:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
