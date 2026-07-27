// ============================================================================
// ARGONAUT OS · lib/assets.ts — Objekt-/Asset-Register-Formeln (Baustein 2)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks. Baut das generische
// Register auf der Baumkataster-Blaupause auf: Zustand-Ampel + Kontroll-
// Fälligkeit (nächste Kontrolle = letzte + Intervall) + Objekt-Alter.
//
// Datums-Helfer werden aus lib/wiederkehr wiederverwendet (eine Quelle).
// ============================================================================

import { datumPlusMonate, datumPlusTage } from '@/lib/wiederkehr';

export type Zustand = 'gut' | 'beobachten' | 'kritisch';

export interface AssetBasis {
  zustand?: string | null;
  kontrollintervall_monate?: number | null;
  letzte_kontrolle?: string | null;   // "YYYY-MM-DD"
  naechste_kontrolle?: string | null; // "YYYY-MM-DD"
  anschaffungsdatum?: string | null;  // "YYYY-MM-DD"
  archiviert?: boolean | null;
}

export const ZUSTAND_LABEL: Record<Zustand, string> = {
  gut: '🟢 Gut',
  beobachten: '🟠 Beobachten',
  kritisch: '🔴 Kritisch',
};

/** Zustand robust normalisieren (Default 'gut'). */
export function normZustand(z?: string | null): Zustand {
  return z === 'kritisch' || z === 'beobachten' ? z : 'gut';
}

/** Ampel-Stufe des Zustands — die UI mappt sie auf ihre Palette. */
export function zustandStufe(z?: string | null): 'gruen' | 'gelb' | 'rot' {
  const n = normZustand(z);
  return n === 'kritisch' ? 'rot' : n === 'beobachten' ? 'gelb' : 'gruen';
}

/**
 * Nächste Kontrolle = letzte Kontrolle + Intervall (Monate).
 * Ohne letzte Kontrolle oder ohne Intervall gibt es kein Datum.
 */
export function naechsteKontrolleBerechnen(letzte?: string | null, intervallMonate?: number | null): string | null {
  if (!letzte) return null;
  const iv = Number(intervallMonate);
  if (!(iv > 0)) return null;
  return datumPlusMonate(letzte.slice(0, 10), iv);
}

export type KontrollBucket = 'faellig' | 'bald' | 'ok' | 'kein';

/**
 * Fälligkeit der Kontrolle relativ zu heute.
 * faellig = heute/überfällig · bald = in <= baldTage · ok = später · kein = kein Datum.
 * Standard-Vorwarnfenster 30 Tage (wie im Baumkataster).
 */
export function kontrollBucket(a: AssetBasis, heuteIso: string, baldTage = 30): KontrollBucket {
  if (!a.naechste_kontrolle) return 'kein';
  const n = a.naechste_kontrolle.slice(0, 10);
  const heute = heuteIso.slice(0, 10);
  if (n <= heute) return 'faellig';
  if (n <= datumPlusTage(heute, baldTage)) return 'bald';
  return 'ok';
}

/** Objekt-Alter in vollen Jahren seit Anschaffung (oder null). */
export function alterInJahren(anschaffungsdatum?: string | null, heuteIso?: string): number | null {
  if (!anschaffungsdatum || !heuteIso) return null;
  const a = anschaffungsdatum.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  const h = heuteIso.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  if (a.length !== 3 || h.length !== 3 || !a[0] || !h[0]) return null;
  let jahre = h[0] - a[0];
  if (h[1] < a[1] || (h[1] === a[1] && h[2] < a[2])) jahre--;
  return jahre < 0 ? 0 : jahre;
}

/** Register-Kennzahlen über eine Objektliste (archivierte zählen nicht mit). */
export function zaehleRegister(
  list: AssetBasis[],
  heuteIso: string,
  baldTage = 30,
): { gesamt: number; faellig: number; bald: number; kritisch: number; beobachten: number; gut: number } {
  const s = { gesamt: 0, faellig: 0, bald: 0, kritisch: 0, beobachten: 0, gut: 0 };
  for (const a of list) {
    if (a.archiviert) continue;
    s.gesamt++;
    const b = kontrollBucket(a, heuteIso, baldTage);
    if (b === 'faellig') s.faellig++;
    else if (b === 'bald') s.bald++;
    const z = normZustand(a.zustand);
    if (z === 'kritisch') s.kritisch++;
    else if (z === 'beobachten') s.beobachten++;
    else s.gut++;
  }
  return s;
}

// ============================================================================
// BLOCK I · Objekt-Typen mit Standard-Prüffristen (Reichweiten-Hebel).
// Wählt der Nutzer einen Typ, wird das passende Kontrollintervall vorbelegt.
//
// Fristen web-verifiziert (27.07.2026) — es sind ANPASSBARE Standardwerte,
// da viele Prüffristen gefährdungs-/betriebsabhängig sind:
//  - Feuerlöscher: alle 2 Jahre (24 Mon.), DIN 14406-4.
//  - Aufzug: BetrSichV Haupt-/Zwischenprüfung im jährlichen Wechsel (≈ 12 Mon.).
//  - Elektro ortsfest: DGUV V3 Richtwert 4 Jahre; ortsveränderlich gefährdungs-
//    abhängig (Richtwert). Hier als praxisnahe Wartungs-Kadenz 12 Mon. gesetzt.
// ============================================================================

export interface ObjektTyp {
  key: string;
  label: string;
  icon: string;
  kontrollintervallMonate: number;
  hinweis: string;
}

export const OBJEKT_TYPEN: ObjektTyp[] = [
  { key: 'maschine',      label: 'Maschine',              icon: '⚙️', kontrollintervallMonate: 12, hinweis: 'Arbeitsmittel-Prüfung i. d. R. jährlich (BetrSichV/UVV).' },
  { key: 'fahrzeug',      label: 'Fahrzeug',              icon: '🚗', kontrollintervallMonate: 12, hinweis: 'UVV-Fahrzeugprüfung jährlich; HU je nach Fahrzeugart 12–24 Mon.' },
  { key: 'pv',            label: 'Anlage / PV',           icon: '☀️', kontrollintervallMonate: 12, hinweis: 'Wartung meist jährlich; DGUV V3 ortsfest Richtwert 4 Jahre.' },
  { key: 'aufzug',        label: 'Aufzug',                icon: '🛗', kontrollintervallMonate: 12, hinweis: 'BetrSichV: Haupt-/Zwischenprüfung im Wechsel — effektiv jährlich.' },
  { key: 'werkzeug',      label: 'Werkzeug / Gerät',      icon: '🔌', kontrollintervallMonate: 12, hinweis: 'Ortsveränderliche elektr. Betriebsmittel DGUV V3, gefährdungsabhängig.' },
  { key: 'klima',         label: 'Klima / Kälte',         icon: '❄️', kontrollintervallMonate: 12, hinweis: 'F-Gas-Dichtheitsprüfung je nach CO₂-Äquivalent (mind. jährlich).' },
  { key: 'immobilie',     label: 'Immobilie / Einheit',   icon: '🏠', kontrollintervallMonate: 12, hinweis: 'Kein einheitliches Intervall — je nach Gewerk (Heizung, Rauchmelder …).' },
  { key: 'baum',          label: 'Baum',                  icon: '🌳', kontrollintervallMonate: 12, hinweis: 'FLL-Baumkontrolle regelmäßig (1–2×/Jahr).' },
  { key: 'feuerloescher', label: 'Feuerlöscher',          icon: '🧯', kontrollintervallMonate: 24, hinweis: 'Prüfung alle 2 Jahre (DIN 14406-4).' },
  { key: 'sonstiges',     label: 'Sonstiges',             icon: '📦', kontrollintervallMonate: 12, hinweis: 'Individuelles Intervall setzen.' },
];

export function objektTyp(key: string): ObjektTyp | undefined {
  return OBJEKT_TYPEN.find((t) => t.key === key);
}
export function objektTypByLabel(label: string): ObjektTyp | undefined {
  return OBJEKT_TYPEN.find((t) => t.label === label);
}
