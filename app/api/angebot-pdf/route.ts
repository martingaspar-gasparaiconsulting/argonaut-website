// ============================================================
// ARGONAUT OS · Bündel 14 · app/api/angebot-pdf/route.ts
// Erzeugt aus einem Angebot ein PDF (über Gotenberg).
//   GET ?id=..  -> PDF, Content-Disposition
// Authentifiziert (Dashboard): nur der Eigentümer (RLS).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function eur(n: unknown): string { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function datum(iso: unknown): string {
  const s = String(iso || ''); if (!s) return '—';
  const p = s.split('T')[0].split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : s;
}
function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) { const v = o?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return '';
}
type Pos = { position: number | null; bezeichnung: string | null; menge: number | null; einheit: string | null; einzelpreis: number | null; mwst_satz: number | null; gesamt_netto: number | null };

export async function GET(req: NextRequest) {
  try {
    const id = (new URL(req.url).searchParams.get('id') || '').trim();
    if (!id) return NextResponse.json({ error: 'Kein Angebot angegeben.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: a } = await supabase.from('angebote')
      .select('id, angebotsnummer, titel, kunde_name, gueltig_bis, netto_summe, mwst_summe, brutto_summe, notiz, erstellt_am')
      .eq('id', id).maybeSingle();
    if (!a) return NextResponse.json({ error: 'Angebot nicht gefunden.' }, { status: 404 });

    const { data: posRaw } = await supabase.from('angebot_positionen')
      .select('position, bezeichnung, menge, einheit, einzelpreis, mwst_satz, gesamt_netto')
      .eq('angebot_id', a.id).order('position', { ascending: true });
    const positionen = (posRaw || []) as Pos[];

    const { data: pRaw } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    const p = (pRaw || {}) as Record<string, unknown>;
    const firma = pick(p, ['firma_name', 'full_name']) || 'Ihr Betrieb';
    const strasse = pick(p, ['strasse', 'adresse', 'anschrift', 'street']);
    const plzOrt = [pick(p, ['plz', 'postleitzahl', 'zip']), pick(p, ['ort', 'stadt', 'city'])].filter(Boolean).join(' ');
    const mail = pick(p, ['rechnung_email', 'email', 'kontakt_email']);
    const tel = pick(p, ['telefon', 'phone', 'tel']);

    const zeilen = positionen.map((x) => `
      <tr>
        <td>${x.position ?? ''}</td>
        <td>${esc(x.bezeichnung || '')}</td>
        <td class="r">${(Number(x.menge) || 0).toLocaleString('de-DE')}</td>
        <td>${esc(x.einheit || '')}</td>
        <td class="r">${eur(x.einzelpreis)}</td>
        <td class="r">${eur(x.gesamt_netto)}</td>
      </tr>`).join('');

    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #14202e; font-size: 12px; line-height: 1.55; margin: 0; }
  .kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0A1628; padding-bottom: 14px; margin-bottom: 24px; }
  .firma { font-size: 20px; font-weight: 800; color: #0A1628; }
  .absender { color: #55606b; font-size: 11px; margin-top: 4px; }
  .meta { text-align: right; font-size: 11px; color: #55606b; }
  .meta b { color: #14202e; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #0A1628; }
  .empf { margin: 6px 0 22px; }
  .empf .label { color: #8a949e; font-size: 10px; text-transform: uppercase; letter-spacing: .12em; }
  table.pos { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.pos th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #8a949e; border-bottom: 1px solid #cdd5dd; padding: 6px 8px; }
  table.pos td { padding: 8px; border-bottom: 1px solid #eceff2; vertical-align: top; }
  table.pos td.r, table.pos th.r { text-align: right; }
  .summe { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .summe td { padding: 4px 8px; } .summe td.r { text-align: right; }
  .summe .brutto td { font-size: 15px; font-weight: 800; color: #0A1628; border-top: 2px solid #0A1628; padding-top: 8px; }
  .hinweis { margin-top: 18px; color: #55606b; font-size: 11px; }
  .fuss { margin-top: 26px; padding-top: 12px; border-top: 1px solid #cdd5dd; color: #8a949e; font-size: 10px; }
</style></head><body>
  <div class="kopf">
    <div>
      <div class="firma">${esc(firma)}</div>
      <div class="absender">${esc(strasse)}${strasse ? '<br>' : ''}${esc(plzOrt)}${mail ? `<br>${esc(mail)}` : ''}${tel ? ` · ${esc(tel)}` : ''}</div>
    </div>
    <div class="meta">
      <div><b>Angebot ${esc(a.angebotsnummer || '')}</b></div>
      <div>Datum: ${datum(a.erstellt_am)}</div>
      ${a.gueltig_bis ? `<div>Gültig bis: ${datum(a.gueltig_bis)}</div>` : ''}
    </div>
  </div>
  <div class="empf"><div class="label">Für</div><div style="font-size:14px;font-weight:700;">${esc(a.kunde_name || '')}</div></div>
  <h1>${esc(a.titel || 'Angebot')}</h1>
  <table class="pos">
    <thead><tr><th style="width:28px;">#</th><th>Bezeichnung</th><th class="r">Menge</th><th>Einheit</th><th class="r">Einzel</th><th class="r">Netto</th></tr></thead>
    <tbody>${zeilen || '<tr><td colspan="6" style="color:#8a949e;">Keine Positionen.</td></tr>'}</tbody>
  </table>
  <table class="summe">
    <tr><td colspan="4"></td><td class="r">Summe netto</td><td class="r">${eur(a.netto_summe)}</td></tr>
    <tr><td colspan="4"></td><td class="r">zzgl. MwSt</td><td class="r">${eur(a.mwst_summe)}</td></tr>
    <tr class="brutto"><td colspan="4"></td><td class="r">Gesamtbetrag</td><td class="r">${eur(a.brutto_summe)}</td></tr>
  </table>
  <div class="hinweis">Dieses Angebot ist freibleibend${a.gueltig_bis ? ` und gültig bis zum ${datum(a.gueltig_bis)}` : ''}. ${a.notiz ? esc(a.notiz) : ''}</div>
  <div class="fuss">${esc(firma)}${strasse ? ` · ${esc(strasse)}, ${esc(plzOrt)}` : ''} · Angebot erstellt mit ARGONAUT OS</div>
</body></html>`;

    const dateiName = `Angebot-${String(a.angebotsnummer || a.kunde_name || 'ARGONAUT').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
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
    console.error('Angebot-PDF Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Fehler beim Erzeugen.' }, { status: 500 });
  }
}
