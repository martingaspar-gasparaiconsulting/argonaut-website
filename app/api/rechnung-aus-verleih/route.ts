import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";
import { mietTage } from "@/lib/verleih";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · A1 · "Rechnung aus Verleih"
// Erzeugt aus einem Ausleih-Vorgang eine echte §14-UStG-Rechnung.
// Preis mit Wochenstaffel wird sauber in Positionen aufgeteilt (volle
// Wochen zum Wochensatz + Resttage zum Tagessatz), damit die Rechnung
// nachvollziehbar ist. Kaution ist KEIN Umsatz und kommt NICHT auf die
// Rechnung. Gleiches sichere Muster wie rechnung-aus-abo (Storno bei
// Positionsfehler, MwSt je Satz).
// ============================================================

const MWST_STD = 19;

function fmtDe(iso: string | null): string {
  if (!iso) return '';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const vorgangId = String(body?.vorgangId || '').trim();
    if (!vorgangId) return NextResponse.json({ error: 'Kein Vorgang übergeben.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: v, error: vErr } = await supabase.from('verleih_vorgang').select('*').eq('id', vorgangId).maybeSingle();
    if (vErr || !v) return NextResponse.json({ error: 'Ausleihe nicht gefunden.' }, { status: 404 });
    if (v.status === 'storniert') return NextResponse.json({ error: 'Für stornierte Ausleihen kann keine Rechnung erstellt werden.' }, { status: 400 });
    if (v.rechnung_id) return NextResponse.json({ error: 'Für diese Ausleihe existiert bereits eine Rechnung.', rechnungId: v.rechnung_id }, { status: 409 });

    const { data: art } = await supabase.from('verleih_artikel').select('bezeichnung, wochensatz').eq('id', v.artikel_id).maybeSingle();
    const bez = String(art?.bezeichnung || 'Mietgegenstand').slice(0, 200);
    const tagessatz = Number(v.tagessatz) || 0;
    const wochensatz = Number(art?.wochensatz) || 0;
    const tage = mietTage(v.von, v.bis);
    const zeitraum = `${fmtDe(v.von)}–${fmtDe(v.bis)}`;

    // Positionen: Wochenstaffel sauber aufteilen (deckt sich mit mietPreis()).
    type P = { bezeichnung: string; menge: number; einheit: string; einzelpreis: number };
    const teile: P[] = [];
    if (wochensatz > 0 && tage >= 7) {
      const wochen = Math.floor(tage / 7);
      const rest = tage % 7;
      teile.push({ bezeichnung: `Miete: ${bez} (${zeitraum})`, menge: wochen, einheit: 'Woche', einzelpreis: wochensatz });
      if (rest > 0) teile.push({ bezeichnung: `Miete: ${bez} · Resttage`, menge: rest, einheit: 'Tag', einzelpreis: tagessatz });
    } else {
      teile.push({ bezeichnung: `Miete: ${bez} (${zeitraum})`, menge: tage, einheit: 'Tag', einzelpreis: tagessatz });
    }
    const gefiltert = teile.filter((p) => p.menge > 0 && p.einzelpreis > 0);
    if (!gefiltert.length) return NextResponse.json({ error: 'Kein abrechenbarer Betrag (Tages-/Wochensatz ist 0).' }, { status: 400 });

    const rechnungsPosten = gefiltert.map((p, i) => {
      const menge = cent(p.menge);
      const einzelpreis = cent(p.einzelpreis);
      return {
        owner_user_id: user.id, position: i + 1,
        bezeichnung: p.bezeichnung.slice(0, 300),
        menge, einheit: p.einheit, einzelpreis,
        mwst_satz: MWST_STD, gesamt_netto: cent(menge * einzelpreis),
      };
    });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + 14);
    const standortId = standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neueRechnung, error: rErr } = await supabase.from('rechnungen').insert({
      owner_user_id: user.id, standort_id: standortId, auftrag_id: null, kontakt_id: v.kontakt_id || null, firma_id: null,
      titel: `Vermietung: ${bez}`, empfaenger_name: v.mieter_name || null, zahlungsstatus: 'offen',
      rechnungsdatum, leistungsdatum: rechnungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: 'EUR',
    }).select('id').single();
    if (rErr || !neueRechnung) {
      console.error('Verleih-Rechnung anlegen fehlgeschlagen:', rErr?.message || rErr);
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

    // Vorgang mit der Rechnung verknüpfen (verhindert Doppel-Rechnung).
    const { error: updErr } = await supabase.from('verleih_vorgang').update({
      rechnung_id: rechnungId, aktualisiert_am: new Date().toISOString(),
    }).eq('id', vorgangId);
    if (updErr) console.error('Verleih-Vorgang verknüpfen fehlgeschlagen:', updErr.message);

    return NextResponse.json({ rechnungId });
  } catch (err: unknown) {
    console.error('Rechnung-aus-Verleih Fehler:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
