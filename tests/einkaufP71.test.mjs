// Paket PB (24.09.2026) — B02 Rechnungs-Abgleich und B28 Material-Abruf.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normName, gleicherLieferant, normNummer, findeDubletten,
  bestellWerte, pruefeGegenBestellung, bestellVorschlaege, toleranz,
} from '../out/rechnungsAbgleich.js';
import {
  pruefeAbruf, sortiereAbrufe, zaehleAbrufe, NAECHSTE, istStatus,
} from '../out/materialAbruf.js';

// --- Lieferanten-Namen --------------------------------------------------------

test('Rechtsform und Schreibweise stoeren den Vergleich nicht', () => {
  assert.equal(normName('Würth GmbH & Co. KG'), 'wuerth');
  assert.equal(normName('WUERTH'), 'wuerth');
  assert.ok(gleicherLieferant('Adolf Würth GmbH & Co. KG', 'Würth'));
  assert.ok(gleicherLieferant('Hornbach Baumarkt AG', 'hornbach baumarkt'));
  assert.ok(gleicherLieferant('Elektro Maier e.K.', 'Elektro-Maier'));
});

test('verschiedene Lieferanten bleiben verschieden', () => {
  assert.equal(gleicherLieferant('Bau', 'Baustoff Union'), false, 'unter 4 Zeichen zaehlt kein Teiltreffer');
  assert.equal(gleicherLieferant('Maier', 'Meier'), false);
  assert.equal(gleicherLieferant('', 'Würth'), false);
  assert.equal(gleicherLieferant(null, null), false);
  assert.equal(gleicherLieferant('Obi', 'Obi'), true, 'exakt gleich zaehlt auch kurz');
});

test('Rechnungsnummern: Striche, Leerzeichen, fuehrende Nullen', () => {
  assert.equal(normNummer('RE-2026 / 00123'), 'RE202600123');
  assert.equal(normNummer('000123'), '123');
  assert.equal(normNummer('re-123'), normNummer('RE 123'));
});

// --- Dubletten --------------------------------------------------------------

const vorhanden = [
  { id: 'a', lieferant: 'Würth GmbH & Co. KG', belegnummer: 'RE-4711', belegdatum: '2026-09-10', brutto: '1.190,00' },
  { id: 'b', lieferant: 'Hornbach', belegnummer: '88', belegdatum: '2026-09-01', brutto: 59.5 },
];

test('gleiche Nummer beim gleichen Lieferanten = sichere Dublette', () => {
  const d = findeDubletten({ lieferant: 'Würth', belegnummer: 're 4711', brutto: 1190 }, vorhanden);
  assert.equal(d.length, 1);
  assert.equal(d[0].sicher, true);
  assert.equal(d[0].id, 'a');
});

test('gleicher Betrag, 2 Tage auseinander = moegliche Dublette', () => {
  const d = findeDubletten({ lieferant: 'Hornbach', belegnummer: '', belegdatum: '2026-09-03', brutto: '59,50' }, vorhanden);
  assert.equal(d.length, 1);
  assert.equal(d[0].sicher, false);
  assert.match(d[0].grund, /2 Tagen/);
});

test('keine Dublette: anderer Lieferant, anderer Betrag, zu weit auseinander, oder der Beleg selbst', () => {
  assert.equal(findeDubletten({ lieferant: 'Obi', belegnummer: 'RE-4711', brutto: 1190 }, vorhanden).length, 0);
  assert.equal(findeDubletten({ lieferant: 'Hornbach', belegdatum: '2026-09-20', brutto: 59.5 }, vorhanden).length, 0);
  assert.equal(findeDubletten({ lieferant: 'Hornbach', belegdatum: '2026-09-02', brutto: 59.51 }, vorhanden).length, 0);
  assert.equal(findeDubletten({ id: 'a', lieferant: 'Würth', belegnummer: 'RE-4711' }, vorhanden).length, 0);
});

// --- Abgleich mit der Bestellung ---------------------------------------------

const pos = [
  { menge: 10, ek_preis: '12,50', menge_erhalten: 10 },   // 125,00
  { menge: 4, ek_preis: 25, menge_erhalten: 2 },          // bestellt 100, geliefert 50
];

test('Bestell- und Lieferwert, Text-Betraege werden gelesen', () => {
  assert.deepEqual(bestellWerte(pos), { bestellwert: 225, geliefertWert: 175, nichtsGeliefert: false });
});

test('Retoure mindert den gelieferten Wert', () => {
  const w = bestellWerte([{ menge: 10, ek_preis: 10, menge_erhalten: 10, retoure_menge: 3 }]);
  assert.equal(w.geliefertWert, 70);
});

test('saubere Teillieferung: Rechnung = gelieferter Wert -> gelb, Rest offen', () => {
  const a = pruefeGegenBestellung('175,00', pos);
  assert.equal(a.differenzGeliefert, 0);
  assert.equal(a.differenzBestellt, -50);
  assert.equal(a.ampel, 'gelb');
  assert.match(a.meldungen[0], /Teillieferung/);
  assert.match(a.meldungen[0], /50,00 EUR/);
});

test('Preiserhoehung ueber 3 % bei vollstaendiger Lieferung -> rot', () => {
  const voll = [{ menge: 10, ek_preis: 10, menge_erhalten: 10 }]; // 100
  const a = pruefeGegenBestellung(110, voll);
  assert.equal(a.ampel, 'rot');
  assert.ok(a.meldungen.some((m) => /über der Bestellung/.test(m)));
});

test('Rechnung ueber das Gelieferte = ROT, auch wenn sie zur Bestellung passt', () => {
  const a = pruefeGegenBestellung(225, pos);
  assert.equal(a.ampel, 'rot');
  assert.match(a.meldungen[0], /MEHR berechnet als geliefert/);
  assert.equal(a.differenzGeliefert, 50);
});

test('alles geliefert, Betrag passt auf den Cent: gruen', () => {
  const voll = [{ menge: 10, ek_preis: 12.5, menge_erhalten: 10 }];
  const a = pruefeGegenBestellung(125, voll);
  assert.equal(a.ampel, 'gruen');
  assert.match(a.meldungen[0], /passt/);
});

test('Rundung bis 1 EUR bleibt gruen, kleine Preiserhoehung wird gelb', () => {
  const voll = [{ menge: 100, ek_preis: 3, menge_erhalten: 100 }]; // 300
  assert.equal(pruefeGegenBestellung(300.8, voll).ampel, 'gruen');
  // +2 % = 306 -> ueber dem Gelieferten -> rot (mehr berechnet als geliefert)
  assert.equal(pruefeGegenBestellung(306, voll).ampel, 'rot');
  // Rechnung 2 % UNTER Bestellung -> gelb
  assert.equal(pruefeGegenBestellung(294, voll).ampel, 'gelb');
});

test('Toleranz: 1 EUR oder 1 %, was groesser ist', () => {
  assert.equal(toleranz(50), 1);
  assert.equal(toleranz(5000), 50);
});

test('noch nichts geliefert: ROT mit klarer Ansage', () => {
  const a = pruefeGegenBestellung(100, [{ menge: 4, ek_preis: 25, menge_erhalten: 0 }]);
  assert.equal(a.ampel, 'rot');
  assert.match(a.meldungen[0], /KEIN Wareneingang/);
});

test('unlesbarer Nettobetrag: kein Abgleich, gelb, nie 0 angenommen', () => {
  const a = pruefeGegenBestellung('siehe Anlage', pos);
  assert.equal(a.rechnungNetto, null);
  assert.equal(a.ampel, 'gelb');
});

test('Vorschlaege: nur gleicher Lieferant, ohne Entwurf/Storno, beste zuerst', () => {
  const bestellungen = [
    { id: '1', lieferant_name: 'Würth', status: 'geliefert', positionen: [{ menge: 1, ek_preis: 500, menge_erhalten: 1 }] },
    { id: '2', lieferant_name: 'Würth GmbH', status: 'teilgeliefert', positionen: [{ menge: 2, ek_preis: 100, menge_erhalten: 2 }] },
    { id: '3', lieferant_name: 'Würth', status: 'storniert', positionen: [{ menge: 2, ek_preis: 100, menge_erhalten: 2 }] },
    { id: '4', lieferant_name: 'Würth', status: 'entwurf', positionen: [] },
    { id: '5', lieferant_name: 'Obi', status: 'geliefert', positionen: [{ menge: 2, ek_preis: 100, menge_erhalten: 2 }] },
  ];
  const v = bestellVorschlaege({ lieferant: 'Adolf Würth GmbH & Co. KG', netto: '200,00' }, bestellungen);
  assert.deepEqual(v.map((x) => x.bestellung.id), ['2', '1']);
  assert.equal(v[0].passtBetrag, true);
  assert.equal(v[1].passtBetrag, false);
});

// --- Material-Abruf -----------------------------------------------------------

const HEUTE = '2026-09-24';

test('gueltige Anforderung mit deutscher Menge', () => {
  const r = pruefeAbruf({ bezeichnung: '  Silikon   weiß ', menge: '2,5', einheit: 'Kartusche', benoetigt_bis: '2026-09-25' }, HEUTE);
  assert.equal(r.ok, true);
  assert.deepEqual(r.zeile, { bezeichnung: 'Silikon weiß', menge: 2.5, einheit: 'Kartusche', benoetigt_bis: '2026-09-25', notiz: null });
});

test('Menge unlesbar, 0 oder leer: Fehler, NIE still 0', () => {
  assert.equal(pruefeAbruf({ bezeichnung: 'Dübel', menge: 'eine Packung' }, HEUTE).ok, false);
  assert.equal(pruefeAbruf({ bezeichnung: 'Dübel', menge: '0' }, HEUTE).ok, false);
  assert.equal(pruefeAbruf({ bezeichnung: 'Dübel', menge: '' }, HEUTE).ok, false);
  assert.equal(pruefeAbruf({ bezeichnung: 'Dübel', menge: '-3' }, HEUTE).ok, false);
});

test('Bezeichnung Pflicht, Datum nicht in der Vergangenheit', () => {
  assert.equal(pruefeAbruf({ bezeichnung: ' ', menge: 1 }, HEUTE).ok, false);
  assert.equal(pruefeAbruf({ bezeichnung: 'Kabel', menge: 1, benoetigt_bis: '2026-09-23' }, HEUTE).ok, false);
  assert.equal(pruefeAbruf({ bezeichnung: 'Kabel', menge: 1, benoetigt_bis: '24.09.2026' }, HEUTE).ok, false);
  assert.equal(pruefeAbruf({ bezeichnung: 'Kabel', menge: 1, benoetigt_bis: HEUTE }, HEUTE).ok, true, 'heute ist erlaubt');
});

test('Buero-Liste: offene zuerst, dann das frueheste Datum', () => {
  const l = sortiereAbrufe([
    { id: 1, status: 'erledigt', benoetigt_bis: '2026-09-24' },
    { id: 2, status: 'angefordert', benoetigt_bis: null, erstellt_am: '2026-09-20' },
    { id: 3, status: 'angefordert', benoetigt_bis: '2026-09-26' },
    { id: 4, status: 'bestellt', benoetigt_bis: '2026-09-25' },
    { id: 5, status: 'angefordert', benoetigt_bis: '2026-09-25' },
  ]);
  assert.deepEqual(l.map((x) => x.id), [5, 3, 2, 4, 1]);
});

test('Zaehler: offen und eilig (heute oder frueher benoetigt)', () => {
  assert.deepEqual(zaehleAbrufe([
    { status: 'angefordert', benoetigt_bis: '2026-09-24' },
    { status: 'bestellt', benoetigt_bis: '2026-10-01' },
    { status: 'bereit', benoetigt_bis: '2026-09-20' },
  ], HEUTE), { offen: 2, eilig: 1 });
});

test('Statuswege: erledigt und abgelehnt sind Endpunkte', () => {
  assert.deepEqual(NAECHSTE.erledigt, []);
  assert.deepEqual(NAECHSTE.abgelehnt, []);
  assert.ok(NAECHSTE.angefordert.includes('bestellt'));
  assert.equal(istStatus('bereit'), true);
  assert.equal(istStatus('verschwunden'), false);
});
