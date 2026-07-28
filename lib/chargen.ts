// lib/chargen.ts
// L2-3 · Serien-/Chargen- & Prüfplan-Tiefe (Industrie) — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Zwei Säulen:
//   (A) Rückverfolgbarkeit (ISO 9001:2015, 8.5.2) — one up / one down: je Charge
//       Eingänge (Rohstoff-/Lieferanten-Chargen) und Ausgänge (Aufträge/Lieferungen).
//   (B) Prüfplan — Merkmale mit Sollwert ± Toleranz, Istwert → io/nio, Gesamtergebnis.
// Node-getestet (chargen.test.ts).

export const CHARGE_STATUS = ['freigegeben', 'quarantaene', 'gesperrt', 'verbraucht'] as const;
export type ChargeStatus = (typeof CHARGE_STATUS)[number];

export const CHARGE_TYP = ['charge', 'serie'] as const;
export const PRUEF_ART = ['wareneingang', 'zwischen', 'endpruefung'] as const;
export const VERWENDUNG_RICHTUNG = ['eingang', 'ausgang'] as const;

export type MerkmalStatus = 'io' | 'nio' | 'na';
export type Ergebnis = 'io' | 'nio' | 'offen';

function n(x: unknown): number { return Number(x) || 0; }
function r2(x: unknown): number { return Math.round(n(x) * 100) / 100; }

// ---------------------------------------------------------------------------
// Prüfmerkmal: Sollwert ± Toleranz vs. Istwert
// ---------------------------------------------------------------------------
export interface MerkmalLite {
  sollwert?: number | null;
  toleranz_minus?: number | null;
  toleranz_plus?: number | null;
  istwert?: number | null;
}

/**
 * Bewertet ein Merkmal: 'io' im Toleranzband [soll−|tol−|, soll+|tol+|],
 * 'nio' außerhalb, 'na' wenn Ist- oder Sollwert fehlt.
 */
export function merkmalStatus(m: MerkmalLite): MerkmalStatus {
  if (m.istwert == null || m.sollwert == null) return 'na';
  const s = n(m.sollwert);
  const lo = s - Math.abs(n(m.toleranz_minus));
  const hi = s + Math.abs(n(m.toleranz_plus));
  const i = n(m.istwert);
  const EPS = 1e-9;
  return i >= lo - EPS && i <= hi + EPS ? 'io' : 'nio';
}

/** Gesamtergebnis einer Prüfung: 'nio' wenn ein Merkmal nio; 'io' wenn alle io; sonst 'offen'. */
export function gesamtErgebnis(merkmale: MerkmalLite[]): Ergebnis {
  const st = (merkmale || []).map(merkmalStatus);
  if (st.some((x) => x === 'nio')) return 'nio';
  if (st.length > 0 && st.every((x) => x === 'io')) return 'io';
  return 'offen';
}

export function ioAnzahl(merkmale: MerkmalLite[]): number { return (merkmale || []).filter((m) => merkmalStatus(m) === 'io').length; }
export function nioAnzahl(merkmale: MerkmalLite[]): number { return (merkmale || []).filter((m) => merkmalStatus(m) === 'nio').length; }

// ---------------------------------------------------------------------------
// MHD / Restlaufzeit
// ---------------------------------------------------------------------------
export function tageDiff(zielISO: string | null | undefined, heuteISO: string): number {
  if (!zielISO) return NaN;
  const a = Date.parse(zielISO), b = Date.parse(heuteISO);
  if (isNaN(a) || isNaN(b)) return NaN;
  return Math.round((a - b) / 86400000);
}

export type MhdStatus = 'kein' | 'abgelaufen' | 'bald' | 'ok';
/** MHD-Ampel: 'abgelaufen' (< heute), 'bald' (≤ 30 Tage), 'ok', 'kein' (kein MHD). */
export function mhdStatus(mhd: string | null | undefined, heuteISO: string, baldTage = 30): MhdStatus {
  if (!mhd) return 'kein';
  const rest = tageDiff(mhd, heuteISO);
  if (isNaN(rest)) return 'kein';
  if (rest < 0) return 'abgelaufen';
  if (rest <= baldTage) return 'bald';
  return 'ok';
}

// ---------------------------------------------------------------------------
// Mengen / Verwendung (Rückverfolgbarkeit)
// ---------------------------------------------------------------------------
export interface VerwendungLite { los_id?: string; richtung?: string | null; menge?: number | null; }

/** Ausgegebene Menge einer Charge (Summe der Ausgänge). */
export function ausgangMenge(verwendungen: VerwendungLite[]): number {
  return r2((verwendungen || []).filter((v) => (v.richtung ?? 'ausgang') === 'ausgang').reduce((s, v) => s + n(v.menge), 0));
}

/** Noch verfügbare Menge = Chargenmenge − Ausgänge (>= 0). */
export function offeneMenge(chargeMenge: unknown, verwendungen: VerwendungLite[]): number {
  return r2(Math.max(n(chargeMenge) - ausgangMenge(verwendungen), 0));
}

// ---------------------------------------------------------------------------
// KPI-Zähler (für die Seite + augeChargen)
// ---------------------------------------------------------------------------
export interface LosLite { id: string; status?: string | null; mhd?: string | null; }
export interface PruefungLite { id: string; los_id: string; }

export interface ChargenKennzahlen {
  gesamt: number;
  gesperrt: number;     // Status gesperrt oder quarantaene
  abgelaufen: number;   // MHD überschritten
  bald: number;         // MHD ≤ 30 Tage
  ungeprueft: number;   // keine Prüfung erfasst (und nicht verbraucht)
  nio: number;          // Charge mit mind. einer nicht bestandenen Prüfung
}

/**
 * Zählt Chargen + prüft Sperren, MHD und Prüfstatus.
 * `merkmaleByPruefung` ordnet jeder Prüfungs-ID ihre Merkmale zu.
 */
export function zaehleChargen(
  los: LosLite[],
  pruefungen: PruefungLite[],
  merkmaleByPruefung: Record<string, MerkmalLite[]>,
  heuteISO: string,
): ChargenKennzahlen {
  const pruefByLos = new Map<string, PruefungLite[]>();
  for (const p of pruefungen || []) {
    if (!pruefByLos.has(p.los_id)) pruefByLos.set(p.los_id, []);
    pruefByLos.get(p.los_id)!.push(p);
  }
  let gesperrt = 0, abgelaufen = 0, bald = 0, ungeprueft = 0, nio = 0;
  for (const l of los || []) {
    const st = l.status ?? 'freigegeben';
    if (st === 'gesperrt' || st === 'quarantaene') gesperrt++;
    const ms = mhdStatus(l.mhd, heuteISO);
    if (ms === 'abgelaufen') abgelaufen++;
    else if (ms === 'bald') bald++;
    const pr = pruefByLos.get(l.id) ?? [];
    if (pr.length === 0) {
      if (st !== 'verbraucht') ungeprueft++;
    } else if (pr.some((p) => gesamtErgebnis(merkmaleByPruefung[p.id] ?? []) === 'nio')) {
      nio++;
    }
  }
  return { gesamt: (los || []).length, gesperrt, abgelaufen, bald, ungeprueft, nio };
}
