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
//
// ▄▄▄ REPARIERT AM 18.09.2026 (Punkt 15) ▄▄▄ Drei Fehler, am echten Code
// nachgerechnet, nicht aus einem Befund uebernommen:
//
//  1. ERFUNDENE UMSATZSTEUER. Eine steuerfreie Lieferung bekam Gegenkonto
//     8400 (SKR03) bzw. 4400 (SKR04) und einen LEEREN BU-Schluessel. Das sind
//     Automatikkonten: DATEV rechnet dort die 19 % selbst heraus, auch ohne
//     BU. Aus 5.000 EUR steuerfrei wurden 798,32 EUR Umsatzsteuer aus dem
//     Nichts. Jetzt gibt es ein eigenes steuerfreies Erloeskonto.
//
//  2. GUTSCHRIFTEN WURDEN ZU ERLOESEN. Das Soll/Haben-Kennzeichen stand fest
//     auf 'S', und extfBetrag() nahm den Absolutbetrag. Eine Gutschrift ueber
//     1.190 EUR wurde damit wie eine Ausgangsrechnung ueber 1.190 EUR gebucht
//     — Abweichung 2.380 EUR. DAZU NEU GEFUNDEN: satzAus() gab bei negativen
//     Betraegen 0 zurueck, die Gutschrift galt also zusaetzlich als
//     steuerfrei und lief in Fehler 1 hinein. Beides ist behoben; das
//     Vorzeichen steuert jetzt Soll/Haben.
//
//  3. BELEGDATUM IM VORMONAT. extfBelegdatum() schickte den Wert durch
//     new Date() und las ihn dann als UTC. Ein Datum mit Zeitzone, etwa
//     "2026-01-01T00:00:00+01:00", wurde damit zu "3112" — Silvester des
//     VORJAHRES, ausserhalb des Wirtschaftsjahres im Stapelkopf. Jetzt wird
//     der Datumsteil direkt gelesen, ohne Zeitzonen-Umweg.
//
// NICHT GEAENDERT, WEIL NICHT BELEGBAR: Der Kontenrahmen (SKR 03/04) steht
// weiterhin nicht in der Kopfzeile. Die Feldposition dafuer liess sich aus den
// verfuegbaren Quellen nicht zweifelsfrei bestimmen — sie widersprechen sich
// sogar bei den Positionen, die hier schon belegt sind. Ein Feld an der
// falschen Stelle bricht den gesamten Import und waere schlimmer als die
// Luecke. Gehoert an den Steuerberater, zusammen mit dem Probestapel.
//
// KEINE STEUERBERATUNG: Die hinterlegten Konten sind VORBELEGTE Werte, keine
// Zusicherung. Welche Konten im Einzelfall richtig sind, gehoert vom
// Steuerberater bestaetigt — deshalb ist jedes davon frei einstellbar.
// ============================================================================

// ▄▄▄ PUNKT 28 (20.09.2026) — ZWEI LUECKEN, BEIM TESTEN GEFUNDEN ▄▄▄
//
//  A. extfBetrag() rundete NICHT symmetrisch. Math.abs() verdeckte das fast
//     vollstaendig — nur wenn Betrag x 100 exakt auf ,5 endet, faellt es auf.
//     GEMESSEN: eine Rechnung ueber 2,675 EUR wird "2,68", eine Gutschrift
//     ueber -2,675 EUR wird "2,67". Ein Cent Unterschied zwischen Hin- und
//     Rueckbuchung, im Buchungsstapel beim Steuerberater. Jetzt centRunden.
//
//  B. extfBelegdatum() nahm jeden Tag von 01 bis 31 in jedem Monat an.
//     "2026-02-31" ergab "3102" — einen Tag, den es nicht gibt. DATEV weist
//     den Stapel dann ab, und zwar erst beim Steuerberater. Jetzt wird die
//     Tageszahl gegen den Monat geprueft, Schaltjahr eingeschlossen; was
//     unmoeglich ist, ergibt leer und wird von extfHinweise() gezaehlt.
//
// BEWUSST NICHT GEAENDERT: Diese Datei bekommt KEINEN CSV-Formelschutz.
// lib/csvSchreiben.ts nimmt sie im eigenen Dateikopf ausdruecklich aus, weil
// ein vorangestelltes Apostroph den DATEV-Import bricht. Die Grenze verlaeuft
// zwischen "ein Mensch oeffnet das in Excel" und "eine Software liest das
// ein". Ein Waechter-Test haelt das fest.
// ============================================================================

import { leseZahlOder, centRunden, inCent } from './zahlen';

export type ExtfKonfig = {
  beraterNr: string;      // DATEV-Beraternummer (Pflicht für echten Import)
  mandantNr: string;      // DATEV-Mandantennummer
  wjBeginn: string;       // Wirtschaftsjahr-Beginn YYYYMMDD
  sachkontenlaenge: number; // i. d. R. 4
  skr: '03' | '04';       // Kontenrahmen
  erloeskonto19: string;  // Erlöse 19 %
  erloeskonto7: string;   // Erlöse 7 %
  /**
   * Erlöse OHNE Umsatzsteuer. Optional, damit bestehende Konfigurationen
   * weiterlaufen — fehlt der Wert, greift der Standard aus extfDefaults.
   * NIE auf ein Automatikkonto zeigen lassen, sonst erfindet DATEV Steuer.
   */
  erloeskonto0?: string;
  /**
   * Paket 284 (K16b): Erlöskonten für Kfz-Sonderfälle. Optional — fehlt ein
   * Wert, greift kfzKontenStandard(). Vorbelegt, vom Steuerberater zu bestätigen.
   */
  erloeskontoDiff19?: string;  // § 25a: Marge (brutto), 19 % USt darin
  erloeskontoDiff0?: string;   // § 25a: Rest des Verkaufspreises ohne USt
  erloeskontoAusfuhr?: string; // § 4 Nr. 1a UStG
  erloeskontoEu?: string;      // § 4 Nr. 1b UStG (innergemeinschaftliche Lieferung)
  debitorSammel: string;  // Debitoren-Sammelkonto (Ausgangsrechnungen)
  kreditorSammel: string; // Kreditoren-Sammelkonto (Eingangsbelege)
  bezeichnung: string;    // Name des Buchungsstapels
};

/**
 * Sinnvolle Standardwerte je Kontenrahmen; Konfig überschreibt.
 *
 * erloeskonto0 ist bewusst ein Sammel-Erlöskonto OHNE Steuerautomatik
 * (SKR03 8200, SKR04 4200). Welches steuerfreie Konto fachlich das richtige
 * ist — innergemeinschaftliche Lieferung, § 4 UStG, Kleinunternehmer § 19 —
 * hängt vom Sachverhalt ab und gehört vom Steuerberater gesetzt. Der Standard
 * ist nur so gewählt, dass er keine Steuer erfindet.
 */
export function extfDefaults(
  skr: '03' | '04',
): Pick<ExtfKonfig, 'erloeskonto19' | 'erloeskonto7' | 'debitorSammel' | 'kreditorSammel'> & { erloeskonto0: string } {
  return skr === '04'
    ? { erloeskonto19: '4400', erloeskonto7: '4300', erloeskonto0: '4200', debitorSammel: '10000', kreditorSammel: '70000' }
    : { erloeskonto19: '8400', erloeskonto7: '8300', erloeskonto0: '8200', debitorSammel: '10000', kreditorSammel: '70000' };
}

/** Das steuerfreie Erlöskonto — konfiguriert, sonst der Standard des Rahmens. */
export function erloeskontoSteuerfrei(k: ExtfKonfig): string {
  const gesetzt = String(k.erloeskonto0 ?? '').trim();
  return gesetzt !== '' ? gesetzt : extfDefaults(k.skr === '04' ? '04' : '03').erloeskonto0;
}

// --- kleine Helfer ----------------------------------------------------------

/** Zahl lesen — seit Punkt 24 über den gemeinsamen Leser aus lib/zahlen.ts. */
function n(v: unknown): number {
  return leseZahlOder(v, 0);
}
/**
 * Betrag DATEV-konform: 2 Nachkommastellen, Komma als Dezimaltrenner, ohne
 * Vorzeichen (DATEV liest die Richtung aus dem Soll/Haben-Kennzeichen).
 *
 * Punkt 28: Erst runden, DANN den Betrag nehmen — und zwar symmetrisch.
 * Vorher lief Math.round auf dem vorzeichenbehafteten Wert und Math.abs
 * darueber: aus -2,675 wurde "2,67", aus 2,675 aber "2,68".
 */
export function extfBetrag(v: unknown): string {
  return Math.abs(centRunden(n(v))).toFixed(2).replace('.', ',');
}
/** Text als DATEV-Feld: immer in Anführungszeichen, interne " verdoppelt, gekürzt. */
function q(v: unknown, max = 60): string {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, max).replace(/"/g, '""');
  return `"${s}"`;
}

/**
 * Kontonummer als Zahlenfeld — OHNE Anführungszeichen, so will es DATEV.
 *
 * Punkt 15, beim Testen gefunden: konto und gegenkonto gingen ungeprüft und
 * ungequotet in die Zeile. `datev_konto` ist in der Datenbank ein freies
 * Textfeld; ein Semikolon darin haette die Zeile um eine Spalte verschoben
 * und den ganzen Stapel unbrauchbar gemacht. Jetzt bleiben nur Ziffern
 * stehen, und was danach leer ist, faellt auf den Ersatzwert zurueck.
 */
export function kontoFeld(v: unknown, ersatz = ''): string {
  const nurZiffern = String(v ?? '').replace(/[^0-9]/g, '');
  if (nurZiffern !== '') return nurZiffern;
  return String(ersatz ?? '').replace(/[^0-9]/g, '');
}
/**
 * Wie viele Tage hat dieser Monat? Schaltjahr nach der gregorianischen Regel:
 * durch 4 teilbar, aber nicht durch 100 — ausser durch 400.
 */
function tageImMonat(jahr: number, monat: number): number {
  if (monat === 2) {
    const schalt = (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;
    return schalt ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(monat) ? 30 : 31;
}

/**
 * Belegdatum als TTMM (Wirtschaftsjahr steckt im Kopf).
 *
 * Punkt 15: Der Wert lief frueher durch new Date() und wurde dann als UTC
 * gelesen. "2026-01-01T00:00:00+01:00" wurde damit zu "3112" — Silvester des
 * VORJAHRES, ausserhalb des Wirtschaftsjahres im Stapelkopf. Ein Kalendertag
 * ist keine Zeitangabe: der Datumsteil wird jetzt direkt gelesen.
 */
export function extfBelegdatum(iso: unknown): string {
  const s = String(iso ?? '').trim();
  if (s === '') return '';

  // Der Normalfall aus der Datenbank: YYYY-MM-DD, ggf. mit Uhrzeit dahinter.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const jahr = Number(m[1]);
    const monat = Number(m[2]);
    const tag = Number(m[3]);
    // Punkt 28: Der Tag muss es im Monat wirklich geben. "2026-02-31" ergab
    // vorher "3102" und brach den Import erst beim Steuerberater.
    if (monat < 1 || monat > 12 || tag < 1 || tag > tageImMonat(jahr, monat)) return '';
    return `${m[3]}${m[2]}`;
  }

  // Alles andere (z. B. ein echtes Date-Objekt als String) weiterhin ueber
  // Date — aber mit den ORTSZEIT-Gettern, damit nichts einen Tag rutscht.
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}${p(d.getMonth() + 1)}`;
}

/**
 * Steuersatz aus netto/ust schätzen: 19, 7 oder 0.
 *
 * Punkt 15: Frueher ergab jede GUTSCHRIFT eine 0, weil netto und ust dort
 * negativ sind — die Gutschrift galt als steuerfrei und lief zusaetzlich in
 * den Automatikkonto-Fehler hinein. Der Steuersatz haengt am Verhaeltnis,
 * nicht an der Richtung: gerechnet wird deshalb mit Betraegen.
 */
export function satzAus(netto: unknown, ust: unknown): 0 | 7 | 19 {
  const nt = Math.abs(n(netto));
  const us = Math.abs(n(ust));
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
    kontoFeld(b.konto), kontoFeld(b.gegenkonto), b.bu || '', b.belegdatum,
    q(b.belegfeld1, 36), q(b.belegfeld2, 12), '', q(b.buchungstext, 60),
  ].join(';');
}

export type RechnungRoh = {
  rechnungsnummer?: unknown; rechnungsdatum?: unknown; empfaenger_name?: unknown;
  netto_summe?: unknown; mwst_summe?: unknown; brutto_summe?: unknown;
  /** Paket 284: Kfz-Sonderfall aus Paket 268 (diff25a | eu_ig | ausfuhr), sonst leer. */
  steuer_sonderfall?: unknown;
  /** Paket 284: § 25a — Marge netto und Differenzsteuer (rechnungen.diff_*). */
  diff_bemessung?: unknown; diff_steuer?: unknown;
  /** Paket 284: Summe der 0-%-Positionen (der Teil, den der Sonderfall betrifft); null = unbekannt. */
  netto0?: unknown;
  /** Paket 284: interne Fahrzeugnummer (F-0001) — steht im Buchungstext. */
  fahrzeug_nr?: unknown;
};
export type BelegRoh = {
  belegnummer?: unknown; belegdatum?: unknown; lieferant?: unknown;
  netto?: unknown; ust_betrag?: unknown; brutto?: unknown;
  kategorie?: unknown; datev_konto?: unknown;
};

/**
 * Ausgangsrechnung → Buchung (Debitor SOLL an Erlöskonto, BU 3/2).
 *
 * Punkt 15, zwei Aenderungen:
 *  · Ein steuerfreier Umsatz geht auf das steuerfreie Erloeskonto, nicht auf
 *    das 19-%-Automatikkonto. Sonst erfindet DATEV Umsatzsteuer.
 *  · Eine GUTSCHRIFT (negativer Betrag) wird als HABEN gebucht. Vorher stand
 *    'S' fest, und extfBetrag() nahm den Absolutbetrag — die Gutschrift wurde
 *    dadurch zum Erloes, mit doppelter Abweichung.
 */
export function buchungAusRechnung(r: RechnungRoh, k: ExtfKonfig): Buchung {
  const satz = satzAus(r.netto_summe, r.mwst_summe);
  const bu = satz === 19 ? '3' : satz === 7 ? '2' : '';
  const gegenkonto =
    satz === 7 ? k.erloeskonto7 : satz === 19 ? k.erloeskonto19 : erloeskontoSteuerfrei(k);
  const betrag = n(r.brutto_summe);
  return {
    umsatz: betrag, sh: betrag < 0 ? 'H' : 'S', konto: k.debitorSammel, gegenkonto, bu,
    belegdatum: extfBelegdatum(r.rechnungsdatum),
    belegfeld1: String(r.rechnungsnummer ?? ''), belegfeld2: '',
    buchungstext: `Rechnung ${String(r.empfaenger_name ?? '')}`.trim(),
  };
}

/**
 * Eingangsbeleg → Buchung (Aufwandskonto SOLL an Kreditor, BU 9/8 Vorsteuer).
 *
 * Punkt 15: Eine Lieferantengutschrift (negativer Betrag) wird als HABEN
 * gebucht, statt den Aufwand ein zweites Mal zu erhoehen.
 */
export function buchungAusBeleg(b: BelegRoh, k: ExtfKonfig, aufwandFallback: string): Buchung {
  const satz = satzAus(b.netto, b.ust_betrag);
  const bu = satz === 19 ? '9' : satz === 7 ? '8' : ''; // 9=19% VSt, 8=7% VSt
  const konto = kontoFeld(b.datev_konto, aufwandFallback);
  const betrag = n(b.brutto);
  return {
    umsatz: betrag, sh: betrag < 0 ? 'H' : 'S', konto, gegenkonto: k.kreditorSammel, bu,
    belegdatum: extfBelegdatum(b.belegdatum),
    belegfeld1: String(b.belegnummer ?? ''), belegfeld2: '',
    buchungstext: `ER ${String(b.lieferant ?? '')}`.trim(),
  };
}

// ---------------------------------------------------------------------------
// Paket 284 (09.10.2026) · K16b — Kfz-Sonderfaelle richtig buchen
//
// BEFUND (am Code nachgerechnet): Eine § 25a-Rechnung (Fahrzeug 0 % zum vollen
// Preis + Zulassung 19 %) hat eine winzige ausgewiesene Steuer im Verhaeltnis
// zum Netto. satzAus() machte daraus 7 % — 20.595 EUR landeten auf dem 7-%-
// Automatikkonto, DATEV haette rund 1.347 EUR Umsatzsteuer erfunden. Ohne
// Zusatzleistung ging alles steuerfrei auf das Sammelkonto, die geschuldete
// Differenzsteuer fehlte. EU-Lieferung und Ausfuhr hatten kein eigenes Konto.
//
// JETZT: Rechnungen mit Sonderfall werden aufgeteilt —
//   · 0-%-Teil (Fahrzeug) je Sonderfall:
//       § 25a   -> Marge brutto (Bemessung + Differenzsteuer) auf das
//                  19-%-Konto nach §§ 25, 25a, Rest ohne USt auf das Konto
//                  „ohne USt" (so rechnet DATEV die Steuer nur aus der Marge)
//       EU      -> Konto § 4 Nr. 1b, Ausfuhr -> Konto § 4 Nr. 1a
//   · Rest (Zulassung, Ueberfuehrung …) wie jede normale Rechnung.
// Alle Teile zusammen ergeben auf den Cent den Rechnungsbetrag.
// Ist der 0-%-Teil unbekannt (Positionen fehlen) und Steuer ausgewiesen, wird
// NICHT geraten: die Rechnung geht wie bisher in EINE Zeile und extfHinweise
// meldet sie. Die Fahrzeugnummer steht im Buchungstext; eine Kostenstelle
// (KOST1) wird nicht gesetzt, solange ihre Feldposition nicht belegt ist.
// KEINE STEUERBERATUNG: Konten vorbelegt nach SKR 03/04, frei einstellbar.
// ---------------------------------------------------------------------------

export type KfzSonderfall = 'diff25a' | 'eu_ig' | 'ausfuhr';

/** Vorbelegte Kfz-Erlöskonten je Kontenrahmen (Bezeichnungen laut SKR 03 Klasse 8 / SKR 04 Klasse 4). */
export function kfzKontenStandard(skr: '03' | '04'): { diff19: string; diff0: string; ausfuhr: string; eu: string } {
  return skr === '04'
    ? { diff19: '4136', diff0: '4138', ausfuhr: '4120', eu: '4125' }
    : { diff19: '8191', diff0: '8193', ausfuhr: '8120', eu: '8125' };
}

function kfzKonten(k: ExtfKonfig) {
  const std = kfzKontenStandard(k.skr === '04' ? '04' : '03');
  const w = (v: unknown, e: string) => (String(v ?? '').trim() !== '' ? String(v).trim() : e);
  return { diff19: w(k.erloeskontoDiff19, std.diff19), diff0: w(k.erloeskontoDiff0, std.diff0), ausfuhr: w(k.erloeskontoAusfuhr, std.ausfuhr), eu: w(k.erloeskontoEu, std.eu) };
}

/** Sonderfall einer Rechnung oder null. */
export function kfzSonderfall(r: RechnungRoh): KfzSonderfall | null {
  const s = String(r.steuer_sonderfall ?? '').trim();
  return s === 'diff25a' || s === 'eu_ig' || s === 'ausfuhr' ? s : null;
}

function leer(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

/** Den 0-%-Teil kennen wir: aus den Positionen oder weil gar keine Steuer ausgewiesen ist. */
export function kfzTeilBekannt(r: RechnungRoh): boolean {
  if (!kfzSonderfall(r)) return false;
  return !leer(r.netto0) || n(r.mwst_summe) === 0;
}

/**
 * Alle Buchungszeilen einer Ausgangsrechnung. Ohne Sonderfall genau eine
 * (unverändert buchungAusRechnung), mit Sonderfall die Aufteilung.
 */
export function buchungenAusRechnung(r: RechnungRoh, k: ExtfKonfig): Buchung[] {
  const sf = kfzSonderfall(r);
  const basis = buchungAusRechnung(r, k);
  const nr = String(r.fahrzeug_nr ?? '').trim();
  if (nr) basis.buchungstext = `Fzg ${nr} ${basis.buchungstext}`;
  if (!sf || !kfzTeilBekannt(r)) return [basis];

  const bruttoC = inCent(n(r.brutto_summe));
  if (bruttoC === 0) return [basis];
  const vz = bruttoC < 0 ? -1 : 1;
  const gesamt = Math.abs(bruttoC);
  const mwstC = Math.abs(inCent(n(r.mwst_summe)));
  // 0-%-Teil: aus den Positionen; ohne ausgewiesene Steuer ist es die ganze Rechnung.
  let teil0 = leer(r.netto0) ? gesamt : Math.abs(inCent(n(r.netto0)));
  teil0 = Math.min(Math.max(teil0, 0), gesamt);
  const rest = gesamt - teil0;
  const kk = kfzKonten(k);
  const zeilen: { cent: number; konto: string; bu: string }[] = [];

  if (rest > 0) {
    const satz = mwstC > 0 ? satzAus((rest - mwstC) / 100, mwstC / 100) : 0;
    zeilen.push({ cent: rest, konto: satz === 19 ? k.erloeskonto19 : satz === 7 ? k.erloeskonto7 : erloeskontoSteuerfrei(k), bu: satz === 19 ? '3' : satz === 7 ? '2' : '' });
  }
  if (sf === 'diff25a') {
    const marge = Math.min(Math.max(Math.abs(inCent(n(r.diff_bemessung))) + Math.abs(inCent(n(r.diff_steuer))), 0), teil0);
    if (marge > 0) zeilen.push({ cent: marge, konto: kk.diff19, bu: '3' });
    if (teil0 - marge > 0) zeilen.push({ cent: teil0 - marge, konto: kk.diff0, bu: '' });
  } else if (teil0 > 0) {
    zeilen.push({ cent: teil0, konto: sf === 'eu_ig' ? kk.eu : kk.ausfuhr, bu: '' });
  }
  if (zeilen.length === 0) return [basis];
  return zeilen.map((z) => ({ ...basis, umsatz: (vz * z.cent) / 100, gegenkonto: z.konto, bu: z.bu }));
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
  for (const r of e.rechnungen || []) for (const b of buchungenAusRechnung(r, e.konfig)) zeilen.push(buchungZeile(b));
  for (const b of e.belege || []) zeilen.push(buchungZeile(buchungAusBeleg(b, e.konfig, e.aufwandFallback)));
  return '﻿' + zeilen.join('\r\n') + '\r\n';
}

/**
 * Was der Betrieb VOR dem Weitergeben an den Steuerberater wissen sollte.
 *
 * Ein EXTF-Stapel ist technisch importierbar, auch wenn er fachlich falsch
 * ist — der Fehler steht dann in der Buchhaltung des Mandanten und faellt
 * niemandem auf. Diese Liste macht die Stellen sichtbar, die ein Mensch
 * ansehen muss. Sie aendert den Stapel NICHT und blockiert nichts.
 *
 * Bewusst additiv: baueExtf() bleibt unveraendert, jede Seite kann diese
 * Funktion zusaetzlich aufrufen.
 */
export function extfHinweise(e: ExtfEingabe): string[] {
  const raus: string[] = [];
  const k = e.konfig;

  if (String(k.beraterNr ?? '').trim() === '' || String(k.mandantNr ?? '').trim() === '') {
    raus.push('Beraternummer oder Mandantennummer fehlt — ohne beides lehnt DATEV den Import ab.');
  }

  const steuerfrei = (e.rechnungen || []).filter(
    (r) => !kfzSonderfall(r) && satzAus(r.netto_summe, r.mwst_summe) === 0 && n(r.brutto_summe) !== 0,
  ).length;
  if (steuerfrei > 0) {
    raus.push(
      `${steuerfrei} ${steuerfrei === 1 ? 'Rechnung ist' : 'Rechnungen sind'} ohne Umsatzsteuer und ` +
        `${steuerfrei === 1 ? 'wird' : 'werden'} auf Konto ${erloeskontoSteuerfrei(k)} gebucht. ` +
        `Bitte vom Steuerberater bestätigen lassen, ob das für Ihren Fall das richtige Konto ist ` +
        `(innergemeinschaftliche Lieferung, § 4 UStG oder Kleinunternehmer § 19 sind verschiedene Konten).`,
    );
  }

  // Paket 284: Kfz-Sonderfaelle
  const sonder = (e.rechnungen || []).filter((r) => kfzSonderfall(r) && n(r.brutto_summe) !== 0);
  if (sonder.length > 0) {
    const kk = kfzKonten(k);
    const zahl = (f: KfzSonderfall) => sonder.filter((r) => kfzSonderfall(r) === f && kfzTeilBekannt(r)).length;
    const d = zahl('diff25a'), eu = zahl('eu_ig'), au = zahl('ausfuhr');
    if (d > 0) raus.push(`${d} ${d === 1 ? 'Rechnung' : 'Rechnungen'} nach § 25a (Differenzbesteuerung): Marge auf ${kk.diff19}, Rest des Fahrzeugpreises ohne Umsatzsteuer auf ${kk.diff0}, Zusatzleistungen wie üblich. Konten bitte vom Steuerberater bestätigen lassen.`);
    if (eu > 0) raus.push(`${eu} innergemeinschaftliche ${eu === 1 ? 'Lieferung' : 'Lieferungen'} auf ${kk.eu}. Die USt-IdNr. des Käufers steht nicht im Stapel; die Zusammenfassende Meldung macht ARGONAUT nicht.`);
    if (au > 0) raus.push(`${au} ${au === 1 ? 'Ausfuhr' : 'Ausfuhren'} auf ${kk.ausfuhr}. Den Ausfuhrnachweis (Ausgangsvermerk) bitte beim Beleg aufbewahren.`);
    const unklar = sonder.filter((r) => !kfzTeilBekannt(r));
    if (unklar.length > 0) raus.push(`${unklar.length} Kfz-${unklar.length === 1 ? 'Rechnung' : 'Rechnungen'} (${unklar.slice(0, 5).map((r) => String(r.rechnungsnummer ?? '?')).join(', ')}) konnte${unklar.length === 1 ? '' : 'n'} nicht aufgeteilt werden, weil die Positionen fehlen — bitte von Hand buchen lassen.`);
    const offen = sonder.filter((r) => kfzSonderfall(r) === 'diff25a' && kfzTeilBekannt(r) && leer(r.diff_bemessung)).length;
    if (offen > 0) raus.push(`${offen} § 25a-${offen === 1 ? 'Rechnung hat' : 'Rechnungen haben'} keine Differenz-Berechnung (Einkaufspreis fehlte) — der ganze Fahrzeugpreis steht ohne Umsatzsteuer auf ${kk.diff0}. Marge bitte ergänzen.`);
  }

  const gutschriften =
    (e.rechnungen || []).filter((r) => n(r.brutto_summe) < 0).length +
    (e.belege || []).filter((b) => n(b.brutto) < 0).length;
  if (gutschriften > 0) {
    raus.push(
      `${gutschriften} ${gutschriften === 1 ? 'Beleg ist eine Gutschrift und wird' : 'Belege sind Gutschriften und werden'} ` +
        `im Haben gebucht. Bitte im Probestapel gegenprüfen.`,
    );
  }

  const ohneDatum =
    (e.rechnungen || []).filter((r) => extfBelegdatum(r.rechnungsdatum) === '').length +
    (e.belege || []).filter((b) => extfBelegdatum(b.belegdatum) === '').length;
  if (ohneDatum > 0) {
    raus.push(`${ohneDatum} ${ohneDatum === 1 ? 'Buchung hat' : 'Buchungen haben'} kein lesbares Belegdatum.`);
  }

  raus.push(
    `Der Kontenrahmen (SKR ${k.skr}) steht NICHT in der Kopfzeile des Stapels. ` +
      `Bitte beim Steuerberater prüfen lassen, ob der Mandant denselben Kontenrahmen führt — ` +
      `sonst buchen dieselben Kontonummern auf völlig andere Konten.`,
  );

  return raus;
}
