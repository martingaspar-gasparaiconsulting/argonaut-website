// ============================================================================
// ARGONAUT OS · lib/kfzMarkt.ts — Paket 276 (08.10.2026) · K12b Marktvergleich
//
// Vergleichsangebote je Bestandsfahrzeug, die der Betrieb SELBST erfasst
// (Preis, km, Erstzulassung, Quelle, Link, Datum) — daraus die Marktlage:
// Median, Spanne, Rang des eigenen Preises, Abweichung, km-Hinweis.
//
// GRUNDSÄTZE (Anwalt R45: Marktdaten nur lizenziert)
// - Keine fremden Marktdaten, kein Auslesen von Börsen, keine KI-Schätzung.
//   Ein lizenzierter Marktdaten-Partner kann später andocken (gleiche Felder,
//   Quelle = Partner), Muster wie carVertical (Paket 274).
// - Keine Personendaten: weder Name noch Telefon des Anbieters.
// - Vergleiche veralten: nur Einträge der letzten 30 Tage zählen; ältere bleiben
//   sichtbar, gehen aber nicht in die Rechnung ein.
// - Unter 3 passenden Vergleichen gibt es keine Aussage („zu wenige").
//
// Nur Imports reiner Logik, KEINE Hooks, keine Systemuhr. Node-testbar.
// ============================================================================

import { centRunden } from './zahlen';
import { ezAusEingabe } from './kfzBestand';

const TAG = 86400000;
export const MAX_TAGE = 30;
export const MIN_VERGLEICHE = 3;

export const QUELLEN = ['mobile.de', 'AutoScout24', 'Kleinanzeigen', 'Händler-Webseite', 'Sonstige'] as const;

export type Vergleich = {
  id?: string;
  preis: number | null;
  km: number | null;
  erstzulassung: string | null;   // YYYY-MM-DD
  erfasst_am: string;             // YYYY-MM-DD
  quelle?: string | null;
  link?: string | null;
  notiz?: string | null;
};

export type VergleichEingabe = { preis: number | null; km: number | null; ez: string | null; quelle: string | null; link: string | null; notiz: string | null; am?: string | null };

/** Eingabe prüfen und in Datenbankfelder übersetzen. Preis ist Pflicht, Link nur https. */
export function vergleichPruefen(e: VergleichEingabe, heuteIso: string):
  { ok: true; felder: { preis: number; km: number | null; erstzulassung: string | null; quelle: string; link: string | null; notiz: string | null; erfasst_am: string } } | { ok: false; fehler: string } {
  if (e.preis === null || !Number.isFinite(e.preis) || e.preis <= 0) return { ok: false, fehler: 'Bitte den Angebotspreis eintragen.' };
  if (e.preis > 10_000_000) return { ok: false, fehler: 'Der Preis ist unplausibel hoch.' };
  if (e.km !== null && (!Number.isFinite(e.km) || e.km < 0 || e.km > 3_000_000)) return { ok: false, fehler: 'Der Kilometerstand ist unplausibel.' };
  let ez: string | null = null;
  if (e.ez && e.ez.trim()) {
    ez = ezAusEingabe(e.ez);
    if (!ez) return { ok: false, fehler: 'Erstzulassung bitte als MM/JJJJ eintragen, z. B. 03/2021.' };
  }
  const link = String(e.link ?? '').trim();
  if (link && (!/^https:\/\/[^\s"'<>]+$/.test(link) || link.length > 500)) return { ok: false, fehler: 'Der Link muss mit https:// beginnen.' };
  const quelle = String(e.quelle ?? '').trim().slice(0, 60) || 'Sonstige';
  const am = e.am && /^\d{4}-\d{2}-\d{2}$/.test(e.am) && e.am <= heuteIso ? e.am : heuteIso;
  return { ok: true, felder: {
    preis: centRunden(e.preis), km: e.km === null ? null : Math.round(e.km), erstzulassung: ez, quelle,
    link: link || null, notiz: String(e.notiz ?? '').trim().slice(0, 200) || null, erfasst_am: am,
  } };
}

/** Alter eines Eintrags in Tagen (ab Erfassung). */
export function alterTage(erfasstAm: string, heuteIso: string): number {
  const a = Date.parse(String(erfasstAm).slice(0, 10) + 'T00:00:00Z');
  const h = Date.parse(heuteIso.slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(a) && Number.isFinite(h) ? Math.max(0, Math.round((h - a) / TAG)) : 9999;
}

export function aktuell(v: Vergleich, heuteIso: string): boolean {
  return alterTage(v.erfasst_am, heuteIso) <= MAX_TAGE && v.preis !== null && Number.isFinite(v.preis) && v.preis > 0;
}

function jahr(iso: string | null | undefined): number | null {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})/);
  return m ? Number(m[1]) + (Number(m[2]) - 1) / 12 : null;
}

/**
 * Passt ein Vergleich zum eigenen Fahrzeug? km höchstens ±30 % (mindestens ±15.000 km),
 * Erstzulassung höchstens ±2 Jahre. Fehlt eine Angabe auf einer Seite, wird dieses
 * Kriterium nicht geprüft (lieber mitzählen und kennzeichnen als still verwerfen).
 */
export function passend(eigen: { km: number | null; erstzulassung: string | null }, v: Vergleich): boolean {
  if (eigen.km !== null && v.km !== null) {
    const spanne = Math.max(15000, eigen.km * 0.3);
    if (Math.abs(v.km - eigen.km) > spanne) return false;
  }
  const a = jahr(eigen.erstzulassung), b = jahr(v.erstzulassung);
  if (a !== null && b !== null && Math.abs(a - b) > 2) return false;
  return true;
}

/** Quantil (linear interpoliert) einer aufsteigend sortierten Liste. */
export function quantil(sortiert: number[], q: number): number {
  if (!sortiert.length) return NaN;
  const pos = (sortiert.length - 1) * q;
  const u = Math.floor(pos), o = Math.ceil(pos);
  return sortiert[u] + (sortiert[o] - sortiert[u]) * (pos - u);
}

export type Lage = {
  aktuell: number;          // Vergleiche der letzten 30 Tage
  veraltet: number;
  passend: number;
  basis: 'passend' | 'alle' | 'zu_wenig';
  anzahl: number;           // Vergleiche in der Rechnung
  median: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
  abweichung: number | null;        // eigener Preis − Median (€)
  abweichungProzent: number | null;
  guenstiger: number | null;        // wie viele Vergleiche sind billiger als der eigene Preis
  stufe: 'ok' | 'warn' | 'bad' | 'info' | 'dim';
  text: string;
  kmText: string | null;
};

/**
 * Marktlage des eigenen Preises. Grundlage: passende aktuelle Vergleiche, wenn es
 * mindestens 3 sind; sonst alle aktuellen (mit Hinweis); unter 3 keine Aussage.
 * Einstufung: bis +5 % über Median grün, bis +15 % gelb, darüber rot; mehr als 10 %
 * unter Median blau („möglicherweise zu günstig").
 */
export function marktLage(eigen: { vk: number | null; km: number | null; erstzulassung: string | null }, liste: Vergleich[], heuteIso: string): Lage {
  const akt = liste.filter((v) => aktuell(v, heuteIso));
  const pas = akt.filter((v) => passend(eigen, v));
  const basis: Lage['basis'] = pas.length >= MIN_VERGLEICHE ? 'passend' : akt.length >= MIN_VERGLEICHE ? 'alle' : 'zu_wenig';
  const leer: Lage = {
    aktuell: akt.length, veraltet: liste.length - akt.length, passend: pas.length, basis, anzahl: 0,
    median: null, min: null, max: null, q1: null, q3: null, abweichung: null, abweichungProzent: null, guenstiger: null,
    stufe: 'dim', text: `Zu wenige aktuelle Vergleiche (${akt.length} von mindestens ${MIN_VERGLEICHE}). Erfassen Sie Angebote ähnlicher Fahrzeuge der letzten ${MAX_TAGE} Tage.`, kmText: null,
  };
  if (basis === 'zu_wenig') return leer;
  const menge = basis === 'passend' ? pas : akt;
  const preise = menge.map((v) => v.preis as number).sort((a, b) => a - b);
  const median = centRunden(quantil(preise, 0.5));
  const lage: Lage = {
    ...leer, anzahl: preise.length, median, min: preise[0], max: preise[preise.length - 1],
    q1: centRunden(quantil(preise, 0.25)), q3: centRunden(quantil(preise, 0.75)), text: '',
  };
  const kms = menge.map((v) => v.km).filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (eigen.km !== null && kms.length >= MIN_VERGLEICHE) {
    const mk = quantil(kms, 0.5);
    if (eigen.km < mk * 0.8) lage.kmText = `Ihr Fahrzeug hat deutlich weniger Kilometer als der Vergleich (Mitte ${Math.round(mk).toLocaleString('de-DE')} km) — ein Preis über der Mitte ist begründbar.`;
    else if (eigen.km > mk * 1.2) lage.kmText = `Ihr Fahrzeug hat deutlich mehr Kilometer als der Vergleich (Mitte ${Math.round(mk).toLocaleString('de-DE')} km) — ein Preis unter der Mitte ist zu erwarten.`;
  }
  const zusatz = basis === 'alle' ? ` Achtung: nur ${pas.length} der Vergleiche passen nach km und Erstzulassung — gerechnet mit allen ${akt.length}.` : '';
  if (eigen.vk === null || !Number.isFinite(eigen.vk) || eigen.vk <= 0) {
    lage.text = `Marktmitte ${median.toLocaleString('de-DE')} € aus ${preise.length} Vergleichen. Ihr Fahrzeug hat noch keinen Preis.${zusatz}`;
    return lage;
  }
  const vk = eigen.vk;
  lage.abweichung = centRunden(vk - median);
  lage.abweichungProzent = Math.round(((vk - median) / median) * 1000) / 10;
  lage.guenstiger = preise.filter((p) => p < vk).length;
  const p = lage.abweichungProzent;
  lage.stufe = p > 15 ? 'bad' : p > 5 ? 'warn' : p < -10 ? 'info' : 'ok';
  const rang = vk <= preise[0] ? 'günstigstes Angebot' : vk >= preise[preise.length - 1] ? 'teuerstes Angebot' : `${lage.guenstiger} von ${preise.length} Vergleichen sind günstiger`;
  const richtung = p === 0 ? 'genau in der Marktmitte' : `${Math.abs(p).toLocaleString('de-DE')} % ${p > 0 ? 'über' : 'unter'} der Marktmitte (${median.toLocaleString('de-DE')} €)`;
  lage.text = `Ihr Preis liegt ${richtung} — ${rang}.${p < -10 ? ' Möglicherweise verschenken Sie Ertrag.' : ''}${zusatz}`;
  return lage;
}

/** Position eines Werts in der Spanne min..max als Prozent 0–100 (für den Balken). */
export function balkenPos(wert: number | null, min: number | null, max: number | null): number | null {
  if (wert === null || min === null || max === null) return null;
  if (max <= min) return 50;
  return Math.max(0, Math.min(100, Math.round(((wert - min) / (max - min)) * 100)));
}
