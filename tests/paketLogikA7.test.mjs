// ARGONAUT OS · tests/paketLogikA7.test.mjs — A7 (22.09.2026)
// paketLogik wertet das ok-Feld von berechnePosition aus. Vorher rutschte
// eine unsinnige Position unbemerkt durch und der Fixpreis wurde auf sie
// mitverteilt — still.
import test from 'node:test';
import assert from 'node:assert/strict';
import { klappeAuf } from '../out/paketLogik.js';

const PAKET = {
  id: 'p1', owner_user_id: 'u1', firma_id: null,
  name: 'Wartungspaket', fixpreis_netto: 1000,
};

function pos(ueber = {}) {
  return {
    id: 'x', paket_id: 'p1', art: 'leistung', sortiment_id: null, artikel_id: null, leistung_id: null,
    bezeichnung: 'Wartung', detail: null, menge: 2, einheit: 'Std',
    einzelpreis_netto: 300, steuersatz_prozent: 19, position_nr: 1,
    ...ueber,
  };
}

test('ein sauberes Paket bleibt sauber — keine neuen Fehlalarme', () => {
  const b = klappeAuf(PAKET, [pos(), pos({ position_nr: 2, bezeichnung: 'Material' })]);
  assert.equal(b.ok, true, 'Fehler: ' + b.fehler.join(' | '));
  assert.equal(b.fehler.length, 0);
});

test('DER PUNKT: eine Position ohne Bezeichnung faellt jetzt auf', () => {
  const b = klappeAuf(PAKET, [pos(), pos({ position_nr: 2, bezeichnung: '   ' })]);
  assert.equal(b.ok, false, 'das Paket darf nicht als in Ordnung gelten');
  assert.ok(b.fehler.some((f) => /Position 2/.test(f)), 'die Zeile muss benannt werden');
  assert.ok(b.fehler.some((f) => /Bezeichnung/i.test(f)), 'und der Grund auch');
});

test('Menge 0 faellt auf — der Fixpreis wurde vorher auf eine leere Zeile mitverteilt', () => {
  const b = klappeAuf(PAKET, [pos(), pos({ position_nr: 2, bezeichnung: 'Leerlauf', menge: 0 })]);
  assert.equal(b.ok, false);
  assert.ok(b.fehler.some((f) => /Leerlauf/.test(f) && /Menge/i.test(f)));
});

test('ein negativer Einzelpreis faellt auf', () => {
  const b = klappeAuf(PAKET, [pos({ einzelpreis_netto: -50 })]);
  assert.equal(b.ok, false);
  assert.ok(b.fehler.some((f) => /Einzelpreis/i.test(f)));
});

test('ein unmoeglicher Steuersatz faellt auf', () => {
  const b = klappeAuf(PAKET, [pos({ steuersatz_prozent: 120 })]);
  assert.equal(b.ok, false);
  assert.ok(b.fehler.some((f) => /Steuersatz/i.test(f)));
});

test('NICHTS wird heimlich ausgelassen: die Zeilen bleiben alle da', () => {
  const b = klappeAuf(PAKET, [pos(), pos({ position_nr: 2, bezeichnung: 'Kaputt', menge: 0 })]);
  assert.equal(b.positionen.length, 2, 'auch die fehlerhafte Zeile bleibt sichtbar');
});

test('Hinweise werden weitergereicht, ohne das Paket zu blockieren', () => {
  // Einzelpreis 0 ist ein HINWEIS, kein Fehler — das Paket bleibt benutzbar.
  const b = klappeAuf(PAKET, [pos(), pos({ position_nr: 2, bezeichnung: 'Zugabe', einzelpreis_netto: 0 })]);
  assert.equal(b.ok, true, 'ein Hinweis darf nicht blockieren: ' + b.fehler.join(' | '));
  assert.ok(b.hinweise.some((h) => /Zugabe/.test(h)), 'der Hinweis muss die Zeile nennen');
});

test('ein leeres Paket bleibt wie bisher ein Fehler', () => {
  const b = klappeAuf(PAKET, []);
  assert.equal(b.ok, false);
  assert.ok(b.fehler.some((f) => /keine Positionen/i.test(f)));
});
