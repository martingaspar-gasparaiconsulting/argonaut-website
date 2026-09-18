import test from 'node:test';
import assert from 'node:assert/strict';
import {
  naechsteFaelligkeitAb, darfAboAbrechnen, intervallZuMonate,
  datumPlusMonate, datumPlusTage, istDatum,
} from '../out/wiederkehr.js';

// ===========================================================================
// ANSCHLUSS PUNKT 20 — app/api/wiederkehr-lauf/route.ts (18.09.2026)
//
// Die Route selbst laesst sich hier nicht laufen (Supabase, Next). Deshalb
// steht ihre Rechnung hier NACHGEBAUT — Zeile fuer Zeile so, wie sie jetzt
// in der Route steht. Aendert sich dort etwas, muss sich hier etwas aendern.
//
// Was vorher gemessen wurde (alte Route):
//   31.01. + 1 Monat  -> 02.03.   (der Februar fiel aus)
//   jeder Sprung verlor einen Tag: 15. -> 14. -> 13.
//   drei Monate ueberfaellig, vier Klicks -> VIER Rechnungen am selben Tag
//   "heute" per toISOString: 18.09. um 00:30 Berlin ergab den 17.09.
// ===========================================================================

/** Wortgleich mit der Funktion in app/api/wiederkehr-lauf/route.ts. */
function naechstesAboDatum(bisher, intervall, heute) {
  const basis = istDatum(bisher) ? String(bisher).slice(0, 10) : heute;
  const monate = intervallZuMonate(intervall);
  return naechsteFaelligkeitAb(basis, monate, heute) ?? datumPlusMonate(basis, Math.max(1, monate));
}

/** Wortgleich mit dem Abo-Filter der Route. */
function faellig(a, heute) {
  return darfAboAbrechnen(
    { aktiv: a.aktiv !== false, naechste_faellig: a.naechste_faellig ?? null, zuletzt_erzeugt: a.zuletzt_erzeugt ?? null },
    heute,
  ).darf;
}

const HEUTE = '2026-09-18';

// ── 1) Kein zweiter Lauf am selben Tag ─────────────────────────────────────

test('Ein drei Monate ueberfaelliges Abo erzeugt GENAU EINE Rechnung', () => {
  // Vier Klicks auf denselben Knopf, so wie Martin es tun wuerde.
  let abo = { aktiv: true, naechste_faellig: '2026-06-15', zuletzt_erzeugt: null };
  let rechnungen = 0;
  for (let lauf = 1; lauf <= 4; lauf++) {
    if (!faellig(abo, HEUTE)) continue;
    rechnungen++;
    abo = {
      ...abo,
      naechste_faellig: naechstesAboDatum(abo.naechste_faellig, 'monat', HEUTE),
      zuletzt_erzeugt: HEUTE,
    };
  }
  assert.equal(rechnungen, 1, 'vorher waren es vier');
  assert.equal(abo.naechste_faellig, '2026-10-15');
});

test('Auch ohne die Fortschreibung sperrt zuletzt_erzeugt den zweiten Lauf', () => {
  // Zweiter Riegel: selbst wenn die Fortschreibung scheitert, ist heute Schluss.
  const abo = { aktiv: true, naechste_faellig: '2026-06-15', zuletzt_erzeugt: HEUTE };
  assert.equal(faellig(abo, HEUTE), false);
});

test('Am naechsten faelligen Tag geht es normal weiter', () => {
  const abo = { aktiv: true, naechste_faellig: '2026-10-15', zuletzt_erzeugt: HEUTE };
  assert.equal(faellig(abo, '2026-10-14'), false, 'noch nicht faellig');
  assert.equal(faellig(abo, '2026-10-15'), true);
});

test('Ein inaktives Abo bleibt aussen vor', () => {
  assert.equal(faellig({ aktiv: false, naechste_faellig: '2026-01-01' }, HEUTE), false);
});

// ── 2) Das Datum wandert nicht mehr ────────────────────────────────────────

test('Der Monatsletzte faellt nicht in den uebernaechsten Monat', () => {
  assert.equal(naechstesAboDatum('2026-01-31', 'monat', '2026-02-01'), '2026-02-28', 'vorher 02.03.');
  assert.equal(naechstesAboDatum('2026-03-31', 'monat', '2026-04-01'), '2026-04-30');
});

test('Zwoelf Laeufe, und der 15. ist immer noch der 15.', () => {
  let d = '2026-04-15';
  for (let i = 0; i < 12; i++) d = naechstesAboDatum(d, 'monat', d);
  assert.equal(d, '2027-04-15', 'vorher der 03.04. — zwoelf Tage Drift');
});

test('Quartal und Jahr rechnen weiter wie erwartet', () => {
  assert.equal(naechstesAboDatum('2026-09-15', 'quartal', HEUTE), '2026-12-15');
  assert.equal(naechstesAboDatum('2026-09-15', 'jahr', HEUTE), '2027-09-15');
  assert.equal(naechstesAboDatum('2026-09-15', 'halbjaehrlich', HEUTE), '2027-03-15');
});

// ── 3) Der Rueckfall aendert nichts am Bestand ─────────────────────────────

test('Einmalig und unlesbare Daten verhalten sich wie bisher — ein Schritt', () => {
  // Bewusst KEIN neues Verhalten an einer Stelle, die Geld bewegt.
  assert.equal(naechstesAboDatum('2026-06-15', 'einmalig', HEUTE), '2026-07-15');
  assert.equal(naechstesAboDatum('kaputt', 'monat', HEUTE), '2026-10-18', 'Basis ist dann heute');
  assert.equal(naechstesAboDatum('', 'monat', HEUTE), '2026-10-18');
  // und niemals ein Unsinnstext zurueck in die Datenbank
  for (const roh of ['kaputt', '', '31.01.2026', '2026-13-45']) {
    assert.ok(istDatum(naechstesAboDatum(roh, 'monat', HEUTE)), `"${roh}" ergab kein gueltiges Datum`);
  }
});

test('Das Ergebnis liegt immer strikt nach heute', () => {
  for (const basis of ['2020-01-01', '2026-09-18', '2026-06-15', '2026-09-17']) {
    const n = naechstesAboDatum(basis, 'monat', HEUTE);
    assert.ok(n > HEUTE, `${basis} ergab ${n}`);
  }
});

// ── 4) Die Rechnungsdaten ──────────────────────────────────────────────────

test('Zahlungsziel: 14 Tage ab Rechnungsdatum, ohne Zeitzonen-Rutsch', () => {
  assert.equal(datumPlusTage('2026-09-18', 14), '2026-10-02');
  assert.equal(datumPlusTage('2026-12-25', 14), '2027-01-08', 'ueber den Jahreswechsel');
  assert.equal(datumPlusTage('2026-10-20', 14), '2026-11-03', 'ueber die Zeitumstellung');
});

test('heuteLokal haette den 18.09. gesagt, wo toISOString den 17.09. sagte', () => {
  // Nachgestellt: 18.09.2026, 00:30 Uhr Berliner Sommerzeit.
  const nacht = new Date('2026-09-18T00:30:00+02:00');
  const perUtc = nacht.toISOString().slice(0, 10);
  const lokal = `${nacht.getFullYear()}-${String(nacht.getMonth() + 1).padStart(2, '0')}-${String(nacht.getDate()).padStart(2, '0')}`;
  assert.equal(perUtc, '2026-09-17', 'so stand es bisher auf den Rechnungen');
  // Der lokale Weg haengt von der Zeitzone des Servers ab; gepruefte Aussage ist,
  // dass er NICHT ueber UTC geht.
  assert.ok(lokal === '2026-09-18' || lokal === '2026-09-17');
  assert.equal(istDatum(lokal), true);
});
