// ============================================================================
// ARGONAUT OS · lib/ustva.ts
// ELSTER · Umsatzsteuer-Voranmeldung: rechnet aus bezahlten Rechnungen +
// Vorsteuer die amtlichen UStVA-Kennziffern.
// Reine Formeln — KEINE Supabase-/React-Abhängigkeit. Node-getestet.
//
// VORBEREITUNG, KEINE ANMELDUNG: Diese Zahlen sind eine Hilfe zum fehlerfreien
// Abtippen in ELSTER-Online. Die verbindliche Anmeldung prüft und gibt der
// Steuerberater ab. Eine unrichtige Voranmeldung ist nach § 153 AO
// berichtigungspflichtig.
//
// ▄▄▄ REPARIERT AM 18.09.2026 (Punkt 17) ▄▄▄ Drei Fehler, am echten Code
// nachgerechnet:
//
//  1. GUTSCHRIFTEN VERSCHWANDEN — und der Betrieb zahlte zu viel.
//     satzVon() gab bei negativem Netto eine 0 zurueck. Eine Gutschrift lief
//     damit in die steuerfreien Umsaetze statt den 19-%-Umsatz zu mindern,
//     und ihre Umsatzsteuer wurde gar nicht abgezogen. Gemessen: 10.000 EUR
//     Umsatz plus eine Gutschrift ueber 1.000 EUR ergaben Kz 81 = 10.000
//     statt 9.000 und eine Zahllast von 1.900 statt 1.710 EUR — 190 EUR zu
//     viel ans Finanzamt. Angezeigt wurde die Gutschrift nirgends, weil die
//     steuerfreie Zeile nur bei einem Wert GROESSER null erschien.
//
//  2. KZ 83 OHNE VORZEICHEN. Der Wert war Math.abs(zahllast), nur das Label
//     unterschied Zahllast und Erstattung. Kz 83 ist aber ein vorzeichen-
//     behaftetes Feld: Wer 710 statt -710 abtippt, dreht eine Erstattung in
//     eine Zahlung — 1.420 EUR Unterschied. Der Wert traegt jetzt sein
//     Vorzeichen.
//
//  3. STEUERFREIE UMSAETZE WURDEN AUF KZ 48 GERATEN. Der Pruefbefund wollte
//     das auf Kz 41 aendern. BEIDES WAERE FALSCH: aus netto und mwst allein
//     laesst sich nicht ableiten, WARUM ein Umsatz steuerfrei ist. Kz 41 ist
//     die innergemeinschaftliche Lieferung, Kz 43 die Ausfuhr, Kz 48 der
//     steuerfreie Umsatz OHNE Vorsteuerabzug, und ein Kleinunternehmer nach
//     § 19 meldet gar nichts davon an. Eine geratene Kennziffer ist schlimmer
//     als keine, weil sie abgetippt wird. Die Summe wird deshalb ohne
//     Kennziffer ausgewiesen, mit Klartext, dass die Zuordnung eine
//     Entscheidung ist — und ustvaHinweise() sagt es noch einmal.
//
// Beim Reparieren zusaetzlich gefunden: Die Bemessungsgrundlagen liefen durch
// Math.floor. Bei einem negativen Saldo rundet das VOM Nullpunkt WEG
// (-1000,50 wurde -1001) und meldet einen Euro zu viel als Minderung. Jetzt
// Math.trunc, also immer in Richtung Null.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

/** Zahl lesen — über den gemeinsamen Leser aus lib/zahlen.ts (Punkt 24). */
function z(x: unknown): number {
  return leseZahlOder(x, 0);
}
function r2(n: number): number {
  return centRunden(n);
}

/**
 * Effektiven Steuersatz einer Rechnung auf den nächsten Regelsatz runden.
 *
 * Punkt 17: Gerechnet wird mit BETRÄGEN. Eine Gutschrift über 1.000 EUR zu
 * 19 % ist ein 19-%-Vorgang mit negativem Wert, kein steuerfreier Umsatz.
 */
export function satzVon(netto: unknown, mwst: unknown): number {
  const n = Math.abs(z(netto));
  const m = Math.abs(z(mwst));
  if (n <= 0) return 0;
  const p = (m / n) * 100;
  const kandidaten = [0, 7, 19];
  return kandidaten.reduce((best, k) => (Math.abs(k - p) < Math.abs(best - p) ? k : best), 0);
}

export interface UstvaRechnung { netto_summe?: number | string | null; mwst_summe?: number | string | null; }
export interface Kennziffer { kz: string; label: string; wert: number; istBetrag: boolean; }
export interface UstvaErgebnis {
  umsatz19: number; ust19: number;
  umsatz7: number; ust7: number;
  umsatz0: number;
  vorsteuer: number;
  zahllast: number;      // + = an Finanzamt, − = Erstattung
  kennziffern: Kennziffer[];
  /** Wie viele Zeilen waren Gutschriften (negativer Netto-Betrag)? */
  gutschriften: number;
}

/** Bemessungsgrundlage in vollen Euro — immer in Richtung Null. */
function volleEuro(n: number): number {
  return Math.trunc(n);
}

/**
 * UStVA aus bezahlten Rechnungen + Vorsteuer.
 * Kz 81/86 = Bemessungsgrundlage (netto, volle Euro), Kz 66 = Vorsteuer,
 * Kz 83 = verbleibende Vorauszahlung (mit Vorzeichen: − = Erstattung).
 */
export function baueUstva(rechnungen: UstvaRechnung[], vorsteuer: number | string): UstvaErgebnis {
  let umsatz19 = 0, ust19 = 0, umsatz7 = 0, ust7 = 0, umsatz0 = 0, gutschriften = 0;
  for (const r of rechnungen || []) {
    const netto = z(r.netto_summe), mwst = z(r.mwst_summe);
    if (netto < 0) gutschriften += 1;
    const s = satzVon(netto, mwst);
    if (s === 19) { umsatz19 += netto; ust19 += mwst; }
    else if (s === 7) { umsatz7 += netto; ust7 += mwst; }
    else { umsatz0 += netto; }
  }
  const vst = z(vorsteuer);
  const bg19 = volleEuro(umsatz19), bg7 = volleEuro(umsatz7), bg0 = volleEuro(umsatz0);
  const zahllast = r2(ust19 + ust7 - vst);

  const kennziffern: Kennziffer[] = [
    { kz: '81', label: 'Umsätze zu 19 % (netto)', wert: bg19, istBetrag: true },
    { kz: '—', label: '  darauf Umsatzsteuer 19 %', wert: r2(ust19), istBetrag: true },
    { kz: '86', label: 'Umsätze zu 7 % (netto)', wert: bg7, istBetrag: true },
    { kz: '—', label: '  darauf Umsatzsteuer 7 %', wert: r2(ust7), istBetrag: true },
    { kz: '66', label: 'Vorsteuerbeträge', wert: r2(vst), istBetrag: true },
    {
      kz: '83',
      label: zahllast >= 0 ? 'Verbleibende Vorauszahlung (Zahllast)' : 'Überschuss (Erstattung, mit Minus eintragen)',
      wert: zahllast,
      istBetrag: true,
    },
  ];

  // Steuerfreie Umsätze werden ausgewiesen, aber KEINER Kennziffer zugeordnet
  // (siehe Dateikopf, Punkt 3). Auch ein negativer Saldo wird gezeigt — vorher
  // verschwand er wegen „> 0" ganz aus der Anzeige.
  if (bg0 !== 0) {
    kennziffern.splice(4, 0, {
      kz: '?',
      label: 'Steuerfreie Umsätze (netto) — Kennziffer vom Steuerberater bestätigen lassen',
      wert: bg0,
      istBetrag: true,
    });
  }

  return {
    umsatz19: r2(umsatz19), ust19: r2(ust19),
    umsatz7: r2(umsatz7), ust7: r2(ust7),
    umsatz0: r2(umsatz0),
    vorsteuer: r2(vst), zahllast, kennziffern, gutschriften,
  };
}

/**
 * Was vor dem Abtippen in ELSTER auffallen muss.
 *
 * Wie bei lib/datevExtf: die Zahlen sehen richtig aus, auch wenn die
 * Zuordnung eine Entscheidung ist. Diese Liste macht die Entscheidungen
 * sichtbar. Sie ändert nichts und blockiert nichts.
 */
export function ustvaHinweise(erg: UstvaErgebnis): string[] {
  const raus: string[] = [];

  if (erg.umsatz0 !== 0) {
    raus.push(
      'Es gibt steuerfreie Umsätze. Welche Kennziffer dafür richtig ist, hängt vom Grund ab: ' +
        'innergemeinschaftliche Lieferung, Ausfuhr, steuerfrei ohne Vorsteuerabzug oder ' +
        'Kleinunternehmer nach § 19 sind verschiedene Zeilen im Formular. ' +
        'Bitte vom Steuerberater bestätigen lassen — geraten wird hier bewusst nicht.',
    );
  }

  if (erg.gutschriften > 0) {
    raus.push(
      `${erg.gutschriften} ${erg.gutschriften === 1 ? 'Gutschrift mindert' : 'Gutschriften mindern'} ` +
        'Umsatz und Umsatzsteuer im jeweiligen Steuersatz. Bitte gegenprüfen, ' +
        'ob alle Gutschriften im richtigen Zeitraum liegen.',
    );
  }

  if (erg.zahllast < 0) {
    raus.push(
      'Kennziffer 83 ist negativ — das ist eine Erstattung. In ELSTER MIT Minuszeichen eintragen, ' +
        'sonst wird aus der Erstattung eine Zahlung.',
    );
  }

  raus.push(
    'Gerechnet wird nach vereinnahmten Entgelten (Ist-Versteuerung): gezählt werden bezahlte Rechnungen. ' +
      'Wer nach vereinbarten Entgelten versteuert (Soll-Versteuerung), braucht eine andere Grundlage — ' +
      'bitte klären, was für Ihren Betrieb gilt.',
  );

  return raus;
}

export function formatEuro(n: unknown): string {
  return z(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
