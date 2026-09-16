// ============================================================================
// tests/bankStorno.test.mjs — Stornierte Buchungen in CAMT.053
//
// Befund vom 15.09.2026: <RvslInd> wurde nirgends gelesen. Eine Ruecklastschrift
// kam als CRDT mit POSITIVEM Betrag herein, der Bankabgleich ordnete sie der
// Rechnung zu und setzte sie auf bezahlt — waehrend das Geld beim Kunden lag.
// Gemahnt wurde nie. Das MT940-Gegenstueck macht es ueber RC/RD schon richtig.
//
// Ergaenzt tests/bankFormate.test.mjs, ersetzt ihn nicht.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUmsaetzeCamt, parseUmsaetzeMt940 } from '../out/bankFormate.js';

function camt(felder) {
  const rvsl = felder.rvsl === undefined ? '' : `<RvslInd>${felder.rvsl}</RvslInd>`;
  return `<?xml version="1.0"?><Document><BkToCstmrStmt><Stmt><Ntry>` +
    `<Amt Ccy="EUR">${felder.betrag}</Amt><CdtDbtInd>${felder.ind}</CdtDbtInd>${rvsl}` +
    `<Sts>BOOK</Sts><BookgDt><Dt>2026-09-10</Dt></BookgDt>` +
    `<RmtInf><Ustrd>${felder.zweck || 'RE-2026-0001'}</Ustrd></RmtInf>` +
    `</Ntry></Stmt></BkToCstmrStmt></Document>`;
}

test('der gemeldete Fall: Ruecklastschrift wird negativ gelesen', () => {
  const t = parseUmsaetzeCamt(camt({ betrag: '1926.00', ind: 'CRDT', rvsl: 'true', zweck: 'RUECKLASTSCHRIFT RE-2026-0001' }));
  assert.equal(t.length, 1);
  assert.equal(t[0].betrag, -1926, 'eine stornierte Gutschrift muss Geld abziehen, nicht zufuehren');
});

test('alle vier Kombinationen aus Richtung und Storno', () => {
  const faelle = [
    [{ ind: 'CRDT' }, 1926, 'normaler Eingang'],
    [{ ind: 'CRDT', rvsl: 'true' }, -1926, 'stornierter Eingang'],
    [{ ind: 'DBIT' }, -1926, 'normaler Ausgang'],
    [{ ind: 'DBIT', rvsl: 'true' }, 1926, 'stornierter Ausgang'],
  ];
  for (const [felder, erwartet, was] of faelle) {
    const t = parseUmsaetzeCamt(camt({ betrag: '1926.00', ...felder }));
    assert.equal(t[0].betrag, erwartet, was);
  }
});

test('RvslInd false aendert nichts', () => {
  for (const wert of ['false', '0', 'FALSE', 'nein', '']) {
    const t = parseUmsaetzeCamt(camt({ betrag: '100.00', ind: 'CRDT', rvsl: wert }));
    assert.equal(t[0].betrag, 100, 'RvslInd=' + JSON.stringify(wert) + ' darf nicht als Storno gelten');
  }
});

test('RvslInd wird auch in Gross- und Kleinschreibung erkannt', () => {
  for (const wert of ['true', 'TRUE', 'True', '1']) {
    const t = parseUmsaetzeCamt(camt({ betrag: '100.00', ind: 'CRDT', rvsl: wert }));
    assert.equal(t[0].betrag, -100, 'RvslInd=' + wert);
  }
});

test('ohne RvslInd bleibt alles wie bisher', () => {
  const t = parseUmsaetzeCamt(camt({ betrag: '250.50', ind: 'CRDT' }));
  assert.equal(t[0].betrag, 250.5);
  assert.equal(t[0].datum, '10.09.2026');
  assert.equal(t[0].verwendungszweck, 'RE-2026-0001');
});

test('der Namensraum-Praefix stoert das Storno nicht', () => {
  const xml = `<Document><camt053:Ntry><camt053:Amt Ccy="EUR">80.00</camt053:Amt>` +
    `<camt053:CdtDbtInd>CRDT</camt053:CdtDbtInd><camt053:RvslInd>true</camt053:RvslInd>` +
    `<camt053:Sts>BOOK</camt053:Sts></camt053:Ntry></Document>`;
  assert.equal(parseUmsaetzeCamt(xml)[0].betrag, -80);
});

test('CAMT und MT940 behandeln dasselbe Storno gleich', () => {
  const ausCamt = parseUmsaetzeCamt(camt({ betrag: '1926.00', ind: 'CRDT', rvsl: 'true' }))[0].betrag;
  // :61: mit RC = Storno einer Gutschrift, also negativ.
  const mt = ':20:X\n:25:DE00 1\n:28C:1/1\n:60F:C260901EUR0,00\n' +
    ':61:2609100910RC1926,00N012NONREF\n:86:?00RUECKLASTSCHRIFT?20RE-2026-0001\n' +
    ':62F:C260910EUR0,00\n';
  const ausMt = parseUmsaetzeMt940(mt)[0].betrag;
  assert.equal(ausCamt, ausMt, 'CAMT liefert ' + ausCamt + ', MT940 liefert ' + ausMt);
  assert.ok(ausCamt < 0);
});

test('vorgemerkte Buchungen bleiben uebersprungen', () => {
  const xml = camt({ betrag: '50.00', ind: 'CRDT', rvsl: 'true' }).replace('<Sts>BOOK</Sts>', '<Sts>PDNG</Sts>');
  assert.equal(parseUmsaetzeCamt(xml).length, 0);
});
