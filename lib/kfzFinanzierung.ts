// ============================================================================
// ARGONAUT OS · lib/kfzFinanzierung.ts — Paket 282 (09.10.2026) · K15b
// Finanzierungs-Beispiel und Konfigurator für Zusatzleistungen (Fahrzeugbörse)
//
//   finanzEinstellung / boerseBereit   Konditionen des Betriebs (Chef), Börse nur wenn vollständig + bestätigt
//   rate / beispiel                    Annuität mit optionaler Schlussrate, centgenau
//   effektivZins                       effektiver Jahreszins aus den Zahlungsströmen (PAngV-Methode, jährlich verzinst)
//   pflichtZeilen                      alle Angaben des Beispiels in fester Reihenfolge (§ 17 PAngV)
//   extrasLesen / extrasWahl           Zusatzleistungen: Katalog des Betriebs, Auswahl nur über Schlüssel —
//                                      Preise kommen IMMER vom Server, nie vom Browser
//   nachrichtMitExtras                 Auswahl in die Anfrage (Spalte nachricht, max. 2000 Zeichen)
//
// GRUNDSÄTZE
// - ARGONAUT vermittelt keine Kredite und rechnet nur ein Beispiel. In der Börse
//   erscheint es nur, wenn der Chef Darlehensgeber, Anschrift und Sollzins
//   eingetragen und bestätigt hat, dass die Konditionen von der Bank stammen.
// - Kein Wert wird erfunden: ohne Preis kein Beispiel.
// Nur Import der zentralen Rundung. Node-testbar.
// ============================================================================

import { centRunden, leseZahl, rundeStellen } from './zahlen';

/** Rate auf den Cent AUFrunden (wie Banken): die Raten decken das Darlehen immer voll ab. */
function centAuf(n: number): number { return Math.ceil(Math.round(n * 1e6) / 1e4) / 100; }

export const FINANZ_KEY = 'finanzierung';
export const EXTRAS_KEY = 'extras';
export const EXTRAS_MAX = 12;

export type FinanzEinstellung = {
  aktiv: boolean;               // im Inserat zeigen
  bank: string | null;          // Darlehensgeber
  anschrift: string | null;     // Anschrift des Darlehensgebers
  sollzins: number | null;      // gebundener Sollzins p. a. in %
  monate: number;               // Laufzeit
  anzahlungProzent: number;     // vom Fahrzeugpreis
  schlussProzent: number;       // Schlussrate vom Fahrzeugpreis (0 = klassische Ratenfinanzierung)
  hinweis: string | null;       // z. B. Vermittler-Hinweis des Betriebs
  geprueftAm: string | null;    // Chef hat bestätigt: Konditionen laut Bank
};

// Zahlen nur über den einen Leser (lib/zahlen): „5,99" und 5.99 ergeben dasselbe.
function zahl(x: unknown): number | null {
  const n = leseZahl(x);
  return n !== null && Number.isFinite(n) ? n : null;
}
function text(x: unknown, max: number): string | null {
  if (typeof x !== 'string') return null;
  const t = x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}
function zwischen(x: unknown, min: number, max: number, std: number, ganz = false): number {
  const n = zahl(x);
  if (n === null || n < min || n > max) return std;
  return ganz ? Math.round(n) : rundeStellen(n, 2);
}

export function finanzEinstellung(roh: unknown): FinanzEinstellung {
  const e = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  const sz = zahl(e.sollzins);
  return {
    aktiv: e.aktiv === true,
    bank: text(e.bank, 120),
    anschrift: text(e.anschrift, 200),
    sollzins: sz !== null && sz >= 0 && sz <= 25 ? rundeStellen(sz, 2) : null,
    monate: zwischen(e.monate, 6, 120, 48, true),
    anzahlungProzent: zwischen(e.anzahlungProzent, 0, 90, 20),
    schlussProzent: zwischen(e.schlussProzent, 0, 60, 0),
    hinweis: text(e.hinweis, 300),
    geprueftAm: typeof e.geprueftAm === 'string' && /^\d{4}-\d{2}-\d{2}/.test(e.geprueftAm) ? e.geprueftAm.slice(0, 10) : null,
  };
}

/** In der Börse nur, wenn eingeschaltet UND Darlehensgeber, Anschrift, Sollzins und Bestätigung vorliegen. */
export function boerseBereit(e: FinanzEinstellung): boolean {
  return e.aktiv && !!e.bank && !!e.anschrift && e.sollzins !== null && !!e.geprueftAm;
}

/** Monatsrate einer Annuität mit Schlussrate (nominaler Monatszins = Sollzins / 12). Ungerundet. */
export function rate(netto: number, monate: number, sollzins: number, schluss: number): number {
  if (monate <= 0) return NaN;
  const i = sollzins / 100 / 12;
  if (i === 0) return (netto - schluss) / monate;
  const q = Math.pow(1 + i, monate);
  return ((netto * q - schluss) * i) / (q - 1);
}

/**
 * Effektiver Jahreszins nach der PAngV-Methode: Barwert aller Zahlungen bei
 * jährlicher Verzinsung (Zeit in Jahren = Monat/12) gleich dem Nettodarlehen.
 * Gelöst durch Halbierung, auf zwei Nachkommastellen.
 */
export function effektivZins(netto: number, raten: number[], schluss: number, monate: number): number | null {
  if (!(netto > 0) || monate <= 0) return null;
  const barwert = (x: number) => {
    let s = 0;
    raten.forEach((r, k) => { s += r / Math.pow(1 + x, (k + 1) / 12); });
    if (schluss > 0) s += schluss / Math.pow(1 + x, monate / 12);
    return s;
  };
  if (barwert(0) < netto - 0.005) return null; // Zahlungen kleiner als das Darlehen: kein sinnvoller Zins
  let lo = 0, hi = 1;
  for (let n = 0; n < 200; n++) {
    const mid = (lo + hi) / 2;
    if (barwert(mid) > netto) lo = mid; else hi = mid;
  }
  return rundeStellen(((lo + hi) / 2) * 100, 2);
}

export type Beispiel = {
  preis: number; anzahlung: number; netto: number; monate: number; sollzins: number;
  rate: number; anzahlRaten: number; schlussrate: number; gesamt: number; zinsen: number; effektiv: number;
};

/** Beispielrechnung für einen Fahrzeugpreis. Ohne Preis, Sollzins oder Darlehen: null. */
export function beispiel(preis: number | null, e: Pick<FinanzEinstellung, 'sollzins' | 'monate' | 'anzahlungProzent' | 'schlussProzent'>, eingabe?: { anzahlung?: number | null; schluss?: number | null; monate?: number | null }): Beispiel | null {
  if (preis === null || !Number.isFinite(preis) || preis <= 0 || e.sollzins === null) return null;
  const monate = eingabe?.monate && eingabe.monate >= 6 && eingabe.monate <= 120 ? Math.round(eingabe.monate) : e.monate;
  const anzahlung = centRunden(eingabe?.anzahlung !== undefined && eingabe.anzahlung !== null ? Math.max(0, eingabe.anzahlung) : (preis * e.anzahlungProzent) / 100);
  const netto = centRunden(preis - anzahlung);
  if (netto <= 0) return null;
  const schlussrate = centRunden(eingabe?.schluss !== undefined && eingabe.schluss !== null ? Math.max(0, eingabe.schluss) : (preis * e.schlussProzent) / 100);
  if (schlussrate >= netto) return null;
  const anzahlRaten = schlussrate > 0 ? monate - 1 : monate;
  // Bei Schlussrate: letzte Zahlung = Schlussrate, davor monate-1 gleiche Raten.
  const r = schlussrate > 0
    ? annuitaetMitBallon(netto, monate, e.sollzins, schlussrate)
    : centAuf(rate(netto, monate, e.sollzins, 0));
  const raten = Array.from({ length: anzahlRaten }, () => r);
  const gesamt = centRunden(r * anzahlRaten + schlussrate);
  const eff = effektivZins(netto, raten, schlussrate, monate);
  if (eff === null) return null;
  return { preis: centRunden(preis), anzahlung, netto, monate, sollzins: e.sollzins, rate: r, anzahlRaten, schlussrate, gesamt, zinsen: centRunden(gesamt - netto), effektiv: eff };
}

/** Gleiche Raten in den Monaten 1..n-1, Schlussrate im Monat n (ersetzt dort die Rate). */
function annuitaetMitBallon(netto: number, monate: number, sollzins: number, ballon: number): number {
  const i = sollzins / 100 / 12;
  const n = monate - 1;
  if (n <= 0) return 0;
  if (i === 0) return centAuf((netto - ballon) / n);
  const q = Math.pow(1 + i, monate);
  const an = (1 - Math.pow(1 + i, -n)) / i;
  return centAuf((netto - ballon / q) / an);
}

const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const pz = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';

/** Alle Angaben des Beispiels — feste Reihenfolge, nichts davon darf fehlen. */
export function pflichtZeilen(b: Beispiel, e: Pick<FinanzEinstellung, 'bank' | 'anschrift'>): [string, string][] {
  const z: [string, string][] = [
    ['Fahrzeugpreis (Barzahlungspreis)', eur(b.preis)],
    ['Anzahlung', eur(b.anzahlung)],
    ['Nettodarlehensbetrag', eur(b.netto)],
    ['Vertragslaufzeit', `${b.monate} Monate`],
    ['Gebundener Sollzinssatz p. a.', pz(b.sollzins)],
    ['Effektiver Jahreszins', pz(b.effektiv)],
    [`${b.anzahlRaten} monatliche Raten à`, eur(b.rate)],
  ];
  if (b.schlussrate > 0) z.push(['Schlussrate', eur(b.schlussrate)]);
  z.push(['Gesamtbetrag', eur(b.gesamt)]);
  if (e.bank) z.push(['Darlehensgeber', e.anschrift ? `${e.bank}, ${e.anschrift}` : e.bank]);
  return z;
}

export const BEISPIEL_HINWEIS = 'Repräsentatives Beispiel nach § 17 PAngV. Bonität vorausgesetzt. Unverbindliches Rechenbeispiel, kein Angebot — maßgeblich ist der Vertrag mit dem Darlehensgeber.';

/** Prüfwarnung für den Chef: Raten ergeben weniger als das Darlehen? Unplausible Werte? */
export function einstellungHinweise(e: FinanzEinstellung): string[] {
  const h: string[] = [];
  if (e.aktiv && !e.bank) h.push('Darlehensgeber fehlt — ohne ihn erscheint kein Beispiel im Inserat.');
  if (e.aktiv && !e.anschrift) h.push('Anschrift des Darlehensgebers fehlt.');
  if (e.aktiv && e.sollzins === null) h.push('Sollzins fehlt (0 bis 25 %).');
  if (e.aktiv && !e.geprueftAm) h.push('Bitte bestätigen, dass die Konditionen vom Darlehensgeber stammen.');
  if (e.schlussProzent > 0 && e.schlussProzent + e.anzahlungProzent >= 100) h.push('Anzahlung und Schlussrate zusammen decken den ganzen Preis — es bleibt nichts zu finanzieren.');
  return h;
}

// ---------------------------------------------------------------------------
// Zusatzleistungen (Konfigurator)
// ---------------------------------------------------------------------------

export type Extra = { key: string; text: string; betrag: number };

/** Stabiler Schlüssel aus dem Text: ändert der Betrieb den Text, ist die alte Auswahl ungültig. */
export function extraKey(t: string): string {
  let h = 2166136261;
  for (const c of t.toLowerCase()) { h ^= c.codePointAt(0) as number; h = Math.imul(h, 16777619) >>> 0; }
  return 'x' + h.toString(36);
}

/** Katalog des Betriebs bereinigen: höchstens 12, Text bis 80 Zeichen, Betrag brutto 0–100.000 €, kein Text doppelt. */
export function extrasLesen(roh: unknown): Extra[] {
  if (!Array.isArray(roh)) return [];
  const aus: Extra[] = [];
  const gesehen = new Set<string>();
  for (const z of roh) {
    if (!z || typeof z !== 'object') continue;
    const r = z as Record<string, unknown>;
    const t = text(r.text, 80);
    const b = zahl(r.betrag);
    if (!t || b === null || b < 0 || b > 100000) continue;
    const key = extraKey(t);
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    aus.push({ key, text: t, betrag: centRunden(b) });
    if (aus.length >= EXTRAS_MAX) break;
  }
  return aus;
}

/** Auswahl des Interessenten: nur Schlüssel aus dem aktuellen Katalog, jeder einmal. Preise aus dem Katalog. */
export function extrasWahl(katalog: Extra[], wahl: unknown): { gewaehlt: Extra[]; summe: number } {
  const keys = Array.isArray(wahl) ? wahl.filter((x): x is string => typeof x === 'string').slice(0, EXTRAS_MAX) : [];
  const gewaehlt = katalog.filter((e) => keys.includes(e.key));
  return { gewaehlt, summe: centRunden(gewaehlt.reduce((s, e) => s + e.betrag, 0)) };
}

/** Auswahl als Zeilen direkt unter die Kopfzeile der Anfrage; das Ganze nie über 2000 Zeichen. */
export function nachrichtMitExtras(nachricht: string, gewaehlt: Extra[], preis: number | null): string {
  if (!gewaehlt.length) return nachricht.slice(0, 2000);
  const summe = centRunden(gewaehlt.reduce((s, e) => s + e.betrag, 0));
  const zeilen = ['Gewünschte Zusatzleistungen: ' + gewaehlt.map((e) => `${e.text} (${eur(e.betrag)})`).join(', ')];
  zeilen.push(preis !== null && preis > 0 ? `Zusammen ${eur(summe)} · Fahrzeug mit Auswahl ${eur(centRunden(preis + summe))}` : `Zusammen ${eur(summe)}`);
  const [kopf, ...rest] = nachricht.split('\n');
  return [kopf, ...zeilen, ...rest].join('\n').slice(0, 2000);
}
