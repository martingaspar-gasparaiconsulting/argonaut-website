// ============================================================
// ARGONAUT OS · lib/datanormLeser.ts — Umzug Schritt 7: DATANORM 4 und 5
// (Paket 149, 28.09.2026)
//
// Grosshaendler und Hersteller (Elektro, SHK, Bau, Holz …) liefern Artikel
// und Preise als DATANORM: DATANORM.001 (Artikelstamm), DATPREIS.001
// (Preisaenderungen), DATANORM.WRG/.RAB (Waren-/Rabattgruppen). Dieser Leser
// macht daraus eine Tabelle mit den ARGONAUT-Feldnamen der Artikel
// (Kopfzeile = Feldnamen), die danach durch den normalen Import-Motor laeuft
// (Zuordnung, Pruefung, Rueckgaengig). Nichts wird verschluckt: Angaben ohne
// eigenes Feld (Rabattgruppe, Matchcode, Originalpreis je Preiseinheit …)
// kommen als eigene Spalten mit; was nicht ausgewertet wird, steht in den
// Hinweisen — mit Anzahl.
//
// Grundlage (recherchiert 28.09.2026, oeffentlich zugaengliche Teile der
// Spezifikation + echte Beispieldateien):
//  * DATANORM 4: Vorlaufsatz V mit fester Breite (Datum TTMMJJ ab Zeichen 3,
//    Version „04" an Zeichen 124–125, Waehrung 126–128); alle anderen Saetze
//    mit Semikolon.
//    A: A;VK;Artikelnr;Textkennz.;Kurztext1;Kurztext2;Preiskennz.;
//       Preiseinheit(0=1,1=10,2=100,3=1000);Mengeneinheit;Preis(2 Nachkommastellen
//       ohne Komma);Rabattgruppe;Hauptwarengruppe;Langtextschluessel
//    B: B;VK;Artikelnr;Matchcode;Alt.-Artikelnr;Katalogseite;Kupfer(3 Felder);
//       EAN;Anbindungsnr;Warengruppe;Kostenart;Verpackungsmenge;Ref.-Kuerzel;Ref.-Nr
//    P: bis zu drei Bloecke je Zeile ab Feld 3/12/21:
//       Artikelnr;Preiskennz.;Preis;Rabattkennz.;Rabatt
//    T: T;VK;Textnr;;Zeile;;Text;Zeile;;Text      D: D;VK;Artikelnr;Zeile;UK;;Text;Zeile;UK;;Text
//    Preiskennzeichen 1 = Bruttopreis (Listenpreis), 2 = Nettopreis.
//    Verarbeitungskennzeichen N/A = anlegen/aendern, L = Loeschung,
//    X = Artikelnummernaenderung.
//  * DATANORM 5: Vorlaufsatz „V;050;…" mit Semikolon, Preiseinheit wird direkt
//    eingetragen, B-Satz nur noch fuer Loeschungen.
//    A: A;VK;Artikelnr;Kurztext1;Kurztext2;Mengeneinheit;Preiskennz.;
//       Preiseinheit;Preis;Rabattgruppe;Hauptwarengruppe;Warengruppe;…;
//       Langtextschluessel (Feld 24)
//    T: T;VK;Textnr;Art;Zeile;Text     D: D;VK;Artikelnr;Zeile;UK;;Text
//  * Zeichensatz CP850 (DOS); manche Programme schreiben Windows-1252 oder UTF-8.
//
// Bewusst NICHT geraten (oeffentlich nicht belegt): Reihenfolge Preiskennzeichen/
// Preiseinheit im DATANORM-5-A-Satz (wird am Wert unterschieden, sonst Warnung),
// der DATANORM-5-P-Satz, Rabatt-Rechenregeln, R-/S-Saetze. Diese Angaben bleiben
// als Rohwert erhalten oder werden gezaehlt gemeldet.
// Reine Logik, node-getestet.
// ============================================================

import { leseZahl } from './zahlen';

export type DatanormErgebnis = {
  kopf: string[];
  zeilen: string[][];
  anzahl: number;
  hinweise: string[];
  version: 4 | 5 | null;
  zeichensatz: string;
};

/** Obere Haelfte der Codepage 850 (0x80–0xFF), aus der Referenztabelle erzeugt. */
const CP850 =
  'ÇüéâäàåçêëèïîìÄÅ' +
  'ÉæÆôöòûùÿÖÜø£Ø×ƒ' +
  'áíóúñÑªº¿®¬½¼¡«»' +
  '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐' +
  '└┴┬├─┼ãÃ╚╔╩╦╠═╬¤' +
  'ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀' +
  'ÓßÔÒõÕµþÞÚÛÙýÝ¯´' +
  '­±‗¾¶§÷¸°¨·¹³²■ ';

/** Typische deutsche Sonderzeichen: ä ö ü ß Ä Ö Ü in CP850 bzw. Windows-1252. */
const UMLAUT_850 = new Set([0x84, 0x94, 0x81, 0xe1, 0x8e, 0x99, 0x9a]);
const UMLAUT_1252 = new Set([0xe4, 0xf6, 0xfc, 0xdf, 0xc4, 0xd6, 0xdc]);

function cp850(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    s += b < 0x80 ? String.fromCharCode(b) : CP850[b - 0x80];
  }
  return s;
}

/** DATANORM-Bytes lesen: UTF-8, sonst CP850 (Standard) oder Windows-1252 — je nachdem, welche Umlaute vorkommen. */
export function dekodiereDatanorm(bytes: Uint8Array): { text: string; zeichensatz: 'UTF-8' | 'CP850' | 'Windows-1252' } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), zeichensatz: 'UTF-8' };
  } catch { /* weiter */ }
  let p850 = 0, p1252 = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) continue;
    if (UMLAUT_850.has(b)) p850++;
    if (UMLAUT_1252.has(b)) p1252++;
  }
  if (p1252 > p850) return { text: new TextDecoder('windows-1252').decode(bytes), zeichensatz: 'Windows-1252' };
  return { text: cp850(bytes), zeichensatz: 'CP850' };
}

/** Ist das eine DATANORM-Datei? (Dateiname wie DATANORM.001/DATPREIS.001/.WRG/.RAB oder Vorlaufsatz) */
export function istDatanorm(dateiname: string, anfang: string | Uint8Array): boolean {
  if (DN_NAME.test(String(dateiname ?? '').split(/[\\/]/).pop() ?? '')) return true;
  const text = typeof anfang === 'string' ? anfang : cp850(anfang.subarray(0, 400));
  const erste = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  if (/^V;0?5\d?;/i.test(erste)) return true;
  if (/^V/.test(erste) && !erste.slice(0, 10).includes(';') && /^0[34]$/.test(erste.slice(123, 125))) return true;
  return false;
}

/** Dateiendungen fuer das accept-Attribut der Dateiauswahl */
export const DATANORM_ENDUNGEN = '.001,.002,.003,.004,.005,.006,.007,.008,.009,.wrg,.rab';

const DN_NAME = /^(datanorm|datpreis)\.(\d{3}|wrg|rab)$/i;

/**
 * Welche der gewaehlten Dateien sind DATANORM-Teile — und in welcher Reihenfolge
 * gehoeren sie zusammen? Erst DATANORM.001, .002 …, dann DATPREIS.001 …, dann
 * .WRG und .RAB. Liefert die Positionen in der Liste (leer, wenn keine dabei ist).
 */
export function datanormReihenfolge(namen: readonly string[]): number[] {
  const rang = (n: string): number => {
    const m = DN_NAME.exec(n.split(/[\\/]/).pop() ?? '');
    if (!m) return -1;
    const vorne = m[1].toLowerCase() === 'datanorm' ? 0 : 1;
    const hinten = /^\d{3}$/.test(m[2]) ? Number(m[2]) : m[2].toLowerCase() === 'wrg' ? 1000 : 1001;
    return hinten >= 1000 ? 2000 + hinten : vorne * 1000 + hinten;
  };
  return namen.map((n, i) => ({ i, r: rang(n) })).filter((x) => x.r >= 0).sort((a, b) => a.r - b.r).map((x) => x.i);
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/** Ein Feld: trimmen; ein einzelnes Leerzeichen bedeutet in DATANORM „leer". */
const feld = (f: string[], i: number): string => (f[i] ?? '').trim();

/** Preis lesen: nur Ziffern = zwei Nachkommastellen ohne Komma (1590 = 15,90); mit Komma/Punkt = Dezimalzahl. */
export function lesePreisDatanorm(roh: string): number | null {
  const s = String(roh ?? '').trim().replace(/\s/g, '');
  if (s === '') return null;
  if (/^-?\d+$/.test(s)) return Number(s) / 100;
  return leseZahl(s);
}

/** Zahl deutsch schreiben: mindestens 2, hoechstens 4 Nachkommastellen („0,1234", „12,50"). */
export function zahlDeDatanorm(n: number): string {
  const vier = Math.round(n * 10000) / 10000;
  let t = vier.toFixed(4);
  while (t.endsWith('0') && t.split('.')[1].length > 2) t = t.slice(0, -1);
  return t.replace('.', ',');
}

/** DATANORM-4-Preiseinheit: 0 = je 1, 1 = je 10, 2 = je 100, 3 = je 1000 */
function preiseinheitV4(code: string): number | null {
  if (code === '' || code === '0') return 1;
  if (code === '1') return 10;
  if (code === '2') return 100;
  if (code === '3') return 1000;
  return null;
}

type Preisart = 'brutto' | 'netto' | 'anfrage' | 'unbekannt';

function preisart(pkz: string): Preisart {
  if (pkz === '1') return 'brutto';
  if (pkz === '2') return 'netto';
  if (pkz === '9') return 'anfrage';
  return 'unbekannt';
}

type Artikel = {
  nr: string;
  kurz1: string; kurz2: string;
  einheit: string;
  preis: number | null; preisart: Preisart; pkzRoh: string; pe: number;
  rabattgruppe: string; hauptwarengruppe: string; warengruppe: string;
  langtextSchluessel: string;
  matchcode: string; altNr: string; katalogseite: string; ean: string; eanRoh: string; vpe: string;
  preisBrutto: number | null; preisNetto: number | null;
  preisdateiRabatt: string;
  mehrdeutigPe: boolean;
};

const leerArtikel = (nr: string): Artikel => ({
  nr, kurz1: '', kurz2: '', einheit: '', preis: null, preisart: 'unbekannt', pkzRoh: '', pe: 1,
  rabattgruppe: '', hauptwarengruppe: '', warengruppe: '', langtextSchluessel: '',
  matchcode: '', altNr: '', katalogseite: '', ean: '', eanRoh: '', vpe: '',
  preisBrutto: null, preisNetto: null, preisdateiRabatt: '', mehrdeutigPe: false,
});

type Textzeile = { nr: number; text: string; einfuegen?: string };

const RABATTART: Record<string, string> = { '0': 'Rabattgruppe', '1': 'Rabattsatz', '2': 'Multi', '3': 'Teuerungszuschlag' };

// Die Kopfzeile: erst die ARGONAUT-Feldnamen (Ziel „Artikel & Preise"), dann eigene Spalten.
const KOPF_FELDER = ['artikelnummer', 'bezeichnung', 'beschreibung', 'kategorie', 'einheit', 'verkaufspreis', 'einkaufspreis', 'ean'] as const;
const EXTRA = [
  ['rabattgruppe', 'Rabattgruppe'],
  ['hauptwarengruppe', 'Hauptwarengruppe'],
  ['originalpreis', 'Datanorm-Originalpreis je Preiseinheit'],
  ['preisart', 'Datanorm-Preisart'],
  ['matchcode', 'Matchcode'],
  ['altNr', 'Alternative Artikelnummer'],
  ['katalogseite', 'Katalogseite'],
  ['vpe', 'Verpackungsmenge'],
  ['eanRoh', 'EAN laut Datei (ungültig)'],
  ['preisdateiRabatt', 'Datanorm-Rabattangabe'],
] as const;

/**
 * DATANORM (4 oder 5) lesen. Mehrere Dateien (DATANORM.001 + DATPREIS.001)
 * duerfen hintereinander gehaengt uebergeben werden — ein weiterer Vorlaufsatz
 * stellt die Version fuer die folgenden Zeilen neu ein.
 */
export function leseDatanorm(eingabe: string | Uint8Array): DatanormErgebnis {
  const dek = typeof eingabe === 'string' ? { text: eingabe, zeichensatz: 'Text' } : dekodiereDatanorm(eingabe);
  const zeilenRoh = dek.text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const hinweise: string[] = [];

  let version: 4 | 5 | null = null;
  let ersteVersion: 4 | 5 | null = null;
  let v3 = false;
  const artikel = new Map<string, Artikel>();
  const texte = new Map<string, Textzeile[]>();      // T-Saetze je Textnummer
  const dims = new Map<string, Textzeile[]>();       // D-Saetze je Artikelnummer
  const geloescht = new Set<string>();
  let nummernAenderung = 0;
  const preisOhneArtikel: string[] = [];
  const preiseAusDatei = new Map<string, { art: Preisart; preis: number | null; rabatt: string }[]>();
  const nichtAusgewertet = new Map<string, number>();
  let v5Preissaetze = 0;
  let saetzeSeitV = 0;                                 // fuer den Endesatz (Vollstaendigkeit)
  const unvollstaendig: string[] = [];
  let unbekanntePe = 0;

  const zaehle = (art: string) => nichtAusgewertet.set(art, (nichtAusgewertet.get(art) ?? 0) + 1);
  const hol = (nr: string) => { let a = artikel.get(nr); if (!a) { a = leerArtikel(nr); artikel.set(nr, a); } return a; };
  const textDazu = (m: Map<string, Textzeile[]>, k: string, z: Textzeile) => { if (!k) return; const l = m.get(k) ?? []; l.push(z); m.set(k, l); };

  for (const roh of zeilenRoh) {
    if (roh.trim() === '') continue;
    const art = roh[0].toUpperCase();
    if (/^[\x00-\x1f]/.test(art)) continue;   // DOS-Dateiende (Strg+Z) und Steuerzeichen
    saetzeSeitV++;

    if (art === 'V') {
      saetzeSeitV = 1;
      if (/^V;0?5\d?;/i.test(roh)) version = 5;
      else if (roh.slice(123, 125) === '04' || !roh.slice(0, 10).includes(';')) {
        if (roh.slice(123, 125) === '03') { v3 = true; version = null; } else version = 4;
      }
      if (!ersteVersion && version) ersteVersion = version;
      continue;
    }
    const f = roh.split(';');
    if (version === null && !v3) {
      // Ohne Vorlaufsatz: an der Form des A-Satzes erkennen (DATANORM 5 hat deutlich mehr Felder)
      if (art === 'A') { version = f.length >= 20 ? 5 : 4; ersteVersion = ersteVersion ?? version; }
      else if (art === 'T' || art === 'P' || art === 'B' || art === 'D') { version = 4; ersteVersion = ersteVersion ?? version; }
    }
    if (v3 || version === null) { zaehle(art); continue; }
    const vk = feld(f, 1).toUpperCase();

    if (art === 'E' && version === 5 && /^\d+$/.test(feld(f, 1))) {
      // DATANORM 5 Endesatz: E;<Anzahl aller Saetze inkl. Vorlauf- und Endesatz>
      const soll = Number(feld(f, 1));
      if (soll !== saetzeSeitV) unvollstaendig.push(`laut Endesatz ${soll} Sätze, gelesen ${saetzeSeitV}`);
      continue;
    }

    if (art === 'A') {
      const nr = feld(f, 2);
      if (!nr) { zaehle('A ohne Artikelnummer'); continue; }
      if (vk === 'L') { geloescht.add(nr); continue; }
      if (vk === 'X') { nummernAenderung++; continue; }
      const a = hol(nr);
      let preisRoh = '', pkz = '', pe: number | null = 1;
      if (version === 4) {
        a.kurz1 = feld(f, 4); a.kurz2 = feld(f, 5);
        pkz = feld(f, 6); pe = preiseinheitV4(feld(f, 7));
        a.einheit = feld(f, 8); preisRoh = feld(f, 9);
        a.rabattgruppe = feld(f, 10); a.hauptwarengruppe = feld(f, 11); a.langtextSchluessel = feld(f, 12);
      } else {
        a.kurz1 = feld(f, 3); a.kurz2 = feld(f, 4); a.einheit = feld(f, 5);
        // Preiskennzeichen und Preiseinheit stehen in Feld 7/8. Die oeffentlich
        // zugaenglichen Unterlagen belegen die Reihenfolge nicht; echte Dateien
        // (Feld 8 durchgehend „1", Feld 7 „1" oder „2") passen nur zu
        // Preiskennzeichen vor Preiseinheit — wie in DATANORM 4. Deshalb diese
        // Reihenfolge, mit Gegenprobe am Wert: Preiskennzeichen ist 1, 2 oder 9,
        // die Preiseinheit eine Menge. Bleibt es zweideutig, gibt es eine Warnung.
        const x = feld(f, 6), y = feld(f, 7);
        const istPkz = (s: string) => s === '1' || s === '2' || s === '9';
        if (istPkz(y) && !istPkz(x) && x !== '') { pkz = y; pe = Number(x) || 1; }
        else {
          pkz = x; pe = y === '' ? 1 : Number(y);
          if (istPkz(x) && (y === '2' || y === '9')) a.mehrdeutigPe = true;
        }
        preisRoh = feld(f, 8);
        a.rabattgruppe = feld(f, 9); a.hauptwarengruppe = feld(f, 10); a.warengruppe = feld(f, 11) || a.warengruppe;
        a.langtextSchluessel = feld(f, 23);
      }
      if (pe === null || !Number.isFinite(pe) || pe <= 0) { unbekanntePe++; pe = 1; }
      a.pkzRoh = pkz; a.preisart = preisart(pkz); a.pe = pe;
      a.preis = lesePreisDatanorm(preisRoh);   // bei „Anfrage“ wird er unten nie als VK/EK genommen
      if (a.preis === 0) a.preis = null;   // 0 = „Preis kommt per P-Satz"
      continue;
    }

    if (art === 'B') {
      const nr = feld(f, 2);
      if (!nr) continue;
      if (version === 5 || vk === 'L') { geloescht.add(nr); continue; }   // DATANORM 5: B = Loeschung
      const a = hol(nr);
      a.matchcode = feld(f, 3); a.altNr = feld(f, 4); a.katalogseite = feld(f, 5);
      const ean = feld(f, 9);
      if (/^\d{8}$|^\d{12,14}$/.test(ean) && !/^0+$/.test(ean)) a.ean = ean;
      else if (ean && !/^0+$/.test(ean)) a.eanRoh = ean;
      a.warengruppe = feld(f, 11) || a.warengruppe;
      const vpe = feld(f, 13);
      if (vpe && vpe !== '0') a.vpe = vpe;
      continue;
    }

    if (art === 'P') {
      if (version === 5) { v5Preissaetze++; continue; }
      for (const start of [2, 11, 20]) {
        const nr = feld(f, start);
        if (!nr) continue;
        const pa = preisart(feld(f, start + 1));
        const preis = lesePreisDatanorm(feld(f, start + 2));
        const rk = feld(f, start + 3), rw = feld(f, start + 4);
        const rabatt = rk || rw ? `${RABATTART[rk] ?? `Kennzeichen ${rk || '–'}`}: ${rw || '–'}` : '';
        const l = preiseAusDatei.get(nr) ?? [];
        l.push({ art: pa, preis, rabatt });
        preiseAusDatei.set(nr, l);
      }
      continue;
    }

    if (art === 'T') {
      const key = feld(f, 2);
      if (vk === 'L') continue;
      if (version === 4) {
        const n1 = Number(feld(f, 4)); if (Number.isFinite(n1) && feld(f, 4) !== '') textDazu(texte, key, { nr: n1, text: (f[6] ?? '').trimEnd() });
        const n2 = Number(feld(f, 7)); if (Number.isFinite(n2) && feld(f, 7) !== '') textDazu(texte, key, { nr: n2, text: (f[9] ?? '').trimEnd() });
      } else {
        const n = Number(feld(f, 4)); if (Number.isFinite(n)) textDazu(texte, key, { nr: n, text: (f[5] ?? '').trimEnd() });
      }
      continue;
    }

    if (art === 'D') {
      const nr = feld(f, 2);
      if (vk === 'L') continue;
      const block = (zeile: number, uk: number, text: number) => {
        const z = feld(f, zeile);
        if (z === '') return;
        const n = Number(z);
        if (!Number.isFinite(n)) return;
        const u = feld(f, uk).toUpperCase();
        const t = (f[text] ?? '').trimEnd();
        textDazu(dims, nr, u === 'T' ? { nr: n, text: '', einfuegen: t.trim() } : { nr: n, text: t });
      };
      block(3, 4, 6);
      if (version === 4) block(7, 8, 10);
      continue;
    }

    zaehle(art);
  }

  // --- Preise aus P-Saetzen (DATPREIS) einarbeiten ---
  for (const [nr, liste] of preiseAusDatei) {
    const a = artikel.get(nr);
    if (!a || geloescht.has(nr)) { if (!geloescht.has(nr)) preisOhneArtikel.push(nr); continue; }
    for (const p of liste) {
      if (p.art === 'brutto' && p.preis !== null && p.preis > 0) a.preisBrutto = p.preis;
      if (p.art === 'netto' && p.preis !== null && p.preis > 0) a.preisNetto = p.preis;
      if (p.rabatt) a.preisdateiRabatt = a.preisdateiRabatt ? `${a.preisdateiRabatt} · ${p.rabatt}` : p.rabatt;
    }
  }

  // --- Langtexte zusammensetzen ---
  const textVon = (liste: Textzeile[] | undefined, tiefe = 0): string => {
    if (!liste) return '';
    return [...liste].sort((x, y) => x.nr - y.nr)
      .map((z) => (z.einfuegen !== undefined ? (tiefe < 3 ? textVon(texte.get(z.einfuegen), tiefe + 1) : '') : z.text))
      .join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };
  let ohneText = 0;

  // --- Tabelle bauen ---
  const zeilen: Record<string, string>[] = [];
  let umgerechnet = 0, brutto = 0, netto = 0, anfrage = 0, unbekannt = 0, mehrdeutig = 0;
  let ohneStamm = 0;
  for (const a of artikel.values()) {
    if (geloescht.has(a.nr)) continue;
    const bez = [a.kurz1, a.kurz2].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!bez && !a.einheit && a.preis === null) { ohneStamm++; continue; }   // nur B-Satz ohne A-Satz
    let besch = textVon(dims.get(a.nr));
    if (!besch && a.langtextSchluessel) {
      besch = textVon(texte.get(a.langtextSchluessel));
      if (!besch) ohneText++;
    }
    // Preisaenderungen (P-Satz) gehen vor; beide gelten je Preiseinheit des Artikels.
    const vkRoh = a.preisBrutto ?? (a.preisart === 'brutto' ? a.preis : null);
    const ekRoh = a.preisNetto ?? (a.preisart === 'netto' ? a.preis : null);
    const vk = vkRoh !== null ? vkRoh / a.pe : null;
    const ek = ekRoh !== null ? ekRoh / a.pe : null;
    if (a.preisart === 'brutto') brutto++;
    else if (a.preisart === 'netto') netto++;
    else if (a.preisart === 'anfrage') anfrage++;
    else if (a.preis !== null) unbekannt++;
    if (a.mehrdeutigPe) mehrdeutig++;
    const einheitText = a.einheit || 'Stk';
    const original = a.pe !== 1 && (vkRoh !== null || ekRoh !== null)
      ? [vkRoh !== null ? `Liste ${zahlDeDatanorm(vkRoh)} €` : '', ekRoh !== null ? `Netto ${zahlDeDatanorm(ekRoh)} €` : '']
        .filter(Boolean).join(' · ') + ` je ${a.pe} ${einheitText}` : '';
    if (original) umgerechnet++;
    const preisartText = a.preisart === 'brutto' ? 'Listenpreis (brutto)'
      : a.preisart === 'netto' ? 'Nettopreis'
      : a.preisart === 'anfrage' ? 'Preis auf Anfrage'
      : a.pkzRoh ? `Kennzeichen ${a.pkzRoh} (unbekannt)` : '';
    zeilen.push({
      artikelnummer: a.nr,
      bezeichnung: bez,
      beschreibung: besch,
      kategorie: a.warengruppe || a.hauptwarengruppe,
      einheit: a.einheit,
      verkaufspreis: vk !== null ? zahlDeDatanorm(vk) : '',
      einkaufspreis: ek !== null ? zahlDeDatanorm(ek) : '',
      ean: a.ean,
      rabattgruppe: a.rabattgruppe,
      hauptwarengruppe: a.warengruppe && a.hauptwarengruppe !== a.warengruppe ? a.hauptwarengruppe : '',
      originalpreis: original,
      preisart: preisartText + (a.mehrdeutigPe ? ' — Preiseinheit nicht eindeutig, bitte prüfen' : ''),
      matchcode: a.matchcode,
      altNr: a.altNr,
      katalogseite: a.katalogseite,
      vpe: a.vpe,
      eanRoh: a.eanRoh,
      preisdateiRabatt: a.preisdateiRabatt,
    });
  }

  // Nur eigene Spalten, die in mindestens einer Zeile gefuellt sind
  const extras = EXTRA.filter(([k]) => zeilen.some((z) => z[k]));
  const kopf = [...KOPF_FELDER, ...extras.map(([, label]) => label)];
  const tabelle = zeilen.map((z) => [...KOPF_FELDER.map((k) => z[k] ?? ''), ...extras.map(([k]) => z[k] ?? '')]);

  // --- Hinweise ---
  const v = ersteVersion;
  if (v3) hinweise.push('DATANORM 3 erkannt — dieses alte Format liest ARGONAUT nicht. Bitte beim Lieferanten DATANORM 4 oder 5 anfordern.');
  if (v) hinweise.push(`DATANORM ${v} erkannt (Zeichensatz ${dek.zeichensatz}): ${tabelle.length} Artikel.`);
  if (brutto > 0) hinweise.push(`${brutto} Listenpreise (brutto) als Verkaufspreis übernommen. Ihr Einkaufspreis ergibt sich aus Ihrer Rabattgruppe beim Lieferanten — die Rabattgruppe steht in einer eigenen Spalte.`);
  if (netto > 0) hinweise.push(`${netto} Nettopreise als Einkaufspreis übernommen.`);
  if (anfrage > 0) hinweise.push(`${anfrage} Artikel mit „Preis auf Anfrage" — ohne Preis übernommen.`);
  if (unbekannt > 0) hinweise.push(`${unbekannt} Artikel mit unbekanntem Preiskennzeichen — Preis NICHT übernommen, Kennzeichen steht in der Spalte „Datanorm-Preisart".`);
  if (umgerechnet > 0) hinweise.push(`${umgerechnet} Preise galten je 10/100/1000 Einheiten und wurden auf 1 Einheit umgerechnet; der Originalpreis steht in einer eigenen Spalte.`);
  if (mehrdeutig > 0) hinweise.push(`${mehrdeutig} Artikel: Preiskennzeichen und Preiseinheit waren nicht eindeutig zu unterscheiden — Reihenfolge wie DATANORM 4 angenommen (Preiskennzeichen vor Preiseinheit), bitte Preise prüfen.`);
  if (unbekanntePe > 0) hinweise.push(`${unbekanntePe} Artikel mit unbekannter Preiseinheit — je 1 angenommen, bitte prüfen.`);
  if (geloescht.size > 0) hinweise.push(`${geloescht.size} Artikel sind in der Datei als gelöscht markiert und werden nicht übernommen.`);
  if (nummernAenderung > 0) hinweise.push(`${nummernAenderung} Artikelnummern-Änderungen (Kennzeichen X) nicht ausgewertet — bitte Artikel mit alter Nummer von Hand prüfen.`);
  if (preisOhneArtikel.length > 0) hinweise.push(`${preisOhneArtikel.length} Preise gehören zu Artikeln ohne Artikelsatz (z. B. ${preisOhneArtikel.slice(0, 5).join(', ')}) — DATPREIS bitte zusammen mit DATANORM.001 wählen.`);
  if (ohneStamm > 0) hinweise.push(`${ohneStamm} Zusatzsätze ohne passenden Artikelsatz nicht übernommen.`);
  if (ohneText > 0) hinweise.push(`${ohneText} Artikel verweisen auf einen Langtext, der nicht in der Datei steht.`);
  if (v5Preissaetze > 0) hinweise.push(`${v5Preissaetze} Preissätze im DATANORM-5-Format noch nicht ausgewertet — es gelten die Preise aus den Artikelsätzen.`);
  const namen: Record<string, string> = { S: 'Warengruppen (S)', R: 'Rabattgruppen (R)', C: 'C-Sätze (Leistungen/Termine)', Z: 'Zu-/Abschläge (Z)', J: 'Sets (J)', E: 'Einfügesätze (E)', G: 'Grafik (G)', K: 'Kundenkontrolle (K)' };
  const rest = [...nichtAusgewertet].filter(([k]) => k !== 'K');
  if (rest.length > 0) hinweise.push(`Nicht ausgewertet: ${rest.map(([k, n]) => `${n} × ${namen[k] ?? `Satzart ${k}`}`).join(', ')}.`);
  if (unvollstaendig.length > 0) hinweise.unshift(`⚠️ Die Datei ist vermutlich unvollständig (${unvollstaendig.join('; ')}). Bitte beim Lieferanten neu herunterladen.`);
  if (!v && !v3) hinweise.push('Kein DATANORM-Vorlaufsatz gefunden.');

  return { kopf, zeilen: tabelle, anzahl: tabelle.length, hinweise, version: v, zeichensatz: dek.zeichensatz };
}
