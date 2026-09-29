// ============================================================================
// ARGONAUT OS · lib/zweiFaktorCodes.ts — Notfall-Codes (Paket 164)
//
// Der Rückweg, wenn das Handy weg ist: zehn Einmal-Codes, bei der Einrichtung
// EINMAL angezeigt. Gespeichert wird nur eine Prüfsumme (HMAC mit dem
// Server-Geheimnis und der Nutzerkennung) — wer die Datenbank liest, kann die
// Codes nicht zurückrechnen, und ein Code gilt nur für seinen Nutzer.
// Ein benutzter Code entfernt den zweiten Faktor; danach wird neu eingerichtet.
// Nur Server (node:crypto).
// ============================================================================

import { createHmac, randomInt } from 'node:crypto';

/** Ohne 0/O, 1/I/L — gut vorzulesen und abzutippen. */
export const CODE_ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_ANZAHL = 10;
/** Höchstens so viele Fehlversuche je Stunde und Nutzer. */
export const MAX_FEHLVERSUCHE_STUNDE = 5;

export function erzeugeCodes(anzahl: number = CODE_ANZAHL, zufall: (max: number) => number = randomInt): string[] {
  const codes = new Set<string>();
  while (codes.size < anzahl) {
    let c = '';
    for (let i = 0; i < 10; i++) c += CODE_ZEICHEN[zufall(CODE_ZEICHEN.length)];
    codes.add(`${c.slice(0, 5)}-${c.slice(5)}`);
  }
  return [...codes];
}

/** Groß, ohne Leer- und Bindestriche; falsches Format -> null. */
export function normalisiereCode(roh: unknown): string | null {
  const s = String(roh ?? '').toUpperCase().replace(/[\s-]+/g, '');
  if (s.length !== 10) return null;
  for (const z of s) if (!CODE_ZEICHEN.includes(z)) return null;
  return s;
}

export function codeGeheimnis(env: Record<string, string | undefined> = process.env): string {
  return env.ZWEI_FAKTOR_GEHEIMNIS || env.APP_ENC_KEY || '';
}

/** Prüfsumme eines Codes für GENAU diesen Nutzer. Ohne Geheimnis: '' (dann keine Codes). */
export function codeHash(userId: string, code: string, geheimnis: string = codeGeheimnis()): string {
  const n = normalisiereCode(code);
  if (!geheimnis || !n || !userId) return '';
  return createHmac('sha256', 'zwei-faktor-notfall|' + geheimnis).update(`${userId}|${n}`).digest('hex');
}
