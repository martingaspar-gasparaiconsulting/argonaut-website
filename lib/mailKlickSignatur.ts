// ============================================================================
// ARGONAUT OS · lib/mailKlickSignatur.ts — Unterschrift für Klick-Links (S1)
//
// Befund Paket 161: /api/oeffentlich/mail-klick leitete auf JEDES http(s)-Ziel
// weiter — auch ohne Versand und Schlüssel. Ein Betrüger konnte
//   https://argonaut-os.com/api/oeffentlich/mail-klick?u=https://betrug.example
// verschicken: der Link zeigt auf unsere Domain, landet aber beim Betrüger
// („offene Umleitung"). Das schadet dem Ruf der Domain und damit der
// Zustellbarkeit ALLER Mails unserer Kunden.
//
// Jetzt trägt jeder Klick-Link, den ARGONAUT selbst in eine Mail schreibt, eine
// Unterschrift h = HMAC-SHA256(Geheimnis, v|s|u). Nur mit gültiger Unterschrift
// wird sofort weitergeleitet. Ohne (alte Mails, gebastelte Links) erscheint eine
// Zwischenseite mit dem Ziel im Klartext — alte Mails funktionieren weiter,
// nur mit einem Klick mehr.
//
// Nur Server (node:crypto). lib/mailMessung.ts bleibt rein und browsertauglich.
// ============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

function geheimnis(env: Record<string, string | undefined> = process.env): string {
  return env.MAIL_KLICK_GEHEIMNIS || env.SUPABASE_SERVICE_ROLE_KEY || '';
}

/** Unterschrift für (Versand, Schlüssel, Ziel). Ohne Geheimnis: '' (= unsigniert). */
export function klickSignatur(versandId: string, schluessel: string, ziel: string, gh: string = geheimnis()): string {
  if (!gh) return '';
  return createHmac('sha256', 'mail-klick|' + gh)
    .update(`${versandId}|${schluessel}|${ziel}`)
    .digest('hex')
    .slice(0, 32);
}

/** Passt die mitgeschickte Unterschrift? Zeitkonstant verglichen. */
export function klickSignaturGueltig(versandId: string, schluessel: string, ziel: string, h: string, gh: string = geheimnis()): boolean {
  const soll = klickSignatur(versandId, schluessel, ziel, gh);
  if (!soll || typeof h !== 'string' || h.length !== soll.length) return false;
  return timingSafeEqual(Buffer.from(soll), Buffer.from(h));
}

function maskiere(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Zwischenseite für unsignierte Links: zeigt das Ziel (vor allem den
 * Rechnernamen) im Klartext und leitet NICHT selbst weiter.
 */
export function zwischenseiteHtml(ziel: string): string {
  let rechner = ziel;
  try { rechner = new URL(ziel).host; } catch { /* Ziel ist vorher geprüft */ }
  const z = maskiere(ziel);
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="referrer" content="no-referrer">
  <title>Weiter zu einer externen Seite</title>
</head>
<body style="margin:0;background:#f4f5f7;font-family:Helvetica,Arial,sans-serif;color:#1a2332;">
  <div style="max-width:520px;margin:0 auto;padding:56px 24px;">
    <div style="background:#fff;border-radius:12px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <h1 style="font-size:20px;margin:0 0 12px;">Sie verlassen diese Seite</h1>
      <p style="margin:0 0 8px;line-height:1.5;">Der Link führt zu:</p>
      <p style="margin:0 0 18px;font-weight:700;word-break:break-all;">${maskiere(rechner)}</p>
      <p style="margin:0 0 22px;color:#6b7688;font-size:13px;line-height:1.5;word-break:break-all;">${z}</p>
      <a href="${z}" rel="noopener noreferrer nofollow" style="display:inline-block;background:#1a2332;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;">Weiter</a>
      <p style="margin:20px 0 0;color:#6b7688;font-size:12px;line-height:1.5;">Wenn Sie diesen Link nicht erwartet haben, schließen Sie die Seite einfach.</p>
    </div>
  </div>
</body>
</html>`;
}
