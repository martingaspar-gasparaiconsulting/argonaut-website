// lib/bankFormate.ts
// Bank-Dateiformate (Stufe 1, 14.09.26): CAMT.053 (ISO 20022) und MT940 (SWIFT)
// zusaetzlich zum CSV-Import aus lib/bankAbgleich.ts.
//
// WARUM eine eigene Datei: bankAbgleich.ts enthaelt das Zuordnen von echtem Geld
// zu echten Rechnungen und laeuft. Die neuen Parser kommen daneben statt hinein,
// damit an dieser Stelle nichts angefasst wird. Ausgabe ist bewusst derselbe
// Typ `Transaktion` — das Matching bleibt unveraendert.
//
// WARUM ueberhaupt: Ein CSV-Export sieht bei jeder Bank anders aus (Spaltennamen,
// Trennzeichen, Reihenfolge). CAMT.053 ist nach ISO 20022 genormt und bei jeder
// deutschen Bank identisch; MT940 ist der alte, ebenfalls genormte Standard, den
// noch fast jedes Online-Banking anbietet. Wer diese beiden kann, kann jede Bank.
//
// Reine Formeln/Parser, KEINE Supabase-/React-Abhaengigkeit. Node-getestet.

import { parseBetrag, parseUmsaetzeCsv, type Transaktion } from './bankAbgleich';

export type BankFormat = 'camt' | 'mt940' | 'csv' | 'leer';

export const FORMAT_NAMEN: Record<BankFormat, string> = {
  camt: 'CAMT.053 (ISO 20022)',
  mt940: 'MT940',
  csv: 'CSV',
  leer: 'nicht erkannt',
};

// ────────────────────────────────────────────────────────────────────────────
// Gemeinsame Helfer
// ────────────────────────────────────────────────────────────────────────────

/** Namensraum-Praefix in CAMT-Dateien: <Ntry>, <ns:Ntry>, <camt053:Ntry> … */
const NS = '(?:[A-Za-z0-9_.\\-]+:)?';

function tagRegex(tag: string, global: boolean): RegExp {
  return new RegExp(`<${NS}${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${NS}${tag}>`, global ? 'gi' : 'i');
}

/** Inhalt des ERSTEN Vorkommens eines Tags, sonst null. */
function tagInhalt(xml: string, tag: string): string | null {
  const m = String(xml || '').match(tagRegex(tag, false));
  return m ? m[1] : null;
}

/** Inhalte ALLER Vorkommen eines Tags. */
function alleTags(xml: string, tag: string): string[] {
  const re = tagRegex(tag, true);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(xml || ''))) !== null) out.push(m[1]);
  return out;
}

/** XML-Entities aufloesen und Text saeubern. */
function text(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')   // zuletzt, sonst wuerde &amp;lt; doppelt aufgeloest
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ISO-Datum (2026-07-20 oder 2026-07-20T00:00:00) -> 20.07.2026.
 * Im Zweifel LEER statt geraten — ein falsches Datum in einer Geldzeile ist
 * schlimmer als gar keins.
 */
export function isoZuDeutsch(s: unknown): string {
  const m = String(s ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [, j, mo, t] = m;
  const mz = Number(mo), tz = Number(t);
  if (mz < 1 || mz > 12 || tz < 1 || tz > 31) return '';
  return `${t}.${mo}.${j}`;
}

/** MT940-Datum JJMMTT (260720) -> 20.07.2026. Im Zweifel leer. */
export function mt940Datum(s: unknown): string {
  const m = String(s ?? '').trim().match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!m) return '';
  const [, jj, mo, t] = m;
  const mz = Number(mo), tz = Number(t);
  if (mz < 1 || mz > 12 || tz < 1 || tz > 31) return '';
  return `${t}.${mo}.20${jj}`;
}

// ────────────────────────────────────────────────────────────────────────────
// CAMT.053 (ISO 20022)
// ────────────────────────────────────────────────────────────────────────────

/**
 * CAMT.053-XML -> Transaktionen.
 *
 * Je <Ntry> (Buchungszeile):
 *   <Amt Ccy="EUR">  immer POSITIV, das Vorzeichen steht in <CdtDbtInd>
 *   <CdtDbtInd>      CRDT = Eingang (+), DBIT = Ausgang (-)
 *   <Sts>            BOOK = gebucht, PDNG = vorgemerkt
 *   <BookgDt><Dt>    Buchungstag, sonst <ValDt><Dt> als Rueckfall
 *   <RmtInf><Ustrd>  Verwendungszweck, darf MEHRFACH vorkommen -> zusammenhaengen
 *   <RltdPties>      <Dbtr><Nm> beim Eingang, <Cdtr><Nm> beim Ausgang
 *
 * VORGEMERKTE Buchungen (Sts != BOOK) werden bewusst UEBERSPRUNGEN: sie koennen
 * sich noch aendern oder verschwinden. Eine Rechnung auf Grundlage einer
 * Vormerkung als bezahlt zu markieren waere falsch.
 */
export function parseUmsaetzeCamt(xml: string): Transaktion[] {
  const roh = String(xml || '').replace(/<!--[\s\S]*?-->/g, '');
  if (!roh.trim()) return [];
  const out: Transaktion[] = [];

  for (const ntry of alleTags(roh, 'Ntry')) {
    // 1) Nur gebuchte Zeilen. Fehlt <Sts> ganz, gilt die Zeile als gebucht
    //    (aeltere Erzeuger lassen das Feld weg).
    const stsRoh = tagInhalt(ntry, 'Sts');
    if (stsRoh !== null) {
      // <Sts>BOOK</Sts> oder <Sts><Cd>BOOK</Cd></Sts> (CAMT ab Version 04)
      const sts = text(tagInhalt(stsRoh, 'Cd') ?? stsRoh).toUpperCase();
      if (sts && sts !== 'BOOK') continue;
    }

    // 2) Betrag + Vorzeichen
    const amtRoh = tagInhalt(ntry, 'Amt');
    if (amtRoh === null) continue;
    const betragAbs = Math.abs(parseBetrag(text(amtRoh)));
    if (!Number.isFinite(betragAbs) || betragAbs === 0) continue;
    const ind = text(tagInhalt(ntry, 'CdtDbtInd')).toUpperCase();
    // <RvslInd>true</RvslInd> — ERGAENZT 16.09.2026.
    // Die Zeile STORNIERT eine fruehere Buchung. <CdtDbtInd> nennt dabei die
    // Richtung der urspruenglichen Buchung, das Geld laeuft aber andersherum.
    // Eine Ruecklastschrift kam deshalb als CRDT mit positivem Betrag herein:
    // der Bankabgleich ordnete sie der Rechnung zu und setzte sie auf bezahlt,
    // waehrend das Geld beim Kunden lag. Gemahnt wurde nie.
    // Das MT940-Gegenstueck macht es ueber RC/RD schon richtig (Z. 227 unten).
    const storno = /^(?:true|1|y|yes)$/i.test(text(tagInhalt(ntry, 'RvslInd')));
    const richtung = (ind === 'DBIT' ? -1 : 1) * (storno ? -1 : 1);
    const betrag = richtung * betragAbs;

    // 3) Datum: Buchungstag vor Wertstellung
    const bookg = tagInhalt(ntry, 'BookgDt');
    const val = tagInhalt(ntry, 'ValDt');
    const datum =
      isoZuDeutsch(text(tagInhalt(bookg ?? '', 'Dt') ?? tagInhalt(bookg ?? '', 'DtTm'))) ||
      isoZuDeutsch(text(tagInhalt(val ?? '', 'Dt') ?? tagInhalt(val ?? '', 'DtTm')));

    // 4) Verwendungszweck: alle <Ustrd> zusammen, sonst <AddtlNtryInf>
    const zweckTeile = alleTags(ntry, 'Ustrd').map((u) => text(u)).filter(Boolean);
    const verwendungszweck = zweckTeile.length
      ? zweckTeile.join(' ')
      : text(tagInhalt(ntry, 'AddtlNtryInf'));

    // 5) Gegenseite: beim Eingang der Zahler, beim Ausgang der Empfaenger
    const parteien = tagInhalt(ntry, 'RltdPties') ?? '';
    const seite = ind === 'DBIT' ? 'Cdtr' : 'Dbtr';
    const name =
      text(tagInhalt(tagInhalt(parteien, seite) ?? '', 'Nm')) ||
      text(tagInhalt(tagInhalt(parteien, seite === 'Dbtr' ? 'Cdtr' : 'Dbtr') ?? '', 'Nm'));

    out.push({ datum, betrag, verwendungszweck, name });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// MT940 (SWIFT)
// ────────────────────────────────────────────────────────────────────────────

/**
 * :86:-Feld auswerten.
 * Deutsche Banken schreiben es strukturiert mit Unterfeldern:
 *   ?00GUTSCHRIFT?20Rechnung RE-2026-?210001?32Mustermann GmbH
 *   ?20..?29 und ?60..?63 = Verwendungszweck   ?32+?33 = Name der Gegenseite
 * Ohne Fragezeichen ist es freier Text.
 */
export function parse86(inhalt: string): { verwendungszweck: string; name: string } {
  const roh = String(inhalt || '');
  if (!/\?\d{2}/.test(roh)) {
    return { verwendungszweck: roh.replace(/\s+/g, ' ').trim(), name: '' };
  }
  const zweck: string[] = [];
  const namen: string[] = [];
  const re = /\?(\d{2})([^?]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(roh)) !== null) {
    const nr = Number(m[1]);
    const wert = m[2].replace(/[\r\n]+/g, '').trim();
    if (!wert) continue;
    if ((nr >= 20 && nr <= 29) || (nr >= 60 && nr <= 63)) zweck.push(wert);
    else if (nr === 32 || nr === 33) namen.push(wert);
  }
  return {
    // Unterfelder sind ZEICHENWEISE fortgesetzt (…RE-2026- + 0001), deshalb
    // ohne Trennzeichen zusammensetzen und erst danach Leerraum normieren.
    verwendungszweck: zweck.join('').replace(/\s+/g, ' ').trim(),
    name: namen.join(' ').replace(/\s+/g, ' ').trim(),
  };
}

/**
 * MT940-Auszug -> Transaktionen.
 *
 * :61: Buchungszeile  JJMMTT [MMTT] {C|D|RC|RD} [Waehrungskennung] Betrag N…
 *      C  = Gutschrift (+)      D  = Lastschrift (-)
 *      RC = Storno einer Gutschrift (-)   RD = Storno einer Lastschrift (+)
 * :86: gehoert zur unmittelbar davorstehenden :61:-Zeile und darf ueber
 *      mehrere Zeilen laufen, bis das naechste :NN:-Feld beginnt.
 */
export function parseUmsaetzeMt940(inhalt: string): Transaktion[] {
  const roh = String(inhalt || '').replace(/\r\n?/g, '\n');
  if (!roh.trim()) return [];

  // In Felder zerlegen: ein Feld beginnt am Zeilenanfang mit :NN: bzw. :NNA:
  const teile = roh.split(/\n(?=:\d{2}[A-Z]?:)/);
  const out: Transaktion[] = [];
  let offen: Transaktion | null = null;

  const schliessen = () => { if (offen) { out.push(offen); offen = null; } };

  for (const teil of teile) {
    const kopf = teil.match(/^:(\d{2}[A-Z]?):([\s\S]*)$/);
    if (!kopf) continue;
    const feld = kopf[1];
    const wert = kopf[2];

    if (feld === '61') {
      schliessen();
      const erste = wert.split('\n')[0].trim();
      const m = erste.match(/^(\d{6})(\d{4})?(RC|RD|C|D)([A-Za-z])?(\d[\d.,]*)/);
      if (!m) continue;
      const [, datumRoh, , kennung, , betragRoh] = m;
      const betragAbs = Math.abs(parseBetrag(betragRoh));
      if (!Number.isFinite(betragAbs) || betragAbs === 0) continue;
      const negativ = kennung === 'D' || kennung === 'RC';
      offen = {
        datum: mt940Datum(datumRoh),
        betrag: negativ ? -betragAbs : betragAbs,
        verwendungszweck: '',
        name: '',
      };
    } else if (feld === '86') {
      if (!offen) continue;             // :86: ohne vorangehende :61: -> ignorieren
      const d = parse86(wert);
      offen.verwendungszweck = d.verwendungszweck;
      offen.name = d.name;
    } else if (feld === '62F' || feld === '62M' || feld === '20') {
      // Schlusssaldo bzw. Beginn eines neuen Auszugs: offene Zeile abschliessen
      schliessen();
    }
  }
  schliessen();
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Erkennung + eine Tuer fuer alle drei Formate
// ────────────────────────────────────────────────────────────────────────────

/**
 * Format am Inhalt erkennen, nicht an der Dateiendung — Banken benennen
 * dieselbe Datei mal .xml, mal .txt, mal .sta.
 */
export function erkenneFormat(inhalt: unknown): BankFormat {
  const roh = String(inhalt ?? '').trim();
  if (!roh) return 'leer';
  if (/<\?xml/i.test(roh) || /<(?:[A-Za-z0-9_.\-]+:)?(?:Document|BkToCstmrStmt|Ntry)\b/i.test(roh)) return 'camt';
  if (/^:\d{2}[A-Z]?:/m.test(roh) && /^:61:/m.test(roh)) return 'mt940';
  return 'csv';
}

/** Eine Tuer fuer alle drei Formate. Die Ausgabe ist ueberall dieselbe. */
export function parseUmsaetze(inhalt: unknown): Transaktion[] {
  const roh = String(inhalt ?? '');
  switch (erkenneFormat(roh)) {
    case 'camt': return parseUmsaetzeCamt(roh);
    case 'mt940': return parseUmsaetzeMt940(roh);
    case 'csv': return parseUmsaetzeCsv(roh);
    default: return [];
  }
}
