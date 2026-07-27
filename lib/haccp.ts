// ============================================================================
// ARGONAUT OS · lib/haccp.ts — Chargen/HACCP-Formeln (Baustein 5)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks. MHD-Ampel,
// Kontroll-Fälligkeit aus dem HACCP-Kontrollplan (Intervall) und eine
// Sollwert-Bewertung (Grenzwert gegen Messwert). Datums-Helfer aus lib/wiederkehr.
// HINWEIS: Dokumentations-Hilfe — ersetzt keine amtliche HACCP-Beratung.
// ============================================================================

import { datumPlusTage } from '@/lib/wiederkehr';

export type ChargeStatus = 'aktiv' | 'gesperrt' | 'verbraucht';

export interface ChargeBasis { mhd?: string | null; status?: string | null; }
export interface HaccpPlanBasis { intervall_tage?: number | null; letzte_kontrolle?: string | null; aktiv?: boolean | null; }

// --- MHD-Ampel --------------------------------------------------------------

/** Resttage bis MHD (negativ = abgelaufen), oder null ohne MHD. */
export function mhdRestTage(mhd?: string | null, heuteIso?: string): number | null {
  if (!mhd || !heuteIso) return null;
  const m = new Date(mhd.slice(0, 10) + 'T00:00:00').getTime();
  const h = new Date(heuteIso.slice(0, 10) + 'T00:00:00').getTime();
  if (isNaN(m) || isNaN(h)) return null;
  return Math.ceil((m - h) / 86400000);
}

export type MhdBucket = 'abgelaufen' | 'bald' | 'ok' | 'kein';

/** MHD-Einordnung: abgelaufen · bald (<= warnTage) · ok · kein (ohne MHD). */
export function mhdBucket(mhd?: string | null, heuteIso?: string, warnTage = 3): MhdBucket {
  const t = mhdRestTage(mhd, heuteIso);
  if (t == null) return 'kein';
  if (t < 0) return 'abgelaufen';
  if (t <= warnTage) return 'bald';
  return 'ok';
}

// --- HACCP-Kontrollplan: Fälligkeit ----------------------------------------

/** Nächste fällige Kontrolle = letzte Kontrolle + Intervall (Tage). */
export function naechsteKontrolle(letzte?: string | null, intervallTage?: number | null): string | null {
  if (!letzte) return null;
  const iv = Number(intervallTage);
  if (!(iv > 0)) return null;
  return datumPlusTage(letzte.slice(0, 10), iv);
}

/** Ist die Kontrolle fällig? Nie kontrolliert = fällig; sonst nächste <= heute. */
export function kontrolleFaellig(p: HaccpPlanBasis, heuteIso: string): boolean {
  if (p.aktiv === false) return false;
  if (!p.letzte_kontrolle) return true;
  const n = naechsteKontrolle(p.letzte_kontrolle, p.intervall_tage);
  if (!n) return true;
  return n.slice(0, 10) <= heuteIso.slice(0, 10);
}

// --- Sollwert-Bewertung -----------------------------------------------------

/** Zerlegt einen Grenzwert wie "<= 7 °C" in Operator + Zahl (Default-Operator <=). */
export function parseGrenze(sollwert?: string | null): { op: string; wert: number } | null {
  if (!sollwert) return null;
  const m = String(sollwert).replace(',', '.').match(/(<=|>=|<|>|=)?\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { op: m[1] || '<=', wert: parseFloat(m[2]) };
}

/** Zieht die erste Zahl aus einem Text (z. B. "4 °C" -> 4). */
export function parseZahl(text?: string | null): number | null {
  if (text == null) return null;
  const m = String(text).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * Bewertet einen Messwert gegen den Sollwert. Gibt true/false zurück, oder
 * null wenn nicht auswertbar (dann greift die manuelle „i. O."-Markierung).
 */
export function bewerteMesswert(sollwert?: string | null, messwert?: string | null): boolean | null {
  const g = parseGrenze(sollwert);
  const w = parseZahl(messwert);
  if (!g || w == null) return null;
  switch (g.op) {
    case '<=': return w <= g.wert;
    case '<': return w < g.wert;
    case '>=': return w >= g.wert;
    case '>': return w > g.wert;
    case '=': return w === g.wert;
    default: return null;
  }
}

// --- Aggregation ------------------------------------------------------------

export function zaehleChargen(chargen: ChargeBasis[], heuteIso: string, warnTage = 3): { gesamt: number; abgelaufen: number; bald: number; gesperrt: number } {
  const s = { gesamt: 0, abgelaufen: 0, bald: 0, gesperrt: 0 };
  for (const c of chargen) {
    if (c.status === 'verbraucht') continue;
    s.gesamt++;
    if (c.status === 'gesperrt') s.gesperrt++;
    const b = mhdBucket(c.mhd, heuteIso, warnTage);
    if (b === 'abgelaufen') s.abgelaufen++;
    else if (b === 'bald') s.bald++;
  }
  return s;
}

export function zaehleKontrollen(plaene: HaccpPlanBasis[], heuteIso: string): { gesamt: number; faellig: number } {
  let gesamt = 0, faellig = 0;
  for (const p of plaene) {
    if (p.aktiv === false) continue;
    gesamt++;
    if (kontrolleFaellig(p, heuteIso)) faellig++;
  }
  return { gesamt, faellig };
}
