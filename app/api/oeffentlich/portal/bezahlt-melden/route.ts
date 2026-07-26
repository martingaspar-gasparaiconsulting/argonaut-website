// ============================================================
// ARGONAUT OS · Verzahnung · app/api/oeffentlich/portal/bezahlt-melden/route.ts
// ÖFFENTLICH (login-frei): Der Kunde meldet „Ich habe bezahlt".
//   POST { token, id }  -> setzt rechnungen.zahlung_gemeldet_am = now()
//
// WICHTIG: Das setzt die Rechnung NICHT auf bezahlt. Es ist nur ein Signal an
// den Betrieb, der die Zahlung prüft und bestätigt (später: Bankanbindung).
//
// SICHERHEIT (fail-closed, identisch zum Portal-GET):
//  · Token -> genau EIN aktiver Zugang (portal_zugaenge) -> owner + kontakt.
//  · Die Rechnung muss demselben Betrieb UND Kontakt gehören, sonst 404.
//  · Bereits bezahlte/stornierte Rechnungen werden nicht angefasst.
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    const id = String(body?.id || '').trim();
    if (!token || !id) return NextResponse.json({ error: 'Ungültiger Aufruf.' }, { status: 400 });

    const db = admin();

    // 1) Token -> Zugang (aktiv)
    const { data: zugang } = await db.from('portal_zugaenge')
      .select('owner_user_id, kontakt_id, aktiv').eq('token', token).maybeSingle();
    if (!zugang || zugang.aktiv !== true) {
      return NextResponse.json({ error: 'Portal-Link ungültig oder deaktiviert.' }, { status: 404 });
    }
    const ownerId = String(zugang.owner_user_id);
    const kontaktId = String(zugang.kontakt_id);

    // 2) Rechnung hart prüfen (Betrieb + Kontakt, nicht bezahlt/storniert)
    const { data: r } = await db.from('rechnungen')
      .select('id, zahlungsstatus, bezahlt_am')
      .eq('id', id).eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId).maybeSingle();
    if (!r || r.zahlungsstatus === 'storniert') {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 });
    }
    if (r.bezahlt_am) {
      return NextResponse.json({ ok: true, schonBezahlt: true });
    }

    // 3) Signal setzen — NICHT auf bezahlt setzen.
    const { error } = await db.from('rechnungen')
      .update({ zahlung_gemeldet_am: new Date().toISOString() })
      .eq('id', id).eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId);
    if (error) return NextResponse.json({ error: 'Konnte nicht gespeichert werden.' }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('bezahlt-melden Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Fehler bei der Meldung.' }, { status: 500 });
  }
}
