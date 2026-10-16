// ============================================================
// ARGONAUT OS · app/api/oeffentlich/wartung-termin/route.ts
// Paket 384 · LK7 (16.10.2026) — Kunde bestätigt einen Wartungstermin per Link.
//   GET  ?token=..                                   -> { betrieb, termin }
//   POST { token, aktion: 'bestaetigen' | 'anderer', nachricht? }
//
// SICHERHEIT (fail-closed):
//  · Der Token (32 Zeichen Zufall aus dem Cron) löst genau EINEN Termin auf.
//    Unbekannt/kaputt -> 404/400. Nach außen nur Anzeige-Felder.
//  · Bestätigen geht nur, solange der Termin in der Zukunft liegt und nicht
//    abgesagt ist; doppelt bestätigen ändert nichts.
//  · Bestätigt -> Einsatz (gleiche Feldbelegung wie „Termin → Einsatz"),
//    Meldung in der Glocke des Betriebs.
//  · „Anderer Termin" schreibt nur den Wunsch (max. 500 Zeichen) in die Notiz
//    und meldet ihn in der Glocke — der Betrieb stimmt neu ab.
//  · Mengen-Deckel je Absender (lib/drossel.ts).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { tokenGueltig, bestaetigungsStand, einsatzAusTermin, wunschText, terminText } from '@/lib/wartungTermin';

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

const UNGUELTIG = 'Dieser Termin-Link ist ungültig.';

export async function GET(req: NextRequest) {
  try {
    const token = (new URL(req.url).searchParams.get('token') || '').trim();
    if (!tokenGueltig(token)) return NextResponse.json({ error: UNGUELTIG }, { status: 400 });
    const db = admin();
    const { data: t } = await db.from('termine')
      .select('owner_user_id, titel, beginn_am, ende_am, status, kunde_name, kunde_bestaetigt_am')
      .eq('bestaetigung_token', token).maybeSingle();
    if (!t) return NextResponse.json({ error: UNGUELTIG }, { status: 404 });
    return NextResponse.json({
      betrieb: await betriebName(db, String(t.owner_user_id)),
      termin: {
        titel: t.titel || 'Wartung', kunde: t.kunde_name || '',
        beginn: t.beginn_am, ende: t.ende_am,
        stand: bestaetigungsStand(t, new Date()),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Der Termin konnte nicht geladen werden.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: { token?: unknown; aktion?: unknown; nachricht?: unknown } = {};
    try { body = await req.json(); } catch { body = {}; }
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const aktion = body.aktion === 'bestaetigen' || body.aktion === 'anderer' ? body.aktion : null;
    if (!tokenGueltig(token) || !aktion) return NextResponse.json({ error: UNGUELTIG }, { status: 400 });

    const db = admin();
    const zuViel = await drossel(db, 'oeffentlich/wartung-termin', { ip: drosselIp(req.headers), ziel: token });
    if (zuViel) return NextResponse.json({ error: drosselText(zuViel) }, { status: 429 });

    const { data: t } = await db.from('termine').select('*').eq('bestaetigung_token', token).maybeSingle();
    if (!t) return NextResponse.json({ error: UNGUELTIG }, { status: 404 });
    const stand = bestaetigungsStand(t, new Date());
    if (stand === 'bestaetigt') return NextResponse.json({ ok: true, stand, bereits: true });
    if (stand !== 'offen') {
      return NextResponse.json({ error: stand === 'abgesagt' ? 'Dieser Termin wurde abgesagt.' : 'Dieser Termin liegt bereits in der Vergangenheit.' }, { status: 409 });
    }
    const owner = String(t.owner_user_id);
    const { datum, zeit } = terminText(String(t.beginn_am), t.ende_am ? String(t.ende_am) : null);

    if (aktion === 'anderer') {
      const wunsch = wunschText(body.nachricht);
      if (wunsch.length < 3) return NextResponse.json({ error: 'Bitte nennen Sie kurz Ihren Wunschtermin.' }, { status: 400 });
      const notiz = `${t.notiz ? `${String(t.notiz)}\n` : ''}Kunde wünscht anderen Termin: ${wunsch}`.slice(0, 4000);
      await db.from('termine').update({ notiz }).eq('id', t.id);
      try {
        await db.rpc('benachrichtigung_erstellen', {
          p_owner: owner, p_typ: 'wartung_termin',
          p_titel: 'Wartung: anderer Termin gewünscht',
          p_nachricht: `${t.kunde_name || 'Kunde'} (${datum}, ${zeit}): ${wunsch}`.slice(0, 600),
          p_link: '/dashboard/termine', p_ref_tabelle: 'termine', p_ref_id: t.id, p_dedup_stunden: 1,
        });
      } catch { /* Glocke ist Zugabe */ }
      return NextResponse.json({ ok: true, stand: 'offen', wunsch: true });
    }

    // Bestätigen — nur, wenn noch niemand bestätigt hat (Doppelklick sicher).
    const { data: neu } = await db.from('termine')
      .update({ kunde_bestaetigt_am: new Date().toISOString() })
      .eq('id', t.id).is('kunde_bestaetigt_am', null).select('id');
    if (!neu || neu.length === 0) return NextResponse.json({ ok: true, stand: 'bestaetigt', bereits: true });

    let einsatzHinweis = '';
    if (!t.einsatz_id) {
      const { data: e } = await db.from('einsaetze').insert(einsatzAusTermin(t, owner, 'termin')).select('id').single();
      if (e?.id) {
        await db.from('termine').update({ einsatz_id: e.id }).eq('id', t.id);
        einsatzHinweis = ' · Einsatz angelegt';
      } else {
        einsatzHinweis = ' · Einsatz bitte selbst anlegen';
      }
    }
    try {
      await db.rpc('benachrichtigung_erstellen', {
        p_owner: owner, p_typ: 'wartung_termin',
        p_titel: 'Wartungstermin bestätigt',
        p_nachricht: `${t.kunde_name || 'Kunde'}: ${datum}, ${zeit}${einsatzHinweis}`.slice(0, 600),
        p_link: '/dashboard/termine', p_ref_tabelle: 'termine', p_ref_id: t.id, p_dedup_stunden: 24,
      });
    } catch { /* Glocke ist Zugabe */ }
    return NextResponse.json({ ok: true, stand: 'bestaetigt' });
  } catch {
    return NextResponse.json({ error: 'Das hat leider nicht geklappt. Bitte versuchen Sie es später erneut.' }, { status: 500 });
  }
}
