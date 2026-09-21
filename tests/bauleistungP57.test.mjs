// ============================================================================
// tests/bauleistungP57.test.mjs
//
// PUNKT 57 / R7 — § 13b UStG und § 48 EStG, Paket 1 (21.09.2026)
//
// ▄▄▄ DER BEFUND ▄▄▄
// Gesucht wurde nach "13b", "reverse charge", "bauabzug", "48b",
// "Freistellungsbescheinigung", "Steuerschuldnerschaft": KEIN TREFFER.
// lib/ustva.ts kennt genau vier Kennziffern (81, 86, 66, 83).
// Fuer einen Subunternehmer am Bau ist fast JEDE Ausgangsrechnung ein
// 13b-Fall — die Software konnte davon bisher keine einzige abbilden.
//
// ▄▄▄ DIE DREI FEHLER, DIE DIESE DATEI VERHINDERN SOLL ▄▄▄
//  1. Bei § 13b trotzdem Umsatzsteuer ausweisen. Wer das tut, schuldet sie
//     nach § 14c Abs. 1 UStG ZUSAETZLICH — der Kunde meldet sie ebenfalls
//     an, und dieselbe Steuer wird zweimal gezahlt.
//  2. Die Bagatellgrenze des § 48 EStG als FREIBETRAG behandeln. Sie ist
//     eine FREIGRENZE: wird sie ueberschritten, wird von der GANZEN
//     Gegenleistung einbehalten, nicht nur vom uebersteigenden Teil.
//  3. Aus fehlenden Angaben ein "gilt nicht" machen. Wer nichts weiss, hat
//     nicht geprueft — das ist ein Unterschied, und er steht im Ergebnis.
//
// NOCH RUFT DIE DATEI NIEMAND AUF.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pruefeReverseCharge, summen13b, ustvaZeilen13b, datevSchluessel13b,
  bauabzugsteuer, anmeldefristBauabzug, pruefeBauleistung,
  HINWEIS_13B, BAUABZUG_SATZ, BAUABZUG_FREIGRENZE, BAUABZUG_FREIGRENZE_VERMIETUNG,
  KZ_LEISTENDER_13B, KZ_EMPFAENGER_BASIS, KZ_EMPFAENGER_STEUER,
  BU_13B_MIT_VORSTEUER, BU_13B_OHNE_VORSTEUER,
} from '../out/bauleistung.js';

const BAUFALL = { istBauleistung: true, kundeIstUnternehmer: true, kundeIstBauleistender: true, nachweisUst1tg: true };

// ===========================================================================
// TEIL 1 — § 13b: WANN, UND WAS DANN AUF DER RECHNUNG STEHT
// ===========================================================================

test('Bauleistung an einen Bauleistenden: der Kunde schuldet die Steuer', () => {
  const r = pruefeReverseCharge(BAUFALL);
  assert.equal(r.gilt, true);
  assert.equal(r.grund, 'gilt');
  assert.equal(r.nachweisFehlt, false);
});

test('jede der drei Voraussetzungen kippt den Fall — mit eigenem Grund', () => {
  assert.equal(pruefeReverseCharge({ ...BAUFALL, istBauleistung: false }).grund, 'keine-bauleistung');
  assert.equal(pruefeReverseCharge({ ...BAUFALL, kundeIstUnternehmer: false }).grund, 'kunde-kein-unternehmer');
  assert.equal(pruefeReverseCharge({ ...BAUFALL, kundeIstBauleistender: false }).grund, 'kunde-kein-bauleistender');
  for (const g of ['keine-bauleistung', 'kunde-kein-unternehmer', 'kunde-kein-bauleistender']) {
    assert.ok(g.length > 0);
  }
});

test('FEHLENDE ANGABEN sind kein "gilt nicht"', () => {
  // Der wichtigste Unterschied: im einen Fall muss jemand nachsehen, im
  // anderen ist alles geklaert. Ein "false" fuer beides verschleiert das.
  const r = pruefeReverseCharge({ istBauleistung: true });
  assert.equal(r.gilt, false);
  assert.equal(r.grund, 'angaben-fehlen');
  assert.ok(r.klartext.includes('fehlen Angaben'));
});

test('bei § 13b steht KEINE Umsatzsteuer auf der Rechnung', () => {
  const s = summen13b(10000, 19);
  assert.equal(s.betrag, 10000);
  assert.equal(s.ausgewieseneSteuer, 0, 'der Kern der Vorschrift');
  assert.equal(s.steuerDesKunden, 1900, 'die Zahl, die der KUNDE anmeldet — sie steht nicht auf der Rechnung');
  assert.equal(s.hinweis, HINWEIS_13B);
  assert.ok(HINWEIS_13B.includes('13b'), 'Pflichtangabe nach § 14a Abs. 5 UStG');
});

test('ein Steuerausweis trotz § 13b wird angemahnt (§ 14c Abs. 1 UStG)', () => {
  const h = pruefeBauleistung(BAUFALL, undefined, 1900);
  const s = h.find((x) => x.feld === 'steuerausweis');
  assert.ok(s, 'sonst wird dieselbe Steuer zweimal gezahlt');
  assert.ok(s.text.includes('14c'));
  assert.equal(pruefeBauleistung(BAUFALL, undefined, 0).some((x) => x.feld === 'steuerausweis'), false);
});

test('der fehlende Nachweis USt 1 TG wird angemahnt', () => {
  const h = pruefeBauleistung({ ...BAUFALL, nachweisUst1tg: false });
  assert.ok(h.some((x) => x.feld === 'nachweis'));
  assert.equal(pruefeBauleistung(BAUFALL).some((x) => x.feld === 'nachweis'), false);
});

test('deutsche Schreibweise wird gelesen', () => {
  assert.equal(summen13b('10.000,00', '19').steuerDesKunden, 1900);
});

// ===========================================================================
// TEIL 2 — DIE VORANMELDUNG AUS BEIDEN BLICKWINKELN
// ===========================================================================

test('der Leistende meldet nur die Grundlage, der Empfaenger auch die Steuer', () => {
  const l = ustvaZeilen13b(10000, 19, 'leistender');
  assert.equal(l.length, 1);
  assert.equal(l[0].kz, KZ_LEISTENDER_13B);
  assert.equal(l[0].wert, 10000);

  const e = ustvaZeilen13b(10000, 19, 'empfaenger');
  assert.equal(e.length, 2);
  assert.equal(e[0].kz, KZ_EMPFAENGER_BASIS);
  assert.equal(e[0].wert, 10000);
  assert.equal(e[1].kz, KZ_EMPFAENGER_STEUER);
  assert.equal(e[1].wert, 1900);
});

test('die Kennziffern und BU-Schluessel stehen an EINER Stelle', () => {
  // Sie aendern sich mit den Formularen und gehoeren vor dem ersten echten
  // Export vom Steuerberater bestaetigt. Deshalb benannte Konstanten.
  assert.equal(KZ_LEISTENDER_13B, '60');
  assert.equal(KZ_EMPFAENGER_BASIS, '46');
  assert.equal(KZ_EMPFAENGER_STEUER, '47');
  assert.equal(datevSchluessel13b(true), BU_13B_MIT_VORSTEUER);
  assert.equal(datevSchluessel13b(false), BU_13B_OHNE_VORSTEUER);
  assert.equal(BU_13B_MIT_VORSTEUER, '94');
  assert.equal(BU_13B_OHNE_VORSTEUER, '95');
});

// ===========================================================================
// TEIL 3 — § 48 EStG: DIE FREIGRENZE IST KEIN FREIBETRAG
// ===========================================================================

test('DER FALLSTRICK: bei Ueberschreiten wird von der GANZEN Gegenleistung einbehalten', () => {
  // 4.900 vorher, 200 jetzt. Ein Freibetrag waere 15 % von 100 = 15 EUR.
  // Richtig sind 15 % von 200 = 30 EUR — plus Nachmeldung fuer die vorigen.
  const b = bauabzugsteuer(200, { jahressummeBisher: 4900 });
  assert.equal(b.gilt, true);
  assert.equal(b.jahressumme, 5100);
  assert.equal(b.abzug, 30, 'nicht 15 — die Freigrenze ist kein Freibetrag');
  assert.equal(b.auszahlung, 170);
  assert.ok(b.klartext.includes('GESAMTEN'));
});

test('genau auf der Grenze wird noch nicht einbehalten', () => {
  const b = bauabzugsteuer(100, { jahressummeBisher: 4900 });
  assert.equal(b.jahressumme, 5000);
  assert.equal(b.gilt, false, 'die Grenze selbst ist noch frei');
  assert.equal(b.abzug, 0);

  const drueber = bauabzugsteuer(100.01, { jahressummeBisher: 4900 });
  assert.equal(drueber.gilt, true, 'ein Cent darueber kippt es');
});

test('unter der Grenze wird gewarnt, dass es rueckwirkend kippen kann', () => {
  const b = bauabzugsteuer(200, { jahressummeBisher: 4000 });
  assert.equal(b.gilt, false);
  assert.equal(b.grund, 'unter-freigrenze');
  assert.ok(b.klartext.includes('rueckwirkend'));
});

test('eine gueltige Freistellungsbescheinigung setzt den Abzug ganz aus', () => {
  const b = bauabzugsteuer(50000, { freistellungGueltig: true, jahressummeBisher: 100000 });
  assert.equal(b.gilt, false);
  assert.equal(b.grund, 'freistellung');
  assert.equal(b.abzug, 0);
  assert.equal(b.auszahlung, 50000);
  assert.ok(b.klartext.includes('48b'));
});

test('bei reiner Vermietung gilt die erhoehte Grenze', () => {
  assert.equal(BAUABZUG_FREIGRENZE, 5000);
  assert.equal(BAUABZUG_FREIGRENZE_VERMIETUNG, 15000);
  const normal = bauabzugsteuer(1000, { jahressummeBisher: 9000 });
  assert.equal(normal.gilt, true);
  const vermietung = bauabzugsteuer(1000, { jahressummeBisher: 9000, nurVermietung: true });
  assert.equal(vermietung.gilt, false);
  assert.equal(vermietung.freigrenze, 15000);
});

test('der Satz sind 15 %, und die Rechnung geht auf', () => {
  assert.equal(BAUABZUG_SATZ, 15);
  const b = bauabzugsteuer(11900, { jahressummeBisher: 10000 });
  assert.equal(b.abzug, 1785);
  assert.equal(b.auszahlung, 10115);
  assert.equal(b.abzug + b.auszahlung, 11900);
});

test('ein krummer Betrag rundet symmetrisch um Null', () => {
  // Der Grenzfall: 1,10 mal 15 % ergibt genau 0,165. Bei einer Gutschrift
  // schreibt Math.round dafuer -0,16 — einen Cent zu wenig. Der Wert wurde
  // gesucht, nicht geschaetzt: die naechsten sind 1,30 / 1,50 / 1,70.
  const b = bauabzugsteuer(-1.1, { jahressummeBisher: 999999 });
  assert.equal(b.abzug, -0.17, 'Math.round allein haette -0.16 ergeben');

  const c = bauabzugsteuer(-1.7, { jahressummeBisher: 999999 });
  assert.equal(c.abzug, -0.26, 'Math.round allein haette -0.25 ergeben');
});

// ===========================================================================
// TEIL 4 — DIE ANMELDEFRIST
// ===========================================================================

test('angemeldet wird bis zum 10. des Folgemonats der ZAHLUNG', () => {
  const f = anmeldefristBauabzug('2026-09-21');
  assert.equal(f.frist.toISOString().slice(0, 10), '2026-10-10');
});

test('faellt der 10. auf ein Wochenende, wird darauf hingewiesen', () => {
  // Der 10.10.2026 ist ein Samstag. § 108 Abs. 3 AO verschiebt dann auf den
  // naechsten Werktag - die Feiertage haengen aber am Bundesland, und das
  // gehoert in dasselbe Paket wie die Anbindung, nicht halb hier hinein.
  const samstag = anmeldefristBauabzug('2026-09-21');
  assert.equal(samstag.frist.getUTCDay(), 6);
  assert.equal(samstag.moeglicheVerschiebung, true);

  // Der 10.12.2026 ist ein Donnerstag.
  const werktag = anmeldefristBauabzug('2026-11-15');
  assert.equal(werktag.frist.toISOString().slice(0, 10), '2026-12-10');
  assert.equal(werktag.moeglicheVerschiebung, false);
});

test('der Jahreswechsel stimmt', () => {
  assert.equal(anmeldefristBauabzug('2026-12-31').frist.toISOString().slice(0, 10), '2027-01-10');
});

test('ohne lesbares Datum gibt es keine Frist — nie eine erfundene', () => {
  assert.equal(anmeldefristBauabzug('kaputt'), null);
  assert.equal(anmeldefristBauabzug(''), null);
  assert.equal(anmeldefristBauabzug(null), null);
});

test('die Frist haengt nicht von der Zeitzone ab', () => {
  assert.equal(anmeldefristBauabzug('2026-09-01T00:00:00.000Z').frist.toISOString().slice(0, 10), '2026-10-10');
});

// ===========================================================================
// TEIL 5 — DIE UNTERLAGEN-HINWEISE
// ===========================================================================

test('ohne Freistellungsbescheinigung kommt der Hinweis, mit ihr nicht', () => {
  assert.ok(pruefeBauleistung(BAUFALL, { jahressummeBisher: 0 }).some((x) => x.feld === 'freistellung'));
  assert.equal(pruefeBauleistung(BAUFALL, { freistellungGueltig: true }).some((x) => x.feld === 'freistellung'), false);
});

test('bei Annaeherung an die Freigrenze wird vorgewarnt', () => {
  const nah = pruefeBauleistung(BAUFALL, { jahressummeBisher: 4500 });
  assert.ok(nah.some((x) => x.feld === 'freigrenze'), '90 % der Grenze erreicht');
  const weit = pruefeBauleistung(BAUFALL, { jahressummeBisher: 1000 });
  assert.equal(weit.some((x) => x.feld === 'freigrenze'), false);
});
