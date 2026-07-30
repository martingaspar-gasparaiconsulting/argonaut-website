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

/** Abonnenten zählen: gesamt / aktiv / abgemeldet. */
export function zaehleAbonnenten(liste: AbonnentLite[]): {
  gesamt: number;
  aktiv: number;
  abgemeldet: number;
} {
  const l = liste || [];
  let aktiv = 0;
  let abgemeldet = 0;
  for (const a of l) {
    if ((a?.status ?? 'aktiv') === 'abgemeldet') abgemeldet++;
    else aktiv++;
  }
  return { gesamt: l.length, aktiv, abgemeldet };
}

// ---------------------------------------------------------------------------
// Versand-Helfer (Punkt 29b)
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
 * Baut den inneren HTML-Inhalt einer Newsletter-Mail: der Fließtext plus der
 * gesetzlich nötige Abmelde-Fuß (§7 UWG). Wird anschließend in mailLayout()
 * verpackt. `abmelde` ist die fertige Abmelde-URL (siehe abmeldeUrl()).
 */
export function newsletterBodyHtml(inhaltText: string, abmelde: string): string {
  const inhalt = textZuHtml(inhaltText);
  return (
    `<div style="font-size:15px;line-height:1.6;color:#1a2332;">${inhalt}</div>` +
    `<div style="margin-top:28px;border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;line-height:1.5;color:#8a94a6;">` +
    `Du erhältst diese E-Mail, weil du dich für unseren Newsletter eingetragen hast. ` +
    `<a href="${abmelde}" style="color:#8a94a6;text-decoration:underline;">Vom Newsletter abmelden</a>.` +
    `</div>`
  );
}
