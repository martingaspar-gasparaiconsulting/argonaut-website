// lib/abschlagsrechnung.ts
// ============================================================================
// ABSCHLAGS- UND SCHLUSSRECHNUNG (Punkt 54 / R5, 21.09.2026)
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT ▄▄▄
// Gesucht wurde im ganzen Haus nach "abschlag", "teilrechnung",
// "schlussrechnung" und "632a": KEIN EINZIGER TREFFER — nicht auf der
// Rechnungsseite, nicht im Rechnungs-PDF, nicht in lib/zugferd.ts, nicht im
// Validator, nicht in den SQL-Dateien. Die Tabelle `rechnungen` kannte bis
// zu Paket 2 keinen Rechnungstyp.
//
// Fuer jeden Bau- und Handwerksbetrieb ist das kein Nebenthema: bei einem
// Auftrag ueber mehrere Monate ist die Abschlagsrechnung der Normalfall und
// die Einzelrechnung die Ausnahme.
//
// ▄▄▄ DER TEUERSTE FEHLER DES GANZEN PUNKTES — § 14c Abs. 1 UStG ▄▄▄
// Eine Abschlagsrechnung mit Steuerausweis ist eine vollwertige Rechnung.
// Die Steuer entsteht mit der Vereinnahmung (§ 13 Abs. 1 Nr. 1 Buchst. a
// Satz 4 UStG) und wird abgefuehrt. In der Schlussrechnung muessen deshalb
// die vereinnahmten Teilentgelte UND die darauf entfallenden Steuerbetraege
// abgesetzt werden (§ 14 Abs. 5 Satz 2 UStG, Abschn. 14.8 UStAE).
//
// Wer nur die NETTO-Abschlaege absetzt und die volle Steuer stehen laesst,
// weist sie ein zweites Mal aus — und schuldet sie nach § 14c Abs. 1 UStG
// auch ein zweites Mal.
//
// GEMESSEN am Bauauftrag ueber 100.000 EUR netto / 19 %:
//   Gesamtleistung          100.000,00 netto + 19.000,00 Steuer
//   drei Abschlaege          90.000,00 netto + 17.100,00 Steuer
//   richtige Schlussrechnung 10.000,00 netto +  1.900,00 Steuer
//   falsche Schlussrechnung  10.000,00 netto + 19.000,00 Steuer
//   --> 17.100,00 EUR Umsatzsteuer zu viel, ZUSAETZLICH zu den bereits
//       abgefuehrten 17.100,00 EUR aus den Abschlaegen.
// Das faellt erst bei der Betriebspruefung auf, und dann fuer alle
// offenen Jahre zugleich.
//
// ▄▄▄ DER ZWEITE TEURE FEHLER — § 650m Abs. 1 BGB ▄▄▄
// Beim VERBRAUCHERbauvertrag duerfen alle Abschlaege zusammen 90 % der
// vereinbarten Gesamtverguetung einschliesslich Nachtraegen nicht
// uebersteigen. Der Rest wird erst nach Abnahme faellig. Eine Rechnung
// darueber muss der Verbraucher nicht zahlen.
//
// Und in die GEGENRICHTUNG, was staendig uebersehen wird: nach § 650m
// Abs. 2 BGB muss der UNTERNEHMER dem Verbraucher bei der ersten
// Abschlagszahlung eine Sicherheit von 5 % der Gesamtverguetung stellen.
// Das ist nicht der Sicherheitseinbehalt aus lib/sicherheitseinbehalt.ts —
// der laeuft andersherum. Beide koennen nebeneinander stehen.
//
// ▄▄▄ WAS DIESE DATEI BEWUSST NICHT ENTSCHEIDET ▄▄▄
// `vertragsart` ist ein PFLICHTARGUMENT OHNE STANDARDWERT — wie
// `vertragsart` in lib/aufmassVob.ts. Der 90-%-Deckel greift nur beim
// Verbraucher, und "nicht gesetzt" still als "Unternehmer" zu lesen waere
// genau die gefaehrliche Richtung. Ohne Angabe wird gerechnet, aber
// ausdruecklich gemeldet, dass der Deckel ungeprueft blieb.
//
// Ebenso `skontoBasis`: ob sich das Skonto der Schlussrechnung auf die
// GESAMTLEISTUNG oder nur auf den RESTBETRAG bezieht, steht im Vertrag und
// laesst sich nicht erraten. GEMESSEN am Beispiel oben, 2 % Skonto:
//   vom Restbetrag (11.900,00 brutto)      -->    238,00 EUR
//   von der Gesamtleistung (119.000,00)    -->  2.380,00 EUR
//   Unterschied                                 2.142,00 EUR
// Diese Datei rechnet BEIDE und gibt die jeweils andere als
// `skontoAlternative` mit zurueck, damit der Unterschied sichtbar ist.
//
// ▄▄▄ EIN EINZIGER ZAHL-LESER ▄▄▄
// Importiert werden leseZahlOder und centRunden aus lib/zahlen.ts — bewusst
// KEIN eigener Leser (das waere der achtzehnte, siehe Punkt 12). Einbehalt
// und Skonto werden NICHT nachgebaut, sondern aus lib/sicherheitseinbehalt.ts
// und lib/skonto.ts geholt.
//
// RUFT NOCH NIEMAND AUF. Sichtbar wird die Datei erst mit Paket 3.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';
import { rechneEinbehalt, type EinbehaltAngabe } from './sicherheitseinbehalt';
import { rechneSkonto } from './skonto';

// ───────────────────────────────────────────────────────────────────────────
// RECHTSGRUNDLAGEN MIT BELEGSTUFE
// Muster aus lib/aufmassVob.ts und lib/einwilligung.ts: was 'pruefen' traegt,
// gehoert dem Anwalt vorgelegt, bevor es angeschlossen wird.
// ───────────────────────────────────────────────────────────────────────────

export type Belegstufe = 'gesichert' | 'pruefen';

export interface Rechtsgrundlage {
  norm: string;
  inhalt: string;
  stufe: Belegstufe;
}

export const RECHTSGRUNDLAGEN: Rechtsgrundlage[] = [
  {
    norm: '§ 632a Abs. 1 BGB',
    inhalt: 'Abschlagszahlung in Hoehe des Wertes der erbrachten und vertragsgemaessen Leistungen; die Leistungen sind durch eine Aufstellung nachzuweisen.',
    stufe: 'gesichert',
  },
  {
    norm: '§ 650m Abs. 1 BGB',
    inhalt: 'Verbraucherbauvertrag: alle Abschlaege zusammen hoechstens 90 % der vereinbarten Gesamtverguetung einschliesslich Nachtraegen.',
    stufe: 'gesichert',
  },
  {
    norm: '§ 650m Abs. 2 BGB',
    inhalt: 'Der Unternehmer stellt dem Verbraucher bei der ersten Abschlagszahlung eine Sicherheit von 5 % der Gesamtverguetung.',
    stufe: 'gesichert',
  },
  {
    norm: '§ 14 Abs. 5 Satz 2 UStG',
    inhalt: 'In der Endrechnung sind die vereinnahmten Teilentgelte UND die auf sie entfallenden Steuerbetraege abzusetzen.',
    stufe: 'gesichert',
  },
  {
    norm: '§ 14c Abs. 1 UStG',
    inhalt: 'Wer einen hoeheren Steuerbetrag ausweist als er schuldet, schuldet auch den Mehrbetrag.',
    stufe: 'gesichert',
  },
  {
    norm: '§ 13 Abs. 1 Nr. 1 Buchst. a Satz 4 UStG',
    inhalt: 'Bei Anzahlungen entsteht die Steuer mit Ablauf des Voranmeldungszeitraums der Vereinnahmung.',
    stufe: 'gesichert',
  },
  {
    norm: '§ 650m Abs. 1 BGB — Bemessung',
    inhalt: 'Ob der 90-%-Deckel von der Brutto- oder der Nettoverguetung rechnet, sagt das Gesetz nicht ausdruecklich. Diese Datei rechnet gegenueber Verbrauchern vom BRUTTO, weil Verbraucherpreise nach PAngV Endpreise sind. Umstellbar ueber deckelBasis.',
    stufe: 'pruefen',
  },
  {
    norm: 'Skontobezug der Schlussrechnung',
    inhalt: 'Ob sich ein vereinbartes Skonto auf die Gesamtleistung oder nur auf den Restbetrag bezieht, ist Vertragsauslegung. Eingabe ohne Standardwert.',
    stufe: 'pruefen',
  },
];

// ───────────────────────────────────────────────────────────────────────────
// GRUNDBEGRIFFE
// ───────────────────────────────────────────────────────────────────────────

/** Wie in der Spalte rechnungen.vertragsart. 'offen' heisst: nicht geklaert. */
export type Vertragsart = 'offen' | 'verbraucher' | 'unternehmer';

export type DeckelBasis = 'brutto' | 'netto';

/** Anteil der Gesamtverguetung, den Abschlaege beim Verbraucher hoechstens erreichen duerfen. */
export const DECKEL_PROZENT = 90;

/** Sicherheit, die der Unternehmer dem Verbraucher stellt (§ 650m Abs. 2 BGB). */
export const VERBRAUCHER_SICHERHEIT_PROZENT = 5;

/** Steuersatz, wenn keiner mitkommt. Wie in lib/importParser.ts. */
export const STEUERSATZ_STANDARD = 19;

function betrag(v: unknown): number {
  return centRunden(leseZahlOder(v, 0));
}

/** Satz absichern: negativ ergibt keinen Sinn, 100 und mehr ist ein Vertipper. */
function satz(v: unknown): number {
  const n = leseZahlOder(v, 0);
  if (!(n > 0)) return 0;
  return n >= 100 ? 0 : n;
}

/**
 * Steuersatz einer Zeile. 0 ist ein GUELTIGER Satz (13b, § 19, Ausfuhr) und
 * darf nicht still durch 19 ersetzt werden. Deshalb wird nur ein FEHLENDER
 * Wert auf den Standard gesetzt, kein ausdruecklich genullter.
 */
function steuersatzVon(v: unknown): number {
  if (v == null || String(v).trim() === '') return STEUERSATZ_STANDARD;
  const n = leseZahlOder(v, STEUERSATZ_STANDARD);
  if (!(n >= 0) || n >= 100) return STEUERSATZ_STANDARD;
  return n;
}

/** Steuer auf einen Nettobetrag, auf Cent gerundet. */
export function steuerAus(netto: unknown, steuersatz: unknown): number {
  const n = betrag(netto);
  const s = steuersatzVon(steuersatz);
  if (s === 0 || n === 0) return 0;
  return centRunden(n * s / 100);
}

// ───────────────────────────────────────────────────────────────────────────
// TEIL 1 — DER EINZELNE ABSCHLAG (§ 632a BGB)
// ───────────────────────────────────────────────────────────────────────────

export interface AbschlagAngabe {
  /** Wert der erbrachten und vertragsgemaessen Leistung, netto. */
  erbrachtNetto: unknown;
  /** Steuersatz. 0 ist gueltig (13b, § 19). */
  steuersatz?: unknown;
  /** Summe der BEREITS berechneten Abschlaege, netto. */
  bisherNetto?: unknown;
  /** Vereinbarte Gesamtverguetung einschliesslich Nachtraegen, netto. */
  gesamtNetto?: unknown;
  /** PFLICHT, ohne Standardwert — entscheidet ueber den 90-%-Deckel. */
  vertragsart: Vertragsart;
  /** Bemessung des Deckels. Ohne Angabe: brutto (siehe Rechtsgrundlagen). */
  deckelBasis?: DeckelBasis;
  /** Laufende Nummer dieses Abschlags, nur fuer den Text. */
  nr?: unknown;
}

export interface DeckelErgebnis {
  /** Nur beim Verbraucherbauvertrag. */
  gilt: boolean;
  basis: DeckelBasis;
  /** Vereinbarte Gesamtverguetung in der gewaehlten Bemessung. */
  gesamtverguetung: number;
  /** 90 % davon. */
  hoechstbetrag: number;
  /** Was bereits berechnet ist, einschliesslich dieses Abschlags. */
  bereits: number;
  /** Was danach noch moeglich waere. Nie negativ. */
  frei: number;
  ueberschritten: boolean;
  /** Um wie viel der Deckel ueberschritten waere. */
  ueberschuss: number;
  /** Sicherheit, die der UNTERNEHMER dem Verbraucher stellt (§ 650m Abs. 2). */
  sicherheitFuerVerbraucher: number;
}

export type AbschlagHinweis = {
  feld: 'vertragsart' | 'deckel' | 'sicherheit' | 'nachweis' | 'betrag';
  text: string;
};

export interface AbschlagErgebnis {
  nr: number;
  netto: number;
  steuersatz: number;
  steuer: number;
  brutto: number;
  /** Alle Abschlaege einschliesslich dieses, netto. */
  kumuliertNetto: number;
  /** Null, wenn die Vertragsart nicht geklaert oder keine Gesamtsumme da ist. */
  deckel: DeckelErgebnis | null;
  hinweise: AbschlagHinweis[];
}

/**
 * Rechnet einen einzelnen Abschlag und prueft den 90-%-Deckel.
 *
 * Der Betrag wird NICHT von selbst gekappt. Ein gekappter Betrag waere eine
 * stille Aenderung an einer Geldzahl — die Entscheidung gehoert dem Menschen.
 * Gemeldet wird sie dafuer deutlich.
 */
export function rechneAbschlag(angabe: AbschlagAngabe): AbschlagErgebnis {
  const hinweise: AbschlagHinweis[] = [];

  const netto = betrag(angabe?.erbrachtNetto);
  const s = steuersatzVon(angabe?.steuersatz);
  const steuer = steuerAus(netto, s);
  const brutto = centRunden(netto + steuer);
  const bisher = betrag(angabe?.bisherNetto);
  const kumuliertNetto = centRunden(bisher + netto);

  const nrRoh = Math.trunc(leseZahlOder(angabe?.nr, 0));
  const nr = nrRoh > 0 ? nrRoh : 1;

  if (netto <= 0) {
    hinweise.push({
      feld: 'betrag',
      text: 'Ein Abschlag ueber 0,00 EUR oder weniger ergibt keine Forderung. § 632a Abs. 1 BGB knuepft an den Wert der bereits erbrachten Leistung an.',
    });
  }

  hinweise.push({
    feld: 'nachweis',
    text: 'Nach § 632a Abs. 1 Satz 2 BGB ist die erbrachte Leistung durch eine Aufstellung nachzuweisen, die eine rasche und sichere Beurteilung ermoeglicht. Eine Zeile "Abschlagszahlung" ohne Leistungsaufstellung genuegt dem nicht.',
  });

  const art: Vertragsart = angabe?.vertragsart ?? 'offen';
  const basis: DeckelBasis = angabe?.deckelBasis === 'netto' ? 'netto' : 'brutto';
  const gesamtNetto = betrag(angabe?.gesamtNetto);
  const gesamtDa = gesamtNetto > 0;

  let deckel: DeckelErgebnis | null = null;

  if (art === 'offen') {
    hinweise.push({
      feld: 'vertragsart',
      text: 'Die Vertragsart ist nicht festgelegt. Bei einem Verbraucherbauvertrag duerfen alle Abschlaege zusammen 90 % der Gesamtverguetung nicht uebersteigen (§ 650m Abs. 1 BGB). Solange das offen ist, wurde der Deckel NICHT geprueft.',
    });
  } else if (art === 'verbraucher' && !gesamtDa) {
    hinweise.push({
      feld: 'deckel',
      text: 'Verbraucherbauvertrag ohne vereinbarte Gesamtverguetung: der 90-%-Deckel nach § 650m Abs. 1 BGB laesst sich nicht rechnen. Die Gesamtsumme einschliesslich aller Nachtraege gehoert eingetragen.',
    });
  } else if (art === 'verbraucher' && gesamtDa) {
    const gesamtSteuer = steuerAus(gesamtNetto, s);
    const gesamtBemessung = basis === 'netto'
      ? gesamtNetto
      : centRunden(gesamtNetto + gesamtSteuer);

    const bereitsNetto = kumuliertNetto;
    const bereitsBemessung = basis === 'netto'
      ? bereitsNetto
      : centRunden(bereitsNetto + steuerAus(bereitsNetto, s));

    const hoechstbetrag = centRunden(gesamtBemessung * DECKEL_PROZENT / 100);
    const ueberschuss = centRunden(bereitsBemessung - hoechstbetrag);
    const ueberschritten = ueberschuss > 0;

    deckel = {
      gilt: true,
      basis,
      gesamtverguetung: gesamtBemessung,
      hoechstbetrag,
      bereits: bereitsBemessung,
      frei: ueberschritten ? 0 : centRunden(hoechstbetrag - bereitsBemessung),
      ueberschritten,
      ueberschuss: ueberschritten ? ueberschuss : 0,
      sicherheitFuerVerbraucher: centRunden(gesamtBemessung * VERBRAUCHER_SICHERHEIT_PROZENT / 100),
    };

    if (ueberschritten) {
      hinweise.push({
        feld: 'deckel',
        text: 'Der 90-%-Deckel nach § 650m Abs. 1 BGB waere um '
          + euro(ueberschuss)
          + ' ueberschritten. Moeglich waeren noch '
          + euro(Math.max(0, centRunden(hoechstbetrag - (bereitsBemessung - (basis === 'netto' ? netto : brutto)))))
          + '. Der Rest wird erst nach Abnahme faellig.',
      });
    }

    if (nr === 1) {
      hinweise.push({
        feld: 'sicherheit',
        text: 'Erste Abschlagszahlung im Verbraucherbauvertrag: dem Verbraucher ist nach § 650m Abs. 2 BGB eine Sicherheit von '
          + euro(deckel.sicherheitFuerVerbraucher)
          + ' fuer die rechtzeitige und mangelfreie Herstellung zu stellen. Das ist die GEGENRICHTUNG zum Sicherheitseinbehalt und ersetzt ihn nicht.',
      });
    }
  }

  return { nr, netto, steuersatz: s, steuer, brutto, kumuliertNetto, deckel, hinweise };
}

// ───────────────────────────────────────────────────────────────────────────
// TEIL 2 — DIE SCHLUSSRECHNUNG (§ 14 Abs. 5 UStG)
// ───────────────────────────────────────────────────────────────────────────

/** Ein bereits gestellter Abschlag, wie er in rechnung_abschlaege eingefroren wird. */
export interface AbschlagPosten {
  nummer?: string;
  datum?: unknown;
  netto: unknown;
  steuersatz?: unknown;
  /** Wenn angegeben, wird DIESER Wert abgesetzt — nicht neu gerechnet. */
  steuer?: unknown;
  /** Stornierte Abschlaege werden nicht abgesetzt, aber benannt. */
  storniert?: boolean;
}

/** Eine Zeile der Gesamtleistung, je Steuersatz. */
export interface LeistungsZeile {
  netto: unknown;
  steuersatz?: unknown;
}

export type SkontoBasis = 'gesamtleistung' | 'restbetrag';

export interface SchlussrechnungEingabe {
  /** Die volle erbrachte Leistung, je Steuersatz. */
  gesamt: LeistungsZeile[];
  /** Die bereits gestellten Abschlaege. */
  abschlaege: AbschlagPosten[];
  einbehalt?: EinbehaltAngabe;
  skontoProzent?: unknown;
  skontoTage?: unknown;
  /** Ohne Standardwert — siehe Rechtsgrundlagen. */
  skontoBasis?: SkontoBasis;
  /** § 13b UStG: die Rechnung traegt keine Umsatzsteuer. */
  reverseCharge?: boolean;
}

export interface SchlussGruppe {
  steuersatz: number;
  gesamtNetto: number;
  gesamtSteuer: number;
  abgesetztNetto: number;
  abgesetztSteuer: number;
  restNetto: number;
  restSteuer: number;
}

export type SchlussHinweis = {
  feld: 'absetzung' | 'storno' | 'steuersatz' | 'skonto' | 'ueberzahlung' | 'reverse';
  text: string;
};

export interface SchlussrechnungErgebnis {
  gesamtNetto: number;
  gesamtSteuer: number;
  gesamtBrutto: number;
  abgesetztNetto: number;
  abgesetztSteuer: number;
  abgesetztBrutto: number;
  restNetto: number;
  restSteuer: number;
  restBrutto: number;
  /** Je Steuersatz — Pflicht nach § 14 Abs. 4 Nr. 7 und 8 UStG. */
  gruppen: SchlussGruppe[];
  /** Abschlaege, die wegen Storno NICHT abgesetzt wurden. */
  ausgelassen: AbschlagPosten[];
  einbehalt: number;
  skonto: number;
  skontoBasis: SkontoBasis | null;
  /** Der Skontobetrag nach der jeweils ANDEREN Basis. */
  skontoAlternative: number;
  zahlbetrag: number;
  spaeterFaellig: number;
  /** Abschlaege uebersteigen die Gesamtleistung: der Kunde bekommt Geld zurueck. */
  ueberzahlt: boolean;
  hinweise: SchlussHinweis[];
}

/**
 * Baut die Schlussrechnung.
 *
 * DIE EINE REGEL, UM DIE ES HIER GEHT: abgesetzt wird je Steuersatz das
 * NETTO-Teilentgelt UND die darauf entfallende Steuer (§ 14 Abs. 5 Satz 2
 * UStG). Wer nur netto absetzt, weist die Steuer ein zweites Mal aus und
 * schuldet sie nach § 14c Abs. 1 UStG auch ein zweites Mal.
 *
 * Die Steuer eines Abschlags wird NICHT neu gerechnet, wenn sie mitkommt.
 * Abgesetzt gehoert der Betrag, der auf der Abschlagsrechnung wirklich
 * ausgewiesen wurde — auch wenn er dort um einen Cent anders gerundet war.
 * Andernfalls stimmt die Absetzung nicht mit den Belegen ueberein.
 */
export function baueSchlussrechnung(e: SchlussrechnungEingabe): SchlussrechnungErgebnis {
  const hinweise: SchlussHinweis[] = [];
  const reverse = !!e?.reverseCharge;

  const gesamtZeilen = Array.isArray(e?.gesamt) ? e.gesamt : [];
  const abschlaegeRoh = Array.isArray(e?.abschlaege) ? e.abschlaege : [];

  // ── Gesamtleistung je Steuersatz ──
  const karte = new Map<number, SchlussGruppe>();

  function gruppe(s: number): SchlussGruppe {
    const vorhanden = karte.get(s);
    if (vorhanden) return vorhanden;
    const neu: SchlussGruppe = {
      steuersatz: s,
      gesamtNetto: 0, gesamtSteuer: 0,
      abgesetztNetto: 0, abgesetztSteuer: 0,
      restNetto: 0, restSteuer: 0,
    };
    karte.set(s, neu);
    return neu;
  }

  for (const z of gesamtZeilen) {
    const s = reverse ? 0 : steuersatzVon(z?.steuersatz);
    const g = gruppe(s);
    g.gesamtNetto = centRunden(g.gesamtNetto + betrag(z?.netto));
  }
  for (const g of karte.values()) {
    g.gesamtSteuer = steuerAus(g.gesamtNetto, g.steuersatz);
  }

  // ── Abschlaege absetzen ──
  const ausgelassen: AbschlagPosten[] = [];

  for (const a of abschlaegeRoh) {
    if (a?.storniert) {
      ausgelassen.push(a);
      continue;
    }
    const s = reverse ? 0 : steuersatzVon(a?.steuersatz);
    const g = gruppe(s);
    const netto = betrag(a?.netto);
    const steuerDa = a?.steuer != null && String(a.steuer).trim() !== '';
    const steuer = reverse ? 0 : (steuerDa ? betrag(a.steuer) : steuerAus(netto, s));
    g.abgesetztNetto = centRunden(g.abgesetztNetto + netto);
    g.abgesetztSteuer = centRunden(g.abgesetztSteuer + steuer);
  }

  if (ausgelassen.length > 0) {
    hinweise.push({
      feld: 'storno',
      text: ausgelassen.length + ' stornierte Abschlagsrechnung(en) wurden NICHT abgesetzt: '
        + ausgelassen.map((a) => a?.nummer || 'ohne Nummer').join(', ')
        + '. Eine stornierte Rechnung traegt keine abzusetzende Steuer.',
    });
  }

  // ── Rest je Gruppe ──
  for (const g of karte.values()) {
    g.restNetto = centRunden(g.gesamtNetto - g.abgesetztNetto);
    g.restSteuer = centRunden(g.gesamtSteuer - g.abgesetztSteuer);
  }

  const gruppen = [...karte.values()].sort((a, b) => b.steuersatz - a.steuersatz);

  const gesamtNetto = summe(gruppen.map((g) => g.gesamtNetto));
  const gesamtSteuer = summe(gruppen.map((g) => g.gesamtSteuer));
  const abgesetztNetto = summe(gruppen.map((g) => g.abgesetztNetto));
  const abgesetztSteuer = summe(gruppen.map((g) => g.abgesetztSteuer));
  const restNetto = centRunden(gesamtNetto - abgesetztNetto);
  const restSteuer = centRunden(gesamtSteuer - abgesetztSteuer);

  const gesamtBrutto = centRunden(gesamtNetto + gesamtSteuer);
  const abgesetztBrutto = centRunden(abgesetztNetto + abgesetztSteuer);
  const restBrutto = centRunden(restNetto + restSteuer);

  if (abgesetztNetto > 0 || abgesetztSteuer > 0) {
    hinweise.push({
      feld: 'absetzung',
      text: 'Abgesetzt werden ' + euro(abgesetztNetto) + ' Entgelt UND '
        + euro(abgesetztSteuer) + ' Umsatzsteuer (§ 14 Abs. 5 Satz 2 UStG). '
        + 'Ohne die Steuer waere sie ein zweites Mal ausgewiesen und nach '
        + '§ 14c Abs. 1 UStG auch ein zweites Mal geschuldet.',
    });
  }

  const ueberzahlt = restBrutto < 0;
  if (ueberzahlt) {
    hinweise.push({
      feld: 'ueberzahlung',
      text: 'Die Abschlaege uebersteigen die Gesamtleistung um ' + euro(Math.abs(restBrutto))
        + '. Der Betrag ist an den Kunden zurueckzuzahlen; die Schlussrechnung weist einen negativen Restbetrag aus.',
    });
  }

  // ── Steuersaetze, die nur in den Abschlaegen vorkommen ──
  for (const g of gruppen) {
    if (g.gesamtNetto === 0 && g.abgesetztNetto !== 0) {
      hinweise.push({
        feld: 'steuersatz',
        text: 'Zum Steuersatz ' + g.steuersatz + ' % gibt es Abschlaege ueber '
          + euro(g.abgesetztNetto) + ', aber keine Leistung in der Schlussrechnung. '
          + 'Entweder fehlt eine Position, oder der Steuersatz eines Abschlags ist falsch erfasst.',
      });
    }
  }

  if (reverse) {
    const mitSteuer = abschlaegeRoh.filter(
      (a) => !a?.storniert && betrag(a?.steuer) !== 0,
    );
    if (mitSteuer.length > 0) {
      hinweise.push({
        feld: 'reverse',
        text: 'Die Schlussrechnung laeuft nach § 13b UStG ohne Steuerausweis, aber '
          + mitSteuer.length + ' Abschlagsrechnung(en) weisen Umsatzsteuer aus. '
          + 'Einer der beiden Vorgaenge ist falsch eingestuft — die abgefuehrte Steuer '
          + 'aus den Abschlaegen laesst sich sonst nicht mehr zuordnen.',
      });
    }
  }

  // ── Einbehalt und Skonto ──
  // Einbehalt rechnet vom RESTBETRAG dieser Rechnung, denn nur der wird
  // jetzt gezahlt. Der Satz selbst bezieht sich auf die Gesamtleistung —
  // deshalb wird die Bemessung ausdruecklich mitgegeben.
  const eb = rechneEinbehalt(
    restBrutto,
    e?.einbehalt ?? { prozent: 0 },
    restNetto,
  );

  const skontoP = satz(e?.skontoProzent);
  const skontoT = Math.trunc(leseZahlOder(e?.skontoTage, 0));
  const basis: SkontoBasis | null = skontoP > 0
    ? (e?.skontoBasis === 'gesamtleistung' ? 'gesamtleistung' : 'restbetrag')
    : null;

  const skontoRest = rechneSkonto(restBrutto, { prozent: skontoP, tage: skontoT }).abzug;
  const skontoGesamt = rechneSkonto(gesamtBrutto, { prozent: skontoP, tage: skontoT }).abzug;

  const skonto = basis === 'gesamtleistung' ? skontoGesamt : skontoRest;
  const skontoAlternative = basis === 'gesamtleistung' ? skontoRest : skontoGesamt;

  if (skontoP > 0 && skontoT > 0) {
    if (e?.skontoBasis == null) {
      hinweise.push({
        feld: 'skonto',
        text: 'Die Skontobasis ist nicht festgelegt. Gerechnet wurde vom Restbetrag ('
          + euro(skontoRest) + '); von der Gesamtleistung waeren es ' + euro(skontoGesamt)
          + ' — ein Unterschied von ' + euro(Math.abs(centRunden(skontoGesamt - skontoRest)))
          + '. Was gilt, steht im Vertrag.',
      });
    }
    hinweise.push({
      feld: 'skonto',
      text: 'Der Skontoabzug mindert das Entgelt erst, wenn der Kunde ihn tatsaechlich zieht '
        + '(§ 17 Abs. 1 UStG). Die Rechnung weist die volle Umsatzsteuer aus.',
    });
  }

  return {
    gesamtNetto, gesamtSteuer, gesamtBrutto,
    abgesetztNetto, abgesetztSteuer, abgesetztBrutto,
    restNetto, restSteuer, restBrutto,
    gruppen,
    ausgelassen,
    einbehalt: eb.einbehalt,
    skonto,
    skontoBasis: basis,
    skontoAlternative,
    zahlbetrag: centRunden(restBrutto - eb.einbehalt - skonto),
    spaeterFaellig: eb.einbehalt,
    ueberzahlt,
    hinweise,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// TEIL 3 — KLARTEXT UND ANDOCKPUNKTE
// ───────────────────────────────────────────────────────────────────────────

/**
 * Der Absetzungsblock, wie er auf der Schlussrechnung stehen muss.
 *
 * Abschn. 14.8 UStAE laesst mehrere Darstellungen zu. Gewaehlt ist die
 * ausfuehrliche: Gesamtbetrag, darunter die abgesetzten Teilentgelte MIT
 * ihrer Steuer, darunter der Rest. Sie ist die einzige, bei der ein Pruefer
 * die Absetzung ohne Rueckfrage nachvollziehen kann.
 */
export function absetzungsText(e: SchlussrechnungEingabe): string[] {
  const r = baueSchlussrechnung(e);
  const zeilen: string[] = [];

  zeilen.push('Gesamtbetrag der Leistung: ' + euro(r.gesamtNetto) + ' netto');
  for (const g of r.gruppen) {
    if (g.gesamtNetto === 0 && g.gesamtSteuer === 0) continue;
    zeilen.push('  zzgl. ' + g.steuersatz + ' % USt auf ' + euro(g.gesamtNetto)
      + ': ' + euro(g.gesamtSteuer));
  }
  zeilen.push('Gesamtbetrag brutto: ' + euro(r.gesamtBrutto));
  zeilen.push('');
  zeilen.push('abzueglich bereits berechneter Abschlagszahlungen:');
  for (const g of r.gruppen) {
    if (g.abgesetztNetto === 0 && g.abgesetztSteuer === 0) continue;
    zeilen.push('  Entgelt ' + euro(g.abgesetztNetto)
      + ' zzgl. ' + g.steuersatz + ' % USt ' + euro(g.abgesetztSteuer));
  }
  zeilen.push('  Summe: ' + euro(r.abgesetztBrutto));
  zeilen.push('');
  zeilen.push('Verbleibender Betrag: ' + euro(r.restNetto) + ' netto'
    + ' zzgl. ' + euro(r.restSteuer) + ' USt = ' + euro(r.restBrutto));

  if (r.einbehalt > 0) {
    zeilen.push('abzueglich Sicherheitseinbehalt: ' + euro(r.einbehalt));
  }
  if (r.skonto > 0) {
    zeilen.push('bei Zahlung innerhalb der Skontofrist abzueglich ' + euro(r.skonto));
  }
  zeilen.push('Zahlbetrag: ' + euro(r.zahlbetrag));

  return zeilen;
}

/**
 * ANDOCKPUNKT — Klartext fuer die Rechnungsseite und spaeter fuer das
 * Auge. Gebuendelt mit den elf uebrigen offenen Andockpunkten.
 */
export function abschlagHinweise(e: SchlussrechnungEingabe): string[] {
  return baueSchlussrechnung(e).hinweise.map((h) => h.text);
}

/**
 * Prueft eine Auswahl von Abschlaegen, BEVOR die Schlussrechnung entsteht.
 *
 * Der teure Fall ist der VERGESSENE Abschlag: er fehlt in der Absetzung,
 * die Steuer wird doppelt geschuldet, und auf der Rechnung sieht alles
 * stimmig aus. Deshalb wird hier gegen die Liste ALLER Abschlaege des
 * Auftrags geprueft, nicht nur gegen die ausgewaehlten.
 */
export function pruefeAuswahl(
  alle: AbschlagPosten[],
  ausgewaehlt: AbschlagPosten[],
): SchlussHinweis[] {
  const hinweise: SchlussHinweis[] = [];
  const alleListe = Array.isArray(alle) ? alle : [];
  const gewaehlt = Array.isArray(ausgewaehlt) ? ausgewaehlt : [];

  const gewaehltNummern = new Set(
    gewaehlt.map((a) => String(a?.nummer ?? '')).filter((s) => s !== ''),
  );

  const fehlend = alleListe.filter(
    (a) => !a?.storniert
      && String(a?.nummer ?? '') !== ''
      && !gewaehltNummern.has(String(a.nummer)),
  );

  if (fehlend.length > 0) {
    hinweise.push({
      feld: 'absetzung',
      text: 'NICHT abgesetzt, obwohl zum Auftrag gehoerend: '
        + fehlend.map((a) => a.nummer).join(', ')
        + '. Fehlt ein Abschlag in der Absetzung, wird seine Umsatzsteuer ein '
        + 'zweites Mal geschuldet (§ 14c Abs. 1 UStG). Das faellt auf der '
        + 'Rechnung selbst nicht auf.',
    });
  }

  const stornierteGewaehlt = gewaehlt.filter((a) => a?.storniert);
  if (stornierteGewaehlt.length > 0) {
    hinweise.push({
      feld: 'storno',
      text: 'Stornierte Abschlaege sind ausgewaehlt: '
        + stornierteGewaehlt.map((a) => a?.nummer || 'ohne Nummer').join(', ')
        + '. Sie werden nicht abgesetzt.',
    });
  }

  return hinweise;
}

// ───────────────────────────────────────────────────────────────────────────
// KLEINE HELFER
// ───────────────────────────────────────────────────────────────────────────

function summe(werte: number[]): number {
  let s = 0;
  for (const w of werte) s = centRunden(s + w);
  return s;
}

/** Nur fuer Hinweistexte — die Anzeige-Formatierung bleibt bei den Seiten. */
function euro(n: number): string {
  const wert = centRunden(n);
  const minus = wert < 0;
  const ganz = Math.floor(Math.abs(wert));
  const cent = Math.round((Math.abs(wert) - ganz) * 100);
  const tausend = String(ganz).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (minus ? '-' : '') + tausend + ',' + String(cent).padStart(2, '0') + ' EUR';
}
