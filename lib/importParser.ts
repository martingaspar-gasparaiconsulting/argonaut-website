// ============================================================================
// ARGONAUT OS · lib/importParser.ts — Herz des Import-Centers (Stufe 2)
//
// Vier Aufgaben, alle als reine Funktionen (node-testbar, keine Imports):
//   1. CSV zerlegen — Trennzeichen, Anfuehrungszeichen und BOM selbst erkennen
//   2. Werte deutsch verstehen — "1.234,50" ist eine Zahl, "15.08.2026" ein Datum
//   3. Spalten erraten — "Firmenname" gehoert zum Feld "firma", "Mail" zu "email"
//   4. Zeilen pruefen — was fehlt, was ist unbrauchbar, was wird uebernommen
//
// Excel (.xlsx) wird NICHT hier gelesen, sondern serverseitig mit exceljs
// (bereits im Projekt vorhanden) — dort faellt am Ende dieselbe Struktur an:
// eine Kopfzeile plus Zeilen als Text. Ab da laeuft alles durch diese Datei.
// ============================================================================

// ---------------------------------------------------------------------------
// 1) CSV zerlegen
// ---------------------------------------------------------------------------

export type Tabelle = {
  kopf: string[];
  zeilen: string[][];
  trennzeichen: string;
};

const KANDIDATEN = [';', ',', '\t', '|'];

/**
 * Rät das Trennzeichen: gewinnt, wer in den ersten Zeilen am gleichmaessigsten
 * vorkommt. Deutsche Excel-Exporte nutzen Semikolon, englische Komma —
 * ein falsches Raten macht aus einer Preisliste Datenmuell, deshalb wird die
 * Gleichmaessigkeit geprueft und nicht nur die Haeufigkeit.
 */
export function rateTrennzeichen(text: string): string {
  const zeilen = text.split(/\r?\n/).filter((z) => z.trim().length > 0).slice(0, 12);
  if (zeilen.length === 0) return ';';

  let bestes = ';';
  let besteWertung = -1;

  for (const kandidat of KANDIDATEN) {
    const zahlen = zeilen.map((z) => zaehleAusserhalbAnfuehrung(z, kandidat));
    const erste = zahlen[0];
    if (erste === 0) continue;
    const gleich = zahlen.filter((n) => n === erste).length / zahlen.length;
    const wertung = gleich * 100 + Math.min(erste, 40);
    if (wertung > besteWertung) { besteWertung = wertung; bestes = kandidat; }
  }
  return bestes;
}

function zaehleAusserhalbAnfuehrung(zeile: string, zeichen: string): number {
  let n = 0, inAnf = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') { inAnf = !inAnf; continue; }
    if (!inAnf && c === zeichen) n++;
  }
  return n;
}

/**
 * Zerlegt CSV-Text in Kopf + Zeilen. Beherrscht Anfuehrungszeichen,
 * doppelte Anfuehrungszeichen als Escape ("" = ") und Zeilenumbrueche
 * innerhalb eines Feldes — genau das, woran einfache split()-Parser scheitern.
 */
export function leseCsv(rohtext: string, trennzeichen?: string): Tabelle {
  const text = rohtext.replace(/^﻿/, '');          // BOM weg
  const tz = trennzeichen || rateTrennzeichen(text);

  const alleZeilen: string[][] = [];
  let feld = '';
  let zeile: string[] = [];
  let inAnf = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inAnf) {
      if (c === '"') {
        if (text[i + 1] === '"') { feld += '"'; i++; }
        else inAnf = false;
      } else feld += c;
      continue;
    }

    if (c === '"') { inAnf = true; continue; }
    if (c === tz) { zeile.push(feld); feld = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { zeile.push(feld); alleZeilen.push(zeile); zeile = []; feld = ''; continue; }
    feld += c;
  }
  if (feld.length > 0 || zeile.length > 0) { zeile.push(feld); alleZeilen.push(zeile); }

  const gefuellt = alleZeilen.filter((z) => z.some((f) => f.trim().length > 0));
  if (gefuellt.length === 0) return { kopf: [], zeilen: [], trennzeichen: tz };

  const kopf = (gefuellt[0] ?? []).map((h) => h.trim());
  const zeilen = gefuellt.slice(1).map((z) => {
    const kopie = z.map((f) => f.trim());
    while (kopie.length < kopf.length) kopie.push('');
    return kopie.slice(0, Math.max(kopf.length, kopie.length));
  });

  return { kopf, zeilen, trennzeichen: tz };
}

// ---------------------------------------------------------------------------
// 2) Werte deutsch verstehen
// ---------------------------------------------------------------------------

/** "1.234,50" · "1234.50" · "1 234,50 €" · "-12,5%" → Zahl. Sonst null. */
export function leseZahl(wert: unknown): number | null {
  if (typeof wert === 'number') return isNaN(wert) ? null : wert;
  if (wert === null || wert === undefined) return null;
  let s = String(wert).trim();
  if (s === '') return null;
  s = s.replace(/[€$%\s ]/g, '');
  if (s === '' || s === '-') return null;
  const hatKomma = s.includes(',');
  const hatPunkt = s.includes('.');
  if (hatKomma && hatPunkt) {
    // Das hintere Zeichen ist das Dezimaltrennzeichen.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hatKomma) {
    s = s.replace(',', '.');
  } else if (hatPunkt) {
    // "1.234" ohne Nachkommastellen ist in Deutschland ein Tausenderpunkt.
    const teile = s.split('.');
    if (teile.length > 2 || (teile.length === 2 && (teile[1] ?? '').length === 3)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/** "15.08.2026" · "15.8.26" · "2026-08-15" · "15/08/2026" → "2026-08-15". Sonst null. */
export function leseDatum(wert: unknown): string | null {
  if (wert === null || wert === undefined) return null;
  const s = String(wert).trim();
  if (s === '') return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return baue(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const de = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (de) {
    let jahr = Number(de[3]);
    if (jahr < 100) jahr += jahr < 70 ? 2000 : 1900;
    return baue(jahr, Number(de[2]), Number(de[1]));
  }
  return null;

  function baue(j: number, m: number, t: number): string | null {
    if (m < 1 || m > 12 || t < 1 || t > 31 || j < 1900 || j > 2200) return null;
    const d = new Date(Date.UTC(j, m - 1, t));
    if (d.getUTCMonth() !== m - 1 || d.getUTCDate() !== t) return null;   // 31.02. faengt sich hier
    return `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
  }
}

/** "ja" · "x" · "1" · "wahr" · "true" → true · "nein" · "0" · "" → false. */
export function leseJaNein(wert: unknown, standard = false): boolean {
  const s = String(wert ?? '').trim().toLowerCase();
  if (s === '') return standard;
  return ['ja', 'j', 'x', '1', 'true', 'wahr', 'yes', 'y', 'aktiv'].includes(s);
}

// ---------------------------------------------------------------------------
// 3) Die Ziele: welche Felder gibt es, wie heissen sie in fremden Dateien
// ---------------------------------------------------------------------------

export type FeldTyp = 'text' | 'zahl' | 'datum' | 'jaNein';

export type ZielFeld = {
  key: string;
  label: string;
  typ: FeldTyp;
  pflicht?: boolean;
  hinweis?: string;
  /** Schreibweisen, unter denen dieses Feld in fremden Dateien auftaucht. */
  alias: string[];
  standard?: string | number | boolean;
};

export type ImportZiel = {
  key: string;
  label: string;
  icon: string;
  tabelle: string;
  beschreibung: string;
  /** Feld, ueber das Dubletten erkannt werden (leer = keine Dublettenpruefung). */
  schluessel?: string;
  felder: ZielFeld[];
};

export const ZIELE: ImportZiel[] = [
  {
    key: 'kontakte',
    label: 'Kunden & Kontakte',
    icon: '🤝',
    tabelle: 'kontakte',
    beschreibung: 'Kundenliste aus der alten Software oder aus Excel ins CRM übernehmen.',
    schluessel: 'email',
    felder: [
      { key: 'firma', label: 'Firma', typ: 'text', alias: ['firma', 'firmenname', 'unternehmen', 'company', 'kunde', 'kundenname', 'name der firma', 'organisation'] },
      { key: 'vorname', label: 'Vorname', typ: 'text', alias: ['vorname', 'first name', 'firstname', 'rufname'] },
      { key: 'nachname', label: 'Nachname', typ: 'text', alias: ['nachname', 'name', 'last name', 'lastname', 'familienname', 'ansprechpartner'] },
      { key: 'email', label: 'E-Mail', typ: 'text', alias: ['email', 'e-mail', 'mail', 'e mail', 'emailadresse', 'e-mail-adresse'] },
      { key: 'telefon', label: 'Telefon', typ: 'text', alias: ['telefon', 'tel', 'telefonnummer', 'phone', 'festnetz', 'mobil', 'handy'] },
      { key: 'position', label: 'Position', typ: 'text', alias: ['position', 'funktion', 'rolle', 'titel'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'interessent', hinweis: 'interessent · aktiv · kunde · inaktiv', alias: ['status', 'kundenstatus'] },
      { key: 'quelle', label: 'Quelle', typ: 'text', alias: ['quelle', 'herkunft', 'source', 'kanal'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'kommentar', 'anmerkung'] },
    ],
  },
  {
    key: 'artikel',
    label: 'Artikel & Preise',
    icon: '📦',
    tabelle: 'artikel',
    beschreibung: 'Sortiment, Preise und Lagerbestände ins ERP laden.',
    schluessel: 'artikelnummer',
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'artikel', 'artikelbezeichnung', 'name', 'produkt', 'produktname', 'beschreibung kurz', 'titel'] },
      { key: 'artikelnummer', label: 'Artikelnummer', typ: 'text', alias: ['artikelnummer', 'artikelnr', 'artikel-nr', 'art nr', 'artnr', 'nummer', 'sku', 'nr'] },
      { key: 'beschreibung', label: 'Beschreibung', typ: 'text', alias: ['beschreibung', 'langtext', 'details', 'text'] },
      { key: 'kategorie', label: 'Kategorie', typ: 'text', alias: ['kategorie', 'warengruppe', 'gruppe', 'sparte', 'rubrik'] },
      { key: 'einheit', label: 'Einheit', typ: 'text', standard: 'Stk', alias: ['einheit', 'me', 'mengeneinheit', 'verpackungseinheit', 'einh'] },
      { key: 'einkaufspreis', label: 'Einkaufspreis', typ: 'zahl', standard: 0, alias: ['einkaufspreis', 'ek', 'ek-preis', 'ekpreis', 'einkauf', 'nettoeinkauf', 'bezugspreis'] },
      { key: 'verkaufspreis', label: 'Verkaufspreis', typ: 'zahl', standard: 0, alias: ['verkaufspreis', 'vk', 'vk-preis', 'vkpreis', 'preis', 'verkauf', 'listenpreis', 'nettopreis'] },
      { key: 'aktueller_bestand', label: 'Bestand', typ: 'zahl', standard: 0, alias: ['bestand', 'aktueller bestand', 'lagerbestand', 'menge', 'stueckzahl', 'anzahl'] },
      { key: 'mindestbestand', label: 'Mindestbestand', typ: 'zahl', standard: 0, alias: ['mindestbestand', 'meldebestand', 'minbestand', 'min', 'sicherheitsbestand'] },
      { key: 'lagerort', label: 'Lagerort', typ: 'text', alias: ['lagerort', 'lagerplatz', 'regal', 'fach', 'ort'] },
      { key: 'ean', label: 'EAN / Barcode', typ: 'text', alias: ['ean', 'barcode', 'gtin', 'strichcode'] },
      { key: 'aktiv', label: 'Aktiv', typ: 'jaNein', standard: true, alias: ['aktiv', 'status', 'gesperrt'] },
    ],
  },
  {
    key: 'lieferanten',
    label: 'Lieferanten',
    icon: '🏭',
    tabelle: 'lieferanten',
    beschreibung: 'Lieferanten-Stammdaten für Einkauf und Bestellwesen.',
    schluessel: 'name',
    felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true, alias: ['name', 'lieferant', 'firma', 'firmenname', 'unternehmen'] },
      { key: 'ansprechpartner', label: 'Ansprechpartner', typ: 'text', alias: ['ansprechpartner', 'kontakt', 'kontaktperson', 'zustaendig'] },
      { key: 'email', label: 'E-Mail', typ: 'text', alias: ['email', 'e-mail', 'mail', 'e-mail-adresse'] },
      { key: 'telefon', label: 'Telefon', typ: 'text', alias: ['telefon', 'tel', 'telefonnummer', 'phone'] },
      { key: 'adresse', label: 'Adresse', typ: 'text', alias: ['adresse', 'anschrift', 'strasse', 'straße', 'ort'] },
      { key: 'website', label: 'Website', typ: 'text', alias: ['website', 'webseite', 'url', 'internet', 'homepage'] },
      { key: 'kundennummer', label: 'Unsere Kundennummer', typ: 'text', alias: ['kundennummer', 'kundennr', 'kunden-nr', 'unsere nummer'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung', 'kommentar'] },
    ],
  },
  {
    key: 'rechnungen',
    label: 'Offene Posten',
    icon: '🧾',
    tabelle: 'rechnungen',
    beschreibung: 'Unbezahlte Rechnungen aus der alten Buchhaltung übernehmen — damit Mahnwesen und Cashflow von Tag eins stimmen.',
    schluessel: 'rechnungsnummer',
    felder: [
      { key: 'rechnungsnummer', label: 'Rechnungsnummer', typ: 'text', pflicht: true, alias: ['rechnungsnummer', 'rechnungsnr', 'rg-nr', 'rgnr', 'belegnummer', 'beleg-nr', 'nummer', 'nr'] },
      { key: 'titel', label: 'Titel / Betreff', typ: 'text', alias: ['titel', 'betreff', 'bezeichnung', 'leistung', 'text', 'buchungstext'] },
      { key: 'rechnungsdatum', label: 'Rechnungsdatum', typ: 'datum', alias: ['rechnungsdatum', 'datum', 'belegdatum', 'rg-datum'] },
      { key: 'faelligkeitsdatum', label: 'Fällig am', typ: 'datum', alias: ['faelligkeitsdatum', 'fällig am', 'faellig', 'fällig', 'faelligkeit', 'zahlungsziel datum', 'due date'] },
      { key: 'netto_summe', label: 'Netto', typ: 'zahl', standard: 0, alias: ['netto', 'netto summe', 'nettobetrag', 'betrag netto', 'summe netto'] },
      { key: 'mwst_summe', label: 'MwSt', typ: 'zahl', standard: 0, alias: ['mwst', 'ust', 'steuer', 'umsatzsteuer', 'mehrwertsteuer', 'mwst betrag'] },
      { key: 'brutto_summe', label: 'Brutto', typ: 'zahl', standard: 0, hinweis: 'Fehlt Brutto, wird es aus Netto + MwSt gerechnet.', alias: ['brutto', 'brutto summe', 'bruttobetrag', 'betrag', 'gesamt', 'gesamtbetrag', 'summe', 'rechnungsbetrag', 'offener betrag'] },
      { key: 'bezahlter_betrag', label: 'Bereits bezahlt', typ: 'zahl', standard: 0, alias: ['bezahlt', 'bezahlter betrag', 'anzahlung', 'teilzahlung', 'gezahlt'] },
      { key: 'zahlungsstatus', label: 'Status', typ: 'text', standard: 'offen', hinweis: 'offen · teilbezahlt · bezahlt · ueberfaellig', alias: ['status', 'zahlungsstatus', 'zahlstatus'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung', 'kommentar'] },
    ],
  },
];

export function zielDef(key: string): ImportZiel | undefined {
  return ZIELE.find((z) => z.key === key);
}

// ---------------------------------------------------------------------------
// 4) Spalten erraten
// ---------------------------------------------------------------------------

/** Vereinheitlicht Spaltennamen fuer den Vergleich: Umlaute, Zeichen, Leerraum. */
export function normal(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Mapping: Spaltenname aus der Datei -> Zielfeld-Key ('' = nicht importieren). */
export type Mapping = Record<string, string>;

/**
 * Ordnet die Spalten der Datei automatisch den Zielfeldern zu.
 * Drei Stufen: exakter Treffer auf Feldname/Alias, dann Teiltreffer,
 * dann nichts — lieber offen lassen als falsch raten.
 */
export function errateMapping(kopf: string[], zielKey: string): Mapping {
  const ziel = zielDef(zielKey);
  const map: Mapping = {};
  if (!ziel) return map;

  const vergeben = new Set<string>();

  const kandidaten = ziel.felder.map((f) => ({
    key: f.key,
    begriffe: [normal(f.key), normal(f.label), ...f.alias.map(normal)].filter((x) => x.length > 0),
  }));

  // Stufe 1: exakte Treffer
  for (const spalte of kopf) {
    const n = normal(spalte);
    if (!n) continue;
    const treffer = kandidaten.find((k) => !vergeben.has(k.key) && k.begriffe.includes(n));
    if (treffer) { map[spalte] = treffer.key; vergeben.add(treffer.key); }
  }

  // Stufe 2: Teiltreffer (laengster Begriff gewinnt, um "preis" vor "einkaufspreis" zu vermeiden)
  for (const spalte of kopf) {
    if (map[spalte]) continue;
    const n = normal(spalte);
    if (n.length < 2) continue;
    let bester: { key: string; laenge: number } | null = null;
    for (const k of kandidaten) {
      if (vergeben.has(k.key)) continue;
      for (const b of k.begriffe) {
        if (b.length < 3) continue;
        if (n === b || n.includes(b) || b.includes(n)) {
          if (!bester || b.length > bester.laenge) bester = { key: k.key, laenge: b.length };
        }
      }
    }
    if (bester) { map[spalte] = bester.key; vergeben.add(bester.key); }
  }

  for (const spalte of kopf) if (!map[spalte]) map[spalte] = '';
  return map;
}

/** Welche Pflichtfelder sind im Mapping noch nicht zugeordnet? */
export function fehlendePflichtfelder(mapping: Mapping, zielKey: string): ZielFeld[] {
  const ziel = zielDef(zielKey);
  if (!ziel) return [];
  const zugeordnet = new Set(Object.values(mapping).filter(Boolean));
  return ziel.felder.filter((f) => f.pflicht && !zugeordnet.has(f.key));
}

// ---------------------------------------------------------------------------
// 5) Zeilen pruefen und umwandeln
// ---------------------------------------------------------------------------

export type ZeilenFehler = { zeile: number; feld: string; meldung: string };

export type ZeilenErgebnis = {
  /** Fertiger Datensatz zum Speichern — null, wenn die Zeile unbrauchbar ist. */
  werte: Record<string, unknown> | null;
  fehler: ZeilenFehler[];
  warnungen: ZeilenFehler[];
};

/**
 * Wandelt EINE Datei-Zeile in einen Datensatz um.
 * nummer = Zeilennummer wie in Excel (Kopfzeile = 1, erste Datenzeile = 2).
 */
export function pruefeZeile(zielKey: string, mapping: Mapping, kopf: string[], zeile: string[], nummer: number): ZeilenErgebnis {
  const ziel = zielDef(zielKey);
  const fehler: ZeilenFehler[] = [];
  const warnungen: ZeilenFehler[] = [];
  if (!ziel) return { werte: null, fehler: [{ zeile: nummer, feld: '', meldung: 'Unbekanntes Import-Ziel' }], warnungen };

  const roh: Record<string, string> = {};
  kopf.forEach((spalte, i) => {
    const feldKey = mapping[spalte];
    if (feldKey) roh[feldKey] = (zeile[i] ?? '').trim();
  });

  const werte: Record<string, unknown> = {};

  for (const f of ziel.felder) {
    const eingabe = roh[f.key];
    const leer = eingabe === undefined || eingabe === '';

    if (leer) {
      if (f.pflicht) { fehler.push({ zeile: nummer, feld: f.label, meldung: 'Pflichtfeld ist leer' }); continue; }
      if (f.standard !== undefined) werte[f.key] = f.standard;
      continue;
    }

    if (f.typ === 'zahl') {
      const n = leseZahl(eingabe);
      if (n === null) {
        warnungen.push({ zeile: nummer, feld: f.label, meldung: `"${eingabe}" ist keine Zahl — übernommen als ${f.standard ?? 0}` });
        werte[f.key] = f.standard ?? 0;
      } else werte[f.key] = n;
      continue;
    }

    if (f.typ === 'datum') {
      const d = leseDatum(eingabe);
      if (d === null) {
        warnungen.push({ zeile: nummer, feld: f.label, meldung: `"${eingabe}" ist kein erkennbares Datum — Feld bleibt leer` });
      } else werte[f.key] = d;
      continue;
    }

    if (f.typ === 'jaNein') { werte[f.key] = leseJaNein(eingabe, Boolean(f.standard)); continue; }

    werte[f.key] = eingabe;
  }

  // E-Mail-Adressen, die offensichtlich keine sind, gehen nicht durch —
  // sonst laufen spaeter Mahnungen und Newsletter ins Leere.
  for (const key of ['email']) {
    const v = werte[key];
    if (typeof v === 'string' && v !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      warnungen.push({ zeile: nummer, feld: 'E-Mail', meldung: `"${v}" sieht nicht wie eine E-Mail-Adresse aus — Feld bleibt leer` });
      delete werte[key];
    }
  }

  if (fehler.length > 0) return { werte: null, fehler, warnungen };

  nachbereiten(zielKey, werte, nummer, warnungen);

  // Eine Zeile ohne jeden Inhalt ist kein Datensatz.
  const hatInhalt = Object.entries(werte).some(([k, v]) => {
    const feld = ziel.felder.find((x) => x.key === k);
    if (feld && feld.standard !== undefined && v === feld.standard) return false;
    return v !== '' && v !== null && v !== undefined;
  });
  if (!hatInhalt) return { werte: null, fehler: [{ zeile: nummer, feld: '', meldung: 'Zeile enthält keine verwertbaren Daten' }], warnungen };

  return { werte, fehler, warnungen };
}

/** Ziel-spezifische Nacharbeit: rechnen, was der Kunde nicht mitgeliefert hat. */
function nachbereiten(zielKey: string, werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  if (zielKey === 'rechnungen') {
    const netto = typeof werte.netto_summe === 'number' ? werte.netto_summe : 0;
    const mwst = typeof werte.mwst_summe === 'number' ? werte.mwst_summe : 0;
    const brutto = typeof werte.brutto_summe === 'number' ? werte.brutto_summe : 0;

    if (brutto === 0 && (netto !== 0 || mwst !== 0)) {
      werte.brutto_summe = Math.round((netto + mwst) * 100) / 100;
    } else if (brutto !== 0 && netto === 0 && mwst === 0) {
      // Nur Brutto geliefert: mit 19 % zurueckrechnen, aber als Annahme kennzeichnen.
      werte.netto_summe = Math.round((brutto / 1.19) * 100) / 100;
      werte.mwst_summe = Math.round((brutto - (werte.netto_summe as number)) * 100) / 100;
      warnungen.push({ zeile: nummer, feld: 'MwSt', meldung: 'Nur Bruttobetrag geliefert — Netto/MwSt mit 19 % zurückgerechnet' });
    }

    const bezahlt = typeof werte.bezahlter_betrag === 'number' ? werte.bezahlter_betrag : 0;
    const brutto2 = typeof werte.brutto_summe === 'number' ? werte.brutto_summe : 0;
    if (!werte.zahlungsstatus || werte.zahlungsstatus === 'offen') {
      if (bezahlt > 0 && bezahlt < brutto2) werte.zahlungsstatus = 'teilbezahlt';
      else if (bezahlt > 0 && bezahlt >= brutto2 && brutto2 > 0) werte.zahlungsstatus = 'bezahlt';
    }
    const erlaubt = ['offen', 'teilbezahlt', 'bezahlt', 'storniert', 'ueberfaellig'];
    if (typeof werte.zahlungsstatus === 'string' && !erlaubt.includes(werte.zahlungsstatus)) {
      warnungen.push({ zeile: nummer, feld: 'Status', meldung: `"${werte.zahlungsstatus}" ist kein bekannter Status — auf "offen" gesetzt` });
      werte.zahlungsstatus = 'offen';
    }
  }

  if (zielKey === 'kontakte') {
    const erlaubt = ['interessent', 'aktiv', 'kunde', 'inaktiv'];
    if (typeof werte.status === 'string' && !erlaubt.includes(werte.status.toLowerCase())) {
      warnungen.push({ zeile: nummer, feld: 'Status', meldung: `"${werte.status}" ist kein bekannter Status — auf "interessent" gesetzt` });
      werte.status = 'interessent';
    } else if (typeof werte.status === 'string') {
      werte.status = werte.status.toLowerCase();
    }
  }
}

// ---------------------------------------------------------------------------
// 6) Die ganze Datei auf einen Schlag
// ---------------------------------------------------------------------------

export type PruefBericht = {
  gesamt: number;
  gut: number;
  schlecht: number;
  saetze: Record<string, unknown>[];
  fehler: ZeilenFehler[];
  warnungen: ZeilenFehler[];
  dubletten_in_datei: number;
};

/**
 * Prueft alle Zeilen und liefert den fertigen Stapel plus Fehlerbericht.
 * Dubletten INNERHALB der Datei werden erkannt und nur einmal uebernommen —
 * doppelte Kundennummern in Export-Dateien sind der Normalfall, nicht die Ausnahme.
 */
export function pruefeAlles(zielKey: string, mapping: Mapping, kopf: string[], zeilen: string[][]): PruefBericht {
  const ziel = zielDef(zielKey);
  const saetze: Record<string, unknown>[] = [];
  const fehler: ZeilenFehler[] = [];
  const warnungen: ZeilenFehler[] = [];
  const gesehen = new Set<string>();
  let dubletten = 0;

  zeilen.forEach((z, i) => {
    const nummer = i + 2;                       // +2: Kopfzeile ist Zeile 1
    const e = pruefeZeile(zielKey, mapping, kopf, z, nummer);
    warnungen.push(...e.warnungen);
    if (!e.werte) { fehler.push(...e.fehler); return; }

    if (ziel?.schluessel) {
      const s = String(e.werte[ziel.schluessel] ?? '').trim().toLowerCase();
      if (s) {
        if (gesehen.has(s)) {
          dubletten++;
          warnungen.push({ zeile: nummer, feld: ziel.felder.find((f) => f.key === ziel.schluessel)?.label ?? ziel.schluessel, meldung: `"${s}" kommt in der Datei mehrfach vor — nur der erste Eintrag wird übernommen` });
          return;
        }
        gesehen.add(s);
      }
    }
    saetze.push(e.werte);
  });

  return {
    gesamt: zeilen.length,
    gut: saetze.length,
    schlecht: zeilen.length - saetze.length,
    saetze, fehler, warnungen,
    dubletten_in_datei: dubletten,
  };
}
