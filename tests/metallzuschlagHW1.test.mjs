import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { metallzuschlag, notizDatumPruefen, positionsText, sammelRechnung, KUPFERZAHLEN } from '../out/metallzuschlag.js';
import { START_FREIGABE, startFrei } from '../out/startSperre.js';

// HW-1 (16.10.2026) — Metallzuschlag Kupfer: Formel, Grenzfälle, Text, Sperre

test('Formel: (DEL + 1 % − Basis) × Metallzahl / 100 = €/km', () => {
  // DEL 900, +1 % = 909, Basis 150 → 759 €/100 kg; × 43,2 kg/km / 100 = 327,888 €/km
  const r = metallzuschlag({ notiz: '900', basis: '150', metallzahl: '43,2', meter: '100' }).ergebnis;
  assert.equal(r.jeKm, 327.89);
  assert.equal(r.jeMeter, 0.3279);
  assert.equal(r.gesamt, 32.79); // 100 m
  assert.equal(r.differenz, 759);
});

test('Ohne Bezugskosten, deutsche Zahlen mit Tausenderpunkt', () => {
  const r = metallzuschlag({ notiz: '1.050,50', basis: '150', metallzahl: '120', meter: '1.000', bezugskosten: false }).ergebnis;
  assert.equal(r.jeKm, 1080.6); // (1050,5 − 150) × 120 / 100
  assert.equal(r.gesamt, 1080.6);
});

test('Notiz unter Basis: kein negativer Zuschlag, außer Gutschrift ist gewollt', () => {
  const r = metallzuschlag({ notiz: '100', basis: '150', metallzahl: '100', meter: '1000' }).ergebnis;
  assert.equal(r.gesamt, 0);
  assert.match(r.hinweis, /kein Zuschlag/);
  const g = metallzuschlag({ notiz: '100', basis: '150', metallzahl: '100', meter: '1000', gutschrift: true }).ergebnis;
  assert.equal(g.gesamt, -49); // (101 − 150) × 100 / 100
});

test('Fehler: fehlende Notiz, Metallzahl, Länge', () => {
  assert.match(metallzuschlag({ notiz: '', basis: '150', metallzahl: '43', meter: '10' }).fehler, /Tagesnotiz/);
  assert.match(metallzuschlag({ notiz: '900', basis: '150', metallzahl: '0', meter: '10' }).fehler, /Metallzahl/);
  assert.match(metallzuschlag({ notiz: '900', basis: '150', metallzahl: '43', meter: '' }).fehler, /Länge/);
});

test('Notiz-Datum: Pflicht, nicht Zukunft, älter als 31 Tage = Hinweis', () => {
  assert.match(notizDatumPruefen('', '2026-10-16').fehler, /Datum/);
  assert.match(notizDatumPruefen('2026-10-17', '2026-10-16').fehler, /Zukunft/);
  assert.equal(notizDatumPruefen('2026-10-16', '2026-10-16').alt, false);
  assert.equal(notizDatumPruefen('2026-09-01', '2026-10-16').alt, true);
});

test('Positionstext nachvollziehbar und Sammelrechnung über mehrere Kabel', () => {
  const t = positionsText({ metall: 'kupfer', kabel: 'NYM-J 3×1,5', notiz: 900, notizDatum: '2026-10-15', basis: 150, metallzahl: 43.2, meter: 100 });
  assert.match(t, /DEL-Notiz 900,00 €\/100 kg vom 15\.10\.2026 zzgl\. 1 % Bezugskosten, Basis 150,00/);
  assert.match(t, /100 m × Metallzahl 43,2 kg\/km/);
  const s = sammelRechnung([{ kabel: 'A', metallzahl: '43,2', meter: '100' }, { kabel: 'B', metallzahl: '', meter: '50' }, { kabel: '', metallzahl: '', meter: '' }], { notiz: '900', basis: '150' });
  assert.equal(s.zeilen.length, 2);
  assert.equal(s.summe, 32.79);
  assert.match(s.zeilen[1].fehler, /Metallzahl/);
  assert.ok(KUPFERZAHLEN.every((k) => k.kgKm > 0));
});

test('Sperre: Übernahme in Angebot/Rechnung aus bis Anwalt (R66), in Zentrale und Gedächtnis', () => {
  assert.equal(START_FREIGABE.metallzuschlag, false);
  assert.equal(startFrei('metallzuschlag'), false);
  assert.equal(startFrei('metallzuschlag', { metallzuschlag: true }), true);
  assert.match(fs.readFileSync(new URL('../lib/freigabeZentrale.ts', import.meta.url), 'utf8'), /metallzuschlag: \{ titel: [^}]*anwalt: 'R66' \}/);
  assert.match(fs.readFileSync(new URL('../docs/ARGONAUT-SPERR-GEDAECHTNIS.md', import.meta.url), 'utf8'), /SCHALTER startSperre\.metallzuschlag = aus/);
});
