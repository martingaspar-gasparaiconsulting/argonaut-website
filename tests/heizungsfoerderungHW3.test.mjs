import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { schaetzen, klimabonusSatz, einkommensbonusSatz, kostenGrenze, klimabonusMoeglich, BEKANNT_BIS, ABLAUF } from '../out/heizungsfoerderung.js';
import { START_FREIGABE, startFrei } from '../out/startSperre.js';

// HW-3 (16.10.2026) — KfW 458 Heizungsförderung, Stand 21.07.2026

const basis = { datum: '2026-10-16', selbstgenutzt: true, alteHeizung: 'oel', alterJahre: 25, funktionstuechtig: true, einkommen: null, kindUnter18: false, wohneinheiten: 1, kosten: 35000 };

test('Einfamilienhaus, Ölheizung, ohne Einkommensangabe: 30 + 16 = 46 % von 28.000 €', () => {
  const r = schaetzen(basis).ergebnis;
  assert.equal(r.satz, 46);
  assert.equal(r.foerderfaehig, 28000);
  assert.equal(r.zuschuss, 12880);
});

test('Deckel: 70 % im Regelfall, 80 % nur mit 40 % Einkommensbonus', () => {
  assert.equal(schaetzen({ ...basis, einkommen: 35000 }).ergebnis.satz, 70); // 30+16+30 = 76 → 70
  const n = schaetzen({ ...basis, einkommen: 25000 }).ergebnis;
  assert.equal(n.satz, 80); // 30+16+40 = 86 → 80
  assert.equal(n.zuschuss, 22400);
});

test('Einkommensbonus: Stufen und Kind unter 18 (−10.000 €)', () => {
  assert.equal(einkommensbonusSatz(30000, false), 40);
  assert.equal(einkommensbonusSatz(40000, false), 30);
  assert.equal(einkommensbonusSatz(50000, false), 10);
  assert.equal(einkommensbonusSatz(50001, false), 0);
  assert.equal(einkommensbonusSatz(55000, true), 10);
  assert.equal(einkommensbonusSatz(null, false), 0);
});

test('Klimabonus: 16 % bis Januar 2027, dann halbjährlich −4, ab 01.08.2028 aus', () => {
  assert.equal(klimabonusSatz('2027-01-31'), 16);
  assert.equal(klimabonusSatz('2027-02-01'), 12);
  assert.equal(klimabonusSatz('2027-08-01'), 8);
  assert.equal(klimabonusSatz('2028-01-15'), 8, 'Januar zählt noch nicht als neuer Schritt');
  assert.equal(klimabonusSatz('2028-02-01'), 4);
  assert.equal(klimabonusSatz('2028-08-01'), 0);
  assert.ok(!klimabonusMoeglich({ ...basis, alteHeizung: 'gas', alterJahre: 15 }).ja);
  assert.ok(klimabonusMoeglich({ ...basis, alteHeizung: 'gas', alterJahre: 20 }).ja);
  assert.ok(!klimabonusMoeglich({ ...basis, selbstgenutzt: false }).ja);
});

test('Vermieter: nur 30 %, kein Einkommensbonus', () => {
  const r = schaetzen({ ...basis, selbstgenutzt: false, einkommen: 20000 }).ergebnis;
  assert.equal(r.satz, 30);
});

test('Kostengrenzen: 28.000 + 15.000 je WE 2–6 + 8.000 ab 7, Absenkung ab Februar 2027', () => {
  assert.equal(kostenGrenze(1, '2026-10-16'), 28000);
  assert.equal(kostenGrenze(3, '2026-10-16'), 58000);
  assert.equal(kostenGrenze(8, '2026-10-16'), 28000 + 5 * 15000 + 2 * 8000);
  assert.equal(kostenGrenze(1, '2027-02-01'), 27250);
  assert.equal(kostenGrenze(1, '2035-01-01'), 22000, 'nie unter 22.000 €');
});

test('Fehler und Ablauf in der richtigen Reihenfolge (Vertrag mit Bedingung vor Antrag, Antrag vor Beginn)', () => {
  assert.match(schaetzen({ ...basis, kosten: 0 }).fehler, /Kosten/);
  const s = ABLAUF.map((a) => a.schritt);
  assert.ok(s.indexOf('Vertrag mit Bedingung') < s.indexOf('Antrag'));
  assert.ok(s.indexOf('Antrag') < s.indexOf('Einbau'));
});

test('WÄCHTER: Fördersätze nach dem bekannten Stand prüfen (Wärmepumpe 2027 angekündigt)', () => {
  const heute = new Date().toISOString().slice(0, 10);
  assert.ok(heute <= BEKANNT_BIS, `KfW-458-Sätze nach ${BEKANNT_BIS} prüfen und lib/heizungsfoerderung.ts nachziehen`);
});

test('Sperre: Kunden-Unterlage aus bis Anwalt (R67), in Zentrale und Gedächtnis', () => {
  assert.equal(START_FREIGABE.foerderantrag, false);
  assert.equal(startFrei('foerderantrag'), false);
  assert.match(fs.readFileSync(new URL('../lib/freigabeZentrale.ts', import.meta.url), 'utf8'), /foerderantrag: \{ titel: [^}]*anwalt: 'R67' \}/);
  assert.match(fs.readFileSync(new URL('../docs/ARGONAUT-SPERR-GEDAECHTNIS.md', import.meta.url), 'utf8'), /SCHALTER startSperre\.foerderantrag = aus/);
});
