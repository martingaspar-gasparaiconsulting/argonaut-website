// ============================================================
// ARGONAUT OS · Bündel 7 · app/api/oeffentlich/bewertung/route.ts
// ÖFFENTLICHER (login-freier) Bewertungs-Endpunkt — Token-basiert.
//  GET  ?token=..  -> { betrieb, status, kundeName }
//  POST { token, sterne, text } -> { ok }
// Sicherheit: nur über den geheimen Token erreichbar; eine abgegebene
// Bewertung kann nicht überschrieben werden; nur die minimal nötigen Felder
// gehen nach außen.
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
  return (data?.firma_name as string) || 'unser Betrieb';
}

export async function GET(req: NextRequest) {
  try {
    const token = (new URL(req.url).searchParams.get('token') || '').trim();
    if (!token) return NextResponse.json({ error: 'Kein Bewertungs-Link.' }, { status: 400 });
    const db = admin();
    const { data } = await db.from('bewertungsanfragen')
      .select('owner_user_id, kunde_name, status').eq('token', token).maybeSingle();
    if (!data) return NextResponse.json({ error: 'Dieser Bewertungs-Link ist ungültig.' }, { status: 404 });
    const betrieb = await betriebName(db, data.owner_user_id as string);
    return NextResponse.json({ betrieb, status: data.status, kundeName: data.kunde_name || '' });
  } catch (e: unknown) {
    console.error('Bewertung GET:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = (typeof body?.token === 'string' ? body.token : '').trim();
    const sterne = Math.round(Number(body?.sterne));
    const text = (typeof body?.text === 'string' ? body.text : '').trim().slice(0, 2000);
    if (!token) return NextResponse.json({ error: 'Kein Bewertungs-Link.' }, { status: 400 });
    if (!Number.isFinite(sterne) || sterne < 1 || sterne > 5) {
      return NextResponse.json({ error: 'Bitte 1 bis 5 Sterne wählen.' }, { status: 400 });
    }
    const db = admin();
    const { data: anfrage } = await db.from('bewertungsanfragen')
      .select('id, status').eq('token', token).maybeSingle();
    if (!anfrage) return NextResponse.json({ error: 'Dieser Bewertungs-Link ist ungültig.' }, { status: 404 });
    if (anfrage.status === 'abgegeben') {
      return NextResponse.json({ error: 'Für diesen Link wurde bereits eine Bewertung abgegeben. Vielen Dank!' }, { status: 409 });
    }
    const { error } = await db.from('bewertungsanfragen')
      .update({ status: 'abgegeben', sterne, text: text || null, abgegeben_am: new Date().toISOString() })
      .eq('id', anfrage.id).eq('status', 'offen');
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('Bewertung POST:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Bewertung konnte nicht gespeichert werden.' }, { status: 500 });
  }
}
