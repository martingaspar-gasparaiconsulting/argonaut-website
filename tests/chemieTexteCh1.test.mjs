// ARGONAUT OS · Paket 314 · CH1 Chemie-Texte nur mit Gebautem
// Die Website- und SEO-Texte zu „Chemische Industrie" versprachen Dinge, die es
// nicht gibt (Labor-Modul, automatische Gefahrstoff-Doku, Echtzeit, Compliance).
// Dieser Test haelt die ehrliche Fassung fest. Gefahrstoffverzeichnis und
// Nachweise sind Grundausstattung jedes Betriebs (KERN_MODULE, seit P194).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KERN_MODULE } from '../out/pakete.js';
import { KATEGORIE_MODULE } from '../out/branchenkatalog.js';

function zeile(datei, marke) {
  const z = readFileSync(new URL('../' + datei, import.meta.url), 'utf8').split('\n').filter((l) => l.includes(marke));
  assert.equal(z.length, 1, datei);
  return z[0];
}
const web = JSON.parse(zeile('app/vorschau/_lib/branchen-web-extra.ts', '"slug":"chemische-industrie"').trim().replace(/,$/, ''));
const seo = JSON.parse(zeile('app/vorschau/_lib/branchen-seo.ts', '"chemische-industrie":').trim().replace(/^"chemische-industrie":\s*/, '').replace(/,$/, ''));
const alles = [...web.schmerzen, ...web.ergebnisse, seo.intro, ...seo.faq.flatMap((f) => [f.q, f.a])].join(' | ');

test('CH1: keine Versprechen ohne gebautes Modul', () => {
  for (const r of [/Labor/i, /automatisch/i, /Echtzeit/i, /Compliance/i, /Rezeptur, Charge/i, /rechtssicher/i, /erfüllen/i]) {
    assert.ok(!r.test(alles), 'verboten: ' + r.source);
  }
});

test('CH1: Ergebnisse nennen nur Gebautes', () => {
  assert.equal(web.ergebnisse.length, 4);
  assert.equal(web.schmerzen.length, 4);
  assert.ok(web.ergebnisse.some((e) => /Gefahrstoffverzeichnis/.test(e)));
  assert.ok(web.ergebnisse.some((e) => /Prüfplan/.test(e)));
  assert.equal(web.kategorie, 'Industrie & Produktion');
});

test('CH1: SEO-Text sagt ehrlich, dass ARGONAUT nicht einstuft', () => {
  assert.equal(seo.faq.length, 4);
  assert.match(alles, /berechnet sie nicht/);
  assert.match(seo.intro, /Servern in der EU/);
  for (const t of [seo.intro, ...seo.faq.map((f) => f.a)]) assert.ok(!/\b(du|dein|dich|dir)\b/i.test(t), 'Sie-Form');
});

test('CH1: Gefahrstoffe und Chargen stecken im Paket der chemischen Industrie', () => {
  const paket = new Set([...KERN_MODULE, ...KATEGORIE_MODULE['Industrie & Produktion']]);
  for (const m of ['nachweise', 'chargen', 'erp', 'lager-scanner']) assert.ok(paket.has(m), m);
  // Etiketten ist ein Lebensmittel-Modul (LMIV) und gehoert nicht ins Industrie-Paket
  assert.ok(!KATEGORIE_MODULE['Industrie & Produktion'].includes('etiketten'));
});
