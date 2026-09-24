// G01 (24.09.2026, gemeinsam freigegeben) — Angebot per Sprache oder Foto.
// Martins Regel: Preis nur aus Katalog oder belegtem Dokument, sonst leer + rot.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  katalogPreis, katalogFuerPrompt, betraegeImText, preisBelegt, lesePositionen,
  formZahl, alsFormPos, fehlendePreise, systemPrompt, nutzerPrompt,
} from '../out/angebotSprache.js';

const KATALOG = [
  { id: 'k1', bezeichnung: 'Fliesen verlegen', erfassungsart: 'stueck', einheit: 'm²', einheitspreis_netto: '48,50', mwst_satz: 19 },
  { id: 'k2', bezeichnung: 'Gesellenstunde', erfassungsart: 'stunden', stundensatz_netto: 62, festpreis_netto: 0 },
  { id: 'k3', bezeichnung: 'Anfahrt Pauschale', erfassungsart: 'stunden', festpreis_netto: 35 },
  { id: 'k4', bezeichnung: 'Sonderleistung', erfassungsart: 'stueck', einheit: 'Stk', einheitspreis_netto: null },
];
const DOKS = [{ datei: 'Preisliste 2026.pdf', text: 'Silikonfuge erneuern je lfm 8,90 €\nEntsorgung Bauschutt 1.250,00 € pauschal' }];
const ki = (o) => JSON.stringify(o);

test('Katalogpreis: Menge, Stunde, Pauschale — eine 0 ist keine Pauschale', () => {
  assert.deepEqual(katalogPreis(KATALOG[0]), { einheit: 'm²', einzelpreis: 48.5, mwst_satz: 19 });
  assert.deepEqual(katalogPreis(KATALOG[1]), { einheit: 'Std', einzelpreis: 62, mwst_satz: 19 });
  assert.deepEqual(katalogPreis(KATALOG[2]), { einheit: 'Psch', einzelpreis: 35, mwst_satz: 19 });
  assert.equal(katalogPreis(KATALOG[3]).einzelpreis, null);
});

test('Katalog im Prompt OHNE Preise', () => {
  const t = katalogFuerPrompt(KATALOG);
  assert.match(t, /k1 \| Fliesen verlegen \| m²/);
  assert.doesNotMatch(t, /48/);
  assert.doesNotMatch(t, /62/);
});

test('Betraege im Text werden als Cent erkannt', () => {
  const b = betraegeImText(DOKS[0].text);
  assert.ok(b.has(890));
  assert.ok(b.has(125000));
  assert.equal(preisBelegt(8.9, 'preisliste 2026.pdf', DOKS), true);
  assert.equal(preisBelegt(9.9, 'Preisliste 2026.pdf', DOKS), false, 'Betrag steht nicht drin');
  assert.equal(preisBelegt(8.9, 'Andere.pdf', DOKS), false, 'falsche Quelle');
});

test('Preis aus dem KATALOG — die Zahl der KI wird ignoriert', () => {
  const r = lesePositionen(ki({ titel: 'Bad', positionen: [
    { bezeichnung: 'Wandfliesen verlegen', menge: 12, einheit: 'Stk', katalog_id: 'k1', einzelpreis: 99 },
  ] }), KATALOG, DOKS);
  const p = r.positionen[0];
  assert.equal(p.einzelpreis, 48.5);
  assert.equal(p.einheit, 'm²', 'Einheit kommt aus dem Katalog');
  assert.equal(p.quelle, 'katalog');
});

test('Preis aus DOKUMENT nur mit Beleg im gefundenen Text', () => {
  const r = lesePositionen(ki({ positionen: [
    { bezeichnung: 'Silikonfugen erneuern', menge: 6, einheit: 'lfm', einzelpreis: 8.9, quelle_datei: 'Preisliste 2026.pdf' },
    { bezeichnung: 'Duschrinne', menge: 1, einheit: 'Stk', einzelpreis: 189, quelle_datei: 'Preisliste 2026.pdf' },
    { bezeichnung: 'Spiegel', menge: 1, einheit: 'Stk', einzelpreis: 120, quelle_datei: '' },
  ] }), KATALOG, DOKS);
  assert.equal(r.positionen[0].quelle, 'dokument');
  assert.equal(r.positionen[0].einzelpreis, 8.9);
  assert.equal(r.positionen[1].quelle, 'fehlt', '189 steht nicht in der Preisliste -> geschaetzt -> verworfen');
  assert.equal(r.positionen[1].einzelpreis, null);
  assert.equal(r.positionen[2].quelle, 'fehlt', 'ohne Quelle kein Preis');
  assert.match(r.hinweise[0], /2 Positionen ohne belegten Preis/);
});

test('erfundene Katalog-ID: kein Preis, Hinweis', () => {
  const r = lesePositionen(ki({ positionen: [{ bezeichnung: 'X', menge: 1, einheit: 'Stk', katalog_id: 'gibt-es-nicht' }] }), KATALOG, []);
  assert.equal(r.positionen[0].quelle, 'fehlt');
  assert.ok(r.hinweise.some((h) => /gibt es nicht/.test(h)));
});

test('Katalog-Eintrag ohne Preis bleibt rot', () => {
  const r = lesePositionen(ki({ positionen: [{ bezeichnung: 'Sonder', menge: 1, einheit: 'Stk', katalog_id: 'k4' }] }), KATALOG, []);
  assert.equal(r.positionen[0].quelle, 'fehlt');
  assert.equal(r.positionen[0].einzelpreis, null);
});

test('Menge, Einheit, MwSt werden geprueft', () => {
  const r = lesePositionen(ki({ positionen: [
    { bezeichnung: 'A', menge: 'viel', einheit: 'Stueck', mwst_satz: 16 },
    { bezeichnung: 'B', menge: '2,5', einheit: 'Std', mwst_satz: 7 },
    { bezeichnung: '', menge: 1 },
  ] }), [], []);
  assert.equal(r.positionen.length, 2, 'ohne Bezeichnung faellt raus');
  assert.equal(r.positionen[0].menge, 1);
  assert.equal(r.positionen[0].einheit, 'Stk');
  assert.equal(r.positionen[0].mwst_satz, 19);
  assert.equal(r.positionen[1].menge, 2.5);
  assert.equal(r.positionen[1].mwst_satz, 7);
  assert.ok(r.hinweise.some((h) => /Menge nicht lesbar/.test(h)));
});

test('unlesbare Antwort: nichts uebernommen', () => {
  const r = lesePositionen('Tut mir leid', KATALOG, DOKS);
  assert.equal(r.positionen.length, 0);
  assert.match(r.hinweise[0], /nicht lesbar/);
});

test('Formularzahl IMMER mit Komma — "12.5" wuerde im Formular 125', () => {
  assert.equal(formZahl(12.5), '12,5');
  assert.equal(formZahl(48.5), '48,5');
  assert.equal(formZahl(1250), '1250', 'kein Tausenderpunkt');
  assert.equal(formZahl(2.125), '2,125');
  // So liest das Formular (num() aus angebote/page.tsx):
  const num = (s) => parseFloat((s || '').replace(/\./g, '').replace(',', '.')) || 0;
  assert.equal(num(formZahl(12.5)), 12.5);
  assert.equal(num(formZahl(1250)), 1250);
});

test('Uebergabe: fehlender Preis = leeres Feld, Quelle bleibt dran', () => {
  const f = alsFormPos({ bezeichnung: 'X', menge: 3, einheit: 'Std', einzelpreis: null, mwst_satz: 19, quelle: 'fehlt', herkunft: null });
  assert.deepEqual(f, { bezeichnung: 'X', menge: '3', einheit: 'Std', einzelpreis: '', mwst_satz: '19', quelle: 'fehlt', herkunft: null });
});

test('Speichern blockiert NUR fehlende Preise aus der Sprach-Uebernahme', () => {
  const num = (s) => parseFloat((s || '').replace(/\./g, '').replace(',', '.')) || 0;
  const pos = [
    { bezeichnung: 'Von Hand ohne Preis', einzelpreis: '' },
    { bezeichnung: 'Sprache ohne Preis', einzelpreis: '', quelle: 'fehlt' },
    { bezeichnung: 'Sprache nachgetragen', einzelpreis: '45,00', quelle: 'fehlt' },
    { bezeichnung: 'Katalog', einzelpreis: '48,5', quelle: 'katalog' },
  ];
  assert.deepEqual(fehlendePreise(pos, num), ['Sprache ohne Preis']);
});

test('Prompt verbietet Schaetzpreise ausdruecklich', () => {
  assert.match(systemPrompt(), /Schätzen Sie NIEMALS einen Preis/);
  const n = nutzerPrompt('Bad fliesen', KATALOG, DOKS);
  assert.match(n, /LEISTUNGSKATALOG/);
  assert.match(n, /\[Quelle 1: Preisliste 2026\.pdf\]/);
  assert.match(nutzerPrompt('', [], []), /\(siehe Foto\)/);
});
