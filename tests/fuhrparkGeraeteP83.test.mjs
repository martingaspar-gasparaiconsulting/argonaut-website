// Paket PJ (24.09.2026) — Fuhrpark-Akte, Geraete-Akte, QR-Etiketten.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leseZahl, ampel, FAHRZEUG_FRISTEN, fahrzeugFristen, schlimmsteAmpel, EINTRAG_ARTEN, kmWarnungen, aktuellerKm,
  kostenAuswertung, offeneSchaeden, aktuellerFahrer, fahrzeugHinweise, GERAET_ARTEN, geraetStand, geraetHinweise,
  geraeteZahlen, akteLink, qrSvg,
} from '../out/fuhrparkGeraete.js';

const HEUTE = '2026-09-24';
const ID = '3f2a9c1e-8b7d-4e21-9a55-0c6d1e2f3a4b';

test('Zahlen lesen: deutsch, Tausender, nie NaN', () => {
  assert.equal(leseZahl('1.234,56'), 1234.56);
  assert.equal(leseZahl('12.345'), 12345);
  assert.equal(leseZahl('45,8 l'), 45.8);
  assert.equal(leseZahl('89,90 €'), 89.9);
  assert.equal(leseZahl('12.5'), 12.5);
  assert.equal(leseZahl(''), null);
  assert.equal(leseZahl('abc'), null);
  assert.equal(leseZahl(NaN), null);
});

test('Fristen: Pflicht ohne Datum fehlt, Leasing erst 90 Tage vorher gelb', () => {
  const f = { tuev_bis: '2026-10-10', wartung_bis: null, versicherung_bis: '2027-01-01', leasing_ende: '2026-12-01' };
  const fr = fahrzeugFristen(f, HEUTE);
  const nach = Object.fromEntries(fr.map((x) => [x.key, x.ampel]));
  assert.equal(nach.tuev_bis, 'bald');
  assert.equal(nach.uvv_bis, 'fehlt');
  assert.equal(nach.wartung_bis, undefined, 'keine Pflicht, kein Datum -> gar nicht zeigen');
  assert.equal(nach.versicherung_bis, 'ok');
  assert.equal(nach.leasing_ende, 'bald');
  assert.equal(schlimmsteAmpel(fr), 'fehlt');
  assert.equal(schlimmsteAmpel(fahrzeugFristen({ tuev_bis: '2026-09-01', uvv_bis: '2027-05-01' }, HEUTE)), 'ueberfaellig');
  assert.equal(ampel('2026-09-24', HEUTE).tage, 0);
  assert.ok(FAHRZEUG_FRISTEN.find((x) => x.key === 'uvv_bis').grundlage.includes('DGUV Vorschrift 70'));
});

test('km-Staende: Rueckschritt wird gemeldet, nicht korrigiert', () => {
  const e = [
    { art: 'km', datum: '2026-09-01', km_stand: 50000 },
    { art: 'tanken', datum: '2026-09-10', km_stand: '49.500' },
    { art: 'tanken', datum: '2026-09-15', km_stand: 50800 },
  ];
  const w = kmWarnungen(e);
  assert.equal(w.length, 1);
  assert.match(w[0].text, /10\.09\.2026/);
  assert.equal(aktuellerKm(48000, e), 50800);
  assert.equal(aktuellerKm(null, []), null);
});

test('Kosten: Summe je Art und Monat, je km, fehlende Betraege gezaehlt', () => {
  const e = [
    { art: 'tanken', datum: '2026-08-02', km_stand: 10000, betrag_brutto: '80,00', menge: 50 },
    { art: 'werkstatt', datum: '2026-08-20', betrag_brutto: 420.5 },
    { art: 'tanken', datum: '2026-09-01', km_stand: 10600, betrag_brutto: 72, menge: 40 },
    { art: 'tanken', datum: '2026-09-15', km_stand: 11000, betrag_brutto: 60, menge: 26 },
    { art: 'reifen', datum: '2026-09-20', betrag_brutto: null },
    { art: 'schaden', datum: '2026-09-21', betrag_brutto: 999 }, // Schaden ist keine Kostenart
  ];
  const k = kostenAuswertung(e);
  assert.equal(k.gesamt, 632.5);
  assert.equal(k.jeArt.tanken, 212);
  assert.equal(k.jeArt.werkstatt, 420.5);
  assert.deepEqual(k.jeMonat, [{ monat: '2026-08', betrag: 500.5 }, { monat: '2026-09', betrag: 132 }]);
  assert.equal(k.km, 1000);
  assert.equal(k.jeKm, 0.633);
  assert.equal(k.ohneBetrag, 1);
  // Verbrauch: (40 + 26) l / 1000 km = 6,6 l/100 km — die erste Tankung zaehlt nicht
  assert.equal(k.verbrauch, 6.6);
  // Zeitraum
  assert.equal(kostenAuswertung(e, '2026-09-01', '2026-09-30').gesamt, 132);
});

test('Verbrauch nur, wenn die Daten es hergeben', () => {
  assert.equal(kostenAuswertung([{ art: 'tanken', datum: '2026-09-01', km_stand: 1000, menge: 40 }]).verbrauch, null);
  assert.equal(kostenAuswertung([
    { art: 'tanken', datum: '2026-09-01', km_stand: 1000, menge: 40 },
    { art: 'tanken', datum: '2026-09-05', km_stand: null, menge: 30 },
    { art: 'tanken', datum: '2026-09-09', km_stand: 1800, menge: 35 },
  ]).verbrauch, null, 'eine Tankung ohne km -> keine Zahl');
  const k = kostenAuswertung([{ art: 'km', datum: '2026-09-01', km_stand: 500 }]);
  assert.equal(k.km, null);
  assert.equal(k.jeKm, null);
});

test('Schaeden und Fahrer', () => {
  const e = [
    { art: 'schaden', datum: '2026-09-01', erledigt: true },
    { art: 'schaden', datum: '2026-09-10', erledigt: false },
    { art: 'uebergabe', datum: '2026-08-01', fahrer_name: 'Franz' },
    { art: 'uebergabe', datum: '2026-09-02', fahrer_name: 'Simone' },
  ];
  assert.equal(offeneSchaeden(e).length, 1);
  assert.equal(aktuellerFahrer('Philip', e), 'Simone');
  assert.equal(aktuellerFahrer('Philip', []), 'Philip');
  assert.equal(aktuellerFahrer('', []), null);
  const h = fahrzeugHinweise({ tuev_bis: '2026-09-01', uvv_bis: '2027-01-01' }, e, HEUTE);
  assert.equal(h[0].stufe, 'rot');
  assert.ok(h.some((x) => /offener Schaden/.test(x.text)));
  assert.ok(EINTRAG_ARTEN.filter((a) => a.mitarbeiter).every((a) => ['tanken', 'laden', 'km', 'schaden', 'uebergabe'].includes(a.key)));
});

test('Geraet: Ausgabe, Rueckgabe, Defekt, Reparatur, Pruefung', () => {
  const e = [
    { art: 'ausgabe', datum: '2026-08-01', person_name: 'Franz' },
    { art: 'rueckgabe', datum: '2026-08-05', standort: 'Lager Halle 2' },
    { art: 'ausgabe', datum: '2026-08-10', person_name: 'Simone' },
    { art: 'defekt', datum: '2026-09-01' },
    { art: 'defekt', datum: '2026-09-03' },
  ];
  const s = geraetStand(e, HEUTE, 'Werkstatt', '2027-03-01');
  assert.equal(s.bei, 'Simone');
  assert.equal(s.seit, '2026-08-10');
  assert.equal(s.tageAusgegeben, 45);
  assert.equal(s.defekt, true);
  assert.equal(s.defektSeit, '2026-09-01', 'der erste Defekt zaehlt');
  assert.equal(s.standort, 'Lager Halle 2');
  const h = geraetHinweise(s, HEUTE);
  assert.equal(h[0].stufe, 'rot');
  assert.ok(h.some((x) => /45 Tagen bei Simone/.test(x.text)));

  const rep = geraetStand([...e, { art: 'reparatur', datum: '2026-09-10' }, { art: 'rueckgabe', datum: '2026-09-11' }], HEUTE);
  assert.equal(rep.defekt, false);
  assert.equal(rep.bei, null);

  const pr = geraetStand([{ art: 'pruefung', datum: '2026-09-20', bestanden: false, naechste_pruefung_am: '2027-09-20' }], HEUTE, null, '2026-09-01');
  assert.equal(pr.defekt, true);
  assert.equal(pr.naechstePruefung, '2027-09-20', 'die Pruefung setzt die naechste Frist');
  assert.equal(geraetStand([{ art: 'pruefung', datum: '2026-09-21', bestanden: true }], HEUTE, null, null).defekt, false);
  // ungueltige Daten werden ignoriert, Reihenfolge nach Datum
  const rf = geraetStand([{ art: 'rueckgabe', datum: '2026-09-05' }, { art: 'ausgabe', datum: '2026-09-01', person_name: 'A' }, { art: 'ausgabe', datum: 'kaputt', person_name: 'B' }], HEUTE);
  assert.equal(rf.bei, null);
  assert.equal(geraetStand([{ art: 'ausgabe', datum: '2026-09-01', person_name: '  ' }], HEUTE).bei, 'unbekannt');
});

test('Geraete-Kennzahlen und Pruef-Ampel', () => {
  const st = [
    geraetStand([{ art: 'ausgabe', datum: '2026-09-01', person_name: 'A' }], HEUTE, null, '2026-09-01'),
    geraetStand([{ art: 'defekt', datum: '2026-09-01' }], HEUTE, null, '2026-10-01'),
    geraetStand([], HEUTE, null, null),
  ];
  assert.deepEqual(geraeteZahlen(st, HEUTE), { gesamt: 3, ausgegeben: 1, defekt: 1, pruefungUeberfaellig: 1, pruefungBald: 1 });
  assert.equal(GERAET_ARTEN.find((a) => a.key === 'pruefung').mitarbeiter, false);
});

test('QR-Link: nur eigene Adresse, nur echte ID', () => {
  assert.equal(akteLink('https://argonaut-os.com/', 'geraet', ID), `https://argonaut-os.com/dashboard/erp/inventar/${ID}`);
  assert.equal(akteLink('https://argonaut-os.com', 'fahrzeug', ID.toUpperCase()), `https://argonaut-os.com/dashboard/erp/fuhrpark/${ID}`);
  assert.equal(akteLink('https://argonaut-os.com', 'geraet', '../../admin'), null);
  assert.equal(akteLink('javascript:alert(1)', 'geraet', ID), null);
  assert.equal(akteLink('https://a.de/pfad', 'geraet', ID), null);
});

test('QR-SVG: quadratisch, Ruhezone, nur Pfad-Befehle', () => {
  const { svg, module } = qrSvg(`https://argonaut-os.com/dashboard/erp/inventar/${ID}`);
  assert.ok(module >= 21 + 8);
  assert.match(svg, new RegExp(`viewBox="0 0 ${module} ${module}"`));
  assert.match(svg, /^<svg[^>]+><rect[^>]+fill="#fff"\/><path d="(M\d+ \d+h1v1h-1z)+" fill="#000"\/><\/svg>$/);
  // kein Modul in der Ruhezone
  for (const m of svg.matchAll(/M(\d+) (\d+)/g)) {
    assert.ok(Number(m[1]) >= 4 && Number(m[1]) < module - 4);
    assert.ok(Number(m[2]) >= 4 && Number(m[2]) < module - 4);
  }
});
