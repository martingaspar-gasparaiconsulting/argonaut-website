// ============================================================
// ARGONAUT OS · Versand-Center (4a) · app/api/versand/label/route.ts
// Erzeugt aus einer Sendung ein Adress-Label als PDF (über Gotenberg).
//   GET ?id=..  -> PDF (Vorschau — noch nicht frankiert)
// Authentifiziert (Dashboard): nur der Eigentümer (RLS).
// Die echte Frankierung/das Carrier-Label kommt in Stufe 4b.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { carrierName } from '@/lib/versand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) { const v = o?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return '';
}

export async function GET(req: NextRequest) {
  try {
    const id = (new URL(req.url).searchParams.get('id') || '').trim();
    if (!id) return NextResponse.json({ error: 'Keine Sendung angegeben.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: s } = await supabase.from('versand_sendung')
      .select('empfaenger_name, empfaenger_firma, strasse, plz, ort, land, gewicht_kg, carrier, service, tracking_nr, referenz, richtung, retoure_grund')
      .eq('id', id).maybeSingle();
    if (!s) return NextResponse.json({ error: 'Sendung nicht gefunden.' }, { status: 404 });
    const retoure = s.richtung === 'retoure';

    const { data: pRaw } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    const p = (pRaw || {}) as Record<string, unknown>;
    const firma = pick(p, ['firma_name', 'full_name']) || 'Absender';
    const strasse = pick(p, ['strasse', 'adresse', 'anschrift', 'street']);
    const plzOrt = [pick(p, ['plz', 'postleitzahl', 'zip']), pick(p, ['ort', 'stadt', 'city'])].filter(Boolean).join(' ');

    const land = String(s.land || 'DE').toUpperCase();
    const gewicht = Number(s.gewicht_kg) || 0;

    // Kunden-Adresse (die im Datensatz) und Betriebs-Adresse (aus Profil).
    const kundeHtml = `${s.empfaenger_firma ? esc(s.empfaenger_firma) + '<br>' : ''}${esc(s.empfaenger_name || '')}<br>${esc(s.strasse || '')}<br>${esc([s.plz, s.ort].filter(Boolean).join(' '))}`;
    const betriebHtml = `${esc(firma)}<br>${esc(strasse || '')}${strasse && plzOrt ? '<br>' : ''}${esc(plzOrt)}`;
    const betriebEinzeilig = `${esc(firma)}${strasse ? ` · ${esc(strasse)}` : ''}${plzOrt ? `, ${esc(plzOrt)}` : ''}`;
    const kundeEinzeilig = `${esc(s.empfaenger_name || '')}${s.strasse ? ` · ${esc(s.strasse)}` : ''}${[s.plz, s.ort].filter(Boolean).length ? `, ${esc([s.plz, s.ort].filter(Boolean).join(' '))}` : ''}`;
    // Retoure: Absender = Kunde, Empfänger = Betrieb. Ausgehend: umgekehrt.
    const absenderZeile = retoure ? kundeEinzeilig : betriebEinzeilig;
    const empfaengerBlock = retoure ? betriebHtml : kundeHtml;

    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<style>
  @page { size: 105mm 148mm; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0A1628; margin: 0; padding: 10mm; width: 105mm; height: 148mm; }
  .label { border: 2px solid #0A1628; border-radius: 6px; height: 100%; padding: 7mm; display: flex; flex-direction: column; }
  .vorschau { position: absolute; top: 6mm; right: 6mm; font-size: 9px; font-weight: 800; color: #E0662E; border: 1px solid #E0662E; border-radius: 4px; padding: 2px 6px; letter-spacing: .05em; }
  .absender { font-size: 9px; color: #55606b; border-bottom: 1px solid #cdd5dd; padding-bottom: 4mm; }
  .carrier { font-size: 12px; font-weight: 800; margin-top: 4mm; }
  .empf-label { font-size: 8px; text-transform: uppercase; letter-spacing: .14em; color: #8a949e; margin-top: 6mm; }
  .empf { font-size: 20px; font-weight: 800; line-height: 1.35; margin-top: 2mm; }
  .land { font-size: 22px; font-weight: 900; margin-top: 3mm; }
  .fuss { margin-top: auto; font-size: 9px; color: #55606b; border-top: 1px solid #cdd5dd; padding-top: 3mm; display: flex; justify-content: space-between; }
</style></head><body>
  <div class="label">
    <div class="vorschau">${retoure ? 'RETOURE · VORSCHAU' : 'VORSCHAU · nicht frankiert'}</div>
    <div class="absender">Absender: ${absenderZeile}</div>
    <div class="carrier">${esc(carrierName(s.carrier))}${s.service ? ` · ${esc(s.service)}` : ''}${retoure ? ' · ↩️ Rücksendung' : ''}${retoure && s.retoure_grund ? ` (${esc(s.retoure_grund)})` : ''}</div>
    <div class="empf-label">${retoure ? 'Empfänger · Rücksendung an' : 'Empfänger'}</div>
    <div class="empf">${empfaengerBlock}</div>
    ${!retoure && land && land !== 'DE' ? `<div class="land">${esc(land)}</div>` : ''}
    <div class="fuss">
      <span>${gewicht > 0 ? gewicht.toLocaleString('de-DE') + ' kg' : ''}${s.referenz ? ` · ${esc(s.referenz)}` : ''}</span>
      <span>${s.tracking_nr ? esc(s.tracking_nr) : 'ARGONAUT OS'}</span>
    </div>
  </div>
</body></html>`;

    const dateiName = `Label-${String(s.empfaenger_name || 'ARGONAUT').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
    const gUrl = (process.env.GOTENBERG_URL || '').replace(/\/+$/, '');
    if (gUrl) {
      try {
        const form = new FormData();
        form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
        form.append('paperWidth', '4.13'); form.append('paperHeight', '5.83');
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
    console.error('Versand-Label Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Fehler beim Erzeugen.' }, { status: 500 });
  }
}
