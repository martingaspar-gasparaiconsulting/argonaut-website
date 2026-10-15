import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { zahlbarJetzt, brauchtAbschlaege } from '../out/zahlbarJetzt.js';

// ===========================================================================
// HW-6 (15.10.2026) — Mahnung fordert nur, was JETZT faellig ist
// ===========================================================================

test('Normale Rechnung: offen = Brutto − bezahlt', () => {
  const z = zahlbarJetzt({ netto_summe: 1000, brutto_summe: 1190, bezahlter_betrag: 190 });
  assert.equal(z.offen, 1000);
  assert.equal(z.abgesetzt, 0);
  assert.equal(z.einbehalt, 0);
});

test('Schlussrechnung: Abschlaege (netto + Steuer) werden abgezogen', () => {
  // Gesamtleistung 10.000 netto + 1.900 USt; zwei Abschlaege je 3.000 + 570
  const r = { rechnungsart: 'schluss', netto_summe: 10000, brutto_summe: 11900, bezahlter_betrag: 0 };
  const ab = [{ netto: 3000, steuer: 570 }, { netto: 3000, steuer: 570 }];
  const z = zahlbarJetzt(r, ab);
  assert.equal(z.abgesetzt, 7140);
  assert.equal(z.rest, 4760, 'vorher wurden 11.900 € angemahnt');
  assert.equal(z.offen, 4760);
});

test('Stornierte Abschlaege werden nicht abgezogen', () => {
  const r = { rechnungsart: 'schluss', netto_summe: 1000, brutto_summe: 1190 };
  const z = zahlbarJetzt(r, [{ netto: 500, steuer: 95, storniert: true }]);
  assert.equal(z.offen, 1190);
});

test('Abschlaege zaehlen NUR bei Schlussrechnungen', () => {
  const z = zahlbarJetzt({ rechnungsart: 'normal', netto_summe: 1000, brutto_summe: 1190 }, [{ netto: 500, steuer: 95 }]);
  assert.equal(z.offen, 1190);
  assert.equal(brauchtAbschlaege({ rechnungsart: 'schluss' }), true);
  assert.equal(brauchtAbschlaege({ rechnungsart: 'abschlag' }), false);
});

test('Sicherheitseinbehalt wird nicht angemahnt (5 % vom Rest, brutto)', () => {
  const r = { rechnungsart: 'schluss', netto_summe: 10000, brutto_summe: 11900, einbehalt_prozent: 5, einbehalt_basis: 'brutto' };
  const z = zahlbarJetzt(r, [{ netto: 6000, steuer: 1140 }]);
  assert.equal(z.rest, 4760);
  assert.equal(z.einbehalt, 238);
  assert.equal(z.faelligJetzt, 4522);
  assert.equal(z.offen, 4522);
});

test('Einbehalt mit Basis netto', () => {
  const z = zahlbarJetzt({ netto_summe: 10000, brutto_summe: 11900, einbehalt_prozent: 5, einbehalt_basis: 'netto' });
  assert.equal(z.einbehalt, 500);
  assert.equal(z.offen, 11400);
});

test('§ 13b: Brutto = Netto, Abschlaege ohne Steuer', () => {
  const r = { rechnungsart: 'schluss', reverse_charge: true, netto_summe: 10000, brutto_summe: 11900 };
  const z = zahlbarJetzt(r, [{ netto: 4000, steuer: 0 }]);
  assert.equal(z.gesamt, 10000);
  assert.equal(z.offen, 6000);
});

test('Ganz bezahlt -> 0 offen, Ueberzahlung negativ', () => {
  assert.equal(zahlbarJetzt({ netto_summe: 100, brutto_summe: 119, bezahlter_betrag: 119 }).offen, 0);
  assert.equal(zahlbarJetzt({ netto_summe: 100, brutto_summe: 119, bezahlter_betrag: 120 }).offen, -1);
});

test('Waechter: Mahnung, Mahnliste und Ueberfaellig-Lauf rechnen ueber zahlbarJetzt', () => {
  for (const f of ['app/dashboard/mahnwesen/[id]/page.tsx', 'app/dashboard/mahnwesen/page.tsx', 'app/api/rechnungen-ueberfaellig/route.ts']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.match(src, /zahlbarJetzt\(/, f);
    assert.doesNotMatch(src, /brutto_summe\)?\s*\|\|\s*0\)?\s*-\s*\(?(Number\()?r?\.?\??\.?bezahlter_betrag/, f + ': alte Rechnung Brutto − bezahlt');
    assert.doesNotMatch(src, /brutto\s*-\s*bezahlt/, f + ': alte Rechnung brutto − bezahlt');
  }
});

test('Waechter: Mahnung adressiert den Empfaenger vor dem Titel', () => {
  const src = fs.readFileSync('app/dashboard/mahnwesen/[id]/page.tsx', 'utf8');
  assert.match(src, /empfaenger_name\?\.trim\(\) \|\| rechnung\?\.titel/);
});

test('Waechter: Rechnungs-PDF rechnet den Einbehalt ueber rechneEinbehalt', () => {
  const src = fs.readFileSync('app/api/rechnung-pdf/route.ts', 'utf8');
  assert.match(src, /rechneEinbehalt\(/);
  assert.doesNotMatch(src, /Math\.round\(basisBetrag/);
});
