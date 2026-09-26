// Paket G, Punkte G1 und G2 (26.09.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { zahlFeld, leseZahl } from '../out/zahlen.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('G1 erkannter Wert 119.5 bleibt 119,50 — Hin- und Rückweg', () => {
  for (const [wert, feld] of [[119.5, '119,5'], [1234.56, '1234,56'], [2.125, '2,125'], [19, '19'], [0.07, '0,07']]) {
    assert.equal(zahlFeld(wert), feld);
    assert.equal(leseZahl(zahlFeld(wert)), wert);
  }
  const beleg = lies('app/dashboard/eingangsbelege/page.tsx');
  for (const f of ['netto', 'ust_betrag', 'brutto']) assert.ok(beleg.includes(`zahlFeld(j.${f})`), f);
  const reise = lies('app/dashboard/reisekosten/page.tsx');
  assert.ok(reise.includes('zahlFeld(r.km)') && reise.includes('zahlFeld(r.uebernachtung)'));
});

test('G2 Reisekosten: Bearbeiten übernimmt Mahlzeiten und Notiz', () => {
  const s = lies('app/dashboard/reisekosten/page.tsx');
  assert.ok(/select\('[^']*fruehstueck_anz, mittag_anz, abend_anz, notiz'\)/.test(s));
  assert.ok(s.includes('fruehstueck: String(r.fruehstueck_anz ?? 0)'));
  assert.ok(s.includes("notiz: r.notiz ?? ''"));
  assert.ok(!/fruehstueck: '0', mittag: '0', abend: '0',\n\s*uebernachtung: r\./.test(s));
});

