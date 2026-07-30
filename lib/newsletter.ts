// ============================================================================
// ARGONAUT OS · lib/newsletter.ts — reine Helfer für den Newsletter (Punkt 29)
//
// KEINE Supabase-Aufrufe, KEINE React-Hooks — nur pure Funktionen, damit sie
// node-testbar sind und in Client + Server gleich genutzt werden können.
// ============================================================================

export type AbonnentLite = {
  status?: string | null;
};

/** E-Mail vereinheitlichen: Leerzeichen weg, klein schreiben. */
export function emailNormalisieren(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

/** Einfache, robuste E-Mail-Prüfung (kein Overkill, fängt Tippfehler). */
export function istEmailGueltig(email: string | null | undefined): boolean {
  const e = emailNormalisieren(email);
  // genau ein @, davor/danach etwas, ein Punkt in der Domain, keine Leerzeichen
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Abonnenten zählen: gesamt / aktiv / abgemeldet / unbestätigt (Double-Opt-In). */
export function zaehleAbonnenten(liste: AbonnentLite[]): {
  gesamt: number;
  aktiv: number;
  abgemeldet: number;
  unbestaetigt: number;
} {
  const l = liste || [];
  let aktiv = 0;
  let abgemeldet = 0;
  let unbestaetigt = 0;
  for (const a of l) {
    const st = a?.status ?? 'aktiv';
    if (st === 'abgemeldet') abgemeldet++;
    else if (st === 'unbestaetigt') unbestaetigt++;
    else aktiv++;
  }
  return { gesamt: l.length, aktiv, abgemeldet, unbestaetigt };
}

// ---------------------------------------------------------------------------
// Versand-Helfer (Punkt 29b/29c)
// ---------------------------------------------------------------------------

/** Öffentlicher Abmelde-Link für eine Mail. origin z.B. "https://argonaut-os.com". */
export function abmeldeUrl(origin: string | null | undefined, token: string): string {
  const base = (origin || 'https://argonaut-os.com').replace(/\/+$/, '');
  return `${base}/api/newsletter/abmelden?token=${encodeURIComponent(token || '')}`;
}

/** HTML-Sonderzeichen entschärfen (kein HTML-Einschleusen über den Fließtext). */
export function escapeHtml(text: string | null | undefined): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Reinen Text als HTML: entschärfen + Zeilenumbrüche zu <br>. */
export function textZuHtml(text: string | null | undefined): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

/**
 * Sichere Farbe: nur echte Hex-Farben durchlassen (#abc oder #aabbcc…), sonst
 * neutraler Standard. Verhindert, dass ein Firmen-Farbwert das Mail-HTML bricht.
 */
export function sichereFarbe(farbe: string | null | undefined, standard = '#1a2332'): string {
  const f = (farbe || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(f) ? f : standard;
}

/**
 * Baut die KOMPLETTE Newsletter-Mail im Branding DES KUNDEN (nicht ARGONAUT):
 * Firmenname im Kopf, Firmen-Akzentfarbe als Linie/Links, neutrales Weiß.
 * Enthält den gesetzlich nötigen Abmelde-Fuß (§7 UWG). Kein ARGONAUT-Bezug.
 *
 * @param firmaName  Anzeigename des Absenders (Firma des Kunden).
 * @param betreff    Betreff, wird zugleich als Überschrift gezeigt.
 * @param inhaltText Reiner Text aus dem Formular (wird entschärft + umgebrochen).
 * @param abmelde    Fertige Abmelde-URL (siehe abmeldeUrl()).
 * @param akzentfarbe Firmen-Akzentfarbe (Hex) — Fallback neutral.
 */
export function newsletterMailHtml(
  firmaName: string | null | undefined,
  betreff: string,
  inhaltText: string,
  abmelde: string,
  akzentfarbe?: string | null,
): string {
  const firma = escapeHtml((firmaName || '').trim() || 'Newsletter');
  const akzent = sichereFarbe(akzentfarbe);
  const titel = escapeHtml(betreff);
  const inhalt = textZuHtml(inhaltText);

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="padding:24px 28px;border-bottom:3px solid ${akzent};">
        <div style="font-size:20px;font-weight:800;color:${akzent};">${firma}</div>
      </div>
      <div style="padding:28px;">
        ${titel ? `<h1 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#1a2332;">${titel}</h1>` : ''}
        <div style="font-size:15px;line-height:1.6;color:#1a2332;">${inhalt}</div>
      </div>
      <div style="padding:18px 28px;background:#fafbfc;border-top:1px solid #eeeeee;font-size:12px;line-height:1.5;color:#8a94a6;">
        Du erhältst diese E-Mail, weil du dich beim Newsletter von ${firma} angemeldet hast.<br>
        <a href="${abmelde}" style="color:${akzent};text-decoration:underline;">Vom Newsletter abmelden</a>.
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Autoresponder (Marketing-Autopilot Phase 2) — Mail-Bausteine.
// Gleiche Optik/Marke wie der Newsletter (Branding DES KUNDEN), nur der
// Fusstext ist auf die automatische Info-Serie angepasst. §7 UWG: Abmelde-
// Link ist Pflicht und liegt in JEDER Mail.
// ---------------------------------------------------------------------------

/** Oeffentlicher Abmelde-Link fuer einen Autoresponder-Lauf. */
export function autoresponderAbmeldeUrl(origin: string | null | undefined, token: string): string {
  const base = (origin || 'https://argonaut-os.com').replace(/\/+$/, '');
  return `${base}/api/autoresponder/abmelden?token=${encodeURIComponent(token || '')}`;
}

/**
 * Baut die komplette Autoresponder-Mail im Branding DES KUNDEN.
 * Wie newsletterMailHtml, aber neutraler Info-Serien-Fusstext.
 */
export function autoresponderMailHtml(
  firmaName: string | null | undefined,
  betreff: string,
  inhaltText: string,
  abmelde: string,
  akzentfarbe?: string | null,
): string {
  const firma = escapeHtml((firmaName || '').trim() || 'Info-Serie');
  const akzent = sichereFarbe(akzentfarbe);
  const titel = escapeHtml(betreff);
  const inhalt = textZuHtml(inhaltText);

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="padding:24px 28px;border-bottom:3px solid ${akzent};">
        <div style="font-size:20px;font-weight:800;color:${akzent};">${firma}</div>
      </div>
      <div style="padding:28px;">
        ${titel ? `<h1 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#1a2332;">${titel}</h1>` : ''}
        <div style="font-size:15px;line-height:1.6;color:#1a2332;">${inhalt}</div>
      </div>
      <div style="padding:18px 28px;background:#fafbfc;border-top:1px solid #eeeeee;font-size:12px;line-height:1.5;color:#8a94a6;">
        Du erhältst diese E-Mail als Teil einer automatischen Info-Serie von ${firma}.<br>
        <a href="${abmelde}" style="color:${akzent};text-decoration:underline;">Keine weiteren E-Mails erhalten</a>.
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Double-Opt-In (Paket 2b) — Bestätigungs-Mail fuer die oeffentliche Anmeldung.
// Nach dem Eintragen ins oeffentliche Formular bekommt der Interessent DIESE
// Mail: er muss auf den Bestaetigen-Knopf klicken, erst dann ist er aktiv
// (DSGVO/BGH: nachweisbare Einwilligung). Branding DES KUNDEN.
// ---------------------------------------------------------------------------

/** Bestaetigungs-Link (Double-Opt-In) fuer eine oeffentliche Anmeldung. */
export function optinBestaetigenUrl(origin: string | null | undefined, token: string): string {
  const base = (origin || 'https://argonaut-os.com').replace(/\/+$/, '');
  return `${base}/api/oeffentlich/optin-bestaetigen?token=${encodeURIComponent(token || '')}`;
}

/**
 * Baut die Double-Opt-In-Bestaetigungsmail im Branding DES KUNDEN.
 * Grosser, klarer Bestaetigen-Knopf + Klartext, worum es geht.
 */
export function optinBestaetigungHtml(
  firmaName: string | null | undefined,
  bestaetigenUrl: string,
  akzentfarbe?: string | null,
  name?: string | null,
): string {
  const firma = escapeHtml((firmaName || '').trim() || 'Newsletter');
  const akzent = sichereFarbe(akzentfarbe);
  const anrede = (name || '').trim() ? `Hallo ${escapeHtml(name!.trim())},` : 'Hallo,';

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="padding:24px 28px;border-bottom:3px solid ${akzent};">
        <div style="font-size:20px;font-weight:800;color:${akzent};">${firma}</div>
      </div>
      <div style="padding:28px;font-size:15px;line-height:1.6;color:#1a2332;">
        <p style="margin:0 0 14px;">${anrede}</p>
        <p style="margin:0 0 20px;">bitte bestätige einmalig, dass du E-Mails von <b>${firma}</b> erhalten möchtest. Klicke dazu auf den folgenden Knopf:</p>
        <p style="text-align:center;margin:0 0 24px;">
          <a href="${bestaetigenUrl}" style="display:inline-block;background:${akzent};color:#ffffff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 28px;border-radius:10px;">Anmeldung bestätigen</a>
        </p>
        <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Falls der Knopf nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
        <a href="${bestaetigenUrl}" style="color:${akzent};word-break:break-all;">${bestaetigenUrl}</a></p>
      </div>
      <div style="padding:18px 28px;background:#fafbfc;border-top:1px solid #eeeeee;font-size:12px;line-height:1.5;color:#8a94a6;">
        Du erhältst diese E-Mail, weil sich jemand mit deiner Adresse bei ${firma} angemeldet hat.
        Warst du das nicht, ignoriere diese Nachricht einfach — ohne Bestätigung senden wir dir nichts.
      </div>
    </div>
  </div>
</body>
</html>`;
}
