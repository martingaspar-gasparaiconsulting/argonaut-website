// ============================================================================
// ARGONAUT OS · tests/nutzung.test.mjs
//
// Diese Datei entscheidet, WAS gezählt wird. Zwei Dinge werden hier geprüft:
//
//   · Die Zuordnung Pfad → Modul stimmt mit der Rechte-Ebene überein. Eine
//     zweite, abweichende Liste wäre schlimmer als keine Statistik: Sie zeigte
//     Module, die es nicht mehr gibt, und niemand wüsste, welche Liste stimmt.
//   · „Hängt fest" bedeutet wirklich festhängen. Wer gestern angefangen hat,
//     arbeitet — ihn als Abbrecher zu zählen, führt zu falschen Schlüssen über
//     das eigene Produkt.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OHNE_MODUL,
  UEBERSICHT,
  HAENGT_AB_TAGEN,
  GRUNDSCHRITTE,
  istZaehlbar,
  modulAusPfad,
  nachNutzung,
  nieBenutzt,
  summeAufrufe,
  tageStill,
  haengtFest,
  abbruchstellen,
  abbruchSatz,
} from '../out/nutzung.js';
import { NAV_LINKS } from '../out/rechte.js';

// --- 1) Was überhaupt gezählt wird ------------------------------------------

test('nur Dashboard-Seiten zählen', () => {
  assert.equal(istZaehlbar('/dashboard/rechnungen'), true);
  assert.equal(istZaehlbar('/dashboard'), true);
  assert.equal(istZaehlbar('/api/mail/senden'), false);
  assert.equal(istZaehlbar('/admin/command-center'), false);
  assert.equal(istZaehlbar('/'), false);
  assert.equal(istZaehlbar(''), false);
  assert.equal(istZaehlbar(null), false);
});

test('die Übersicht bekommt einen eigenen Schlüssel', () => {
  assert.equal(modulAusPfad('/dashboard'), UEBERSICHT);
  assert.equal(modulAusPfad('/dashboard/'), UEBERSICHT);
});

test('Suchteil und Sprungmarke stören die Zuordnung nicht', () => {
  const ohne = modulAusPfad('/dashboard/rechnungen');
  assert.equal(modulAusPfad('/dashboard/rechnungen?filter=offen'), ohne);
  assert.equal(modulAusPfad('/dashboard/rechnungen#unten'), ohne);
  assert.equal(modulAusPfad('/dashboard/rechnungen/'), ohne);
});

test('ein nicht zählbarer Pfad ergibt kein Modul', () => {
  assert.equal(modulAusPfad('/api/irgendwas'), '');
  assert.equal(modulAusPfad(''), '');
});

test('Seiten ohne buchbares Modul landen im Sammelbecken', () => {
  // Ein ausgedachter Pfad gehört zu keinem Modul — er darf die Zählung nicht
  // sprengen, sondern fällt in „sonstiges".
  assert.equal(modulAusPfad('/dashboard/gibt-es-nicht-xyz'), OHNE_MODUL);
});

test('die Zuordnung stimmt mit der Rechte-Ebene überein', () => {
  // Der Wächter: Wird ein Modul umbenannt, ohne dass diese Datei es merkt,
  // verschwinden seine Aufrufe still in „sonstiges".
  const mitModul = NAV_LINKS.filter((l) => l.modul && String(l.href || '').startsWith('/dashboard'));
  assert.ok(mitModul.length > 5, 'es sollten etliche Modul-Links existieren');
  for (const l of mitModul) {
    assert.equal(
      modulAusPfad(l.href),
      l.modul,
      `${l.href} müsste auf Modul "${l.modul}" zeigen`,
    );
  }
});

// --- 2) Auswertung ----------------------------------------------------------

const ZEILEN = [
  { modul_key: 'rechnungen', betriebe: 4, aufrufe: 120 },
  { modul_key: 'crm', betriebe: 3, aufrufe: 300 },
  { modul_key: 'kasse', betriebe: 1, aufrufe: 0 },
];

test('sortiert wird nach Aufrufen, absteigend', () => {
  const s = nachNutzung(ZEILEN);
  assert.equal(s[0].modul_key, 'crm');
  assert.equal(s[1].modul_key, 'rechnungen');
});

test('die Sortierung verändert die Eingabe nicht', () => {
  const kopie = ZEILEN.slice();
  nachNutzung(ZEILEN);
  assert.deepEqual(ZEILEN, kopie);
});

test('bei Gleichstand entscheidet der Name — die Reihenfolge bleibt stabil', () => {
  const s = nachNutzung([
    { modul_key: 'zeiterfassung', betriebe: 1, aufrufe: 5 },
    { modul_key: 'angebote', betriebe: 1, aufrufe: 5 },
  ]);
  assert.equal(s[0].modul_key, 'angebote');
});

test('null Aufrufe zählen als nie benutzt', () => {
  const nie = nieBenutzt(['rechnungen', 'crm', 'kasse', 'verleih'], ZEILEN);
  assert.deepEqual(nie, ['kasse', 'verleih']);
});

test('ohne Zeilen ist alles unbenutzt', () => {
  assert.deepEqual(nieBenutzt(['a', 'b'], []), ['a', 'b']);
  assert.deepEqual(nieBenutzt(['a', 'b'], null), ['a', 'b']);
});

test('die Summe zählt alles zusammen', () => {
  assert.equal(summeAufrufe(ZEILEN), 420);
  assert.equal(summeAufrufe([]), 0);
  assert.equal(summeAufrufe(null), 0);
});

// --- 3) Wo das Onboarding abbricht ------------------------------------------

const JETZT = new Date('2026-09-10T12:00:00Z');
const vorTagen = (n) => new Date(JETZT.getTime() - n * 86400000).toISOString();

test('die Stilltage werden ganzzahlig gezählt', () => {
  assert.equal(tageStill(vorTagen(0), JETZT), 0);
  assert.equal(tageStill(vorTagen(3), JETZT), 3);
  assert.equal(tageStill(vorTagen(20), JETZT), 20);
});

test('ein Datum in der Zukunft ergibt null Tage, keinen negativen Wert', () => {
  const morgen = new Date(JETZT.getTime() + 86400000).toISOString();
  assert.equal(tageStill(morgen, JETZT), 0);
});

test('ohne brauchbares Datum ist es unbekannt', () => {
  assert.equal(tageStill('', JETZT), -1);
  assert.equal(tageStill(null, JETZT), -1);
  assert.equal(tageStill('kein datum', JETZT), -1);
});

test('wer gestern gearbeitet hat, hängt nicht fest', () => {
  const s = { owner_user_id: 'b1', erledigte: 2, letzte_aktivitaet: vorTagen(1) };
  assert.equal(haengtFest(s, 10, JETZT), false);
});

test('wer 14 Tage nichts getan hat, hängt fest', () => {
  const s = { owner_user_id: 'b1', erledigte: 2, letzte_aktivitaet: vorTagen(HAENGT_AB_TAGEN) };
  assert.equal(haengtFest(s, 10, JETZT), true);
});

test('einen Tag vor der Grenze hängt noch niemand', () => {
  const s = { owner_user_id: 'b1', erledigte: 2, letzte_aktivitaet: vorTagen(HAENGT_AB_TAGEN - 1) };
  assert.equal(haengtFest(s, 10, JETZT), false);
});

test('wer fertig ist, hängt nie — auch nach Monaten nicht', () => {
  const s = { owner_user_id: 'b1', erledigte: 10, letzte_aktivitaet: vorTagen(200) };
  assert.equal(haengtFest(s, 10, JETZT), false);
});

test('wer nie einen Schritt gemacht hat, hängt bei null fest', () => {
  const s = { owner_user_id: 'b1', erledigte: 0, letzte_aktivitaet: null };
  assert.equal(haengtFest(s, 10, JETZT), true);
});

test('null und undefined hängen nicht — sie existieren nicht', () => {
  assert.equal(haengtFest(null, 10, JETZT), false);
  assert.equal(haengtFest(undefined, 10, JETZT), false);
});

test('die Häufung zeigt die Abbruchstelle', () => {
  const staende = [
    { owner_user_id: 'a', erledigte: 2, letzte_aktivitaet: vorTagen(30) },
    { owner_user_id: 'b', erledigte: 2, letzte_aktivitaet: vorTagen(40) },
    { owner_user_id: 'c', erledigte: 2, letzte_aktivitaet: vorTagen(20) },
    { owner_user_id: 'd', erledigte: 5, letzte_aktivitaet: vorTagen(30) },
    { owner_user_id: 'e', erledigte: 3, letzte_aktivitaet: vorTagen(1) },  // arbeitet
    { owner_user_id: 'f', erledigte: 10, letzte_aktivitaet: vorTagen(90) }, // fertig
  ];
  const stellen = abbruchstellen(staende, 10, JETZT);
  assert.equal(stellen[0].erledigte, 2);
  assert.equal(stellen[0].betriebe, 3);
  assert.equal(stellen.length, 2, 'nur 2 und 5 — der Arbeitende und der Fertige zählen nicht');
});

test('ohne Hänger gibt es keine Abbruchstelle und keinen Satz', () => {
  assert.deepEqual(abbruchstellen([], 10, JETZT), []);
  assert.equal(abbruchSatz([]), '');
  assert.equal(abbruchSatz(null), '');
});

test('die Zahl der Grundschritte ist gesetzt und plausibel', () => {
  // Wächter fuer die Zahl aus app/dashboard/onboarding/page.tsx. Ist sie zu
  // hoch, gilt ein fertiger Betrieb als Abbrecher; ist sie zu niedrig, faellt
  // ein echter Abbrecher aus der Statistik. Beides fuehrt zu falschen
  // Schluessen ueber das eigene Produkt.
  assert.equal(typeof GRUNDSCHRITTE, 'number');
  assert.ok(GRUNDSCHRITTE >= 5 && GRUNDSCHRITTE <= 40, 'unplausible Schrittzahl');
});

test('mit den Grundschritten gilt ein Fertiger nicht als Abbrecher', () => {
  const fertig = { owner_user_id: 'a', erledigte: GRUNDSCHRITTE, letzte_aktivitaet: vorTagen(180) };
  const offen = { owner_user_id: 'b', erledigte: GRUNDSCHRITTE - 1, letzte_aktivitaet: vorTagen(180) };
  assert.equal(haengtFest(fertig, GRUNDSCHRITTE, JETZT), false);
  assert.equal(haengtFest(offen, GRUNDSCHRITTE, JETZT), true);
  const stellen = abbruchstellen([fertig, offen], GRUNDSCHRITTE, JETZT);
  assert.equal(stellen.length, 1);
  assert.equal(stellen[0].erledigte, GRUNDSCHRITTE - 1);
});

test('der Satz nennt die größte Häufung und ist grammatisch richtig', () => {
  assert.ok(abbruchSatz([{ erledigte: 2, betriebe: 3 }]).includes('3 Betriebe bleiben'));
  assert.ok(abbruchSatz([{ erledigte: 2, betriebe: 1 }]).includes('1 Betrieb bleibt'));
});
