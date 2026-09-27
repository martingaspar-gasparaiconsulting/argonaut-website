// ============================================================================
// ARGONAUT OS · lib/importMotor.ts — EIN Import-Motor (Umzug Schritt 2)
//
// Stand 27.09.2026. Baut auf lib/importParser.ts auf (CSV lesen, Werte deutsch
// verstehen, Zeilen pruefen) und ergaenzt, was fuer einen echten Umzug fehlte:
//
//  1. FELDKATALOG AUS DER DATENBANK
//     Der feste Katalog (ZIELE) kennt Felder, die es in einer Datenbank noch
//     nicht geben kann (Kundennummer, Land …) — und kennt Spalten nicht, die
//     es laengst gibt. Die Funktion import_feldkatalog() (SQL Paket 124)
//     liefert die ECHTEN Spalten je Tabelle. Der Motor bietet nur an, was es
//     wirklich gibt, und nimmt weitere Datenbank-Spalten automatisch dazu.
//     Ohne das SQL: der alte Katalog ohne die neuen Felder — wie bisher.
//
//  2. NICHTS VERSCHLUCKT
//     Jede Spalte der Datei endet an genau EINER von drei Stellen:
//       · in einem Feld,
//       · als „Eigenes Feld" (eigenes_feld / eigenes_feld_wert, je Betrieb),
//       · in der Liste „nicht übernommen, weil …" — mit Grund.
//     Eine unbekannte Spalte mit Inhalt wird NICHT still weggelassen, sondern
//     standardmaessig als Eigenes Feld uebernommen.
//
//  3. BANKDATEN BLEIBEN DRAUSSEN (GEMEINSAM-Regel)
//     IBAN, BIC, Mandate: nie automatisch, auch nicht als Eigenes Feld. Sie
//     stehen mit Grund in der Liste „nicht übernommen".
//
//  4. DATEV-FORMAT
//     Kopf "EXTF"/"DTVF" wird erkannt; Debitoren/Kreditoren-Stammdaten werden
//     gelesen, Kunden und Lieferanten sauber getrennt (Kontonummernkreis).
//
// Reine Funktionen, keine Netzwerk-Aufrufe, keine Hooks — node-testbar.
// ============================================================================

import {
  leseCsv, normal, leseZahl, leseDatumGenau, errateMappingFuer, zielDef,
  type ImportZiel, type ZielFeld, type Mapping, type FeldTyp, type Tabelle,
} from './importParser';
import { systemAliase, DATEV_SPALTEN_KONTAKTE, DATEV_SPALTEN_LIEFERANTEN } from './altsysteme';

/** Mapping-Wert: diese Spalte als Eigenes Feld uebernehmen. */
export const EIGEN = '@eigen';
/** Mapping-Wert: nicht uebernehmen. */
export const NICHT = '';

/** Die Ziele, fuer die der Motor den Feldkatalog aus der Datenbank laedt. */
export const MOTOR_TABELLEN = ['kontakte', 'lieferanten', 'artikel', 'rechnungen'] as const;

// ---------------------------------------------------------------------------
// 1) Kopfzeile: eindeutige Spaltennamen
// ---------------------------------------------------------------------------

/**
 * Doppelte Spaltennamen eindeutig machen: „Straße", „Straße (2)".
 * Die Zuordnung ist nach Spaltennamen gespeichert — zwei gleichnamige Spalten
 * haetten sich bisher gegenseitig ueberschrieben, und die zweite waere
 * verschluckt worden (DATEV-Stammdaten haben solche Spalten).
 */
export function eindeutigeKoepfe(kopf: readonly string[]): string[] {
  const gesehen = new Map<string, number>();
  return kopf.map((roh, i) => {
    const basis = String(roh ?? '').trim() || `Spalte ${i + 1}`;
    const n = (gesehen.get(basis) ?? 0) + 1;
    gesehen.set(basis, n);
    return n === 1 ? basis : `${basis} (${n})`;
  });
}

// ---------------------------------------------------------------------------
// 2) Feldkatalog aus der Datenbank
// ---------------------------------------------------------------------------

/** Eine Zeile aus import_feldkatalog(). */
export type KatalogSpalte = {
  tabelle: string;
  spalte: string;
  datentyp: string;
  /** NOT NULL ohne Vorgabewert — muss beim Anlegen gefuellt sein. */
  pflicht: boolean;
  /** Berechnete Spalte / Identitaet — darf nicht beschrieben werden. */
  generiert?: boolean;
};

/**
 * Spalten, die der Motor selbst setzt oder die niemand aus einer Datei
 * beschreiben darf (Kennungen, Besitzer, Zeitstempel).
 */
export const SYSTEM_SPALTEN = new Set([
  'id', 'owner_user_id', 'user_id', 'erstellt_von', 'geaendert_von', 'created_by', 'updated_by',
  'created_at', 'updated_at', 'erstellt_am', 'aktualisiert_am', 'geaendert_am', 'deleted_at', 'geloescht_am',
  'standort_id', 'mandant_id', 'tenant_id', 'betrieb_id', 'firma_id', 'lead_id', 'kontakt_id',
]);

/** Postgres-Datentyp -> Feldtyp des Motors (null = nicht aus Dateien befuellbar). */
export function feldTypAusDb(datentyp: string): FeldTyp | null {
  const t = String(datentyp ?? '').toLowerCase();
  if (/^(text|character varying|character|varchar|char|citext)$/.test(t)) return 'text';
  if (/^(integer|bigint|smallint|numeric|real|double precision|decimal)$/.test(t)) return 'zahl';
  if (/^(date|timestamp with time zone|timestamp without time zone|timestamptz|timestamp)$/.test(t)) return 'datum';
  if (t === 'boolean') return 'jaNein';
  return null;   // uuid, json, Arrays, eigene Typen: nicht aus einer Datei
}

/** „letzter_kontakt_am" -> „Letzter Kontakt am". */
export function spaltenLabel(spalte: string): string {
  const s = String(spalte ?? '').replace(/_/g, ' ')
    .replace(/\bae/g, 'ä').replace(/\boe/g, 'ö').replace(/\bue/g, 'ü')
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : spalte;
}

export type KatalogErgebnis = {
  ziel: ImportZiel;
  /** Felder des festen Katalogs, deren Spalte es in DIESER Datenbank nicht gibt. */
  fehlend: ZielFeld[];
  /** Zusaetzliche Felder, die nur die Datenbank kennt. */
  zusatz: ZielFeld[];
  /** true = der Katalog kommt aus der Datenbank, false = fester Katalog (Rueckfall). */
  ausDb: boolean;
};

/**
 * Das Ziel so, wie es in DIESER Datenbank beschreibbar ist.
 *   · ohne Katalog (SQL noch nicht gelaufen): nur die Felder ohne „neu"
 *   · mit Katalog: feste Felder, deren Spalte existiert, + virtuelle Felder,
 *     deren Zielfelder existieren, + alle weiteren einfachen Spalten
 */
export function katalogFuerZiel(zielKey: string, dbSpalten: readonly KatalogSpalte[] | null | undefined): KatalogErgebnis | null {
  const basis = zielDef(zielKey);
  if (!basis) return null;
  const eigene = (dbSpalten ?? []).filter((c) => c.tabelle === basis.tabelle);

  if (eigene.length === 0) {
    const felder = basis.felder.filter((f) => !f.neu);
    return { ziel: { ...basis, felder }, fehlend: basis.felder.filter((f) => f.neu), zusatz: [], ausDb: false };
  }

  const vorhanden = new Map(eigene.map((c) => [c.spalte, c]));
  const nutzbar = (key: string) => {
    const c = vorhanden.get(key);
    return !!c && !c.generiert;
  };
  const felder: ZielFeld[] = [];
  const fehlend: ZielFeld[] = [];
  for (const f of basis.felder) {
    if (f.virtuell === 'name_zerlegen') { (nutzbar('nachname') ? felder : fehlend).push(f); continue; }
    if (f.virtuell === 'adresse_teil') { (nutzbar('adresse') ? felder : fehlend).push(f); continue; }
    if (nutzbar(f.key)) {
      const c = vorhanden.get(f.key)!;
      felder.push(c.pflicht && !f.pflicht && f.standard === undefined ? { ...f, pflicht: true } : f);
    } else fehlend.push(f);
  }

  const bekannt = new Set(basis.felder.map((f) => f.key));
  const zusatz: ZielFeld[] = [];
  for (const c of eigene) {
    if (bekannt.has(c.spalte) || SYSTEM_SPALTEN.has(c.spalte) || c.generiert) continue;
    const typ = feldTypAusDb(c.datentyp);
    if (!typ) continue;
    zusatz.push({
      key: c.spalte,
      label: spaltenLabel(c.spalte),
      typ,
      pflicht: c.pflicht || undefined,
      alias: [c.spalte, spaltenLabel(c.spalte)],
      hinweis: 'Feld aus Ihrer Datenbank',
      nurExakt: true,
    });
  }
  return { ziel: { ...basis, felder: [...felder, ...zusatz] }, fehlend, zusatz, ausDb: true };
}

// ---------------------------------------------------------------------------
// 3) Bankdaten erkennen (GEMEINSAM-Regel)
// ---------------------------------------------------------------------------

const BANK = /\b(iban|bic|swift|blz|bankleitzahl|bank[a-z]*|kontonummer|konto nr|kontonr|kontoinhaber|sepa|mandat[a-z]*|mandatsreferenz|kreditkarte|kartennummer|creditcard|credit card|account number|routing)\b/;

/** Ist das eine Spalte mit Bankverbindung, Mandat oder Kartendaten? */
export function istBankSpalte(spalte: string): boolean {
  return BANK.test(normal(spalte));
}

export const GRUND = {
  bank: 'Bankdaten (IBAN, BIC, Mandate) übernimmt ARGONAUT nur nach gemeinsamer Freigabe — sie bleiben in Ihrer Datei.',
  leer: 'Die Spalte ist in allen Zeilen leer.',
  abgewaehlt: 'Sie haben „nicht übernehmen" gewählt.',
} as const;

// ---------------------------------------------------------------------------
// 4) Zuordnung vorschlagen — nichts faellt still weg
// ---------------------------------------------------------------------------

export type VorschlagOptionen = {
  /** Die angehakten Altsysteme (Reihenfolge = Prioritaet). */
  systeme?: readonly string[];
  /** Die Datei ist eine DATEV-Stammdaten-Datei. */
  datev?: boolean;
};

/** Belegte Spaltennamen aus Altsystemen und DATEV fuer ein Ziel. */
export function zusatzAliase(zielKey: string, opt: VorschlagOptionen = {}): Record<string, string[]> {
  const raus: Record<string, string[]> = {};
  const dazu = (quelle: Record<string, string[]>) => {
    for (const [feld, namen] of Object.entries(quelle)) {
      const liste = (raus[feld] ??= []);
      for (const n of namen) if (!liste.includes(n)) liste.push(n);
    }
  };
  if (opt.datev && zielKey === 'kontakte') dazu(DATEV_SPALTEN_KONTAKTE);
  if (opt.datev && zielKey === 'lieferanten') dazu(DATEV_SPALTEN_LIEFERANTEN);
  dazu(systemAliase(opt.systeme ?? [], zielKey));
  return raus;
}

export function spalteLeer(zeilen: readonly string[][], index: number): boolean {
  return zeilen.every((z) => String(z[index] ?? '').trim() === '');
}

/**
 * Vorschlag fuer die ganze Datei:
 *   erkannt -> Feld · Bankdaten -> nicht (Grund) · leer -> nicht (Grund) ·
 *   alles andere mit Inhalt -> Eigenes Feld.
 */
export function vorschlagMapping(
  kopf: readonly string[],
  zeilen: readonly string[][],
  ziel: ImportZiel,
  opt: VorschlagOptionen = {},
): Mapping {
  const geraten = errateMappingFuer([...kopf], ziel, zusatzAliase(ziel.key, opt));
  const raus: Mapping = {};
  kopf.forEach((spalte, i) => {
    if (istBankSpalte(spalte)) { raus[spalte] = NICHT; return; }
    const feld = geraten[spalte];
    if (feld) { raus[spalte] = feld; return; }
    raus[spalte] = spalteLeer(zeilen, i) ? NICHT : EIGEN;
  });
  return raus;
}

/**
 * Eine Zuordnung, die der Nutzer geaendert (oder aus einem frueheren Import
 * gemerkt) hat, auf das aktuelle Ziel bringen: Felder, die es nicht (mehr)
 * gibt, werden zu Eigenen Feldern; Bankspalten sind immer gesperrt.
 */
export function bereinigeMapping(kopf: readonly string[], mapping: Mapping, ziel: ImportZiel): Mapping {
  const keys = new Set(ziel.felder.map((f) => f.key));
  const raus: Mapping = {};
  const vergeben = new Set<string>();
  for (const spalte of kopf) {
    const wert = mapping[spalte] ?? NICHT;
    if (istBankSpalte(spalte)) { raus[spalte] = NICHT; continue; }
    if (wert === EIGEN || wert === NICHT) { raus[spalte] = wert; continue; }
    if (!keys.has(wert) || vergeben.has(wert)) { raus[spalte] = EIGEN; continue; }
    raus[spalte] = wert; vergeben.add(wert);
  }
  return raus;
}

// ---------------------------------------------------------------------------
// 5) Spalten-Bilanz: wohin ging jede Spalte?
// ---------------------------------------------------------------------------

export type SpaltenEintrag = {
  spalte: string;
  art: 'feld' | 'eigen' | 'nicht';
  /** Label des Zielfelds bzw. des Eigenen Feldes. */
  ziel?: string;
  grund?: string;
};

export type SpaltenBilanz = {
  eintraege: SpaltenEintrag[];
  gesamt: number;
  feld: number;
  eigen: number;
  nicht: number;
  /** muss 0 sein: Spalten ohne jede Zuordnung */
  verschluckt: number;
};

export function spaltenBilanz(
  kopf: readonly string[],
  zeilen: readonly string[][],
  mapping: Mapping,
  ziel: ImportZiel,
): SpaltenBilanz {
  const eintraege: SpaltenEintrag[] = kopf.map((spalte, i) => {
    const wert = mapping[spalte];
    if (istBankSpalte(spalte)) return { spalte, art: 'nicht', grund: GRUND.bank };
    if (wert === EIGEN) return { spalte, art: 'eigen', ziel: spalte };
    if (wert && wert !== NICHT) {
      const f = ziel.felder.find((x) => x.key === wert);
      if (f) return { spalte, art: 'feld', ziel: f.label };
      return { spalte, art: 'eigen', ziel: spalte };
    }
    return { spalte, art: 'nicht', grund: spalteLeer(zeilen, i) ? GRUND.leer : GRUND.abgewaehlt };
  });
  const zaehle = (a: SpaltenEintrag['art']) => eintraege.filter((e) => e.art === a).length;
  const feld = zaehle('feld'); const eigen = zaehle('eigen'); const nicht = zaehle('nicht');
  return { eintraege, gesamt: kopf.length, feld, eigen, nicht, verschluckt: kopf.length - feld - eigen - nicht };
}

// ---------------------------------------------------------------------------
// 6) Eigene Felder
// ---------------------------------------------------------------------------

export type EigeneSpalte = { spalte: string; index: number; typ: 'text' | 'zahl' | 'datum' };

/**
 * Typ eines Eigenen Feldes aus den Werten raten. Vorsichtig: Postleitzahlen
 * und Telefonnummern mit fuehrender Null bleiben Text, sonst wird aus 01067
 * die Zahl 1067.
 */
export function eigenTyp(werte: readonly string[]): 'text' | 'zahl' | 'datum' {
  const w = werte.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (w.length === 0) return 'text';
  if (w.every((x) => /^\d{1,4}[./-]\d{1,2}[./-]\d{2,4}$/.test(x) && leseDatumGenau(x).datum)) return 'datum';
  if (w.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && leseDatumGenau(x).datum)) return 'datum';
  if (w.some((x) => /^0\d/.test(x))) return 'text';
  if (w.every((x) => /^[-+]?[\d.,\s]+(\s?(€|eur|%))?$/i.test(x) && leseZahl(x) !== null)) return 'zahl';
  return 'text';
}

/** Welche Spalten werden Eigene Felder, mit geratenem Typ. */
export function eigeneSpalten(kopf: readonly string[], zeilen: readonly string[][], mapping: Mapping): EigeneSpalte[] {
  const raus: EigeneSpalte[] = [];
  kopf.forEach((spalte, index) => {
    if (mapping[spalte] !== EIGEN || istBankSpalte(spalte)) return;
    raus.push({ spalte, index, typ: eigenTyp(zeilen.map((z) => z[index] ?? '')) });
  });
  return raus;
}

/** Wert fuer eigenes_feld_wert.wert (Text). Datum -> ISO, Zahl -> Punkt-Schreibweise. */
export function eigenerWert(typ: EigeneSpalte['typ'], roh: string): string {
  const s = String(roh ?? '').trim();
  if (!s) return '';
  if (typ === 'datum') return leseDatumGenau(s).datum ?? s;
  if (typ === 'zahl') { const n = leseZahl(s); return n === null ? s : String(n); }
  return s;
}

/** Die Eigenen-Feld-Werte EINER Dateizeile (nur gefuellte). */
export function eigeneWerteDerZeile(zeile: readonly string[], eigene: readonly EigeneSpalte[]): { spalte: string; wert: string }[] {
  const raus: { spalte: string; wert: string }[] = [];
  for (const e of eigene) {
    const wert = eigenerWert(e.typ, zeile[e.index] ?? '');
    if (wert) raus.push({ spalte: e.spalte, wert: wert.slice(0, 5000) });
  }
  return raus;
}

/**
 * Vorhandene Eigene Felder wiederfinden (gleiches Label, Gross/Klein egal) —
 * ein zweiter Import legt kein zweites „Kundengruppe" an.
 */
export function eigeneFelderZuordnen(
  eigene: readonly EigeneSpalte[],
  vorhanden: readonly { id: string; label: string }[],
): { vorhanden: Record<string, string>; neu: EigeneSpalte[] } {
  const nachLabel = new Map(vorhanden.map((f) => [normal(f.label), f.id]));
  const zugeordnet: Record<string, string> = {};
  const neu: EigeneSpalte[] = [];
  for (const e of eigene) {
    const id = nachLabel.get(normal(e.spalte));
    if (id) zugeordnet[e.spalte] = id; else neu.push(e);
  }
  return { vorhanden: zugeordnet, neu };
}

/** Feldtyp in eigenes_feld (dort heisst ja/nein anders). */
export function eigenFeldTyp(typ: EigeneSpalte['typ']): 'text' | 'zahl' | 'datum' {
  return typ;
}

// ---------------------------------------------------------------------------
// 7) Dubletten gegen den Bestand
// ---------------------------------------------------------------------------

/** Welche Erkennungsfelder dieses Ziel in DIESER Datenbank hat. */
export function erkennungsFelder(ziel: ImportZiel): string[] {
  const keys = new Set(ziel.felder.map((f) => f.key));
  const liste = ziel.schluesselFelder ?? (ziel.schluessel ? [ziel.schluessel] : []);
  return liste.filter((k) => keys.has(k));
}

/**
 * Aus den vorhandenen Eintraegen eine Nachschlage-Tabelle „feld:wert" -> id.
 * Der erste Eintrag gewinnt (aelteste id bei order('id')).
 */
export function baueBestandIndex(zeilen: readonly Record<string, unknown>[], felder: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const z of zeilen) {
    const id = z?.id;
    if (id === undefined || id === null) continue;
    for (const f of felder) {
      const v = String(z[f] ?? '').trim().toLowerCase();
      if (v && !index.has(`${f}:${v}`)) index.set(`${f}:${v}`, String(id));
    }
  }
  return index;
}

/** Den vorhandenen Eintrag zu einem Satz finden — ueber irgendein Erkennungsfeld. */
export function findeImBestand(satz: Record<string, unknown>, felder: readonly string[], index: Map<string, string>): string | undefined {
  for (const f of felder) {
    const v = String(satz[f] ?? '').trim().toLowerCase();
    if (!v) continue;
    const id = index.get(`${f}:${v}`);
    if (id) return id;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 8) DATEV-Format
// ---------------------------------------------------------------------------

export type DatevKopf = {
  kennzeichen: 'EXTF' | 'DTVF';
  version: number | null;
  kategorie: number | null;
  formatname: string;
  sachkontenlaenge: number | null;
};

/** DATEV-Formatkategorien, die Martins Kunden mitbringen. */
export const DATEV_KATEGORIEN: Record<number, string> = {
  16: 'Debitoren/Kreditoren',
  20: 'Kontenbeschriftungen',
  21: 'Buchungsstapel',
  46: 'Zahlungsbedingungen',
  48: 'Diverse Adressen',
  65: 'Wiederkehrende Buchungen',
};

function ohneAnf(s: string): string {
  return String(s ?? '').trim().replace(/^"(.*)"$/, '$1').trim();
}

/** Erste Zeile „EXTF";700;16;"Debitoren/Kreditoren";5;… erkennen. */
export function erkenneDatev(text: string): DatevKopf | null {
  const erste = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const teile = erste.split(';').map(ohneAnf);
  const k = (teile[0] ?? '').toUpperCase();
  if (k !== 'EXTF' && k !== 'DTVF') return null;
  const zahl = (x: string | undefined) => { const n = Number.parseInt(String(x ?? ''), 10); return Number.isFinite(n) ? n : null; };
  return {
    kennzeichen: k as 'EXTF' | 'DTVF',
    version: zahl(teile[1]),
    kategorie: zahl(teile[2]),
    formatname: teile[3] ?? '',
    sachkontenlaenge: zahl(teile[13]),
  };
}

/**
 * Eine DATEV-Datei lesen: die erste Zeile ist der Formatkopf, die zweite die
 * Spaltennamen, danach die Daten (Semikolon). Liefert dieselbe Tabelle wie
 * leseCsv — plus den erkannten Kopf und, was nicht importierbar ist.
 */
export function leseDatev(text: string): { tabelle: Tabelle; kopf: DatevKopf; fehler: string | null } | null {
  const kopf = erkenneDatev(text);
  if (!kopf) return null;
  const rest = String(text).replace(/^﻿/, '').replace(/^[^\n]*\n/, '');
  const tabelle = leseCsv(rest, ';');
  tabelle.kopf = eindeutigeKoepfe(tabelle.kopf);
  let fehler: string | null = null;
  if (kopf.kategorie !== null && kopf.kategorie !== 16) {
    const name = DATEV_KATEGORIEN[kopf.kategorie] ?? kopf.formatname ?? `Kategorie ${kopf.kategorie}`;
    fehler = kopf.kategorie === 21
      ? 'Das ist ein DATEV-Buchungsstapel (Buchungen), keine Stammdaten. Für den Umzug brauchen wir die Debitoren/Kreditoren: in DATEV „Bestand" › „Exportieren" › „DATEV-Format" › Reiter „Stammdaten".'
      : `Diese DATEV-Datei enthält „${name}". Übernommen werden Debitoren/Kreditoren (Stammdaten) — bitte diesen Export wählen.`;
  }
  return { tabelle, kopf, fehler };
}

export type KontoArt = 'debitor' | 'kreditor' | 'sachkonto' | 'unbekannt';

/**
 * Debitor oder Kreditor? Personenkonten sind eine Stelle laenger als die
 * Sachkonten (bei Sachkontenlaenge 4: fuenfstellig). 1…–6… = Debitor,
 * 7…–9… = Kreditor. Ohne bekannte Laenge: ab fuenf Stellen nach der ersten Ziffer.
 */
export function datevKontoArt(konto: unknown, sachkontenlaenge?: number | null): KontoArt {
  const s = String(konto ?? '').replace(/\s/g, '');
  if (!/^\d+$/.test(s)) return 'unbekannt';
  const laenge = sachkontenlaenge && sachkontenlaenge >= 4 && sachkontenlaenge <= 8 ? sachkontenlaenge : null;
  const person = laenge ? s.length === laenge + 1 : s.length >= 5;
  if (!person) return 'sachkonto';
  const erste = Number(s[0]);
  if (erste >= 1 && erste <= 6) return 'debitor';
  if (erste >= 7 && erste <= 9) return 'kreditor';
  return 'unbekannt';
}

/**
 * Ablehnung fuer pruefeAlles(opt.ablehnen): In einer DATEV-Datei, die als
 * Kunden importiert wird, sind Kreditoren falsch — und umgekehrt. Die Zeile
 * wird nicht verschluckt, sondern mit Grund gemeldet.
 */
export function datevAblehnung(
  zielKey: string,
  kontoIndex: number,
  sachkontenlaenge?: number | null,
): ((zeile: string[]) => { feld: string; grund: string } | null) | undefined {
  if (kontoIndex < 0 || (zielKey !== 'kontakte' && zielKey !== 'lieferanten')) return undefined;
  return (zeile: string[]) => {
    const konto = String(zeile[kontoIndex] ?? '').trim();
    const art = datevKontoArt(konto, sachkontenlaenge);
    if (zielKey === 'kontakte' && art === 'kreditor') {
      return { feld: 'Konto', grund: `Konto ${konto} ist ein Kreditor (Lieferant) — diese Zeile kommt beim Import als „Lieferanten" an.` };
    }
    if (zielKey === 'lieferanten' && art === 'debitor') {
      return { feld: 'Konto', grund: `Konto ${konto} ist ein Debitor (Kunde) — diese Zeile kommt beim Import als „Kunden & Kontakte" an.` };
    }
    return null;
  };
}

/** Zaehlt Debitoren und Kreditoren einer DATEV-Datei (fuer den Hinweis). */
export function datevZaehlen(zeilen: readonly string[][], kontoIndex: number, sachkontenlaenge?: number | null) {
  let debitoren = 0; let kreditoren = 0; let sonst = 0;
  for (const z of zeilen) {
    const a = datevKontoArt(z[kontoIndex], sachkontenlaenge);
    if (a === 'debitor') debitoren++; else if (a === 'kreditor') kreditoren++; else sonst++;
  }
  return { debitoren, kreditoren, sonst };
}

// ---------------------------------------------------------------------------
// 9) Welche Datei ist das? (Weg zum Lesen)
// ---------------------------------------------------------------------------

export type DateiArt = 'csv' | 'xls' | 'xlsx' | 'unbekannt';

/** Nach Dateiendung und — bei .xls — nach dem Inhalt (manche .xls sind in Wahrheit CSV/HTML). */
export function dateiArt(name: string, anfang?: Uint8Array): DateiArt {
  const endung = String(name ?? '').toLowerCase().split('.').pop() ?? '';
  const ole = !!anfang && anfang.length >= 8 && anfang[0] === 0xd0 && anfang[1] === 0xcf && anfang[2] === 0x11 && anfang[3] === 0xe0;
  const zip = !!anfang && anfang.length >= 2 && anfang[0] === 0x50 && anfang[1] === 0x4b;
  if (endung === 'xls') return ole ? 'xls' : zip ? 'xlsx' : anfang ? 'csv' : 'xls';
  if (endung === 'xlsx' || endung === 'xlsm') return 'xlsx';
  if (endung === 'csv' || endung === 'txt' || endung === 'tsv' || endung === '') return 'csv';
  if (ole) return 'xls';
  return 'unbekannt';
}
