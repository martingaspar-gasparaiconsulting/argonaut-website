// ============================================================
// ARGONAUT OS · Bündel 14 · app/api/oeffentlich/angebot/route.ts
// ÖFFENTLICHE Online-Zusage für Angebote — Token-basiert.
//   GET  ?token=..                      -> { betrieb, angebot, positionen }
//   POST { token, entscheidung }        -> { ok, status }   (annehmen|ablehnen)
//
// SICHERHEIT (fail-closed):
//  · Der Token loest genau EIN Angebot auf. Unbekannt -> 404.
//  · Ein bereits angenommenes/abgelehntes Angebot kann NICHT erneut entschieden
//    werden. Ein abgelaufenes (gueltig_bis < heute) kann nicht angenommen werden.
//  · Nach aussen gehen nur Anzeige-Felder, keine internen IDs des Betriebs.
//
// PAKET 182 (30.09.2026): Ein Angebot ist per Link erst ab „gesendet"
// sichtbar und entscheidbar (vorher war ein Entwurf annehmbar). Annehmen
// nur mit Namen; gespeichert werden Name, Zeitpunkt und der Wortlaut der
// Erklärung. Der Betrieb bekommt eine Meldung in der Glocke.
// Regeln: lib/angebotZusage.ts.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { perLinkSichtbar, entscheidbar, zusageName, abgelaufen as istAbgelaufenAm, ZUSAGE_ERKLAERUNG } from '@/lib/angebotZusage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}
async function betriebName(db: ReturnType<typeof admin>, ownerId: string): Promise<string> {
  const { data } = await db.from('profiles').select('firma_name').eq('id', ownerId).maybeSingle();
  return (data?.firma_name as string) || 'Ihr Betrieb';
}
function abgelaufen(gueltigBis: string | null): boolean {
  return istAbgelaufenAm(gueltigBis, new Date());
}

export async function GET(req: NextRequest) {
  try {
    const token = (new URL(req.url).searchParams.get('token') || '').trim();
    if (!token) return NextResponse.json({ error: 'Kein Angebots-Link.' }, { status: 400 });
    const db = admin();

    const { data: a } = await db.from('angebote')
      .select('id, owner_user_id, angebotsnummer, titel, kunde_name, status, gueltig_bis, netto_summe, mwst_summe, brutto_summe, angenommen_am, abgelehnt_am')
      .eq('token', token).maybeSingle();
    if (!a) return NextResponse.json({ error: 'Dieser Angebots-Link ist ungültig.' }, { status: 404 });
    // Paket 182: Entwurf (oder Archiv) verrät über den Link nichts.
    if (!perLinkSichtbar(a.status)) return NextResponse.json({ error: 'Dieses Angebot ist noch nicht freigegeben.' }, { status: 404 });

    const { data: pos } = await db.from('angebot_positionen')
      .select('position, bezeichnung, menge, einheit, einzelpreis, mwst_satz, gesamt_netto')
      .eq('angebot_id', a.id).order('position', { ascending: true });

    const betrieb = await betriebName(db, String(a.owner_user_id));
    const istAbgelaufen = abgelaufen(a.gueltig_bis as string | null) && a.status !== 'angenommen';
    return NextResponse.json({
      betrieb,
      angebot: {
        nummer: a.angebotsnummer || '', titel: a.titel, kunde: a.kunde_name || '',
        status: istAbgelaufen ? 'abgelaufen' : a.status,
        gueltigBis: a.gueltig_bis, netto: Number(a.netto_summe) || 0,
        mwst: Number(a.mwst_summe) || 0, brutto: Number(a.brutto_summe) || 0,
        erklaerung: ZUSAGE_ERKLAERUNG,
      },
      positionen: (pos || []).map((p) => ({
        bezeichnung: p.bezeichnung, menge: Number(p.menge) || 0, einheit: p.einheit,
        einzelpreis: Number(p.einzelpreis) || 0, netto: Number(p.gesamt_netto) || 0, satz: Number(p.mwst_satz) || 0,
      })),
    });
  } catch (e: unknown) {
    console.error('Angebot GET:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (typeof body?.token === 'string' ? body.token : '').trim();
    const entscheidung = String(body?.entscheidung || '');
    if (!token) return NextResponse.json({ error: 'Kein Angebots-Link.' }, { status: 400 });
    if (entscheidung !== 'annehmen' && entscheidung !== 'ablehnen') {
      return NextResponse.json({ error: 'Ungültige Auswahl.' }, { status: 400 });
    }
    const name = zusageName(body?.name);
    if (entscheidung === 'annehmen' && !name) {
      return NextResponse.json({ error: 'Bitte Ihren vollständigen Namen eintragen.' }, { status: 400 });
    }
    const db = admin();
    const { data: a } = await db.from('angebote')
      .select('id, owner_user_id, angebotsnummer, titel, status, gueltig_bis').eq('token', token).maybeSingle();
    if (!a) return NextResponse.json({ error: 'Dieser Angebots-Link ist ungültig.' }, { status: 404 });

    const d = entscheidbar(a, entscheidung, new Date());
    if (!d.ja) return NextResponse.json({ error: d.grund, status: a.status }, { status: d.code });

    const jetzt = new Date().toISOString();
    const nachweis = { entschieden_name: name, entschieden_erklaerung: entscheidung === 'annehmen' ? ZUSAGE_ERKLAERUNG : null };
    const neu = entscheidung === 'annehmen'
      ? { status: 'angenommen', angenommen_am: jetzt, aktualisiert_am: jetzt, ...nachweis }
      : { status: 'abgelehnt', abgelehnt_am: jetzt, aktualisiert_am: jetzt, ...nachweis };
    // Doppel-Schutz auf DB-Ebene: nur aendern, solange „gesendet" (Paket 182: nie aus dem Entwurf).
    const { data: geaendert, error } = await db.from('angebote').update(neu)
      .eq('id', a.id).eq('status', 'gesendet').select('id');
    if (error) throw error;
    if (!geaendert || geaendert.length === 0) return NextResponse.json({ error: 'Dieses Angebot wurde bereits entschieden.' }, { status: 409 });

    // Meldung an den Betrieb (Glocke). Fehler hier hält die Zusage nicht auf.
    try {
      const nr = a.angebotsnummer ? `${a.angebotsnummer} ` : '';
      await db.rpc('benachrichtigung_erstellen', {
        p_owner: a.owner_user_id, p_typ: 'angebot_entscheidung',
        p_titel: entscheidung === 'annehmen' ? `Angebot ${nr}angenommen` : `Angebot ${nr}abgelehnt`,
        p_nachricht: `${a.titel || 'Angebot'}${name ? ` — ${name}` : ''}`,
        p_link: '/dashboard/angebote', p_ref_tabelle: 'angebote', p_ref_id: a.id, p_dedup_stunden: 24,
      });
    } catch { /* Glocke ist Zugabe */ }
    return NextResponse.json({ ok: true, status: neu.status });
  } catch (e: unknown) {
    console.error('Angebot POST:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Aktion konnte nicht gespeichert werden.' }, { status: 500 });
  }
}
