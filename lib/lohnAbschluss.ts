// ============================================================================
// ARGONAUT OS · lib/lohnAbschluss.ts — LK5 Teil 2 (16.10.2026)
// Freigabe der Lohnvorbereitung je Mitarbeiter und Monat. Nach der Freigabe
// sperrt die Datenbank (SQL p395) Zeiten und Ausfallstunden dieses Monats.
// Aufheben nur mit Grund (bleibt als Storno sichtbar). Reine Logik.
// ============================================================================

import type { MonatsZeile } from './lohnvorbereitung';

export type Abschluss = { id: string; mitarbeiter_id: string; monat: string; freigegeben_am: string; freigegeben_name: string | null; storniert_am: string | null; storno_grund: string | null };

export function aktiverAbschluss(rows: Abschluss[], mitarbeiterId: string, monat: string): Abschluss | null {
  return (rows ?? []).find((a) => a.mitarbeiter_id === mitarbeiterId && a.monat === monat && !a.storniert_am) ?? null;
}

export function stornos(rows: Abschluss[], mitarbeiterId: string, monat: string): Abschluss[] {
  return (rows ?? []).filter((a) => a.mitarbeiter_id === mitarbeiterId && a.monat === monat && !!a.storniert_am)
    .sort((a, b) => String(a.storniert_am).localeCompare(String(b.storniert_am)));
}

/** Freigabe möglich? Offene Schichten blockieren nicht hart, aber verlangen eine Bestätigung. */
export function freigabePruefen(z: MonatsZeile, monat: string, heute: string): { erlaubt: boolean; fehler: string | null; warnung: string | null } {
  if (!/^\d{4}-\d{2}$/.test(monat)) return { erlaubt: false, fehler: 'Monat ungültig.', warnung: null };
  if (`${monat}-01` > heute) return { erlaubt: false, fehler: 'Ein Monat in der Zukunft kann nicht freigegeben werden.', warnung: null };
  const offen = z.hinweise.find((h) => /ohne „Gehen"|unplausibel/.test(h));
  return { erlaubt: true, fehler: null, warnung: offen ? `${z.name}: ${offen}. Trotzdem freigeben? Danach sind die Zeiten dieses Monats gesperrt.` : null };
}

export function pruefeStornoGrund(g: unknown): string | null {
  const t = typeof g === 'string' ? g.trim() : '';
  return t.length >= 10 ? null : 'Bitte einen Grund mit mindestens 10 Zeichen angeben (bleibt sichtbar).';
}

/** Was beim Abschluss festgehalten wird (Stand der Werte zum Freigabezeitpunkt). */
export function werteStand(z: MonatsZeile): Record<string, unknown> {
  return {
    ist_min: z.fenster.gesamt, soll_min: z.sollMin, mehr_min: z.mehrMin, nacht_min: z.fenster.nacht, nacht_tief_min: z.fenster.nachtTief,
    sonntag_min: z.fenster.sonntag, feiertag_min: z.fenster.feiertag, feiertag_hoch_min: z.fenster.feiertagHoch,
    urlaub_tage: z.urlaubTage, krank_tage: z.krankTage, spesen: z.spesen,
    ausfall_schlechtwetter_min: z.ausfall.schlechtwetter, ausfall_arbeitsmangel_min: z.ausfall.arbeitsmangel, hinweise: z.hinweise,
  };
}
