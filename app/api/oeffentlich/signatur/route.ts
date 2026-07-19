// ============================================================
// ARGONAUT OS · Welle 5 · app/api/oeffentlich/signatur/route.ts
// ÖFFENTLICHER Signatur-Zugang (Token, ohne Login).
//   GET  ?token=..            -> Dokument + Status (markiert "angesehen")
//   POST { token, ... }       -> Unterschrift speichern (+ Prüfprotokoll, Hash)
// Fail-closed: alles hängt am unguessbaren Token. Service-Role umgeht RLS.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { baueSignaturHtml } from '@/lib/signaturHtml';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}
function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) { const v = o?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return '';
}
function clientInfo(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unbekannt';
  const ua = (req.headers.get('user-agent') || 'unbekannt').slice(0, 200);
  return { ip, ua };
}

export async function GET(req: NextRequest) {
  try {
    const token = (new URL(req.url).searchParams.get('token') || '').trim();
    if (!token) return NextResponse.json({ error: 'Ungültiger Aufruf.' }, { status: 400 });
    const db = admin();

    const { data: a } = await db.from('signatur_anfragen')
      .select('id, owner_user_id, titel, empfaenger_name, dokument, ort, status, signiert_am, unterzeichner_name, angesehen_am, protokoll')
      .eq('token', token).maybeSingle();
    if (!a) return NextResponse.json({ error: 'Signatur-Link ungültig oder abgelaufen.' }, { status: 404 });

    // Absender (Betrieb)
    const { data: pRaw } = await db.from('profiles').select('*').eq('id', a.owner_user_id).maybeSingle();
    const firma = pick((pRaw || {}) as Record<string, unknown>, ['firma_name', 'full_name']) || 'Absender';

    // Erstansicht protokollieren (nur wenn noch offen).
    if (a.status !== 'signiert' && !a.angesehen_am) {
      const { ip, ua } = clientInfo(req);
      const prot = Array.isArray(a.protokoll) ? a.protokoll : [];
      prot.push({ ereignis: 'angesehen', zeit: new Date().toISOString(), ip, ua });
      await db.from('signatur_anfragen').update({ status: 'angesehen', angesehen_am: new Date().toISOString(), protokoll: prot, updated_at: new Date().toISOString() }).eq('id', a.id);
    }

    return NextResponse.json({
      titel: a.titel, empfaenger_name: a.empfaenger_name, dokument: a.dokument, ort: a.ort,
      firma, status: a.status, signiert_am: a.signiert_am, unterzeichner_name: a.unterzeichner_name,
    });
  } catch (e: unknown) {
    console.error('Signatur GET Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Fehler beim Laden.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body?.token || '').trim();
    const unterzeichner = String(body?.unterzeichner_name || '').trim();
    const ort = String(body?.ort || '').trim();
    const signaturBild = String(body?.signaturBild || '');
    const einwilligung = body?.einwilligung === true;
    if (!token) return NextResponse.json({ error: 'Ungültiger Aufruf.' }, { status: 400 });
    if (!einwilligung) return NextResponse.json({ error: 'Bitte der elektronischen Signatur zustimmen.' }, { status: 400 });
    if (!unterzeichner) return NextResponse.json({ error: 'Bitte den Namen angeben.' }, { status: 400 });
    if (!signaturBild.startsWith('data:image/') || signaturBild.length > 700000) {
      return NextResponse.json({ error: 'Bitte unterschreiben (Zeichnung fehlt oder zu groß).' }, { status: 400 });
    }

    const db = admin();
    const { data: a } = await db.from('signatur_anfragen')
      .select('id, owner_user_id, titel, dokument, empfaenger_email, status, aufbewahrung_jahre, protokoll').eq('token', token).maybeSingle();
    if (!a) return NextResponse.json({ error: 'Signatur-Link ungültig.' }, { status: 404 });
    if (a.status === 'signiert') return NextResponse.json({ error: 'Dieses Dokument wurde bereits signiert.' }, { status: 409 });

    const jetzt = new Date().toISOString();
    const { ip, ua } = clientInfo(req);
    const hash = createHash('sha256')
      .update(`${a.dokument}|${unterzeichner}|${jetzt}|${token}`, 'utf8').digest('hex');

    const prot = Array.isArray(a.protokoll) ? a.protokoll : [];
    prot.push({ ereignis: 'signiert', zeit: jetzt, ip, ua, unterzeichner, einwilligung: true });

    // GoBD-Aufbewahrung: löschbar ab signiert + Frist + 1 Tag (Standard 10 Jahre).
    const jahre = Number(a.aufbewahrung_jahre) || 10;
    const ld = new Date(jetzt);
    ld.setFullYear(ld.getFullYear() + jahre);
    ld.setDate(ld.getDate() + 1);
    const loeschbarAb = ld.toISOString().slice(0, 10);

    // Eingefrorenes Original bauen (revisionssicher).
    const { data: pRaw } = await db.from('profiles').select('*').eq('id', a.owner_user_id).maybeSingle();
    const p = (pRaw || {}) as Record<string, unknown>;
    const archivHtml = baueSignaturHtml({
      titel: a.titel, dokument: a.dokument, firma: pick(p, ['firma_name', 'full_name']) || 'Absender',
      strasse: pick(p, ['strasse', 'adresse', 'anschrift']),
      plzOrt: [pick(p, ['plz', 'postleitzahl']), pick(p, ['ort', 'stadt'])].filter(Boolean).join(' '),
      empfaenger_email: a.empfaenger_email, status: 'signiert', unterzeichner_name: unterzeichner, ort: ort || null,
      signatur_bild: signaturBild, dokument_hash: hash, signiert_am: jetzt, loeschbar_ab: loeschbarAb,
      aufbewahrung_jahre: jahre, protokoll: prot,
    });

    const { error: uErr } = await db.from('signatur_anfragen').update({
      status: 'signiert', signiert_am: jetzt, unterzeichner_name: unterzeichner, ort: ort || null,
      signatur_bild: signaturBild, dokument_hash: hash, protokoll: prot,
      loeschbar_ab: loeschbarAb, archiv_html: archivHtml, updated_at: jetzt,
    }).eq('id', a.id);
    if (uErr) return NextResponse.json({ error: 'Speichern der Unterschrift fehlgeschlagen.' }, { status: 500 });

    return NextResponse.json({ ok: true, hash });
  } catch (e: unknown) {
    console.error('Signatur POST Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Fehler beim Signieren.' }, { status: 500 });
  }
}
