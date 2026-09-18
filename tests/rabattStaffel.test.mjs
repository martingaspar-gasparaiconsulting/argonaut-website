// ARGONAUT OS · tests/rabattStaffel.test.mjs — Punkt 13 (18.09.2026)
//
// app/dashboard/_components/preisLogik.ts hatte bis heute KEINEN einzigen Test,
// obwohl sie ueber holz/page.tsx und auftragLogik.ts scharf am Geld sitzt.
// Diese Tests nageln die Rabattstaffel fest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findeRabatt,
  staffelUnstimmigkeiten,
  staffelFuerVariante,
  pruefeRabatt,
  berechnePosition,
} from '../out/preisLogik.js';

const SORT_A = 'sortiment-a';
const SORT_B = 'sortiment-b';

function r(felder) {
  return {
    id: felder.id ?? Math.random().toString(36).slice(2),
    owner_user_id: 'u1',
    firma_id: null,
    sortiment_id: felder.sortiment_id ?? null,
    einheit: felder.einheit ?? null,
    ab_menge: felder.ab_menge,
    rabatt_prozent: felder.rabatt_prozent,
    aktiv: felder.aktiv ?? true,
    notiz: null,
    erstellt_am: '2026-01-01',
    aktualisiert_am: '2026-01-01',
  };
}

// ---------------------------------------------------------------------------
// Der Befund
// ---------------------------------------------------------------------------

test('DER WICHTIGSTE TEST: wer mehr bestellt, bekommt nie weniger Rabatt', () => {
  // Fehlkonfiguriert: ab 5 gibt es 20 %, ab 10 nur noch 3 %.
  // Vorher gewann die hoechste SCHWELLE -> bei 12 SRM nur 3 %,
  // bei 9 SRM aber 20 %. Der Kunde zahlte fuer mehr Ware mehr Geld.
  const staffeln = [
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 20 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 3 }),
  ];
  assert.equal(findeRabatt(staffeln, SORT_A, 'srm', 9).rabatt_prozent, 20);
  assert.equal(findeRabatt(staffeln, SORT_A, 'srm', 12).rabatt_prozent, 20);
});

test('der Stueckpreis faellt mit der Menge — Aufteilen darf nie billiger sein', () => {
  // DIE richtige Invariante einer Mengenstaffel. Ein steigender Endpreis ist
  // normal (mehr Ware kostet mehr); falsch ist ein steigender STUECKPREIS.
  // Alt: 9 SRM = 720 EUR (80 EUR/SRM), 10 SRM = 970 EUR (97 EUR/SRM). Wer 12
  // bestellte, zahlte 1.164 EUR — zwei Bestellungen ueber je 6 SRM kosteten
  // zusammen nur 960 EUR. Aufteilen war billiger als bestellen.
  const preise = [
    {
      id: 'p1', owner_user_id: 'u1', firma_id: null, sortiment_id: SORT_A,
      einheit: 'srm', preis_netto: 100, steuersatz_prozent: 7, aktiv: true,
      notiz: null, gueltig_ab: '2026-01-01', erstellt_am: '2026-01-01', aktualisiert_am: '2026-01-01',
    },
  ];
  const staffeln = [
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 20 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 3 }),
  ];
  let vorherStueck = Infinity;
  for (const menge of [1, 4, 5, 9, 10, 12, 50]) {
    const e = berechnePosition(menge, 'srm', SORT_A, preise, staffeln);
    assert.equal(e.ok, true, `Menge ${menge} sollte rechenbar sein`);
    const stueck = e.netto / menge;
    assert.ok(
      stueck <= vorherStueck + 1e-9,
      `Bei ${menge} SRM kostet die Einheit ${stueck.toFixed(2)} EUR, ` +
        `bei der kleineren Menge waren es ${vorherStueck.toFixed(2)} EUR — teurer trotz mehr.`,
    );
    vorherStueck = stueck;
  }

  // Und die Probe aufs Exempel: eine Bestellung darf nie teurer sein als
  // dieselbe Menge in zwei Teilen.
  const zwoelfAmStueck = berechnePosition(12, 'srm', SORT_A, preise, staffeln).netto;
  const zweiMalSechs = 2 * berechnePosition(6, 'srm', SORT_A, preise, staffeln).netto;
  assert.ok(
    zwoelfAmStueck <= zweiMalSechs + 1e-9,
    `12 SRM am Stueck kosten ${zwoelfAmStueck} EUR, zweimal 6 SRM nur ${zweiMalSechs} EUR.`,
  );
});

// ---------------------------------------------------------------------------
// Eine saubere Staffel verhaelt sich GENAU wie vorher
// ---------------------------------------------------------------------------

test('eine sauber ansteigende Staffel rechnet unveraendert', () => {
  const staffeln = [
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 3 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 5 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 20, rabatt_prozent: 8 }),
  ];
  assert.equal(findeRabatt(staffeln, SORT_A, 'srm', 4), null);
  assert.equal(findeRabatt(staffeln, SORT_A, 'srm', 5).rabatt_prozent, 3);
  assert.equal(findeRabatt(staffeln, SORT_A, 'srm', 12).rabatt_prozent, 5);
  assert.equal(findeRabatt(staffeln, SORT_A, 'srm', 100).rabatt_prozent, 8);
});

test('bei gleichem Rabatt gewinnt die hoehere Schwelle — der Hinweis passt zur Menge', () => {
  const staffeln = [
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 10 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 10 }),
  ];
  assert.equal(findeRabatt(staffeln, SORT_A, 'srm', 12).ab_menge, 10);
});

// ---------------------------------------------------------------------------
// Die Spezifitaets-Regel bleibt unangetastet
// ---------------------------------------------------------------------------

test('die spezifischere Staffel gewinnt weiterhin, auch mit kleinerem Rabatt', () => {
  // Global 20 %, aber fuer dieses Sortiment und diese Einheit gelten 5 %.
  // Die engere Zuordnung ist eine ENTSCHEIDUNG des Betriebs, kein Fehler.
  const staffeln = [
    r({ sortiment_id: null, einheit: null, ab_menge: 5, rabatt_prozent: 20 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 5 }),
  ];
  assert.equal(findeRabatt(staffeln, SORT_A, 'srm', 10).rabatt_prozent, 5);
  // Fuer ein anderes Sortiment greift die globale.
  assert.equal(findeRabatt(staffeln, SORT_B, 'srm', 10).rabatt_prozent, 20);
});

test('inaktive Staffeln und zu kleine Mengen ergeben keinen Rabatt', () => {
  const staffeln = [
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 20, aktiv: false }),
  ];
  assert.equal(findeRabatt(staffeln, SORT_A, 'srm', 10), null);
  assert.equal(findeRabatt([], SORT_A, 'srm', 10), null);
  assert.equal(findeRabatt([r({ ab_menge: 5, rabatt_prozent: 3 })], SORT_A, 'srm', 0), null);
  assert.equal(findeRabatt([r({ ab_menge: 5, rabatt_prozent: 3 })], SORT_A, 'srm', -1), null);
  assert.equal(findeRabatt([r({ ab_menge: 5, rabatt_prozent: 3 })], SORT_A, 'srm', NaN), null);
});

test('eine falsche Einheit trifft die Staffel nicht', () => {
  const staffeln = [r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 20 })];
  assert.equal(findeRabatt(staffeln, SORT_A, 'fm', 10), null);
});

// ---------------------------------------------------------------------------
// staffelUnstimmigkeiten — der Betrieb soll die Fehlkonfiguration SEHEN
// ---------------------------------------------------------------------------

test('eine fallende Staffel wird gemeldet', () => {
  const staffeln = [
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 20 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 3 }),
  ];
  const u = staffelUnstimmigkeiten(staffeln);
  assert.equal(u.length, 1);
  assert.equal(u[0].hoehereSchwelle.ab_menge, 10);
  assert.equal(u[0].niedrigereSchwelle.ab_menge, 5);
  assert.match(u[0].text, /Wer mehr bestellt, bekommt sonst weniger/);
});

test('eine saubere Staffel wird NICHT gemeldet', () => {
  const staffeln = [
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 3 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 5 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 20, rabatt_prozent: 8 }),
  ];
  assert.deepEqual(staffelUnstimmigkeiten(staffeln), []);
});

test('verschiedene Zuordnungen werden NICHT miteinander verglichen', () => {
  // Global 20 %, sortimentgenau 5 % — das ist Absicht, keine Unstimmigkeit.
  const staffeln = [
    r({ sortiment_id: null, einheit: null, ab_menge: 5, rabatt_prozent: 20 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 5 }),
  ];
  assert.deepEqual(staffelUnstimmigkeiten(staffeln), []);
});

test('inaktive Staffeln zaehlen nicht als Unstimmigkeit', () => {
  const staffeln = [
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 20 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 3, aktiv: false }),
  ];
  assert.deepEqual(staffelUnstimmigkeiten(staffeln), []);
});

test('mehrere Rueckspruenge werden alle gemeldet', () => {
  const staffeln = [
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 20 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 15 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 20, rabatt_prozent: 2 }),
  ];
  assert.equal(staffelUnstimmigkeiten(staffeln).length, 2);
});

// ---------------------------------------------------------------------------
// pruefeRabatt — beim Anlegen darauf hinweisen
// ---------------------------------------------------------------------------

test('eine neue Staffel mit weniger Rabatt bei hoeherer Schwelle bekommt einen Hinweis', () => {
  const vorhandene = [r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 20 })];
  const p = pruefeRabatt(
    { sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 3 },
    vorhandene,
  );
  assert.equal(p.ok, true, 'das Anlegen wird bewusst NICHT blockiert');
  assert.equal(p.fehler.length, 0);
  assert.match(p.hinweise.join(' '), /Ab 5,00 gibt es bereits 20 % Rabatt/);
});

test('eine neue Staffel UNTER einer schlechteren bekommt ebenfalls einen Hinweis', () => {
  const vorhandene = [r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 3 })];
  const p = pruefeRabatt(
    { sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 20 },
    vorhandene,
  );
  assert.equal(p.ok, true);
  assert.match(p.hinweise.join(' '), /Ab 10,00 gibt es nur 3 % Rabatt/);
});

test('eine saubere neue Staffel bekommt KEINEN Staffel-Hinweis', () => {
  const vorhandene = [r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 3 })];
  const p = pruefeRabatt(
    { sortiment_id: SORT_A, einheit: 'srm', ab_menge: 10, rabatt_prozent: 5 },
    vorhandene,
  );
  assert.equal(p.ok, true);
  assert.equal(p.hinweise.join(' ').includes('Rabatt'), false);
});

test('die bestehenden Pruefungen bleiben unveraendert', () => {
  assert.equal(pruefeRabatt({ sortiment_id: null, einheit: null, ab_menge: 0, rabatt_prozent: 5 }).ok, false);
  assert.equal(pruefeRabatt({ sortiment_id: null, einheit: null, ab_menge: 5, rabatt_prozent: 0 }).ok, false);
  assert.equal(pruefeRabatt({ sortiment_id: null, einheit: null, ab_menge: 5, rabatt_prozent: 101 }).ok, false);
  const hoch = pruefeRabatt({ sortiment_id: null, einheit: null, ab_menge: 5, rabatt_prozent: 40 });
  assert.equal(hoch.ok, true);
  assert.match(hoch.hinweise.join(' '), /ungewöhnlich hoch/);
  const doppelt = pruefeRabatt(
    { sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 10 },
    [r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 3 })],
  );
  assert.equal(doppelt.ok, false);
  assert.match(doppelt.fehler.join(' '), /existiert bereits/);
});

// ---------------------------------------------------------------------------
// Anzeige
// ---------------------------------------------------------------------------

test('staffelFuerVariante bleibt aufsteigend sortiert', () => {
  const staffeln = [
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 20, rabatt_prozent: 8 }),
    r({ sortiment_id: SORT_A, einheit: 'srm', ab_menge: 5, rabatt_prozent: 3 }),
  ];
  assert.deepEqual(
    staffelFuerVariante(staffeln, SORT_A, 'srm').map((x) => x.ab_menge),
    [5, 20],
  );
});
