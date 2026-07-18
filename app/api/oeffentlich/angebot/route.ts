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
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
  if (!gueltigBis) return false;
  return new Date(gueltigBis + 'T23:59:59') < new Date();
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
    const db = admin();
    const { data: a } = await db.from('angebote')
      .select('id, status, gueltig_bis').eq('token', token).maybeSingle();
    if (!a) return NextResponse.json({ error: 'Dieser Angebots-Link ist ungültig.' }, { status: 404 });

    if (a.status === 'angenommen' || a.status === 'abgelehnt') {
      return NextResponse.json({ error: 'Dieses Angebot wurde bereits entschieden.', status: a.status }, { status: 409 });
    }
    if (entscheidung === 'annehmen' && abgelaufen(a.gueltig_bis as string | null)) {
      return NextResponse.json({ error: 'Das Angebot ist leider abgelaufen. Bitte fragen Sie ein neues an.' }, { status: 409 });
    }

    const jetzt = new Date().toISOString();
    const neu = entscheidung === 'annehmen'
      ? { status: 'angenommen', angenommen_am: jetzt, aktualisiert_am: jetzt }
      : { status: 'abgelehnt', abgelehnt_am: jetzt, aktualisiert_am: jetzt };
    // Doppel-Schutz auf DB-Ebene: nur aendern, solange noch offen.
    const { error } = await db.from('angebote').update(neu)
      .eq('id', a.id).in('status', ['entwurf', 'gesendet']);
    if (error) throw error;
    return NextResponse.json({ ok: true, status: neu.status });
  } catch (e: unknown) {
    console.error('Angebot POST:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Aktion konnte nicht gespeichert werden.' }, { status: 500 });
  }
}
