// ============================================================================
// tests/einzelstueckGwgP336.test.mjs — Paket 336 (12.10.2026)
// BV2b Teil 5: GwG-Schwelle je Art im Verkauf
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gwgInfo, gwgNoetig, gwgBetragText, pruefen } from '../out/kfzVerkauf.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = '2026-10-12';
const basis = (x = {}) => ({
  nr: 'V-0001', status: 'angebot', kaeufer_art: 'verbraucher', kaeufer_name: 'Max Muster', kaeufer_firma: null,
  kaeufer_anschrift: 'Teststraße 1\n71032 Böblingen', kaeufer_tel: null, kaeufer_email: null, kaeufer_ustid: null, ausweis_geprueft: true,
  preis_brutto: 5000, zusatz: [], inzahlung_ankauf_id: null, inzahlung_betrag: null, anzahlung: null, anzahlung_am: null, anzahlung_art: null,
  rest_art: 'bar', gwg_erledigt: false, gewaehr: 'gesetzlich', gewaehr_gesondert: false, angebot_gueltig_bis: null, reserviert_bis: null,
  vertrag_am: null, liefertermin: null, vereinbarungen: null, uebergabe_am: null, km_uebergabe: null, schluessel: null, papiere: [], ...x,
});
const fz = (x = {}) => ({ fin: null, vk_brutto: null, vorschaden: 'keine_bekannt', besteuerung: '25a', ...x });

test('Ohne Art: wie bisher Bargeld ab 10.000 €', () => {
  assert.equal(gwgNoetig(basis({ preis_brutto: 9999.99 })), false);
  assert.equal(gwgNoetig(basis({ preis_brutto: 10000 })), true);
  assert.equal(gwgNoetig(basis({ preis_brutto: 50000, rest_art: 'ueberweisung' })), false, 'Überweisung zählt nicht');
  const i = gwgInfo(basis({ preis_brutto: 12000 }));
  assert.deepEqual([i.pflicht, i.grenze, i.nurBar, i.betrag], [true, 10000, true, 12000]);
  assert.equal(gwgBetragText(i), 'Bargeld 12.000,00 €');
});

test('Uhr/Schmuck: Edelmetall bar ab 2.000 €, sonst 10.000 €', () => {
  const edel = { art: 'uhr_schmuck', merkmale: { edelmetall: true } };
  assert.equal(gwgNoetig(basis({ preis_brutto: 1999.99 }), edel), false);
  assert.equal(gwgNoetig(basis({ preis_brutto: 2000 }), edel), true);
  assert.equal(gwgNoetig(basis({ preis_brutto: 5000, rest_art: 'karte' }), edel), false, 'Karte zählt nicht');
  assert.equal(gwgNoetig(basis({ preis_brutto: 5000 }), { art: 'uhr_schmuck', merkmale: {} }), false, 'Uhr ohne Edelmetall-Haken: 10.000 €');
  assert.equal(gwgInfo(basis(), edel).grenze, 2000);
});

test('Kunst: ab 10.000 € unabhängig von der Zahlart', () => {
  const kunst = { art: 'kunst_antik', merkmale: {} };
  const i = gwgInfo(basis({ preis_brutto: 12000, rest_art: 'ueberweisung' }), kunst);
  assert.deepEqual([i.pflicht, i.nurBar, i.betrag], [true, false, 12000]);
  assert.equal(gwgBetragText(i), 'Kaufpreis 12.000,00 €');
  assert.equal(gwgNoetig(basis({ preis_brutto: 9999, rest_art: 'ueberweisung' }), kunst), false);
});

test('pruefen: Grenze und Wort je Art im Fehler; kein Vertrag ohne Haken', () => {
  const p = pruefen(basis({ preis_brutto: 2500 }), fz({ art: 'uhr_schmuck', merkmale: { edelmetall: true } }), 'vertrag', HEUTE);
  assert.ok(p.fehler.some((f) => /^Bargeld 2\.500,00 €: Ab 2\.000 € muss der Käufer/.test(f)), p.fehler.join(' | '));
  const k = pruefen(basis({ preis_brutto: 15000, rest_art: 'ueberweisung' }), fz({ art: 'kunst_antik' }), 'vertrag', HEUTE);
  assert.ok(k.fehler.some((f) => /^Kaufpreis 15\.000,00 €: Ab 10\.000 €/.test(f)));
  assert.equal(pruefen(basis({ preis_brutto: 15000, rest_art: 'ueberweisung', gwg_erledigt: true }), fz({ art: 'kunst_antik' }), 'vertrag', HEUTE).fehler.length, 0);
  const vorher = pruefen(basis({ preis_brutto: 2500 }), fz({ art: 'uhr_schmuck', merkmale: { edelmetall: true } }), 'reserviert', HEUTE);
  assert.ok(vorher.hinweise.some((h) => /Vor dem Kaufvertrag/.test(h)));
});

test('pruefen: km, FIN und Brief nur, wo die Art sie hat', () => {
  const uhrUe = pruefen(basis({ status: 'vertrag', rest_art: 'ueberweisung' }), fz({ art: 'uhr_schmuck' }), 'uebergeben', HEUTE);
  assert.ok(!uhrUe.fehler.some((f) => /Kilometerstand/.test(f)), 'Uhr ohne Kilometer');
  assert.ok(uhrUe.hinweise.some((h) => /Ohne vollständige Zahlung nicht übergeben/.test(h)));
  assert.ok(!uhrUe.hinweise.some((h) => /Zulassungsbescheinigung/.test(h)));
  const kfzUe = pruefen(basis({ status: 'vertrag', rest_art: 'ueberweisung' }), fz(), 'uebergeben', HEUTE);
  assert.ok(kfzUe.fehler.some((f) => /Kilometerstand/.test(f)), 'Kfz braucht weiter km');
  assert.ok(kfzUe.hinweise.some((h) => /Zulassungsbescheinigung Teil II/.test(h)));
  const masch = pruefen(basis({ status: 'vertrag', rest_art: 'ueberweisung' }), fz({ art: 'maschine' }), 'uebergeben', HEUTE);
  assert.ok(!masch.fehler.some((f) => /Kilometerstand/.test(f)), 'Maschine zählt Betriebsstunden');
  assert.ok(masch.hinweise.some((h) => /Zulassungsbescheinigung Teil II/.test(h)), 'Maschine hat Papiere');
  assert.ok(!pruefen(basis(), fz({ art: 'boot' }), 'vertrag', HEUTE).hinweise.some((h) => /FIN fehlt/.test(h)));
  assert.ok(pruefen(basis(), fz(), 'vertrag', HEUTE).hinweise.some((h) => /FIN fehlt/.test(h)));
});

test('Seiten: Verkauf und Übersicht rechnen mit der Art', () => {
  const v = lies('app/dashboard/kfz/bestand/KfzVerkauf.tsx');
  assert.match(v, /const gi = gwgInfo\(entwurf, f\.fz\)/);
  assert.match(v, /gwgBetragText\(gi\)/);
  assert.doesNotMatch(v, /ab 10\.000 € muss/);
  const a = lies('app/dashboard/kfz/bestand/[id]/page.tsx');
  assert.match(a, /\.\.\.\(mitArt \? \{ art, merkmale: akte\.merkmale \?\? null \} : \{\}\)/);
  const u = lies('app/dashboard/kfz/verkauf/page.tsx');
  assert.match(u, /gwgNoetig\(v, fz\[v\.bestand_id\]\)/);
  assert.match(u, /select\('id, interne_nr, marke, modell, art, merkmale'\)/);
});
