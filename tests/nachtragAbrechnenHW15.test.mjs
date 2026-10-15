import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  satzVorschlag, satzAusEingabe, nachtragZeilen, nachtragAbrechenbar, insLvErlaubt, nachtragZuRechnung, nachtragTitel,
} from '../out/nachtragAbrechnen.js';

// ===========================================================================
// HW-15 (15.10.2026) — Nachtrag abrechnen
// ===========================================================================

const pos = [{ kurztext: 'Mehr Fliesen', menge: '2,5', einheit: 'm²', einzelpreis: '80' }, { kurztext: 'Silikon', menge: 1, einzelpreis: 12.5 }];
const n = { nummer: 'NT-003', titel: 'Bad', status: 'beauftragt', in_lv_uebernommen: false, rechnung_id: null, positionen: pos };

test('Steuersatz-Vorschlag aus dem LV: haeufigster, Gleichstand hoeher, leer 19', () => {
  assert.equal(satzVorschlag([7, 7, 19]), 7);
  assert.equal(satzVorschlag([0, 19]), 19);
  assert.equal(satzVorschlag([]), 19);
  assert.equal(satzVorschlag(null), 19);
  assert.equal(satzVorschlag(['0', 0, '19']), 0);
});

test('Eingabe: nur 0, 7, 19 — sonst null', () => {
  assert.equal(satzAusEingabe('7'), 7);
  assert.equal(satzAusEingabe('19 %'), 19);
  assert.equal(satzAusEingabe('0'), 0);
  assert.equal(satzAusEingabe('16'), null);
  assert.equal(satzAusEingabe(''), null);
  assert.equal(satzAusEingabe('abc'), null);
});

test('Positionen: „2,5" wird 2,5 (nicht still 0); fehlender Preis = Fehler', () => {
  const z = nachtragZeilen(pos);
  assert.equal(z.ok, true);
  assert.equal(z.zeilen[0].menge, 2.5);
  assert.equal(z.zeilen[0].gesamt_netto, 200);
  assert.equal(z.zeilen[1].einheit, 'Stk');
  const f = nachtragZeilen([{ kurztext: 'X', menge: '2', einzelpreis: '' }]);
  assert.equal(f.ok, false); assert.match(f.fehler, /fehlt Menge oder Preis/);
  assert.equal(nachtragZeilen([{ kurztext: 'X', menge: '0', einzelpreis: '5' }]).ok, false);
  assert.equal(nachtragZeilen([]).ok, false);
});

test('Entweder LV oder eigene Rechnung — nie beides', () => {
  assert.equal(nachtragAbrechenbar(n, false).ok, true);
  assert.equal(nachtragAbrechenbar({ ...n, in_lv_uebernommen: true }, false).ok, false);
  assert.equal(nachtragAbrechenbar({ ...n, status: 'angeboten' }, false).ok, false);
  const doppelt = nachtragAbrechenbar({ ...n, rechnung_id: 'r1' }, true);
  assert.equal(doppelt.ok, false); assert.equal(doppelt.bereitsVorhanden, true);
  assert.equal(nachtragAbrechenbar({ ...n, rechnung_id: 'r1' }, false).ok, true, 'stornierte Rechnung zaehlt nicht');
  assert.equal(insLvErlaubt({ ...n, rechnung_id: 'r1' }, true).ok, false);
  assert.equal(insLvErlaubt({ ...n, rechnung_id: 'r1' }, false).ok, true);
});

test('Rechnung: ein Satz fuer alle Posten, Summen je Satz, 0 % ohne Steuer', () => {
  const z = nachtragZeilen(pos).zeilen;
  const r7 = nachtragZuRechnung(z, 7, 'NT-003');
  assert.deepEqual(r7.posten.map((p) => p.mwst_satz), [7, 7]);
  assert.equal(r7.posten[0].bezeichnung, '[Nachtrag NT-003] Mehr Fliesen');
  assert.equal(r7.summen.netto, 212.5);
  assert.equal(r7.summen.mwst, 14.88);
  assert.equal(r7.summen.brutto, 227.38);
  const r0 = nachtragZuRechnung(z, 0);
  assert.equal(r0.summen.mwst, 0); assert.equal(r0.summen.brutto, 212.5);
  assert.equal(nachtragTitel(n), 'Nachtrag NT-003 – Bad');
});

test('Waechter: kein festes 19 % und kein Number(...) || 0 mehr im Nachtrag-Ablauf; Route nutzt die Logik', () => {
  const seite = fs.readFileSync(new URL('../app/dashboard/bau-lv/ablaeufe/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(seite, /mwst_satz: 19/);
  assert.doesNotMatch(seite, /Number\(p\.menge\) \|\| 0/);
  assert.match(seite, /insLvErlaubt\(/);
  assert.match(seite, /\/api\/rechnung-aus-nachtrag/);
  const route = fs.readFileSync(new URL('../app/api/rechnung-aus-nachtrag/route.ts', import.meta.url), 'utf8');
  assert.match(route, /abrechnungPruefen\(/);
  assert.match(route, /nachtragAbrechenbar\(/);
  assert.match(route, /zahlungsstatus: "storniert"/);
  assert.match(route, /rechnung_id: rechnungId, status: "abgerechnet"/);
});
