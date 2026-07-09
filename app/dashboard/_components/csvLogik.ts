// ============================================================================
// ARGONAUT OS · csvLogik.ts
// Block 1 · I-1c — CSV zuverlässig lesen
//
// Reine Funktionen. Kein DB-Zugriff, kein React, keine Abhängigkeit.
// BRANCHENNEUTRAL. Kontakte, Lieferanten, Artikel — dieselbe Datei.
//
// WARUM NICHT `file.text()`?
//   Weil das UTF-8 unterstellt. Lexware, Excel und die meisten deutschen
//   Programme exportieren aber Windows-1252. Dann wird aus "Schäfer" ein
//   "Sch\uFFFDfer" — und die sorgfältige Umlaut-Faltung aus dublettenLogik
//   findet keinen einzigen Doppelten mehr.
//
//   Ein Kodierungsfehler ist der stillste Datenverlust, den es gibt.
//   Nichts stürzt ab. Es steht nur überall Müll.
//
// VIER PROBLEME, DIE HIER GELÖST WERDEN
//   1. Kodierung   UTF-8 oder Windows-1252? Wird gemessen, nicht geraten.
//   2. BOM         Excel-UTF-8 beginnt mit \uFEFF -> erste Spalte hieße "\uFEFFVorname"
//   3. Trennzeichen Deutsches Excel nimmt ";", nicht ","
//   4. Anführungszeichen  "Straße 1\nHinterhaus" -> Zeilenumbruch IM Feld
//
// Was hier NICHT passiert: Raten. Wo etwas unklar ist, sagt es die Funktion.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. KODIERUNG
// ----------------------------------------------------------------------------

export type Kodierung = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export interface KodierungsBefund {
  kodierung: Kodierung;
  /** Wurde sie sicher erkannt (BOM) oder erschlossen? */
  sicher: boolean;
  hinweis: string;
}

/**
 * Erkennt die Kodierung. In dieser Reihenfolge:
 *   1. Byte Order Mark — eindeutig, kein Raten nötig
 *   2. Ist es gültiges UTF-8? Dann ist es UTF-8. (Ungültiges UTF-8 kann kein
 *      Zufall sein — die Regeln sind zu streng, um versehentlich zu passen.)
 *   3. Sonst Windows-1252, die Standardausgabe deutscher Programme.
 */
export function erkenneKodierung(bytes: Uint8Array): KodierungsBefund {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { kodierung: 'utf-8-bom', sicher: true, hinweis: 'UTF-8 mit Byte-Order-Mark (typisch für Excel).' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { kodierung: 'utf-16le', sicher: true, hinweis: 'UTF-16 (Little Endian).' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { kodierung: 'utf-16be', sicher: true, hinweis: 'UTF-16 (Big Endian).' };
  }

  // Streng dekodieren: wirft, sobald ein Byte nicht ins UTF-8-Schema passt.
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { kodierung: 'utf-8', sicher: true, hinweis: 'Gültiges UTF-8.' };
  } catch {
    return {
      kodierung: 'windows-1252',
      sicher: false,
      hinweis: 'Kein gültiges UTF-8 — wird als Windows-1252 gelesen (typisch für Lexware und älteres Excel).',
    };
  }
}

/** Bytes zu Text, mit erkannter Kodierung und ohne BOM. */
export function alsText(bytes: Uint8Array): { text: string; befund: KodierungsBefund } {
  const befund = erkenneKodierung(bytes);

  let text: string;
  switch (befund.kodierung) {
    case 'utf-8-bom':
      text = new TextDecoder('utf-8').decode(bytes.slice(3));
      break;
    case 'utf-16le':
      text = new TextDecoder('utf-16le').decode(bytes.slice(2));
      break;
    case 'utf-16be':
      text = new TextDecoder('utf-16be').decode(bytes.slice(2));
      break;
    case 'windows-1252':
      text = new TextDecoder('windows-1252').decode(bytes);
      break;
    default:
      text = new TextDecoder('utf-8').decode(bytes);
  }

  // Ein BOM kann auch nach dem Dekodieren übrig bleiben.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  return { text, befund };
}

// ----------------------------------------------------------------------------
// 2. TRENNZEICHEN
// ----------------------------------------------------------------------------

export type Trennzeichen = ';' | ',' | '\t' | '|';

const KANDIDATEN: Trennzeichen[] = [';', ',', '\t', '|'];

/**
 * Zählt Trennzeichen außerhalb von Anführungszeichen — sonst zerlegt ein Komma
 * in "Rottenburg, Ergenzingen" die Statistik.
 */
function zaehleAusserhalb(zeile: string, zeichen: string): number {
  let n = 0;
  let inAnfuehrung = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') {
      if (inAnfuehrung && zeile[i + 1] === '"') { i++; continue; }
      inAnfuehrung = !inAnfuehrung;
    } else if (c === zeichen && !inAnfuehrung) {
      n++;
    }
  }
  return n;
}

/**
 * Rät das Trennzeichen: Es gewinnt das, das in den ersten Zeilen am häufigsten
 * UND am gleichmäßigsten vorkommt. Ein Trennzeichen, das mal 3-mal und mal
 * 7-mal auftaucht, ist keins.
 */
export function erkenneTrennzeichen(text: string): { trennzeichen: Trennzeichen; sicher: boolean } {
  const zeilen = text.split(/\r?\n/).filter((z) => z.trim()).slice(0, 10);
  if (zeilen.length === 0) return { trennzeichen: ';', sicher: false };

  let bestes: Trennzeichen = ';';
  let besterWert = -1;
  let sicher = false;

  for (const t of KANDIDATEN) {
    const zahlen = zeilen.map((z) => zaehleAusserhalb(z, t));
    const erste = zahlen[0];
    if (erste === 0) continue;

    const gleichmaessig = zahlen.every((n) => n === erste);
    const wert = erste * (gleichmaessig ? 10 : 1);

    if (wert > besterWert) {
      besterWert = wert;
      bestes = t;
      sicher = gleichmaessig && erste > 0;
    }
  }

  return { trennzeichen: bestes, sicher };
}

// ----------------------------------------------------------------------------
// 3. DER PARSER (RFC 4180)
// ----------------------------------------------------------------------------

/**
 * Zerlegt CSV zeichenweise. Kein Splitten an Kommas — Anführungszeichen dürfen
 * Trennzeichen und Zeilenumbrüche enthalten, und "" steht für ein echtes ".
 */
export function parseCsv(text: string, trennzeichen: Trennzeichen): string[][] {
  const zeilen: string[][] = [];
  let felder: string[] = [];
  let feld = '';
  let inAnfuehrung = false;
  let i = 0;

  const feldAbschliessen = () => { felder.push(feld); feld = ''; };
  const zeileAbschliessen = () => {
    feldAbschliessen();
    // Leerzeilen überspringen — sie sind kein Datensatz.
    if (!(felder.length === 1 && felder[0].trim() === '')) zeilen.push(felder);
    felder = [];
  };

  while (i < text.length) {
    const c = text[i];

    if (inAnfuehrung) {
      if (c === '"') {
        if (text[i + 1] === '"') { feld += '"'; i += 2; continue; }
        inAnfuehrung = false; i++; continue;
      }
      feld += c; i++; continue;
    }

    if (c === '"' && feld === '') { inAnfuehrung = true; i++; continue; }
    if (c === trennzeichen) { feldAbschliessen(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { zeileAbschliessen(); i++; continue; }

    feld += c; i++;
  }

  if (feld !== '' || felder.length > 0) zeileAbschliessen();
  return zeilen;
}

// ----------------------------------------------------------------------------
// 4. SPALTEN ERKENNEN
// ----------------------------------------------------------------------------

export type ZielFeld =
  | 'vorname' | 'nachname' | 'name' | 'firmenname'
  | 'email' | 'telefon' | 'strasse' | 'plz' | 'ort' | 'land'
  | 'notiz' | 'ignorieren';

/** Überschriften, wie sie in freier Wildbahn vorkommen. */
const SYNONYME: Record<Exclude<ZielFeld, 'ignorieren'>, string[]> = {
  vorname: ['vorname', 'firstname', 'first name', 'given name', 'rufname'],
  nachname: ['nachname', 'lastname', 'last name', 'surname', 'familienname', 'zuname'],
  name: ['name', 'vollstandiger name', 'full name', 'kontakt', 'ansprechpartner'],
  firmenname: ['firma', 'firmenname', 'company', 'unternehmen', 'organisation', 'company name', 'betrieb'],
  email: ['email', 'e mail', 'e mail adresse', 'mail', 'emailadresse', 'e mailadresse'],
  telefon: ['telefon', 'tel', 'telefonnummer', 'phone', 'mobil', 'handy', 'mobile', 'rufnummer', 'phone number'],
  strasse: ['strasse', 'straße', 'street', 'adresse', 'address', 'anschrift', 'strasse hausnummer'],
  plz: ['plz', 'postleitzahl', 'zip', 'zip code', 'postal code', 'postcode'],
  ort: ['ort', 'stadt', 'city', 'wohnort', 'gemeinde'],
  land: ['land', 'country', 'staat'],
  notiz: ['notiz', 'notizen', 'bemerkung', 'kommentar', 'note', 'notes', 'anmerkung'],
};

function kopfSchluessel(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Ordnet jede CSV-Spalte einem Zielfeld zu — oder 'ignorieren'.
 *
 * Bewusst zurückhaltend: Was nicht sicher erkannt wird, bleibt 'ignorieren'.
 * Der Mensch stellt es in der Oberfläche um. Falsch zugeordnete Spalten sind
 * schlimmer als gar nicht zugeordnete.
 */
export function erkenneSpalten(kopfzeile: readonly string[]): ZielFeld[] {
  const belegt = new Set<ZielFeld>();

  return kopfzeile.map((kopf) => {
    const k = kopfSchluessel(kopf);
    if (!k) return 'ignorieren';

    for (const [ziel, worte] of Object.entries(SYNONYME) as Array<[Exclude<ZielFeld, 'ignorieren'>, string[]]>) {
      if (belegt.has(ziel)) continue;
      if (worte.includes(k)) { belegt.add(ziel); return ziel; }
    }
    // Zweiter Durchgang: enthält statt exakt ("E-Mail (privat)")
    for (const [ziel, worte] of Object.entries(SYNONYME) as Array<[Exclude<ZielFeld, 'ignorieren'>, string[]]>) {
      if (belegt.has(ziel)) continue;
      if (worte.some((w) => w.length >= 4 && k.includes(w))) { belegt.add(ziel); return ziel; }
    }
    return 'ignorieren';
  });
}

/**
 * Zerlegt "Philipp Schäfer" oder "Schäfer, Philipp".
 * Bei mehr als zwei Wörtern gilt: alles vor dem letzten Wort ist Vorname.
 * "Anna Maria von Weber" -> Vorname "Anna Maria von", Nachname "Weber".
 * Nicht perfekt. Aber nachvollziehbar, und der Mensch sieht es in der Vorschau.
 */
export function zerlegeName(voll: string): { vorname: string; nachname: string } {
  const t = voll.trim().replace(/\s+/g, ' ');
  if (!t) return { vorname: '', nachname: '' };

  if (t.includes(',')) {
    const [nach, vor] = t.split(',', 2);
    return { vorname: (vor ?? '').trim(), nachname: nach.trim() };
  }

  const teile = t.split(' ');
  if (teile.length === 1) return { vorname: '', nachname: teile[0] };
  return { vorname: teile.slice(0, -1).join(' '), nachname: teile[teile.length - 1] };
}

// ----------------------------------------------------------------------------
// 5. ALLES ZUSAMMEN
// ----------------------------------------------------------------------------

export interface CsvBefund {
  kopfzeile: string[];
  zeilen: string[][];
  zuordnung: ZielFeld[];
  kodierung: KodierungsBefund;
  trennzeichen: Trennzeichen;
  trennzeichenSicher: boolean;
  hinweise: string[];
  fehler: string[];
}

/** Der Einstieg: rohe Bytes rein, geprüfte Tabelle raus. */
export function leseCsv(bytes: Uint8Array): CsvBefund {
  const hinweise: string[] = [];
  const fehler: string[] = [];

  const { text, befund } = alsText(bytes);
  if (!befund.sicher) hinweise.push(befund.hinweis);

  const { trennzeichen, sicher } = erkenneTrennzeichen(text);
  if (!sicher) {
    hinweise.push(
      `Das Trennzeichen ist nicht eindeutig — es wird „${trennzeichen === '\t' ? 'Tabulator' : trennzeichen}" ` +
        'angenommen. Bitte die Vorschau prüfen.',
    );
  }

  const alle = parseCsv(text, trennzeichen);
  if (alle.length === 0) {
    fehler.push('Die Datei enthält keine Daten.');
    return { kopfzeile: [], zeilen: [], zuordnung: [], kodierung: befund, trennzeichen, trennzeichenSicher: sicher, hinweise, fehler };
  }

  const kopfzeile = alle[0].map((k) => k.trim());
  const zeilen = alle.slice(1);

  if (zeilen.length === 0) fehler.push('Die Datei enthält nur eine Kopfzeile, aber keine Datensätze.');

  // Ungleich lange Zeilen sind ein Zeichen für ein falsches Trennzeichen.
  const abweichend = zeilen.filter((z) => z.length !== kopfzeile.length).length;
  if (abweichend > 0) {
    hinweise.push(
      `${abweichend} von ${zeilen.length} Zeilen haben eine andere Spaltenzahl als die Kopfzeile. ` +
        'Oft liegt das am Trennzeichen — bitte die Vorschau prüfen.',
    );
  }

  const zuordnung = erkenneSpalten(kopfzeile);
  const erkannt = zuordnung.filter((z) => z !== 'ignorieren').length;
  if (erkannt === 0) {
    hinweise.push('Keine Spalte konnte automatisch zugeordnet werden. Bitte von Hand zuordnen.');
  }

  return { kopfzeile, zeilen, zuordnung, kodierung: befund, trennzeichen, trennzeichenSicher: sicher, hinweise, fehler };
}

/** Eine Zeile in ein Objekt überführen, gemäß Zuordnung. */
export function zeileZuDatensatz(
  zeile: readonly string[],
  zuordnung: readonly ZielFeld[],
): Record<string, string> {
  const raus: Record<string, string> = {};

  zuordnung.forEach((ziel, i) => {
    if (ziel === 'ignorieren') return;
    const wert = (zeile[i] ?? '').trim();
    if (!wert) return;

    if (ziel === 'name') {
      const { vorname, nachname } = zerlegeName(wert);
      if (vorname && !raus.vorname) raus.vorname = vorname;
      if (nachname && !raus.nachname) raus.nachname = nachname;
      return;
    }
    if (!raus[ziel]) raus[ziel] = wert;
  });

  return raus;
}
