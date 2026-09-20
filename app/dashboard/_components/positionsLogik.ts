// ============================================================================
// ARGONAUT OS · positionsLogik.ts
// Block 1 · A4-0 — Das Rechenwerk unter Auftrag, Lieferschein, Paket, Rechnung
//
// Reine Funktionen. Kein DB-Zugriff, kein React, keine Seiteneffekte.
//
// BRANCHENNEUTRAL. Kein Wort über Holz.
//   Der Brennholz-Auftrag steckt Sortiment-Varianten hinein, die Werkstatt
//   Ersatzteile, der GaLaBauer Quadratmeter. Diese Datei sieht nur Zeilen mit
//   Menge, Preis und Steuersatz.
//
// EINE RECHENSTELLE, VIER VERWENDER
//   Auftrag · Lieferschein · Paket · Rechnung rechnen alle hier.
//   Zwei Rechenstellen ergeben zwei Summen, und eine davon ist falsch.
//
// ⚠️ DER UNTERSCHIED ZU preisLogik.summiere()
//   preisLogik rechnet die Steuer JE POSITION und addiert. Bei drei Positionen
//   à 7 % entstehen dabei Rundungsdifferenzen von ein bis zwei Cent gegenüber
//   der Steuer auf die Gruppensumme.
//
//   Auf einem Angebot fällt das nicht auf. Auf einer Rechnung schon — der
//   Kunde rechnet nach, und die Betriebsprüfung auch.
//
//   Deshalb: Steuer IMMER auf die Gruppensumme, nie je Position aufaddiert.
//
// ⚠️ RABATT VOR STEUER
//   Rabatt mindert das Entgelt, die Steuer folgt dem geminderten Entgelt.
//   Umgekehrt entstünde ein Steuerbetrag auf Geld, das nie geflossen ist.
//   (Keine Steuerberatung — aber die Reihenfolge ist zwingend.)
//
// ▄▄▄ PUNKT 27 (20.09.2026) — WAS SICH GEÄNDERT HAT ▄▄▄
//  1. `cent()` rundete NICHT symmetrisch um Null. Math.round(-234.5) ist in
//     JavaScript -234, nicht -235: aus -2,345 € wurden -2,34 € statt -2,35 €.
//     Diese Datei erlaubt negative Mengen ausdrücklich ("Negative Menge —
//     ist das eine Gutschrift?"), also traf es genau die Gutschriften.
//     Jetzt centRunden() aus lib/zahlen.ts — dieselbe Rundung wie in
//     nachkalkulation, provision, zahlungAufteilung und steuerLogik.
//  2. `preisGenau()` hatte denselben Fehler auf vier Stellen.
//  3. Menge, Einzelpreis, Steuersatz und Rabatt werden über lib/zahlen.ts
//     gelesen. Vorher galt "1.234,56" aus einem Formularfeld als
//     "keine gültige Zahl" und die ganze Position fiel aus der Summe.
//  4. `verteileFixpreis` liest den Fixpreis jetzt ebenfalls über
//     lib/zahlen.ts und meldet additiv `ok`. Vorher gab sie bei einem
//     Fixpreis, der als Text oder als null ankam, die UNVERÄNDERTEN
//     Positionen zurück — das Paket kostete dann den vollen Einzelpreis,
//     und der einzige Hinweis darauf stand in `hinweise`, das paketLogik
//     zwar durchreicht, aber nicht auswertet.
//
// Node-getestet: tests/geldSchichtP27.test.mjs
// ============================================================================

import { leseZahl, centRunden } from '@/lib/zahlen';

// ----------------------------------------------------------------------------
// 1. TYPEN
// ----------------------------------------------------------------------------

/** Woher stammt die Position? Bestimmt, woran sie andockt — nicht wie sie rechnet. */
export type PositionsArt =
  | 'sortiment'   // Brennholz-Variante
  | 'artikel'     // ERP-Artikel: Anzünder, Ersatzteil
  | 'leistung'    // Leistungskatalog: Schichten, Arbeitsstunde
  | 'anfahrt'     // aus anfahrtLogik
  | 'paket'       // ein ganzes Paket als eine Zeile
  | 'freitext';   // alles andere

/** Eine Zeile, wie sie eingegeben oder geladen wird. */
export interface Position {
  id?: string;
  art: PositionsArt;

  bezeichnung: string;
  /** Zweite Zeile unter der Bezeichnung. */
  detail?: string | null;

  menge: number;
  /** Freitext: 'SRM', 'Stk', 'Std', 'm²'. Diese Datei interpretiert ihn nicht. */
  einheit: string;

  einzelpreis_netto: number;
  steuersatz_prozent: number;

  /** Prozentualer Nachlass auf diese Zeile. 0–100. */
  rabatt_prozent?: number | null;

  /** Verweis auf die Quelle. Nur zum Wiederfinden, nie zum Rechnen. */
  quelle_id?: string | null;
  position_nr?: number | null;
  notiz?: string | null;
}

export interface PositionsErgebnis {
  position: Position;
  ok: boolean;
  fehler: string[];
  hinweise: string[];

  /** menge × einzelpreis, vor Rabatt */
  grundNetto: number;
  rabattProzent: number;
  rabattBetrag: number;
  /** grundNetto − rabattBetrag. Das ist das Entgelt. */
  netto: number;
  steuersatzProzent: number;
}

export interface SteuerGruppe {
  steuersatzProzent: number;
  netto: number;
  steuerBetrag: number;
  brutto: number;
}

export interface Summe {
  netto: number;
  rabattGesamt: number;
  steuerBetrag: number;
  brutto: number;
  /** Aufteilung für den Steuerausweis. Nie gemittelt. */
  gruppen: SteuerGruppe[];

  ok: boolean;
  fehler: string[];
  hinweise: string[];
}

// ----------------------------------------------------------------------------
// 2. GELD
// ----------------------------------------------------------------------------

/**
 * Auf Cent runden. Jeder Geldbetrag läuft hier durch.
 * Symmetrisch um Null — eine Gutschrift über -2,345 € ergibt -2,35 €,
 * nicht -2,34 €.
 */
export function cent(betrag: number): number {
  return centRunden(betrag);
}

/**
 * Ein Einzelpreis ist ein FAKTOR, kein Geldbetrag auf dem Beleg.
 * Ihn auf Cent zu runden erzeugt doppelte Rundung:
 *   227,45 € / 2 Stück = 113,725 -> gerundet 113,73 -> × 2 = 227,46 €
 * Ein Paket für 249 € rechnete so 249,01 € ab.
 * Deshalb vier Nachkommastellen. Der ZEILENBETRAG bleibt auf Cent.
 *
 * Ebenfalls symmetrisch um Null, aus demselben Grund wie cent().
 */
export function preisGenau(wert: number): number {
  if (!Number.isFinite(wert)) return 0;
  const v = Math.round((Math.abs(wert) + Number.EPSILON) * 1e4) / 1e4;
  return wert < 0 ? -v : v;
}

/**
 * Liest einen Zahlwert aus Formular oder Datenbank.
 * null heißt "nicht lesbar" — der Aufrufer meldet das als Fehler, statt
 * still mit 0 weiterzurechnen.
 */
function zahl(v: unknown): number | null {
  return leseZahl(v);
}

export function eur(betrag: number): string {
  if (!Number.isFinite(betrag)) return '—';
  return `${betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function formatZahl(wert: number, stellen = 2): string {
  if (!Number.isFinite(wert)) return '—';
  return wert.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

/** "8,00 SRM" */
export function mengeText(menge: number, einheit: string, stellen = 2): string {
  return `${formatZahl(menge, stellen)} ${einheit}`.trim();
}

// ----------------------------------------------------------------------------
// 3. EINE POSITION
// ----------------------------------------------------------------------------

export function berechnePosition(p: Position): PositionsErgebnis {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  if (!p.bezeichnung?.trim()) fehler.push('Die Position hat keine Bezeichnung.');

  // Über lib/zahlen.ts, damit "1.234,56" aus einem Formularfeld gelesen wird
  // statt als "keine gültige Zahl" die ganze Position aus der Summe zu werfen.
  const menge = zahl(p.menge);
  if (menge === null) fehler.push('Die Menge ist keine gültige Zahl.');
  else if (menge === 0) fehler.push('Die Menge ist 0.');
  else if (menge < 0) hinweise.push('Negative Menge — ist das eine Gutschrift?');

  const einzelpreis = zahl(p.einzelpreis_netto);
  if (einzelpreis === null) fehler.push('Der Einzelpreis ist keine gültige Zahl.');
  else if (einzelpreis < 0) fehler.push('Der Einzelpreis darf nicht negativ sein.');
  else if (einzelpreis === 0) hinweise.push('Einzelpreis 0 € — Absicht?');

  const satzGelesen = zahl(p.steuersatz_prozent);
  if (satzGelesen === null || satzGelesen < 0 || satzGelesen > 100) {
    fehler.push('Der Steuersatz muss zwischen 0 und 100 % liegen.');
  }
  const steuersatzProzent = satzGelesen ?? 0;

  const rabattRoh = p.rabatt_prozent === null || p.rabatt_prozent === undefined ? 0 : zahl(p.rabatt_prozent);
  let rabattProzent = 0;
  if (rabattRoh === null) {
    fehler.push('Der Rabatt ist keine gültige Zahl.');
  } else if (rabattRoh > 0) {
    if (rabattRoh > 100) fehler.push('Der Rabatt darf 100 % nicht überschreiten.');
    else {
      rabattProzent = rabattRoh;
      if (rabattRoh > 50) hinweise.push(`${formatZahl(rabattRoh, 0)} % Rabatt — bitte prüfen.`);
    }
  }

  if (fehler.length > 0 || menge === null || einzelpreis === null) {
    return {
      position: p, ok: false, fehler, hinweise,
      grundNetto: 0, rabattProzent: 0, rabattBetrag: 0, netto: 0,
      steuersatzProzent,
    };
  }

  const grundNetto = cent(menge * einzelpreis);
  const rabattBetrag = cent(grundNetto * (rabattProzent / 100));
  // Rabatt vor Steuer. Die Steuer folgt dem geminderten Entgelt.
  const netto = cent(grundNetto - rabattBetrag);

  return {
    position: p, ok: true, fehler, hinweise,
    grundNetto, rabattProzent, rabattBetrag, netto, steuersatzProzent,
  };
}

// ----------------------------------------------------------------------------
// 4. DIE SUMME
// ----------------------------------------------------------------------------

/**
 * Fasst Positionen zusammen und weist die Steuer getrennt aus.
 *
 * ⚠️ Die Steuer wird auf die GRUPPENSUMME gerechnet, nicht je Position.
 *    3 × 100,00 € netto zu 7 %:
 *      je Position:   3 × 7,00 = 21,00 €
 *      Gruppensumme:  300,00 × 7 % = 21,00 €      (hier gleich)
 *    3 × 33,33 € netto zu 7 %:
 *      je Position:   3 × 2,33 = 6,99 €
 *      Gruppensumme:  99,99 × 7 % = 7,00 €        (ein Cent Unterschied)
 *
 *    Auf einem Angebot egal. Auf einer Rechnung nicht.
 */
export function summiere(positionen: readonly Position[]): Summe {
  const ergebnisse = positionen.map(berechnePosition);

  const fehler: string[] = [];
  const hinweise: string[] = [];

  ergebnisse.forEach((e, i) => {
    e.fehler.forEach((f) => fehler.push(`Position ${i + 1}: ${f}`));
    e.hinweise.forEach((h) => hinweise.push(`Position ${i + 1}: ${h}`));
  });

  const gueltig = ergebnisse.filter((e) => e.ok);

  // Netto je Steuersatz sammeln
  const nachSatz = new Map<number, number>();
  for (const e of gueltig) {
    nachSatz.set(e.steuersatzProzent, cent((nachSatz.get(e.steuersatzProzent) ?? 0) + e.netto));
  }

  const gruppen: SteuerGruppe[] = [...nachSatz.entries()]
    .map(([satz, netto]) => {
      const steuerBetrag = cent(netto * (satz / 100));
      return { steuersatzProzent: satz, netto, steuerBetrag, brutto: cent(netto + steuerBetrag) };
    })
    .sort((a, b) => a.steuersatzProzent - b.steuersatzProzent);

  const netto = cent(gruppen.reduce((s, g) => s + g.netto, 0));
  const steuerBetrag = cent(gruppen.reduce((s, g) => s + g.steuerBetrag, 0));
  const brutto = cent(gruppen.reduce((s, g) => s + g.brutto, 0));
  const rabattGesamt = cent(gueltig.reduce((s, e) => s + e.rabattBetrag, 0));

  if (positionen.length === 0) hinweise.push('Keine Positionen erfasst.');

  return {
    netto, rabattGesamt, steuerBetrag, brutto, gruppen,
    ok: fehler.length === 0 && gueltig.length > 0,
    fehler, hinweise,
  };
}

/** Nur die gültigen Zeilen, durchgerechnet. Für Tabellen. */
export function berechneAlle(positionen: readonly Position[]): PositionsErgebnis[] {
  return positionen.map(berechnePosition);
}

// ----------------------------------------------------------------------------
// 5. NUMMERIERUNG
// ----------------------------------------------------------------------------

/** Vergibt fortlaufende Positionsnummern, ohne die Reihenfolge zu ändern. */
export function nummeriere(positionen: readonly Position[]): Position[] {
  return positionen.map((p, i) => ({ ...p, position_nr: i + 1 }));
}

/** Verschiebt eine Position. Gibt eine neue Liste zurück. */
export function verschiebe(positionen: readonly Position[], von: number, nach: number): Position[] {
  if (von === nach || von < 0 || nach < 0 || von >= positionen.length || nach >= positionen.length) {
    return [...positionen];
  }
  const liste = [...positionen];
  const [raus] = liste.splice(von, 1);
  liste.splice(nach, 0, raus);
  return nummeriere(liste);
}

// ----------------------------------------------------------------------------
// 6. KLARTEXT
// ----------------------------------------------------------------------------

/** Die Steuerzeilen für Beleg und Bildschirm. */
export function steuerAusweisZeilen(s: Summe): string[] {
  return s.gruppen.map(
    (g) => `zzgl. ${formatZahl(g.steuersatzProzent, 0)} % USt. auf ${eur(g.netto)}: ${eur(g.steuerBetrag)}`,
  );
}

/** "8,00 SRM Buche 33 cm · 95,00 € · − 5 % → 722,00 € netto" */
export function positionKlartext(e: PositionsErgebnis): string {
  if (!e.ok) return e.fehler.join(' ');

  const p = e.position;
  // Über lib/zahlen.ts, damit ein Formularwert wie "1.234,56" hier nicht als
  // "—" erscheint, während die Zeile darunter richtig rechnet.
  const teile = [
    `${mengeText(zahl(p.menge) ?? 0, p.einheit)} ${p.bezeichnung}`,
    eur(zahl(p.einzelpreis_netto) ?? 0),
  ];
  if (e.rabattProzent > 0) teile.push(`− ${formatZahl(e.rabattProzent, 0)} % (${eur(e.rabattBetrag)})`);
  return `${teile.join(' · ')} → ${eur(e.netto)} netto`;
}

/** Eine Zeile für den Bestätigungsdialog. */
export function summeKlartext(s: Summe): string {
  if (!s.ok) return s.fehler.join(' ');
  const teile = [`${eur(s.netto)} netto`];
  if (s.rabattGesamt > 0) teile.push(`(nach ${eur(s.rabattGesamt)} Rabatt)`);
  teile.push(`${eur(s.brutto)} brutto`);
  return teile.join(' · ');
}

// ----------------------------------------------------------------------------
// 7. FIXPREIS AUFTEILEN — Grundlage für A3b (Pakete)
// ----------------------------------------------------------------------------

export interface AufteilungsErgebnis {
  positionen: Position[];
  /** Der Rundungsrest, der auf die größte Position gelegt wurde. */
  restCent: number;
  hinweise: string[];
  /**
   * Wurde der Fixpreis wirklich verteilt? (Punkt 27, additiv ergänzt.)
   *
   * false heißt: die Positionen kommen UNVERÄNDERT zurück und tragen ihre
   * vollen Einzelpreise. Wer das Ergebnis als "Paket zum Festpreis" anzeigt,
   * ohne dieses Feld zu prüfen, berechnet dem Kunden den vollen Preis und
   * nennt ihn trotzdem Festpreis.
   */
  ok: boolean;
}

/**
 * Verteilt einen Fixpreis anteilig auf Positionen mit unterschiedlichen
 * Steuersätzen.
 *
 * ⚠️ WARUM DAS ÜBERHAUPT NÖTIG IST
 *   Ein Paket für 249 € aus 7-%- und 19-%-Ware braucht eine Aufteilung.
 *   Ohne sie stimmt die Umsatzsteuer nicht. Die Aufteilung muss
 *   NACHVOLLZIEHBAR sein, nicht willkürlich.
 *
 *   Diese Funktion verteilt nach dem Verhältnis der Einzelpreise — die
 *   marktübliche und begründbare Methode.
 *
 * ⚠️ KEINE STEUERBERATUNG.
 *   Ob diese Methode für einen konkreten Betrieb zulässig ist, gehört von
 *   der Steuerberatung bestätigt. Die Funktion dokumentiert, was sie tut;
 *   sie behauptet nicht, dass es richtig ist.
 *
 * Der Rundungsrest landet auf der größten Position — nicht verteilt, sonst
 * summieren sich Cents falsch auf.
 */
export function verteileFixpreis(
  positionen: readonly Position[],
  // Der Typ sagt jetzt die Wahrheit: paketLogik reicht `paket.fixpreis_netto`
  // durch, und diese Spalte kommt aus der Datenbank — sie kann null sein oder
  // als numeric-String ankommen. Eine Erweiterung, kein Bruch: jeder
  // bisherige Aufrufer uebergibt weiterhin eine number.
  fixpreisNetto: number | string | null | undefined,
): AufteilungsErgebnis {
  const hinweise: string[] = [];

  if (positionen.length === 0) {
    return { positionen: [], restCent: 0, hinweise: ['Keine Positionen zum Aufteilen.'], ok: false };
  }

  // Über lib/zahlen.ts: ein Fixpreis, der als "12.500,00" aus einem Formular
  // oder als numeric-String aus der Datenbank kommt, wurde bisher verworfen.
  const fix = zahl(fixpreisNetto);
  if (fix === null) {
    return {
      positionen: [...positionen], restCent: 0, ok: false,
      hinweise: ['Der Fixpreis ist keine lesbare Zahl. Die Positionen tragen weiterhin ihre vollen Einzelpreise — das ist KEIN Festpreis.'],
    };
  }
  if (fix < 0) {
    return {
      positionen: [...positionen], restCent: 0, ok: false,
      hinweise: ['Der Fixpreis ist negativ. Die Positionen tragen weiterhin ihre vollen Einzelpreise — das ist KEIN Festpreis.'],
    };
  }

  const mengeVon = (p: Position) => zahl(p.menge) ?? 0;
  const preisVon = (p: Position) => zahl(p.einzelpreis_netto) ?? 0;

  const einzelSummen = positionen.map((p) => cent(Math.max(0, mengeVon(p)) * Math.max(0, preisVon(p))));
  const gesamt = cent(einzelSummen.reduce((s, x) => s + x, 0));

  if (gesamt === 0) {
    // Ohne Einzelpreise gibt es kein Verhältnis. Gleichmäßig teilen und sagen.
    hinweise.push('Keine Einzelpreise hinterlegt — der Fixpreis wird gleichmäßig verteilt.');
    const je = cent(fix / positionen.length);
    const neu = positionen.map((p) => {
      const m = mengeVon(p);
      return { ...p, einzelpreis_netto: m !== 0 ? preisGenau(je / m) : 0, rabatt_prozent: 0 };
    });
    return { positionen: neu, restCent: 0, hinweise, ok: true };
  }

  const einzelSummenNeu = einzelSummen.map((s) => cent((s / gesamt) * fix));
  const summeNeu = cent(einzelSummenNeu.reduce((s, x) => s + x, 0));
  const restCent = cent(fix - summeNeu);

  // Rest auf die größte Position. Nicht verteilen — sonst wandert er weiter.
  if (restCent !== 0) {
    let groesster = 0;
    for (let i = 1; i < einzelSummenNeu.length; i++) {
      if (einzelSummenNeu[i] > einzelSummenNeu[groesster]) groesster = i;
    }
    einzelSummenNeu[groesster] = cent(einzelSummenNeu[groesster] + restCent);
    hinweise.push(`Rundungsdifferenz von ${eur(Math.abs(restCent))} auf die größte Position gelegt.`);
  }

  const gemischt = new Set(positionen.map((p) => p.steuersatz_prozent)).size > 1;
  if (gemischt) {
    hinweise.push(
      'Das Paket enthält Positionen mit verschiedenen Steuersätzen. Die Aufteilung erfolgt ' +
      'nach dem Verhältnis der Einzelpreise. Bitte von der Steuerberatung bestätigen lassen.',
    );
  }

  // Einzelpreis mit vier Stellen — sonst entsteht durch die Division ein
  // zweiter Rundungsfehler und die Summe verfehlt den Fixpreis.
  const neu = positionen.map((p, i) => {
    const m = mengeVon(p);
    return {
      ...p,
      menge: m,
      einzelpreis_netto: m !== 0 ? preisGenau(einzelSummenNeu[i] / m) : 0,
      rabatt_prozent: 0, // Der Fixpreis IST der Rabatt.
    };
  });

  // Gegenprobe: Ergibt die Summe der Zeilenbeträge exakt den Fixpreis?
  // Wenn nicht, wandert die Differenz auf den Einzelpreis der größten Zeile.
  const zeilen = neu.map((p) => cent(p.menge * p.einzelpreis_netto));
  const ist = cent(zeilen.reduce((s2, x) => s2 + x, 0));
  const luecke = cent(fix - ist);

  if (luecke !== 0) {
    let groesster = 0;
    for (let i = 1; i < zeilen.length; i++) if (zeilen[i] > zeilen[groesster]) groesster = i;
    const p = neu[groesster];
    if (p.menge !== 0) {
      neu[groesster] = { ...p, einzelpreis_netto: preisGenau(p.einzelpreis_netto + luecke / p.menge) };
    }
  }

  return { positionen: neu, restCent, hinweise, ok: true };
}
