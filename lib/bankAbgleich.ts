// lib/bankAbgleich.ts
// ============================================================================
// Banking-Abgleich: Kontoumsaetze (CSV) gegen offene Rechnungen matchen.
// Funktioniert OHNE externen Partner — der finAPI-Auto-Abruf kommt
// anschlussfertig obendrauf. Reine Formeln/Parser, KEINE Supabase-/React-
// Abhaengigkeit. Node-getestet.
//
// ▄▄▄ REPARATUR PUNKT 18 (18.09.2026) ▄▄▄
// Alle vier Befunde wurden vor der Reparatur am echten Code nachgemessen.
//
// 1. TEILZAHLUNG WURDE ZUR VOLLZAHLUNG.
//    Der zweite Zweig der Nummern-Suche prueft den BETRAG NICHT. Ein Abschlag
//    ueber 100 Euro mit "RE-2026-0001" im Verwendungszweck galt als SICHER
//    zugeordnet zu einer Rechnung ueber 1.926 Euro. Die Seite setzt daraufhin
//    zahlungsstatus='bezahlt' mit bezahlter_betrag=100 — 1.826 Euro waren weg,
//    gemahnt wurde nie. Der Zustand 'teilbezahlt' ist im Haus vorgesehen
//    (die Seite laedt ihn sogar mit), es fuehrte nur kein Weg dorthin.
//
// 2. SAMMELZAHLUNG TRAF NUR DIE ERSTE RECHNUNG.
//    Eine Ueberweisung ueber 2.426 Euro mit BEIDEN Rechnungsnummern im
//    Verwendungszweck wurde der ersten Rechnung zugeordnet — sicher, mit dem
//    vollen Betrag. Die zweite blieb offen, die erste bekam 2.426 statt 1.926.
//
// 3. DIE SPALTENSUCHE LIEF UEBER DIE SPALTEN STATT UEBER DIE SUCHWOERTER.
//    findeSpalte nahm die ERSTE Spalte, die irgendein Suchwort enthielt.
//    Gemessen: bei einer Kopfzeile mit "Wertstellung" vor "Betrag (EUR)" traf
//    das Suchwort 'wert' auf die DATUMSSPALTE — der Umsatz kam mit 0,00 Euro
//    herein. Bei einer Kopfzeile mit "Lastschrift Ursprungsbetrag" vor "Betrag"
//    traf 'betrag' auf die leere Spalte — die GANZE Datei ergab NULL Zeilen,
//    ohne jede Meldung. Ausserdem gewann "Buchungstext" ('text') gegen
//    "Verwendungszweck", weshalb die Rechnungsnummer gar nicht erst ankam.
//    Jetzt entscheidet der RANG des Treffers, nicht die Spaltenposition, und
//    es gibt Ausschlusswoerter.
//
// 4. DER EIGENE BETRAGSLESER (Bauart C aus Punkt 12).
//    Punkte wurden nur entfernt, wenn auch ein Komma da war. Gemessen:
//    "1.234" wurde 1,23 Euro — "1.234.567" und "1.000" wurden 0 bzw. 1.
//    Jetzt liest lib/zahlen.ts, der eine Zahlen-Leser des Hauses.
//
// GRUNDSATZ, wie in Punkt 15 und 17: lieber nichts zuordnen als falsch buchen.
// Was nicht eindeutig ist, bekommt rechnungId=null und einen Klartext-Grund —
// damit kann die Seite keinen falschen "als bezahlt"-Knopf anbieten.
// ============================================================================

import { leseZahl, centRunden } from './zahlen';

export interface Transaktion { datum: string; betrag: number; verwendungszweck: string; name: string; }
export interface OffeneRechnung { id: string; nummer: string; brutto: number; }

/** Wie eine Zahlung zu den offenen Rechnungen steht. */
export type MatchArt = 'voll' | 'teil' | 'ueber' | 'sammel' | 'keiner';

export interface MatchZeile {
  transaktion: Transaktion;
  rechnungId: string | null;
  rechnungNummer: string | null;
  sicher: boolean;      // Rechnungsnummer stand im Verwendungszweck UND der Betrag passt
  grund: string;
  // --- ab Punkt 18, additiv ---
  art: MatchArt;
  /** Bruttosumme der gemeinten Rechnung, sofern eine erkannt wurde. */
  rechnungBrutto: number | null;
  /** Zahlung minus Rechnungsbetrag, auf Cent gerundet. 0 bei Vollzahlung. */
  differenz: number;
  /** ALLE im Verwendungszweck genannten offenen Rechnungen (Sammelzahlung). */
  genannte: OffeneRechnung[];
}

/**
 * Deutschen Betrag parsen: „1.234,56" / „1234,56" / „-50,00" -> Number.
 * Liest ueber lib/zahlen.ts. Nicht lesbar ergibt 0 — diese Funktion hat seit
 * jeher die Zusage „nie NaN", und ein NaN in einer Geldspalte laesst jeden
 * spaeteren Vergleich still fehlschlagen. Wer den Unterschied zwischen
 * „null Euro" und „nicht lesbar" braucht, nimmt betragOderNull().
 */
export function parseBetrag(s: unknown): number {
  const n = betragOderNull(s);
  return n === null ? 0 : n;
}

/**
 * Wie parseBetrag, sagt aber ehrlich null, wenn die Zelle kein Betrag ist.
 * Gebraucht beim CSV-Import: eine unlesbare Geldzelle darf nicht als 0,00 Euro
 * in den Abgleich laufen.
 *
 * Ein abschliessendes Trennzeichen ohne Nachkommastellen („1926," im MT940 nach
 * SWIFT-Norm, „1926." in englischen Dateien) ist eine geschriebene Schreibweise
 * und kein Ratefall — es wird vorher entfernt.
 */
export function betragOderNull(s: unknown): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const roh = String(s ?? '').trim();
  if (roh === '') return null;
  return leseZahl(roh.replace(/[.,]$/, ''));
}

function splitZeile(zeile: string, delim: string): string[] {
  // einfacher CSV-Split mit Anführungszeichen-Schutz
  const out: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') { if (inQ && zeile[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === delim && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim().replace(/^"|"$/g, ''));
}

// ────────────────────────────────────────────────────────────────────────────
// Spaltensuche nach RANG (Reparatur Befund 3)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Suchregel fuer eine Zielspalte.
 *  genau     — der Spaltenname ist genau dieses Wort (bester Rang)
 *  beginnt   — der Spaltenname faengt mit dem Wort an ("Betrag (EUR)")
 *  enthaelt  — das Wort steckt irgendwo drin (schwaechster Rang)
 *  nie       — enthaelt der Spaltenname eines dieser Woerter, scheidet sie aus
 */
export interface SpaltenRegel { genau: string[]; beginnt: string[]; enthaelt: string[]; nie: string[]; }

const REGEL_BETRAG: SpaltenRegel = {
  genau: ['betrag', 'umsatz', 'wert', 'summe', 'buchungsbetrag', 'umsatzbetrag'],
  beginnt: ['betrag', 'umsatz', 'buchungsbetrag'],
  enthaelt: ['betrag', 'umsatz'],
  // „Wertstellung" ist ein DATUM. „Ursprungsbetrag" ist der Betrag VOR einer
  // Ruecklastschrift und meist leer. Beide haben genau diese Datei geleert.
  nie: ['wertstellung', 'wertstellungstag', 'ursprungsbetrag', 'auslagenersatz',
        'waehrung', 'währung', 'gebuehr', 'gebühr', 'saldo', 'kurs', 'datum',
        'tag', 'anzahl', 'stueck', 'stück', 'iban', 'konto', 'blz', 'bic'],
};

const REGEL_DATUM: SpaltenRegel = {
  genau: ['buchungstag', 'buchungsdatum', 'datum'],
  beginnt: ['buchungstag', 'buchungsdatum', 'datum', 'valuta', 'wertstellung'],
  enthaelt: ['buchungstag', 'datum', 'valuta', 'wertstellung'],
  nie: ['betrag', 'waehrung', 'währung'],
};

const REGEL_ZWECK: SpaltenRegel = {
  // „Verwendungszweck" muss „Buchungstext" schlagen — dort steht nur
  // „GUTSCHRIFT"/„UEBERWEISUNG", die Rechnungsnummer steht im Zweck.
  genau: ['verwendungszweck', 'vwz'],
  beginnt: ['verwendungszweck', 'verwendung'],
  enthaelt: ['verwendungszweck', 'verwendung', 'zweck', 'buchungstext', 'text'],
  nie: ['betrag', 'datum', 'waehrung', 'währung'],
};

const REGEL_NAME: SpaltenRegel = {
  genau: ['name', 'auftraggeber', 'beguenstigter', 'begünstigter',
          'zahlungspflichtiger', 'empfaenger', 'empfänger', 'kontoinhaber'],
  beginnt: ['beguenstigter', 'begünstigter', 'auftraggeber', 'empfaenger',
            'empfänger', 'zahlungspflichtiger', 'name'],
  enthaelt: ['beguenstigter', 'begünstigter', 'auftraggeber', 'empfaenger',
             'empfänger', 'zahlungspflichtiger', 'name'],
  nie: ['betrag', 'datum', 'bankname', 'kontonummer'],
};

/**
 * Soll/Haben-Kennzeichen. Viele deutsche Exporte fuehren den Betrag POSITIV
 * und das Vorzeichen in einer eigenen Spalte. Ohne diese Spalte waere eine
 * Lastschrift ein Zahlungseingang — genau der Fehler, den die Ruecklastschrift
 * am 16.09. in CAMT verursacht hat.
 */
const REGEL_SH: SpaltenRegel = {
  genau: ['soll/haben', 'soll-haben', 'sollhaben', 's/h', 'haben/soll', 'sh'],
  beginnt: ['soll/haben', 'soll-haben'],
  enthaelt: ['soll/haben', 'soll-haben', 'sollhaben'],
  nie: [],
};

function rangFuer(spalte: string, regel: SpaltenRegel): number {
  const h = spalte.toLowerCase().trim();
  if (h === '') return 0;
  if (regel.nie.some((w) => h.includes(w))) return 0;
  if (regel.genau.includes(h)) return 3;
  if (regel.beginnt.some((w) => h.startsWith(w))) return 2;
  if (regel.enthaelt.some((w) => h.includes(w))) return 1;
  return 0;
}

/**
 * Beste Spalte nach Rang. Bei Gleichstand gewinnt die weiter links —
 * aber erst dann, nicht schon beim ersten irgendwie passenden Treffer.
 */
export function findeSpalte(header: string[], regel: SpaltenRegel): number {
  let besterRang = 0;
  let treffer = -1;
  for (let i = 0; i < header.length; i++) {
    const r = rangFuer(String(header[i] ?? ''), regel);
    if (r > besterRang) { besterRang = r; treffer = i; }
  }
  return treffer;
}

/** Erkannte Spaltenzuordnung einer Bank-CSV — fuer Tests und Hinweise. */
export interface CsvSpalten { datum: number; betrag: number; zweck: number; name: number; sh: number; delim: string; header: string[]; }

export function erkenneSpalten(kopfzeile: string): CsvSpalten {
  const delim = (kopfzeile.match(/;/g)?.length ?? 0) >= (kopfzeile.match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = splitZeile(kopfzeile, delim);
  return {
    delim,
    header,
    datum: findeSpalte(header, REGEL_DATUM),
    betrag: findeSpalte(header, REGEL_BETRAG),
    zweck: findeSpalte(header, REGEL_ZWECK),
    name: findeSpalte(header, REGEL_NAME),
    sh: findeSpalte(header, REGEL_SH),
  };
}

/** 'S' (Soll) und 'D' (Debit) sind Abgang, 'H'/'C' Eingang. Sonst unbekannt. */
function shRichtung(wert: string): -1 | 1 | 0 {
  const w = String(wert ?? '').trim().toUpperCase();
  if (w === 'S' || w === 'D' || w === 'SOLL' || w === 'DEBIT') return -1;
  if (w === 'H' || w === 'C' || w === 'HABEN' || w === 'CREDIT') return 1;
  return 0;
}

/** Bank-CSV (flexibel) -> Transaktionen. Erkennt Trennzeichen + Spalten per Kopfzeile. */
export function parseUmsaetzeCsv(text: string): Transaktion[] {
  return leseUmsaetzeCsv(text).transaktionen;
}

export interface CsvErgebnis {
  transaktionen: Transaktion[];
  spalten: CsvSpalten | null;
  /** Datenzeilen, deren Geldzelle sich nicht lesen liess. */
  unlesbar: number;
  /** Klartext-Hinweise fuer die Anzeige. */
  hinweise: string[];
}

/**
 * Wie parseUmsaetzeCsv, sagt aber zusaetzlich, WAS erkannt wurde und was nicht.
 * Eine unlesbare Geldzelle wird NICHT als 0,00 Euro durchgereicht, sondern
 * gezaehlt und gemeldet.
 */
export function leseUmsaetzeCsv(text: string): CsvErgebnis {
  const zeilen = String(text || '').split(/\r?\n/).filter((z) => z.trim() !== '');
  if (zeilen.length < 2) {
    return { transaktionen: [], spalten: null, unlesbar: 0, hinweise: zeilen.length === 1 ? ['Die Datei enthaelt nur eine Kopfzeile und keine Umsaetze.'] : [] };
  }

  const sp = erkenneSpalten(zeilen[0]);
  const hinweise: string[] = [];
  if (sp.betrag < 0) hinweise.push('Keine Betragsspalte erkannt. Bitte den Export mit Kopfzeile und einer Spalte "Betrag" erzeugen.');
  if (sp.zweck < 0) hinweise.push('Keine Spalte "Verwendungszweck" erkannt — ohne sie kann die Rechnungsnummer nicht gelesen werden.');
  if (sp.datum < 0) hinweise.push('Keine Datumsspalte erkannt.');

  const out: Transaktion[] = [];
  let unlesbar = 0;

  for (let r = 1; r < zeilen.length; r++) {
    const z = splitZeile(zeilen[r], sp.delim);
    const zelle = sp.betrag >= 0 ? z[sp.betrag] : '';
    if (String(zelle ?? '').trim() === '') continue;      // leere Geldzelle: keine Buchung

    const gelesen = betragOderNull(zelle);
    if (gelesen === null) { unlesbar++; continue; }        // NICHT still als 0 durchreichen

    let betrag = gelesen;
    if (sp.sh >= 0) {
      const richtung = shRichtung(z[sp.sh] ?? '');
      if (richtung !== 0) betrag = richtung * Math.abs(betrag);
    }
    if (betrag === 0) continue;

    out.push({
      datum: (sp.datum >= 0 ? z[sp.datum] : '') || '',
      betrag,
      verwendungszweck: (sp.zweck >= 0 ? z[sp.zweck] : '') || '',
      name: (sp.name >= 0 ? z[sp.name] : '') || '',
    });
  }

  if (unlesbar > 0) {
    hinweise.push(`${unlesbar} Zeile${unlesbar === 1 ? '' : 'n'} ohne lesbaren Betrag uebersprungen (Spalte "${sp.betrag >= 0 ? sp.header[sp.betrag] : '—'}"). Sie wurden bewusst NICHT als 0,00 Euro uebernommen.`);
  }
  return { transaktionen: out, spalten: sp, unlesbar, hinweise };
}

export function normNummer(s: unknown): string {
  return String(s ?? '').toUpperCase().replace(/[\s._/-]/g, '');
}

/** Euro-Text fuer Klartext-Gruende. Bewusst hier, damit die Datei allein testbar bleibt. */
function eur(n: number): string {
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
}

/**
 * Welche offenen Rechnungen werden im Verwendungszweck GENANNT?
 * Nummern unter vier Zeichen bleiben aussen vor — eine "5" traefe ueberall.
 * Ist eine Nummer echte Teilzeichenkette einer anderen gefundenen Nummer,
 * gilt nur die laengere (sonst traefe RE-2026-0001 auch in RE-2026-00011).
 */
export function genannteRechnungen(zweck: string, offene: OffeneRechnung[]): OffeneRechnung[] {
  const zweckNorm = normNummer(zweck);
  const roh = (offene || []).filter((r) => {
    const n = normNummer(r.nummer);
    return n.length >= 4 && zweckNorm.includes(n);
  });
  return roh.filter((r) => {
    const n = normNummer(r.nummer);
    return !roh.some((andere) => {
      const a = normNummer(andere.nummer);
      return a.length > n.length && a.includes(n);
    });
  });
}

/** Match EINER Eingangs-Transaktion gegen offene Rechnungen. */
export function matchTransaktion(t: Transaktion, offene: OffeneRechnung[]): MatchZeile {
  const leer: MatchZeile = {
    transaktion: t, rechnungId: null, rechnungNummer: null, sicher: false,
    grund: 'Kein Treffer', art: 'keiner', rechnungBrutto: null, differenz: 0, genannte: [],
  };
  if (t.betrag <= 0) return { ...leer, grund: 'Kein Zahlungseingang' };

  const genannte = genannteRechnungen(t.verwendungszweck, offene);

  // 1) MEHRERE Rechnungsnummern im Verwendungszweck -> Sammelzahlung.
  //    Frueher gewann still die erste und bekam den GANZEN Betrag. Jetzt wird
  //    nichts zugeordnet: welche Rechnung wie viel bekommt, weiss nur der
  //    Betrieb. Die Nummern stehen in `genannte` fuer die Anzeige bereit.
  if (genannte.length > 1) {
    const summe = centRunden(genannte.reduce((s, r) => s + (Number(r.brutto) || 0), 0));
    const nummern = genannte.map((r) => r.nummer).join(', ');
    const passt = Math.abs(summe - t.betrag) < 0.01;
    return {
      ...leer,
      art: 'sammel',
      genannte,
      differenz: centRunden(t.betrag - summe),
      grund: passt
        ? `Sammelzahlung ueber ${genannte.length} Rechnungen (${nummern}) — die Summe ${eur(summe)} stimmt. Bitte einzeln zuordnen.`
        : `Sammelzahlung ueber ${genannte.length} Rechnungen (${nummern}) — Summe ${eur(summe)}, gezahlt ${eur(t.betrag)}. Bitte manuell zuordnen.`,
    };
  }

  // 2) GENAU EINE Rechnungsnummer im Verwendungszweck. Jetzt entscheidet der
  //    Betrag mit — frueher nicht, deshalb wurde ein Abschlag zur Vollzahlung.
  if (genannte.length === 1) {
    const r = genannte[0];
    const brutto = Number(r.brutto) || 0;
    const diff = centRunden(t.betrag - brutto);

    if (Math.abs(diff) < 0.01) {
      return {
        transaktion: t, rechnungId: r.id, rechnungNummer: r.nummer, sicher: true,
        grund: 'Rechnungsnummer im Verwendungszweck', art: 'voll',
        rechnungBrutto: brutto, differenz: 0, genannte,
      };
    }
    if (diff < 0) {
      return {
        ...leer, rechnungNummer: r.nummer, art: 'teil', rechnungBrutto: brutto,
        differenz: diff, genannte,
        grund: `Teilzahlung auf ${r.nummer}: ${eur(t.betrag)} von ${eur(brutto)} — ${eur(brutto - t.betrag)} bleiben offen. Nicht als bezahlt buchen.`,
      };
    }
    return {
      ...leer, rechnungNummer: r.nummer, art: 'ueber', rechnungBrutto: brutto,
      differenz: diff, genannte,
      grund: `Zahlung ueber ${eur(t.betrag)} ist ${eur(diff)} mehr als Rechnung ${r.nummer} (${eur(brutto)}). Bitte pruefen.`,
    };
  }

  // 3) Keine Nummer genannt: nur der Betrag kann noch helfen.
  const betragTreffer = (offene || []).filter((r) => Math.abs((Number(r.brutto) || 0) - t.betrag) < 0.01);
  if (betragTreffer.length === 1) {
    return {
      transaktion: t, rechnungId: betragTreffer[0].id, rechnungNummer: betragTreffer[0].nummer,
      sicher: false, grund: 'Betrag passt eindeutig', art: 'voll',
      rechnungBrutto: Number(betragTreffer[0].brutto) || 0, differenz: 0, genannte: [],
    };
  }
  if (betragTreffer.length > 1) {
    return { ...leer, grund: `${betragTreffer.length} Rechnungen mit gleichem Betrag — bitte manuell zuordnen` };
  }
  return leer;
}

export function matchAlle(transaktionen: Transaktion[], offene: OffeneRechnung[]): MatchZeile[] {
  return (transaktionen || []).filter((t) => t.betrag > 0).map((t) => matchTransaktion(t, offene));
}

export function zaehleMatches(zeilen: MatchZeile[]): { sicher: number; wahrscheinlich: number; offen: number; teil: number; sammel: number } {
  return {
    sicher: zeilen.filter((z) => z.rechnungId && z.sicher).length,
    wahrscheinlich: zeilen.filter((z) => z.rechnungId && !z.sicher).length,
    offen: zeilen.filter((z) => !z.rechnungId).length,
    teil: zeilen.filter((z) => z.art === 'teil').length,
    sammel: zeilen.filter((z) => z.art === 'sammel').length,
  };
}

/**
 * Klartext vor dem Buchen — was an diesem Abgleich Aufmerksamkeit braucht.
 * Aendert nichts, ordnet nichts zu. Noch nicht auf der Seite angezeigt
 * (Andockpunkt, gebuendelt mit staffelUnstimmigkeiten/extfHinweise/ustvaHinweise).
 */
export function bankHinweise(zeilen: MatchZeile[], csv?: CsvErgebnis | null): string[] {
  const h: string[] = [...(csv?.hinweise ?? [])];

  const teil = zeilen.filter((z) => z.art === 'teil');
  if (teil.length > 0) {
    h.push(`${teil.length} Teilzahlung${teil.length === 1 ? '' : 'en'} erkannt. Diese Rechnungen sind NICHT bezahlt — offen bleiben zusammen ${eur(teil.reduce((s, z) => s - z.differenz, 0))}.`);
  }
  const sammel = zeilen.filter((z) => z.art === 'sammel');
  if (sammel.length > 0) {
    h.push(`${sammel.length} Sammelzahlung${sammel.length === 1 ? '' : 'en'} ueber mehrere Rechnungsnummern — diese muessen einzeln zugeordnet werden.`);
  }
  const ueber = zeilen.filter((z) => z.art === 'ueber');
  if (ueber.length > 0) {
    h.push(`${ueber.length} Zahlung${ueber.length === 1 ? '' : 'en'} ueber dem Rechnungsbetrag. Ueberzahlung oder falsche Rechnungsnummer.`);
  }
  const wahrscheinlich = zeilen.filter((z) => z.rechnungId && !z.sicher);
  if (wahrscheinlich.length > 0) {
    h.push(`${wahrscheinlich.length} Zuordnung${wahrscheinlich.length === 1 ? '' : 'en'} nur ueber den Betrag, ohne Rechnungsnummer im Verwendungszweck — bitte vor dem Buchen ansehen.`);
  }
  return h;
}
