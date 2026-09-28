// ============================================================================
// ARGONAUT OS · lib/ablaufZeit.ts — Zeitplan-Auslöser der Abläufe (Paket 159)
//
// Der Motor läuft stündlich (um :20). Ein Zeitplan-Ablauf ist fällig, sobald
// in BERLINER Zeit sein Tag erreicht ist und die Uhrzeit vorbei — auch wenn ein
// Durchgang ausfiel, holt der nächste am selben Tag nach. Jede fällige Stelle
// („Slot") bekommt eine feste Kennung aus Ablauf + Slot: Der Unique-Index auf
// ablauf_laeufe (ablauf_id, ziel_typ, ziel_id) verhindert so, dass ein Slot
// zweimal läuft — auch wenn zwei Durchgänge gleichzeitig kommen.
// Rein, node-getestet (node:crypto für die Kennung).
// ============================================================================

import { createHash } from 'node:crypto';
import { berlinTeile } from './gebuehrenHonorare';
import type { Ausloeser } from './ablauf';

/** Tage im Monat (Monat 1–12). */
function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

/**
 * Der fällige Slot „JJJJ-MM-TT HH:MM" (Berliner Zeit) — oder null, wenn jetzt
 * nichts fällig ist. Wöchentlich: 1 = Montag … 7 = Sonntag. Monatlich: Tag
 * 29–31 zählt in kürzeren Monaten als letzter Tag.
 */
export function zeitplanSlot(a: Ausloeser, jetzt: Date): string | null {
  if (a.art !== 'zeitplan') return null;
  const t = berlinTeile(jetzt);
  if (!t) return null;
  const uhr = /^([01]\d|2[0-3]):[0-5]\d$/.test(a.uhrzeit ?? '') ? (a.uhrzeit as string) : '07:00';
  const [h, m] = uhr.split(':').map(Number);
  if (t.stunde * 60 + t.minute < h * 60 + m) return null;
  if (a.rhythmus === 'woechentlich') {
    const iso = t.wochentag === 0 ? 7 : t.wochentag;
    if (iso !== (a.wochentag ?? 1)) return null;
  } else if (a.rhythmus === 'monatlich') {
    const [jahr, monat, tag] = t.datum.split('-').map(Number);
    const soll = Math.min(Math.max(1, Math.trunc(a.tag ?? 1)), tageImMonat(jahr, monat));
    if (tag !== soll) return null;
  } else if (a.rhythmus !== 'taeglich') return null;
  return `${t.datum} ${uhr}`;
}

/** Feste Kennung (UUID-Form) für Ablauf + Slot — gleiche Eingabe, gleiche Kennung. */
export function slotKennung(ablaufId: string, slot: string): string {
  const h = createHash('sha256').update(`ablauf-slot|${ablaufId}|${slot}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
