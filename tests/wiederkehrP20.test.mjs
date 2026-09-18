import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wartungPositionen, mwstSatzOderStandard, istDatum, datumPlusMonate,
  naechsteFaelligkeitAb, darfAbrechnen, darfAboAbrechnen,
  intervallZuMonate, intervallMonateOderNull, intervallUnbekannt,
  normalisiereAbo, normalisiereWartung, mrr, positionenNetto, wiederkehrHinweise,
} from '../out/wiederkehr.js';

// ===========================================================================
// PUNKT 20 — Wiederkehrende Rechnungen repariert (18.09.2026)
//
// Alle Befunde vorher am echten Code gemessen:
//   1. mwst_satz = null ergab 0 % statt 19 % — 190 EUR je 1.000 EUR fehlten
//   2. "halbjaehrlich" ergab 1 Monat — sechsmal zu oft abgerechnet
//   3. Positionspreis als Text ("1.234,56") ergab 0 im MRR
//   4. Die Route springt mit setMonth()+toISOString(): 31.01. -> 02.03.,
//      und jeder Sprung verliert einen Tag (15. -> 14. -> 13. ...);
//      ein drei Monate ueberfaelliges Abo ergab bei vier Klicks vier Rechnungen
// ===========================================================================

// ── 1) Der Steuersatz ──────────────────────────────────────────────────────

test('Ein Vertrag ohne hinterlegten Steuersatz bekommt 19 %, nicht 0 %', () => {
  const p = wartungPositionen({ titel: 'Heizung', betrag_netto: 1000, mwst_satz: null });
  assert.equal(p[0].mwst_satz, 19, 'Number(null) ist 0 — genau daran gingen 190 EUR verloren');
  assert.equal(wartungPositionen({ titel: 'X', betrag_netto: 1000 })[0].mwst_satz, 19);
  assert.equal(wartungPositionen({ titel: 'X', betrag_netto: 1000, mwst_satz: '' })[0].mwst_satz, 19);
});

test('Ein ausdrueckliches 0 bleibt 0 — steuerfreie Leistungen gibt es wirklich', () => {
  assert.equal(wartungPositionen({ titel: 'X', betrag_netto: 1000, mwst_satz: 0 })[0].mwst_satz, 0);
  assert.equal(mwstSatzOderStandard(0), 0);
  assert.equal(mwstSatzOderStandard('0'), 0);
});

test('Gueltige Saetze kommen unveraendert durch, Unsinn wird zum Standard', () => {
  assert.equal(mwstSatzOderStandard(7), 7);
  assert.equal(mwstSatzOderStandard('7,5'), 7.5);
  assert.equal(mwstSatzOderStandard('neunzehn'), 19);
  assert.equal(mwstSatzOderStandard(-5), 19, 'ein negativer Steuersatz ist kein Satz');
});

test('Der Betrag darf auch als deutscher Text kommen', () => {
  const p = wartungPositionen({ titel: 'X', betrag_netto: '1.234,56', mwst_satz: 19 });
  assert.equal(p[0].einzelpreis, 1234.56, 'Number("1.234,56") waere NaN und damit 0 gewesen');
});

// ── 2) Die Intervalle ──────────────────────────────────────────────────────

test('Halbjaehrlich heisst sechs Monate, nicht einen', () => {
  assert.equal(intervallZuMonate('halbjaehrlich'), 6);
  assert.equal(intervallZuMonate('halbjährlich'), 6);
  assert.equal(intervallZuMonate('Halb-Jahr'), 6);
  assert.equal(intervallZuMonate('alle 6 Monate'), 6);
});

test('Die bekannten Schreibweisen bleiben, was sie waren', () => {
  assert.equal(intervallZuMonate('monat'), 1);
  assert.equal(intervallZuMonate('monatlich'), 1);
  assert.equal(intervallZuMonate('quartal'), 3);
  assert.equal(intervallZuMonate('vierteljährlich'), 3);
  assert.equal(intervallZuMonate('jahr'), 12);
  assert.equal(intervallZuMonate('jährlich'), 12);
  assert.equal(intervallZuMonate('einmalig'), 0);
  assert.equal(intervallZuMonate('zweijaehrlich'), 24);
  assert.equal(intervallZuMonate('3'), 3, 'eine reine Zahl sind Monate');
});

test('Unbekannter Text wird weiterhin monatlich gerechnet, aber gemeldet', () => {
  assert.equal(intervallZuMonate('alle 5 Wochen'), 1, 'kein Aufrufer bekommt ploetzlich 0');
  assert.equal(intervallMonateOderNull('alle 5 Wochen'), null);
  assert.equal(intervallUnbekannt('alle 5 Wochen'), true);
  assert.equal(intervallUnbekannt('halbjaehrlich'), false);
  assert.equal(intervallUnbekannt('einmalig'), false, 'einmalig ist bekannt und heisst 0');
});

// ── 3) Die Beträge ─────────────────────────────────────────────────────────

test('Ein Abo-Positionspreis als Text faellt nicht mehr aus dem MRR', () => {
  const e = normalisiereAbo({ id: '1', titel: 'Retainer', intervall: 'monat', positionen: [{ menge: 1, einzelpreis: '1.234,56' }] });
  assert.equal(e.betragNetto, 1234.56, 'vorher NaN -> 0');
  assert.equal(e.monatswert, 1234.56);
  assert.equal(mrr([e]), 1234.56);
});

test('Fehlende Menge heisst eins, eine ausdrueckliche 0 bleibt 0', () => {
  assert.equal(normalisiereAbo({ id: '1', positionen: [{ einzelpreis: 100 }] }).betragNetto, 100);
  assert.equal(normalisiereAbo({ id: '1', positionen: [{ menge: 0, einzelpreis: 100 }] }).betragNetto, 0);
});

test('Ein halbjaehrliches Abo zaehlt im MRR mit einem Sechstel', () => {
  const e = normalisiereAbo({ id: '1', intervall: 'halbjaehrlich', positionen: [{ menge: 1, einzelpreis: 600 }] });
  assert.equal(e.intervallMonate, 6);
  assert.equal(e.monatswert, 100, 'vorher galt es als monatlich und stand mit 600 im MRR');
});

test('positionenNetto liest deutsche Betragstexte', () => {
  assert.equal(positionenNetto([{ bezeichnung: 'x', menge: '2', einheit: 'St', einzelpreis: '1.000,50', mwst_satz: 19 }]), 2001);
});

// ── 4) Die naechste Faelligkeit ────────────────────────────────────────────

test('Monatsende: aus dem 31.01. wird der 28.02., nicht der 02.03.', () => {
  assert.equal(naechsteFaelligkeitAb('2026-01-31', 1, '2026-02-01'), '2026-02-28');
  assert.equal(datumPlusMonate('2026-01-31', 1), '2026-02-28');
});

test('Kein Tagesverlust: der 15. bleibt der 15.', () => {
  // Der alte Weg (setMonth + toISOString) machte daraus den 14., beim
  // naechsten Lauf den 13. — nach einem Jahr zwoelf Tage zu frueh.
  let d = '2026-04-15';
  for (let i = 0; i < 12; i++) d = naechsteFaelligkeitAb(d, 1, d);
  assert.equal(d, '2027-04-15');
});

test('Ein drei Monate ueberfaelliges Abo springt in EINEM Zug in die Zukunft', () => {
  const n = naechsteFaelligkeitAb('2026-06-15', 1, '2026-09-18');
  assert.equal(n, '2026-10-15');
  assert.ok(n > '2026-09-18', 'danach ist nichts mehr faellig — kein zweiter Lauf am selben Tag');
});

test('Das Ergebnis liegt immer STRIKT nach heute, auch wenn heute der Termin ist', () => {
  assert.equal(naechsteFaelligkeitAb('2026-09-18', 1, '2026-09-18'), '2026-10-18');
});

test('Einmalig und Unsinn ergeben keine naechste Faelligkeit', () => {
  assert.equal(naechsteFaelligkeitAb('2026-06-15', 0, '2026-09-18'), null);
  assert.equal(naechsteFaelligkeitAb('kaputt', 1, '2026-09-18'), null);
  assert.equal(naechsteFaelligkeitAb('2026-06-15', 1, 'kaputt'), null);
  assert.equal(naechsteFaelligkeitAb('2026-13-45', 1, '2026-09-18'), null, 'Monat 13 gibt es nicht');
});

test('istDatum erkennt nur saubere YYYY-MM-DD', () => {
  assert.equal(istDatum('2026-09-18'), true);
  assert.equal(istDatum('2026-09-18T10:00:00Z'), true, 'der Datumsteil zaehlt');
  assert.equal(istDatum('18.09.2026'), false);
  assert.equal(istDatum(''), false);
  assert.equal(istDatum(null), false);
});

// ── 5) Der Doppelschutz für Abos ───────────────────────────────────────────

test('Ein heute schon abgerechnetes Abo kommt nicht noch einmal dran', () => {
  const a = { aktiv: true, naechste_faellig: '2026-06-15', zuletzt_erzeugt: '2026-09-18' };
  const p = darfAboAbrechnen(a, '2026-09-18');
  assert.equal(p.darf, false);
  assert.ok(p.grund.includes('Heute bereits'));
});

test('Ein faelliges Abo darf, ein zukuenftiges nicht', () => {
  assert.equal(darfAboAbrechnen({ aktiv: true, naechste_faellig: '2026-09-18' }, '2026-09-18').darf, true);
  assert.equal(darfAboAbrechnen({ aktiv: true, naechste_faellig: '2026-09-19' }, '2026-09-18').darf, false);
  assert.equal(darfAboAbrechnen({ aktiv: false, naechste_faellig: '2026-01-01' }, '2026-09-18').darf, false);
  assert.equal(darfAboAbrechnen({ aktiv: true }, '2026-09-18').darf, false, 'ohne Faelligkeit wird nicht geraten');
});

test('Der Wartungs-Doppelschutz bleibt, sagt aber bei Unsinn was los ist', () => {
  assert.equal(darfAbrechnen({ betrag_netto: 100, letzte_abrechnung_am: '2026-09-01', intervall_monate: 12 }, '2026-09-18').darf, false);
  assert.equal(darfAbrechnen({ betrag_netto: 100, letzte_abrechnung_am: '2025-09-01', intervall_monate: 12 }, '2026-09-18').darf, true);
  assert.equal(darfAbrechnen({ betrag_netto: 100 }, '2026-09-18').darf, true);
  const kaputt = darfAbrechnen({ betrag_netto: 100, letzte_abrechnung_am: 'kaputt', intervall_monate: 12 }, '2026-09-18');
  assert.equal(kaputt.darf, false);
  assert.ok(kaputt.grund.includes('nicht lesbar'), kaputt.grund);
});

test('Ein Wartungsvertrag mit Betrag als Text bleibt abrechenbar', () => {
  const v = { betrag_netto: '1.200,00', intervall_monate: '12', letzte_abrechnung_am: '2025-01-01' };
  assert.equal(darfAbrechnen(v, '2026-09-18').darf, true);
  assert.equal(normalisiereWartung({ id: '1', betrag_netto: '1.200,00', intervall_monate: 12 }).monatswert, 100);
});

// ── 6) Hinweise ────────────────────────────────────────────────────────────

test('wiederkehrHinweise nennt im Klartext, was geraten oder ausgelassen wird', () => {
  const h = wiederkehrHinweise([
    { titel: 'Sonderturnus', intervall: 'alle 5 Wochen' },
    { titel: 'Heizung', mwst_satz: null },
    { titel: 'Retainer', zuletzt_erzeugt: '2026-09-18' },
    { titel: 'Alt', naechste_faellig: '2026-06-15' },
  ], '2026-09-18').join(' | ');
  assert.ok(h.includes('unbekanntem Intervall'), h);
  assert.ok(h.includes('ohne hinterlegten Steuersatz'), h);
  assert.ok(h.includes('heute bereits abgerechnet'), h);
  assert.ok(h.includes('ueberfaellig'), h);
});

test('Ohne Auffaelligkeiten bleibt die Hinweisliste leer', () => {
  assert.deepEqual(wiederkehrHinweise([{ titel: 'Sauber', intervall: 'monat', mwst_satz: 19, naechste_faellig: '2026-10-01' }], '2026-09-18'), []);
});
