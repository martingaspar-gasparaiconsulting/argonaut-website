// lib/gutscheine.ts
// B-III · Verkaufsförderung — Gutscheine & Pakete. Reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Drei Gutschein-Arten in EINEM Modul (art):
//   · wert          — Wertgutschein: Guthaben in €, teil-einlösbar, Restwert bleibt.
//   · mehrfachkarte — 10er-Karte / Leistungspaket: N Nutzungen, je Besuch -1.
//   · leistung      — Leistungsgutschein: eine konkrete Leistung, ganz einlösbar.
//
// Recht (verifiziert 07/2026):
//   · Verjährung §195/§199 BGB = 3 Jahre, Beginn Schluss des Ausstellungsjahres.
//     Ein Gutschein von 2026 ist also bis 31.12.2029 gültig. AGB-Verkürzung (z. B.
//     "1 Jahr") ist grundsätzlich unwirksam (BGH XI ZR 56/07). Restwert bleibt.
//   · USt §3 Abs. 13–15 UStG: Einzweckgutschein -> Steuer bei AUSGABE; Mehrzweck-
//     gutschein -> Steuer erst bei EINLÖSUNG.
// Node-getestet (gutscheine.test.ts).

// ▄▄▄ PUNKT 30 (20.09.2026) — an lib/zahlen.ts angeschlossen ▄▄▄
// Die eigenen Zahl-Leser (Number(x) || 0) und die eigene Cent-Rundung sind
// weg. Zwei Fehler steckten darin:
//   1. Ein Betrag als "1.234,56" wurde zu 0, "12.500" zu 12,5 — Supabase
//      liefert numeric-Spalten haeufig als Text.
//   2. Ein negativer Wert rundete anders als derselbe Betrag positiv:
//      -2,675 wurde -2,67, +2,675 aber 2,68.
// Wichtiger als beides: es wird jetzt ZUERST GELESEN und DANN GERECHNET.
// Runden allein half nicht — bei a - b macht JavaScript aus "10.000"
// schon vor dem Runden die Zahl 10.
// Die ANZEIGE aendert sich dadurch nicht — nur die Zahlen stimmen.
import { leseZahlOder, centRunden } from './zahlen';

export type GutscheinArt = 'wert' | 'mehrfachkarte' | 'leistung';
export type MwStTyp = 'einzweck' | 'mehrzweck';

export interface GutscheinArtInfo {
  key: GutscheinArt;
  label: string;
  icon: string;
  hatBetrag: boolean;      // Guthaben in € (wert/leistung/karte-Preis)
  hatNutzungen: boolean;   // N Nutzungen (mehrfachkarte)
}

export const GUTSCHEIN_ARTEN: GutscheinArtInfo[] = [
  { key: 'wert',          label: 'Wertgutschein',      icon: '💶', hatBetrag: true,  hatNutzungen: false },
  { key: 'mehrfachkarte', label: 'Mehrfachkarte',      icon: '🎟', hatBetrag: true,  hatNutzungen: true  },
  { key: 'leistung',      label: 'Leistungsgutschein', icon: '🎁', hatBetrag: true,  hatNutzungen: false },
];

export function gutscheinArtInfo(art: GutscheinArt): GutscheinArtInfo {
  return GUTSCHEIN_ARTEN.find((a) => a.key === art) ?? GUTSCHEIN_ARTEN[0];
}

export const MWST_TYPEN: { key: MwStTyp; label: string; hinweis: string }[] = [
  { key: 'mehrzweck', label: 'Mehrzweckgutschein', hinweis: 'Steuer erst bei Einlösung (Leistung/Steuersatz bei Ausgabe offen).' },
  { key: 'einzweck',  label: 'Einzweckgutschein',  hinweis: 'Steuer schon bei Ausgabe (Leistung & Steuersatz stehen fest).' },
];

export const VERJAEHRUNG_JAHRE = 3;

// ---------------------------------------------------------------------------
// Verjährung / Gültigkeit
// ---------------------------------------------------------------------------
function jahrVon(v: string | Date): number {
  if (typeof v === 'string' && v.length >= 4) { const y = Number(v.slice(0, 4)); if (y) return y; }
  return (v instanceof Date ? v : new Date(v)).getFullYear();
}

/** Gesetzliches Gültigkeitsende: 31.12. des Jahres (Ausstellungsjahr + 3). */
export function verjaehrungEnde(ausgestelltAm: string | Date, jahre: number = VERJAEHRUNG_JAHRE): string {
  return `${jahrVon(ausgestelltAm) + jahre}-12-31`;
}

const MS_TAG = 86400000;
function tagUTC(v: string | Date): number {
  if (typeof v === 'string' && v.length >= 10) {
    const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
    if (y && m && d) return Date.UTC(y, m - 1, d);
  }
  const dt = v instanceof Date ? v : new Date(v);
  return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/** Verfallen = gültig-bis liegt VOR heute (der Gültigkeitstag selbst zählt noch). */
export function istVerfallen(gueltigBis: string | Date | null | undefined, jetzt: string | Date = new Date()): boolean {
  if (!gueltigBis) return false;
  return tagUTC(gueltigBis) < tagUTC(jetzt);
}

/** Tage bis zum Verfall (negativ = schon verfallen). */
export function tageBisVerfall(gueltigBis: string | Date, jetzt: string | Date = new Date()): number {
  return Math.round((tagUTC(gueltigBis) - tagUTC(jetzt)) / MS_TAG);
}

// ---------------------------------------------------------------------------
// Restwert / Restnutzungen
// ---------------------------------------------------------------------------
/** Liest einen Wert aus der Datenbank als Zahl. Supabase liefert numeric oft als Text. */
function z(x: unknown): number { return leseZahlOder(x, 0); }

function r2(n: number): number { return centRunden(leseZahlOder(n, 0)); }

export function restwert(wert: number, eingeloest: number): number {
  return r2(Math.max(z(wert) - z(eingeloest), 0));
}

export function restNutzungen(gesamt: number, verbraucht: number): number {
  return Math.max(z(gesamt) - z(verbraucht), 0);
}

export interface GutscheinLite {
  art: GutscheinArt;
  wert?: number;
  eingeloest?: number;
  nutzungen_gesamt?: number | null;
  nutzungen_verbraucht?: number;
  gueltig_bis?: string | null;
  status?: string; // aktiv|eingeloest|verfallen|storniert (gespeichert)
}

/** Ist der Gutschein fachlich aufgebraucht (unabhängig vom gespeicherten Status)? */
export function istAufgebraucht(g: GutscheinLite): boolean {
  if (g.art === 'mehrfachkarte') return restNutzungen(g.nutzungen_gesamt || 0, g.nutzungen_verbraucht || 0) <= 0;
  return restwert(g.wert || 0, g.eingeloest || 0) <= 0;
}

/** Abgeleiteter Anzeige-Status: storniert > verfallen > eingeloest > aktiv. */
export function gutscheinStatus(g: GutscheinLite, jetzt: string | Date = new Date()): 'aktiv' | 'eingeloest' | 'verfallen' | 'storniert' {
  if (g.status === 'storniert') return 'storniert';
  if (istAufgebraucht(g)) return 'eingeloest';
  if (istVerfallen(g.gueltig_bis, jetzt)) return 'verfallen';
  return 'aktiv';
}

// ---------------------------------------------------------------------------
// Einlösung — prüft und rechnet, mutiert NICHTS.
// ---------------------------------------------------------------------------
export interface EinloesePruefung { ok: boolean; grund?: string; neuerRest: number; }

/** Prüft eine Wert-/Leistungs-Einlösung um `betrag` (brutto). */
export function pruefeEinloesungBetrag(g: GutscheinLite, betrag: number, jetzt: string | Date = new Date()): EinloesePruefung {
  const rest = restwert(g.wert || 0, g.eingeloest || 0);
  if (g.status === 'storniert') return { ok: false, grund: 'Gutschein ist storniert.', neuerRest: rest };
  if (istVerfallen(g.gueltig_bis, jetzt)) return { ok: false, grund: 'Gutschein ist verfallen.', neuerRest: rest };
  const b = z(betrag);
  if (b <= 0) return { ok: false, grund: 'Betrag muss größer als 0 sein.', neuerRest: rest };
  if (b > rest + 1e-9) return { ok: false, grund: `Nur noch ${rest.toFixed(2)} € Restwert verfügbar.`, neuerRest: rest };
  return { ok: true, neuerRest: r2(rest - b) };
}

/** Prüft eine Karten-Einlösung um `anzahl` Nutzungen. */
export function pruefeEinloesungNutzung(g: GutscheinLite, anzahl: number, jetzt: string | Date = new Date()): EinloesePruefung {
  const rest = restNutzungen(g.nutzungen_gesamt || 0, g.nutzungen_verbraucht || 0);
  if (g.status === 'storniert') return { ok: false, grund: 'Karte ist storniert.', neuerRest: rest };
  if (istVerfallen(g.gueltig_bis, jetzt)) return { ok: false, grund: 'Karte ist verfallen.', neuerRest: rest };
  const n = Math.round(z(anzahl));
  if (n <= 0) return { ok: false, grund: 'Anzahl muss größer als 0 sein.', neuerRest: rest };
  if (n > rest) return { ok: false, grund: `Nur noch ${rest} Nutzung(en) verfügbar.`, neuerRest: rest };
  return { ok: true, neuerRest: rest - n };
}

// ---------------------------------------------------------------------------
// Steuer (Einzweckgutschein): Netto/USt aus Bruttowert.
// ---------------------------------------------------------------------------
export interface SteuerAufteilung { brutto: number; netto: number; mwstSatz: number; mwst: number; }
export function nettoAusBrutto(brutto: number, mwstSatz: number): SteuerAufteilung {
  const b = r2(brutto);
  const satz = z(mwstSatz);
  const netto = r2(b / (1 + satz / 100));
  return { brutto: b, netto, mwstSatz: satz, mwst: r2(b - netto) };
}

// ---------------------------------------------------------------------------
// KPI-Zähler (für die Seite + augeGutscheine).
// ---------------------------------------------------------------------------
export interface GutscheinKennzahlen {
  aktive: number;
  offenerRestwert: number;   // Summe Restwert aktiver Wert-/Leistungsgutscheine (Verbindlichkeit)
  kartenOffen: number;       // aktive Mehrfachkarten mit Restnutzungen
  baldVerfallend: number;    // aktiv & Verfall in <= 90 Tagen
  verfallen: number;         // verfallen, aber Restwert/Nutzung offen
  eingeloestBetrag: number;  // Summe bereits eingelöster Beträge
}

export const BALD_VERFALL_TAGE = 90;

export function zaehleGutscheine(gutscheine: GutscheinLite[], jetzt: string | Date = new Date()): GutscheinKennzahlen {
  let aktive = 0, offenerRestwert = 0, kartenOffen = 0, baldVerfallend = 0, verfallen = 0, eingeloestBetrag = 0;
  for (const g of gutscheine) {
    eingeloestBetrag += z(g.eingeloest);
    const st = gutscheinStatus(g, jetzt);
    if (st === 'aktiv') {
      aktive++;
      if (g.art === 'mehrfachkarte') {
        if (restNutzungen(g.nutzungen_gesamt || 0, g.nutzungen_verbraucht || 0) > 0) kartenOffen++;
      } else {
        offenerRestwert += restwert(g.wert || 0, g.eingeloest || 0);
      }
      if (g.gueltig_bis) {
        const t = tageBisVerfall(g.gueltig_bis, jetzt);
        if (t >= 0 && t <= BALD_VERFALL_TAGE) baldVerfallend++;
      }
    } else if (st === 'verfallen') {
      verfallen++;
    }
  }
  return {
    aktive,
    offenerRestwert: r2(offenerRestwert),
    kartenOffen,
    baldVerfallend,
    verfallen,
    eingeloestBetrag: r2(eingeloestBetrag),
  };
}

// ============================================================================
// PUNKT 65 / R12, PAKET 2 (21.09.2026) — IST DIE EINSTUFUNG ÜBERHAUPT ZULÄSSIG?
//
// REIN ADDITIV. MwStTyp, MWST_TYPEN, nettoAusBrutto und alles darüber bleiben
// unverändert.
//
// ▄▄▄ WAS SCHON DA WAR — UND WAS FEHLTE ▄▄▄
// Diese Datei kennt Einzweck- und Mehrzweckgutschein seit jeher: als Typ, als
// Beschriftung, mit richtigen Hinweisen und mit nettoAusBrutto für den
// Einzweckfall. Der Befund der Bauliste war insofern nur halb richtig.
//
// Was FEHLTE, ist die Frage davor: DARF dieser Gutschein überhaupt als
// Einzweckgutschein geführt werden?
//
// § 3 Abs. 14 UStG lässt das nur zu, wenn bei der AUSGABE sowohl der
// LEISTUNGSORT als auch der STEUERSATZ feststehen. Ein Gastwirt, der Speisen
// mit 7 % und Getränke mit 19 % verkauft, hat bei einem Wertgutschein über
// 50 EUR genau das NICHT — sein Gutschein ist zwingend ein Mehrzweckgutschein.
//
// ▄▄▄ WARUM DAS GELD KOSTET ▄▄▄
// Die Einstufung entscheidet, WANN die Umsatzsteuer entsteht.
//   · Einzweck  -> schon bei der Ausgabe.
//   · Mehrzweck -> erst bei der Einlösung.
// Wer falsch einstuft, meldet die Steuer im falschen Voranmeldungszeitraum.
// Bei einem Weihnachtsgeschäft mit Gutscheinen über mehrere tausend Euro ist
// das keine Kleinigkeit, und es fällt erst bei der Umsatzsteuer-Sonderprüfung
// auf — dann mit Zinsen nach § 233a AO.
//
// Der zweite Fall, den fast niemand auf dem Schirm hat: ein VERFALLENER
// Gutschein. Beim Einzweckgutschein bleibt die Steuer, denn sie ist bei der
// Ausgabe entstanden. Beim Mehrzweckgutschein entsteht sie NIE, weil nie eine
// Leistung erbracht wurde — der Betrag ist dann steuerfreier Ertrag.
// ============================================================================

export interface TypPruefung {
  /** Darf der Gutschein als Einzweckgutschein geführt werden? */
  einzweckZulaessig: boolean;
  /** Die Einstufung, die sich aus den Angaben ergibt. */
  empfehlung: MwStTyp;
  /** Passt die gewählte Einstufung dazu? */
  stimmtMitWahl: boolean;
  gruende: string[];
  hinweis: string;
}

export interface TypEingabe {
  /** Was der Betrieb eingestellt hat. */
  gewaehlt?: MwStTyp | null;
  /**
   * Alle Steuersätze, die mit diesem Gutschein eingelöst werden können.
   * Mehr als einer -> zwingend Mehrzweckgutschein.
   */
  moeglicheSteuersaetze?: readonly number[] | null;
  /** Steht der Leistungsort bei Ausgabe fest? */
  leistungsortFest?: boolean | null;
  /**
   * Ist die Leistung konkret bezeichnet? Ein Leistungsgutschein über „eine
   * Maniküre" ja, ein Wertgutschein über 50 EUR nein.
   */
  leistungKonkret?: boolean | null;
}

/**
 * Prüft, ob die Einstufung als Einzweckgutschein zulässig ist.
 *
 * Im Zweifel Mehrzweck: das ist die Einstufung, die niemandem schadet, wenn
 * sie falsch ist — die Steuer wird dann später fällig, nicht gar nicht.
 * Umgekehrt wäre ein zu Unrecht als Einzweck geführter Gutschein eine zu
 * früh gemeldete Steuer und, beim Verfall, eine zu viel gezahlte.
 */
export function pruefeGutscheinTyp(e: TypEingabe): TypPruefung {
  const gruende: string[] = [];
  const saetze = (e.moeglicheSteuersaetze ?? []).filter((s) => typeof s === 'number' && Number.isFinite(s));
  const verschiedene = Array.from(new Set(saetze));

  let zulaessig = true;

  if (verschiedene.length === 0) {
    zulaessig = false;
    gruende.push('Es ist nicht hinterlegt, mit welchem Steuersatz dieser Gutschein eingelöst wird.');
  } else if (verschiedene.length > 1) {
    zulaessig = false;
    gruende.push(
      `Der Gutschein kann mit ${verschiedene.length} verschiedenen Steuersätzen eingelöst werden ` +
        `(${verschiedene.map((s) => s + ' %').join(', ')}). Damit steht der Steuersatz bei der Ausgabe nicht fest.`,
    );
  }

  if (e.leistungsortFest === false) {
    zulaessig = false;
    gruende.push('Der Leistungsort steht bei der Ausgabe nicht fest (§ 3 Abs. 14 Satz 1 UStG).');
  } else if (e.leistungsortFest == null) {
    zulaessig = false;
    gruende.push('Es ist nicht angegeben, ob der Leistungsort bei der Ausgabe feststeht.');
  }

  if (e.leistungKonkret === false) {
    gruende.push(
      'Die Leistung ist nicht konkret bezeichnet. Das allein schließt den Einzweckgutschein nicht aus — ' +
        'entscheidend sind Leistungsort und Steuersatz.',
    );
  }

  const empfehlung: MwStTyp = zulaessig ? 'einzweck' : 'mehrzweck';
  const gewaehlt = e.gewaehlt ?? null;
  const stimmtMitWahl = gewaehlt === null || gewaehlt === empfehlung || (gewaehlt === 'mehrzweck' && zulaessig);

  let hinweis: string;
  if (gewaehlt === 'einzweck' && !zulaessig) {
    hinweis =
      'ACHTUNG: Als Einzweckgutschein geführt, aber die Voraussetzungen des § 3 Abs. 14 UStG liegen nicht vor. ' +
      `${gruende.join(' ')} Die Umsatzsteuer würde zu früh gemeldet — richtig ist ein Mehrzweckgutschein, ` +
      'bei dem sie erst mit der Einlösung entsteht.';
  } else if (zulaessig && gewaehlt === 'mehrzweck') {
    hinweis =
      'Als Mehrzweckgutschein geführt, obwohl die Voraussetzungen für einen Einzweckgutschein vorliegen. ' +
      'Das ist die vorsichtige Einstufung, aber sie verschiebt die Steuer — bitte mit dem Steuerberater klären.';
  } else if (zulaessig) {
    hinweis = 'Einzweckgutschein: Leistungsort und Steuersatz stehen fest, die Steuer entsteht bei der Ausgabe.';
  } else {
    hinweis = `Mehrzweckgutschein. ${gruende.join(' ')} Die Steuer entsteht erst bei der Einlösung.`;
  }

  return { einzweckZulaessig: zulaessig, empfehlung, stimmtMitWahl, gruende, hinweis };
}

export type SteuerEreignis = 'ausgabe' | 'einloesung' | 'keine';

export interface SteuerZeitpunkt {
  ereignis: SteuerEreignis;
  /** Betrag, auf den die Steuer entsteht. */
  bemessung: number;
  steuer: number;
  hinweis: string;
}

/**
 * Wann entsteht die Umsatzsteuer — und wie viel?
 *
 * Der VERFALL ist der Fall, den fast niemand auf dem Schirm hat: Beim
 * Einzweckgutschein bleibt die Steuer, beim Mehrzweckgutschein entsteht sie
 * nie. Wer das verwechselt, führt Steuer auf einen Umsatz ab, den es nie
 * gegeben hat.
 */
export function steuerZeitpunkt(
  typ: MwStTyp,
  vorgang: 'ausgabe' | 'einloesung' | 'verfall',
  bruttoBetrag: number,
  mwstSatz: number,
): SteuerZeitpunkt {
  const b = r2(bruttoBetrag);
  const aufteilung = nettoAusBrutto(b, mwstSatz);

  if (typ === 'einzweck') {
    if (vorgang === 'ausgabe') {
      return {
        ereignis: 'ausgabe', bemessung: aufteilung.netto, steuer: aufteilung.mwst,
        hinweis: 'Einzweckgutschein: Die Umsatzsteuer entsteht mit der Ausgabe (§ 3 Abs. 14 Satz 2 UStG).',
      };
    }
    if (vorgang === 'einloesung') {
      return {
        ereignis: 'keine', bemessung: 0, steuer: 0,
        hinweis: 'Die Steuer ist bereits bei der Ausgabe entstanden — die Einlösung löst keine weitere aus.',
      };
    }
    return {
      ereignis: 'keine', bemessung: 0, steuer: 0,
      hinweis:
        'Verfallener Einzweckgutschein: Die bei der Ausgabe abgeführte Steuer BLEIBT. ' +
        'Der Vorgang ist nur noch ein Ertrag ohne weitere Steuerfolge.',
    };
  }

  // Mehrzweckgutschein
  if (vorgang === 'ausgabe') {
    return {
      ereignis: 'keine', bemessung: 0, steuer: 0,
      hinweis:
        'Mehrzweckgutschein: Die Ausgabe ist kein steuerbarer Umsatz (§ 3 Abs. 15 UStG). ' +
        'Der Betrag ist zunächst nur eine Anzahlung ohne Steuer.',
    };
  }
  if (vorgang === 'einloesung') {
    return {
      ereignis: 'einloesung', bemessung: aufteilung.netto, steuer: aufteilung.mwst,
      hinweis: 'Mehrzweckgutschein: Die Umsatzsteuer entsteht erst jetzt, mit der tatsächlichen Leistung.',
    };
  }
  return {
    ereignis: 'keine', bemessung: 0, steuer: 0,
    hinweis:
      'Verfallener Mehrzweckgutschein: Es wurde nie eine Leistung erbracht, also entsteht AUCH JETZT keine ' +
      'Umsatzsteuer. Der Betrag ist steuerfreier Ertrag. Wer hier Steuer abführt, zahlt auf einen Umsatz, ' +
      'den es nie gegeben hat.',
  };
}
