// Paket PG (24.09.2026) — Gespraechsprotokoll mit Nachfass (B13).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTEN, artFuer, plusWerktage, datumDe, systemPrompt, nutzerPrompt, nameBelegt, betraege,
  leseProtokoll, nachfassDatum, aufgabenFuerCockpit, protokollMarkdown, nachfassMail,
} from '../out/gespraechsProtokoll.js';

const TAG = '2026-09-24'; // Donnerstag
const ROH = 'Termin bei Familie Keller in Sindelfingen. Frau Keller möchte das Bad bis Weihnachten fertig. '
  + 'Sie schickt uns bis Freitag die Fliesenauswahl. Herr Brenner misst am Montag auf. '
  + 'Budget liegt bei 18.000 Euro. Unklar: Fenster tauschen ja oder nein.';

const ANTWORT = JSON.stringify({
  titel: 'Badsanierung Keller',
  zusammenfassung: 'Frau Keller wünscht ein neues Bad bis Weihnachten, Budget 18.000 €.',
  teilnehmer: ['Frau Keller (Kundin)', 'Herr Brenner'],
  themen: [{ titel: 'Umfang', text: 'Komplettsanierung des Bads.' }],
  beschluesse: ['Aufmaß am Montag'],
  aufgaben: [
    { was: 'Fliesenauswahl schicken', wer: 'Frau Keller', seite: 'kunde', bis: '2026-09-25', bis_text: 'bis Freitag' },
    { was: 'Aufmaß vor Ort', wer: 'Herr Brenner', seite: 'wir', bis: '2026-09-28', bis_text: 'am Montag' },
    { was: 'Angebot erstellen', wer: 'wir', seite: 'wir', bis: '2026-09-30', bis_text: null },
  ],
  offene_fragen: ['Fenster tauschen?'],
  naechster_termin: null, naechster_termin_text: null,
});

test('Arten und Werktage', () => {
  assert.equal(ARTEN.length, 4);
  assert.equal(artFuer('baustelle'), 'baustelle');
  assert.equal(artFuer('quatsch'), 'kunde');
  assert.equal(plusWerktage('2026-09-24', 1), '2026-09-25'); // Do -> Fr
  assert.equal(plusWerktage('2026-09-25', 1), '2026-09-28'); // Fr -> Mo
  assert.equal(plusWerktage('2026-09-24', 3), '2026-09-29'); // Do -> Di
  assert.equal(datumDe('2026-09-24'), '24.09.2026');
});

test('Prompt: Wochentag, Firma, keine erfundenen Fristen', () => {
  assert.match(nutzerPrompt({ datum: TAG, roh: 'x' }), /Donnerstag, 24\.09\.2026/);
  assert.match(systemPrompt('baustelle', 'Muster Bau'), /Baustellen-Besprechung/);
  assert.match(systemPrompt('kunde', 'Muster Bau'), /NUR, wenn in der Mitschrift/);
});

test('Namen und Betraege belegen', () => {
  assert.equal(nameBelegt('Herr Brenner', ROH), true);
  assert.equal(nameBelegt('wir', ROH), true);
  assert.equal(nameBelegt('Kunde', ROH), true);
  assert.equal(nameBelegt('Herr Maier', ROH), false);
  assert.equal(nameBelegt('Frau Keller (Kundin)', ROH), true);
  assert.deepEqual(betraege('18.000 Euro und 250,5 € sowie 12 EUR'), [1800000, 25050, 1200]);
  assert.deepEqual(betraege('Fenster 3 Stück'), []);
});

test('Protokoll lesen: Frist ohne Wortlaut wird entfernt, belegte bleibt', () => {
  const p = leseProtokoll(ANTWORT, ROH, TAG);
  assert.equal(p.aufgaben.length, 3);
  assert.equal(p.aufgaben[0].bis, '2026-09-25');
  assert.equal(p.aufgaben[1].bis, '2026-09-28');
  assert.equal(p.aufgaben[2].bis, null);
  assert.ok(p.hinweise.some((h) => /keine genannt/.test(h)));
  // 18.000 € steht als "18.000 Euro" in der Mitschrift -> kein Hinweis
  assert.ok(!p.hinweise.some((h) => /Betrag/.test(h)));
});

test('Protokoll lesen: Frist vor dem Termin, fremder Name, erfundener Betrag', () => {
  const roh = JSON.stringify({
    titel: 'X', aufgaben: [
      { was: 'Material bestellen', wer: 'Herr Maier', seite: 'wir', bis: '2026-09-01', bis_text: 'letzte Woche' },
    ],
    beschluesse: ['Festpreis 21.500 €'],
  });
  const p = leseProtokoll(roh, ROH, TAG);
  assert.equal(p.aufgaben[0].bis, null);
  assert.ok(p.hinweise.some((h) => /vor dem Besprechungstag/.test(h)));
  assert.ok(p.hinweise.some((h) => /Herr Maier/.test(h)));
  assert.ok(p.hinweise.some((h) => /21\.500|21500,00/.test(h)));
});

test('Protokoll lesen: kaputte Antwort und falsche Seite', () => {
  const p = leseProtokoll('kein json', ROH, TAG);
  assert.equal(p.titel, 'Besprechung');
  assert.equal(p.aufgaben.length, 0);
  const q = leseProtokoll(JSON.stringify({ aufgaben: [{ was: 'x', seite: 'boss', wer: '' }] }), ROH, TAG);
  assert.equal(q.aufgaben[0].seite, 'andere');
  assert.equal(q.aufgaben[0].wer, 'offen');
  const r = leseProtokoll(JSON.stringify({ naechster_termin: '2026-10-05', naechster_termin_text: null }), ROH, TAG);
  assert.equal(r.naechster_termin, null);
});

test('Nachfass: Frist der Gegenseite + 1 Werktag, sonst 3 Werktage, nie vor morgen', () => {
  const p = leseProtokoll(ANTWORT, ROH, TAG);
  assert.equal(nachfassDatum(p, TAG, TAG), '2026-09-28'); // Fr 25. + 1 Werktag = Mo 28.
  assert.equal(nachfassDatum({ aufgaben: [] }, TAG, TAG), '2026-09-29');
  // alte Besprechung, heute spaeter -> morgen
  assert.equal(nachfassDatum({ aufgaben: [] }, '2026-08-01', TAG), '2026-09-25');
  // unsere Fristen zaehlen fuer den Nachfass nicht
  assert.equal(nachfassDatum({ aufgaben: [{ was: 'a', wer: 'wir', seite: 'wir', bis: '2026-09-25', bis_text: 'x' }] }, TAG, TAG), '2026-09-29');
});

test('Cockpit-Aufgaben nur fuer uns, mit Frist und Prioritaet', () => {
  const p = leseProtokoll(ANTWORT, ROH, TAG);
  const a = aufgabenFuerCockpit(p, TAG, TAG);
  assert.equal(a.length, 2);
  assert.equal(a[0].faellig_am, '2026-09-28');
  assert.equal(a[0].prioritaet, 'normal');
  assert.match(a[0].beschreibung, /Herr Brenner/);
  assert.equal('faellig_am' in a[1], false);
  const eilig = aufgabenFuerCockpit(p, TAG, '2026-09-27');
  assert.equal(eilig[0].prioritaet, 'hoch');
});

test('Markdown und Nachfass-Mail in Sie-Form', () => {
  const p = leseProtokoll(ANTWORT, ROH, TAG);
  const md = protokollMarkdown(p, { datum: TAG, ort: 'Sindelfingen', art: 'kunde' });
  assert.match(md, /Kundengespräch\*\* am 24\.09\.2026 · Sindelfingen/);
  assert.match(md, /### Wer macht was/);
  assert.match(md, /Fliesenauswahl schicken — \*\*Frau Keller\*\* bis 25\.09\.2026/);
  const m = nachfassMail(p, { datum: TAG, firma: 'Muster Bad GmbH', anrede: 'Sehr geehrte Frau Keller' });
  assert.match(m.betreff, /24\.09\.2026/);
  assert.match(m.text, /^Sehr geehrte Frau Keller,/);
  assert.match(m.text, /Dafür bräuchten wir von Ihnen:\n– Fliesenauswahl schicken \(bis 25\.09\.2026\)/);
  assert.match(m.text, /Das übernehmen wir:/);
  assert.ok(!/\bdu\b|\bdir\b|\bdein/i.test(m.text));
  assert.match(nachfassMail(p, { datum: TAG, firma: '' }).text, /\[Firmenname\]$/);
});
