// ============================================================
// ARGONAUT OS · Bündel 16 · app/api/kasse-bon-pdf/route.ts
// Bon (Kassenbeleg) als PDF im 80-mm-Format über Gotenberg.
//   GET ?id=..  -> PDF
// Authentifiziert: Chef oder Kassierer (RLS select).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function eur(n: unknown): string { return (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) { const v = o?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return '';
}
type Pos = { position: number | null; bezeichnung: string | null; menge: number | null; einzelpreis: number | null; mwst_satz: number | null; gesamt_brutto: number | null };

export async function GET(req: NextRequest) {
  try {
    const id = (new URL(req.url).searchParams.get('id') || '').trim();
    if (!id) return NextResponse.json({ error: 'Kein Beleg angegeben.' }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: b } = await supabase.from('kassen_belege')
      .select('id, owner_user_id, beleg_nr, typ, zahlart, netto_summe, mwst_summe, brutto_summe, gegeben, rueckgeld, tse_modus, tse_anbieter, tse_signatur, tse_seriennummer, tse_zeit, erstellt_am')
      .eq('id', id).maybeSingle();
    if (!b) return NextResponse.json({ error: 'Beleg nicht gefunden.' }, { status: 404 });

    const { data: posRaw } = await supabase.from('kassen_positionen')
      .select('position, bezeichnung, menge, einzelpreis, mwst_satz, gesamt_brutto').eq('beleg_id', b.id).order('position', { ascending: true });
    const positionen = (posRaw || []) as Pos[];

    const { data: pRaw } = await supabase.from('profiles').select('*').eq('id', b.owner_user_id).maybeSingle();
    const p = (pRaw || {}) as Record<string, unknown>;
    const firma = pick(p, ['firma_name', 'full_name']) || 'Kasse';
    const strasse = pick(p, ['strasse', 'adresse', 'anschrift']);
    const plzOrt = [pick(p, ['plz', 'postleitzahl']), pick(p, ['ort', 'stadt'])].filter(Boolean).join(' ');
    const ustId = pick(p, ['ust_id', 'ustid', 'umsatzsteuer_id']);

    const zeit = new Date(String(b.tse_zeit || b.erstellt_am || '')).toLocaleString('de-DE');
    const zahlartTxt: Record<string, string> = { bar: 'Bar', karte: 'Karte', ec: 'EC-Karte', ueberweisung: 'Überweisung' };

    // MwSt-Ausweis je Satz
    const satzMap = new Map<number, { brutto: number }>();
    for (const x of positionen) {
      const s = Number(x.mwst_satz) || 0; const cur = satzMap.get(s) || { brutto: 0 };
      cur.brutto += Number(x.gesamt_brutto) || 0; satzMap.set(s, cur);
    }
    const mwstZeilen = [...satzMap.entries()].sort((a, c) => a[0] - c[0]).map(([s, v]) => {
      const netto = v.brutto / (1 + s / 100); const mwst = v.brutto - netto;
      return `<tr><td>MwSt ${s}%</td><td class="r">${eur(netto)}</td><td class="r">${eur(mwst)}</td></tr>`;
    }).join('');

    const zeilen = positionen.map((x) => `
      <tr><td colspan="2">${esc(x.bezeichnung || '')}</td></tr>
      <tr class="pz"><td>${(Number(x.menge) || 0).toLocaleString('de-DE')} × ${eur(x.einzelpreis)} <span class="s">(${Number(x.mwst_satz) || 0}%)</span></td><td class="r">${eur(x.gesamt_brutto)}</td></tr>`).join('');

    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<style>
  @page { size: 80mm 200mm; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; color: #111; font-size: 11px; margin: 0; width: 72mm; }
  .z { text-align: center; }
  h1 { font-size: 15px; margin: 0; }
  .klein { font-size: 10px; color: #333; }
  hr { border: none; border-top: 1px dashed #999; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.r { text-align: right; white-space: nowrap; }
  .pz td { color: #333; }
  .s { color: #777; }
  .sum td { font-weight: 700; font-size: 13px; }
  .tse { font-size: 8.5px; word-break: break-all; color: #333; margin-top: 4px; }
  .demo { color: #b00; font-weight: 700; }
</style></head><body>
  <div class="z">
    <h1>${esc(firma)}</h1>
    <div class="klein">${esc(strasse)}${strasse ? ' · ' : ''}${esc(plzOrt)}</div>
    ${ustId ? `<div class="klein">USt-IdNr.: ${esc(ustId)}</div>` : ''}
  </div>
  <hr>
  <div class="klein">Beleg: ${esc(b.beleg_nr || '')} · ${esc(b.typ)}</div>
  <div class="klein">${esc(zeit)}</div>
  <hr>
  <table>${zeilen || '<tr><td>—</td></tr>'}</table>
  <hr>
  <table>
    <tr class="sum"><td>SUMME</td><td class="r">${eur(b.brutto_summe)}</td></tr>
    <tr><td>Zahlart</td><td class="r">${zahlartTxt[String(b.zahlart)] || esc(b.zahlart)}</td></tr>
    ${b.gegeben != null ? `<tr><td>Gegeben</td><td class="r">${eur(b.gegeben)}</td></tr>` : ''}
    ${b.rueckgeld != null ? `<tr><td>Rückgeld</td><td class="r">${eur(b.rueckgeld)}</td></tr>` : ''}
  </table>
  <hr>
  <table><tr class="klein"><td>Satz</td><td class="r">Netto</td><td class="r">MwSt</td></tr>${mwstZeilen}</table>
  <hr>
  <div class="tse">
    TSE (${b.tse_modus === 'live' ? esc(b.tse_anbieter || 'live') : '<span class="demo">DEMO – keine gültige TSE</span>'})<br>
    Seriennr.: ${esc(b.tse_seriennummer || '')}<br>
    Signatur: ${esc(b.tse_signatur || '')}
  </div>
  <hr>
  <div class="z klein">Vielen Dank für Ihren Einkauf!</div>
</body></html>`;

    const dateiName = `Bon-${String(b.beleg_nr || 'kasse').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
    const gUrl = (process.env.GOTENBERG_URL || '').replace(/\/+$/, '');
    if (gUrl) {
      try {
        const form = new FormData();
        form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
        form.append('paperWidth', '3.15'); form.append('paperHeight', '7.87');
        form.append('marginTop', '0'); form.append('marginBottom', '0'); form.append('marginLeft', '0'); form.append('marginRight', '0');
        form.append('printBackground', 'true');
        const headers: Record<string, string> = {};
        const gUser = process.env.GOTENBERG_USER, gPass = process.env.GOTENBERG_PASSWORD;
        if (gUser && gPass) headers['Authorization'] = 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64');
        const gRes = await fetch(`${gUrl}/forms/chromium/convert/html`, { method: 'POST', headers, body: form });
        if (gRes.ok) {
          const pdf = Buffer.from(await gRes.arrayBuffer());
          return new NextResponse(pdf, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${dateiName}"`, 'Cache-Control': 'no-store' } });
        }
      } catch (ge) { console.error('Gotenberg Bon:', ge instanceof Error ? ge.message : ge); }
    }
    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    console.error('Bon-PDF Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Fehler beim Erzeugen.' }, { status: 500 });
  }
}
