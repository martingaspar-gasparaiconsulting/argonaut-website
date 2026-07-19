// ============================================================
// ARGONAUT OS · Welle 5 · app/api/signatur-pdf/route.ts
// Liefert das (signierte) Dokument als PDF. Ist ein eingefrorenes Original
// (archiv_html) vorhanden, wird GENAU DAS gerendert (revisionssicher, kein
// Layout-Drift). Sonst wird live aus den Daten gebaut. Token-gated.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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

export async function GET(req: NextRequest) {
  try {
    const token = (new URL(req.url).searchParams.get('token') || '').trim();
    if (!token) return NextResponse.json({ error: 'Ungültiger Aufruf.' }, { status: 400 });
    const db = admin();

    const { data: a } = await db.from('signatur_anfragen').select('*').eq('token', token).maybeSingle();
    if (!a) return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 });

    let html: string;
    if (typeof a.archiv_html === 'string' && a.archiv_html.trim()) {
      // Eingefrorenes Original — unverändert.
      html = a.archiv_html;
    } else {
      const { data: pRaw } = await db.from('profiles').select('*').eq('id', a.owner_user_id).maybeSingle();
      const p = (pRaw || {}) as Record<string, unknown>;
      html = baueSignaturHtml({
        titel: a.titel, dokument: a.dokument, firma: pick(p, ['firma_name', 'full_name']) || 'Absender',
        strasse: pick(p, ['strasse', 'adresse', 'anschrift']),
        plzOrt: [pick(p, ['plz', 'postleitzahl']), pick(p, ['ort', 'stadt'])].filter(Boolean).join(' '),
        empfaenger_email: a.empfaenger_email, status: a.status, unterzeichner_name: a.unterzeichner_name,
        ort: a.ort, signatur_bild: a.signatur_bild, dokument_hash: a.dokument_hash, signiert_am: a.signiert_am,
        loeschbar_ab: a.loeschbar_ab, aufbewahrung_jahre: a.aufbewahrung_jahre, protokoll: a.protokoll,
      });
    }

    const dateiName = `Signatur-${String(a.titel || 'Dokument').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 50)}.pdf`;
    const gUrl = (process.env.GOTENBERG_URL || '').replace(/\/+$/, '');
    if (gUrl) {
      try {
        const form = new FormData();
        form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
        form.append('paperWidth', '8.27'); form.append('paperHeight', '11.69');
        form.append('marginTop', '0'); form.append('marginBottom', '0'); form.append('marginLeft', '0'); form.append('marginRight', '0');
        form.append('printBackground', 'true');
        const headers: Record<string, string> = {};
        const gUser = process.env.GOTENBERG_USER, gPass = process.env.GOTENBERG_PASSWORD;
        if (gUser && gPass) headers['Authorization'] = 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64');
        const gRes = await fetch(`${gUrl}/forms/chromium/convert/html`, { method: 'POST', headers, body: form });
        if (gRes.ok) {
          const pdf = Buffer.from(await gRes.arrayBuffer());
          return new NextResponse(pdf, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${dateiName}"`, 'Cache-Control': 'no-store' } });
        }
        console.error('Gotenberg HTTP', gRes.status);
      } catch (ge) { console.error('Gotenberg Fehler:', ge instanceof Error ? ge.message : ge); }
    }
    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    console.error('Signatur-PDF Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Fehler beim Erzeugen.' }, { status: 500 });
  }
}
