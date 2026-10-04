// ============================================================================
// ARGONAUT OS · lib/zweiFaktorAusnahme.ts — Paket 203 (Entscheidung B4, 04.10.2026)
// Ausnahme von der Zwei-Faktor-Pflicht je Mitarbeiter
//
// Befund: Hat ein Mitarbeiter kein Diensthandy, musste der Chef die Pflicht
// (Paket 190) für ALLE ausschalten. Jetzt kann er einzelne Mitarbeiter
// ausnehmen — mit Grund, optional befristet, mit Nachweis wer/wann.
//
// Regeln:
//   · Nur die Geschäftsleitung, nur mit eigenem bestätigtem Code (aal2).
//   · Nur echte Mitarbeiter-Zugänge des eigenen Betriebs — nie die
//     Geschäftsleitung selbst, nie eine Vertretung (die setzt Faktoren zurück
//     und braucht selbst einen).
//   · Grund Pflicht (mind. 5 Zeichen), Frist optional, höchstens 1 Jahr.
//   · Aufheben jederzeit; die Zeile bleibt als Nachweis (aufgehoben_am).
//   · Wirkung nur auf die Pflicht je Betrieb. Eine Server-Pflicht für ganz
//     ARGONAUT (ZWEI_FAKTOR_PFLICHT) kennt keine Ausnahmen.
//
// Reine Funktionen → node --test.
// ============================================================================

export const GRUND_MIN = 5;
export const GRUND_MAX = 200;
export const MAX_TAGE = 365;

export type AusnahmeZeile = { bis?: string | null; aufgehoben_am?: string | null };

function text(v: unknown): string {
  return (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim();
}

function istDatum(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** YYYY-MM-DD in Berliner Zeit. */
export function heuteBerlin(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
}

function plusTage(iso: string, tage: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Gilt die Ausnahme heute? (nicht aufgehoben, Frist leer oder heute/später) */
export function ausnahmeAktiv(z: AusnahmeZeile | null | undefined, jetzt: Date = new Date()): boolean {
  if (!z || text(z.aufgehoben_am)) return false;
  const bis = text(z.bis).slice(0, 10);
  if (!bis) return true;
  return istDatum(bis) && bis >= heuteBerlin(jetzt);
}

export type AnlegenErgebnis =
  | { ja: true; grund: string; bis: string | null }
  | { ja: false; fehler: string };

/** Darf diese Ausnahme angelegt werden? */
export function ausnahmePruefen(o: {
  rolle: string; aal2: boolean; zielRolle: string | null; zielHatZugang: boolean;
  grund: unknown; bis: unknown;
}, jetzt: Date = new Date()): AnlegenErgebnis {
  if (o.rolle !== 'chef') return { ja: false, fehler: 'Ausnahmen legt nur die Geschäftsleitung fest.' };
  if (!o.aal2) return { ja: false, fehler: 'Zuerst selbst mit Code anmelden.' };
  if (o.zielRolle === null || !o.zielHatZugang) return { ja: false, fehler: 'Dieser Mitarbeiter hat keinen eigenen Zugang in Ihrem Betrieb.' };
  if (o.zielRolle === 'helfer') return { ja: false, fehler: 'Eine Vertretung, die Zwei-Faktor zurücksetzen darf, braucht selbst einen zweiten Faktor — keine Ausnahme möglich.' };
  if (o.zielRolle !== 'mitarbeiter') return { ja: false, fehler: 'Nur Mitarbeiter-Zugänge können ausgenommen werden.' };
  const grund = text(o.grund).slice(0, GRUND_MAX);
  if (grund.length < GRUND_MIN) return { ja: false, fehler: 'Bitte einen Grund angeben (z. B. „kein Diensthandy").' };
  const bisRoh = text(o.bis).slice(0, 10);
  if (!bisRoh) return { ja: true, grund, bis: null };
  if (!istDatum(bisRoh)) return { ja: false, fehler: 'Das Datum „gilt bis" ist ungültig.' };
  const heute = heuteBerlin(jetzt);
  if (bisRoh < heute) return { ja: false, fehler: '„Gilt bis" darf nicht in der Vergangenheit liegen.' };
  if (bisRoh > plusTage(heute, MAX_TAGE)) return { ja: false, fehler: `Höchstens ${MAX_TAGE} Tage im Voraus — danach bitte neu entscheiden.` };
  return { ja: true, grund, bis: bisRoh };
}

/** Kurztext für die Liste. */
export function ausnahmeText(z: { grund?: unknown; bis?: unknown }): string {
  const bis = text(z.bis).slice(0, 10);
  const datum = istDatum(bis) ? `${bis.slice(8, 10)}.${bis.slice(5, 7)}.${bis.slice(0, 4)}` : '';
  return `${text(z.grund)}${datum ? ` · bis ${datum}` : ' · unbefristet'}`;
}
