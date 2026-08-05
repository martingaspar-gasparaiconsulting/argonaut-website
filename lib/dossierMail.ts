// ============================================================================
// ARGONAUT OS · lib/dossierMail.ts — Mail-Bausteine für den Dossier-Funnel (I4)
// Serverseitig (nutzt mailLayout). Der Dossier-Link zeigt vorerst auf die
// Vorschau; mit I5 (698 Branchen-PDFs) wird daraus der branchengenaue PDF-Link.
// ============================================================================

import { mailLayout } from './mail';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

/** Bestätigungs-Mail (Double-Opt-In) mit dem Bestätigen-Link. */
export function dossierBestaetigenHtml(name: string | null, url: string): string {
  return mailLayout('Nur noch ein Klick', `
    <p>Guten Tag${name ? ' ' + name : ''},</p>
    <p>bitte bestätige kurz deine E-Mail-Adresse — danach schicken wir dir dein Dossier:</p>
    <p style="margin:24px 0;">
      <a href="${url}" style="display:inline-block;background:#C9A84C;color:#0A1628;text-decoration:none;font-weight:800;padding:13px 24px;border-radius:8px;">E-Mail bestätigen &amp; Dossier erhalten</a>
    </p>
    <p style="color:#8FA3BE;font-size:13px;">Wenn du das nicht angefordert hast, ignoriere diese Mail einfach.<br>Link: ${url}</p>`);
}

/** Auslieferungs-Mail mit dem Dossier-Link (nach Bestätigung). */
export function dossierAusliefernHtml(name: string | null, branche: string | null): string {
  const link = `${BASIS_URL}/vorschau`;
  return mailLayout('Ihr ARGONAUT-Dossier', `
    <p>Guten Tag${name ? ' ' + name : ''},</p>
    <p>vielen Dank für Ihr Interesse. Hier ist Ihr persönliches Dossier${branche ? ` für „${branche}"` : ''}:</p>
    <p style="margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:#C9A84C;color:#0A1628;text-decoration:none;font-weight:800;padding:13px 24px;border-radius:8px;">Dossier ansehen</a>
    </p>
    <p style="color:#8FA3BE;font-size:13px;">Fragen? Antworten Sie einfach auf diese E-Mail.</p>`);
}
