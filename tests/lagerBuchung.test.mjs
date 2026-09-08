import test from 'node:test';
import assert from 'node:assert/strict';
import {
  standortFuerBuchung, vorzeichen, sichereMenge, bucheBestand, reichtBestand,
  planeUmlagerung, gesamtBestand, bestandIn, verteilung, unterMindest,
  artText, herkunftText, buchungsSatz,
} from '../out/lagerBuchung.js';

const S = (...ids) => ids.map((id) => ({ id }));

// ---------- Welcher Standort gilt? ----------

test('ohne Standorte wird wie bisher gebucht — das ist der heutige Stand', () => {
  // Am 08.09.26 hatte KEIN Betrieb einen Standort. Für alle heutigen Nutzer
  // muss sich damit nichts ändern.
  const w = standortFuerBuchung(null, []);
  assert.equal(w.ok, true);
  assert.equal(w.standortId, null);
  assert.equal(w.grund, 'ohne_standorte');
});

test('bei genau einer Filiale gibt es nichts zu wählen', () => {
  const w = standortFuerBuchung(null, S('f1'));
  assert.equal(w.ok, true);
  assert.equal(w.standortId, 'f1');
  assert.equal(w.grund, 'einziger');
});

test('bei mehreren Filialen und Gesamtansicht wird NICHT geraten', () => {
  const w = standortFuerBuchung(null, S('f1', 'f2'));
  assert.equal(w.ok, false);
  assert.match(w.fehler, /Filiale/);
  assert.match(w.fehler, /wo die Ware liegt/);
});

test('eine gewählte Filiale wird verwendet', () => {
  const w = standortFuerBuchung('f2', S('f1', 'f2'));
  assert.equal(w.ok, true);
  assert.equal(w.standortId, 'f2');
  assert.equal(w.grund, 'gewaehlt');
});

test('eine gelöschte Filiale wird NICHT still durch eine andere ersetzt', () => {
  const w = standortFuerBuchung('weg', S('f1', 'f2'));
  assert.equal(w.ok, false);
  assert.match(w.fehler, /gibt es nicht mehr/);
});

test('Leerzeichen und Unsinn in der Auswahl kippen nichts um', () => {
  assert.equal(standortFuerBuchung('   ', S('f1')).standortId, 'f1');
  assert.equal(standortFuerBuchung(undefined, null).ok, true);
});

// ---------- Mengen ----------

test('sichereMenge ist immer positiv und nie NaN', () => {
  assert.equal(sichereMenge(5), 5);
  assert.equal(sichereMenge(-5), 5, 'die Richtung steckt in der Art, nicht im Vorzeichen');
  assert.equal(sichereMenge('3,5'), 0, 'Komma-Zahlen kommen aufbereitet an, nicht roh');
  assert.equal(sichereMenge('3.5'), 3.5);
  assert.equal(sichereMenge(null), 0);
  assert.equal(sichereMenge('viel'), 0);
});

test('vorzeichen: nur Zugang addiert', () => {
  assert.equal(vorzeichen('zugang'), 1);
  assert.equal(vorzeichen('abgang'), -1);
  assert.equal(vorzeichen('umlagerung'), -1);
});

// ---------- Buchen ----------

test('Zugang und Abgang rechnen richtig', () => {
  assert.equal(bucheBestand(10, 'zugang', 5).neuerBestand, 15);
  assert.equal(bucheBestand(10, 'abgang', 4).neuerBestand, 6);
  assert.equal(bucheBestand(10, 'umlagerung', 4).neuerBestand, 6);
});

test('eine Korrektur SETZT den Bestand, sie verrechnet nicht', () => {
  // Inventur: „hier liegen 7 Stück" — nicht „sieben dazu".
  const r = bucheBestand(100, 'korrektur', 7);
  assert.equal(r.neuerBestand, 7);
  assert.equal(r.warnung, null);
});

test('ein Abgang wird NIE blockiert — auch nicht unter null', () => {
  // Was an der Kasse verkauft wurde, ist verkauft. Eine verweigerte Buchung
  // ändert die Wirklichkeit nicht, sie versteckt sie.
  const r = bucheBestand(2, 'abgang', 5);
  assert.equal(r.neuerBestand, -3);
  assert.ok(r.warnung, 'aber es wird gemeldet');
  assert.match(r.warnung, /trotzdem erfolgt/);
});

test('die Warnung nennt die Zahl und sagt, was zu tun ist', () => {
  const r = bucheBestand(0, 'abgang', 1);
  assert.match(r.warnung, /-1/);
  assert.match(r.warnung, /Zählung/);
  assert.ok(!/\bdu\b|\bdein/i.test(r.warnung));
});

test('bucheBestand verträgt fehlenden Altbestand', () => {
  assert.equal(bucheBestand(null, 'zugang', 3).neuerBestand, 3);
  assert.equal(bucheBestand('Unsinn', 'zugang', 3).neuerBestand, 3);
});

test('Kommastellen laufen nicht auseinander', () => {
  assert.equal(bucheBestand(0.1, 'zugang', 0.2).neuerBestand, 0.3);
});

test('reichtBestand ist nur eine Anzeige, keine Sperre', () => {
  assert.equal(reichtBestand(5, 3), true);
  assert.equal(reichtBestand(5, 5), true);
  assert.equal(reichtBestand(2, 5), false);
  assert.equal(reichtBestand(null, 1), false);
});

// ---------- Umlagerung ----------

test('eine Umlagerung sind ZWEI Buchungen, nie eine', () => {
  const p = planeUmlagerung('a1', { vonId: 'f1', nachId: 'f2', menge: 4 });
  assert.equal(p.ok, true);
  assert.equal(p.abgang.standortId, 'f1');
  assert.equal(p.abgang.art, 'umlagerung');
  assert.equal(p.zugang.standortId, 'f2');
  assert.equal(p.zugang.art, 'zugang');
  assert.equal(p.abgang.menge, p.zugang.menge, 'was rausgeht, kommt an');
});

test('Umlagerung auf sich selbst wird abgewiesen', () => {
  const p = planeUmlagerung('a1', { vonId: 'f1', nachId: 'f1', menge: 4 });
  assert.equal(p.ok, false);
  assert.match(p.fehler, /dieselbe/);
});

test('Umlagerung ohne Menge oder Ziel wird abgewiesen', () => {
  assert.equal(planeUmlagerung('a1', { vonId: 'f1', nachId: 'f2', menge: 0 }).ok, false);
  assert.equal(planeUmlagerung('a1', { vonId: 'f1', nachId: '', menge: 4 }).ok, false);
  assert.equal(planeUmlagerung('', { vonId: 'f1', nachId: 'f2', menge: 4 }).ok, false);
});

// ---------- Zusammenzählen ----------

const ZEILEN = [
  { artikel_id: 'a1', standort_id: 'f1', bestand: 10 },
  { artikel_id: 'a1', standort_id: 'f2', bestand: 4 },
  { artikel_id: 'a2', standort_id: 'f1', bestand: 99 },
  { artikel_id: 'a1', standort_id: null, bestand: 1 },
];

test('gesamtBestand zählt über alle Filialen', () => {
  assert.equal(gesamtBestand(ZEILEN, 'a1'), 15);
  assert.equal(gesamtBestand(ZEILEN, 'a2'), 99);
  assert.equal(gesamtBestand(ZEILEN, 'gibtsnicht'), 0);
  assert.equal(gesamtBestand(null, 'a1'), 0);
});

test('bestandIn unterscheidet „nichts gezählt" von „null Stück"', () => {
  assert.equal(bestandIn(ZEILEN, 'a1', 'f1'), 10);
  assert.equal(bestandIn(ZEILEN, 'a1', null), 1, 'die standortlose Zeile');
  assert.equal(bestandIn(ZEILEN, 'a1', 'f9'), null, 'null, nicht 0');
  assert.equal(bestandIn(ZEILEN, 'a2', 'f2'), null);
});

test('verteilung zeigt die Filialen absteigend', () => {
  const v = verteilung(ZEILEN, 'a1');
  assert.equal(v.length, 3);
  assert.deepEqual(v.map((x) => x.bestand), [10, 4, 1]);
});

test('unterMindest prüft die SUMME, nicht die einzelne Filiale', () => {
  // Zwei halbvolle Regale sind zusammen ein volles.
  assert.equal(unterMindest(gesamtBestand(ZEILEN, 'a1'), 20), true);
  assert.equal(unterMindest(gesamtBestand(ZEILEN, 'a1'), 10), false);
  assert.equal(unterMindest(5, 0), false, 'ohne Mindestbestand keine Warnung');
  assert.equal(unterMindest(5, null), false);
});

// ---------- Klartext ----------

test('alle Klartexte sind deutsch und siezen', () => {
  for (const a of ['zugang', 'abgang', 'korrektur', 'umlagerung']) {
    assert.ok(artText(a).length > 3, a);
  }
  for (const h of ['kasse', 'einkauf', 'bestellung', 'artikel', 'scanner', 'entnahme', 'inventur', 'umlagerung', 'sonstige']) {
    assert.ok(herkunftText(h).length > 4, h);
  }
});

test('buchungsSatz nennt die Filiale, wenn es eine gibt', () => {
  assert.match(buchungsSatz('zugang', 5, 15, 'Filiale Nord'), /in Filiale Nord/);
  assert.ok(!/in /.test(buchungsSatz('zugang', 5, 15, null).replace('Zugang von', '')));
  assert.match(buchungsSatz('korrektur', 7, 7), /auf 7 gesetzt/);
});

test('ein unbekannter Bestand erscheint als Strich, nicht als 0', () => {
  // Number(null) ist 0 — die Falle, in die man hier leicht tritt. „0 Stück"
  // ist eine Aussage über die Wirklichkeit, „unbekannt" ist keine.
  assert.match(buchungsSatz('zugang', null, null), /—/);
  assert.match(buchungsSatz('zugang', 1, undefined), /—/);
  assert.match(buchungsSatz('zugang', 1, ''), /—/);
  // Eine echte 0 bleibt aber eine 0.
  assert.match(buchungsSatz('zugang', 1, 0), /Neuer Bestand: 0\./);
});
