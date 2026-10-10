// ============================================================================
// ARGONAUT OS · lib/kfzEmpfehlung.ts — Paket 308 (10.10.2026) · FM4
// Bewertungs-Empfehlung im Ankauf
//
// Wer eine Fahrzeugmappe (oder einen Hof-Ankauf) bewertet, bekommt eine
// nachvollziehbare EMPFEHLUNG für den Verkaufspreis und den höchsten
// Einkaufspreis — mit Rechenweg. Grundlage sind nur BELEGTE Werte:
//   1. Marktvergleich: Angebote ähnlicher Fahrzeuge, die der Betrieb selbst
//      erfasst (wie P276, jetzt auch am Ankauf) -> Marktmitte und Spanne
//   2. DAT/Schwacke: Händler-Verkaufs- und -Einkaufswert aus dem EIGENEN Konto
//      des Betriebs beim Anbieter (wie P283, jetzt auch am Ankauf)
//   3. Zu- und Abschläge, die das AUTOHAUS selbst festlegt (⚙, Startwert 0 %),
//      je Merkmal: Serviceheft, Vorbesitzer, Unfall laut Verkäufer, Historie,
//      Zustand bei Besichtigung, Nichtraucher
//   4. Kosten und Marge aus der vorhandenen Bewertungsrechnung (kfzAnkauf.bewertung)
//
// REGELN (Martin, 10.10.2026)
// - Die KI schätzt NIE einen Preis. Hier gibt es keine KI; auch die Begründung
//   ist aus den Daten zusammengesetzt (0 €, immer gleich nachvollziehbar).
// - Immer „Empfehlung" — die Entscheidung trifft das Autohaus.
// - Zu wenige Daten werden ehrlich angezeigt, nie mit erfundenen Werten gefüllt.
// - Schäden laufen als Kosten in den Einkaufspreis (Reiter „Schäden"), nie
//   zusätzlich als Abschlag — sonst wären sie doppelt gezählt.
//
// Nur Imports reiner Logik, keine Hooks, keine Systemuhr. Node-testbar.
// ============================================================================

import { centRunden, leseZahl, rundeStellen } from './zahlen';
import { marktLage, type Vergleich } from './kfzMarkt';
import { BEWERTUNG_ALT_TAGE } from './kfzBewertung';
import { bewertung, type BewertungEingabe } from './kfzAnkauf';

// --- Merkmale und Zu-/Abschläge ------------------------------------------------------------
export type Merkmal = { key: string; titel: string; optionen: { key: string; label: string }[]; quelle: 'akte' | 'besichtigung' };

export const MERKMALE: Merkmal[] = [
  { key: 'serviceheft', titel: 'Serviceheft', quelle: 'akte', optionen: [
    { key: 'lueckenlos', label: 'lückenlos' }, { key: 'teilweise', label: 'teilweise' }, { key: 'keins', label: 'keins' }] },
  { key: 'vorbesitzer', titel: 'Vorbesitzer', quelle: 'akte', optionen: [
    { key: '1', label: '1' }, { key: '2', label: '2' }, { key: '3plus', label: '3 und mehr' }] },
  { key: 'unfall', titel: 'Unfall/Vorschaden laut Verkäufer', quelle: 'akte', optionen: [
    { key: 'keine_bekannt', label: 'keine bekannt' }, { key: 'ja', label: 'ja' }] },
  { key: 'historie', titel: 'Fahrzeughistorie (Bericht)', quelle: 'akte', optionen: [
    { key: 'ok', label: 'unauffällig' }, { key: 'warn', label: 'auffällig' }, { key: 'bad', label: 'kritisch' }] },
  { key: 'zustand', titel: 'Zustand bei Besichtigung', quelle: 'besichtigung', optionen: [
    { key: 'sehr_gut', label: 'sehr gut' }, { key: 'gut', label: 'gut' }, { key: 'gebraucht', label: 'deutliche Gebrauchsspuren' }, { key: 'schlecht', label: 'schlecht' }] },
  { key: 'nichtraucher', titel: 'Nichtraucherfahrzeug', quelle: 'besichtigung', optionen: [
    { key: 'ja', label: 'ja' }, { key: 'nein', label: 'nein' }] },
];

/** Grenzen: je Merkmal ±30 %, alle zusammen ±40 % (Schutz vor Tippfehlern). */
export const PROZENT_MAX = 30;
export const SUMME_MAX = 40;

export type Zuschlaege = Record<string, Record<string, number>>;

/** Einstellung des Betriebs säubern: nur bekannte Merkmale/Optionen, Zahl, ±30 %, eine Nachkommastelle. Leer = 0 %. */
export function zuschlaegeBereinigen(roh: unknown): Zuschlaege {
  const aus: Zuschlaege = {};
  const b = roh && typeof roh === 'object' && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {};
  for (const m of MERKMALE) {
    const z = b[m.key] && typeof b[m.key] === 'object' && !Array.isArray(b[m.key]) ? (b[m.key] as Record<string, unknown>) : {};
    for (const o of m.optionen) {
      const v = z[o.key];
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? leseZahl(v) : null;
      if (n === null || !Number.isFinite(n) || n === 0) continue;
      if (!aus[m.key]) aus[m.key] = {};
      aus[m.key][o.key] = rundeStellen(Math.max(-PROZENT_MAX, Math.min(PROZENT_MAX, n)), 1);
    }
  }
  return aus;
}

export function hatZuschlaege(z: Zuschlaege): boolean {
  return Object.values(z).some((o) => Object.values(o).some((x) => x !== 0));
}

/** Angaben der Besichtigung (kfz_ankauf.empfehlung) säubern. */
export function besichtigungBereinigen(roh: unknown): { zustand?: string; nichtraucher?: string } {
  const b = roh && typeof roh === 'object' && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {};
  const aus: { zustand?: string; nichtraucher?: string } = {};
  const zo = MERKMALE.find((m) => m.key === 'zustand')!.optionen.map((o) => o.key);
  if (typeof b.zustand === 'string' && zo.includes(b.zustand)) aus.zustand = b.zustand;
  if (b.nichtraucher === 'ja' || b.nichtraucher === 'nein') aus.nichtraucher = b.nichtraucher;
  return aus;
}

export type AkteFuerMerkmale = {
  serviceheft: string | null; vorbesitzer: number | null; unfall_angabe: string | null;
  historie_ampel: 'ok' | 'warn' | 'bad' | 'dim' | null; empfehlung: unknown;
};

/** Welcher Wert gilt je Merkmal? Aus der Akte bzw. der Besichtigung; unbekannt = null (kein Zu-/Abschlag). */
export function merkmalWerte(a: AkteFuerMerkmale): Record<string, string | null> {
  const vb = a.vorbesitzer;
  const b = besichtigungBereinigen(a.empfehlung);
  return {
    serviceheft: a.serviceheft === 'lueckenlos' || a.serviceheft === 'teilweise' || a.serviceheft === 'keins' ? a.serviceheft : null,
    vorbesitzer: vb === null || !Number.isFinite(vb) || vb < 1 ? null : vb === 1 ? '1' : vb === 2 ? '2' : '3plus',
    unfall: a.unfall_angabe === 'ja' || a.unfall_angabe === 'keine_bekannt' ? a.unfall_angabe : null,
    historie: a.historie_ampel === 'ok' || a.historie_ampel === 'warn' || a.historie_ampel === 'bad' ? a.historie_ampel : null,
    zustand: b.zustand ?? null,
    nichtraucher: b.nichtraucher ?? null,
  };
}

// --- Empfehlung ----------------------------------------------------------------------------
export type DatWert = { anbieter: string | null; ek: number | null; vk: number | null; am: string | null };

export type Posten = { merkmal: string; titel: string; wert: string; prozent: number; betrag: number };

export type Empfehlung = {
  basis: 'markt' | 'dat' | 'keine';
  basisWert: number | null;            // Marktmitte bzw. DAT-Händler-Verkaufswert (brutto)
  spanne: { q1: number; q3: number; min: number; max: number; anzahl: number } | null;
  dat: DatWert & { alt: boolean; alterTage: number | null } | null;
  posten: Posten[];
  prozentSumme: number;                // nach Deckel
  gedeckelt: boolean;
  vk: number | null;                   // empfohlener Verkaufspreis brutto, auf volle 10 €
  maxEk: number | null;                // höchster Einkaufspreis aus kfzAnkauf.bewertung
  maxEkBrutto: number | null;
  besteuerung: '25a' | 'regel';
  datEkAbweichung: number | null;      // maxEk gegenüber DAT-Händler-Einkaufswert in %
  rechenweg: string[];
  hinweise: string[];
  begruendung: string;
};

function euro(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

function tage(vonIso: string, bisIso: string): number | null {
  const a = Date.parse(`${vonIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${bisIso.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
}

export type EmpfehlungEingabe = {
  fahrzeug: { km: number | null; erstzulassung: string | null };
  vergleiche: Vergleich[];
  dat: DatWert | null;
  merkmale: Record<string, string | null>;
  zuschlaege: Zuschlaege;
  kosten: Omit<BewertungEingabe, 'zielVk'>;
  heuteIso: string;
};

/**
 * Die Empfehlung. Basis: Marktmitte, wenn mindestens 3 aktuelle Vergleiche da
 * sind; sonst der DAT/Schwacke-Händler-Verkaufswert; sonst keine Empfehlung.
 * Darauf die Zu-/Abschläge des Betriebs (in % der Basis, zusammen höchstens ±40 %),
 * auf volle 10 € gerundet = empfohlener Verkaufspreis. Daraus mit Kosten, Standtagen
 * und Marge der höchste Einkaufspreis (kfzAnkauf.bewertung).
 */
export function empfehlung(e: EmpfehlungEingabe): Empfehlung {
  const hinweise: string[] = [];
  const rechenweg: string[] = [];
  const lage = marktLage({ vk: null, km: e.fahrzeug.km, erstzulassung: e.fahrzeug.erstzulassung }, e.vergleiche, e.heuteIso);
  const spanne = lage.basis !== 'zu_wenig' && lage.median !== null
    ? { q1: lage.q1 as number, q3: lage.q3 as number, min: lage.min as number, max: lage.max as number, anzahl: lage.anzahl } : null;

  let dat: Empfehlung['dat'] = null;
  if (e.dat && (e.dat.vk !== null || e.dat.ek !== null)) {
    const alterTage = e.dat.am ? tage(e.dat.am, e.heuteIso) : null;
    dat = { ...e.dat, alterTage, alt: alterTage !== null && alterTage > BEWERTUNG_ALT_TAGE };
    if (dat.alt) hinweise.push(`Der ${e.dat.anbieter || 'DAT/Schwacke'}-Wert ist ${alterTage} Tage alt — bitte neu abfragen.`);
  }

  let basis: Empfehlung['basis'] = 'keine';
  let basisWert: number | null = null;
  if (spanne && lage.median !== null) {
    basis = 'markt'; basisWert = lage.median;
    rechenweg.push(`Marktmitte aus ${spanne.anzahl} aktuellen Vergleichen: ${euro(basisWert)} (mittlere Hälfte ${euro(spanne.q1)} bis ${euro(spanne.q3)})`);
    if (lage.basis === 'alle') hinweise.push(`Nur ${lage.passend} Vergleiche passen nach Kilometern und Erstzulassung — gerechnet mit allen ${lage.aktuell}.`);
    if (lage.kmText) hinweise.push(lage.kmText.replace('Ihr Fahrzeug', 'Das Fahrzeug'));
    if (spanne.q1 > 0 && spanne.q3 / spanne.q1 > 1.3) hinweise.push('Die Angebote liegen weit auseinander — weitere Vergleiche machen die Empfehlung sicherer.');
  } else if (dat && dat.vk !== null && dat.vk > 0) {
    basis = 'dat'; basisWert = dat.vk;
    rechenweg.push(`${dat.anbieter || 'DAT/Schwacke'}-Händler-Verkaufswert: ${euro(basisWert)} (zu wenige Marktvergleiche: ${lage.aktuell} von mindestens 3)`);
  }

  const besteuerung = e.kosten.verkaeuferArt === 'gewerblich' ? 'regel' : '25a';
  if (basisWert === null) {
    hinweise.unshift(`Für eine Empfehlung fehlen Daten: Erfassen Sie mindestens 3 aktuelle Angebote ähnlicher Fahrzeuge (${lage.aktuell} vorhanden) oder tragen Sie den DAT/Schwacke-Händler-Verkaufswert ein.`);
    return { basis, basisWert, spanne, dat, posten: [], prozentSumme: 0, gedeckelt: false, vk: null, maxEk: null, maxEkBrutto: null, besteuerung,
      datEkAbweichung: null, rechenweg, hinweise, begruendung: 'Noch keine Empfehlung — es fehlen belegte Marktdaten.' };
  }
  if (basis === 'markt' && dat && dat.vk !== null && dat.vk > 0) {
    const abw = rundeStellen(((basisWert - dat.vk) / dat.vk) * 100, 1);
    rechenweg.push(`Zum Abgleich ${dat.anbieter || 'DAT/Schwacke'}-Händler-Verkaufswert ${euro(dat.vk)} (Marktmitte ${abw > 0 ? '+' : ''}${abw.toLocaleString('de-DE')} %)`);
    if (Math.abs(abw) > 15) hinweise.push(`Marktmitte und ${dat.anbieter || 'DAT/Schwacke'}-Wert liegen ${Math.abs(abw).toLocaleString('de-DE')} % auseinander — bitte Vergleiche und Ausstattung prüfen.`);
  }

  const posten: Posten[] = [];
  for (const m of MERKMALE) {
    const w = e.merkmale[m.key];
    if (!w) continue;
    const p = e.zuschlaege[m.key]?.[w] ?? 0;
    if (!p) continue;
    posten.push({ merkmal: m.key, titel: m.titel, wert: m.optionen.find((o) => o.key === w)?.label ?? w, prozent: p, betrag: centRunden((basisWert * p) / 100) });
  }
  const roh = posten.reduce((s, x) => s + x.prozent, 0);
  const prozentSumme = rundeStellen(Math.max(-SUMME_MAX, Math.min(SUMME_MAX, roh)), 1);
  const gedeckelt = prozentSumme !== rundeStellen(roh, 1);
  for (const x of posten) rechenweg.push(`${x.prozent > 0 ? '+' : '−'} ${Math.abs(x.prozent).toLocaleString('de-DE')} % ${x.titel} (${x.wert}): ${x.prozent > 0 ? '+' : '−'}${euro(Math.abs(x.betrag))}`);
  if (gedeckelt) hinweise.push(`Die Zu- und Abschläge zusammen (${rundeStellen(roh, 1).toLocaleString('de-DE')} %) wurden auf ±${SUMME_MAX} % begrenzt.`);
  const vk = Math.round(centRunden(basisWert * (1 + prozentSumme / 100)) / 10) * 10;
  rechenweg.push(`= empfohlener Verkaufspreis ${euro(vk)} (auf volle 10 € gerundet)`);

  const b = bewertung({ ...e.kosten, zielVk: vk });
  for (const r of b.rechenweg) rechenweg.push(r);
  const maxEk = b.maxAnkauf;
  let datEkAbweichung: number | null = null;
  if (dat && dat.ek !== null && dat.ek > 0 && maxEk !== null && maxEk > 0) {
    datEkAbweichung = rundeStellen(((maxEk - dat.ek) / dat.ek) * 100, 1);
    rechenweg.push(`Zum Abgleich ${dat.anbieter || 'DAT/Schwacke'}-Händler-Einkaufswert ${euro(dat.ek)} (Empfehlung ${datEkAbweichung > 0 ? '+' : ''}${datEkAbweichung.toLocaleString('de-DE')} %)`);
  }
  if (b.lohntSich === false) hinweise.push('Bei diesen Kosten und dieser Marge bleibt kein Einkaufspreis — Kosten, Marge oder Ankauf prüfen.');

  const begruendung = begruendungText({ basis, basisWert, spanne, posten, vk, maxEk, besteuerung, datName: dat?.anbieter ?? null });
  return { basis, basisWert, spanne, dat, posten, prozentSumme, gedeckelt, vk, maxEk, maxEkBrutto: b.maxAnkaufBrutto, besteuerung, datEkAbweichung, rechenweg, hinweise, begruendung };
}

/** Begründung in Klartext — aus den Daten zusammengesetzt, keine KI. */
export function begruendungText(x: {
  basis: Empfehlung['basis']; basisWert: number | null; spanne: Empfehlung['spanne']; posten: Posten[];
  vk: number | null; maxEk: number | null; besteuerung: '25a' | 'regel'; datName: string | null;
}): string {
  if (x.basis === 'keine' || x.basisWert === null || x.vk === null) return 'Noch keine Empfehlung — es fehlen belegte Marktdaten.';
  const quelle = x.basis === 'markt' && x.spanne
    ? `Vergleichbare Fahrzeuge werden für ${euro(x.spanne.q1)} bis ${euro(x.spanne.q3)} angeboten (Mitte ${euro(x.basisWert)}, ${x.spanne.anzahl} Angebote).`
    : `Der ${x.datName || 'DAT/Schwacke'}-Händler-Verkaufswert liegt bei ${euro(x.basisWert)}.`;
  const plus = x.posten.filter((p) => p.prozent > 0).map((p) => `${p.titel.toLowerCase()} ${p.wert}`);
  const minus = x.posten.filter((p) => p.prozent < 0).map((p) => `${p.titel.toLowerCase()} ${p.wert}`);
  const teile = [quelle];
  if (plus.length) teile.push(`Für das Fahrzeug spricht: ${plus.join(', ')}.`);
  if (minus.length) teile.push(`Dagegen: ${minus.join(', ')}.`);
  if (!x.posten.length) teile.push('Zu- oder Abschläge wurden nicht angewendet.');
  teile.push(`Empfohlen: Verkauf um ${euro(x.vk)}${x.maxEk !== null && x.maxEk > 0 ? `, Einkauf höchstens ${euro(x.maxEk)}${x.besteuerung === 'regel' ? ' netto' : ''}` : ''}. Die Entscheidung trifft das Autohaus.`);
  return teile.join(' ');
}

/** Datenbank-Felder der Bewertung am Ankauf (wie kfz_bestand, Paket 283) für die Übernahme in den Bestand. */
export const ANKAUF_BEWERTUNG_FELDER = ['bewertung_anbieter', 'bewertung_ek', 'bewertung_vk', 'bewertung_am', 'bewertung_url'] as const;
