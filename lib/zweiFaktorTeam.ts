// ============================================================================
// ARGONAUT OS · lib/zweiFaktorTeam.ts — Zwei-Faktor im Team, die Regeln (Paket 164 Stufe 2)
//
// Martin 29.09.2026: Wer die Zwei-Faktor-Anmeldung eines Mitarbeiters
// zurücksetzen darf (Handy + Notfall-Codes verloren):
//   · der Chef — für seine Mitarbeiter
//   · eine vom Chef bestimmte Vertretung (Urlaub, Erreichbarkeit)
//   · höchstens 2 Personen je Betrieb (Chef + 1); der Betreiber kann die
//     Grenze für große Betriebe erhöhen
//   · schafft es der Betrieb nicht (Anfrage älter als 24 h) oder betrifft es
//     den Chef selbst, geht die Anfrage an den Betreiber
// Geländer: nur mit selbst bestätigtem Code (aal2); nie sich selbst (dafür
// gibt es Notfall-Codes); den Chef setzt nur der Betreiber zurück; nur im
// eigenen Betrieb. Zurückgesetzt wird NUR der zweite Faktor — Daten,
// Zugang, Rechte und Nachweise bleiben.
// Rein, ohne Importe, node-getestet.
// ============================================================================

export type TeamRolle = 'chef' | 'helfer' | 'mitarbeiter' | 'betreiber';

export const STANDARD_MAX_PERSONEN = 2;
export const HILFE_AN_BETREIBER_STUNDEN = 24;

/** Wie viele Vertretungen neben dem Chef? (max_personen zählt den Chef mit) */
export function helferPlaetze(maxPersonen: number | null | undefined): number {
  const m = Number.isInteger(maxPersonen) ? (maxPersonen as number) : STANDARD_MAX_PERSONEN;
  return Math.max(0, Math.min(19, m) - 1);
}

/** Darf der Chef noch eine Vertretung bestimmen? */
export function darfHelferSetzen(o: { rolle: TeamRolle; anzahlHelfer: number; maxPersonen: number | null | undefined; schonHelfer: boolean }): boolean {
  if (o.rolle !== 'chef') return false;
  if (o.schonHelfer) return true;
  return o.anzahlHelfer < helferPlaetze(o.maxPersonen);
}

export type Ziel = { userId: string; betrieb: string; istChef: boolean };
export type Aufrufer = { userId: string; betrieb: string; rolle: TeamRolle; aal2: boolean };

/** Darf der Aufrufer den zweiten Faktor dieses Ziels zurücksetzen? Grund, wenn nicht. */
export function darfZuruecksetzen(a: Aufrufer, z: Ziel): { ja: true } | { ja: false; grund: string } {
  if (!a.aal2) return { ja: false, grund: 'Zuerst selbst mit Code anmelden (Zwei-Faktor-Anmeldung einrichten bzw. bestätigen).' };
  if (!z.userId || !a.userId) return { ja: false, grund: 'Zugang nicht gefunden.' };
  if (z.userId === a.userId) return { ja: false, grund: 'Für den eigenen Zugang gelten die Notfall-Codes.' };
  if (a.rolle === 'betreiber') return { ja: true };
  if (a.rolle !== 'chef' && a.rolle !== 'helfer') return { ja: false, grund: 'Nur Geschäftsleitung oder deren Vertretung.' };
  if (z.betrieb !== a.betrieb) return { ja: false, grund: 'Nur im eigenen Betrieb.' };
  if (z.istChef) return { ja: false, grund: 'Die Geschäftsleitung setzt nur der ARGONAUT-Betreiber zurück.' };
  return { ja: true };
}

/** Geht eine Hilfe-Anfrage (auch) an den Betreiber? */
export function hilfeAnBetreiber(anfrage: { vom_chef?: boolean | null; erstellt_am: string; status?: string | null }, jetzt: Date): boolean {
  if (anfrage.status && anfrage.status !== 'offen') return false;
  if (anfrage.vom_chef) return true;
  const t = new Date(anfrage.erstellt_am).getTime();
  if (!Number.isFinite(t)) return true;
  return jetzt.getTime() - t >= HILFE_AN_BETREIBER_STUNDEN * 3600000;
}

/** E-Mail für die Suche normalisieren (leer/ungültig -> null). */
export function emailNorm(roh: unknown): string | null {
  const s = String(roh ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}
