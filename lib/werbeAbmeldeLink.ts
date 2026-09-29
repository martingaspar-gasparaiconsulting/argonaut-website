// ============================================================================
// ARGONAUT OS · lib/werbeAbmeldeLink.ts — ein Abmeldelink für ALLE Werbung
// (Paket 173, 29.09.2026 · Befund M7)
//
// Bisher hatte jeder Kanal seinen eigenen Abmeldelink (Newsletter, Serie,
// Freebie, Webinar, Rückholung) — und manche Werbe-Mails gar keinen
// (Bewertungsbitte, Termin-Nachfass, Lead-Nachfass, Abläufe). Dieser Link
// funktioniert für jede Mail: Er nennt den Betrieb und die Adresse und trägt
// eine Unterschrift h = HMAC-SHA256(Geheimnis, betrieb|adresse). Nur mit
// gültiger Unterschrift wird eingetragen — sonst könnte jeder beliebige
// Adressen bei beliebigen Betrieben abmelden.
//
// Der Link läuft bewusst NICHT ab: ein Widerspruch muss auch aus einer Mail
// vom letzten Jahr noch funktionieren (§ 7 Abs. 3 Nr. 4 UWG, Art. 21 DSGVO).
//
// Nur Server (node:crypto).
// ============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { normMail, istMail } from './werbeErlaubnis';
import { werbeKopfzeilen } from './werbemail';

export const ABMELDE_PFAD = '/api/oeffentlich/werbung-abmelden';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function geheimnis(env: Record<string, string | undefined> = process.env): string {
  return env.WERBE_ABMELDE_GEHEIMNIS || env.MAIL_KLICK_GEHEIMNIS || env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function istKennung(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v.trim());
}

/** Adresse URL-sicher verpacken (base64url). */
export function mailVerpacken(email: string): string {
  return Buffer.from(normMail(email), 'utf8').toString('base64url');
}

export function mailEntpacken(roh: unknown): string {
  if (typeof roh !== 'string' || !/^[A-Za-z0-9_-]{1,400}$/.test(roh)) return '';
  try { return normMail(Buffer.from(roh, 'base64url').toString('utf8')); } catch { return ''; }
}

/** Unterschrift für (Betrieb, Adresse). Ohne Geheimnis: '' (dann entsteht kein Link). */
export function abmeldeSignatur(betrieb: string, email: string, gh: string = geheimnis()): string {
  if (!gh) return '';
  return createHmac('sha256', 'werbe-abmelden|' + gh)
    .update(`${String(betrieb).trim().toLowerCase()}|${normMail(email)}`)
    .digest('hex')
    .slice(0, 32);
}

export function abmeldeSignaturGueltig(betrieb: string, email: string, h: unknown, gh: string = geheimnis()): boolean {
  const soll = abmeldeSignatur(betrieb, email, gh);
  if (!soll || typeof h !== 'string' || h.length !== soll.length) return false;
  return timingSafeEqual(Buffer.from(soll), Buffer.from(h));
}

/**
 * Der fertige Abmeldelink. '' wenn Betrieb, Adresse oder Geheimnis fehlen —
 * die Aufrufer schicken dann KEINE Werbe-Mail (lieber gar nicht als ohne Abmeldung).
 */
export function werbeAbmeldeLink(basis: string, betrieb: unknown, email: unknown, gh: string = geheimnis()): string {
  if (!istKennung(betrieb) || !istMail(email)) return '';
  const b = String(betrieb).trim().toLowerCase();
  const h = abmeldeSignatur(b, String(email), gh);
  if (!h) return '';
  const wurzel = String(basis || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(wurzel)) return '';
  return `${wurzel}${ABMELDE_PFAD}?b=${b}&e=${mailVerpacken(String(email))}&h=${h}`;
}

/** Aus den Parametern eines Aufrufs Betrieb + Adresse lesen — nur bei gültiger Unterschrift. */
export function abmeldeParameterLesen(p: URLSearchParams, gh: string = geheimnis()): { betrieb: string; email: string } | null {
  const b = (p.get('b') || '').trim().toLowerCase();
  const email = mailEntpacken(p.get('e') || '');
  const h = (p.get('h') || '').trim();
  if (!istKennung(b) || !istMail(email)) return null;
  if (!abmeldeSignaturGueltig(b, email, h, gh)) return null;
  return { betrieb: b, email };
}

/**
 * Was eine Werbe-Mail mitbringen muss: Abmeldelink (für den Fuß) und die
 * Kopfzeilen List-Unsubscribe + One-Click (der Endpunkt beantwortet POST).
 * null = kein Link baubar -> diese Werbe-Mail NICHT verschicken.
 */
export function werbeVersandTeile(basis: string, betrieb: unknown, email: unknown, gh: string = geheimnis()): { abmeldeLink: string; kopfzeilen: Record<string, string> } | null {
  const abmeldeLink = werbeAbmeldeLink(basis, betrieb, email, gh);
  if (!abmeldeLink) return null;
  const kopfzeilen = werbeKopfzeilen(abmeldeLink, { einKlick: true });
  if (!kopfzeilen['List-Unsubscribe']) return null;
  return { abmeldeLink, kopfzeilen };
}
