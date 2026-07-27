// lib/tierbestand.ts
// A6 · Tierbestand / HIT-Meldung — reine Formeln & Logik.
// KEINE Hooks, KEINE Supabase-Aufrufe. Node-getestet (tierbestand.test.mjs, 10/10).
//
// HIT-Meldefristen (verifiziert 07/2026): Bewegungen (Geburt, Zugang, Abgang, Tod,
// Schlachtung, Ein-/Ausfuhr) sind binnen 7 Tagen an HIT zu melden. Schaf/Ziege
// zusätzlich jährliche Stichtagsmeldung zum 01.01.

export const MELDEFRIST_TAGE_STD = 7;

export const TIERARTEN = ['rind', 'schwein', 'schaf', 'ziege', 'pferd', 'gefluegel', 'sonstige'] as const;
export type Tierart = typeof TIERARTEN[number];

export const BEWEGUNG_ARTEN = ['geburt', 'zugang', 'einfuhr', 'abgang', 'tod', 'schlachtung', 'ausfuhr'] as const;
export type BewegungArt = typeof BEWEGUNG_ARTEN[number];

/** Arten, die den Bestand ERHÖHEN. Alle übrigen verringern ihn. */
const MEHR: readonly string[] = ['geburt', 'zugang', 'einfuhr'];

const MS_TAG = 86400000;

function tagUTC(v: string | Date): number {
  const s = String(v);
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
  return (y && m && d) ? Date.UTC(y, m - 1, d) : NaN;
}

/** Ganze Tage zwischen zwei Datumsangaben (Datums-Anteil, DST-sicher). */
export function tageDiff(von: string | Date, bis: string | Date): number {
  return Math.round((tagUTC(bis) - tagUTC(von)) / MS_TAG);
}

export type MeldeStatus = 'offen' | 'ueberfaellig' | 'gemeldet' | 'spaet';

/** Meldestatus einer Bewegung: offen/überfällig (noch nicht gemeldet) bzw.
 *  gemeldet/spät (nach Fristablauf gemeldet). */
export function meldeStatus(
  datum: string | Date, gemeldet: boolean, gemeldetAm: string | Date | null | undefined,
  frist: number = MELDEFRIST_TAGE_STD, heute: string | Date = new Date(),
): MeldeStatus {
  if (gemeldet) {
    if (gemeldetAm && tageDiff(datum, gemeldetAm) > frist) return 'spaet';
    return 'gemeldet';
  }
  return tageDiff(datum, heute) > frist ? 'ueberfaellig' : 'offen';
}

/** Verbleibende Tage bis zur Meldefrist (negativ = überfällig). */
export function fristRest(datum: string | Date, frist: number = MELDEFRIST_TAGE_STD, heute: string | Date = new Date()): number {
  return frist - tageDiff(datum, heute);
}

/** Erhöht diese Bewegungsart den Bestand? */
export function istZugang(art: string): boolean {
  return MEHR.includes(art);
}

/** Netto-Saldo aus einer Liste Bewegungen (Zugänge − Abgänge). */
export function bewegungSaldo(bewegungen: { art: string; anzahl?: number | null }[]): number {
  return bewegungen.reduce((s, b) => s + (istZugang(b.art) ? 1 : -1) * (Number(b.anzahl) || 0), 0);
}

export interface TierKennzahlen {
  anzahlGruppen: number;
  tiereGesamt: number;
  offeneMeldungen: number;
  ueberfaellig: number;
}

/** KPI-Zähler über Bestände + Bewegungen (Meldefrist je Gruppe). */
export function zaehleTierbestand(
  gruppen: { id?: string; status?: string; aktueller_bestand?: number | null; meldefrist_tage?: number | null }[],
  bewegungen: { gruppe_id?: string; datum: string; gemeldet?: boolean }[],
  heute: string | Date = new Date(),
): TierKennzahlen {
  const aktiv = gruppen.filter((g) => (g.status ?? 'aktiv') === 'aktiv');
  const fristVon = (gid?: string) => {
    const g = gruppen.find((x) => x.id === gid);
    return g?.meldefrist_tage ?? MELDEFRIST_TAGE_STD;
  };
  const offen = bewegungen.filter((b) => !b.gemeldet);
  const ueberfaellig = offen.filter((b) => tageDiff(b.datum, heute) > fristVon(b.gruppe_id)).length;
  return {
    anzahlGruppen: aktiv.length,
    tiereGesamt: aktiv.reduce((s, g) => s + (Number(g.aktueller_bestand) || 0), 0),
    offeneMeldungen: offen.length,
    ueberfaellig,
  };
}
