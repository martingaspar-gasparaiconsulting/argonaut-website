// lib/schlagkartei.ts
// A5 · Schlagkartei / Dünge- & PSM-Doku — reine Formeln & Logik.
// KEINE Hooks, KEINE Supabase-Aufrufe. Node-getestet (schlagkartei.test.mjs, 13/13).
//
// Rechtliche Fristen (verifiziert 07/2026):
//  · Düngung (DüV §10): Aufzeichnung spätestens 14 Tage nach der Maßnahme.
//  · Pflanzenschutz (ab 01.01.2026): unverzüglich, spätestens 30 Tage.
// Die Ampel prüft, ob ein Eintrag INNERHALB der Frist erfasst wurde
// (Vergleich Maßnahme-Datum ↔ Erfassungszeitpunkt).

export const DUENGE_FRIST_TAGE = 14;
export const PSM_FRIST_TAGE = 30;

export const DUENGER_ART = ['mineralisch', 'organisch'] as const;
export const PSM_VERWENDUNGSART = ['freiland', 'gewaechshaus', 'saatgut'] as const;

const MS_TAG = 86400000;

function tagUTC(v: string | Date): number {
  const s = String(v);
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
  return (y && m && d) ? Date.UTC(y, m - 1, d) : NaN;
}
function r2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }

/** Ganze Tage zwischen zwei Datumsangaben (Datums-Anteil, DST-sicher). */
export function tageDiff(von: string | Date, bis: string | Date): number {
  return Math.round((tagUTC(bis) - tagUTC(von)) / MS_TAG);
}

export type DokuStatus = 'puenktlich' | 'spaet';

/** Wurde eine Maßnahme fristgerecht dokumentiert? (Maßnahme-Datum → Erfassung) */
export function dokuStatus(datumMassnahme: string | Date, erfasstAm: string | Date, fristTage: number): DokuStatus {
  return tageDiff(datumMassnahme, erfasstAm) > fristTage ? 'spaet' : 'puenktlich';
}

/** Verbleibende Tage zur Dokumentation (negativ = überfällig). */
export function fristRest(datumMassnahme: string | Date, fristTage: number, heute: string | Date = new Date()): number {
  return fristTage - tageDiff(datumMassnahme, heute);
}

/** Aufwand je ha × Fläche = Gesamtmenge. */
export function mengeGesamt(proHa: number, flaecheHa: number): number {
  return r2((Number(proHa) || 0) * (Number(flaecheHa) || 0));
}

/** Summe des Gesamt-N (kg N/ha) über eine Liste Düngungen. */
export function summeN(duengungen: { n_gesamt?: number | null }[]): number {
  return r2(duengungen.reduce((s, d) => s + (Number(d.n_gesamt) || 0), 0));
}

/** N-Saldo je ha: Bedarf minus bereits gedüngt. Positiv = Rest, negativ = Überschreitung. */
export function nSaldo(nBedarf: number, nGeduengt: number): number {
  return r2((Number(nBedarf) || 0) - (Number(nGeduengt) || 0));
}

/** Summe der Fläche (ha) über alle aktiven Schläge. */
export function flaecheSumme(schlaege: { flaeche_ha?: number | null; status?: string }[]): number {
  return r2(schlaege.filter((x) => (x.status ?? 'aktiv') === 'aktiv').reduce((a, x) => a + (Number(x.flaeche_ha) || 0), 0));
}

function jahrVon(datum: string | Date): number { return Number(String(datum).slice(0, 4)); }

export interface SchlagKennzahlen {
  anzahlSchlaege: number;
  flaecheGesamt: number;
  duengungenJahr: number;
  psmJahr: number;
  spaetDoku: number;
  schlaegeOhneBedarf: number;
}

/** KPI-Zähler über Schläge + Dokumentation für ein Jahr. */
export function zaehleSchlagkartei(
  schlaege: { id?: string; flaeche_ha?: number | null; status?: string }[],
  bedarfe: { schlag_id?: string; jahr?: number }[],
  duengungen: { schlag_id?: string; datum: string; n_gesamt?: number | null; erstellt_am?: string | null }[],
  psm: { schlag_id?: string; datum: string; erstellt_am?: string | null }[],
  jahr: number,
): SchlagKennzahlen {
  const aktiv = schlaege.filter((s) => (s.status ?? 'aktiv') === 'aktiv');
  const dJahr = duengungen.filter((d) => jahrVon(d.datum) === jahr);
  const pJahr = psm.filter((p) => jahrVon(p.datum) === jahr);
  const spaetDoku =
    duengungen.filter((d) => d.erstellt_am && dokuStatus(d.datum, d.erstellt_am, DUENGE_FRIST_TAGE) === 'spaet').length +
    psm.filter((p) => p.erstellt_am && dokuStatus(p.datum, p.erstellt_am, PSM_FRIST_TAGE) === 'spaet').length;
  const bedarfSet = new Set(bedarfe.filter((b) => b.jahr === jahr).map((b) => b.schlag_id));
  const geduengt = new Set(dJahr.map((d) => d.schlag_id));
  const schlaegeOhneBedarf = [...geduengt].filter((id) => !bedarfSet.has(id)).length;
  return {
    anzahlSchlaege: aktiv.length,
    flaecheGesamt: flaecheSumme(aktiv),
    duengungenJahr: dJahr.length,
    psmJahr: pJahr.length,
    spaetDoku,
    schlaegeOhneBedarf,
  };
}
