// ============================================================================
// ARGONAUT OS · lib/vertriebsKette.ts — die ganze Kette, vom Beitrag zum Kunden
//
// Der Termin-Wert-Rechner (lib/terminWert.ts) beantwortet die Frage „was DARF
// ein Termin kosten" — rueckwaerts vom Kundenwert. Diese Datei beantwortet die
// andere Haelfte: „was IST tatsaechlich passiert, und was hat es mich an Zeit
// gekostet."
//
// Die Kette, wie sie wirklich laeuft:
//
//   Beitraege + Ansprachen  ──▶ Reaktionen ──▶ Gespraeche ──▶ Eintragungen
//        ──▶ gebuchte Termine ──▶ gehaltene Termine ──▶ Kunden ──▶ Umsatz
//
// ZWEI WAEHRUNGEN. Jede Stufe kostet Geld ODER Zeit, meistens Zeit. Deshalb
// steht neben jeder Stueckzahl eine Minutenzahl. Erst daraus faellt die eine
// Zahl heraus, an der „selbst machen oder abgeben" haengt: der Stundensatz im
// Vertrieb (Umsatz je eingesetzter Stunde).
//
// EHRLICH STATT SCHOENRECHNEN — drei feste Regeln:
//   1. Fehlt die Vorstufe (0), gibt es keine Quote. Null, nicht 0 %.
//   2. Quoten aus winzigen Mengen sind Zufall. Unter BELASTBAR_AB Ereignissen
//      in der Vorstufe wird die Quote zwar gerechnet, aber als „noch nicht
//      belastbar" markiert — die Oberflaeche darf daraus keinen Rat ableiten.
//   3. Es wird nie geschaetzt und nie hochgerechnet, was nicht eingetragen ist.
//
// KEIN Personenbezug: gerechnet wird der Betrieb und die Woche, nie ein
// einzelner Mitarbeiter (§ 87 Abs. 1 Nr. 6 BetrVG).
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks, KEIN Cross-Import —
// pure, node-testbare Funktionen (Muster wie lib/terminWert.ts).
// ============================================================================

/** Ab dieser Menge in der Vorstufe gilt eine Quote als belastbar. */
import { leseZahlOder } from './zahlen';
export const BELASTBAR_AB = 10;

/** Nicht-negative Zahl aus Zahl/String (Komma/Punkt), sonst 0. Null ist gueltig. */
export function zahl(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const n = leseZahlOder(v, 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function runde1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}
function runde2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Eine Wochenzeile, wie sie in public.vertrieb_woche steht. */
export type WochenZeile = {
  woche?: unknown;
  kanal?: unknown;
  beitraege?: unknown;
  ansprachen?: unknown;
  reaktionen?: unknown;
  antworten?: unknown;
  gespraeche?: unknown;
  eintragungen?: unknown;
  termine_gebucht?: unknown;
  termine_gehalten?: unknown;
  kunden?: unknown;
  umsatz?: unknown;
  min_inhalte?: unknown;
  min_ansprache?: unknown;
  min_gespraeche?: unknown;
  min_termine?: unknown;
};

/** Die Zahlen einer Woche, alle sauber als Zahl. */
export type Werte = {
  beitraege: number; ansprachen: number;
  reaktionen: number; antworten: number; gespraeche: number;
  eintragungen: number; termineGebucht: number; termineGehalten: number;
  kunden: number; umsatz: number;
  minInhalte: number; minAnsprache: number; minGespraeche: number; minTermine: number;
};

const LEER: Werte = {
  beitraege: 0, ansprachen: 0, reaktionen: 0, antworten: 0, gespraeche: 0,
  eintragungen: 0, termineGebucht: 0, termineGehalten: 0, kunden: 0, umsatz: 0,
  minInhalte: 0, minAnsprache: 0, minGespraeche: 0, minTermine: 0,
};

/** Eine Rohzeile in saubere Zahlen uebersetzen. */
export function werte(z: WochenZeile | null | undefined): Werte {
  if (!z) return { ...LEER };
  return {
    beitraege: zahl(z.beitraege),
    ansprachen: zahl(z.ansprachen),
    reaktionen: zahl(z.reaktionen),
    antworten: zahl(z.antworten),
    gespraeche: zahl(z.gespraeche),
    eintragungen: zahl(z.eintragungen),
    termineGebucht: zahl(z.termine_gebucht),
    termineGehalten: zahl(z.termine_gehalten),
    kunden: zahl(z.kunden),
    umsatz: zahl(z.umsatz),
    minInhalte: zahl(z.min_inhalte),
    minAnsprache: zahl(z.min_ansprache),
    minGespraeche: zahl(z.min_gespraeche),
    minTermine: zahl(z.min_termine),
  };
}

/** Mehrere Wochen (oder Kanaele) zu einer Summe zusammenziehen. */
export function summiere(zeilen: (WochenZeile | null | undefined)[] | null | undefined): Werte {
  const summe: Werte = { ...LEER };
  for (const z of zeilen ?? []) {
    const w = werte(z);
    (Object.keys(summe) as (keyof Werte)[]).forEach((k) => { summe[k] += w[k]; });
  }
  summe.umsatz = runde2(summe.umsatz);
  return summe;
}

// ---------------------------------------------------------------- die Kette

export type StufenSchluessel =
  | 'hinaus' | 'reaktionen' | 'gespraeche' | 'eintragungen'
  | 'gebucht' | 'gehalten' | 'kunden';

export type Stufe = {
  schluessel: StufenSchluessel;
  label: string;
  /** Wie die Quote zur Vorstufe heisst — in Martins Worten, nicht in Fachsprache. */
  quoteLabel: string;
  anzahl: number;
  /** Menge der Vorstufe; bei der ersten Stufe null. */
  vorher: number | null;
  /** Prozent der Vorstufe, die diese Stufe erreicht haben. Null ohne Vorstufe. */
  quote: number | null;
  /** Unter BELASTBAR_AB Ereignissen in der Vorstufe ist eine Quote Zufall. */
  belastbar: boolean;
  /** Wieviele auf dem Weg zu dieser Stufe verloren gingen. */
  verloren: number | null;
};

function prozent(n: number, vor: number): number | null {
  if (vor <= 0) return null;
  return runde1((n / vor) * 100);
}

/**
 * Die sieben Stufen mit Menge, Quote und Belastbarkeit.
 *
 * „hinaus" fasst Beitraege und aktive Ansprachen zusammen: beides ist Einsatz,
 * der nach draussen geht, und beides kann eine Reaktion ausloesen.
 */
export function kette(w: Werte): Stufe[] {
  const hinaus = w.beitraege + w.ansprachen;

  const roh: { schluessel: StufenSchluessel; label: string; quoteLabel: string; anzahl: number }[] = [
    { schluessel: 'hinaus', label: 'Beiträge & Ansprachen', quoteLabel: '', anzahl: hinaus },
    { schluessel: 'reaktionen', label: 'Reaktionen', quoteLabel: 'Reaktionsquote', anzahl: w.reaktionen },
    { schluessel: 'gespraeche', label: 'Gespräche', quoteLabel: 'Gesprächsquote', anzahl: w.gespraeche },
    { schluessel: 'eintragungen', label: 'Anfragen', quoteLabel: 'Anfragequote', anzahl: w.eintragungen },
    { schluessel: 'gebucht', label: 'Termine gebucht', quoteLabel: 'Buchungsquote', anzahl: w.termineGebucht },
    { schluessel: 'gehalten', label: 'Termine gehalten', quoteLabel: 'Erscheinungsquote', anzahl: w.termineGehalten },
    { schluessel: 'kunden', label: 'Kunden', quoteLabel: 'Abschlussquote', anzahl: w.kunden },
  ];

  return roh.map((s, i) => {
    const vorher = i === 0 ? null : roh[i - 1].anzahl;
    return {
      ...s,
      vorher,
      quote: vorher == null ? null : prozent(s.anzahl, vorher),
      belastbar: vorher != null && vorher >= BELASTBAR_AB,
      verloren: vorher == null ? null : Math.max(0, vorher - s.anzahl),
    };
  });
}

// ------------------------------------------------------------------- Zeit

export type Zeit = {
  minutenGesamt: number;
  stundenGesamt: number;
  minJeGespraech: number | null;
  minJeGehaltenemTermin: number | null;
  /** Der gesamte Zeiteinsatz der Woche, geteilt durch die gewonnenen Kunden. */
  minJeKunde: number | null;
  stundenJeKunde: number | null;
  /** Umsatz je eingesetzter Stunde — die Zahl fuer „selbst machen oder abgeben". */
  stundensatz: number | null;
};

export function zeit(w: Werte): Zeit {
  const minuten = w.minInhalte + w.minAnsprache + w.minGespraeche + w.minTermine;
  const stunden = minuten / 60;
  return {
    minutenGesamt: minuten,
    stundenGesamt: runde1(stunden),
    minJeGespraech: w.gespraeche > 0 && w.minGespraeche > 0 ? runde1(w.minGespraeche / w.gespraeche) : null,
    minJeGehaltenemTermin: w.termineGehalten > 0 && w.minTermine > 0 ? runde1(w.minTermine / w.termineGehalten) : null,
    minJeKunde: w.kunden > 0 && minuten > 0 ? runde1(minuten / w.kunden) : null,
    stundenJeKunde: w.kunden > 0 && minuten > 0 ? runde1(stunden / w.kunden) : null,
    stundensatz: stunden > 0 && w.umsatz > 0 ? runde2(w.umsatz / stunden) : null,
  };
}

/**
 * Lohnt sich die eigene Zeit noch? Vergleicht den Stundensatz im Vertrieb mit
 * dem, was eine Stunde Fremdleistung kostet (Setter, Agentur, eigene
 * Facharbeit). Ohne Vergleichswert bleibt das Urteil offen — es wird nichts
 * unterstellt.
 */
export type ZeitUrteil = 'offen' | 'lohnt' | 'grenzwertig' | 'abgeben';

export function beurteileZeit(stundensatz: number | null, vergleichStundensatz: unknown): { urteil: ZeitUrteil; faktor: number | null } {
  const v = zahl(vergleichStundensatz);
  if (stundensatz == null || stundensatz <= 0 || v <= 0) return { urteil: 'offen', faktor: null };
  const faktor = runde2(stundensatz / v);
  if (faktor >= 2) return { urteil: 'lohnt', faktor };
  if (faktor >= 1) return { urteil: 'grenzwertig', faktor };
  return { urteil: 'abgeben', faktor };
}

// ---------------------------------------------------------------- Hebel

export type Hebel = {
  schluessel: StufenSchluessel;
  label: string;
  quoteLabel: string;
  /** Quote heute in Prozent. */
  quote: number;
  /** Kunden pro Woche, wenn genau diese eine Quote um plusPP Punkte steigt. */
  kundenNeu: number;
  /** Zusaetzliche Kunden gegenueber heute. */
  gewinn: number;
  belastbar: boolean;
};

/**
 * Welche Stufe bringt am meisten, wenn man sie verbessert?
 *
 * Keine Meinung, sondern Rechnung: die Kette ist ein Produkt aus Quoten. Wird
 * eine Quote um plusPP Prozentpunkte angehoben und alle anderen bleiben, wie
 * sie sind, faellt am Ende eine neue Kundenzahl heraus. Die Stufe mit dem
 * groessten Zuwachs steht oben.
 *
 * Stufen ohne belastbare Datenbasis werden mitgerechnet, aber als solche
 * markiert — eine Rangliste aus drei Terminen ist eine Wunschliste.
 */
export function hebelRangliste(w: Werte, plusPP = 5): Hebel[] {
  const k = kette(w);
  const start = k[0].anzahl;
  if (start <= 0) return [];

  const stufen = k.slice(1);
  const quoten = stufen.map((s) => (s.quote == null ? 0 : s.quote));

  // BEWUSST UNGERUNDET rechnen und erst die Ausgabe runden. Wer hier schon
  // auf eine Nachkommastelle rundet, bekommt bei einem Kunden pro Woche lauter
  // Gleichstaende — und dann entscheidet die Reihenfolge im Array statt der
  // Mathematik, welche Stufe oben steht. Genau das hat ein Test gefunden.
  const kundenMit = (qs: number[]): number =>
    qs.reduce((menge, q) => menge * (q / 100), start);

  const heute = kundenMit(quoten);

  // Der ungerundete Wert reist als eigenes Feld mit, damit sortiert werden
  // kann, ohne ihn nach aussen zu geben.
  const liste: (Hebel & { roh: number })[] = stufen.map((s, i) => {
    const veraendert = [...quoten];
    veraendert[i] = Math.min(100, veraendert[i] + Math.max(0, zahl(plusPP)));
    const neu = kundenMit(veraendert);
    return {
      schluessel: s.schluessel,
      label: s.label,
      quoteLabel: s.quoteLabel,
      quote: quoten[i],
      kundenNeu: runde2(neu),
      gewinn: runde2(neu - heute),
      roh: neu - heute,
      belastbar: s.belastbar,
    };
  });

  return liste.sort((a, b) => b.roh - a.roh).map(({ roh: _roh, ...rest }) => rest);
}

// ------------------------------------------------------- Ziel rueckwaerts

export type Bedarf = {
  kunden: number;
  gehalten: number | null;
  gebucht: number | null;
  eintragungen: number | null;
  gespraeche: number | null;
  reaktionen: number | null;
  hinaus: number | null;
  /** Stunden, die dieser Bedarf nach bisherigem Zeitverbrauch kosten wuerde. */
  stunden: number | null;
};

/**
 * Rueckwaerts: wieviel Einsatz braucht es fuer eine Zielzahl an Kunden —
 * gerechnet mit den EIGENEN gemessenen Quoten, nicht mit Richtwerten.
 * Faellt eine Quote aus, bricht die Kette an dieser Stelle ehrlich ab.
 */
export function bedarfFuerKunden(zielKunden: unknown, w: Werte): Bedarf {
  const ziel = zahl(zielKunden);
  const k = kette(w);
  const z = zeit(w);
  const leer: Bedarf = {
    kunden: ziel, gehalten: null, gebucht: null, eintragungen: null,
    gespraeche: null, reaktionen: null, hinaus: null, stunden: null,
  };
  if (ziel <= 0) return leer;

  // Von hinten nach vorn durch die Quoten teilen.
  const reihenfolge: StufenSchluessel[] = ['kunden', 'gehalten', 'gebucht', 'eintragungen', 'gespraeche', 'reaktionen'];
  const ergebnis: Bedarf = { ...leer };
  let menge: number | null = ziel;

  for (const schluessel of reihenfolge) {
    const stufe = k.find((s) => s.schluessel === schluessel);
    if (menge == null || !stufe || stufe.quote == null || stufe.quote <= 0) { menge = null; break; }
    menge = Math.ceil(menge * (100 / stufe.quote));
    const ziel_feld: Record<StufenSchluessel, keyof Bedarf | null> = {
      kunden: 'gehalten', gehalten: 'gebucht', gebucht: 'eintragungen',
      eintragungen: 'gespraeche', gespraeche: 'reaktionen', reaktionen: 'hinaus', hinaus: null,
    };
    const feld = ziel_feld[schluessel];
    if (feld) (ergebnis as Record<string, unknown>)[feld] = menge;
  }

  ergebnis.stunden = z.stundenJeKunde == null ? null : runde1(z.stundenJeKunde * ziel);
  return ergebnis;
}

// ------------------------------------------------------------------ Woche

/**
 * Montag der Woche zu einem ISO-Datum (YYYY-MM-DD). Reine Zeichenrechnung
 * ueber UTC, damit Sommerzeit nichts verschiebt — und „heute" wird immer
 * hereingereicht, nie hier gebildet.
 */
export function montagVon(isoDatum: unknown): string {
  const s = String(isoDatum ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return '';
  const wochentag = d.getUTCDay();            // 0 = Sonntag
  const zurueck = wochentag === 0 ? 6 : wochentag - 1;
  d.setUTCDate(d.getUTCDate() - zurueck);
  return d.toISOString().slice(0, 10);
}

/** „KW 37 · 08.09." — kurze Beschriftung fuer Listen und Achsen. */
export function wochenLabel(isoMontag: unknown): string {
  const s = String(isoMontag ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return '—';
  const erster = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const tage = Math.floor((d.getTime() - erster.getTime()) / 86400000);
  const kw = Math.ceil((tage + erster.getUTCDay() + 1) / 7);
  const tag = String(d.getUTCDate()).padStart(2, '0');
  const monat = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `KW ${kw} · ${tag}.${monat}.`;
}

export const KANAELE: { schluessel: string; label: string }[] = [
  { schluessel: 'social', label: 'Social Media' },
  { schluessel: 'telefon', label: 'Telefon' },
  { schluessel: 'mail', label: 'E-Mail' },
  { schluessel: 'netzwerk', label: 'Netzwerk & Empfehlung' },
  { schluessel: 'gesamt', label: 'Gesamt / ohne Trennung' },
];

export function kanalLabel(v: unknown): string {
  const s = String(v ?? '').trim();
  return KANAELE.find((k) => k.schluessel === s)?.label ?? (s || 'Gesamt');
}

// ------------------------------------------- Brücke zum Akquise-Cockpit

/**
 * Eine Zeile aus public.vertrieb_aktivitaet (Akquise-Cockpit D2).
 * Dort wird JEDER Handgriff einzeln erfasst — Art und Ergebnis, zwei Tipps.
 */
export type AktivitaetZeile = { art?: unknown; ergebnis?: unknown };

export type AusAktivitaeten = {
  /** Jede erfasste Aktivität ist eine Ansprache. */
  ansprachen: number;
  /** Alles außer „niemand erreicht" — irgendjemand hat reagiert. */
  reaktionen: number;
  /** Gesprochen ODER Termin: bei einem Termin wurde immer auch gesprochen. */
  gespraeche: number;
  /** Nur das Ergebnis „Termin". */
  termineGebucht: number;
  /** Wieviele Zeilen gar kein brauchbares Ergebnis trugen. */
  ohneErgebnis: number;
};

/**
 * Rechnet erfasste Einzel-Aktivitäten in Wochenzahlen um — damit niemand am
 * Freitag noch einmal zählt, was er die Woche über schon getippt hat.
 *
 * BEWUSST NUR VIER FELDER. Beiträge, Anfragen, gehaltene Termine, Kunden,
 * Umsatz und alle Zeiten stehen nicht im Akquise-Cockpit und bleiben
 * Handeingabe — sie werden von dieser Funktion nie angefasst.
 *
 * Die Zuordnung ist eine AUSLEGUNG, keine Tatsache: das Cockpit kennt vier
 * Ergebnisse (niemand erreicht · gesprochen · Termin · Absage). „Reaktion"
 * meint hier jede Rückmeldung, auch eine Absage — eine Absage ist ein
 * Ergebnis, kein Nichts. Deshalb schlägt die Oberfläche die Zahlen nur vor;
 * das letzte Wort hat der Mensch.
 *
 * Die Auswahl der Woche passiert VORHER in der Abfrage (Zeitfenster auf
 * erstellt_am). Diese Funktion rechnet nur und kennt kein Datum — so bleibt
 * sie ohne Zeitzonen-Annahme und node-testbar.
 */
export function ausAktivitaeten(zeilen: (AktivitaetZeile | null | undefined)[] | null | undefined): AusAktivitaeten {
  const ergebnis: AusAktivitaeten = {
    ansprachen: 0, reaktionen: 0, gespraeche: 0, termineGebucht: 0, ohneErgebnis: 0,
  };
  for (const z of zeilen ?? []) {
    if (!z) continue;
    ergebnis.ansprachen += 1;
    const e = String(z.ergebnis ?? '').trim();
    if (e === 'termin') { ergebnis.reaktionen += 1; ergebnis.gespraeche += 1; ergebnis.termineGebucht += 1; }
    else if (e === 'gesprochen') { ergebnis.reaktionen += 1; ergebnis.gespraeche += 1; }
    else if (e === 'absage') { ergebnis.reaktionen += 1; }
    else if (e !== 'kein_kontakt') { ergebnis.ohneErgebnis += 1; }
  }
  return ergebnis;
}

/**
 * Zeitfenster einer Woche als ISO-Zeitstempel, für die Abfrage auf
 * erstellt_am. Montag 00:00 bis zum nächsten Montag 00:00, gerechnet in der
 * Zeitzone des AUFRUFENDEN GERÄTS — der Betrieb sitzt dort, wo gearbeitet
 * wird, und dessen Kalenderwoche ist gemeint.
 *
 * Rückgabe [von, bis); leere Strings, wenn das Datum nicht taugt.
 *
 * Heisst bewusst NICHT wochenFenster: so nennt die Kette-Seite ihren eigenen
 * Zustand für die Anzahl betrachteter Wochen. Gleiche Namen haetten sich dort
 * ueberdeckt — der Typcheck hat genau das gefunden.
 */
export function wochenZeitraum(montagIso: unknown): [string, string] {
  const s = String(montagIso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ['', ''];
  const von = new Date(s + 'T00:00:00');
  if (Number.isNaN(von.getTime())) return ['', ''];
  const bis = new Date(von.getTime());
  bis.setDate(bis.getDate() + 7);
  return [von.toISOString(), bis.toISOString()];
}
