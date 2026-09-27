// ============================================================================
// ARGONAUT OS · lib/xlsLeser.ts — alte Excel-Dateien (.xls) lesen
// (Umzug Schritt 2, 27.09.2026)
//
// WARUM ES DAS BRAUCHT
// DATEV liefert die OPOS-Liste als altes .xls (BIFF, Excel 97–2003), viele
// Branchenprogramme ebenso. exceljs kann nur .xlsx — die Route schickte .xls
// trotzdem hinein und antwortete mit einer unverstaendlichen Fehlermeldung.
//
// WARUM KEINE FREMDBIBLIOTHEK
// Die verbreitete Bibliothek dafuer steht auf npm nur in einer alten Version
// mit bekannten Sicherheitsluecken (Prototype Pollution, ReDoS). Fuer den
// Import brauchen wir nur Text und Zahlen des ersten Tabellenblatts — das ist
// ueberschaubar und hier vollstaendig selbst gelesen:
//   1. Der Container (Compound File Binary, „OLE2"): Sektoren, FAT, MiniFAT,
//      Verzeichnis -> der Datenstrom „Workbook" (BIFF8) bzw. „Book" (BIFF5).
//   2. Die BIFF-Saetze: gemeinsame Texte (SST, auch ueber CONTINUE hinweg),
//      Texte, Zahlen, RK/MULRK, Formel-Ergebnisse, Wahrheitswerte.
//   3. Zahlenformate: eine Zahl mit Datumsformat wird ein Datum (2026-08-15).
//
// Laeuft im Browser (die Datei verlaesst den Rechner nicht) und in Node.
// Keine Imports, keine Hooks — node-testbar.
// ============================================================================

export type XlsErgebnis = {
  blatt: string | null;
  /** Alle Zeilen als Text, Luecken mit '' aufgefuellt. */
  zeilen: string[][];
  /** Weitere Tabellenblaetter, die NICHT gelesen wurden. */
  weitereBlaetter: string[];
  hinweise: string[];
};

const SIGNATUR = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENDE = 0xfffffffe;
const FREI = 0xffffffff;

/** Ist das eine OLE2-Datei (altes Excel, Word …)? */
export function istXls(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 512) return false;
  return SIGNATUR.every((b, i) => bytes[i] === b);
}

// ---------------------------------------------------------------------------
// 1) Der Container
// ---------------------------------------------------------------------------

type Eintrag = { name: string; typ: number; start: number; groesse: number };

function leseContainer(bytes: Uint8Array): Map<string, Uint8Array> {
  if (!istXls(bytes)) throw new Error('Das ist keine alte Excel-Datei (.xls).');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);

  const sektorGroesse = 1 << u16(0x1e);
  const miniGroesse = 1 << u16(0x20);
  if (sektorGroesse !== 512 && sektorGroesse !== 4096) throw new Error('Unbekannte Sektorgröße in der .xls-Datei.');
  const anzahlFat = u32(0x2c);
  const ersterDir = u32(0x30);
  const miniGrenze = u32(0x38);
  const ersterMiniFat = u32(0x3c);
  let difatSektor = u32(0x44);
  const anzahlDifat = u32(0x48);

  const sektorAb = (n: number) => (n + 1) * sektorGroesse;
  const maxSektor = Math.floor(bytes.length / sektorGroesse);

  // DIFAT: die ersten 109 Eintraege im Kopf, der Rest in einer Kette.
  const fatSektoren: number[] = [];
  for (let i = 0; i < 109 && fatSektoren.length < anzahlFat; i++) {
    const s = u32(0x4c + i * 4);
    if (s !== FREI && s !== ENDE) fatSektoren.push(s);
  }
  const jeDifat = sektorGroesse / 4 - 1;
  for (let k = 0; k < anzahlDifat && difatSektor !== ENDE && difatSektor !== FREI && difatSektor < maxSektor; k++) {
    const basis = sektorAb(difatSektor);
    for (let i = 0; i < jeDifat && fatSektoren.length < anzahlFat; i++) {
      const s = u32(basis + i * 4);
      if (s !== FREI && s !== ENDE) fatSektoren.push(s);
    }
    difatSektor = u32(basis + jeDifat * 4);
  }

  const fat: number[] = [];
  for (const s of fatSektoren) {
    if (s >= maxSektor) continue;
    const basis = sektorAb(s);
    for (let i = 0; i < sektorGroesse / 4; i++) fat.push(u32(basis + i * 4));
  }

  const kette = (start: number, tabelle: number[]): number[] => {
    const raus: number[] = [];
    const gesehen = new Set<number>();
    let s = start;
    while (s !== ENDE && s !== FREI && s < tabelle.length && !gesehen.has(s)) {
      gesehen.add(s); raus.push(s); s = tabelle[s];
    }
    return raus;
  };

  const leseKette = (start: number, groesse: number): Uint8Array => {
    const teile = kette(start, fat);
    const raus = new Uint8Array(teile.length * sektorGroesse);
    teile.forEach((s, i) => {
      const von = sektorAb(s);
      raus.set(bytes.subarray(von, Math.min(von + sektorGroesse, bytes.length)), i * sektorGroesse);
    });
    return raus.subarray(0, Math.min(groesse, raus.length));
  };

  // Verzeichnis
  const dirBytes = leseKette(ersterDir, Number.MAX_SAFE_INTEGER);
  const eintraege: Eintrag[] = [];
  const ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
  for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
    const laenge = ddv.getUint16(o + 0x40, true);
    const typ = dirBytes[o + 0x42];
    if (typ === 0) continue;
    let name = '';
    for (let i = 0; i + 1 < Math.min(laenge, 64) - 1; i += 2) name += String.fromCharCode(ddv.getUint16(o + i, true));
    eintraege.push({ name, typ, start: ddv.getUint32(o + 0x74, true), groesse: ddv.getUint32(o + 0x78, true) });
  }

  const wurzel = eintraege.find((e) => e.typ === 5);
  let miniStrom: Uint8Array = new Uint8Array(0);
  const miniFat: number[] = [];
  if (wurzel) {
    miniStrom = leseKette(wurzel.start, wurzel.groesse);
    const mf = leseKette(ersterMiniFat, Number.MAX_SAFE_INTEGER);
    const mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
    for (let o = 0; o + 4 <= mf.length; o += 4) miniFat.push(mdv.getUint32(o, true));
  }

  const stroeme = new Map<string, Uint8Array>();
  for (const e of eintraege) {
    if (e.typ !== 2) continue;
    if (e.groesse < miniGrenze && wurzel) {
      const teile = kette(e.start, miniFat);
      const raus = new Uint8Array(teile.length * miniGroesse);
      teile.forEach((s, i) => raus.set(miniStrom.subarray(s * miniGroesse, (s + 1) * miniGroesse), i * miniGroesse));
      stroeme.set(e.name, raus.subarray(0, e.groesse));
    } else {
      stroeme.set(e.name, leseKette(e.start, e.groesse));
    }
  }
  return stroeme;
}

// ---------------------------------------------------------------------------
// 2) BIFF-Saetze
// ---------------------------------------------------------------------------

type Satz = { typ: number; daten: Uint8Array; pos: number };

function saetze(strom: Uint8Array, ab = 0): Satz[] {
  const raus: Satz[] = [];
  let o = ab;
  while (o + 4 <= strom.length) {
    const typ = strom[o] | (strom[o + 1] << 8);
    const len = strom[o + 2] | (strom[o + 3] << 8);
    raus.push({ typ, daten: strom.subarray(o + 4, Math.min(o + 4 + len, strom.length)), pos: o });
    o += 4 + len;
    if (typ === 0x000a && raus.length > 1) break;   // EOF des Abschnitts
  }
  return raus;
}

function dvVon(d: Uint8Array): DataView {
  return new DataView(d.buffer, d.byteOffset, d.byteLength);
}

/** Einzelbyte-Text (BIFF5 / komprimierte Zeichen) — Windows-1252. */
function ansi(bytes: Uint8Array): string {
  try { return new TextDecoder('windows-1252').decode(bytes); } catch { return String.fromCharCode(...bytes); }
}

/**
 * Liest Zeichen ueber Satzgrenzen hinweg. Die gemeinsame Texttabelle (SST)
 * wird von Excel in CONTINUE-Saetze zerteilt — mitten in einem Text beginnt
 * dann jeder neue Satz mit einem eigenen Flag-Byte (8 oder 16 Bit je Zeichen).
 */
class Leser {
  private i = 0;
  private o = 0;
  constructor(private stuecke: Uint8Array[]) {}
  private rest(): number { return (this.stuecke[this.i]?.length ?? 0) - this.o; }
  private weiter(): boolean {
    while (this.i < this.stuecke.length && this.rest() <= 0) { this.i++; this.o = 0; }
    return this.i < this.stuecke.length;
  }
  ende(): boolean { return !this.weiter(); }
  byte(): number {
    if (!this.weiter()) throw new Error('Datei zu kurz');
    return this.stuecke[this.i][this.o++];
  }
  u16(): number { return this.byte() | (this.byte() << 8); }
  u32(): number { return (this.u16() | (this.u16() << 16)) >>> 0; }
  ueberspringe(n: number): void { for (let k = 0; k < n; k++) this.byte(); }
  zeichen(anzahl: number, hoch: boolean): string {
    let raus = '';
    let breit = hoch;
    let n = anzahl;
    while (n > 0) {
      if (this.rest() <= 0) {
        // Stueck zu Ende: die Zeichen gehen im naechsten weiter, und das
        // beginnt mit einem eigenen Flag-Byte (8 oder 16 Bit je Zeichen).
        this.i++; this.o = 0;
        if (!this.weiter()) break;
        breit = (this.byte() & 1) === 1;
        continue;
      }
      const verfuegbar = this.rest();
      const moeglich = breit ? Math.floor(verfuegbar / 2) : verfuegbar;
      const jetzt = Math.min(n, moeglich);
      if (jetzt <= 0) { this.o = this.stuecke[this.i].length; continue; }
      const s = this.stuecke[this.i];
      if (breit) {
        for (let k = 0; k < jetzt; k++) raus += String.fromCharCode(s[this.o + 2 * k] | (s[this.o + 2 * k + 1] << 8));
        this.o += jetzt * 2;
      } else {
        raus += ansiLatin(s.subarray(this.o, this.o + jetzt));
        this.o += jetzt;
      }
      n -= jetzt;
    }
    return raus;
  }
}

/** Komprimierte BIFF8-Zeichen sind die unteren 8 Bit von UTF-16 = Latin-1. */
function ansiLatin(bytes: Uint8Array): string {
  let s = '';
  for (let k = 0; k < bytes.length; k++) s += String.fromCharCode(bytes[k]);
  return s;
}

/** XLUnicodeRichExtendedString (SST-Eintrag). */
function leseSstText(l: Leser): string {
  const cch = l.u16();
  const flags = l.byte();
  const hoch = (flags & 0x01) === 1;
  const ext = (flags & 0x04) !== 0;
  const rich = (flags & 0x08) !== 0;
  const runs = rich ? l.u16() : 0;
  const extLen = ext ? l.u32() : 0;
  const text = l.zeichen(cch, hoch);
  if (runs) l.ueberspringe(runs * 4);
  if (extLen) l.ueberspringe(extLen);
  return text;
}

/** Text in LABEL / STRING / FORMAT (ohne Satzgrenzen). */
function leseText(d: Uint8Array, o: number, biff8: boolean, laengeByte = false): { text: string; weiter: number } {
  const dv = dvVon(d);
  if (!biff8) {
    const cch = laengeByte ? d[o] : dv.getUint16(o, true);
    const ab = o + (laengeByte ? 1 : 2);
    return { text: ansi(d.subarray(ab, ab + cch)), weiter: ab + cch };
  }
  const cch = laengeByte ? d[o] : dv.getUint16(o, true);
  let p = o + (laengeByte ? 1 : 2);
  const flags = d[p++];
  const hoch = (flags & 1) === 1;
  const rich = (flags & 0x08) !== 0;
  const ext = (flags & 0x04) !== 0;
  let runs = 0; let extLen = 0;
  if (rich) { runs = dv.getUint16(p, true); p += 2; }
  if (ext) { extLen = dv.getUint32(p, true); p += 4; }
  let text = '';
  if (hoch) {
    for (let k = 0; k < cch && p + 1 < d.length; k++, p += 2) text += String.fromCharCode(d[p] | (d[p + 1] << 8));
  } else {
    text = ansiLatin(d.subarray(p, p + cch)); p += cch;
  }
  return { text, weiter: p + runs * 4 + extLen };
}

/** RK-Zahl: Excels kompakte Zahl (ganze Zahl oder gekuerzte Gleitkommazahl, ggf. /100). */
export function rkZahl(rk: number): number {
  const durch100 = (rk & 1) === 1;
  const ganz = (rk & 2) === 2;
  let n: number;
  if (ganz) {
    n = (rk | 0) >> 2;      // vorzeichenbehaftet
  } else {
    const puffer = new DataView(new ArrayBuffer(8));
    puffer.setUint32(4, (rk & 0xfffffffc) >>> 0, true);
    puffer.setUint32(0, 0, true);
    n = puffer.getFloat64(0, true);
  }
  return durch100 ? n / 100 : n;
}

// ---------------------------------------------------------------------------
// 3) Zahlenformate
// ---------------------------------------------------------------------------

const DATUM_FORMATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** Ist ein eigenes Zahlenformat ein Datum/Uhrzeit? „#.##0,00 €" nein, „DD.MM.YYYY" ja. */
export function istDatumFormat(format: string): boolean {
  const ohne = String(format ?? '')
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '')
    .toLowerCase();
  if (/general|standard/.test(ohne)) return false;
  return /[dmyjt]/.test(ohne.replace(/[#0?,.\s%e+\-]/g, ''));
}

/** Excel-Seriennummer -> "2026-08-15" (bzw. mit Uhrzeit). */
export function excelDatum(serie: number, datum1904 = false, mitZeit = false): string | null {
  if (!Number.isFinite(serie) || serie < 0 || serie > 2958465) return null;
  const tage = Math.floor(serie) + (datum1904 ? 1462 : 0);
  // 1899-12-30 als Nullpunkt gleicht Excels Schaltjahr-Fehler von 1900 aus (ab Serie 61).
  const ms = Date.UTC(1899, 11, 30) + tage * 86400000;
  const d = new Date(ms);
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  if (!mitZeit) return iso;
  const sek = Math.round((serie - Math.floor(serie)) * 86400);
  if (sek === 0) return iso;
  return `${iso} ${String(Math.floor(sek / 3600)).padStart(2, '0')}:${String(Math.floor((sek % 3600) / 60)).padStart(2, '0')}`;
}

/** Zahl als Text so, wie der Import sie weiterliest: ohne Gleitkomma-Rauschen. */
export function zahlAlsText(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e10) / 1e10);
}

// ---------------------------------------------------------------------------
// 4) Das erste Tabellenblatt lesen
// ---------------------------------------------------------------------------

export const XLS_GRENZEN = { zeilen: 200000, spalten: 512 } as const;

export function leseXls(bytes: Uint8Array): XlsErgebnis {
  const hinweise: string[] = [];
  const stroeme = leseContainer(bytes);
  const strom = stroeme.get('Workbook') ?? stroeme.get('Book') ?? stroeme.get('WORKBOOK') ?? stroeme.get('BOOK');
  if (!strom) {
    throw new Error('In der Datei steckt keine Excel-Tabelle (vielleicht ein Word-Dokument oder eine passwortgeschützte Datei).');
  }

  const global = saetze(strom);
  const bof = global[0];
  if (!bof || (bof.typ !== 0x0809 && bof.typ !== 0x0409 && bof.typ !== 0x0209)) throw new Error('Die .xls-Datei hat keinen gültigen Anfang.');
  const version = bof.daten.length >= 2 ? dvVon(bof.daten).getUint16(0, true) : 0;
  const biff8 = version === 0x0600;
  if (!biff8 && version !== 0x0500) {
    throw new Error('Diese Excel-Datei ist sehr alt (vor Excel 95). Bitte in Excel öffnen und als .xlsx oder CSV speichern.');
  }

  let datum1904 = false;
  const formate = new Map<number, string>();
  const xfFormat: number[] = [];
  const texte: string[] = [];
  const blaetter: { name: string; pos: number; typ: number; sichtbar: boolean }[] = [];

  for (let k = 0; k < global.length; k++) {
    const s = global[k];
    const dv = dvVon(s.daten);
    switch (s.typ) {
      case 0x002f: // FILEPASS
        throw new Error('Die Excel-Datei ist mit einem Kennwort geschützt. Bitte ohne Kennwort speichern und erneut hochladen.');
      case 0x0022: datum1904 = s.daten.length >= 2 && dv.getUint16(0, true) === 1; break;
      case 0x041e: {
        const ifmt = dv.getUint16(0, true);
        formate.set(ifmt, leseText(s.daten, 2, biff8, !biff8).text);
        break;
      }
      case 0x00e0: xfFormat.push(s.daten.length >= 4 ? dv.getUint16(2, true) : 0); break;
      case 0x0085: {
        const pos = dv.getUint32(0, true);
        const sichtbar = s.daten[4] === 0;
        const typ = s.daten[5];
        const name = leseText(s.daten, 6, biff8, true).text;
        blaetter.push({ name, pos, typ, sichtbar });
        break;
      }
      case 0x00fc: {
        const stuecke = [s.daten];
        while (global[k + 1]?.typ === 0x003c) { k++; stuecke.push(global[k].daten); }
        const l = new Leser(stuecke);
        l.u32();
        const eindeutig = l.u32();
        for (let n = 0; n < eindeutig && !l.ende(); n++) {
          try { texte.push(leseSstText(l)); } catch { break; }
        }
        if (texte.length < eindeutig) hinweise.push(`Von ${eindeutig} gemeinsamen Texten konnten ${texte.length} gelesen werden.`);
        break;
      }
    }
  }

  const arbeitsblaetter = blaetter.filter((b) => b.typ === 0);
  const blatt = arbeitsblaetter.find((b) => b.sichtbar) ?? arbeitsblaetter[0];
  if (!blatt) throw new Error('In der Excel-Datei ist kein Tabellenblatt zu finden.');
  const weitereBlaetter = arbeitsblaetter.filter((b) => b !== blatt).map((b) => b.name);
  if (weitereBlaetter.length > 0) {
    hinweise.push(`Gelesen wurde das Blatt „${blatt.name}". Weitere Blätter (${weitereBlaetter.join(', ')}) bitte einzeln als eigene Datei speichern.`);
  }

  const istDatumXf = (xf: number): boolean => {
    const f = xfFormat[xf];
    if (f === undefined) return false;
    if (DATUM_FORMATE.has(f)) return true;
    const eigen = formate.get(f);
    return eigen ? istDatumFormat(eigen) : false;
  };
  const zahlText = (n: number, xf: number): string => {
    if (istDatumXf(xf)) {
      const f = formate.get(xfFormat[xf]) ?? '';
      return excelDatum(n, datum1904, /h/i.test(f.replace(/"[^"]*"/g, '')) || [18, 19, 20, 21, 22, 45, 46, 47].includes(xfFormat[xf])) ?? zahlAlsText(n);
    }
    return zahlAlsText(n);
  };

  const zellen = new Map<number, Map<number, string>>();
  let maxSpalte = -1;
  let abgeschnitten = false;
  const setze = (zeile: number, spalte: number, wert: string) => {
    if (zeile >= XLS_GRENZEN.zeilen || spalte >= XLS_GRENZEN.spalten) { abgeschnitten = true; return; }
    let z = zellen.get(zeile);
    if (!z) { z = new Map(); zellen.set(zeile, z); }
    z.set(spalte, wert);
    if (spalte > maxSpalte) maxSpalte = spalte;
  };

  const blattSaetze = saetze(strom, blatt.pos);
  let formelWartet: { zeile: number; spalte: number } | null = null;
  for (const s of blattSaetze) {
    const d = s.daten;
    if (d.length < 6 && s.typ !== 0x0207 && s.typ !== 0x000a) continue;
    const dv = dvVon(d);
    switch (s.typ) {
      case 0x00fd: { // LABELSST
        const i = dv.getUint32(6, true);
        setze(dv.getUint16(0, true), dv.getUint16(2, true), texte[i] ?? '');
        break;
      }
      case 0x0204: case 0x00d6: { // LABEL, RSTRING
        setze(dv.getUint16(0, true), dv.getUint16(2, true), leseText(d, 6, biff8).text);
        break;
      }
      case 0x0203: { // NUMBER
        setze(dv.getUint16(0, true), dv.getUint16(2, true), zahlText(dv.getFloat64(6, true), dv.getUint16(4, true)));
        break;
      }
      case 0x027e: { // RK
        setze(dv.getUint16(0, true), dv.getUint16(2, true), zahlText(rkZahl(dv.getUint32(6, true)), dv.getUint16(4, true)));
        break;
      }
      case 0x00bd: { // MULRK
        const zeile = dv.getUint16(0, true);
        const erste = dv.getUint16(2, true);
        const anzahl = Math.floor((d.length - 6) / 6);
        for (let n = 0; n < anzahl; n++) {
          const xf = dv.getUint16(4 + n * 6, true);
          const rk = dv.getUint32(6 + n * 6, true);
          setze(zeile, erste + n, zahlText(rkZahl(rk), xf));
        }
        break;
      }
      case 0x0205: { // BOOLERR
        const wert = d[6]; const fehler = d[7] === 1;
        setze(dv.getUint16(0, true), dv.getUint16(2, true), fehler ? '' : (wert ? 'WAHR' : 'FALSCH'));
        break;
      }
      case 0x0006: { // FORMULA
        const zeile = dv.getUint16(0, true); const spalte = dv.getUint16(2, true); const xf = dv.getUint16(4, true);
        if (d.length < 14) break;
        if (d[12] === 0xff && d[13] === 0xff) {
          const art = d[6];
          if (art === 0) formelWartet = { zeile, spalte };                 // Text folgt im STRING-Satz
          else if (art === 1) setze(zeile, spalte, d[8] ? 'WAHR' : 'FALSCH');
          else setze(zeile, spalte, '');
        } else {
          setze(zeile, spalte, zahlText(dv.getFloat64(6, true), xf));
        }
        break;
      }
      case 0x0207: { // STRING (Ergebnis der vorigen Formel)
        if (formelWartet) {
          setze(formelWartet.zeile, formelWartet.spalte, leseText(d, 0, biff8).text);
          formelWartet = null;
        }
        break;
      }
    }
  }

  if (abgeschnitten) hinweise.push(`Das Blatt hat mehr als ${XLS_GRENZEN.zeilen.toLocaleString('de-DE')} Zeilen oder ${XLS_GRENZEN.spalten} Spalten und wurde abgeschnitten.`);

  const nummern = [...zellen.keys()].sort((a, b) => a - b);
  const zeilen: string[][] = [];
  for (const n of nummern) {
    const z = zellen.get(n)!;
    const reihe: string[] = [];
    for (let c = 0; c <= maxSpalte; c++) reihe.push((z.get(c) ?? '').trim());
    if (reihe.some((x) => x !== '')) zeilen.push(reihe);
  }
  return { blatt: blatt.name, zeilen, weitereBlaetter, hinweise };
}
