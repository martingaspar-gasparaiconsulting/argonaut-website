// ============================================================================
// ARGONAUT OS · lib/bewirtung.ts
// Punkt 65 / R12, Teil 1 — Bewirtungskosten nach § 4 Abs. 5 Satz 1 Nr. 2 EStG
//
// Reine Logik. Ein Import: der gemeinsame Zahlen-Leser aus lib/zahlen.ts.
//
// ▄▄▄ DER BEFUND ▄▄▄
// Im ganzen Haus gibt es keine Stelle, die Bewirtungskosten aufteilt. Ein
// Restaurantbeleg laeuft wie jede andere Ausgabe durch — voll als
// Betriebsausgabe, volle Vorsteuer. Beides ist falsch, aber auf
// verschiedene Weise.
//
// ▄▄▄ DIE REGEL, UND WARUM SIE SO LEICHT DANEBENGEHT ▄▄▄
// Bei geschaeftlicher Bewirtung sind nur 70 % der angemessenen Aufwendungen
// Betriebsausgabe; 30 % sind es nicht (§ 4 Abs. 5 Satz 1 Nr. 2 EStG).
//
// Die VORSTEUER bleibt davon UNBERUEHRT. § 15 Abs. 1a UStG nimmt die
// Bewirtung ausdruecklich vom Abzugsverbot aus, soweit die Aufwendungen
// angemessen und nachgewiesen sind — die Umsatzsteuer ist also zu
// HUNDERT Prozent abziehbar, obwohl ertragsteuerlich nur 70 % zaehlen.
//
// Genau diese Asymmetrie ist die Falle. Wer "30 % raus" denkt und es auf
// den ganzen Beleg anwendet, verschenkt Vorsteuer.
//
// ▄▄▄ VIER FEHLER, DIE DIESE DATEI VERHINDERN SOLL ▄▄▄
//
//  1. DIE VORSTEUER MITKUERZEN.
//     GEMESSEN an einem Beleg ueber 119,00 EUR brutto mit 19 %: abziehbar
//     sind 70,00 EUR Betriebsausgabe und die VOLLEN 19,00 EUR Vorsteuer.
//     Wer die Vorsteuer auf 70 % kuerzt, zieht 13,30 EUR — 5,70 EUR zu
//     wenig, bei JEDEM Bewirtungsbeleg.
//
//  2. DIE ARBEITNEHMERBEWIRTUNG MIT 70 % KUERZEN.
//     Die 70-Prozent-Regel gilt nur fuer die Bewirtung von GESCHAEFTSFREUNDEN.
//     Werden ausschliesslich eigene Arbeitnehmer bewirtet (Betriebsfeier,
//     interne Besprechung), sind die Kosten zu 100 % Betriebsausgabe.
//     Diese Datei fragt danach, statt es zu unterstellen.
//
//  3. DIE 30 % VOM BRUTTO RECHNEN.
//     Gekuerzt wird der NETTObetrag. Bei 119,00 EUR brutto sind 30 % vom
//     Brutto 35,70 EUR statt richtig 30,00 EUR — 5,70 EUR zu viel gekuerzt.
//     Zufaellig derselbe Betrag wie in Fehler 1, aus dem gleichen Grund:
//     beides sind 30 % der Umsatzsteuer.
//
//  4. DIE PFLICHTANGABEN NICHT PRUEFEN.
//     Ohne Ort, Tag, Teilnehmer, Anlass und Hoehe ist die Bewirtung GAR
//     NICHT abziehbar — nicht etwa zu 70 %, sondern zu null
//     (§ 4 Abs. 5 Satz 1 Nr. 2 Satz 2 und 3 EStG). Das ist der teuerste
//     Fall ueberhaupt, und er faellt erst bei der Betriebspruefung auf,
//     wenn niemand mehr weiss, wer am Tisch sass.
//
// ▄▄▄ ANDOCKPUNKT (noch nicht verbunden) ▄▄▄
// Diese Datei ruft NIEMAND auf. Muster wie P55 bis P61.
// Beim Anschliessen gehoert sie an die Belegerfassung (Kategorie
// "Bewirtung") und in den DATEV-Export, wo abziehbarer und nicht
// abziehbarer Teil auf VERSCHIEDENE Konten gehen.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

// ----------------------------------------------------------------------------
// 1. DIE SAETZE
// ----------------------------------------------------------------------------

/** Abziehbarer Anteil bei geschaeftlicher Bewirtung, in Prozent. */
export const ABZIEHBAR_PROZENT = 70;

/**
 * Kontenrahmen-Vorschlag. Der abziehbare und der nicht abziehbare Teil
 * gehoeren auf VERSCHIEDENE Konten, sonst kann die Buchhaltung die Kuerzung
 * nicht nachvollziehen.
 *
 * ACHTUNG: Diese Nummern gehoeren vom STEUERBERATER bestaetigt, bevor der
 * erste echte Export laeuft — dieselbe Regel wie bei den Kennziffern in
 * Punkt 57. Sie stehen hier als benannte Konstanten an EINER Stelle, damit
 * eine Korrektur ein Einzeiler bleibt.
 */
export const KONTEN = {
  skr03: { abziehbar: '4650', nichtAbziehbar: '4654' },
  skr04: { abziehbar: '6640', nichtAbziehbar: '6644' },
  bestaetigt: false,
} as const;

/** Anlass der Bewirtung — davon haengt alles ab. */
export type BewirtungsArt =
  /** Geschaeftsfreunde, Kunden, Lieferanten. 70 % abziehbar. */
  | 'geschaeftlich'
  /** Ausschliesslich eigene Arbeitnehmer. 100 % abziehbar. */
  | 'arbeitnehmer'
  /** Privat veranlasst. Gar keine Betriebsausgabe, keine Vorsteuer. */
  | 'privat';

export const BEWIRTUNGS_ARTEN: readonly { key: BewirtungsArt; label: string; hinweis: string }[] = [
  {
    key: 'geschaeftlich',
    label: 'Geschäftsfreunde',
    hinweis: '70 % Betriebsausgabe, 30 % nicht abziehbar — die Vorsteuer bleibt voll abziehbar.',
  },
  {
    key: 'arbeitnehmer',
    label: 'Nur eigene Mitarbeiter',
    hinweis: '100 % Betriebsausgabe. Die 70-Prozent-Kürzung gilt hier NICHT.',
  },
  {
    key: 'privat',
    label: 'Privat veranlasst',
    hinweis: 'Keine Betriebsausgabe und keine Vorsteuer.',
  },
];

// ----------------------------------------------------------------------------
// 2. DIE PFLICHTANGABEN
// ----------------------------------------------------------------------------

export interface Bewirtungsbeleg {
  art: BewirtungsArt;
  /** Bruttobetrag des Belegs. */
  brutto?: number | string | null;
  /** Umsatzsteuersatz in Prozent. Fehlt er, gelten 19 %. */
  steuersatz?: number | null;
  /** Ort der Bewirtung (Name und Anschrift der Gaststätte). */
  ort?: string | null;
  /** Tag der Bewirtung, ISO. */
  tag?: string | null;
  /** Alle Teilnehmer mit Namen — auch der Bewirtende selbst. */
  teilnehmer?: string[] | null;
  /** Konkreter Anlass. "Geschäftsessen" genügt NICHT. */
  anlass?: string | null;
  /** Bewirtung in einer Gaststätte (dann gelten strengere Belegregeln). */
  inGaststaette?: boolean | null;
  /** Trinkgeld, gesondert ausgewiesen. */
  trinkgeld?: number | string | null;
}

/** Anlässe, die die Rechtsprechung als zu unbestimmt ansieht. */
export const ANLASS_ZU_ALLGEMEIN: readonly string[] = [
  'geschäftsessen', 'geschaeftsessen', 'arbeitsessen', 'besprechung',
  'geschäftsbesprechung', 'geschaeftsbesprechung', 'kundengespräch',
  'kundengespraech', 'essen', 'bewirtung', 'meeting', 'gespräch', 'gespraech',
];

export interface AngabenPruefung {
  vollstaendig: boolean;
  /** Was fehlt — ohne diese Angaben ist GAR NICHTS abziehbar. */
  fehlt: string[];
  /** Nicht blockierend, aber der Betrieb sollte es wissen. */
  hinweise: string[];
}

/**
 * Prueft die Pflichtangaben nach § 4 Abs. 5 Satz 1 Nr. 2 Satz 2 EStG.
 *
 * FEHLER 4 aus dem Dateikopf: Fehlt eine davon, sind die Aufwendungen NICHT
 * zu 70 % abziehbar, sondern zu NULL. Deshalb ist das hier keine Warnung,
 * sondern eine eigene Prüfung mit eigener Rechtsfolge.
 */
export function pruefeAngaben(b: Bewirtungsbeleg): AngabenPruefung {
  const fehlt: string[] = [];
  const hinweise: string[] = [];

  // Bei privater Bewirtung ist ohnehin nichts abziehbar — dann sind die
  // Pflichtangaben gegenstandslos.
  if (b.art === 'privat') {
    return { vollstaendig: true, fehlt: [], hinweise: ['Privat veranlasst — keine Betriebsausgabe, keine Vorsteuer.'] };
  }

  if (!(b.ort ?? '').trim()) fehlt.push('Ort der Bewirtung (Name und Anschrift)');
  if (!(b.tag ?? '').trim()) fehlt.push('Tag der Bewirtung');

  const teilnehmer = (b.teilnehmer ?? []).map((t) => String(t ?? '').trim()).filter(Boolean);
  if (teilnehmer.length === 0) {
    fehlt.push('Teilnehmer mit Namen — auch der Bewirtende selbst gehört dazu');
  }

  const anlass = (b.anlass ?? '').trim();
  if (!anlass) {
    fehlt.push('konkreter Anlass der Bewirtung');
  } else if (ANLASS_ZU_ALLGEMEIN.includes(anlass.toLowerCase())) {
    // Kein `fehlt`: der Anlass IST angegeben. Aber die Rechtsprechung
    // verlangt einen konkreten, und "Geschäftsessen" ist keiner.
    hinweise.push(
      `„${anlass}" ist als Anlass zu allgemein. Die Rechtsprechung verlangt einen konkreten Anlass ` +
        '— etwa „Vertragsverhandlung Bauvorhaben Musterstraße" statt „Geschäftsessen".',
    );
  }

  if (b.inGaststaette === true) {
    hinweise.push(
      'Bei Bewirtung in einer Gaststätte ist die maschinell erstellte Rechnung des Wirts beizufügen; ' +
        'der Eigenbeleg allein genügt nicht.',
    );
  }

  if (b.art === 'arbeitnehmer' && teilnehmer.length > 0) {
    hinweise.push(
      'Als reine Arbeitnehmerbewirtung erfasst: voll abziehbar. Sitzt auch nur EIN Geschäftsfreund ' +
        'mit am Tisch, gilt für den ganzen Beleg die 70-Prozent-Regel.',
    );
  }

  return { vollstaendig: fehlt.length === 0, fehlt, hinweise };
}

// ----------------------------------------------------------------------------
// 3. DIE AUFTEILUNG
// ----------------------------------------------------------------------------

export interface BewirtungsAufteilung {
  brutto: number;
  netto: number;
  /** Umsatzsteuer auf dem Beleg. */
  steuer: number;
  steuersatz: number;
  /** Betriebsausgabe, netto. */
  abziehbar: number;
  /** Nicht abziehbarer Teil, netto. */
  nichtAbziehbar: number;
  /**
   * Abziehbare Vorsteuer. Bei geschäftlicher Bewirtung die VOLLE Steuer —
   * das ist der Punkt, an dem die meisten danebenliegen.
   */
  vorsteuer: number;
  /** Trinkgeld, falls gesondert. Folgt derselben Quote wie die Bewirtung. */
  trinkgeld: number;
  trinkgeldAbziehbar: number;
  abziehbarProzent: number;
  angaben: AngabenPruefung;
  /** true = wegen fehlender Pflichtangaben ist NICHTS abziehbar. */
  gesperrt: boolean;
  klartext: string;
}

function z(n: unknown): number {
  return Math.max(0, leseZahlOder(n, 0));
}

export function teileBewirtung(b: Bewirtungsbeleg): BewirtungsAufteilung {
  const brutto = centRunden(z(b.brutto));
  const satzRoh = leseZahlOder(b.steuersatz, 19);
  const satz = Number.isFinite(satzRoh) && satzRoh >= 0 ? satzRoh : 19;
  const netto = centRunden(brutto / (1 + satz / 100));
  const steuer = centRunden(brutto - netto);
  const trinkgeld = centRunden(z(b.trinkgeld));

  const angaben = pruefeAngaben(b);

  // FEHLER 2: Die Quote haengt am Anlass, nicht am Beleg.
  const quote = b.art === 'geschaeftlich' ? ABZIEHBAR_PROZENT : b.art === 'arbeitnehmer' ? 100 : 0;

  // FEHLER 4: Ohne Pflichtangaben ist NICHTS abziehbar — auch nicht die 70 %.
  const gesperrt = !angaben.vollstaendig;

  // FEHLER 3: gekuerzt wird der NETTObetrag, nicht das Brutto.
  const abziehbar = gesperrt ? 0 : centRunden(netto * (quote / 100));
  const nichtAbziehbar = gesperrt ? centRunden(netto) : centRunden(netto - abziehbar);

  // FEHLER 1: Die Vorsteuer bleibt VOLL abziehbar (§ 15 Abs. 1a UStG) —
  // solange die Aufwendungen angemessen und nachgewiesen sind. Fehlen die
  // Nachweise, faellt sie mit.
  const vorsteuer = b.art === 'privat' || gesperrt ? 0 : steuer;

  const trinkgeldAbziehbar = gesperrt ? 0 : centRunden(trinkgeld * (quote / 100));

  return {
    brutto,
    netto,
    steuer,
    steuersatz: satz,
    abziehbar,
    nichtAbziehbar,
    vorsteuer,
    trinkgeld,
    trinkgeldAbziehbar,
    abziehbarProzent: gesperrt ? 0 : quote,
    angaben,
    gesperrt,
    klartext: klartext(brutto, netto, steuer, abziehbar, nichtAbziehbar, vorsteuer, b.art, gesperrt, angaben),
  };
}

function eur(n: number): string {
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
}

function klartext(
  brutto: number, netto: number, steuer: number,
  abziehbar: number, nichtAbziehbar: number, vorsteuer: number,
  art: BewirtungsArt, gesperrt: boolean, angaben: AngabenPruefung,
): string {
  if (gesperrt) {
    return (
      `${eur(brutto)} — NICHTS abziehbar, weil Pflichtangaben fehlen: ${angaben.fehlt.join(', ')}. ` +
      'Ohne sie sind die Aufwendungen nach § 4 Abs. 5 Satz 1 Nr. 2 EStG in voller Höhe keine Betriebsausgabe, ' +
      'und auch die Vorsteuer entfällt.'
    );
  }
  if (art === 'privat') {
    return `${eur(brutto)} privat veranlasst — keine Betriebsausgabe, keine Vorsteuer.`;
  }
  if (art === 'arbeitnehmer') {
    return `${eur(brutto)} Arbeitnehmerbewirtung: ${eur(abziehbar)} voll abziehbar, Vorsteuer ${eur(vorsteuer)}.`;
  }
  return (
    `${eur(brutto)} brutto = ${eur(netto)} netto + ${eur(steuer)} USt. ` +
    `Betriebsausgabe ${eur(abziehbar)} (70 %), nicht abziehbar ${eur(nichtAbziehbar)} (30 %). ` +
    `Vorsteuer ${eur(vorsteuer)} — VOLL, nicht gekürzt (§ 15 Abs. 1a UStG).`
  );
}

// ----------------------------------------------------------------------------
// 4. BUCHUNGSVORSCHLAG
// ----------------------------------------------------------------------------

export interface Buchungszeile {
  konto: string;
  bezeichnung: string;
  betrag: number;
}

/**
 * Zwei Zeilen statt einer: der abziehbare und der nicht abziehbare Teil
 * gehoeren auf verschiedene Konten. Wer alles auf ein Konto bucht, kann die
 * Kuerzung in der Steuererklaerung nicht mehr herleiten.
 */
export function buchungsvorschlag(
  a: BewirtungsAufteilung,
  kontenrahmen: 'skr03' | 'skr04' = 'skr03',
): { zeilen: Buchungszeile[]; hinweis: string } {
  const k = KONTEN[kontenrahmen];
  const zeilen: Buchungszeile[] = [];

  if (a.gesperrt || a.abziehbarProzent === 0) {
    return {
      zeilen: [{ konto: k.nichtAbziehbar, bezeichnung: 'Bewirtung, nicht abziehbar', betrag: a.netto }],
      hinweis: a.gesperrt
        ? 'Wegen fehlender Pflichtangaben geht der ganze Betrag auf das nicht abziehbare Konto.'
        : 'Privat veranlasst — keine Betriebsausgabe.',
    };
  }

  if (a.abziehbar > 0) zeilen.push({ konto: k.abziehbar, bezeichnung: 'Bewirtung, abziehbar', betrag: a.abziehbar });
  if (a.nichtAbziehbar > 0) zeilen.push({ konto: k.nichtAbziehbar, bezeichnung: 'Bewirtung, nicht abziehbar', betrag: a.nichtAbziehbar });

  return {
    zeilen,
    hinweis:
      `Vorsteuer ${eur(a.vorsteuer)} wird auf BEIDE Teile in voller Höhe gezogen. ` +
      'Die Kontonummern sind ein Vorschlag und gehören vom Steuerberater bestätigt.',
  };
}
