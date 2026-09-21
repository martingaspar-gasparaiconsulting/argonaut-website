// lib/skonto.ts
// ============================================================================
// SKONTO AUF DER RECHNUNG (Punkt 55 / R4, 21.09.2026)
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT ▄▄▄
// Skonto war im Haus genau einmal vorhanden: in lib/kalkulator.ts, und dort
// RICHTIG — "im Hundert" herausgerechnet statt aufgeschlagen (Z.219-221). Wer
// 1.000 EUR braucht und 3 % Skonto gewaehrt, muss 1.030,93 EUR ansetzen, nicht
// 1.030,00. Das ist die Kalkulation VOR dem Angebot.
//
// Auf der RECHNUNG fehlte Skonto vollstaendig. Gesucht wurde im ganzen Repo
// nach "skonto": ausser dem Kalkulator und einer Spaltenueberschrift im
// DATEV-Export kam das Wort nirgends vor. Die Rechnung kennt bis heute nur
// `zahlungsziel_tage`.
//
// ▄▄▄ DER UNTERSCHIED, DEN MAN LEICHT UEBERSIEHT ▄▄▄
// Im Kalkulator ist Skonto ein AUFSCHLAG-Problem: der Satz muss vorher
// eingepreist werden. Auf der Rechnung ist es ein ABZUG-Problem: vom fertigen
// Bruttobetrag gehen 2 % ab, wenn der Kunde frueh zahlt. Beide Rechnungen
// haben nichts miteinander zu tun, und beide werden gebraucht.
//
// ▄▄▄ DIE STEUERLICHE REGEL, DIE HIER DAS MEISTE ENTSCHEIDET ▄▄▄
// § 17 Abs. 1 UStG: Skonto mindert das Entgelt ERST, wenn der Kunde es
// tatsaechlich zieht. Die Rechnung weist deshalb die VOLLE Umsatzsteuer aus.
// Erst die spaetere Zahlung mit Abzug fuehrt zur Berichtigung — bei beiden,
// beim Rechnungssteller und beim Kunden.
// Genau deshalb gibt diese Datei zwei getrennte Zahlen zurueck:
//   · was auf der Rechnung STEHT (voll, ungemindert)
//   · was der Kunde bei fristgerechter Zahlung UEBERWEIST
// Wer beides vermischt, weist zu wenig Umsatzsteuer aus.
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln.
// Gelesen wird ueber lib/zahlen.ts, gerundet mit centRunden.
// Node-getestet: tests/skontoP55.test.mjs
//
// NOCH RUFT SIE NIEMAND AUF. Das Anschliessen an Rechnungsformular, PDF und
// E-Rechnung braucht neue Datenbankspalten und beruehrt ein Kern-Geld-
// Formular — das kommt als eigenes Paket und nur gemeinsam.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

/** Groesster Satz, der als Skonto noch plausibel ist. Alles darueber ist ein Tippfehler. */
export const SKONTO_MAX_PROZENT = 10;

/** Skonto-Angaben, wie sie an einer Rechnung haengen. */
export interface SkontoAngabe {
  /** Satz in Prozent, z. B. 2 oder 2.5. */
  prozent: unknown;
  /** Zahlungsfrist in Tagen ab Rechnungsdatum, innerhalb derer der Abzug gilt. */
  tage: unknown;
}

export interface SkontoErgebnis {
  /** Gilt ueberhaupt ein Skonto? Bei 0 % oder 0 Tagen: nein. */
  gilt: boolean;
  prozent: number;
  tage: number;
  /** Der Bruttobetrag der Rechnung — unveraendert, volle Umsatzsteuer. */
  rechnungsbetrag: number;
  /** Der Abzug in Euro. */
  abzug: number;
  /** Was der Kunde bei fristgerechter Zahlung ueberweist. */
  zahlbetrag: number;
}

/**
 * Prozentsatz absichern. Negativ ergibt keinen Sinn, und ein Satz ueber
 * SKONTO_MAX_PROZENT ist im Handwerk praktisch immer ein Vertipper
 * (20 statt 2,0). Er wird NICHT stillschweigend gekappt — pruefeSkonto()
 * sagt es; hier wird nur gerechnet, was hereinkommt.
 */
function satz(v: unknown): number {
  const n = leseZahlOder(v, 0);
  if (!(n > 0)) return 0;
  return n >= 100 ? 0 : n;
}

function tageZahl(v: unknown): number {
  const n = Math.trunc(leseZahlOder(v, 0));
  return n > 0 ? n : 0;
}

/**
 * Rechnet den Skontoabzug auf einen Bruttobetrag.
 *
 * WICHTIG: `rechnungsbetrag` bleibt der volle Betrag. Auf der Rechnung steht
 * er so, mit voller Umsatzsteuer (§ 17 Abs. 1 UStG). `zahlbetrag` ist nur
 * das, was der Kunde bei fristgerechter Zahlung ueberweist.
 */
export function rechneSkonto(bruttoBetrag: unknown, angabe: SkontoAngabe): SkontoErgebnis {
  const brutto = centRunden(leseZahlOder(bruttoBetrag, 0));
  const p = satz(angabe?.prozent);
  const t = tageZahl(angabe?.tage);
  const gilt = p > 0 && t > 0 && brutto !== 0;

  if (!gilt) {
    return { gilt: false, prozent: p, tage: t, rechnungsbetrag: brutto, abzug: 0, zahlbetrag: brutto };
  }
  const abzug = centRunden(brutto * p / 100);
  return {
    gilt: true,
    prozent: p,
    tage: t,
    rechnungsbetrag: brutto,
    abzug,
    zahlbetrag: centRunden(brutto - abzug),
  };
}

/**
 * Letzter Tag, an dem der Abzug noch gilt: Rechnungsdatum plus Tage.
 *
 * In UTC gerechnet, damit das Ergebnis nicht von der Zeitzone des Servers
 * abhaengt — derselbe Fehler steckte in lib/zugferd.ts (Punkt 53).
 *
 * BEWUSST OHNE § 193 BGB: Die Skontofrist ist eine vertragliche Zahlungsfrist,
 * keine gesetzliche. Sie verschiebt sich nicht auf den naechsten Werktag, wenn
 * sie auf ein Wochenende faellt. Wer das anders vereinbart, schreibt es in die
 * Zahlungsbedingungen; die Rechnung erfindet es nicht.
 *
 * Gibt null zurueck, wenn das Rechnungsdatum nicht lesbar ist — NIE still
 * das heutige Datum.
 */
export function skontoFrist(rechnungsdatum: unknown, tage: unknown): Date | null {
  const t = tageZahl(tage);
  if (t <= 0) return null;
  if (rechnungsdatum == null || String(rechnungsdatum).trim() === '') return null;
  const d = new Date(rechnungsdatum as any);
  if (isNaN(d.getTime())) return null;
  const frist = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  frist.setUTCDate(frist.getUTCDate() + t);
  return frist;
}

/** Datum als TT.MM.JJJJ, in UTC gelesen. */
function datumDe(d: Date): string {
  const tag = String(d.getUTCDate()).padStart(2, '0');
  const monat = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${tag}.${monat}.${d.getUTCFullYear()}`;
}

/** Betrag als deutscher Text mit zwei Nachkommastellen, ohne Waehrungszeichen. */
function betragDe(n: number): string {
  return centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Satz als deutscher Text: "2" bleibt "2", "2.5" wird "2,5". */
function satzDe(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/**
 * Der Satz, der auf der Rechnung steht.
 *
 * Ohne Rechnungsdatum steht die Frist in Tagen statt als Datum — das ist
 * zulaessig und immer noch eindeutig.
 * Leerer Text, wenn kein Skonto gilt: dann gehoert auch keine Zeile hin.
 */
export function skontoText(bruttoBetrag: unknown, angabe: SkontoAngabe, rechnungsdatum?: unknown): string {
  const e = rechneSkonto(bruttoBetrag, angabe);
  if (!e.gilt) return '';
  const frist = skontoFrist(rechnungsdatum, e.tage);
  const wann = frist ? `bis zum ${datumDe(frist)}` : `innerhalb von ${e.tage} Tagen`;
  return `Bei Zahlung ${wann} gewaehren wir ${satzDe(e.prozent)} % Skonto `
    + `(${betragDe(e.abzug)} EUR), Zahlbetrag dann ${betragDe(e.zahlbetrag)} EUR.`;
}

/**
 * Die maschinenlesbare Skontozeile fuer die E-Rechnung (BT-20).
 *
 * XRechnung verlangt fuer Skonto ein festes Muster im Feld Zahlungsbedingungen,
 * damit die Buchhaltung des Empfaengers es ohne Textverstehen auswerten kann:
 *
 *   #SKONTO#TAGE=14#PROZENT=2.00#BASISBETRAG=1190.00#
 *
 * Punkt und zwei Nachkommastellen, kein Komma und kein Waehrungszeichen — das
 * ist die englische Schreibweise der Norm, nicht die deutsche der Anzeige.
 * Der BASISBETRAG ist der volle Rechnungsbetrag, von dem der Satz abgeht.
 *
 * Leerer Text, wenn kein Skonto gilt.
 */
export function skontoZeileXRechnung(bruttoBetrag: unknown, angabe: SkontoAngabe): string {
  const e = rechneSkonto(bruttoBetrag, angabe);
  if (!e.gilt) return '';
  return `#SKONTO#TAGE=${e.tage}#PROZENT=${e.prozent.toFixed(2)}#BASISBETRAG=${e.rechnungsbetrag.toFixed(2)}#`;
}

export type SkontoHinweis = { feld: 'prozent' | 'tage' | 'frist'; text: string };

/**
 * Plausibilitaet der Eingabe. Blockiert nichts — sagt nur, was auffaellt.
 *
 * `zahlungszielTage` ist optional: steht es dabei, wird geprueft, ob die
 * Skontofrist ueberhaupt vor der Faelligkeit liegt. Eine Skontofrist von
 * 30 Tagen bei 14 Tagen Zahlungsziel ist kein Skonto, sondern ein Rabatt
 * fuer jeden, der ueberhaupt zahlt.
 */
export function pruefeSkonto(angabe: SkontoAngabe, zahlungszielTage?: unknown): SkontoHinweis[] {
  const hinweise: SkontoHinweis[] = [];
  const roh = leseZahlOder(angabe?.prozent, 0);
  const p = satz(angabe?.prozent);
  const t = tageZahl(angabe?.tage);

  if (roh < 0) {
    hinweise.push({ feld: 'prozent', text: 'Ein negativer Skontosatz ergibt keinen Sinn.' });
  }
  if (roh >= 100) {
    hinweise.push({ feld: 'prozent', text: 'Ein Skontosatz von 100 % oder mehr ergibt keinen Sinn — dann bliebe nichts uebrig.' });
  } else if (p > SKONTO_MAX_PROZENT) {
    hinweise.push({
      feld: 'prozent',
      text: `${satzDe(p)} % Skonto ist ungewoehnlich hoch — ueblich sind 2 bis 3 %. Bitte pruefen, ob eine Stelle verrutscht ist.`,
    });
  }
  if (p > 0 && t <= 0) {
    hinweise.push({ feld: 'tage', text: 'Zu einem Skontosatz gehoert eine Frist in Tagen, sonst gilt er unbegrenzt.' });
  }
  if (t > 0 && p <= 0) {
    hinweise.push({ feld: 'prozent', text: 'Zu einer Skontofrist gehoert ein Satz in Prozent.' });
  }
  if (p > 0 && t > 0 && zahlungszielTage != null) {
    const ziel = tageZahl(zahlungszielTage);
    if (ziel > 0 && t >= ziel) {
      hinweise.push({
        feld: 'frist',
        text: `Die Skontofrist (${t} Tage) ist nicht kuerzer als das Zahlungsziel (${ziel} Tage) — dann bekommt den Abzug jeder, der ueberhaupt fristgerecht zahlt.`,
      });
    }
  }
  return hinweise;
}

/**
 * Was die spaetere Skonto-Inanspruchnahme steuerlich bedeutet (§ 17 UStG).
 *
 * Zieht der Kunde das Skonto, mindert sich das Entgelt nachtraeglich. Netto
 * und Umsatzsteuer sinken im selben Verhaeltnis; die Rechnung selbst wird
 * NICHT geaendert, sondern die Buchung berichtigt.
 *
 * Gerechnet wird ueber den Bruttoabzug, aufgeteilt nach dem Steuersatz —
 * derselbe Weg, den die Buchhaltung geht.
 */
export function skontoBerichtigung(bruttoBetrag: unknown, angabe: SkontoAngabe, steuersatz: unknown): {
  gilt: boolean;
  abzugBrutto: number;
  abzugNetto: number;
  abzugSteuer: number;
} {
  const e = rechneSkonto(bruttoBetrag, angabe);
  const s = leseZahlOder(steuersatz, 0);
  if (!e.gilt) return { gilt: false, abzugBrutto: 0, abzugNetto: 0, abzugSteuer: 0 };
  if (!(s > 0)) {
    return { gilt: true, abzugBrutto: e.abzug, abzugNetto: e.abzug, abzugSteuer: 0 };
  }
  const netto = centRunden(e.abzug / (1 + s / 100));
  return {
    gilt: true,
    abzugBrutto: e.abzug,
    abzugNetto: netto,
    abzugSteuer: centRunden(e.abzug - netto),
  };
}
