// ============================================================================
// tests/centRundungP191.test.mjs — Paket 191: Cent-Rundung ohne Gleitkomma-Fehler
//
// BEFUND (30.09.2026, am echten Code gemessen):
//   centRunden = Math.round((|n| + Number.EPSILON) * 100) / 100
//   Der EPSILON-Zuschlag wirkt nur bei Werten um 1. Ab ca. 2 Euro rundete die
//   Funktion halbe Cent-Betraege nach UNTEN:
//     0,5 Stk × 8,79 €  = 4,395 -> 4,39 statt 4,40
//     19 % von 42,50 €  = 8,075 -> 8,07 statt 8,08
//   Halbe Cent 0,005 … 9.999,995 (1 Mio. Faelle): 65.613 falsch.
//   Halbe Stueck × Preis (2 Mio. Faelle):         54.905 falsch.
//
// GoBD: gespeicherte Belege, deren Summen mit der alten Rundung entstanden,
// werden beim Neu-Rendern (PDF, ZUGFeRD) weiter mit der alten Rundung gezeigt.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { centRunden, rundeStellen, inCent, centRundenBis191 } from '../out/zahlen.js';
import { steuerGruppen, rundungWieGespeichert } from '../out/steuerLogik.js';
import { baueZugferdXml } from '../out/zugferd.js';
import { rechneAngebot, positionsNetto } from '../out/angebotRabatt.js';
import { angebotsSummen, positionsNetto as kalkNetto } from '../out/kalkulatorUebergabe.js';
import { offenerRest, pruefeZahlbetrag } from '../out/zahlungErfassen.js';
import { cent as gebuehrCent } from '../out/gebuehrenHonorare.js';
import { runde as holzRunde } from '../out/holzLogik.js';
import { runde3 as formelRunde } from '../out/aufmassFormel.js';
import { rundeAuf } from '../out/gaeb.js';
import { preisGenau } from '../out/positionsLogik.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

/** Exakte Referenz: Wert in Tausendstel (BigInt), halbe Cent weg von der Null. */
function referenzAusMilli(milli) {
  const vz = milli < 0n ? -1n : 1n;
  const a = milli * vz;
  return Number(vz * ((a + 5n) / 10n)) / 100;
}

// ---------------------------------------------------------------------------
// 1. Die gemessenen Faelle
// ---------------------------------------------------------------------------

test('BEFUND: 0,5 × 8,79 € = 4,40 € und 19 % von 42,50 € = 8,08 €', () => {
  assert.equal(centRundenBis191(0.5 * 8.79), 4.39, 'alte Fassung rundete ab (Gegenprobe des Befunds)');
  assert.equal(centRunden(0.5 * 8.79), 4.4);
  assert.equal(centRundenBis191(42.5 * 0.19), 8.07);
  assert.equal(centRunden(42.5 * 0.19), 8.08);
  assert.equal(centRunden(1.005), 1.01);
  assert.equal(centRunden(2.675), 2.68);
});

test('alle halben Cent von 0,005 bis 9.999,995 (1 Mio. Faelle): kein einziger falsch', () => {
  let falsch = 0, altFalsch = 0;
  for (let c = 0; c < 1_000_000; c++) {
    const milli = BigInt(c) * 10n + 5n;
    const x = Number(milli) / 1000;
    const soll = referenzAusMilli(milli);
    if (centRunden(x) !== soll) falsch++;
    if (centRunden(-x) !== -soll) falsch++;
    if (centRundenBis191(x) !== soll) altFalsch++;
  }
  assert.equal(falsch, 0);
  assert.equal(altFalsch, 65613, 'Befund reproduziert');
});

test('Menge in halben Stueck × Preis (2 Mio. Faelle): kein einziger falsch', () => {
  let falsch = 0;
  for (let mh = 1; mh <= 40; mh++) {
    for (let pc = 1; pc <= 50_000; pc++) {
      const soll = referenzAusMilli(BigInt(mh) * BigInt(pc) * 5n);
      if (centRunden((mh / 2) * (pc / 100)) !== soll) falsch++;
    }
  }
  assert.equal(falsch, 0);
});

test('200.000 Zufallsbetraege Menge (3 Stellen) × Preis (2 Stellen) stimmen exakt', () => {
  let seed = 191;
  const zufall = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  for (let i = 0; i < 200_000; i++) {
    const m = BigInt(zufall() % 100_000);   // 0,000 … 99,999
    const p = BigInt(zufall() % 1_000_000); // 0,00 … 9.999,99
    const exakt = m * p;                      // 1/100000 Euro
    const soll = Number((exakt + 500n) / 1000n) / 100;
    assert.equal(centRunden((Number(m) / 1000) * (Number(p) / 100)), soll);
  }
});

test('Grenzen: nicht endlich -> 0, kein -0, grosse und winzige Werte, Cent-Betraege bleiben', () => {
  assert.equal(centRunden(NaN), 0);
  assert.equal(centRunden(Infinity), 0);
  assert.ok(Object.is(centRunden(-0.004), 0), 'kein -0');
  assert.equal(centRunden(1.23e-7), 0);
  assert.equal(centRunden(1e21), 1e21);
  assert.equal(centRunden(9_999_999_999_999.99), 9_999_999_999_999.99);
  for (let c = -100_000; c <= 100_000; c += 7) assert.equal(centRunden(c / 100), c / 100);
  assert.equal(rundeStellen(4.3955, 3), 4.396);
  assert.equal(rundeStellen(-2.3455, 3), -2.346);
  assert.equal(rundeStellen(113.725, 4), 113.725);
  assert.equal(rundeStellen(439.5, 0), 440);
});

test('inCent: ganze Cent ohne Binaerfehler', () => {
  assert.equal(Math.round(0.5 * 8.79 * 100), 439, 'Gegenprobe: so rechneten Angebote bisher');
  assert.equal(inCent(0.5 * 8.79), 440);
  assert.equal(inCent(-4.395), -440);
  assert.equal(inCent(12.34), 1234);
});

// ---------------------------------------------------------------------------
// 2. Steuer und GoBD-Wiedergabe
// ---------------------------------------------------------------------------

test('Steuer je Gruppe: 19 % auf 42,50 € = 8,08 €, Brutto 50,58 €', () => {
  const s = steuerGruppen([{ netto: 42.5, satz: 19 }]);
  assert.equal(s.steuer, 8.08);
  assert.equal(s.brutto, 50.58);
  const alt = steuerGruppen([{ netto: 42.5, satz: 19 }], centRundenBis191);
  assert.equal(alt.steuer, 8.07, 'mit alter Rundung wie bisher');
});

test('alle halben Cent-Steuerbetraege bei 19 % und 7 % (40.000 Faelle) stimmen', () => {
  let falsch = 0, altFalsch = 0;
  for (const satz of [19, 7]) {
    for (let c = 1; c < 2_000_000; c++) {
      const ex = BigInt(c) * BigInt(satz); // in 1/10000 Euro
      if (ex % 100n !== 50n) continue;
      const soll = Number((ex + 50n) / 100n) / 100;
      if (steuerGruppen([{ netto: c / 100, satz }]).steuer !== soll) falsch++;
      if (steuerGruppen([{ netto: c / 100, satz }], centRundenBis191).steuer !== soll) altFalsch++;
    }
  }
  assert.equal(falsch, 0);
  assert.equal(altFalsch, 604, 'Befund reproduziert');
});

test('GoBD: alte Rechnung (gespeichert 8,07 Steuer) wird mit alter Rundung wiedergegeben', () => {
  const posten = [{ netto: 42.5, satz: 19 }];
  const alt = rundungWieGespeichert(() => posten, { netto: 42.5, steuer: 8.07, brutto: 50.57 });
  assert.equal(alt.alteRundung, true);
  assert.equal(steuerGruppen(posten, alt.rundung).steuer, 8.07);

  const neu = rundungWieGespeichert(() => posten, { netto: 42.5, steuer: 8.08, brutto: 50.58 });
  assert.equal(neu.alteRundung, false);
  assert.equal(steuerGruppen(posten, neu.rundung).steuer, 8.08);

  assert.equal(rundungWieGespeichert(() => posten, null).alteRundung, false, 'ohne Speicherstand: neu');
  assert.equal(rundungWieGespeichert(() => posten, { netto: 99, steuer: 99, brutto: 99 }).alteRundung, false,
    'passt keine: neu (Abweichungs-Hinweis greift)');
  // Rechnung ohne Rundungsgrenze: beide passen -> neue Rundung
  assert.equal(rundungWieGespeichert(() => [{ netto: 100, satz: 19 }], { netto: 100, steuer: 19, brutto: 119 }).alteRundung, false);
});

test('ZUGFeRD: gespeicherte alte Rechnung behaelt 8,07 €, neue Rechnung zeigt 8,08 €', () => {
  const basis = {
    positionen: [{ bezeichnung: 'Leistung', menge: 1, einzelpreis: 42.5, gesamt_netto: 42.5, mwst_satz: 19 }],
    aussteller: { name: 'Muster GmbH', adresse: { strasse: 'Weg 1', plz: '71032', ort: 'Boeblingen' }, ust_idnr: 'DE123456789' },
    empfaenger: { name: 'Kunde GmbH', adresse: { strasse: 'Str. 1', plz: '70173', ort: 'Stuttgart' } },
    profil: 'zugferd',
  };
  const steuer = (xml) => (xml.match(/<ram:TaxTotalAmount[^>]*>([-0-9.]+)<\/ram:TaxTotalAmount>/) || [])[1];
  const alt = baueZugferdXml({ ...basis, rechnung: { rechnungsnummer: 'RE-1', rechnungsdatum: '2026-09-01', netto_summe: 42.5, mwst_summe: 8.07, brutto_summe: 50.57 } });
  assert.equal(steuer(alt.xml), '8.07');
  const neu = baueZugferdXml({ ...basis, rechnung: { rechnungsnummer: 'RE-2', rechnungsdatum: '2026-10-01', netto_summe: 42.5, mwst_summe: 8.08, brutto_summe: 50.58 } });
  assert.equal(steuer(neu.xml), '8.08');
});

// ---------------------------------------------------------------------------
// 3. Angebot, Kalkulator, Zahlung, Gebuehren
// ---------------------------------------------------------------------------

test('Angebot: 0,5 × 8,79 € ergibt 4,40 € netto, Rechnung aus dem Angebot rechnet gleich', () => {
  const a = rechneAngebot([{ menge: 0.5, einzelpreis: 8.79, mwst_satz: 19 }], 0);
  assert.equal(a.netto, 4.4);
  assert.equal(positionsNetto(0.5, 8.79, 0), 4.4);
  assert.equal(a.positionen[0].netto, positionsNetto(0.5, 8.79, 0), 'Angebot und Rechnung identisch');
  const b = rechneAngebot([{ menge: 1, einzelpreis: 42.5, mwst_satz: 19 }], 0);
  assert.equal(b.mwst, 8.08);
  assert.equal(b.brutto, 50.58);
});

test('Kalkulator-Uebergabe: Positionsnetto und Summen ohne Cent-Verlust', () => {
  assert.equal(kalkNetto(0.5, 8.79), 4.4);
  const s = angebotsSummen([{ menge: 0.5, einzelpreis: 8.79, mwst_satz: 19 }, { menge: 1, einzelpreis: 10.5, mwst_satz: 19 }]);
  assert.equal(s.netto, 14.9);
});

test('Zahlung: offener Rest und Zahlbetrag centgenau', () => {
  assert.equal(offenerRest(12.5, 8.1), 4.4);
  assert.equal(offenerRest(10, 12), 0);
  assert.equal(pruefeZahlbetrag('4,395', 10).betrag, 4.4);
});

test('Gebuehren (RVG/GOT): Euro -> ganze Cent ohne Verlust', () => {
  assert.equal(gebuehrCent(4.395), 440);
  assert.equal(gebuehrCent(-4.395), -440);
  assert.equal(gebuehrCent(10.5), 1050);
});

// ---------------------------------------------------------------------------
// 4. Die Kopien rechnen wie das Original
// ---------------------------------------------------------------------------

test('holzLogik.runde, aufmassFormel.runde3, gaeb.rundeAuf, preisGenau = rundeStellen', () => {
  let seed = 7;
  const zufall = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  for (let i = 0; i < 50_000; i++) {
    const x = ((zufall() % 20_000_000) - 10_000_000) / 10_000 + (i % 3 === 0 ? 0.00005 : 0);
    for (const st of [0, 1, 2, 3, 4]) {
      const soll = rundeStellen(x, st);
      assert.equal(holzRunde(x, st), soll);
      assert.equal(formelRunde(x, st), soll);
      assert.equal(rundeAuf(x, st), soll);
    }
    assert.equal(preisGenau(x), rundeStellen(x, 4));
  }
});

// ---------------------------------------------------------------------------
// 5. Waechter: keine neue EPSILON-Rundung, lokale Math.round-Cent-Runder nur weniger
// ---------------------------------------------------------------------------

function alleDateien() {
  const out = [];
  const lauf = (d) => {
    for (const e of fs.readdirSync(path.join(WURZEL, d), { withFileTypes: true })) {
      const rel = path.posix.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') lauf(rel); }
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
    }
  };
  for (const d of ['app', 'lib', 'components']) lauf(d);
  return out;
}

test('WAECHTER: Number.EPSILON-Rundung gibt es nur noch eingefroren in lib/zahlen.ts', () => {
  const funde = [];
  for (const f of alleDateien()) {
    if (f === 'lib/zahlen.ts') continue;
    const s = fs.readFileSync(path.join(WURZEL, f), 'utf8');
    if (/Number\.EPSILON\)?\s*\)?\s*\*/.test(s)) funde.push(f);
  }
  assert.deepEqual(funde, [], 'Bitte centRunden/rundeStellen aus lib/zahlen.ts nehmen');
});

test('WAECHTER: lokale Math.round(x * 100) / 100 werden nur weniger (Stand Paket 191: 115)', () => {
  let n = 0;
  for (const f of alleDateien()) {
    const s = fs.readFileSync(path.join(WURZEL, f), 'utf8');
    n += (s.match(/Math\.round\([^;\n]*\*\s*100\)?\s*\)\s*\/\s*100\b/g) || []).length;
  }
  assert.ok(n <= 115, `${n} lokale Cent-Runder — neue bitte ueber centRunden (lib/zahlen.ts)`);
});

test('WAECHTER: Geld-Kern rechnet ueber lib/zahlen.ts', () => {
  const kern = {
    'lib/angebotRabatt.ts': /inCent\(/,
    'app/dashboard/angebote/page.tsx': /inCent\(/,
    'lib/kalkulatorUebergabe.ts': /inCent\(/,
    'lib/zahlungErfassen.ts': /centRunden\(/,
    'app/api/kunde-abo/route.ts': /centRunden\(/,
    'app/api/admin/abo-einzug/route.ts': /centRunden\(/,
    'app/api/rechnung-pdf/route.ts': /rundungWieGespeichert\(/,
    'lib/zugferd.ts': /rundungWieGespeichert\(/,
  };
  for (const [f, muster] of Object.entries(kern)) {
    const s = fs.readFileSync(path.join(WURZEL, f), 'utf8');
    assert.ok(muster.test(s), f);
    assert.ok(!/Math\.round\([^;\n]*\*\s*100\)\s*(\/\s*100)?[;,)\n ]/.test(s.replace(/\/\/.*$/gm, '')), 'lokaler Cent-Runder in ' + f);
  }
});
