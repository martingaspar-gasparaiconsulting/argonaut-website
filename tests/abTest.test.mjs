import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANTEIL_STANDARD, WARTEZEIT_STUNDEN, MINDESTGRUPPE,
  pruefeMenge, streuzahl, teileAuf, phase, restStunden, PHASE_TEXT,
  ergebnis, fehltZumStart, kurzstand,
} from '../out/abTest.js';

// ============================================================================
// Der A/B-Test darf vor allem eines nicht: einen Sieger nennen, den es nicht
// gibt. Diese Tests halten das fest — und dazu, dass die Aufteilung bei jedem
// Aufruf dieselbe ist. Ein Test, der beim zweiten Lauf anders aufteilt,
// verschickt Mails doppelt.
// ============================================================================

const liste = (n) => Array.from({ length: n }, (_, i) => ({ email: `p${i}@beispiel.de` }));

function versand(zugestellt, geoeffnet) {
  return { empfaenger_anzahl: zugestellt, erfolg_anzahl: zugestellt, geoeffnet_anzahl: geoeffnet };
}

// ------------------------------------------------------------ Menge prüfen

test('zu kleine Liste: kein Test, und das wird deutlich gesagt', () => {
  const b = pruefeMenge(40);
  assert.equal(b.moeglich, false);
  assert.equal(b.jeGruppe, 0);
  assert.match(b.satz, /mindestens 60/);
  assert.match(b.satz, /Zufall/);
});

test('Grenzfall: genau doppelte Mindestgruppe geht gerade noch', () => {
  const b = pruefeMenge(MINDESTGRUPPE * 2);
  assert.equal(b.moeglich, true);
  assert.equal(b.jeGruppe, MINDESTGRUPPE);
  assert.equal(b.empfohlenerAnteil, 50, 'bei knapper Liste muss halbiert werden');
});

test('grosse Liste: der Standard-Anteil genuegt, es braucht keine Haelfte', () => {
  const b = pruefeMenge(1000);
  assert.equal(b.moeglich, true);
  assert.equal(b.empfohlenerAnteil, ANTEIL_STANDARD);
  assert.equal(b.jeGruppe, 200);
  assert.match(b.satz, /600 bekommen anschließend/);
});

test('mittlere Liste: der Anteil waechst, bis die Mindestgruppe erreicht ist', () => {
  const b = pruefeMenge(100);
  assert.equal(b.moeglich, true);
  assert.ok(b.jeGruppe >= MINDESTGRUPPE, 'sonst waere der Test wertlos');
});

test('Unsinn als Menge ergibt kein moeglich', () => {
  assert.equal(pruefeMenge('viele').moeglich, false);
  assert.equal(pruefeMenge(null).moeglich, false);
  assert.equal(pruefeMenge(-20).moeglich, false);
});

// -------------------------------------------------------------- Aufteilen

test('teileAuf: zweimal aufgerufen, zweimal dasselbe', () => {
  const l = liste(200);
  const x = teileAuf(l, 20);
  const y = teileAuf(l, 20);
  assert.deepEqual(x.a.map((e) => e.email), y.a.map((e) => e.email));
  assert.deepEqual(x.b.map((e) => e.email), y.b.map((e) => e.email));
});

test('teileAuf: Gruppen sind gleich gross und ueberschneiden sich nicht', () => {
  const { a, b, rest } = teileAuf(liste(200), 20);
  assert.equal(a.length, 40);
  assert.equal(b.length, 40);
  assert.equal(rest.length, 120);
  const alle = new Set([...a, ...b, ...rest].map((e) => e.email));
  assert.equal(alle.size, 200, 'niemand darf doppelt vorkommen');
});

test('teileAuf: nicht alphabetisch — sonst waeren die Gruppen verzerrt', () => {
  const { a } = teileAuf(liste(200), 20);
  const namen = a.map((e) => e.email);
  const sortiert = [...namen].sort();
  assert.notDeepEqual(namen, sortiert);
});

test('teileAuf: Empfaenger ohne Adresse fallen heraus', () => {
  const l = [...liste(100), { email: '' }, { email: null }, {}];
  const { a, b, rest } = teileAuf(l, 20);
  assert.equal(a.length + b.length + rest.length, 100);
});

test('teileAuf: anderes Streuwort, andere Aufteilung', () => {
  const l = liste(200);
  const x = teileAuf(l, 20, 'lauf-1');
  const y = teileAuf(l, 20, 'lauf-2');
  assert.notDeepEqual(x.a.map((e) => e.email), y.a.map((e) => e.email));
});

test('teileAuf: zu kleiner Anteil legt alles in den Rest statt leere Gruppen zu bilden', () => {
  const { a, b, rest } = teileAuf(liste(4), 20);
  assert.equal(a.length, 0);
  assert.equal(b.length, 0);
  assert.equal(rest.length, 4);
});

test('teileAuf: ueber 50 Prozent geht nicht — sonst bliebe kein Rest', () => {
  const { a, b, rest } = teileAuf(liste(100), 90);
  assert.equal(a.length, 50);
  assert.equal(b.length, 50);
  assert.equal(rest.length, 0);
});

test('streuzahl: gleiche Eingabe, gleiche Zahl — Gross/Klein egal', () => {
  assert.equal(streuzahl('Anna@Beispiel.de'), streuzahl('anna@beispiel.de'));
  assert.notEqual(streuzahl('a@b.de'), streuzahl('c@d.de'));
  assert.ok(streuzahl(null) >= 0);
});

// ----------------------------------------------------------------- Phasen

test('phase: ohne Start ist nichts gestartet', () => {
  assert.equal(phase(null, '2026-09-13T12:00:00Z'), 'nicht_gestartet');
  assert.equal(phase({}, '2026-09-13T12:00:00Z'), 'nicht_gestartet');
});

test('phase: vor Ablauf der Wartezeit wird nicht ausgewertet', () => {
  const stand = { gestartet_am: '2026-09-13T10:00:00Z' };
  assert.equal(phase(stand, '2026-09-13T11:00:00Z'), 'wartet');
  assert.equal(phase(stand, '2026-09-13T13:59:00Z'), 'wartet');
});

test('phase: nach der Wartezeit auswertbar', () => {
  const stand = { gestartet_am: '2026-09-13T10:00:00Z' };
  assert.equal(phase(stand, '2026-09-13T14:00:00Z'), 'auswertbar');
  assert.equal(WARTEZEIT_STUNDEN, 4);
});

test('phase: ist der Rest raus, ist der Test abgeschlossen', () => {
  const stand = { gestartet_am: '2026-09-13T10:00:00Z', rest_gesendet_am: '2026-09-13T15:00:00Z' };
  assert.equal(phase(stand, '2026-09-14T09:00:00Z'), 'abgeschlossen');
});

test('restStunden: rundet auf und wird nie negativ', () => {
  const stand = { gestartet_am: '2026-09-13T10:00:00Z' };
  assert.equal(restStunden(stand, '2026-09-13T11:30:00Z'), 3);
  assert.equal(restStunden(stand, '2026-09-13T20:00:00Z'), 0);
  assert.equal(restStunden(null, '2026-09-13T11:00:00Z'), null);
});

test('jede Phase hat einen deutschen Satz', () => {
  for (const p of ['nicht_gestartet', 'wartet', 'auswertbar', 'abgeschlossen']) {
    assert.ok(PHASE_TEXT[p].length > 5, p);
  }
});

// --------------------------------------------------------------- Ergebnis

test('klarer Unterschied bei genug Menge: es gibt einen Sieger', () => {
  const e = ergebnis(versand(200, 80), versand(200, 40));   // 40 % gegen 20 %
  assert.equal(e.sieger, 'a');
  assert.equal(e.sicher, true);
  assert.equal(e.empfehlung, 'a');
});

test('die zweite kann auch gewinnen', () => {
  const e = ergebnis(versand(200, 30), versand(200, 90));
  assert.equal(e.sieger, 'b');
  assert.equal(e.empfehlung, 'b');
});

test('zu wenig Menge: KEIN Sieger, aber trotzdem eine offen benannte Empfehlung', () => {
  const e = ergebnis(versand(10, 8), versand(10, 2));       // 80 % gegen 20 %, aber nur 10 Stueck
  assert.equal(e.sieger, null);
  assert.equal(e.sicher, false);
  assert.equal(e.empfehlung, 'a');
  assert.match(e.satz, /Setzung, kein Ergebnis/);
});

test('kaum Unterschied: kein Sieger, auch bei grosser Menge', () => {
  const e = ergebnis(versand(500, 150), versand(500, 160)); // 30 % gegen 32 %
  assert.equal(e.sieger, null);
  assert.match(e.satz, /Kaum Unterschied|Zufall/);
});

test('ohne Zahlen wird nichts behauptet', () => {
  const e = ergebnis(null, null);
  assert.equal(e.sieger, null);
  assert.equal(e.sicher, false);
  assert.equal(e.quoteA, null);
});

test('kurzstand liest sich auch ohne Zahlen', () => {
  assert.equal(kurzstand(ergebnis(null, null)), '— gegen —');
  assert.match(kurzstand(ergebnis(versand(200, 80), versand(200, 40))), /40 % gegen 20 %/);
});

// ------------------------------------------------------------ Startpruefung

test('fehltZumStart: zwei gleiche Betreffzeilen sind kein Test', () => {
  const f = fehltZumStart('Neu bei uns', 'neu bei uns', 500);
  assert.ok(f.some((x) => x.includes('VERSCHIEDENE')));
});

test('fehltZumStart: leere Betreffzeilen und zu kleine Liste fallen auf', () => {
  const f = fehltZumStart('', '', 10);
  assert.equal(f.length, 3);
});

test('fehltZumStart: vollstaendig ist vollstaendig', () => {
  assert.deepEqual(fehltZumStart('Die erste Zeile', 'Die zweite Zeile', 500), []);
});
