import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";
import { menge } from "@/lib/belegung";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · A4 · "Rechnung aus Belegung"
// Erzeugt aus einem Belegungsvorgang eine echte §14-UStG-Rechnung.
// Positionen: 1) Belegung (Menge = Nächte/Tage/Stunden × Preis) und
// 2) optionale Grundgebühr (z. B. Endreinigung). Die MwSt richtet sich
// nach dem am Vorgang gespeicherten Satz (7 % Beherbergung / 19 % Halle
// & Nebenleistung). Die KAUTION ist KEIN Umsatz und kommt NICHT auf die
// Rechnung. Sicheres Muster wie rechnung-aus-verleih (Storno bei
// Positionsfehler, Doppel-Rechnungs-Schutz via rechnung_id).
// ============================================================

function fmtDe(iso: string | null): string {
  if (!iso) return '';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}
function fmtPunkt(iso: string | null, art: string): string {
  const d = fmtDe(iso);
  if (art === 'stunde' && String(iso).length >= 16) return `${d} ${String(iso).slice(11, 16)}`;
  return d;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const vorgangId = String(body?.vorgangId || '').trim();
    if (!vorgangId) return NextResponse.json({ error: 'Kein Vorgang übergeben.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: v, error: vErr } = await supabase.from('belegung_vorgang').select('*').eq('id', vorgangId).maybeSingle();
    if (vErr || !v) return NextResponse.json({ error: 'Belegung nicht gefunden.' }, { status: 404 });
    if (v.status === 'storniert') return NextResponse.json({ error: 'Für stornierte Belegungen kann keine Rechnung erstellt werden.' }, { status: 400 });
    if (v.rechnung_id) return NextResponse.json({ error: 'Für diese Belegung existiert bereits eine Rechnung.', rechnungId: v.rechnung_id }, { status: 409 });

    const { data: einheit } = await supabase.from('belegung_einheit').select('bezeichnung, abrechnungsart').eq('id', v.einheit_id).maybeSingle();
    const bez = String(einheit?.bezeichnung || 'Einheit').slice(0, 200);
    const art = String(einheit?.abrechnungsart || 'nacht');
    const satz = Number(v.mwst_satz) || 7;
    const preis = Number(v.preis_pro_einheit) || 0;
    const grund = Number(v.grundgebuehr) || 0;
    const m = menge(art as 'nacht' | 'tag' | 'stunde', v.von, v.bis);
    const einheitLabel = art === 'stunde' ? 'Stunde' : art === 'tag' ? 'Tag' : 'Nacht';
    const zeitraum = `${fmtPunkt(v.von, art)}–${fmtPunkt(v.bis, art)}`;

    // Positionen zusammenstellen (Kaution NICHT enthalten).
    type P = { bezeichnung: string; menge: number; einheit: string; einzelpreis: number };
    const teile: P[] = [];
    teile.push({ bezeichnung: `Belegung: ${bez} (${zeitraum})`, menge: m, einheit: einheitLabel, einzelpreis: preis });
    if (grund > 0) teile.push({ bezeichnung: `Grundgebühr: ${bez}`, menge: 1, einheit: 'Pauschale', einzelpreis: grund });
    const gefiltert = teile.filter((p) => p.menge > 0 && p.einzelpreis > 0);
    if (!gefiltert.length) return NextResponse.json({ error: 'Kein abrechenbarer Betrag (Preis ist 0 oder Zeitraum leer).' }, { status: 400 });

    const rechnungsPosten = gefiltert.map((p, i) => {
      const mengeC = cent(p.menge);
      const einzelpreis = cent(p.einzelpreis);
      return {
        owner_user_id: user.id, position: i + 1,
        bezeichnung: p.bezeichnung.slice(0, 300),
        menge: mengeC, einheit: p.einheit, einzelpreis,
        mwst_satz: satz, gesamt_netto: cent(mengeC * einzelpreis),
      };
    });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + 14);
    const standortId = standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neueRechnung, error: rErr } = await supabase.from('rechnungen').insert({
      owner_user_id: user.id, standort_id: standortId, auftrag_id: null, kontakt_id: v.kontakt_id || null, firma_id: null,
      titel: `Belegung: ${bez}`, empfaenger_name: v.gast_name || null, zahlungsstatus: 'offen',
      rechnungsdatum, leistungsdatum: rechnungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: 'EUR',
    }).select('id').single();
    if (rErr || !neueRechnung) {
      console.error('Belegung-Rechnung anlegen fehlgeschlagen:', rErr?.message || rErr);
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
    const { error: updErr } = await supabase.from('belegung_vorgang').update({ rechnung_id: rechnungId }).eq('id', vorgangId);
    if (updErr) console.error('Belegung-Vorgang verknüpfen fehlgeschlagen:', updErr.message);

    return NextResponse.json({ rechnungId });
  } catch (err: unknown) {
    console.error('Rechnung-aus-Belegung Fehler:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
