import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Verzahnung · "Rechnung aus Veranstaltung"
// Erzeugt aus EINER Event-Anmeldung eine echte §14-UStG-Rechnung
// (Ticket × Plätze). Ticketpreis ist BRUTTO → Netto/MwSt werden
// herausgerechnet (Kleinunternehmer §19 = 0 %, sonst 19 %).
// Sicheres Muster wie rechnung-aus-reservierung: Doppel-Rechnungs-
// Schutz via event_anmeldung.rechnung_id, Storno bei Positionsfehler.
// Anmeldungen MIT Rechnung überspringt das "In Finanzen buchen" der
// Seite → kein Doppel-Zählen der Einnahme.
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const anmeldungId = String(body?.anmeldungId || '').trim();
    if (!anmeldungId) return NextResponse.json({ error: 'Keine Anmeldung übergeben.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: a, error: aErr } = await supabase.from('event_anmeldung').select('*').eq('id', anmeldungId).maybeSingle();
    if (aErr || !a) return NextResponse.json({ error: 'Anmeldung nicht gefunden.' }, { status: 404 });
    if (a.status === 'storniert') return NextResponse.json({ error: 'Für stornierte Anmeldungen kann keine Rechnung erstellt werden.' }, { status: 400 });
    if (a.rechnung_id) return NextResponse.json({ error: 'Für diese Anmeldung existiert bereits eine Rechnung.', rechnungId: a.rechnung_id }, { status: 409 });

    const bruttoGesamt = Number(a.betrag) || 0;
    if (bruttoGesamt <= 0) return NextResponse.json({ error: 'Kein abrechenbarer Betrag (kostenlose Anmeldung).' }, { status: 400 });
    const plaetze = Math.max(1, Math.round(Number(a.plaetze) || 1));

    const { data: ev } = await supabase.from('event_veranstaltung').select('titel, beginn').eq('id', a.veranstaltung_id).maybeSingle();
    const eventTitel = String(ev?.titel || 'Veranstaltung').trim();

    // Kleinunternehmer §19 → 0 %, sonst Standard 19 % (Ticketpreis ist Brutto).
    const { data: prof } = await supabase.from('profiles').select('kleinunternehmer').eq('id', user.id).maybeSingle();
    const klein = !!prof?.kleinunternehmer;
    const satz = klein ? 0 : 19;

    const nettoGesamt = cent(bruttoGesamt / (1 + satz / 100));
    const einzelNetto = cent(nettoGesamt / plaetze);
    const bezeichnung = `Ticket: ${eventTitel}`.slice(0, 300);
    const rechnungsPosten = [{
      owner_user_id: user.id, position: 1,
      bezeichnung, menge: plaetze, einheit: 'Ticket', einzelpreis: einzelNetto,
      mwst_satz: satz, gesamt_netto: cent(plaetze * einzelNetto),
    }];
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const leistungsdatum = ev?.beginn ? String(ev.beginn).slice(0, 10) : rechnungsdatum;
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + 14);
    const standortId = standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neueRechnung, error: rErr } = await supabase.from('rechnungen').insert({
      owner_user_id: user.id, standort_id: standortId, auftrag_id: null, kontakt_id: null, firma_id: null,
      titel: bezeichnung, empfaenger_name: a.name || null, zahlungsstatus: 'offen',
      rechnungsdatum, leistungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto,
      waehrung: 'EUR', kleinunternehmer: klein,
    }).select('id').single();
    if (rErr || !neueRechnung) {
      console.error('Veranstaltung-Rechnung anlegen fehlgeschlagen:', rErr?.message || rErr);
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

    const { error: updErr } = await supabase.from('event_anmeldung').update({ rechnung_id: rechnungId }).eq('id', anmeldungId);
    if (updErr) console.error('Anmeldung verknüpfen fehlgeschlagen:', updErr.message);

    return NextResponse.json({ rechnungId });
  } catch (err: unknown) {
    console.error('Rechnung-aus-Veranstaltung Fehler:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
