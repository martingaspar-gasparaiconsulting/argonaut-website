// lib/bauleistung.ts
// ============================================================================
// BAULEISTUNGEN: § 13b UStG UND § 48 EStG (Punkt 57 / R7, 21.09.2026)
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT ▄▄▄
// Gesucht wurde im ganzen Repo nach "13b", "reverse charge", "bauabzug",
// "48b", "Freistellungsbescheinigung" und "Steuerschuldnerschaft":
// KEIN EINZIGER TREFFER. lib/ustva.ts kennt genau vier Kennziffern
// (81, 86, 66, 83), lib/datevExtf.ts keinen einzigen 13b-Schluessel.
//
// Fuer einen Subunternehmer am Bau ist das keine Luecke, sondern ein
// Ausschlusskriterium: bei ihm ist FAST JEDE Ausgangsrechnung ein
// 13b-Fall, und fast jede Eingangsrechnung traegt den Bauabzug.
//
// ▄▄▄ ZWEI VORSCHRIFTEN, DIE NICHTS MITEINANDER ZU TUN HABEN ▄▄▄
// Sie treffen denselben Vorgang und werden staendig verwechselt:
//
//   § 13b UStG  — UMSATZSTEUER. Der Empfaenger schuldet sie, nicht der
//                 Leistende. Die Rechnung wird OHNE Steuerausweis
//                 geschrieben, mit Pflichthinweis (§ 14a Abs. 5 UStG).
//                 Betrifft die Umsatzsteuer-Voranmeldung beider Seiten.
//
//   § 48 EStG   — EINKOMMENSTEUER. Der Empfaenger behaelt 15 % der
//                 Gegenleistung ein und fuehrt sie ans Finanzamt ab —
//                 als Vorauszahlung auf die Steuer des LEISTENDEN.
//                 Entfaellt bei gueltiger Freistellungsbescheinigung
//                 nach § 48b EStG.
//
// Beide koennen gleichzeitig greifen: eine Rechnung ohne Umsatzsteuer,
// von der trotzdem 15 % einbehalten werden.
//
// ▄▄▄ WAS DIESE DATEI BEWUSST NICHT ENTSCHEIDET ▄▄▄
// OB ein Vorgang unter § 13b faellt. Das haengt an Tatsachen, die die
// Software nicht kennt — ist der Kunde selbst Bauleistender, ist die
// Leistung eine Bauleistung im Sinne des Gesetzes, liegt eine gueltige
// Freistellungsbescheinigung vor. Diese Datei PRUEFT die Angaben auf
// Vollstaendigkeit und rechnet dann richtig. Sie raet nicht.
//
// ▄▄▄ EHRLICH ZU DEN KENNZIFFERN UND BU-SCHLUESSELN ▄▄▄
// Die Zuordnungen unten entsprechen dem Stand, wie er in der Liste
// (Punkt 57) genannt ist: Kz 46/47 fuer den Empfaenger, Kz 60 fuer den
// Leistenden, DATEV BU 94/95. Kennziffern und Schluessel aendern sich
// mit den Formularen. Sie stehen deshalb als benannte Konstanten an
// EINER Stelle und gehoeren VOR dem ersten echten Export einmal vom
// Steuerberater bestaetigt — zusammen mit Punkt 16 (Soll- oder
// Ist-Versteuerung), der ohnehin dorthin gehoert.
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln.
// Node-getestet: tests/bauleistungP57.test.mjs
//
// NOCH RUFT SIE NIEMAND AUF — wie skonto.ts und sicherheitseinbehalt.ts.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

// ─── Die Konstanten, die der Steuerberater bestaetigen muss ───

/** Umsatzsteuer-Voranmeldung: der LEISTENDE traegt seine 13b-Umsaetze hier ein. */
export const KZ_LEISTENDER_13B = '60';
/** Der EMPFAENGER: Bemessungsgrundlage der Leistungen nach § 13b Abs. 2 Nr. 4. */
export const KZ_EMPFAENGER_BASIS = '46';
/** Der EMPFAENGER: die darauf entfallende Steuer. */
export const KZ_EMPFAENGER_STEUER = '47';
/** DATEV-Buchungsschluessel: 13b mit Vorsteuerabzug. */
export const BU_13B_MIT_VORSTEUER = '94';
/** DATEV-Buchungsschluessel: 13b ohne Vorsteuerabzug. */
export const BU_13B_OHNE_VORSTEUER = '95';

/** Der Pflichthinweis auf der Rechnung, § 14a Abs. 5 UStG. */
export const HINWEIS_13B = 'Steuerschuldnerschaft des Leistungsempfaengers (§ 13b UStG)';

/** Steuersatz der Bauabzugsteuer, § 48 Abs. 1 EStG. */
export const BAUABZUG_SATZ = 15;
/** Bagatellgrenze je Leistendem und Kalenderjahr, § 48 Abs. 2 EStG. */
export const BAUABZUG_FREIGRENZE = 5000;
/** Erhoehte Grenze, wenn der Empfaenger ausschliesslich steuerfrei vermietet. */
export const BAUABZUG_FREIGRENZE_VERMIETUNG = 15000;

// ─── § 13b UStG ───

export interface Umstaende {
  /** Ist die Leistung eine Bauleistung im Sinne des § 13b Abs. 2 Nr. 4 UStG? */
  istBauleistung?: boolean;
  /** Erbringt der KUNDE selbst nachhaltig Bauleistungen? (Nachweis: USt 1 TG) */
  kundeIstBauleistender?: boolean;
  /** Ist der Kunde Unternehmer? Ein Privatkunde faellt nie unter § 13b. */
  kundeIstUnternehmer?: boolean;
  /** Liegt dem Kunden eine gueltige Bescheinigung USt 1 TG vor? */
  nachweisUst1tg?: boolean;
}

export type ReverseChargeGrund =
  | 'gilt'
  | 'keine-bauleistung'
  | 'kunde-kein-unternehmer'
  | 'kunde-kein-bauleistender'
  | 'angaben-fehlen';

export interface ReverseChargeErgebnis {
  gilt: boolean;
  grund: ReverseChargeGrund;
  klartext: string;
  /** Fehlt der Nachweis USt 1 TG, obwohl 13b angewendet wird? */
  nachweisFehlt: boolean;
}

/**
 * Prueft, ob § 13b anzuwenden ist — auf Grundlage der ANGABEN, nicht durch
 * Raten. Fehlt eine der drei Tatsachen, lautet das Ergebnis
 * "angaben-fehlen" und NICHT "gilt nicht": das ist ein Unterschied, denn
 * im ersten Fall muss jemand nachsehen, im zweiten ist alles geklaert.
 */
export function pruefeReverseCharge(u: Umstaende): ReverseChargeErgebnis {
  const nachweisFehlt = !u?.nachweisUst1tg;

  if (u?.istBauleistung == null || u?.kundeIstUnternehmer == null || u?.kundeIstBauleistender == null) {
    return {
      gilt: false, grund: 'angaben-fehlen', nachweisFehlt,
      klartext: 'Es fehlen Angaben: Bauleistung, Unternehmereigenschaft des Kunden und ob der Kunde selbst Bauleistungen erbringt. Ohne diese drei laesst sich § 13b nicht beurteilen.',
    };
  }
  if (!u.istBauleistung) {
    return { gilt: false, grund: 'keine-bauleistung', nachweisFehlt, klartext: 'Keine Bauleistung — die Rechnung wird mit Umsatzsteuer geschrieben.' };
  }
  if (!u.kundeIstUnternehmer) {
    return { gilt: false, grund: 'kunde-kein-unternehmer', nachweisFehlt, klartext: 'Der Kunde ist kein Unternehmer — § 13b greift nicht, die Rechnung traegt Umsatzsteuer.' };
  }
  if (!u.kundeIstBauleistender) {
    return { gilt: false, grund: 'kunde-kein-bauleistender', nachweisFehlt, klartext: 'Der Kunde erbringt selbst keine Bauleistungen — § 13b greift nicht, die Rechnung traegt Umsatzsteuer.' };
  }
  return {
    gilt: true, grund: 'gilt', nachweisFehlt,
    klartext: 'Bauleistung an einen Bauleistenden: der Kunde schuldet die Umsatzsteuer. Die Rechnung wird ohne Steuerausweis geschrieben.',
  };
}

export interface RechnungsSummen13b {
  /** Der Betrag, der auf der Rechnung steht. */
  betrag: number;
  /** Ausgewiesene Umsatzsteuer — bei 13b immer 0. */
  ausgewieseneSteuer: number;
  /** Die Steuer, die der KUNDE anmelden und abfuehren muss. */
  steuerDesKunden: number;
  hinweis: string;
}

/**
 * Die Rechnungssummen bei § 13b.
 *
 * DER FEHLER, DEN DAS VERHINDERT: den Nettobetrag stehen lassen und
 * trotzdem Umsatzsteuer ausweisen. Wer bei § 13b Steuer ausweist, schuldet
 * sie nach § 14c Abs. 1 UStG ZUSAETZLICH — der Kunde meldet sie ebenfalls
 * an, und dieselbe Steuer wird zweimal gezahlt.
 *
 * `steuerDesKunden` steht NICHT auf der Rechnung. Sie ist die Zahl, die der
 * Kunde in seine Voranmeldung eintraegt, und gehoert als Hinweis daneben.
 */
export function summen13b(nettoBetrag: unknown, steuersatz: unknown = 19): RechnungsSummen13b {
  const netto = centRunden(leseZahlOder(nettoBetrag, 0));
  const satz = leseZahlOder(steuersatz, 0);
  return {
    betrag: netto,
    ausgewieseneSteuer: 0,
    steuerDesKunden: satz > 0 ? centRunden(netto * satz / 100) : 0,
    hinweis: HINWEIS_13B,
  };
}

export interface UstvaZeile { kz: string; label: string; wert: number; }

/**
 * Die Voranmeldungs-Zeilen zu einem § 13b-Vorgang, aus beiden Blickwinkeln.
 *
 * Der LEISTENDE meldet nur die Bemessungsgrundlage (keine Steuer — er
 * schuldet sie ja nicht). Der EMPFAENGER meldet Grundlage UND Steuer; die
 * Vorsteuer zieht er, falls abzugsberechtigt, an anderer Stelle wieder ab.
 */
export function ustvaZeilen13b(nettoBetrag: unknown, steuersatz: unknown, sicht: 'leistender' | 'empfaenger'): UstvaZeile[] {
  const s = summen13b(nettoBetrag, steuersatz);
  if (sicht === 'leistender') {
    return [{ kz: KZ_LEISTENDER_13B, label: 'Umsaetze, fuer die der Leistungsempfaenger die Steuer schuldet (§ 13b Abs. 5 UStG)', wert: s.betrag }];
  }
  return [
    { kz: KZ_EMPFAENGER_BASIS, label: 'Leistungen nach § 13b Abs. 2 Nr. 4 UStG (Bemessungsgrundlage)', wert: s.betrag },
    { kz: KZ_EMPFAENGER_STEUER, label: 'Steuer auf Leistungen nach § 13b Abs. 2 Nr. 4 UStG', wert: s.steuerDesKunden },
  ];
}

/** DATEV-Buchungsschluessel fuer einen 13b-Eingangsbeleg. */
export function datevSchluessel13b(vorsteuerabzugsberechtigt: boolean): string {
  return vorsteuerabzugsberechtigt ? BU_13B_MIT_VORSTEUER : BU_13B_OHNE_VORSTEUER;
}

// ─── § 48 EStG Bauabzugsteuer ───

export interface BauabzugAngabe {
  /** Liegt eine gueltige Freistellungsbescheinigung nach § 48b EStG vor? */
  freistellungGueltig?: boolean;
  /** Was im laufenden Kalenderjahr an DENSELBEN Leistenden schon gezahlt wurde. */
  jahressummeBisher?: unknown;
  /** Erbringt der Empfaenger ausschliesslich steuerfreie Vermietungsumsaetze? */
  nurVermietung?: boolean;
}

export interface BauabzugErgebnis {
  gilt: boolean;
  grund: 'gilt' | 'freistellung' | 'unter-freigrenze';
  /** Die Grenze, die hier gilt — 5.000 oder 15.000. */
  freigrenze: number;
  /** Gegenleistung im Jahr inklusive dieser Rechnung. */
  jahressumme: number;
  /** Der einzubehaltende Betrag: 15 % der Gegenleistung dieser Rechnung. */
  abzug: number;
  /** Was der Leistende ueberwiesen bekommt. */
  auszahlung: number;
  klartext: string;
}

/**
 * Bauabzugsteuer nach § 48 EStG.
 *
 * DER FALLSTRICK, DEN FAST JEDER UEBERSIEHT: Die Bagatellgrenze ist eine
 * FREIGRENZE, kein Freibetrag. Wird sie im Kalenderjahr ueberschritten,
 * wird von der GANZEN Gegenleistung einbehalten — nicht nur vom
 * uebersteigenden Teil. Bei 4.900 EUR Vorsumme und einer Rechnung ueber
 * 200 EUR sind das nicht 15 EUR, sondern 30 EUR aus dieser Rechnung und
 * eine Nachmeldung fuer die vorigen.
 *
 * Gerechnet wird von der GEGENLEISTUNG, also dem Rechnungsbetrag
 * einschliesslich Umsatzsteuer. Bei einem 13b-Fall ist die Rechnung
 * steuerfrei ausgestellt — dann ist die Gegenleistung der Nettobetrag.
 */
export function bauabzugsteuer(gegenleistung: unknown, angabe?: BauabzugAngabe): BauabzugErgebnis {
  const betrag = centRunden(leseZahlOder(gegenleistung, 0));
  const bisher = centRunden(leseZahlOder(angabe?.jahressummeBisher, 0));
  const jahressumme = centRunden(bisher + betrag);
  const freigrenze = angabe?.nurVermietung ? BAUABZUG_FREIGRENZE_VERMIETUNG : BAUABZUG_FREIGRENZE;

  if (angabe?.freistellungGueltig) {
    return {
      gilt: false, grund: 'freistellung', freigrenze, jahressumme,
      abzug: 0, auszahlung: betrag,
      klartext: 'Gueltige Freistellungsbescheinigung nach § 48b EStG — es wird nichts einbehalten. Die Bescheinigung gehoert zu den Unterlagen.',
    };
  }
  if (jahressumme <= freigrenze) {
    return {
      gilt: false, grund: 'unter-freigrenze', freigrenze, jahressumme,
      abzug: 0, auszahlung: betrag,
      klartext: `Die Gegenleistung im Kalenderjahr bleibt mit ${jahressumme.toFixed(2)} EUR unter der Freigrenze von ${freigrenze.toFixed(2)} EUR — kein Abzug. ACHTUNG: Wird die Grenze spaeter ueberschritten, ist rueckwirkend von allen Zahlungen einzubehalten.`,
    };
  }
  const abzug = centRunden(betrag * BAUABZUG_SATZ / 100);
  return {
    gilt: true, grund: 'gilt', freigrenze, jahressumme,
    abzug, auszahlung: centRunden(betrag - abzug),
    klartext: `Die Gegenleistung im Kalenderjahr uebersteigt mit ${jahressumme.toFixed(2)} EUR die Freigrenze von ${freigrenze.toFixed(2)} EUR. Es sind ${BAUABZUG_SATZ} % der GESAMTEN Gegenleistung einzubehalten und anzumelden — die Freigrenze ist kein Freibetrag.`,
  };
}

/**
 * Wann der einbehaltene Betrag anzumelden und abzufuehren ist:
 * bis zum 10. des Folgemonats der ZAHLUNG (nicht der Rechnung).
 *
 * In UTC gerechnet. Gibt null zurueck, wenn das Datum nicht lesbar ist.
 *
 * BEWUSST OHNE WOCHENEND-VERSCHIEBUNG: § 108 Abs. 3 AO verschiebt die Frist
 * auf den naechsten Werktag, wenn der 10. auf ein Wochenende oder einen
 * Feiertag faellt. Die Feiertage haengen am Bundesland; lib/feiertage.ts
 * kann das, und der Anschluss gehoert in dasselbe Paket wie die Anbindung —
 * nicht halb hier hinein. Bis dahin nennt diese Funktion den 10. und sagt
 * ueber `moeglicheVerschiebung`, dass nachzusehen ist.
 */
export function anmeldefristBauabzug(zahlungsdatum: unknown): { frist: Date; moeglicheVerschiebung: boolean } | null {
  if (zahlungsdatum == null || String(zahlungsdatum).trim() === '') return null;
  const d = new Date(zahlungsdatum as any);
  if (isNaN(d.getTime())) return null;
  const frist = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 10));
  const tag = frist.getUTCDay();
  return { frist, moeglicheVerschiebung: tag === 0 || tag === 6 };
}

export type BauHinweis = { feld: 'nachweis' | 'freistellung' | 'freigrenze' | 'steuerausweis'; text: string };

/**
 * Die Unterlagen-Pflichten, die im Streitfall den Unterschied machen.
 * Blockiert nichts.
 */
export function pruefeBauleistung(u: Umstaende, angabe?: BauabzugAngabe, ausgewieseneSteuer: unknown = 0): BauHinweis[] {
  const hinweise: BauHinweis[] = [];
  const rc = pruefeReverseCharge(u);

  if (rc.gilt && rc.nachweisFehlt) {
    hinweise.push({
      feld: 'nachweis',
      text: 'Fuer § 13b fehlt die Bescheinigung USt 1 TG des Kunden. Ohne sie traegt im Zweifel der Rechnungssteller die Umsatzsteuer.',
    });
  }
  if (rc.gilt && leseZahlOder(ausgewieseneSteuer, 0) > 0) {
    hinweise.push({
      feld: 'steuerausweis',
      text: 'Bei § 13b darf KEINE Umsatzsteuer ausgewiesen werden. Wer sie trotzdem ausweist, schuldet sie nach § 14c Abs. 1 UStG zusaetzlich — dieselbe Steuer wird dann zweimal gezahlt.',
    });
  }
  if (angabe && !angabe.freistellungGueltig) {
    hinweise.push({
      feld: 'freistellung',
      text: 'Keine gueltige Freistellungsbescheinigung nach § 48b EStG hinterlegt. Der Leistende kann sie beim Finanzamt beantragen; mit ihr entfaellt der Abzug ganz.',
    });
    const b = bauabzugsteuer(0, angabe);
    if (!b.gilt && b.jahressumme > b.freigrenze * 0.8) {
      hinweise.push({
        feld: 'freigrenze',
        text: `Die Gegenleistung im Kalenderjahr naehert sich der Freigrenze von ${b.freigrenze.toFixed(2)} EUR. Wird sie ueberschritten, ist rueckwirkend von ALLEN Zahlungen des Jahres einzubehalten.`,
      });
    }
  }
  return hinweise;
}
