import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nullGrundLesen, nullGrundVollstaendig, nullGrundHinweis, nullGrundXml, brauchtNullGrund, vorschriftText } from '../out/nullGrund.js';
import { baueZugferdXml } from '../out/zugferd.js';

// ===========================================================================
// HW-17 (15.10.2026) — Grund bei 0 % auf Rechnung und E-Rechnung
// ===========================================================================

test('Nur bekannte Gruende', () => {
  assert.equal(nullGrundLesen('pv_null'), 'pv_null');
  assert.equal(nullGrundLesen('steuerfrei'), 'steuerfrei');
  assert.equal(nullGrundLesen('eu_ig'), null);
  assert.equal(nullGrundLesen(''), null);
});

test('steuerfrei braucht die Vorschrift', () => {
  assert.equal(nullGrundVollstaendig('pv_null', ''), true);
  assert.equal(nullGrundVollstaendig('steuerfrei', ''), false);
  assert.equal(nullGrundVollstaendig('steuerfrei', '§ 4 Nr. 11 UStG'), true);
  assert.equal(nullGrundVollstaendig(null, 'x'), false);
  assert.equal(vorschriftText('  §  4\nNr. 11  '), '§ 4 Nr. 11');
});

test('Hinweistexte', () => {
  assert.match(nullGrundHinweis('pv_null'), /§ 12 Abs\. 3 UStG/);
  assert.match(nullGrundHinweis('steuerfrei', '§ 4 Nr. 11 UStG'), /steuerfrei nach § 4 Nr\. 11 UStG/);
});

test('E-Rechnung-Kategorie: PV = Z ohne Grund, steuerfrei = E mit Grund', () => {
  assert.deepEqual(nullGrundXml('pv_null'), { kategorie: 'Z', grund: null });
  assert.equal(nullGrundXml('steuerfrei', '§ 4 Nr. 11 UStG').kategorie, 'E');
});

test('Wann ein Grund noetig ist', () => {
  assert.equal(brauchtNullGrund(['19', '0'], {}), true);
  assert.equal(brauchtNullGrund(['19', '7'], {}), false);
  assert.equal(brauchtNullGrund(['0'], { kleinunternehmer: true }), false);
  assert.equal(brauchtNullGrund(['0'], { reverseCharge: true }), false);
  assert.equal(brauchtNullGrund(['0'], { sonderfall: 'eu_ig' }), false);
  assert.equal(brauchtNullGrund([''], {}), false, 'leeres Feld ist 19 %, nicht 0 %');
});

function xml(rechnung) {
  return baueZugferdXml({
    rechnung: { rechnungsnummer: 'RE-1', rechnungsdatum: '2026-10-15', ...rechnung },
    positionen: [
      { bezeichnung: 'PV-Anlage', menge: 1, einzelpreis: 10000, mwst_satz: 0 },
      { bezeichnung: 'Wartung', menge: 1, einzelpreis: 100, mwst_satz: 19 },
    ],
    aussteller: { name: 'Solar GmbH', adresse: { ort: 'Böblingen' }, ust_idnr: 'DE123' },
    empfaenger: { name: 'Kunde', adresse: { ort: 'Stuttgart' } },
    profil: 'zugferd',
  });
}

test('E-Rechnung ohne Grund: Warnung (S mit 0 % waere ungueltig)', () => {
  const r = xml({});
  assert.ok(r.warnungen.some((w) => /0 % ohne Grund/.test(w)));
});

test('E-Rechnung mit PV-Grund: Zeile und Steuerblock Kategorie Z', () => {
  const r = xml({ null_grund: 'pv_null' });
  assert.match(r.xml, /<ram:CategoryCode>Z<\/ram:CategoryCode>\s*<ram:RateApplicablePercent>0<\/ram:RateApplicablePercent>/);
  assert.doesNotMatch(r.xml, /<ram:CategoryCode>S<\/ram:CategoryCode>\s*<ram:RateApplicablePercent>0</);
  assert.ok(!r.warnungen.some((w) => /0 % ohne Grund/.test(w)));
});

test('E-Rechnung steuerfrei: Kategorie E mit Befreiungsgrund', () => {
  const r = xml({ null_grund: 'steuerfrei', null_grund_text: '§ 4 Nr. 11 UStG' });
  assert.match(r.xml, /<ram:ExemptionReason>Steuerfrei nach § 4 Nr\. 11 UStG<\/ram:ExemptionReason>/);
  assert.match(r.xml, /<ram:CategoryCode>E<\/ram:CategoryCode>/);
});

test('Waechter: PDF druckt den Hinweis, Rechnungsseite speichert den Grund', () => {
  const pdf = fs.readFileSync('app/api/rechnung-pdf/route.ts', 'utf8');
  assert.match(pdf, /nullGrundHinweis\(/);
  assert.match(pdf, /\$\{nullHinweis\}/);
  const seite = fs.readFileSync('app/dashboard/rechnungen/[id]/page.tsx', 'utf8');
  assert.match(seite, /null_grund: nullGrund/);
  assert.match(seite, /brauchtNullGrund\(/);
});
