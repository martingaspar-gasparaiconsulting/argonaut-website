// ============================================================================
// ARGONAUT OS · lib/datevExtf.ts — echter DATEV-EXTF-Buchungsstapel
// (Abschnitt 4 · Buchhaltung — „DATEV-EXTF echt machen")
//
// Erzeugt einen importfähigen DATEV-Buchungsstapel im EXTF-Format:
//   · Kopfzeile:  "EXTF";700;21;"Buchungsstapel";13; … (Berater/Mandant/WJ/…)
//   · Feldnamen-Zeile (genormte Spalten des Buchungsstapels)
//   · Buchungszeilen für BEIDE Richtungen:
//       - Ausgangsrechnungen  → Debitor SOLL an Erlöskonto (BU 3=19% / 2=7%)
//       - Eingangsbelege(OCR) → Aufwandskonto SOLL an Kreditor (BU 9=19% / 8=7% Vorsteuer)
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE Hooks — nur pure, node-testbare
// Funktionen. Die Route liest die Zeilen (RLS-scoped) + die DATEV-Konfig und
// ruft baueExtf(). Zeitstempel/Datum werden hereingereicht (deterministisch).
// ============================================================================

export type ExtfKonfig = {
  beraterNr: string;      // DATEV-Beraternummer (Pflicht für echten Import)
  mandantNr: string;      // DATEV-Mandantennummer
  wjBeginn: string;       // Wirtschaftsjahr-Beginn YYYYMMDD
  sachkontenlaenge: number; // i. d. R. 4
  skr: '03' | '04';       // Kontenrahmen
  erloeskonto19: string;  // Erlöse 19 %
  erloeskonto7: string;   // Erlöse 7 %
  debitorSammel: string;  // Debitoren-Sammelkonto (Ausgangsrechnungen)
  kreditorSammel: string; // Kreditoren-Sammelkonto (Eingangsbelege)
  bezeichnung: string;    // Name des Buchungsstapels
};

/** Sinnvolle Standardwerte je Kontenrahmen; Konfig überschreibt. */
export function extfDefaults(skr: '03' | '04'): Pick<ExtfKonfig, 'erloeskonto19' | 'erloeskonto7' | 'debitorSammel' | 'kreditorSammel'> {
  return skr === '04'
    ? { erloeskonto19: '4400', erloeskonto7: '4300', debitorSammel: '10000', kreditorSammel: '70000' }
    : { erloeskonto19: '8400', erloeskonto7: '8300', debitorSammel: '10000', kreditorSammel: '70000' };
}

// --- kleine Helfer ----------------------------------------------------------

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
}
/** Betrag DATEV-konform: 2 Nachkommastellen, Komma als Dezimaltrenner, ohne Vorzeichen. */
export function extfBetrag(v: unknown): string {
  return Math.abs(Math.round(n(v) * 100) / 100).toFixed(2).replace('.', ',');
}
/** Text als DATEV-Feld: immer in Anführungszeichen, interne " verdoppelt, gekürzt. */
function q(v: unknown, max = 60): string {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, max).replace(/"/g, '""');
  return `"${s}"`;
}
/** Belegdatum als TTMM (Wirtschaftsjahr steckt im Kopf). */
export function extfBelegdatum(iso: unknown): string {
  const d = new Date(String(iso || ''));
  if (isNaN(d.getTime())) return '';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}`;
}
/** Steuersatz aus netto/ust schätzen: 19, 7 oder 0. */
export function satzAus(netto: unknown, ust: unknown): 0 | 7 | 19 {
  const nt = n(netto), us = n(ust);
  if (us <= 0 || nt <= 0) return 0;
  const p = us / nt;
  if (Math.abs(p - 0.19) < 0.02) return 19;
  if (Math.abs(p - 0.07) < 0.02) return 7;
  return p > 0.13 ? 19 : 7;
}

// --- Spalten des Buchungsstapels (Format 13, erste 14 = importfähiger Kern) --
export const EXTF_SPALTEN: string[] = [
  'Umsatz (ohne Soll/Haben-Kz)', 'Soll/Haben-Kennzeichen', 'WKZ Umsatz', 'Kurs',
  'Basis-Umsatz', 'WKZ Basis-Umsatz', 'Konto', 'Gegenkonto (ohne BU-Schlüssel)',
  'BU-Schlüssel', 'Belegdatum', 'Belegfeld 1', 'Belegfeld 2', 'Skonto', 'Buchungstext',
];

export type Buchung = {
  umsatz: number; sh: 'S' | 'H'; konto: string; gegenkonto: string; bu: string;
  belegdatum: string; belegfeld1: string; belegfeld2: string; buchungstext: string;
};

/** Eine Buchung als EXTF-Datenzeile (14 Spalten, genau zu EXTF_SPALTEN). */
export function buchungZeile(b: Buchung): string {
  return [
    extfBetrag(b.umsatz), q(b.sh, 1), q('EUR', 3), '', '', '',
    b.konto, b.gegenkonto, b.bu || '', b.belegdatum,
    q(b.belegfeld1, 36), q(b.belegfeld2, 12), '', q(b.buchungstext, 60),
  ].join(';');
}

export type RechnungRoh = {
  rechnungsnummer?: unknown; rechnungsdatum?: unknown; empfaenger_name?: unknown;
  netto_summe?: unknown; mwst_summe?: unknown; brutto_summe?: unknown;
};
export type BelegRoh = {
  belegnummer?: unknown; belegdatum?: unknown; lieferant?: unknown;
  netto?: unknown; ust_betrag?: unknown; brutto?: unknown;
  kategorie?: unknown; datev_konto?: unknown;
};

/** Ausgangsrechnung → Buchung (Debitor SOLL an Erlöskonto, BU 3/2). */
export function buchungAusRechnung(r: RechnungRoh, k: ExtfKonfig): Buchung {
  const satz = satzAus(r.netto_summe, r.mwst_summe);
  const bu = satz === 19 ? '3' : satz === 7 ? '2' : '';
  const gegenkonto = satz === 7 ? k.erloeskonto7 : k.erloeskonto19;
  return {
    umsatz: n(r.brutto_summe), sh: 'S', konto: k.debitorSammel, gegenkonto, bu,
    belegdatum: extfBelegdatum(r.rechnungsdatum),
    belegfeld1: String(r.rechnungsnummer ?? ''), belegfeld2: '',
    buchungstext: `Rechnung ${String(r.empfaenger_name ?? '')}`.trim(),
  };
}

/** Eingangsbeleg → Buchung (Aufwandskonto SOLL an Kreditor, BU 9/8 Vorsteuer). */
export function buchungAusBeleg(b: BelegRoh, k: ExtfKonfig, aufwandFallback: string): Buchung {
  const satz = satzAus(b.netto, b.ust_betrag);
  const bu = satz === 19 ? '9' : satz === 7 ? '8' : ''; // 9=19% VSt, 8=7% VSt
  const konto = String(b.datev_konto || aufwandFallback);
  return {
    umsatz: n(b.brutto), sh: 'S', konto, gegenkonto: k.kreditorSammel, bu,
    belegdatum: extfBelegdatum(b.belegdatum),
    belegfeld1: String(b.belegnummer ?? ''), belegfeld2: '',
    buchungstext: `ER ${String(b.lieferant ?? '')}`.trim(),
  };
}

/** EXTF-Kopfzeile (31 Felder, Format 700 / Kategorie 21 / Version 13). */
export function baueExtfKopf(k: ExtfKonfig, datumVon: string, datumBis: string, erzeugtAm: string): string {
  const felder: string[] = [
    '"EXTF"', '700', '21', '"Buchungsstapel"', '13',
    erzeugtAm,               // 6  Erzeugt am (YYYYMMDDHHMMSSFFF)
    '',                      // 7  Importiert
    '""',                    // 8  Herkunft
    '""',                    // 9  Exportiert von
    '""',                    // 10 Importiert von
    String(k.beraterNr || ''),   // 11 Berater
    String(k.mandantNr || ''),   // 12 Mandant
    k.wjBeginn,              // 13 WJ-Beginn YYYYMMDD
    String(k.sachkontenlaenge || 4), // 14 Sachkontenlänge
    datumVon,                // 15 Datum von YYYYMMDD
    datumBis,                // 16 Datum bis YYYYMMDD
    q(k.bezeichnung, 30),    // 17 Bezeichnung
    '""',                    // 18 Diktatkürzel
    '1',                     // 19 Buchungstyp (1 = Finanzbuchführung)
    '0',                     // 20 Rechnungslegungszweck
    '0',                     // 21 Festschreibung (0 = nicht festgeschrieben, Steuerberater kann prüfen)
    '"EUR"',                 // 22 WKZ
    '', '', '', '',          // 23-26
    '', '', '', '',          // 27-30
    '',                      // 31
  ];
  return felder.join(';');
}

export type ExtfEingabe = {
  rechnungen: RechnungRoh[];
  belege: BelegRoh[];
  konfig: ExtfKonfig;
  aufwandFallback: string;   // Standard-Aufwandskonto, wenn Beleg keins hat
  datumVon: string;          // YYYYMMDD
  datumBis: string;          // YYYYMMDD
  erzeugtAm: string;         // YYYYMMDDHHMMSSFFF
};

/**
 * Kompletter EXTF-Buchungsstapel als String (mit UTF-8-BOM, CRLF-Zeilenenden).
 * Zeile 1 = EXTF-Kopf, Zeile 2 = Spaltennamen, danach je eine Buchung.
 */
export function baueExtf(e: ExtfEingabe): string {
  const zeilen: string[] = [];
  zeilen.push(baueExtfKopf(e.konfig, e.datumVon, e.datumBis, e.erzeugtAm));
  zeilen.push(EXTF_SPALTEN.join(';'));
  for (const r of e.rechnungen || []) zeilen.push(buchungZeile(buchungAusRechnung(r, e.konfig)));
  for (const b of e.belege || []) zeilen.push(buchungZeile(buchungAusBeleg(b, e.konfig, e.aufwandFallback)));
  return '﻿' + zeilen.join('\r\n') + '\r\n';
}
