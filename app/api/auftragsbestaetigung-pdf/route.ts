import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · MODUL 5 (Vertrag/Auftrag) · A7 — Auftragsbestätigung als PDF
// Auftragsdaten (vom Client) -> HTML -> Gotenberg -> PDF.
// Kein KI-Aufruf nötig. Nutzt vorhandene Gotenberg-Infrastruktur.
// ============================================================

const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf',
  beauftragt: 'Beauftragt',
  in_bearbeitung: 'In Bearbeitung',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
};

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function geld(n: any, waehrung = 'EUR'): string {
  const wert = Number(n) || 0;
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: waehrung || 'EUR' }).format(wert);
  } catch {
    return wert.toFixed(2) + ' ' + (waehrung || 'EUR');
  }
}

function zahl(n: any): string {
  const wert = Number(n) || 0;
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(wert);
}

function datumDe(d: any): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(d);
  }
}

function baueHtml(auftrag: any, positionen: any[], kontaktName: string, firmaName: string): string {
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  const waehrung = auftrag?.waehrung || 'EUR';
  const statusLabel = STATUS_LABEL[auftrag?.status] || esc(auftrag?.status) || '—';

  const zeilenHtml = (positionen || []).map((p: any, i: number) => `
    <tr>
      <td class="nr">${i + 1}</td>
      <td>${esc(p.bezeichnung) || '&mdash;'}</td>
      <td class="r">${zahl(p.menge)}</td>
      <td class="c">${esc(p.einheit) || 'Stk'}</td>
      <td class="r">${geld(p.einzelpreis, waehrung)}</td>
      <td class="r">${zahl(p.mwst_satz)} %</td>
      <td class="r stark">${geld(p.gesamt_netto, waehrung)}</td>
    </tr>`).join('');

  const empfaenger: string[] = [];
  if (firmaName) empfaenger.push(esc(firmaName));
  if (kontaktName) empfaenger.push(esc(kontaktName));
  const empfaengerHtml = empfaenger.length
    ? empfaenger.map((e) => `<div>${e}</div>`).join('')
    : '<div class="dim">— kein Empfänger zugeordnet —</div>';

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #0A1628; margin: 0; padding: 48px 56px; font-size: 13px; line-height: 1.55; }
  .kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #C9A84C; padding-bottom: 18px; margin-bottom: 26px; }
  .marke { color: #C9A84C; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold; }
  h1 { font-size: 24px; margin: 6px 0 4px; color: #0A1628; }
  .nummer { color: #5b6b80; font-size: 13px; font-family: 'DejaVu Sans Mono', monospace; }
  .kopf-rechts { text-align: right; color: #5b6b80; font-size: 12px; }
  .badge { display: inline-block; background: #f4f6fa; border: 1px solid #d7deea; border-radius: 20px; padding: 3px 12px; font-size: 12px; font-weight: bold; color: #0A1628; margin-top: 6px; }
  .bloecke { display: flex; gap: 24px; margin-bottom: 26px; }
  .block { flex: 1; }
  .block .titel { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #8a99ad; font-weight: bold; margin-bottom: 6px; }
  .block .inhalt { border: 1px solid #e1e6ee; border-radius: 8px; padding: 12px 14px; }
  .dim { color: #8a99ad; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  thead th { background: #0A1628; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 9px 10px; text-align: left; }
  thead th.r { text-align: right; } thead th.c { text-align: center; }
  tbody td { padding: 9px 10px; border-bottom: 1px solid #e8ecf3; vertical-align: top; }
  tbody td.r { text-align: right; } tbody td.c { text-align: center; } tbody td.nr { color: #8a99ad; width: 30px; }
  tbody td.stark { font-weight: bold; }
  .summen { margin-left: auto; width: 300px; margin-top: 14px; }
  .summen .zeile { display: flex; justify-content: space-between; padding: 6px 4px; font-size: 13px; }
  .summen .zeile.brutto { border-top: 2px solid #C9A84C; margin-top: 4px; padding-top: 10px; font-size: 16px; font-weight: bold; color: #0A1628; }
  .summen .label { color: #5b6b80; }
  .notizen { margin-top: 30px; background: #f4f6fa; border-left: 4px solid #00b3cc; padding: 12px 16px; border-radius: 6px; }
  .notizen .titel { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #5b6b80; font-weight: bold; margin-bottom: 4px; }
  .fuss { margin-top: 44px; border-top: 1px solid #e1e6ee; padding-top: 12px; color: #8a99ad; font-size: 11px; text-align: center; }
</style></head><body>
  <div class="kopf">
    <div>
      <div class="marke">ARGONAUT OS · Auftragsbestätigung</div>
      <h1>${esc(auftrag?.titel) || 'Auftrag'}</h1>
      <div class="nummer">${esc(auftrag?.auftragsnummer) || '—'}</div>
    </div>
    <div class="kopf-rechts">
      <div>Datum: ${heute}</div>
      <div class="badge">${statusLabel}</div>
    </div>
  </div>

  <div class="bloecke">
    <div class="block">
      <div class="titel">Empfänger</div>
      <div class="inhalt">${empfaengerHtml}</div>
    </div>
    <div class="block">
      <div class="titel">Eckdaten</div>
      <div class="inhalt">
        <div>Auftragsdatum: ${datumDe(auftrag?.auftragsdatum)}</div>
        <div>Lieferdatum: ${datumDe(auftrag?.lieferdatum)}</div>
        <div>Währung: ${esc(waehrung)}</div>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c">#</th>
        <th>Bezeichnung</th>
        <th class="r">Menge</th>
        <th class="c">Einheit</th>
        <th class="r">Einzelpreis</th>
        <th class="r">MwSt</th>
        <th class="r">Netto</th>
      </tr>
    </thead>
    <tbody>
      ${zeilenHtml || '<tr><td colspan="7" class="dim" style="padding:16px;text-align:center;">Keine Positionen erfasst.</td></tr>'}
    </tbody>
  </table>

  <div class="summen">
    <div class="zeile"><span class="label">Zwischensumme (netto)</span><span>${geld(auftrag?.netto_summe, waehrung)}</span></div>
    <div class="zeile"><span class="label">zzgl. MwSt</span><span>${geld(auftrag?.mwst_summe, waehrung)}</span></div>
    <div class="zeile brutto"><span>Gesamt (brutto)</span><span>${geld(auftrag?.brutto_summe, waehrung)}</span></div>
  </div>

  ${auftrag?.notizen ? `<div class="notizen"><div class="titel">Anmerkungen</div><div>${esc(auftrag.notizen)}</div></div>` : ''}

  <div class="fuss">Erstellt mit ARGONAUT OS &middot; ${heute}</div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const auftrag = body?.auftrag;
    const positionen: any[] = Array.isArray(body?.positionen) ? body.positionen : [];
    const kontaktName: string = body?.kontaktName || '';
    const firmaName: string = body?.firmaName || '';

    if (!auftrag?.titel && !auftrag?.auftragsnummer) {
      return NextResponse.json({ error: 'Auftragsdaten fehlen.' }, { status: 400 });
    }

    // HTML bauen
    const html = baueHtml(auftrag, positionen, kontaktName, firmaName);

    // Gotenberg: HTML -> PDF
    const gotenbergUrl = process.env.GOTENBERG_URL;
    const gUser = process.env.GOTENBERG_USER;
    const gPass = process.env.GOTENBERG_PASSWORD;
    if (!gotenbergUrl) return NextResponse.json({ error: 'PDF-Dienst nicht konfiguriert.' }, { status: 500 });

    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('marginTop', '0.5');
    form.append('marginBottom', '0.5');

    const authHeader = (gUser && gPass) ? 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64') : '';
    const pdfResp = await fetch(`${gotenbergUrl.replace(/\/$/, '')}/forms/chromium/convert/html`, {
      method: 'POST',
      headers: authHeader ? { Authorization: authHeader } : undefined,
      body: form,
    });
    if (!pdfResp.ok) {
      const t = await pdfResp.text();
      console.error('Auftragsbestätigung Gotenberg Fehler:', pdfResp.status, t.slice(0, 200));
      return NextResponse.json({ error: 'PDF-Erstellung fehlgeschlagen.' }, { status: 502 });
    }

    const pdfBuffer = await pdfResp.arrayBuffer();
    const basis = String(auftrag?.auftragsnummer || auftrag?.titel || 'Auftrag')
      .replace(/[^a-zA-Z0-9äöüÄÖÜ -]/g, '').replace(/\s+/g, '_').slice(0, 60);
    const dateiName = `Auftragsbestaetigung_${basis}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${dateiName}"`,
      },
    });
  } catch (e: any) {
    console.error('Auftragsbestätigung Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
