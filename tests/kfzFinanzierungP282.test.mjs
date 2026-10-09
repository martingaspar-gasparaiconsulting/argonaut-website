// ============================================================================
// tests/kfzFinanzierungP282.test.mjs — Paket 282 (09.10.2026) · K15b Finanzierungsbeispiel + Konfigurator
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  finanzEinstellung, boerseBereit, rate, effektivZins, beispiel, pflichtZeilen, einstellungHinweise, BEISPIEL_HINWEIS,
  extraKey, extrasLesen, extrasWahl, nachrichtMitExtras, EXTRAS_MAX, FINANZ_KEY, EXTRAS_KEY,
} from '../out/kfzFinanzierung.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const E = { sollzins: 5.99, monate: 48, anzahlungProzent: 20, schlussProzent: 0 };

test('Einstellung: bereinigt, Börse nur vollständig und bestätigt', () => {
  assert.equal(FINANZ_KEY, 'finanzierung'); assert.equal(EXTRAS_KEY, 'extras');
  const leer = finanzEinstellung(null);
  assert.deepEqual([leer.aktiv, leer.sollzins, leer.monate, leer.anzahlungProzent, leer.schlussProzent], [false, null, 48, 20, 0]);
  const e = finanzEinstellung({ aktiv: true, bank: ' Musterbank AG ', anschrift: 'Bankstr. 1, 70173 Stuttgart', sollzins: '5,99', monate: 200, anzahlungProzent: -5, schlussProzent: 30, geprueftAm: '2026-10-09' });
  assert.equal(e.bank, 'Musterbank AG'); assert.equal(e.sollzins, 5.99);
  assert.equal(e.monate, 48, 'unplausible Laufzeit -> Standard'); assert.equal(e.anzahlungProzent, 20);
  assert.equal(e.schlussProzent, 30);
  assert.equal(boerseBereit(e), true);
  assert.equal(boerseBereit({ ...e, geprueftAm: null }), false, 'ohne Bestätigung nie im Inserat');
  assert.equal(boerseBereit({ ...e, anschrift: null }), false);
  assert.equal(boerseBereit({ ...e, sollzins: null }), false);
  assert.equal(boerseBereit({ ...e, aktiv: false }), false);
  assert.equal(finanzEinstellung({ sollzins: 30 }).sollzins, null);
  assert.equal(finanzEinstellung({ aktiv: 'true' }).aktiv, false);
  assert.ok(einstellungHinweise(finanzEinstellung({ aktiv: true })).length >= 4);
  assert.ok(einstellungHinweise(finanzEinstellung({ anzahlungProzent: 50, schlussProzent: 50 })).some((h) => /nichts zu finanzieren/.test(h)));
});

test('Rechnung: Annuität, effektiver Jahreszins, Schlussrate, 0 %', () => {
  const b = beispiel(20000, E);
  assert.deepEqual([b.anzahlung, b.netto, b.anzahlRaten, b.rate, b.gesamt, b.zinsen, b.effektiv], [4000, 16000, 48, 375.69, 18033.12, 2033.12, 6.16]);
  assert.equal(b.effektiv, Math.round((Math.pow(1 + 0.0599 / 12, 12) - 1) * 10000) / 100, 'ohne Gebühren = Monatszins jährlich verzinst');
  const s = beispiel(20000, { ...E, schlussProzent: 30 });
  assert.deepEqual([s.anzahlRaten, s.rate, s.schlussrate, s.gesamt, s.effektiv], [47, 269.75, 6000, 18678.25, 6.16]);
  const null0 = beispiel(20000, { ...E, sollzins: 0 });
  assert.deepEqual([null0.rate, null0.effektiv], [333.34, 0], 'Rate aufgerundet, Raten decken das Darlehen immer');
  assert.ok(null0.rate * 48 >= null0.netto);
  assert.equal(beispiel(null, E), null); assert.equal(beispiel(0, E), null);
  assert.equal(beispiel(20000, { ...E, sollzins: null }), null);
  assert.equal(beispiel(20000, E, { anzahlung: 20000 }), null, 'nichts zu finanzieren');
  assert.equal(beispiel(20000, E, { schluss: 16000 }), null, 'Schlussrate >= Darlehen');
  assert.equal(beispiel(20000, E, { monate: 24, anzahlung: 0 }).netto, 20000);
  assert.equal(beispiel(20000, E, { monate: 500 }).monate, 48);
  assert.equal(effektivZins(1000, [100], 0, 1), null, 'Zahlungen unter dem Darlehen');
  const roh = rate(16000, 48, 5.99, 0);
  assert.ok(roh > 375.68 && roh <= 375.69, String(roh));
});

test('Pflichtangaben vollständig und in fester Reihenfolge', () => {
  const fe = { bank: 'Musterbank AG', anschrift: 'Bankstr. 1, 70173 Stuttgart' };
  const z = pflichtZeilen(beispiel(20000, { ...E, schlussProzent: 30 }), fe).map(([a]) => a);
  assert.deepEqual(z, ['Fahrzeugpreis (Barzahlungspreis)', 'Anzahlung', 'Nettodarlehensbetrag', 'Vertragslaufzeit', 'Gebundener Sollzinssatz p. a.', 'Effektiver Jahreszins', '47 monatliche Raten à', 'Schlussrate', 'Gesamtbetrag', 'Darlehensgeber']);
  const ohne = pflichtZeilen(beispiel(20000, E), fe);
  assert.ok(!ohne.some(([a]) => a === 'Schlussrate'));
  assert.equal(ohne.find(([a]) => a === 'Darlehensgeber')[1], 'Musterbank AG, Bankstr. 1, 70173 Stuttgart');
  assert.equal(ohne.find(([a]) => a === 'Effektiver Jahreszins')[1], '6,16 %');
  assert.match(BEISPIEL_HINWEIS, /§ 17 PAngV/); assert.match(BEISPIEL_HINWEIS, /kein Angebot/);
});

test('Konfigurator: Katalog, Auswahl nur über Schlüssel, Preise vom Server', () => {
  assert.equal(extraKey('Winterräder'), extraKey('WINTERRÄDER'));
  assert.notEqual(extraKey('Winterräder'), extraKey('Winterräder Alu'));
  const roh = [
    { text: ' Winterräder  auf Alufelge ', betrag: '899' }, { text: 'Garantie 24 Monate', betrag: 499.5 },
    { text: 'garantie 24 monate', betrag: 1 }, { text: '', betrag: 5 }, { text: 'Zu teuer', betrag: 100001 }, { text: 'Gratis', betrag: 0 }, 'kaputt',
  ];
  const k = extrasLesen(roh);
  assert.deepEqual(k.map((x) => [x.text, x.betrag]), [['Winterräder auf Alufelge', 899], ['Garantie 24 Monate', 499.5], ['Gratis', 0]]);
  assert.equal(extrasLesen(Array.from({ length: 20 }, (_, i) => ({ text: 'L' + i, betrag: 1 }))).length, EXTRAS_MAX);
  const w = extrasWahl(k, [k[0].key, k[1].key, k[1].key, 'gefaelscht', { betrag: -1 }]);
  assert.deepEqual(w.gewaehlt.map((x) => x.text), ['Winterräder auf Alufelge', 'Garantie 24 Monate']);
  assert.equal(w.summe, 1398.5);
  assert.deepEqual(extrasWahl(k, 'kein Array'), { gewaehlt: [], summe: 0 });
  const n = nachrichtMitExtras('[Webseite · Probefahrt]\nHallo', w.gewaehlt, 20000);
  const z = n.split('\n');
  assert.equal(z[0], '[Webseite · Probefahrt]');
  assert.match(z[1], /Winterräder auf Alufelge \(899,00 €\), Garantie 24 Monate \(499,50 €\)/);
  assert.match(z[2], /Zusammen 1\.398,50 € · Fahrzeug mit Auswahl 21\.398,50 €/);
  assert.equal(z[3], 'Hallo');
  assert.equal(nachrichtMitExtras('[x]', [], 1), '[x]');
  assert.ok(nachrichtMitExtras('[x]\n' + 'a'.repeat(1990), w.gewaehlt, 1).length <= 2000);
});

test('Einbau: Börse, Route, Formular, Einstellungen, Guide', () => {
  const a = lies('app/fahrzeuge/BoerseAnsichten.tsx');
  assert.match(a, /boerseBereit\(fe\) \? beispiel\(f\.vk_brutto, fe\)/);
  assert.match(a, /pflichtZeilen\(fb, fe\)/);
  assert.match(a, /BEISPIEL_HINWEIS/);
  assert.match(a, /extras=\{extras\} preis=\{f\.vk_brutto\}/);
  const r = lies('app/api/oeffentlich/kfz-boerse-anfrage/route.ts');
  assert.match(r, /extrasWahl\(extrasLesen\(roh\[EXTRAS_KEY\]\), b\.extras\)/, 'Preise aus dem Katalog des Betriebs');
  assert.match(r, /email: d\.email, nachricht,/);
  for (const p of ['app/fahrzeuge/[kennung]/[id]/page.tsx', 'app/fahrzeuge-domain/[host]/[id]/page.tsx']) assert.match(lies(p), /roh: b\.roh/, p);
  assert.match(lies('lib/kfzBoerseLaden.ts'), /roh: rows\[0\]\.einstellung/);
  const f = lies('app/fahrzeuge/[kennung]/[id]/AnfrageFormular.tsx');
  assert.match(f, /extras: wahl/);
  assert.doesNotMatch(f, /betrag: wahl|summe\s*\}\)/, 'kein Preis aus dem Browser');
  assert.match(lies('app/dashboard/kfz/bestand/KfzBoerse.tsx'), /<KfzBoerseExtras /);
  assert.match(lies('app/dashboard/kfz/bestand/KfzBoerseExtras.tsx'), /geprueftAm: fin\.geprueft === true/);
  assert.match(lies('lib/guideWissen.ts'), /Paket 282/);
});
