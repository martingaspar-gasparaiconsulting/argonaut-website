// ============================================================================
// tests/steuerExportP28.test.mjs
//
// PUNKT 28 (R2a) — Tests fuer lib/datevExtf.ts und lib/ustva.ts.
//
// Die vorhandenen Testdateien (datevExtf.test.mjs, ustva.test.mjs) sichern die
// REPARATUREN aus P15 und P17 ab. Diese Datei nimmt sich die Teile vor, die
// dabei nie angefasst wurden — Kopfzeile, Feldpositionen, Satzerkennung an den
// Raendern, Datumsgrenzen, Textfelder, und die Frage, was mit Steuer passiert,
// die zu keinem Regelsatz gehoert.
//
// Hoechste Schadenswirkung pro Fehler im ganzen System: was hier falsch
// rechnet, landet beim Finanzamt.
//
// Alle Befunde am 20.09.2026 am echten Code GEMESSEN.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extfBetrag, extfBelegdatum, satzAus, kontoFeld, buchungZeile, baueExtfKopf,
  baueExtf, buchungAusRechnung, buchungAusBeleg, extfDefaults,
  erloeskontoSteuerfrei, extfHinweise, EXTF_SPALTEN,
} from '../out/datevExtf.js';
import {
  baueUstva, satzVon, effektiverSatz, satzIstEindeutig, ustvaHinweise, formatEuro,
} from '../out/ustva.js';
import { csvFeld, formelVerdacht } from '../out/csvSchreiben.js';

// ---------------------------------------------------------------------------

const K = {
  beraterNr: '12345', mandantNr: '6789', wjBeginn: '20260101',
  sachkontenlaenge: 4, skr: '03',
  erloeskonto19: '8400', erloeskonto7: '8300',
  debitorSammel: '10000', kreditorSammel: '70000',
  bezeichnung: 'Test',
};

/**
 * Felder einer CSV-Zeile zaehlen — so, wie DATEV sie liest: ein Semikolon
 * INNERHALB von Anfuehrungszeichen trennt nicht.
 *
 * Der erste Entwurf dieses Tests splittete naiv an jedem Semikolon und
 * schlug bei einem Kundennamen wie "A;B" fehl — obwohl der Stapel voellig
 * in Ordnung war. Ein naiver Test haette hier Fehlalarm gegeben; mit dieser
 * Funktion prueft er dagegen genau das, worauf es ankommt.
 */
function felder(zeile) {
  const raus = [];
  let feld = '';
  let inQuotes = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') {
      if (inQuotes && zeile[i + 1] === '"') { feld += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ';' && !inQuotes) {
      raus.push(feld); feld = '';
    } else feld += c;
  }
  raus.push(feld);
  return raus;
}

// ===========================================================================
// TEIL 1 — datevExtf: der Betrag
// ===========================================================================

test('BEFUND: der Betrag rundet symmetrisch — Rechnung und Gutschrift gleich', () => {
  // GEMESSEN vor der Reparatur: 2,675 ergab "2,68", -2,675 ergab "2,67".
  // Math.abs() verdeckte den Fehler fast vollstaendig: er zeigt sich nur,
  // wenn Betrag x 100 exakt auf ,5 endet.
  for (const v of [2.675, 0.125, 8.615, 1234.565]) {
    assert.equal(extfBetrag(v), extfBetrag(-v), `Betrag ${v} rundet anders als -${v}`);
  }
  assert.equal(extfBetrag(2.675), '2,68');
  assert.equal(extfBetrag(-2.675), '2,68', 'vorher 2,67 — ein Cent Unterschied im Buchungsstapel');
});

test('der Betrag traegt nie ein Vorzeichen — DATEV liest Soll/Haben', () => {
  assert.equal(extfBetrag(-1190), '1190,00');
  assert.ok(!extfBetrag(-1190).includes('-'));
});

test('der Betrag hat immer genau zwei Nachkommastellen mit Komma', () => {
  assert.equal(extfBetrag(1000), '1000,00');
  assert.equal(extfBetrag(0), '0,00');
  assert.equal(extfBetrag('1.234,56'), '1234,56');
  assert.equal(extfBetrag(null), '0,00');
  assert.equal(extfBetrag('Unsinn'), '0,00');
});

// ===========================================================================
// TEIL 2 — datevExtf: das Belegdatum
// ===========================================================================

test('BEFUND: einen 31. Februar gibt es nicht', () => {
  assert.equal(extfBelegdatum('2026-02-31'), '', 'vorher "3102" — DATEV weist den Stapel ab');
  assert.equal(extfBelegdatum('2026-04-31'), '', 'April hat 30 Tage');
  assert.equal(extfBelegdatum('2026-06-31'), '');
  assert.equal(extfBelegdatum('2026-09-31'), '');
  assert.equal(extfBelegdatum('2026-11-31'), '');
});

test('Schaltjahre werden richtig erkannt', () => {
  assert.equal(extfBelegdatum('2024-02-29'), '2902', '2024 ist ein Schaltjahr');
  assert.equal(extfBelegdatum('2026-02-29'), '', '2026 ist keins');
  assert.equal(extfBelegdatum('2000-02-29'), '2902', 'durch 400 teilbar');
  assert.equal(extfBelegdatum('1900-02-29'), '', 'durch 100, aber nicht durch 400');
});

test('gueltige Monatsenden bleiben unangetastet', () => {
  assert.equal(extfBelegdatum('2026-01-31'), '3101');
  assert.equal(extfBelegdatum('2026-04-30'), '3004');
  assert.equal(extfBelegdatum('2026-12-31'), '3112');
  assert.equal(extfBelegdatum('2026-02-28'), '2802');
});

test('extfHinweise zaehlt ein unmoegliches Datum als fehlend', () => {
  const h = extfHinweise({
    rechnungen: [{ rechnungsdatum: '2026-02-31', netto_summe: 100, mwst_summe: 19, brutto_summe: 119 }],
    belege: [], konfig: K, aufwandFallback: '4980',
    datumVon: '20260201', datumBis: '20260228', erzeugtAm: '20260301120000000',
  });
  assert.ok(h.some((x) => /kein lesbares Belegdatum/.test(x)));
});

// ===========================================================================
// TEIL 3 — datevExtf: Kopfzeile und Feldpositionen
// ===========================================================================

test('die Kopfzeile hat genau 31 Felder', () => {
  const kopf = baueExtfKopf(K, '20260101', '20260131', '20260201120000000');
  assert.equal(kopf.split(';').length, 31);
});

test('die belegten Feldpositionen der Kopfzeile stehen fest', () => {
  // Diese Positionen sind die offene Frage an den Steuerberater (Punkt 14).
  // Der Test raet nichts — er haelt nur fest, WO sie heute stehen, damit
  // niemand sie unbemerkt verschiebt.
  const f = baueExtfKopf(K, '20260101', '20260131', '20260201120000000').split(';');
  assert.equal(f[0], '"EXTF"', 'Feld 1 Kennung');
  assert.equal(f[1], '700', 'Feld 2 Versionsnummer');
  assert.equal(f[2], '21', 'Feld 3 Formatkategorie Buchungsstapel');
  assert.equal(f[4], '13', 'Feld 5 Formatversion');
  assert.equal(f[5], '20260201120000000', 'Feld 6 erzeugt am');
  assert.equal(f[10], '12345', 'Feld 11 Beraternummer');
  assert.equal(f[11], '6789', 'Feld 12 Mandantennummer');
  assert.equal(f[12], '20260101', 'Feld 13 Wirtschaftsjahresbeginn');
  assert.equal(f[13], '4', 'Feld 14 Sachkontenlaenge');
  assert.equal(f[14], '20260101', 'Feld 15 Datum von');
  assert.equal(f[15], '20260131', 'Feld 16 Datum bis');
  assert.equal(f[18], '1', 'Feld 19 Buchungstyp Finanzbuchfuehrung');
  assert.equal(f[20], '0', 'Feld 21 Festschreibung aus');
  assert.equal(f[21], '"EUR"', 'Feld 22 Waehrungskennzeichen');
});

test('der Kontenrahmen steht bewusst NICHT in der Kopfzeile', () => {
  // Punkt 15: die Feldposition liess sich nicht zweifelsfrei bestimmen, und
  // ein Feld an der falschen Stelle bricht den ganzen Import. Der Hinweis
  // muss dafuer da sein — sonst merkt es niemand.
  const kopf = baueExtfKopf({ ...K, skr: '04' }, '20260101', '20260131', '20260201120000000');
  assert.ok(!kopf.includes('SKR'));
  const h = extfHinweise({
    rechnungen: [], belege: [], konfig: { ...K, skr: '04' }, aufwandFallback: '4980',
    datumVon: '20260101', datumBis: '20260131', erzeugtAm: '20260201120000000',
  });
  assert.ok(h.some((x) => /Kontenrahmen \(SKR 04\) steht NICHT/.test(x)));
});

test('eine fehlende Bezeichnung bricht die Kopfzeile nicht', () => {
  const kopf = baueExtfKopf({ ...K, bezeichnung: '' }, '20260101', '20260131', '20260201120000000');
  assert.equal(kopf.split(';').length, 31);
});

test('ein Semikolon in der Bezeichnung verschiebt die Kopfzeile nicht', () => {
  const kopf = baueExtfKopf({ ...K, bezeichnung: 'Januar;Februar' }, '20260101', '20260131', '20260201120000000');
  assert.equal(kopf.split(';').length, 32, 'gequotet — das Feld enthaelt das Semikolon, die Struktur bleibt');
  assert.ok(kopf.includes('"Januar;Februar"'));
});

// ===========================================================================
// TEIL 4 — datevExtf: Aufbau der Datei
// ===========================================================================

test('Spaltenzeile und Buchungszeile haben dieselbe Feldanzahl', () => {
  // Die eine Invariante, die den ganzen Stapel traegt: verschiebt sich eine
  // Spalte, bucht DATEV jede Zeile falsch.
  const b = buchungAusRechnung(
    { rechnungsnummer: 'RE-1', rechnungsdatum: '2026-01-15', empfaenger_name: 'Meier', netto_summe: 1000, mwst_summe: 190, brutto_summe: 1190 },
    K,
  );
  assert.equal(buchungZeile(b).split(';').length, EXTF_SPALTEN.length);
  assert.equal(EXTF_SPALTEN.length, 14);
});

test('eine leere Eingabe ergibt trotzdem eine gueltige Datei', () => {
  const t = baueExtf({
    rechnungen: [], belege: [], konfig: K, aufwandFallback: '4980',
    datumVon: '20260101', datumBis: '20260131', erzeugtAm: '20260201120000000',
  });
  const zeilen = t.replace(/^﻿/, '').trimEnd().split('\r\n');
  assert.equal(zeilen.length, 2, 'Kopf plus Spaltennamen');
  assert.ok(t.startsWith('﻿'), 'BOM, sonst zeigt Excel Umlaute falsch');
});

test('jede Buchungszeile einer echten Datei hat 14 Spalten', () => {
  const t = baueExtf({
    rechnungen: [
      { rechnungsnummer: 'RE-1', rechnungsdatum: '2026-01-15', empfaenger_name: 'A;B', netto_summe: 1000, mwst_summe: 190, brutto_summe: 1190 },
      { rechnungsnummer: 'RE-2', rechnungsdatum: '2026-01-20', empfaenger_name: 'C"D', netto_summe: -100, mwst_summe: -19, brutto_summe: -119 },
    ],
    belege: [
      { belegnummer: 'ER-1', belegdatum: '2026-01-18', lieferant: 'Shell', netto: 100, ust_betrag: 19, brutto: 119, datev_konto: '4530' },
    ],
    konfig: K, aufwandFallback: '4980',
    datumVon: '20260101', datumBis: '20260131', erzeugtAm: '20260201120000000',
  });
  const zeilen = t.replace(/^﻿/, '').trimEnd().split('\r\n');
  assert.equal(zeilen.length, 5);
  for (const z of zeilen.slice(1)) {
    assert.equal(felder(z).length, 14, 'Zeile verschoben: ' + z);
  }
  // Und die Gegenprobe zum Zaehler selbst: der Kundenname "A;B" steckt
  // wirklich in EINEM Feld und hat die Zeile nicht auseinandergerissen.
  assert.equal(felder(zeilen[2])[13], 'Rechnung A;B');
  assert.equal(felder(zeilen[3])[13], 'Rechnung C"D', 'verdoppelte Anfuehrungszeichen kommen wieder einfach heraus');
});

// ===========================================================================
// TEIL 5 — datevExtf: Satzerkennung an den Raendern
// ===========================================================================

test('die Satzerkennung trifft 19 und 7 auch mit Rundungsabweichung', () => {
  assert.equal(satzAus(1000, 190), 19);
  assert.equal(satzAus(1000, 189.99), 19);
  assert.equal(satzAus(1000, 70), 7);
  assert.equal(satzAus(1000, 70.4), 7);
});

test('ohne Steuerbetrag oder ohne Netto ist der Satz 0', () => {
  assert.equal(satzAus(1000, 0), 0);
  assert.equal(satzAus(0, 190), 0);
  assert.equal(satzAus(null, null), 0);
});

test('ein unrunder Satz wird auf den naeheren Regelsatz gezwungen — bewusst', () => {
  // Hier wird NICHT repariert: der EXTF-Stapel braucht einen BU-Schluessel,
  // und den gibt es nur fuer 7 und 19. Der Test haelt fest, WO die Grenze
  // liegt, damit sie niemanden ueberrascht.
  //
  // Die Grenze ist scharf und liegt bei genau 13,0 %: darunter 7, darueber 19.
  // Ausgerechnet 13 % ist der typische Mischsatz einer Rechnung mit 7- und
  // 19-%-Positionen. Fuer die UStVA faengt satzIstEindeutig() das ab und
  // meldet es; der DATEV-Stapel kann es nicht, weil jede Buchung genau EINEN
  // BU-Schluessel braucht. Deshalb steht es in extfHinweise NICHT — sondern
  // faellt beim Steuerberater auf, der den Beleg sieht.
  assert.equal(satzAus(1000, 130), 7, 'exakt 13 Prozent gilt noch als 7');
  assert.equal(satzAus(1000, 131), 19, 'knapp darueber als 19');
  assert.equal(satzAus(1000, 129), 7);
});

// ===========================================================================
// TEIL 6 — datevExtf: Kontofeld und Textfelder
// ===========================================================================

test('fuehrende Nullen in einer Kontonummer bleiben erhalten', () => {
  assert.equal(kontoFeld('08400'), '08400');
  assert.equal(kontoFeld('8400'), '8400');
});

test('ein unbrauchbares Konto faellt auf den Ersatzwert zurueck, sonst leer', () => {
  assert.equal(kontoFeld('', '4980'), '4980');
  assert.equal(kontoFeld('Aufwand', '4980'), '4980');
  assert.equal(kontoFeld(null, ''), '');
  assert.equal(kontoFeld('4530;4540'), '45304540', 'Ziffern bleiben, das Semikolon nicht');
});

test('ein Zeilenumbruch im Buchungstext bricht die Datei nicht', () => {
  const b = buchungAusBeleg(
    { belegnummer: 'ER-1', belegdatum: '2026-01-18', lieferant: 'Muster\nGmbH', netto: 100, ust_betrag: 19, brutto: 119 },
    K, '4980',
  );
  const zeile = buchungZeile(b);
  assert.ok(!zeile.includes('\n'), 'ein Umbruch wuerde eine zweite, kaputte Zeile erzeugen');
  assert.equal(zeile.split(';').length, 14);
});

test('sehr lange Texte werden gekuerzt, nicht abgeschnitten mitten im Feld', () => {
  const lang = 'X'.repeat(200);
  const b = buchungAusRechnung(
    { rechnungsnummer: lang, rechnungsdatum: '2026-01-15', empfaenger_name: lang, netto_summe: 100, mwst_summe: 19, brutto_summe: 119 },
    K,
  );
  const f = buchungZeile(b).split(';');
  assert.ok(f[10].length <= 38, 'Belegfeld 1 hoechstens 36 Zeichen plus Anfuehrungszeichen');
  assert.ok(f[13].length <= 62, 'Buchungstext hoechstens 60 Zeichen plus Anfuehrungszeichen');
});

test('WAECHTER: der DATEV-Stapel bekommt bewusst KEINEN CSV-Formelschutz', () => {
  // lib/csvSchreiben.ts nimmt datevExtf im eigenen Dateikopf ausdruecklich
  // aus: ein vorangestelltes Apostroph braeche den DATEV-Import. Wer das
  // aendert, faellt hier auf.
  assert.equal(formelVerdacht('=HYPERLINK("x")'), true, 'csvSchreiben erkennt die Formel sehr wohl');
  // csvFeld setzt das Apostroph voran und quotet DANACH, weil der Text
  // Anfuehrungszeichen enthaelt — das Ergebnis beginnt also mit " und
  // traegt das Apostroph im Feld.
  assert.ok(csvFeld('=HYPERLINK("x")').includes("'="), 'und schuetzt sie dort auch');
  assert.equal(csvFeld('=1+1')[0], "'", 'ohne Anfuehrungszeichen steht das Apostroph ganz vorn');

  const b = buchungAusBeleg(
    { belegnummer: 'ER-1', belegdatum: '2026-01-18', lieferant: '=HYPERLINK("http://x")', netto: 100, ust_betrag: 19, brutto: 119 },
    K, '4980',
  );
  const zeile = buchungZeile(b);
  assert.ok(!zeile.includes("'="), 'im DATEV-Stapel darf KEIN Apostroph davor stehen');
  assert.equal(zeile.split(';').length, 14);
});

test('das steuerfreie Erloeskonto kommt aus der Konfig, sonst aus dem Rahmen', () => {
  assert.equal(erloeskontoSteuerfrei(K), '8200');
  assert.equal(erloeskontoSteuerfrei({ ...K, skr: '04' }), '4200');
  assert.equal(erloeskontoSteuerfrei({ ...K, erloeskonto0: '8125' }), '8125');
  assert.equal(erloeskontoSteuerfrei({ ...K, erloeskonto0: '   ' }), '8200', 'leer heisst Standard');
  assert.equal(extfDefaults('03').erloeskonto0, '8200');
  assert.equal(extfDefaults('04').erloeskonto0, '4200');
});

// ===========================================================================
// TEIL 7 — ustva: DER BEFUND — ausgewiesene Steuer verschwand
// ===========================================================================

test('BEFUND: eine ausgewiesene Steuer verschwindet nicht mehr aus der Zahllast', () => {
  // GEMESSEN vor der Reparatur: 1.000 EUR netto mit 30 EUR Umsatzsteuer
  // (3 %) ergaben umsatz0 = 1000 und ZAHLLAST = 0. Dem Finanzamt wurden
  // 0 statt 30 EUR gemeldet. Zu wenig melden ist die gefaehrliche Richtung.
  const e = baueUstva([{ netto_summe: 1000, mwst_summe: 30 }], 0);
  assert.equal(e.zahllast, 30, 'vorher 0 — 30 EUR fielen ersatzlos weg');
  assert.equal(e.ustUnzugeordnet, 30);
  assert.equal(e.uneindeutig, 1);
});

test('BEFUND: die unzugeordnete Steuer steht sichtbar in der Aufstellung', () => {
  const e = baueUstva([{ netto_summe: 1000, mwst_summe: 30 }], 0);
  const zeile = e.kennziffern.find((k) => /ohne eindeutigen Steuersatz/.test(k.label));
  assert.ok(zeile, 'sonst steckt der Betrag unerklaert in Kennziffer 83');
  assert.equal(zeile.wert, 30);
  const i83 = e.kennziffern.findIndex((k) => k.kz === '83');
  const iUn = e.kennziffern.indexOf(zeile);
  assert.ok(iUn < i83, 'die Erklaerung steht vor der Kennziffer 83');
});

test('BEFUND: eine gemischte Rechnung wird gemeldet, nicht stillschweigend zugeordnet', () => {
  // 7 % Speisen und 19 % Getraenke auf einem Beleg: effektiv 13 %.
  const e = baueUstva([{ netto_summe: 1000, mwst_summe: 130 }], 0);
  assert.equal(e.uneindeutig, 1);
  assert.equal(e.zahllast, 130, 'die Steuer selbst stimmt weiterhin');
  const h = ustvaHinweise(e);
  assert.ok(h.some((x) => /gemischten/.test(x)));
  assert.ok(h.some((x) => /NICHT/.test(x)), 'es muss dastehen, dass nicht geraten wird');
});

test('saubere Rechnungen gelten nicht als uneindeutig', () => {
  const e = baueUstva(
    [
      { netto_summe: 1000, mwst_summe: 190 },
      { netto_summe: 500, mwst_summe: 35 },
      { netto_summe: 300, mwst_summe: 0 },
    ],
    0,
  );
  assert.equal(e.uneindeutig, 0);
  assert.equal(e.ustUnzugeordnet, 0);
  assert.ok(!ustvaHinweise(e).some((x) => /gemischten/.test(x)));
});

test('gewoehnliche Rundung loest keinen Fehlalarm aus', () => {
  // Eine 19-%-Rechnung trifft wegen der Positionsrundung fast nie exakt 19,00 %.
  const e = baueUstva([{ netto_summe: 1000, mwst_summe: 189.5 }], 0);
  assert.equal(e.uneindeutig, 0, 'ein halber Prozentpunkt ist Rundung, kein anderer Sachverhalt');
});

test('satzIstEindeutig und effektiverSatz rechnen nachvollziehbar', () => {
  assert.equal(effektiverSatz(1000, 190), 19);
  assert.equal(effektiverSatz(1000, 130), 13);
  assert.equal(effektiverSatz(0, 100), null);
  assert.equal(satzIstEindeutig(1000, 190), true);
  assert.equal(satzIstEindeutig(1000, 130), false);
  assert.equal(satzIstEindeutig(1000, 0), true);
  assert.equal(satzIstEindeutig(0, 0), true, 'ohne Netto gibt es nichts zu beanstanden');
});

test('eine Gutschrift mit unrundem Satz mindert die Zahllast', () => {
  const e = baueUstva([{ netto_summe: -1000, mwst_summe: -30 }], 0);
  assert.equal(e.zahllast, -30);
  assert.equal(e.gutschriften, 1);
});

// ===========================================================================
// TEIL 8 — ustva: Grundrechnung und Raender
// ===========================================================================

test('der Regelfall bleibt Cent-genau wie bisher', () => {
  const e = baueUstva(
    [
      { netto_summe: 10000, mwst_summe: 1900 },
      { netto_summe: 1000, mwst_summe: 70 },
    ],
    500,
  );
  assert.equal(e.umsatz19, 10000);
  assert.equal(e.ust19, 1900);
  assert.equal(e.umsatz7, 1000);
  assert.equal(e.ust7, 70);
  assert.equal(e.zahllast, 1470);
});

test('die Bemessungsgrundlage steht in vollen Euro, in Richtung Null', () => {
  const e = baueUstva([{ netto_summe: 1000.99, mwst_summe: 190.19 }], 0);
  assert.equal(e.kennziffern.find((k) => k.kz === '81').wert, 1000);
  const g = baueUstva([{ netto_summe: -1000.5, mwst_summe: -190.1 }], 0);
  assert.equal(g.kennziffern.find((k) => k.kz === '81').wert, -1000, 'nicht -1001');
});

test('eine Erstattung traegt ihr Minus bis in Kennziffer 83', () => {
  const e = baueUstva([{ netto_summe: 1000, mwst_summe: 190 }], 900);
  assert.equal(e.zahllast, -710);
  const kz83 = e.kennziffern.find((k) => k.kz === '83');
  assert.equal(kz83.wert, -710);
  assert.match(kz83.label, /Minus/);
});

test('leere und unbrauchbare Eingaben stuerzen nicht ab', () => {
  const e = baueUstva([], 0);
  assert.equal(e.zahllast, 0);
  assert.equal(e.uneindeutig, 0);
  const u = baueUstva([{ netto_summe: 'Unsinn', mwst_summe: null }], 'auch Unsinn');
  assert.equal(u.zahllast, 0);
  assert.equal(satzVon(null, null), 0);
});

test('deutsche Zahltexte werden gelesen, nicht zu 0 gemacht', () => {
  const e = baueUstva([{ netto_summe: '1.234,56', mwst_summe: '234,57' }], '100,00');
  assert.equal(e.umsatz19, 1234.56);
  assert.equal(e.zahllast, 134.57);
});

test('der Hinweis auf die Ist-Versteuerung steht immer da', () => {
  assert.ok(ustvaHinweise(baueUstva([], 0)).some((x) => /Ist-Versteuerung/.test(x)));
});

test('formatEuro bleibt formgleich', () => {
  assert.match(formatEuro(1234.5), /1\.234,50/);
  assert.match(formatEuro(-710), /-710,00/);
});
