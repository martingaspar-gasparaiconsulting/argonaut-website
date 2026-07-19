// ============================================================
// ARGONAUT OS · Welle 5 · app/api/signatur-pdf/route.ts
// Erzeugt das (signierte) Dokument als PDF: Dokumenttext + Unterschriftsblock
// + Prüfprotokoll (Zeitstempel, IP/Gerät, Dokument-Hash). Token-gated, damit
// Absender UND Unterzeichner es laden können. Fallback: druckbares HTML.
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
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function dt(iso: unknown): string {
  const s = String(iso || ''); if (!s) return '—';
  try { return new Date(s).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}
function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) { const v = o?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return '';
}

type ProtEvent = { ereignis?: string; zeit?: string; ip?: string; ua?: string };

export async function GET(req: NextRequest) {
  try {
    const token = (new URL(req.url).searchParams.get('token') || '').trim();
    if (!token) return NextResponse.json({ error: 'Ungültiger Aufruf.' }, { status: 400 });
    const db = admin();

    const { data: a } = await db.from('signatur_anfragen').select('*').eq('token', token).maybeSingle();
    if (!a) return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 });

    const { data: pRaw } = await db.from('profiles').select('*').eq('id', a.owner_user_id).maybeSingle();
    const p = (pRaw || {}) as Record<string, unknown>;
    const firma = pick(p, ['firma_name', 'full_name']) || 'Absender';
    const strasse = pick(p, ['strasse', 'adresse', 'anschrift']);
    const plzOrt = [pick(p, ['plz', 'postleitzahl']), pick(p, ['ort', 'stadt'])].filter(Boolean).join(' ');

    const signiert = a.status === 'signiert';
    const dokumentHtml = esc(a.dokument || '').replace(/\n/g, '<br>');
    const prot: ProtEvent[] = Array.isArray(a.protokoll) ? a.protokoll : [];
    const protZeilen = prot.map((e) => `<tr><td>${esc(e.ereignis || '')}</td><td>${dt(e.zeit)}</td><td>${esc(e.ip || '—')}</td><td style="max-width:220px;word-break:break-all;color:#6b7684;">${esc((e.ua || '').slice(0, 120))}</td></tr>`).join('');

    const sigBlock = signiert ? `
      <div class="sig">
        <div class="sigTitel">Elektronisch signiert</div>
        <div class="sigGrid">
          <div>
            ${a.signatur_bild ? `<img class="sigImg" src="${esc(a.signatur_bild)}" alt="Unterschrift">` : ''}
            <div class="sigLine">${esc(a.unterzeichner_name || '')}</div>
            <div class="sigMeta">${a.ort ? esc(a.ort) + ', ' : ''}${dt(a.signiert_am)}</div>
          </div>
          <div class="sigNachweis">
            <div><b>Nachweis:</b></div>
            <div>Unterzeichner: ${esc(a.unterzeichner_name || '—')}</div>
            <div>E-Mail eingeladen: ${esc(a.empfaenger_email || '—')}</div>
            <div>Signiert am: ${dt(a.signiert_am)}</div>
            <div>Dokument-Hash (SHA-256):</div>
            <div class="hash">${esc(a.dokument_hash || '—')}</div>
          </div>
        </div>
      </div>` : `<div class="offen">⏳ Noch nicht signiert — dies ist eine Vorschau.</div>`;

    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
      @page { size: A4; margin: 20mm 18mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #14202e; font-size: 12.5px; line-height: 1.6; margin: 0; }
      .kopf { border-bottom: 3px solid #0A1628; padding-bottom: 12px; margin-bottom: 20px; }
      .firma { font-size: 18px; font-weight: 800; color: #0A1628; }
      .absender { color: #55606b; font-size: 11px; margin-top: 3px; }
      h1 { font-size: 20px; margin: 0 0 12px; color: #0A1628; }
      .dok { white-space: normal; }
      .sig { margin-top: 30px; border: 1px solid #cdd5dd; border-radius: 10px; padding: 16px 18px; page-break-inside: avoid; }
      .sigTitel { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #4CAF7D; font-weight: 800; margin-bottom: 10px; }
      .sigGrid { display: flex; gap: 24px; justify-content: space-between; flex-wrap: wrap; }
      .sigImg { max-width: 220px; max-height: 90px; display: block; }
      .sigLine { border-top: 1px solid #0A1628; margin-top: 4px; padding-top: 4px; font-weight: 700; }
      .sigMeta { color: #55606b; font-size: 11px; }
      .sigNachweis { font-size: 10.5px; color: #33404f; min-width: 240px; }
      .hash { font-family: monospace; font-size: 9px; word-break: break-all; color: #55606b; }
      .offen { margin-top: 30px; background: #fff7e6; border: 1px solid #e0a24c; border-radius: 8px; padding: 12px; color: #7a5b00; }
      .protokoll { margin-top: 22px; page-break-inside: avoid; }
      .protokoll h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #8a949e; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eceff2; }
      th { color: #8a949e; text-transform: uppercase; font-size: 9px; }
      .fuss { margin-top: 26px; border-top: 1px solid #cdd5dd; padding-top: 8px; color: #8a949e; font-size: 9.5px; text-align: center; }
    </style></head><body>
      <div class="kopf">
        <div class="firma">${esc(firma)}</div>
        <div class="absender">${esc(strasse)}${strasse ? ' · ' : ''}${esc(plzOrt)}</div>
      </div>
      <h1>${esc(a.titel || 'Dokument zur Unterschrift')}</h1>
      <div class="dok">${dokumentHtml || '<span style="color:#8a949e;">(kein Dokumenttext)</span>'}</div>
      ${sigBlock}
      <div class="protokoll">
        <h2>Prüfprotokoll (Audit-Trail)</h2>
        <table><thead><tr><th>Ereignis</th><th>Zeitpunkt</th><th>IP</th><th>Gerät</th></tr></thead>
        <tbody>${protZeilen || '<tr><td colspan="4" style="color:#8a949e;">Keine Ereignisse.</td></tr>'}</tbody></table>
      </div>
      <div class="fuss">Elektronisch erstellt & signiert mit ARGONAUT OS · einfache/fortgeschrittene elektronische Signatur (eIDAS) · Integrität über SHA-256-Hash gesichert</div>
    </body></html>`;

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
