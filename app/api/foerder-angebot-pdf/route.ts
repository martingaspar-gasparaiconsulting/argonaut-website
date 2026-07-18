// ============================================================
// ARGONAUT OS · Bündel 13 · app/api/foerder-angebot-pdf/route.ts
// Erzeugt aus einem gespeicherten Förder-Angebot ein förder-taugliches PDF
// (Kostenvoranschlag + Leistungsbeschreibung + Förder-Hinweis + Schätzung).
//   GET ?id=..  -> PDF (über Gotenberg), Content-Disposition
// Authentifiziert (Dashboard): nur der Eigentümer sieht sein Angebot (RLS).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function eur(n: unknown): string {
  return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) { const v = o?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return '';
}

type Pos = { bezeichnung?: string; netto?: number };

export async function GET(req: NextRequest) {
  try {
    const id = (new URL(req.url).searchParams.get('id') || '').trim();
    if (!id) return NextResponse.json({ error: 'Kein Angebot angegeben.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    // RLS schützt auf den Eigentümer
    const { data: a } = await supabase.from('foerder_angebote')
      .select('id, kunde_name, titel, positionen, netto_summe, foerderquote, notiz, erstellt_am')
      .eq('id', id).maybeSingle();
    if (!a) return NextResponse.json({ error: 'Angebot nicht gefunden.' }, { status: 404 });

    const { data: pRaw } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    const p = (pRaw || {}) as Record<string, unknown>;
    const firma = pick(p, ['firma_name', 'full_name']) || 'Ihr Betrieb';
    const strasse = pick(p, ['strasse', 'adresse', 'anschrift', 'street']);
    const plzOrt = [pick(p, ['plz', 'postleitzahl', 'zip']), pick(p, ['ort', 'stadt', 'city'])].filter(Boolean).join(' ');
    const mail = pick(p, ['rechnung_email', 'email', 'kontakt_email']);
    const tel = pick(p, ['telefon', 'phone', 'tel']);

    const positionen = (Array.isArray(a.positionen) ? a.positionen : []) as Pos[];
    const netto = Number(a.netto_summe) || positionen.reduce((s, x) => s + (Number(x.netto) || 0), 0);
    const quote = Math.max(0, Math.min(100, Number(a.foerderquote) || 0));
    const zuschuss = Math.round(netto * quote) / 100;
    const eigenanteil = netto - zuschuss;

    const zeilen = positionen.map((x, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(x.bezeichnung || '')}</td>
        <td class="r">${eur(x.netto)}</td>
      </tr>`).join('');

    const datum = new Date(String(a.erstellt_am || '')).toLocaleDateString('de-DE');

    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #14202e; font-size: 12px; line-height: 1.55; margin: 0; }
  .kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0A1628; padding-bottom: 14px; margin-bottom: 24px; }
  .firma { font-size: 20px; font-weight: 800; color: #0A1628; }
  .absender { color: #55606b; font-size: 11px; margin-top: 4px; }
  .meta { text-align: right; font-size: 11px; color: #55606b; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #0A1628; }
  .empf { margin: 6px 0 22px; }
  .empf .label { color: #8a949e; font-size: 10px; text-transform: uppercase; letter-spacing: .12em; }
  table.pos { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.pos th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #8a949e; border-bottom: 1px solid #cdd5dd; padding: 6px 8px; }
  table.pos td { padding: 8px; border-bottom: 1px solid #eceff2; vertical-align: top; }
  table.pos td.r, table.pos th.r { text-align: right; }
  .summe { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .summe td { padding: 4px 8px; }
  .summe td.r { text-align: right; }
  .summe .netto td { font-size: 14px; font-weight: 800; color: #0A1628; border-top: 2px solid #0A1628; padding-top: 8px; }
  .box { margin-top: 22px; border: 1px solid #cdd5dd; border-radius: 8px; padding: 14px 16px; }
  .box h3 { margin: 0 0 6px; font-size: 13px; color: #0A1628; }
  .foerder { background: #f4f8f4; border-color: #bfe0c9; }
  .foerder .zahl { font-size: 18px; font-weight: 800; color: #1f7a44; }
  .hinweis { background: #fff7ec; border-color: #ecd9b0; }
  .grid3 { display: flex; gap: 18px; margin-top: 6px; }
  .grid3 > div { flex: 1; }
  .grid3 .k { color: #55606b; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; }
  .fuss { margin-top: 26px; padding-top: 12px; border-top: 1px solid #cdd5dd; color: #8a949e; font-size: 10px; }
</style></head><body>
  <div class="kopf">
    <div>
      <div class="firma">${esc(firma)}</div>
      <div class="absender">${esc(strasse)}${strasse ? '<br>' : ''}${esc(plzOrt)}${mail ? `<br>${esc(mail)}` : ''}${tel ? ` · ${esc(tel)}` : ''}</div>
    </div>
    <div class="meta"><div><b>Angebot / Kostenvoranschlag</b></div><div>Datum: ${esc(datum)}</div></div>
  </div>

  <div class="empf">
    <div class="label">Für</div>
    <div style="font-size:14px;font-weight:700;">${esc(a.kunde_name || '')}</div>
  </div>

  <h1>${esc(a.titel || 'ARGONAUT Einführungspaket')}</h1>

  <table class="pos">
    <thead><tr><th style="width:28px;">#</th><th>Leistung</th><th class="r">Netto</th></tr></thead>
    <tbody>${zeilen || '<tr><td colspan="3" style="color:#8a949e;">Keine Positionen.</td></tr>'}</tbody>
  </table>
  <table class="summe">
    <tr class="netto"><td></td><td class="r">Summe netto</td><td class="r">${eur(netto)}</td></tr>
    <tr><td></td><td class="r" style="color:#55606b;">zzgl. 19 % USt (nicht förderfähig)</td><td class="r" style="color:#55606b;">${eur(netto * 0.19)}</td></tr>
    <tr><td></td><td class="r" style="font-weight:700;">Gesamt brutto</td><td class="r" style="font-weight:700;">${eur(netto * 1.19)}</td></tr>
  </table>

  <div class="box foerder">
    <h3>Förder-Schätzung (Annahme ${quote} % Zuschuss auf die Netto-Kosten)</h3>
    <div class="grid3">
      <div><div class="k">Förderfähige Kosten (netto)</div><div>${eur(netto)}</div></div>
      <div><div class="k">Voraussichtlicher Zuschuss</div><div class="zahl">${eur(zuschuss)}</div></div>
      <div><div class="k">Ihr Eigenanteil (netto)</div><div>${eur(eigenanteil)}</div></div>
    </div>
    <div style="color:#55606b;margin-top:8px;font-size:10.5px;">Unverbindliche Schätzung. Höhe und Quote richten sich nach dem konkreten Landesprogramm (z. B. Digitalbonus) und dem Bewilligungsbescheid.</div>
  </div>

  <div class="box">
    <h3>Leistungsbeschreibung (für Ihren Förderantrag)</h3>
    ARGONAUT OS ist ein betriebliches Software-System zur durchgängigen Digitalisierung der Geschäftsprozesse.
    Der Leistungsumfang umfasst die digitale Auftrags-, Termin-, Dokumenten- und Rechnungsverwaltung, eine
    revisionssichere Belegablage nach GoBD, ein rollenbasiertes Rechte- und Benutzermanagement sowie eine
    DSGVO-konforme Datenhaltung mit Hosting in Deutschland. Ziel des Vorhabens ist die durchgängige
    Digitalisierung betrieblicher Abläufe und die Erhöhung der IT- und Datensicherheit des Unternehmens.
  </div>

  <div class="box hinweis">
    <h3>⚠ Wichtig für die Förderung — Reihenfolge beachten</h3>
    Der Förderantrag (z. B. Digitalbonus Ihres Bundeslandes) muss <b>VOR</b> der Beauftragung gestellt und
    <b>bewilligt</b> sein. Bitte beauftragen Sie das Vorhaben erst nach Erhalt des Zuwendungsbescheids —
    ein vorzeitiger Vertragsabschluss („Vorhabenbeginn") führt in der Regel zum Verlust der Förderung.
    Dieses Angebot dient als Kostenvoranschlag für Ihren Antrag.
  </div>

  ${a.notiz ? `<div class="box"><h3>Anmerkung</h3>${esc(a.notiz)}</div>` : ''}

  <div class="fuss">${esc(firma)}${strasse ? ` · ${esc(strasse)}, ${esc(plzOrt)}` : ''} · Angebot erstellt mit ARGONAUT OS</div>
</body></html>`;

    const dateiName = `Foerder-Angebot-${String(a.kunde_name || 'ARGONAUT').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;

    const gUrl = (process.env.GOTENBERG_URL || '').replace(/\/+$/, '');
    if (gUrl) {
      try {
        const form = new FormData();
        form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
        form.append('paperWidth', '8.27'); form.append('paperHeight', '11.69');
        form.append('marginTop', '0'); form.append('marginBottom', '0');
        form.append('marginLeft', '0'); form.append('marginRight', '0');
        form.append('printBackground', 'true');
        const headers: Record<string, string> = {};
        const gUser = process.env.GOTENBERG_USER, gPass = process.env.GOTENBERG_PASSWORD;
        if (gUser && gPass) headers['Authorization'] = 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64');
        const gRes = await fetch(`${gUrl}/forms/chromium/convert/html`, { method: 'POST', headers, body: form });
        if (gRes.ok) {
          const pdf = Buffer.from(await gRes.arrayBuffer());
          return new NextResponse(pdf, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${dateiName}"`,
              'Cache-Control': 'no-store',
            },
          });
        }
        console.error('Gotenberg HTTP', gRes.status);
      } catch (ge) {
        console.error('Gotenberg Fehler:', ge instanceof Error ? ge.message : ge);
      }
    }
    // Fallback: druckbare HTML-Version
    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    console.error('Förder-Angebot-PDF Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Fehler beim Erzeugen.' }, { status: 500 });
  }
}
