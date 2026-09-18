import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VORFRIST_TAGE_STD, tageDiff, restTage, fristStatus, verjaehrungEnde,
  zaehleFristen, istFristDatum, fristenHinweise,
} from '../out/fristen.js';

// ===========================================================================
// PUNKT 21 — Fristenkontrolle repariert (18.09.2026)
//
// Gemessen am echten Code, bevor etwas geaendert wurde:
//   restTage('2026-09-10')                -> NaN
//   fristStatus('2026-09-10')             -> 'offen'   (seit 8 Tagen abgelaufen!)
//   verjaehrungEnde(new Date('2026-03-01')) -> 'NaN-12-31'
//   fristStatus('01.10.2026', 7, false, heute) -> 'ueberfaellig' (Jahr 1.1)
//   fristStatus('', 7, false, heute)      -> 'offen'
// Die Seite uebergibt an drei Stellen ausdruecklich new Date() — genau den
// Fall, den tagUTC nicht konnte.
// ===========================================================================

const HEUTE_TEXT = '2026-09-18';
const HEUTE_DATE = new Date(2026, 8, 18, 14, 30);   // lokal, 18.09.2026 14:30

// ── 1) Der Kern: ein Date-Objekt muss funktionieren ────────────────────────

test('Ein Date-Objekt rechnet genauso wie der Datumstext', () => {
  assert.equal(restTage('2026-09-25', HEUTE_DATE), 7);
  assert.equal(restTage('2026-09-25', HEUTE_TEXT), 7);
  assert.equal(restTage('2026-09-10', HEUTE_DATE), -8);
  assert.equal(tageDiff(HEUTE_DATE, '2026-10-18'), 30);
});

test('Eine abgelaufene Notfrist meldet auch OHNE ausdrueckliches heute Alarm', () => {
  // Der Standardwert ist new Date() — genau der Weg, der vorher NaN ergab.
  assert.equal(fristStatus('2020-01-01'), 'ueberfaellig');
  assert.equal(Number.isNaN(restTage('2020-01-01')), false);
  assert.ok(restTage('2020-01-01') < 0);
});

test('Eine Frist weit in der Zukunft bleibt offen, auch ohne heute', () => {
  assert.equal(fristStatus('2099-12-31'), 'offen');
});

test('Die Ampel trifft alle Stufen', () => {
  assert.equal(fristStatus('2026-09-10', 7, false, HEUTE_DATE), 'ueberfaellig');
  assert.equal(fristStatus('2026-09-18', 7, false, HEUTE_DATE), 'heute');
  assert.equal(fristStatus('2026-09-20', 7, false, HEUTE_DATE), 'vorfrist');
  assert.equal(fristStatus('2026-09-25', 7, false, HEUTE_DATE), 'vorfrist');
  assert.equal(fristStatus('2026-09-26', 7, false, HEUTE_DATE), 'offen');
  assert.equal(fristStatus('2026-09-10', 7, true, HEUTE_DATE), 'erledigt');
});

test('Vorfrist 0 ist erlaubt und heisst: keine Vorwarnung', () => {
  assert.equal(fristStatus('2026-09-19', 0, false, HEUTE_DATE), 'offen');
  assert.equal(fristStatus('2026-09-18', 0, false, HEUTE_DATE), 'heute');
});

// ── 2) Unlesbare Datumsangaben ─────────────────────────────────────────────

test('Ein unlesbares Fristdatum ist ueberfaellig, nie gruen', () => {
  for (const kaputt of ['', '01.10.2026', 'naechste Woche', null, undefined, '2026-13-01', '2026-02-31']) {
    assert.equal(fristStatus(kaputt, 7, false, HEUTE_DATE), 'ueberfaellig', `${String(kaputt)} darf nicht offen sein`);
  }
});

test('istFristDatum erkennt nur saubere YYYY-MM-DD und echte Daten', () => {
  assert.equal(istFristDatum('2026-09-18'), true);
  assert.equal(istFristDatum('2026-09-18T10:00:00Z'), true);
  assert.equal(istFristDatum(new Date(2026, 8, 18)), true);
  assert.equal(istFristDatum('01.10.2026'), false);
  assert.equal(istFristDatum('2026-02-31'), false, 'den 31. Februar gibt es nicht');
  assert.equal(istFristDatum(new Date('kaputt')), false);
  assert.equal(istFristDatum(''), false);
});

test('Nur die vereinbarte Schreibweise YYYY-MM-DD zaehlt', () => {
  // Hier traegt die strenge Musterpruefung, nicht die Monats-/Tagespruefung:
  // "2026/09/18" liesse sich zwar deuten, aber genau diese Grosszuegigkeit hat
  // "01.10.2026" durchgelassen. Die Datei hat einen Vertrag, und der heisst
  // YYYY-MM-DD. Alles andere faellt auf, statt still falsch gedeutet zu werden.
  assert.equal(istFristDatum('2026/09/18'), false);
  assert.equal(istFristDatum('2026.09.18'), false);
  assert.equal(istFristDatum('20260918'), false);
  assert.equal(fristStatus('2026/09/18', 7, false, HEUTE_DATE), 'ueberfaellig');
  assert.ok(Number.isNaN(restTage('2026/09/18', HEUTE_DATE)));
});

test('Ein unlesbares Datum ergibt NaN statt einer erfundenen Zahl', () => {
  assert.ok(Number.isNaN(restTage('01.10.2026', HEUTE_DATE)));
  assert.ok(Number.isNaN(tageDiff('kaputt', '2026-09-18')));
});

// ── 3) Verjaehrung ─────────────────────────────────────────────────────────

test('Verjaehrungsende rechnet zum Jahresende, auch aus einem Date-Objekt', () => {
  assert.equal(verjaehrungEnde('2026-03-01'), '2029-12-31');
  assert.equal(verjaehrungEnde(new Date(2026, 2, 1)), '2029-12-31', 'vorher kam "NaN-12-31"');
  assert.equal(verjaehrungEnde('2026-12-31'), '2029-12-31');
  assert.equal(verjaehrungEnde('2026-01-01', 10), '2036-12-31');
});

test('Unlesbare Entstehung ergibt leeren Text, nicht "NaN-12-31"', () => {
  assert.equal(verjaehrungEnde('kaputt'), '');
  assert.equal(verjaehrungEnde(''), '');
  assert.equal(verjaehrungEnde(new Date('kaputt')), '');
});

// ── 4) Die Kennzahlen ──────────────────────────────────────────────────────

const LISTE = [
  { frist_datum: '2026-09-10', art: 'notfrist', bezeichnung: 'Berufungsbegruendung' },
  { frist_datum: '2026-09-20', art: 'termin', bezeichnung: 'Wiedervorlage' },
  { frist_datum: '2026-12-01', art: 'sonstige', bezeichnung: 'Spaeter' },
  { frist_datum: '01.10.2026', art: 'notfrist', bezeichnung: 'Falsch getippt' },
  { frist_datum: '2026-09-01', erledigt: true, art: 'termin', bezeichnung: 'Fertig' },
];

test('Die Kacheln zeigen wieder Zahlen statt lauter Nullen', () => {
  const z = zaehleFristen(LISTE, HEUTE_DATE);
  assert.equal(z.offen, 4);
  assert.equal(z.ueberfaellig, 2, 'die abgelaufene Notfrist plus die unlesbare');
  assert.equal(z.vorfrist, 1);
  assert.equal(z.erledigt, 1);
  assert.equal(z.unlesbar, 1);
});

test('Ohne ausdrueckliches heute kommt dasselbe heraus', () => {
  const a = zaehleFristen([{ frist_datum: '2020-01-01' }, { frist_datum: '2099-01-01' }]);
  assert.equal(a.ueberfaellig, 1, 'vorher stand hier immer 0');
  assert.equal(a.offen, 2);
});

test('Kachel und Ampel sagen dasselbe', () => {
  const z = zaehleFristen(LISTE, HEUTE_DATE);
  const perAmpel = LISTE.filter((f) => fristStatus(f.frist_datum, f.vorfrist_tage, f.erledigt, HEUTE_DATE) === 'ueberfaellig').length;
  assert.equal(z.ueberfaellig, perAmpel);
});

test('Die Standard-Vorfrist greift, wenn am Eintrag nichts steht', () => {
  assert.equal(VORFRIST_TAGE_STD, 7);
  assert.equal(zaehleFristen([{ frist_datum: '2026-09-24' }], HEUTE_DATE).vorfrist, 1);
  assert.equal(zaehleFristen([{ frist_datum: '2026-09-24', vorfrist_tage: 3 }], HEUTE_DATE).vorfrist, 0);
  assert.equal(zaehleFristen([{ frist_datum: '2026-09-24', vorfrist_tage: 0 }], HEUTE_DATE).vorfrist, 0);
});

// ── 5) Hinweise ────────────────────────────────────────────────────────────

test('fristenHinweise nennt die Notfrist beim Namen', () => {
  const h = fristenHinweise(LISTE, HEUTE_DATE).join(' | ');
  assert.ok(h.includes('NOTFRIST'), h);
  assert.ok(h.includes('Berufungsbegruendung'), h);
  assert.ok(h.includes('unlesbarem Datum'), h);
  assert.ok(h.includes('Falsch getippt'), h);
});

test('Eine Notfrist ohne Vorfrist wird gemeldet', () => {
  const h = fristenHinweise([{ frist_datum: '2026-12-01', art: 'notfrist', vorfrist_tage: 0, bezeichnung: 'Klagefrist' }], HEUTE_DATE).join(' | ');
  assert.ok(h.includes('ohne Vorfrist'), h);
});

test('Ein veraenderter Verjaehrungs-Zeitraum bekommt den Rechtshinweis', () => {
  assert.deepEqual(fristenHinweise([], HEUTE_DATE, 3), []);
  const h = fristenHinweise([], HEUTE_DATE, 30).join(' | ');
  assert.ok(h.includes('§197'), h);
  assert.ok(h.includes('taggenau'), h);
});

test('Eine saubere Liste erzeugt keine Hinweise', () => {
  assert.deepEqual(fristenHinweise([{ frist_datum: '2026-12-01', art: 'termin', bezeichnung: 'Alles gut' }], HEUTE_DATE), []);
});

test('KETTE: genau so, wie app/dashboard/fristen/page.tsx es aufruft', () => {
  // Die Seite uebergibt an drei Stellen ausdruecklich new Date().
  const fristen = [
    { id: '1', frist_datum: '2020-01-01', vorfrist_tage: 7, erledigt: false, art: 'notfrist', bezeichnung: 'Alte Notfrist' },
    { id: '2', frist_datum: '2099-01-01', vorfrist_tage: 7, erledigt: false, art: 'termin', bezeichnung: 'Ferne Frist' },
  ];
  const zf = zaehleFristen(fristen, new Date());
  assert.equal(zf.ueberfaellig, 1, 'die Kachel zeigte vorher immer 0');

  const badge = fristStatus(fristen[0].frist_datum, fristen[0].vorfrist_tage, fristen[0].erledigt, new Date());
  assert.equal(badge, 'ueberfaellig', 'die Ampel stand vorher immer auf offen');

  const rest = restTage(fristen[0].frist_datum, new Date());
  assert.ok(Number.isFinite(rest) && rest < 0, 'in der Tabelle stand vorher "in NaN T"');

  // Die gedruckte Fristenliste sortiert nach restTage — mit NaN sortiert sie gar nicht.
  const sortiert = fristen.map((f) => ({ b: f.bezeichnung, r: restTage(f.frist_datum, new Date()) })).sort((x, z) => x.r - z.r);
  assert.equal(sortiert[0].b, 'Alte Notfrist', 'die dringendste Frist muss oben stehen');
});
