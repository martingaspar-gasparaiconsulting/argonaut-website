import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";
import { resArtInfo, type ResArt } from "@/lib/reservierung";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · B-II · "Rechnung aus Reservierung" (Mini-Paket 2)
// Erzeugt aus einem Reservierungs-Vorgang mit Betrag (Einlagerung/
// Vorbestellung: Saison-Gebühr bzw. Anzahlung, netto) eine echte
// §14-UStG-Rechnung. EINE Position (Pauschale) zum am Vorgang
// gespeicherten MwSt-Satz. Sicheres Muster wie rechnung-aus-belegung
// (Doppel-Rechnungs-Schutz via rechnung_id, Storno bei Positionsfehler).
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const vorgangId = String(body?.vorgangId || '').trim();
    if (!vorgangId) return NextResponse.json({ error: 'Kein Vorgang übergeben.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: v, error: vErr } = await supabase.from('reservierung_vorgang').select('*').eq('id', vorgangId).maybeSingle();
    if (vErr || !v) return NextResponse.json({ error: 'Vorgang nicht gefunden.' }, { status: 404 });
    if (v.status === 'storniert') return NextResponse.json({ error: 'Für stornierte Vorgänge kann keine Rechnung erstellt werden.' }, { status: 400 });
    if (v.rechnung_id) return NextResponse.json({ error: 'Für diesen Vorgang existiert bereits eine Rechnung.', rechnungId: v.rechnung_id }, { status: 409 });

    const betragNetto = Number(v.betrag) || 0;
    if (betragNetto <= 0) return NextResponse.json({ error: 'Kein abrechenbarer Betrag (dieser Vorgang hat keine Gebühr).' }, { status: 400 });
    const satz = Number(v.mwst_satz) || 19;

    const ai = resArtInfo(String(v.art) as ResArt);
    let platzBez = '';
    if (v.platz_id) {
      const { data: p } = await supabase.from('reservierung_platz').select('bezeichnung').eq('id', v.platz_id).maybeSingle();
      platzBez = String(p?.bezeichnung || '');
    }
    const zusatz = String(v.gegenstand || '').trim() || platzBez;
    const bezeichnung = `${ai.label}${zusatz ? `: ${zusatz}` : ''}`.slice(0, 300);

    // Eine Position: Gebühr/Anzahlung als Pauschale.
    const mengeC = cent(1);
    const einzelpreis = cent(betragNetto);
    const rechnungsPosten = [{
      owner_user_id: user.id, position: 1,
      bezeichnung, menge: mengeC, einheit: 'Pauschale', einzelpreis,
      mwst_satz: satz, gesamt_netto: cent(mengeC * einzelpreis),
    }];
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + 14);
    const { data: neueRechnung, error: rErr } = await supabase.from('rechnungen').insert({
      owner_user_id: user.id, auftrag_id: null, kontakt_id: v.kontakt_id || null, firma_id: null,
      titel: bezeichnung, empfaenger_name: v.kunde_name || null, zahlungsstatus: 'offen',
      rechnungsdatum, leistungsdatum: rechnungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: 'EUR',
    }).select('id').single();
    if (rErr || !neueRechnung) {
      console.error('Reservierung-Rechnung anlegen fehlgeschlagen:', rErr?.message || rErr);
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
    const { error: updErr } = await supabase.from('reservierung_vorgang').update({ rechnung_id: rechnungId }).eq('id', vorgangId);
    if (updErr) console.error('Reservierung-Vorgang verknüpfen fehlgeschlagen:', updErr.message);

    return NextResponse.json({ rechnungId });
  } catch (err: unknown) {
    console.error('Rechnung-aus-Reservierung Fehler:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
