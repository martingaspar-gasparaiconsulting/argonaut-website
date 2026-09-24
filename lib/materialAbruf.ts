// ============================================================================
// ARGONAUT OS · lib/materialAbruf.ts — Material-Abruf vom Einsatz (Paket PB · B28)
// Reine Logik, node-getestet (tests/einkaufP71.test.mjs).
//
// Der Monteur merkt auf der Baustelle: es fehlt etwas. Statt anzurufen oder
// einen Zettel zu schreiben, tippt er in „Meine Einsätze" auf „Material
// anfordern". Das Büro sieht die Anforderung im Einkauf und setzt den Status:
//   angefordert -> bestellt -> bereit (zum Abholen/liegt im Lager) -> erledigt
//   oder: abgelehnt (mit Grund)
//
// Hier steht nur, was eine gueltige Anforderung ist und in welcher
// Reihenfolge sie auf der Liste des Bueros erscheint.
// ============================================================================

import { leseZahl } from './zahlen';

export type AbrufStatus = 'angefordert' | 'bestellt' | 'bereit' | 'erledigt' | 'abgelehnt';

export const ABRUF_STATUS: Record<AbrufStatus, { label: string; farbe: 'gold' | 'cyan' | 'green' | 'textDim' | 'danger' }> = {
  angefordert: { label: '🆕 Angefordert', farbe: 'gold' },
  bestellt:    { label: '📦 Bestellt', farbe: 'cyan' },
  bereit:      { label: '✅ Liegt bereit', farbe: 'green' },
  erledigt:    { label: '✓ Erledigt', farbe: 'textDim' },
  abgelehnt:   { label: '✕ Abgelehnt', farbe: 'danger' },
};

/** Welche Schritte das Buero von einem Status aus gehen darf. */
export const NAECHSTE: Record<AbrufStatus, AbrufStatus[]> = {
  angefordert: ['bestellt', 'bereit', 'abgelehnt'],
  bestellt:    ['bereit', 'abgelehnt'],
  bereit:      ['erledigt'],
  erledigt:    [],
  abgelehnt:   [],
};

export function istStatus(s: unknown): s is AbrufStatus {
  return typeof s === 'string' && s in ABRUF_STATUS;
}

export type AbrufEingabe = {
  bezeichnung?: unknown;
  menge?: unknown;
  einheit?: unknown;
  benoetigt_bis?: unknown;
  notiz?: unknown;
};

export type AbrufGeprueft =
  | { ok: true; zeile: { bezeichnung: string; menge: number; einheit: string | null; benoetigt_bis: string | null; notiz: string | null } }
  | { ok: false; fehler: string };

/**
 * Prueft eine Anforderung vom Handy.
 * · Bezeichnung Pflicht (2 bis 200 Zeichen)
 * · Menge > 0, deutsche Schreibweise erlaubt ("2,5"); unlesbar -> Fehler, NIE 0
 * · benoetigt_bis optional, YYYY-MM-DD, nicht in der Vergangenheit
 */
export function pruefeAbruf(e: AbrufEingabe, heute: string): AbrufGeprueft {
  const bezeichnung = String(e.bezeichnung ?? '').replace(/\s+/g, ' ').trim();
  if (bezeichnung.length < 2) return { ok: false, fehler: 'Bitte angeben, welches Material gebraucht wird.' };
  if (bezeichnung.length > 200) return { ok: false, fehler: 'Die Bezeichnung ist zu lang (höchstens 200 Zeichen).' };

  const mengeRoh = String(e.menge ?? '').trim();
  const menge = mengeRoh === '' ? null : leseZahl(mengeRoh);
  if (menge === null) return { ok: false, fehler: 'Die Menge ist nicht lesbar — bitte eine Zahl eingeben, z. B. 2 oder 2,5.' };
  if (!(menge > 0)) return { ok: false, fehler: 'Die Menge muss größer als 0 sein.' };
  if (menge > 1_000_000) return { ok: false, fehler: 'Die Menge ist unplausibel groß.' };

  let bis: string | null = null;
  const bisRoh = String(e.benoetigt_bis ?? '').trim();
  if (bisRoh) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bisRoh) || Number.isNaN(Date.parse(bisRoh + 'T00:00:00Z'))) {
      return { ok: false, fehler: 'Das Datum ist nicht lesbar.' };
    }
    if (bisRoh < heute) return { ok: false, fehler: 'Das Datum liegt in der Vergangenheit.' };
    bis = bisRoh;
  }

  const einheit = String(e.einheit ?? '').trim().slice(0, 20) || null;
  const notiz = String(e.notiz ?? '').trim().slice(0, 500) || null;
  return { ok: true, zeile: { bezeichnung, menge: Math.round(menge * 1000) / 1000, einheit, benoetigt_bis: bis, notiz } };
}

export type AbrufLite = { status?: string | null; benoetigt_bis?: string | null; erstellt_am?: string | null };

/**
 * Reihenfolge fuer die Liste im Buero: offene zuerst; darin das frueheste
 * "benoetigt bis" oben, ohne Datum danach, jeweils aelteste Anforderung zuerst.
 */
export function sortiereAbrufe<T extends AbrufLite>(liste: T[]): T[] {
  const offenRang = (s: unknown) => (s === 'angefordert' ? 0 : s === 'bestellt' ? 1 : s === 'bereit' ? 2 : 3);
  return [...(liste ?? [])].sort((a, b) => {
    const r = offenRang(a.status) - offenRang(b.status);
    if (r !== 0) return r;
    const ab = a.benoetigt_bis || '9999-12-31', bb = b.benoetigt_bis || '9999-12-31';
    if (ab !== bb) return ab < bb ? -1 : 1;
    return String(a.erstellt_am ?? '').localeCompare(String(b.erstellt_am ?? ''));
  });
}

/** Zaehler fuer die Kachel im Einkauf. */
export function zaehleAbrufe(liste: AbrufLite[], heute: string): { offen: number; eilig: number } {
  let offen = 0, eilig = 0;
  for (const a of liste ?? []) {
    if (a.status === 'angefordert' || a.status === 'bestellt') {
      offen++;
      if (a.benoetigt_bis && a.benoetigt_bis <= heute) eilig++;
    }
  }
  return { offen, eilig };
}
