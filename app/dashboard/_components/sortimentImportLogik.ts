// ============================================================================
// ARGONAUT OS · sortimentImportLogik.ts
// Block 1 · I-2 — Preisliste als Datei einlesen
//
// Reine Funktionen. Kein DB-Zugriff, kein React.
//
// DER DENKFEHLER, DEN DIESE DATEI VERMEIDET
//   Man kann keinen Preis importieren, ohne dass die Variante existiert.
//   `holz_preise.sortiment_id` verweist auf `holz_sortiment`. Steht in der
//   Excel-Datei "Eiche, 25 cm, kammergetrocknet, 140 €/SRM" und diese Variante
//   gibt es noch nicht — worauf soll der Preis zeigen?
//
//   Deshalb: EINE ZEILE = EINE VARIANTE MIT IHREN PREISEN.
//   Der Import legt beides in einem Zug an. Genau so, wie ein Betrieb denkt.
//
// ZWEI FALLEN, DIE csvLogik NICHT KENNT
//
//   1. DEUTSCHE ZAHLEN. Excel schreibt "95,50", nicht "95.50".
//      Number("95,50") ergibt NaN — und der Preis wäre still null.
//      Ein Preis, der zu 0 wird, ist der teuerste Importfehler überhaupt.
//
//   2. FREITEXT STATT SCHLÜSSEL. Der Betrieb schreibt "Buche", nicht "buche".
//      Er schreibt "lufttrocken", "luftgetrocknet" oder einfach "trocken".
//      Und "33 cm" statt "33".
//
// WAS HIER NICHT PASSIERT: Raten. Was nicht erkannt wird, ist ein Fehler in
// der Zeile — nicht ein stiller Standardwert.
// ============================================================================

import { HOLZARTEN, SCHEITLAENGEN, type HolzartSchluessel, type HolzEinheit } from './holzLogik';
import {
  TROCKNUNGSGRADE, BRENNFERTIG_GRENZE_PROZENT, istBrennfertig, restfeuchtePasst,
  trocknungsgradAusRestfeuchte, trocknungsgradName,
  type Trocknungsgrad,
} from './sortimentLogik';
import { STANDARD_STEUERSATZ_BRENNHOLZ } from './preisLogik';

// ----------------------------------------------------------------------------
// 1. DEUTSCHE ZAHLEN
// ----------------------------------------------------------------------------

/**
 * Liest "95,50", "1.234,56", "95.50", "1,234.56" und " 95 € ".
 *
 * Die Regel: Steht ein Komma HINTER dem letzten Punkt, ist das Komma das
 * Dezimaltrennzeichen (deutsch). Sonst der Punkt (englisch). Bei nur einem
 * Trennzeichen entscheidet die Anzahl der Nachkommastellen — drei Stellen
 * sprechen für Tausender.
 *
 * "1.234"  -> 1234   (Tausenderpunkt, keine Nachkommastellen)
 * "1.234,5"-> 1234.5
 * "95,5"   -> 95.5
 * "95.5"   -> 95.5
 */
export function deutscheZahl(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  let t = String(text).trim();
  if (!t) return null;

  // Währung, Leerzeichen, geschützte Leerzeichen weg
  t = t.replace(/[€\s\u00a0]/g, '');
  if (!t) return null;

  const negativ = t.startsWith('-');
  if (negativ) t = t.slice(1);

  if (!/^[\d.,]+$/.test(t)) return null;

  const letzterPunkt = t.lastIndexOf('.');
  const letztesKomma = t.lastIndexOf(',');

  let normalisiert: string;

  if (letzterPunkt >= 0 && letztesKomma >= 0) {
    // Beide vorhanden: das hintere ist das Dezimaltrennzeichen.
    if (letztesKomma > letzterPunkt) {
      normalisiert = t.replace(/\./g, '').replace(',', '.');
    } else {
      normalisiert = t.replace(/,/g, '');
    }
  } else if (letztesKomma >= 0) {
    normalisiert = t.replace(',', '.');
  } else if (letzterPunkt >= 0) {
    // Nur ein Punkt: drei Nachkommastellen -> Tausenderpunkt.
    const nach = t.length - letzterPunkt - 1;
    normalisiert = nach === 3 && t.indexOf('.') === letzterPunkt ? t.replace('.', '') : t;
  } else {
    normalisiert = t;
  }

  const n = Number(normalisiert);
  if (!Number.isFinite(n)) return null;
  return negativ ? -n : n;
}

// ----------------------------------------------------------------------------
// 2. FREITEXT ERKENNEN
// ----------------------------------------------------------------------------

function schluessel(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

/** "Buche", "buche", "BUCHE", "Rotbuche" -> 'buche' */
export function erkenneHolzart(text: string | null | undefined): HolzartSchluessel | null {
  if (!text) return null;
  const k = schluessel(text);
  if (!k) return null;

  const direkt = HOLZARTEN.find((h) => h.schluessel === k);
  if (direkt) return direkt.schluessel;

  // "Rotbuche" enthält "buche", "Weißtanne" nicht "tanne" als eigene Art.
  const enthalten = HOLZARTEN.find((h) => k.includes(h.schluessel));
  if (enthalten) return enthalten.schluessel;

  // Häufige Sammelbegriffe
  if (k.includes('misch') || k.includes('hart') || k.includes('brenn')) return 'mischholz';
  return null;
}

const TROCKNUNG_SYNONYME: Record<Trocknungsgrad, string[]> = {
  frisch: ['frisch', 'waldfrisch', 'ungetrocknet', 'nass', 'grun'],
  lufttrocken: ['lufttrocken', 'luftgetrocknet', 'trocken', 'abgelagert', 'ofenfertig', 'kaminfertig'],
  kammergetrocknet: ['kammergetrocknet', 'kammertrocken', 'technischgetrocknet', 'kd', 'ofengetrocknet'],
};

/** "lufttrocken", "luftgetrocknet", "trocken" -> 'lufttrocken' */
export function erkenneTrocknung(text: string | null | undefined): Trocknungsgrad | null {
  if (!text) return null;
  const k = schluessel(text);
  if (!k) return null;

  // Erst exakt — sonst schluckt "trocken" das "kammergetrocknet".
  for (const [grad, worte] of Object.entries(TROCKNUNG_SYNONYME) as Array<[Trocknungsgrad, string[]]>) {
    if (worte.includes(k)) return grad;
  }
  // Dann "enthält", aber die spezifischsten zuerst.
  const reihenfolge: Trocknungsgrad[] = ['kammergetrocknet', 'lufttrocken', 'frisch'];
  for (const grad of reihenfolge) {
    if (TROCKNUNG_SYNONYME[grad].some((w) => w.length >= 5 && k.includes(w))) return grad;
  }
  return null;
}

/** "33", "33 cm", "33cm", "0,33 m" -> 33 */
export function erkenneLaenge(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = String(text).toLowerCase().trim();

  // Meter-Angabe? "1 m" oder "0,33 m"
  if (/\bm\b/.test(t) && !/cm/.test(t)) {
    const m = deutscheZahl(t.replace(/[^\d.,]/g, ''));
    if (m !== null && m > 0 && m <= 3) return Math.round(m * 100);
  }

  const n = deutscheZahl(t.replace(/[^\d.,]/g, ''));
  if (n === null || n <= 0) return null;
  return Math.round(n);
}

// ----------------------------------------------------------------------------
// 3. EINE ZEILE
// ----------------------------------------------------------------------------

export type PreisSpalte = `preis_${HolzEinheit}`;

export type SortimentZielFeld =
  | 'holzart' | 'scheitlaenge' | 'trocknungsgrad' | 'restfeuchte'
  | PreisSpalte | 'steuersatz' | 'notiz' | 'ignorieren';

export interface SortimentZeile {
  nr: number;
  roh: string[];

  holzart: HolzartSchluessel | null;
  scheitlaenge_cm: number | null;
  trocknungsgrad: Trocknungsgrad | null;
  restfeuchte_prozent: number | null;
  steuersatz_prozent: number;
  notiz: string | null;

  /** Nur Einheiten mit einem Preis größer 0. */
  preise: Array<{ einheit: HolzEinheit; preis_netto: number }>;

  fehler: string[];
  hinweise: string[];
  /** Doppelt innerhalb der Datei? Dann die Zeilennummer der ersten. */
  doppeltZu: number | null;
  uebernehmen: boolean;
}

const EINHEITEN_FELD: Record<PreisSpalte, HolzEinheit> = {
  preis_srm: 'srm', preis_rm: 'rm', preis_fm: 'fm', preis_m3: 'm3',
};

/**
 * Verwandelt eine CSV-Zeile in eine geprüfte Variante mit Preisen.
 *
 * Streng bei dem, was das System nicht raten darf:
 *   - Ohne Holzart, Länge oder Trocknungsgrad ist die Zeile unbrauchbar.
 *   - Ein Preis, der nicht als Zahl lesbar ist, ist ein FEHLER — nicht 0 €.
 *     Ein stiller Nullpreis ist der teuerste Importfehler überhaupt.
 */
export function leseSortimentZeile(
  nr: number,
  roh: readonly string[],
  zuordnung: readonly SortimentZielFeld[],
): SortimentZeile {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  const wert = (feld: SortimentZielFeld): string => {
    const i = zuordnung.indexOf(feld);
    return i >= 0 ? (roh[i] ?? '').trim() : '';
  };

  // --- Variante ---------------------------------------------------------
  const holzartRoh = wert('holzart');
  const holzart = erkenneHolzart(holzartRoh);
  if (!holzartRoh) fehler.push('Holzart fehlt.');
  else if (!holzart) fehler.push(`Holzart „${holzartRoh}" ist unbekannt.`);

  const laengeRoh = wert('scheitlaenge');
  const scheitlaenge_cm = erkenneLaenge(laengeRoh);
  if (!laengeRoh) fehler.push('Scheitlänge fehlt.');
  else if (scheitlaenge_cm === null) fehler.push(`Scheitlänge „${laengeRoh}" ist nicht lesbar.`);
  else if (scheitlaenge_cm < 5 || scheitlaenge_cm > 200) fehler.push(`Scheitlänge ${scheitlaenge_cm} cm ist unplausibel.`);
  else if (!SCHEITLAENGEN.includes(scheitlaenge_cm as never)) {
    hinweise.push(`Für ${scheitlaenge_cm} cm ist kein eigener Umrechnungsfaktor hinterlegt.`);
  }

  const trocknungRoh = wert('trocknungsgrad');
  const trocknungsgrad = erkenneTrocknung(trocknungRoh);
  if (!trocknungRoh) fehler.push('Trocknungsgrad fehlt.');
  else if (!trocknungsgrad) {
    fehler.push(
      `Trocknungsgrad „${trocknungRoh}" ist unbekannt. Erlaubt: ` +
      TROCKNUNGSGRADE.map((t) => t.name.toLowerCase()).join(', ') + '.',
    );
  }

  // --- Restfeuchte -------------------------------------------------------
  const feuchteRoh = wert('restfeuchte');
  let restfeuchte_prozent: number | null = null;
  if (feuchteRoh) {
    const f = deutscheZahl(feuchteRoh);
    if (f === null) hinweise.push(`Restfeuchte „${feuchteRoh}" ist nicht lesbar und wird weggelassen.`);
    else if (f < 0 || f > 100) hinweise.push(`Restfeuchte ${f} % ist unplausibel und wird weggelassen.`);
    else {
      restfeuchte_prozent = f;
      if (trocknungsgrad && !restfeuchtePasst(trocknungsgrad, f)) {
        const passt = trocknungsgradAusRestfeuchte(f);
        hinweise.push(
          `${f} % passt nicht zu „${trocknungsgradName(trocknungsgrad)}" — der Wert entspricht ` +
          `„${trocknungsgradName(passt)}".`,
        );
      }
      if (!istBrennfertig(f)) {
        hinweise.push(`Über ${BRENNFERTIG_GRENZE_PROZENT} % Restfeuchte: nicht als ofenfertig anbieten.`);
      }
    }
  }

  // --- Steuersatz --------------------------------------------------------
  const steuerRoh = wert('steuersatz');
  let steuersatz_prozent = STANDARD_STEUERSATZ_BRENNHOLZ;
  if (steuerRoh) {
    const s = deutscheZahl(steuerRoh.replace('%', ''));
    if (s === null || s < 0 || s > 100) {
      hinweise.push(`Steuersatz „${steuerRoh}" ist nicht lesbar — es gilt ${STANDARD_STEUERSATZ_BRENNHOLZ} %.`);
    } else {
      steuersatz_prozent = s;
    }
  }

  // --- Preise ------------------------------------------------------------
  const preise: Array<{ einheit: HolzEinheit; preis_netto: number }> = [];

  for (const [feld, einheit] of Object.entries(EINHEITEN_FELD) as Array<[PreisSpalte, HolzEinheit]>) {
    const roh_ = wert(feld);
    if (!roh_) continue;

    const p = deutscheZahl(roh_);
    if (p === null) {
      // ⚠️ Kein stiller Nullpreis. Lieber die Zeile ablehnen.
      fehler.push(`Preis „${roh_}" (${einheit.toUpperCase()}) ist keine lesbare Zahl.`);
      continue;
    }
    if (p < 0) { fehler.push(`Preis ${p} (${einheit.toUpperCase()}) ist negativ.`); continue; }
    if (p === 0) { hinweise.push(`Preis 0 € für ${einheit.toUpperCase()} wird übersprungen.`); continue; }
    preise.push({ einheit, preis_netto: p });
  }

  if (preise.length === 0 && fehler.length === 0) {
    fehler.push('Kein Preis angegeben. Ohne Preis lässt sich die Variante nicht verkaufen.');
  }

  const notiz = wert('notiz') || null;

  return {
    nr, roh: [...roh],
    holzart, scheitlaenge_cm, trocknungsgrad, restfeuchte_prozent,
    steuersatz_prozent, notiz, preise,
    fehler, hinweise,
    doppeltZu: null,
    uebernehmen: fehler.length === 0,
  };
}

// ----------------------------------------------------------------------------
// 4. DIE GANZE DATEI
// ----------------------------------------------------------------------------

export interface SortimentBefund {
  zeilen: SortimentZeile[];
  anzahl: { gesamt: number; gut: number; doppelt: number; fehler: number; preise: number };
  hinweise: string[];
}

/** Die Kennung einer Variante — dieselbe Kombination wie der Unique-Index in der DB. */
export function variantenSchluessel(z: SortimentZeile): string | null {
  if (!z.holzart || z.scheitlaenge_cm === null || !z.trocknungsgrad) return null;
  return `${z.holzart}|${z.scheitlaenge_cm}|${z.trocknungsgrad}`;
}

export function pruefeSortimentImport(
  csvZeilen: readonly string[][],
  zuordnung: readonly SortimentZielFeld[],
): SortimentBefund {
  const zeilen = csvZeilen.map((r, i) => leseSortimentZeile(i + 1, r, zuordnung));

  // Doppelte innerhalb der Datei. Die erste gewinnt — sonst bricht später der
  // Unique-Index (owner, holzart, laenge, trocknung).
  const gesehen = new Map<string, number>();
  for (const z of zeilen) {
    if (z.fehler.length > 0) continue;
    const k = variantenSchluessel(z);
    if (!k) continue;
    const erste = gesehen.get(k);
    if (erste !== undefined) {
      z.doppeltZu = erste;
      z.uebernehmen = false;
      z.hinweise.push(`Dieselbe Variante steht bereits in Zeile ${erste}. Nur die erste wird übernommen.`);
    } else {
      gesehen.set(k, z.nr);
    }
  }

  const gut = zeilen.filter((z) => z.uebernehmen).length;
  const doppelt = zeilen.filter((z) => z.doppeltZu !== null).length;
  const fehlerZeilen = zeilen.filter((z) => z.fehler.length > 0).length;
  const preise = zeilen.filter((z) => z.uebernehmen).reduce((s, z) => s + z.preise.length, 0);

  const hinweise: string[] = [];
  if (doppelt > 0) hinweise.push(`${doppelt} Zeile(n) beschreiben dieselbe Variante wie eine vorherige.`);
  if (fehlerZeilen > 0) hinweise.push(`${fehlerZeilen} Zeile(n) sind unbrauchbar und werden nicht übernommen.`);
  if (gut === 0) hinweise.push('Es gibt keine übernehmbare Zeile.');

  return {
    zeilen,
    anzahl: { gesamt: zeilen.length, gut, doppelt, fehler: fehlerZeilen, preise },
    hinweise,
  };
}

// ----------------------------------------------------------------------------
// 5. SPALTEN ERKENNEN
// ----------------------------------------------------------------------------

const SPALTEN_SYNONYME: Record<Exclude<SortimentZielFeld, 'ignorieren'>, string[]> = {
  holzart: ['holzart', 'holz', 'art', 'baumart', 'sorte'],
  scheitlaenge: ['scheitlange', 'lange', 'scheitlangecm', 'langecm', 'scheit', 'zuschnitt'],
  trocknungsgrad: ['trocknungsgrad', 'trocknung', 'zustand', 'qualitat', 'feuchtegrad'],
  restfeuchte: ['restfeuchte', 'feuchte', 'holzfeuchte', 'restfeuchteprozent', 'wassergehalt'],
  preis_srm: ['preissrm', 'srm', 'schuttraummeter', 'eursrm', 'preisjesrm', 'schuttmeter'],
  preis_rm: ['preisrm', 'rm', 'raummeter', 'ster', 'eurrm', 'preisjerm'],
  preis_fm: ['preisfm', 'fm', 'festmeter', 'eurfm', 'preisjefm'],
  preis_m3: ['preism3', 'm3', 'kubikmeter', 'eurm3'],
  steuersatz: ['steuersatz', 'ust', 'mwst', 'umsatzsteuer', 'steuer'],
  notiz: ['notiz', 'bemerkung', 'kommentar', 'anmerkung'],
};

export function erkenneSortimentSpalten(kopfzeile: readonly string[]): SortimentZielFeld[] {
  const belegt = new Set<SortimentZielFeld>();

  return kopfzeile.map((kopf) => {
    const k = schluessel(kopf);
    if (!k) return 'ignorieren';

    for (const [ziel, worte] of Object.entries(SPALTEN_SYNONYME) as Array<[Exclude<SortimentZielFeld, 'ignorieren'>, string[]]>) {
      if (belegt.has(ziel)) continue;
      if (worte.includes(k)) { belegt.add(ziel); return ziel; }
    }
    for (const [ziel, worte] of Object.entries(SPALTEN_SYNONYME) as Array<[Exclude<SortimentZielFeld, 'ignorieren'>, string[]]>) {
      if (belegt.has(ziel)) continue;
      if (worte.some((w) => w.length >= 3 && k.includes(w))) { belegt.add(ziel); return ziel; }
    }
    return 'ignorieren';
  });
}
