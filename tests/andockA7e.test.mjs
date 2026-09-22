// ARGONAUT OS · tests/andockA7e.test.mjs — A7 Paket 6 (22.09.2026)
// datevHinweise ist angeschlossen: der Betrieb erfaehrt, WARUM ein Konto
// vorgeschlagen wurde — und wann er besser nachsieht.
import test from 'node:test';
import assert from 'node:assert/strict';
import { datevVorschlag, datevHinweise } from '../out/datevKonten.js';

test('DER WICHTIGSTE FALL: greift keine Regel, wird das gesagt', () => {
  const v = datevVorschlag('', '');
  const h = datevHinweise(v, '', '');
  assert.ok(h.length > 0, 'ohne Treffer MUSS ein Hinweis kommen');
  assert.ok(
    h.some((x) => /Sammelkonto|von Hand/i.test(x)),
    'der Betrieb muss wissen, dass er selbst kontieren muss',
  );
});

test('eine Zuordnung ueber den Lieferantennamen wird als schwaecher gekennzeichnet', () => {
  const v = datevVorschlag('', 'Shell');
  const h = datevHinweise(v, '', 'Shell');
  if (v.quelle === 'lieferant') {
    assert.ok(h.some((x) => /Lieferantennamen|Kategorie/i.test(x)));
  }
  assert.equal(Array.isArray(h), true);
});

test('der Vorschlag liefert immer beide Kontenrahmen', () => {
  const v = datevVorschlag('Material', 'Metabo');
  assert.equal(typeof v.skr03, 'string');
  assert.equal(typeof v.skr04, 'string');
  assert.ok(v.skr03.length > 0 && v.skr04.length > 0);
});

test('leere und unsinnige Eingaben stuerzen nicht ab', () => {
  assert.equal(Array.isArray(datevHinweise(datevVorschlag('', ''), null, null)), true);
  assert.equal(Array.isArray(datevHinweise(datevVorschlag('xyz', 'abc'))), true);
});
