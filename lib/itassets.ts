// lib/itassets.ts
// L2-4 · Lizenz-, Asset- & SLA-Verwaltung (IT/MSP) — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Drei Bereiche: Assets (Hardware/Software je Kunde, Garantie), Lizenzen
// (Plätze/Seats, Ablauf, Kosten) und SLA (Reaktions-/Wiederherstellzeit,
// Verfügbarkeit). Node-getestet (itassets.test.ts).

export const ASSET_TYP = ['hardware', 'software', 'netzwerk', 'peripherie', 'mobil', 'sonstige'] as const;
export const ASSET_STATUS = ['aktiv', 'lager', 'defekt', 'ausgemustert'] as const;
export const LIZENZ_TYP = ['abo', 'kauf', 'open-source', 'miete'] as const;

function n(x: unknown): number { return Number(x) || 0; }
function r2(x: unknown): number { return Math.round(n(x) * 100) / 100; }

// ---------------------------------------------------------------------------
// Ablauf / Fristen (Garantie, Lizenz, SLA)
// ---------------------------------------------------------------------------
export function tageDiff(zielISO: string | null | undefined, heuteISO: string): number {
  if (!zielISO) return NaN;
  const a = Date.parse(zielISO), b = Date.parse(heuteISO);
  if (isNaN(a) || isNaN(b)) return NaN;
  return Math.round((a - b) / 86400000);
}

export type AblaufStatus = 'kein' | 'abgelaufen' | 'bald' | 'ok';
/** Ablauf-Ampel: 'abgelaufen' (< heute), 'bald' (≤ baldTage), 'ok', 'kein' (kein Datum). */
export function ablaufStatus(datum: string | null | undefined, heuteISO: string, baldTage = 30): AblaufStatus {
  if (!datum) return 'kein';
  const rest = tageDiff(datum, heuteISO);
  if (isNaN(rest)) return 'kein';
  if (rest < 0) return 'abgelaufen';
  if (rest <= baldTage) return 'bald';
  return 'ok';
}

// ---------------------------------------------------------------------------
// Lizenz-Plätze (Seats)
// ---------------------------------------------------------------------------
export function freiePlaetze(plaetze: unknown, belegt: unknown): number {
  return Math.max(Math.floor(n(plaetze)) - Math.floor(n(belegt)), 0);
}
/** Sind mehr Plätze belegt als lizenziert? (Compliance-Risiko / Unterlizenzierung) */
export function istUeberbucht(plaetze: unknown, belegt: unknown): boolean {
  return Math.floor(n(belegt)) > Math.floor(n(plaetze));
}
export function kostenProMonat(kostenJahr: unknown): number { return r2(n(kostenJahr) / 12); }

// ---------------------------------------------------------------------------
// SLA-Einhaltung
// ---------------------------------------------------------------------------
export interface SlaEinhaltung { reaktionOk: boolean; wiederherstellOk: boolean; gesamtOk: boolean; }
/**
 * Prüft, ob Ist-Zeiten die SLA-Ziele einhalten. Fehlt ein Ziel (null), gilt der
 * Teil als eingehalten. Fehlt der Ist-Wert, ist er (noch) nicht verletzt.
 */
export function slaEinhaltung(reaktionZielStd: number | null, wiederherstellZielStd: number | null, reaktionIstStd: number | null, wiederherstellIstStd: number | null): SlaEinhaltung {
  const reaktionOk = reaktionZielStd == null || reaktionIstStd == null || n(reaktionIstStd) <= n(reaktionZielStd);
  const wiederherstellOk = wiederherstellZielStd == null || wiederherstellIstStd == null || n(wiederherstellIstStd) <= n(wiederherstellZielStd);
  return { reaktionOk, wiederherstellOk, gesamtOk: reaktionOk && wiederherstellOk };
}

// ---------------------------------------------------------------------------
// KPI-Zähler (für die Seite + augeItAssets)
// ---------------------------------------------------------------------------
export interface AssetLite { status?: string | null; garantie_bis?: string | null; }
export interface LizenzLite { plaetze?: number | null; belegt?: number | null; ablauf?: string | null; kosten_jahr?: number | null; }
export interface SlaLite { gueltig_bis?: string | null; }

export interface ItKennzahlen {
  assets: number; aktiveAssets: number; ohneGarantie: number;
  lizenzen: number; lizenzenBald: number; lizenzenAbgelaufen: number; ueberbucht: number; kostenJahr: number;
  sla: number; slaBald: number; slaAbgelaufen: number;
  gesamt: number;
}

export function zaehleItAssets(
  assets: AssetLite[], lizenzen: LizenzLite[], sla: SlaLite[], heuteISO: string,
  lizenzBaldTage = 60,
): ItKennzahlen {
  let aktiveAssets = 0, ohneGarantie = 0;
  for (const a of assets || []) {
    if ((a.status ?? 'aktiv') === 'aktiv') aktiveAssets++;
    if (ablaufStatus(a.garantie_bis, heuteISO) === 'abgelaufen') ohneGarantie++;
  }
  let lizenzenBald = 0, lizenzenAbgelaufen = 0, ueberbucht = 0, kostenJahr = 0;
  for (const l of lizenzen || []) {
    const st = ablaufStatus(l.ablauf, heuteISO, lizenzBaldTage);
    if (st === 'abgelaufen') lizenzenAbgelaufen++;
    else if (st === 'bald') lizenzenBald++;
    if (istUeberbucht(l.plaetze, l.belegt)) ueberbucht++;
    kostenJahr += n(l.kosten_jahr);
  }
  let slaBald = 0, slaAbgelaufen = 0;
  for (const s of sla || []) {
    const st = ablaufStatus(s.gueltig_bis, heuteISO, lizenzBaldTage);
    if (st === 'abgelaufen') slaAbgelaufen++;
    else if (st === 'bald') slaBald++;
  }
  const A = (assets || []).length, L = (lizenzen || []).length, S = (sla || []).length;
  return {
    assets: A, aktiveAssets, ohneGarantie,
    lizenzen: L, lizenzenBald, lizenzenAbgelaufen, ueberbucht, kostenJahr: r2(kostenJahr),
    sla: S, slaBald, slaAbgelaufen,
    gesamt: A + L + S,
  };
}
