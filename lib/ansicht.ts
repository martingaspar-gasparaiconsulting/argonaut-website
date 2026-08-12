// ============================================================================
// ARGONAUT OS · lib/ansicht.ts — Fokus-/Detail-Umschalter (Einfach ↔ Voll)
//
// Reine Logik + Konstanten (KEINE Imports, KEINE Hooks) — von Client- und
// Server-Code nutzbar, node-testbar. Die Nutzer-Vorliebe „Einfach ↔ Voll"
// steuert, ob Module nur die Basis oder alle Experten-Felder zeigen.
// Standard = 'einfach' (ruhige Maske für den Einstieg); jede Person kann in den
// Einstellungen auf 'voll' schalten, sobald sie mehr sehen möchte.
// ============================================================================

export type Ansicht = 'einfach' | 'voll';

export const ANSICHT_KEY = 'argonaut_ansicht';
export const ANSICHT_EVENT = 'argonaut-ansicht-change';
export const ANSICHT_STANDARD: Ansicht = 'einfach';

export function istAnsicht(v: unknown): v is Ansicht {
  return v === 'einfach' || v === 'voll';
}

/** Rohwert (z. B. aus localStorage) → gültige Ansicht, sonst Standard. */
export function leseAnsicht(roh: unknown): Ansicht {
  return istAnsicht(roh) ? roh : ANSICHT_STANDARD;
}

/** Die jeweils andere Ansicht (zum Umschalten). */
export function andereAnsicht(a: Ansicht): Ansicht {
  return a === 'einfach' ? 'voll' : 'einfach';
}

export function ansichtLabel(a: Ansicht): string {
  return a === 'voll' ? 'Voll' : 'Einfach';
}
