// lib/sicherheitseinbehalt.ts
// ============================================================================
// SICHERHEITSEINBEHALT (Punkt 56 / R6, 21.09.2026)
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT ▄▄▄
// Gesucht wurde im ganzen Repo nach "einbehalt", "buergschaft",
// "gewaehrleistung" und "VOB": kein einziger Treffer. Fuer einen Bau- oder
// Handwerksbetrieb fehlt damit die Haelfte der Schlussrechnung. Der
// Sicherheitseinbehalt ist keine Feinheit — er ist bei fast jedem groesseren
// Auftrag vereinbart, und ohne ihn stimmt der Zahlbetrag nicht.
//
// ▄▄▄ ZWEI DINGE, DIE STAENDIG VERWECHSELT WERDEN ▄▄▄
//
// 1. DER EINBEHALT MINDERT DAS ENTGELT NICHT.
//    Die Leistung ist voll erbracht und wird voll berechnet — die Rechnung
//    weist die VOLLE Umsatzsteuer aus. Einbehalten wird nur die ZAHLUNG, als
//    Sicherheit. Wer den Einbehalt wie einen Rabatt behandelt und die
//    Bemessungsgrundlage kuerzt, weist zu wenig Umsatzsteuer aus.
//    (Erst wenn spaeter wegen eines Mangels endgueltig gekuerzt wird, wird
//    daraus eine Entgeltminderung nach § 17 UStG. Das ist ein anderer
//    Vorgang und gehoert nicht auf diese Rechnung.)
//
// 2. SKONTO RECHNET VOM VOLLEN BETRAG, NICHT VOM GEKUERZTEN.
//    Skonto ist ein Preisnachlass auf die Leistung, der Einbehalt eine
//    Zahlungssicherheit. Wer Skonto auf den bereits gekuerzten Betrag
//    rechnet, gibt dem Kunden weniger Nachlass als vereinbart — bei
//    5 % Einbehalt und 2 % Skonto auf 50.000 EUR sind das 50 EUR zu wenig.
//    zahlungsplan() rechnet beides in der richtigen Reihenfolge.
//
// ▄▄▄ WAS DIESE DATEI BEWUSST NICHT ENTSCHEIDET ▄▄▄
// Die Gewaehrleistungsfrist. Sie ist je nach Vertrag verschieden — VOB/B
// § 13 Abs. 4 nennt vier Jahre fuer Bauwerke und zwei fuer andere Arbeiten,
// § 634a BGB fuenf Jahre fuer Bauwerke. Was gilt, steht im Vertrag und nicht
// im Code. Die Frist ist deshalb eine EINGABE, kein Standardwert, den sich
// die Software ausdenkt.
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln.
// Node-getestet: tests/einbehaltP56.test.mjs
//
// NOCH RUFT SIE NIEMAND AUF — wie lib/skonto.ts. Das Anschliessen braucht
// neue Spalten und beruehrt ein Kern-Geld-Formular; das kommt gemeinsam.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

/** Ueblicher Rahmen. Darueber wird gewarnt, nicht gekappt. */
export const EINBEHALT_UEBLICH_MAX = 10;

/** Wovon der Satz gerechnet wird. Steht im Vertrag — wird nicht geraten. */
export type EinbehaltBasis = 'brutto' | 'netto';

export interface EinbehaltAngabe {
  /** Satz in Prozent, ueblich 3 bis 5. */
  prozent: unknown;
  /** Bemessungsgrundlage laut Vertrag. Ohne Angabe: brutto (Praxisregel). */
  basis?: EinbehaltBasis;
  /** Durch Buergschaft abgeloest? Dann wird nichts einbehalten. */
  durchBuergschaftAbgeloest?: boolean;
}

export interface EinbehaltErgebnis {
  gilt: boolean;
  prozent: number;
  basis: EinbehaltBasis;
  /** Was auf der Rechnung steht — voll, mit voller Umsatzsteuer. */
  rechnungsbetrag: number;
  /** Der Betrag, von dem der Satz gerechnet wurde. */
  bemessung: number;
  /** Der einbehaltene Betrag. */
  einbehalt: number;
  /** Was jetzt ausgezahlt wird. */
  auszahlung: number;
  /** Wurde der Einbehalt durch eine Buergschaft ersetzt? */
  abgeloest: boolean;
}

function satz(v: unknown): number {
  const n = leseZahlOder(v, 0);
  if (!(n > 0)) return 0;
  return n >= 100 ? 0 : n;
}

/**
 * Rechnet den Sicherheitseinbehalt.
 *
 * `rechnungsbetrag` ist IMMER der volle Bruttobetrag — er aendert sich durch
 * den Einbehalt nicht. Gekuerzt wird nur die Auszahlung.
 *
 * Ist der Einbehalt durch eine Buergschaft abgeloest (§ 17 Abs. 3 VOB/B),
 * wird nichts einbehalten: der Satz bleibt sichtbar, der Betrag ist 0.
 */
export function rechneEinbehalt(
  bruttoBetrag: unknown,
  angabe: EinbehaltAngabe,
  nettoBetrag?: unknown,
): EinbehaltErgebnis {
  const brutto = centRunden(leseZahlOder(bruttoBetrag, 0));
  const p = satz(angabe?.prozent);
  const basis: EinbehaltBasis = angabe?.basis === 'netto' ? 'netto' : 'brutto';
  const abgeloest = !!angabe?.durchBuergschaftAbgeloest;

  // Bei Basis netto MUSS der Nettobetrag mitkommen. Fehlt er, waere jede
  // Annahme falsch — dann wird nicht gerechnet, statt stillschweigend das
  // Brutto zu nehmen und zu viel einzubehalten.
  const nettoDa = nettoBetrag != null && String(nettoBetrag).trim() !== '';
  const bemessung = basis === 'netto' && nettoDa
    ? centRunden(leseZahlOder(nettoBetrag, 0))
    : brutto;
  const basisNutzbar = basis === 'brutto' || nettoDa;

  const gilt = p > 0 && brutto !== 0 && !abgeloest && basisNutzbar;
  if (!gilt) {
    return {
      gilt: false, prozent: p, basis,
      rechnungsbetrag: brutto,
      bemessung: basisNutzbar ? bemessung : 0,
      einbehalt: 0, auszahlung: brutto, abgeloest,
    };
  }
  const einbehalt = centRunden(bemessung * p / 100);
  return {
    gilt: true, prozent: p, basis,
    rechnungsbetrag: brutto,
    bemessung,
    einbehalt,
    auszahlung: centRunden(brutto - einbehalt),
    abgeloest: false,
  };
}

/**
 * Wann der Einbehalt zurueckzugeben ist: Abnahme plus Gewaehrleistungsfrist.
 *
 * In UTC gerechnet, damit die Zeitzone des Servers nichts verschiebt.
 * `jahre` kommt aus dem Vertrag — kein Standardwert. Gibt null zurueck, wenn
 * das Abnahmedatum nicht lesbar ist oder keine Frist genannt wurde.
 *
 * Der 29. Februar wird auf den 28. gezogen, wenn das Zieljahr kein Schaltjahr
 * ist; sonst rutscht das Datum auf den 1. Maerz und die Frist waere einen Tag
 * zu lang.
 */
export function rueckgabeDatum(abnahmedatum: unknown, jahre: unknown): Date | null {
  const j = leseZahlOder(jahre, 0);
  if (!(j > 0)) return null;
  if (abnahmedatum == null || String(abnahmedatum).trim() === '') return null;
  const d = new Date(abnahmedatum as any);
  if (isNaN(d.getTime())) return null;

  const jahr = d.getUTCFullYear() + Math.trunc(j);
  const monat = d.getUTCMonth();
  const tag = d.getUTCDate();
  const letzterImMonat = new Date(Date.UTC(jahr, monat + 1, 0)).getUTCDate();
  return new Date(Date.UTC(jahr, monat, Math.min(tag, letzterImMonat)));
}

function datumDe(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}
function betragDe(n: number): string {
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function satzDe(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/**
 * Der Satz fuer die Rechnung. Leer, wenn nichts einbehalten wird.
 *
 * Nennt ausdruecklich, dass die Umsatzsteuer davon unberuehrt bleibt — sonst
 * fragt jeder zweite Kunde nach, und mancher kuerzt selbst noch einmal.
 */
export function einbehaltText(
  bruttoBetrag: unknown,
  angabe: EinbehaltAngabe,
  abnahmedatum?: unknown,
  gewaehrleistungJahre?: unknown,
  nettoBetrag?: unknown,
): string {
  const e = rechneEinbehalt(bruttoBetrag, angabe, nettoBetrag);
  if (e.abgeloest && satz(angabe?.prozent) > 0) {
    return `Der vereinbarte Sicherheitseinbehalt von ${satzDe(satz(angabe.prozent))} % ist durch Buergschaft abgeloest; `
      + `der Rechnungsbetrag wird in voller Hoehe faellig.`;
  }
  if (!e.gilt) return '';

  const bis = rueckgabeDatum(abnahmedatum, gewaehrleistungJahre);
  const frist = bis
    ? ` Die Rueckgabe erfolgt nach Ablauf der Gewaehrleistungsfrist am ${datumDe(bis)}.`
    : '';
  const woraus = e.basis === 'netto' ? ' der Nettosumme' : '';
  return `Vereinbarter Sicherheitseinbehalt ${satzDe(e.prozent)} %${woraus}: ${betragDe(e.einbehalt)} EUR. `
    + `Zahlbetrag jetzt ${betragDe(e.auszahlung)} EUR.${frist} `
    + `Die Umsatzsteuer bleibt davon unberuehrt und ist in voller Hoehe ausgewiesen.`;
}

export type EinbehaltHinweis = { feld: 'prozent' | 'basis' | 'frist' | 'sperrkonto'; text: string };

/**
 * Plausibilitaet und die zwei Pflichten, die in der Praxis am haeufigsten
 * vergessen werden. Blockiert nichts.
 */
export function pruefeEinbehalt(
  angabe: EinbehaltAngabe,
  gewaehrleistungJahre?: unknown,
  nettoBetragVorhanden = true,
): EinbehaltHinweis[] {
  const hinweise: EinbehaltHinweis[] = [];
  const roh = leseZahlOder(angabe?.prozent, 0);
  const p = satz(angabe?.prozent);

  if (roh < 0) {
    hinweise.push({ feld: 'prozent', text: 'Ein negativer Einbehalt ergibt keinen Sinn.' });
  } else if (roh >= 100) {
    hinweise.push({ feld: 'prozent', text: 'Ein Einbehalt von 100 % oder mehr ergibt keinen Sinn.' });
  } else if (p > EINBEHALT_UEBLICH_MAX) {
    hinweise.push({
      feld: 'prozent',
      text: `${satzDe(p)} % Sicherheitseinbehalt ist ungewoehnlich hoch — ueblich sind 3 bis 5 %. Bitte gegen den Vertrag pruefen.`,
    });
  }

  if (p > 0 && angabe?.basis === 'netto' && !nettoBetragVorhanden) {
    hinweise.push({
      feld: 'basis',
      text: 'Als Bemessungsgrundlage ist die Nettosumme vereinbart, aber es liegt keine Nettosumme vor. Es wird nichts einbehalten, damit nicht versehentlich vom Brutto gekuerzt wird.',
    });
  }

  if (p > 0 && !(leseZahlOder(gewaehrleistungJahre, 0) > 0)) {
    hinweise.push({
      feld: 'frist',
      text: 'Zum Einbehalt gehoert die Gewaehrleistungsfrist aus dem Vertrag — ohne sie steht auf der Rechnung kein Rueckgabedatum. Ueblich sind vier Jahre nach VOB/B oder fuenf nach BGB bei Bauwerken; was gilt, steht im Vertrag.',
    });
  }

  if (p > 0 && !angabe?.durchBuergschaftAbgeloest) {
    hinweise.push({
      feld: 'sperrkonto',
      text: 'Bei einem Bareinbehalt nach VOB/B ist der Betrag auf ein Sperrkonto einzuzahlen und zu verzinsen (§ 17 Abs. 6 VOB/B). Der Auftragnehmer kann ihn stattdessen durch Buergschaft abloesen.',
    });
  }
  return hinweise;
}

export interface ZahlungsplanEingabe {
  /** Bruttosumme der Rechnung. */
  brutto: unknown;
  /** Nettosumme — noetig, wenn der Einbehalt von netto gerechnet wird. */
  netto?: unknown;
  einbehalt?: EinbehaltAngabe;
  /** Skonto, wie lib/skonto.ts es kennt. */
  skontoProzent?: unknown;
}

export interface ZahlungsplanErgebnis {
  rechnungsbetrag: number;
  einbehalt: number;
  skonto: number;
  /** Was der Kunde bei fristgerechter Zahlung ueberweist. */
  zahlbetrag: number;
  /** Was nach Ablauf der Gewaehrleistung noch offen bleibt. */
  spaeterFaellig: number;
}

/**
 * Einbehalt und Skonto in der richtigen Reihenfolge.
 *
 * BEIDE rechnen vom VOLLEN Rechnungsbetrag. Skonto ist ein Preisnachlass auf
 * die Leistung; der Einbehalt ist eine Zahlungssicherheit. Wer das Skonto auf
 * den bereits gekuerzten Betrag rechnet, gibt weniger Nachlass als vereinbart.
 *
 * Diese Funktion bildet lib/skonto.ts bewusst NICHT nach: sie rechnet den
 * Skontobetrag mit derselben Formel (Satz vom Rechnungsbetrag, auf Cent
 * gerundet). Ein Test haelt beide Ergebnisse gegeneinander.
 */
export function zahlungsplan(e: ZahlungsplanEingabe): ZahlungsplanErgebnis {
  const eb = rechneEinbehalt(e?.brutto, e?.einbehalt ?? { prozent: 0 }, e?.netto);
  const brutto = eb.rechnungsbetrag;
  const sp = satz(e?.skontoProzent);
  const skonto = sp > 0 && brutto !== 0 ? centRunden(brutto * sp / 100) : 0;
  return {
    rechnungsbetrag: brutto,
    einbehalt: eb.einbehalt,
    skonto,
    zahlbetrag: centRunden(brutto - eb.einbehalt - skonto),
    spaeterFaellig: eb.einbehalt,
  };
}
