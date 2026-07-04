import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · Block C-4 — Mahnung-PDF (DIN 5008)
// Mahndaten (vom Client) -> HTML -> Gotenberg -> PDF.
// Gleicher Absender-/Gotenberg-Weg wie die Rechnungs-PDF-Route.
// Der Mahntext (Fließtext) kommt vom Client (KI-Entwurf, vom Nutzer editierbar).
// ============================================================

export const runtime = 'nodejs';

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

function datumDe(d: any): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(d);
  }
}

function pflicht(wert: any, hinweis: string): string {
  const s = String(wert ?? '').trim();
  return s ? esc(s) : `<span class="warn">⚠ ${esc(hinweis)}</span>`;
}

function pflichtMehrzeilig(wert: any, hinweis: string): string {
  const s = String(wert ?? '').trim();
  if (!s) return `<span class="warn">⚠ ${esc(hinweis)}</span>`;
  return esc(s).replace(/\n/g, '<br>');
}

// Mahnstufe -> Titel/Betreff
function stufeTitel(stufe: number): string {
  if (stufe >= 3) return '2. Mahnung';
  if (stufe === 2) return '1. Mahnung';
  return 'Zahlungserinnerung';
}

function baueHtml(mahnung: any, rechnung: any, empfaengerName: string, firmaName: string, aussteller: any): string {
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  const waehrung = rechnung?.waehrung || 'EUR';
  const stufe = Number(mahnung?.stufe) || 1;
  const titel = mahnung?.betreff || stufeTitel(stufe);

  const steuerZeile =
    (aussteller?.ust_idnr && String(aussteller.ust_idnr).trim())
      ? `USt-IdNr.: ${esc(aussteller.ust_idnr)}`
      : (aussteller?.steuernummer && String(aussteller.steuernummer).trim())
        ? `Steuernummer: ${esc(aussteller.steuernummer)}`
        : '';

  const empfaenger: string[] = [];
  if (firmaName) empfaenger.push(esc(firmaName));
  if (empfaengerName && empfaengerName !== firmaName) empfaenger.push(esc(empfaengerName));
  if (aussteller?.empfaenger_anschrift) empfaenger.push(esc(aussteller.empfaenger_anschrift));
  const empfaengerHtml = empfaenger.length
    ? empfaenger.map((e) => `<div>${e}</div>`).join('')
    : '<div class="dim">— kein Empfänger zugeordnet —</div>';

  const offen = rechnung?.offener_betrag != null ? rechnung.offener_betrag : rechnung?.brutto_summe;

  // Mahntext (Fließtext) — Zeilenumbrüche in <br>
  const textHtml = mahnung?.text
    ? esc(mahnung.text).replace(/\n/g, '<br>')
    : '<span class="dim">— kein Mahntext —</span>';

  // Zahlungsangaben
  const bank = aussteller?.bank_iban
    ? `<div>Bitte überweisen Sie den offenen Betrag von <strong>${geld(offen, waehrung)}</strong> auf folgendes Konto:</div>
       <div>IBAN: ${esc(aussteller.bank_iban)}${aussteller?.bank_bic ? ' &middot; BIC: ' + esc(aussteller.bank_bic) : ''}${aussteller?.bank_name ? ' (' + esc(aussteller.bank_name) + ')' : ''}</div>
       <div>Verwendungszweck: ${esc(rechnung?.rechnungsnummer) || ''}</div>`
    : `<div>Bitte gleichen Sie den offenen Betrag von <strong>${geld(offen, waehrung)}</strong> aus.</div>
       <div class="warn">⚠ Bankverbindung in den Einstellungen ergänzen</div>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #0A1628; margin: 0; padding: 44px 52px; font-size: 12.5px; line-height: 1.6; }
  .warn { color: #b8860b; font-weight: bold; }

  .absender-mini { font-size: 10px; color: #5b6b80; border-bottom: 1px solid #e1e6ee; padding-bottom: 6px; margin-bottom: 20px; }

  .kopf { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .marke { color: #C9A84C; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold; }
  .aussteller { font-size: 11.5px; color: #0A1628; }
  .aussteller .name { font-weight: bold; font-size: 13px; }
  .aussteller .dim { color: #5b6b80; }
  h1 { font-size: 24px; margin: 4px 0 2px; color: #0A1628; }
  .nummer { color: #5b6b80; font-size: 13px; font-family: 'DejaVu Sans Mono', monospace; }

  .empf-zeile { display: flex; justify-content: space-between; gap: 24px; border-top: 3px solid #C9A84C; padding-top: 20px; margin-top: 12px; margin-bottom: 24px; }
  .block { flex: 1; }
  .block .titel { font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase; color: #8a99ad; font-weight: bold; margin-bottom: 6px; }
  .block .inhalt { border: 1px solid #e1e6ee; border-radius: 8px; padding: 12px 14px; min-height: 74px; }
  .block.rechts .inhalt { font-size: 12px; }
  .dim { color: #8a99ad; }

  .betreff { font-weight: bold; font-size: 14px; margin: 4px 0 16px; }
  .brieftext { font-size: 12.5px; line-height: 1.7; }

  .zahlung { margin-top: 24px; background: #f4f6fa; border-left: 4px solid #00b3cc; padding: 12px 16px; border-radius: 6px; font-size: 12px; }
  .zahlung .titel { font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase; color: #5b6b80; font-weight: bold; margin-bottom: 4px; }

  .fuss { margin-top: 40px; border-top: 1px solid #e1e6ee; padding-top: 12px; color: #8a99ad; font-size: 10.5px; text-align: center; }
</style></head><body>

  <div class="absender-mini">
    ${pflicht(aussteller?.name, 'Firmenname ergänzen')} &middot;
    ${pflicht(aussteller?.anschrift, 'Anschrift ergänzen')}
  </div>

  <div class="kopf">
    <div class="aussteller">
      <div class="marke">${esc(titel)}</div>
      <div class="name">${pflicht(aussteller?.name, 'Firmenname ergänzen')}</div>
      <div class="dim">${pflichtMehrzeilig(aussteller?.anschrift, 'Anschrift ergänzen')}</div>
      ${steuerZeile ? `<div class="dim">${steuerZeile}</div>` : ''}
      ${aussteller?.telefon || aussteller?.email ? `<div class="dim">${esc(aussteller?.telefon || '')}${aussteller?.telefon && aussteller?.email ? ' &middot; ' : ''}${esc(aussteller?.email || '')}</div>` : ''}
    </div>
    <div style="text-align:right;">
      <h1>${esc(titel)}</h1>
      <div class="nummer">${pflicht(rechnung?.rechnungsnummer, 'Nummer fehlt')}</div>
    </div>
  </div>

  <div class="empf-zeile">
    <div class="block">
      <div class="titel">Empfänger</div>
      <div class="inhalt">${empfaengerHtml}</div>
    </div>
    <div class="block rechts">
      <div class="titel">Vorgang</div>
      <div class="inhalt">
        <div>Rechnungsnr.: <strong>${pflicht(rechnung?.rechnungsnummer, '—')}</strong></div>
        <div>Rechnungsdatum: ${datumDe(rechnung?.rechnungsdatum)}</div>
        <div>Fällig seit: ${datumDe(rechnung?.faelligkeitsdatum)}</div>
        <div>Offener Betrag: <strong>${geld(offen, waehrung)}</strong></div>
      </div>
    </div>
  </div>

  <div class="betreff">Betreff: ${esc(titel)} zur Rechnung ${esc(rechnung?.rechnungsnummer) || ''}</div>

  <div class="brieftext">${textHtml}</div>

  <div class="zahlung">
    <div class="titel">Zahlungsangaben</div>
    ${bank}
  </div>

  <div class="fuss">Erstellt mit ARGONAUT OS &middot; ${heute}</div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mahnung = body?.mahnung;
    const rechnung = body?.rechnung;
    const empfaengerName: string = body?.empfaengerName || '';
    const firmaName: string = body?.firmaName || '';
    const aussteller: any = body?.aussteller || {};

    if (!rechnung?.rechnungsnummer && !rechnung?.brutto_summe) {
      return NextResponse.json({ error: 'Rechnungsdaten fehlen.' }, { status: 400 });
    }
    if (!mahnung?.text || !String(mahnung.text).trim()) {
      return NextResponse.json({ error: 'Mahntext fehlt.' }, { status: 400 });
    }

    const html = baueHtml(mahnung, rechnung, empfaengerName, firmaName, aussteller);

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
      console.error('Mahnung Gotenberg Fehler:', pdfResp.status, t.slice(0, 200));
      return NextResponse.json({ error: 'PDF-Erstellung fehlgeschlagen.' }, { status: 502 });
    }

    const pdfBuffer = await pdfResp.arrayBuffer();
    const stufe = Number(mahnung?.stufe) || 1;
    const praefix = stufe >= 3 ? 'Mahnung2' : stufe === 2 ? 'Mahnung1' : 'Zahlungserinnerung';
    const basis = String(rechnung?.rechnungsnummer || 'Rechnung')
      .replace(/[^a-zA-Z0-9äöüÄÖÜ -]/g, '').replace(/\s+/g, '_').slice(0, 60);
    const dateiName = `${praefix}_${basis}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${dateiName}"`,
      },
    });
  } catch (e: any) {
    console.error('Mahnung-PDF Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
