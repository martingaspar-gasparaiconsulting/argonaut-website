// ============================================================
// ARGONAUT OS · Paket PN · app/api/oeffentlich/portal/freigabe/route.ts
// ÖFFENTLICH (login-frei): Der Kunde gibt etwas frei oder lehnt es ab.
//   POST { token, id, entscheidung: 'freigegeben'|'abgelehnt', name, kommentar? }
//
// SICHERHEIT (fail-closed, gleiches Muster wie bezahlt-melden):
//  · Token -> genau EIN aktiver Zugang -> Betrieb + Kontakt.
//  · Die Freigabe muss demselben Betrieb UND Kontakt gehören, sonst 404.
//  · Nur eine OFFENE Freigabe wird beantwortet — das Update filtert zusätzlich
//    auf status = 'offen', damit zwei gleichzeitige Klicks nicht beide zählen.
//  · Gespeichert werden nur Name, Kommentar, Zeitpunkt. Keine IP-Adresse.
// Hinweis: Eine Freigabe per Link ist ein Nachweis in Textform, keine
// Unterschrift unter einen Vertrag (Anwalt R19).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { pruefeFreigabeAntwort, istUuid } from '@/lib/kundenPortalPlus';

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
    if (!istUuid(token) || !istUuid(id)) return NextResponse.json({ error: 'Ungültiger Aufruf.' }, { status: 400 });

    const antwort = pruefeFreigabeAntwort({ entscheidung: body?.entscheidung, name: body?.name, kommentar: body?.kommentar });
    if (antwort.fehler || !antwort.entscheidung) return NextResponse.json({ error: antwort.fehler }, { status: 400 });

    const db = admin();
    const { data: zugang } = await db.from('portal_zugaenge')
      .select('owner_user_id, kontakt_id, aktiv').eq('token', token).maybeSingle();
    if (!zugang || zugang.aktiv !== true) {
      return NextResponse.json({ error: 'Portal-Link ungültig oder deaktiviert.' }, { status: 404 });
    }
    const ownerId = String(zugang.owner_user_id);
    const kontaktId = String(zugang.kontakt_id);

    const { data: f } = await db.from('portal_freigabe')
      .select('id, status').eq('id', id).eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId).maybeSingle();
    if (!f || f.status === 'zurueckgezogen') return NextResponse.json({ error: 'Freigabe nicht gefunden.' }, { status: 404 });
    if (f.status !== 'offen') return NextResponse.json({ error: 'Diese Freigabe wurde bereits beantwortet.' }, { status: 409 });

    const { data: neu, error } = await db.from('portal_freigabe')
      .update({
        status: antwort.entscheidung,
        antwort_name: antwort.name,
        antwort_kommentar: antwort.kommentar || null,
        beantwortet_am: new Date().toISOString(),
      })
      .eq('id', id).eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId).eq('status', 'offen')
      .select('id');
    if (error) return NextResponse.json({ error: 'Konnte nicht gespeichert werden.' }, { status: 500 });
    if (!neu || neu.length === 0) return NextResponse.json({ error: 'Diese Freigabe wurde bereits beantwortet.' }, { status: 409 });

    return NextResponse.json({ ok: true, status: antwort.entscheidung });
  } catch (e: unknown) {
    console.error('Portal Freigabe POST:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Fehler bei der Freigabe.' }, { status: 500 });
  }
}
