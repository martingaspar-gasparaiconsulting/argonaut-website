import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BEZUG_TYPEN, istBezugTyp, bezugLabel, bezugOptionen, leseIntervall, intervallText,
  naechsteFaellig, fristenUebersicht, fristenZahlen, bezugPatch,
} from '../out/protokollBezug.js';

// ===========================================================================
// MO1 Teil 2 (16.10.2026) — Protokoll haengt an einem Objekt, Vorlage hat
// ein Intervall, Abschluss setzt die naechste Faelligkeit, Fristen-Uebersicht
// ===========================================================================

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('Bezug-Arten: die sechs Objekte, nichts sonst', () => {
  assert.deepEqual(BEZUG_TYPEN.map((b) => b.key), ['anlage', 'objekt', 'fahrzeug', 'tier', 'kunde', 'baustelle']);
  assert.ok(istBezugTyp('fahrzeug'));
  assert.ok(!istBezugTyp('rechnung'));
  assert.ok(!istBezugTyp(''));
});

test('Anzeigename je Tabelle, robust bei fehlenden Spalten', () => {
  assert.equal(bezugLabel('fahrzeug', { bezeichnung: 'Sprinter', kennzeichen: 'BB-AG 123' }), 'Sprinter · BB-AG 123');
  assert.equal(bezugLabel('kunde', { vorname: 'Eva', nachname: 'Muster' }), 'Eva Muster');
  assert.equal(bezugLabel('kunde', { firma: 'Bau GmbH', vorname: 'Eva' }), 'Bau GmbH');
  assert.equal(bezugLabel('tier', { name: 'Bello', art: 'Hund' }), 'Bello · Hund');
  assert.equal(bezugLabel('baustelle', {}), 'Projekt ohne Namen');
  assert.equal(bezugLabel('anlage', null), '—');
  const o = bezugOptionen('baustelle', [{ id: B, name: 'Zeppelinstr.' }, { id: 'kaputt', name: 'X' }, { id: A, name: 'Am Markt' }]);
  assert.deepEqual(o.map((x) => x.name), ['Am Markt', 'Zeppelinstr.']);
});

test('Intervall: leer = anlassbezogen, nur ganze Monate 1–120', () => {
  assert.deepEqual(leseIntervall(''), { wert: null, fehler: null });
  assert.deepEqual(leseIntervall(' 12 '), { wert: 12, fehler: null });
  assert.ok(leseIntervall('0').fehler);
  assert.ok(leseIntervall('121').fehler);
  assert.ok(leseIntervall('1,5').fehler);
  assert.ok(leseIntervall('-3').fehler);
  assert.equal(intervallText(12), 'jährlich');
  assert.equal(intervallText(24), 'alle 2 Jahre');
  assert.equal(intervallText(null), 'ohne festes Intervall');
});

test('Naechste Faelligkeit: Abschlusstag deutscher Zeit + Monate, Monatsende fest', () => {
  assert.equal(naechsteFaellig('2026-01-31', 1), '2026-02-28');
  assert.equal(naechsteFaellig('2026-10-16', 12), '2027-10-16');
  // 31.12. 23:30 Berliner Zeit ist UTC noch der 31.12. 22:30 — Tag bleibt 31.12.
  assert.equal(naechsteFaellig('2026-12-31T22:30:00Z', 6), '2027-06-30');
  // 23:30 UTC am 30.06. ist in Berlin schon der 01.07.
  assert.equal(naechsteFaellig('2026-06-30T23:30:00Z', 12), '2027-07-01');
  assert.equal(naechsteFaellig('2026-10-16', null), null);
  assert.equal(naechsteFaellig('2026-10-16', 0), null);
  assert.equal(naechsteFaellig('Unsinn', 12), null);
});

test('Fristen-Uebersicht: letzter Abschluss je Vorlage+Objekt, Entwuerfe zaehlen nicht', () => {
  const vorlagen = [
    { id: 'v1', titel: 'Heizungswartung', intervall_monate: 12 },
    { id: 'v2', titel: 'Übergabe', intervall_monate: null },
  ];
  const eintraege = [
    { id: 'e1', vorlage_id: 'v1', vorlage_titel: 'Heizungswartung', status: 'abgeschlossen', abgeschlossen_am: '2025-09-01T08:00:00Z', bezug_typ: 'anlage', bezug_id: A },
    { id: 'e2', vorlage_id: 'v1', vorlage_titel: 'Heizungswartung', status: 'abgeschlossen', abgeschlossen_am: '2025-11-20T08:00:00Z', bezug_typ: 'anlage', bezug_id: A, naechste_faellig: '2026-11-20' },
    { id: 'e3', vorlage_id: 'v1', vorlage_titel: 'Heizungswartung', status: 'entwurf', abgeschlossen_am: '2026-03-01T08:00:00Z', bezug_typ: 'anlage', bezug_id: A },
    { id: 'e4', vorlage_id: 'v1', vorlage_titel: 'Heizungswartung', status: 'abgeschlossen', abgeschlossen_am: '2025-08-01T08:00:00Z', bezug_typ: 'anlage', bezug_id: B },
    { id: 'e5', vorlage_id: 'v2', vorlage_titel: 'Übergabe', status: 'abgeschlossen', abgeschlossen_am: '2025-08-01T08:00:00Z' },
    { id: 'e6', vorlage_id: 'v1', vorlage_titel: 'Heizungswartung', status: 'abgeschlossen', abgeschlossen_am: '2026-01-10T08:00:00Z', bezug: 'Haus Weber' },
  ];
  const z = fristenUebersicht(eintraege, vorlagen, '2026-10-16');
  assert.equal(z.length, 3, 'A, B und Freitext — ohne Intervall-Vorlage');
  // B ist seit 01.08. ueberfaellig -> zuerst
  assert.equal(z[0].bezug_id, B);
  assert.equal(z[0].status, 'ueberfaellig');
  const a = z.find((x) => x.bezug_id === A);
  assert.equal(a.letzter_id, 'e2', 'neuester Abschluss zaehlt');
  assert.equal(a.faellig, '2026-11-20');
  assert.equal(a.status, 'ok');
  const frei = z.find((x) => !x.bezug_id);
  assert.equal(frei.faellig, '2027-01-10');
  assert.deepEqual(fristenZahlen(z), { ueberfaellig: 1, bald: 0, ok: 2 });
});

test('Bald faellig innerhalb von 30 Tagen', () => {
  const z = fristenUebersicht(
    [{ id: 'e', vorlage_id: 'v', vorlage_titel: 'X', status: 'abgeschlossen', abgeschlossen_am: '2025-11-01', bezug_typ: 'fahrzeug', bezug_id: A }],
    [{ id: 'v', titel: 'X', intervall_monate: 12 }], '2026-10-16');
  assert.equal(z[0].status, 'bald');
  assert.equal(z[0].rest, 16);
});

test('DB-Felder nur, wenn die Spalten da sind', () => {
  assert.deepEqual(bezugPatch(false, 'fahrzeug', A), {});
  assert.deepEqual(bezugPatch(true, 'fahrzeug', A), { bezug_typ: 'fahrzeug', bezug_id: A });
  assert.deepEqual(bezugPatch(true, 'fahrzeug', 'kaputt'), { bezug_typ: null, bezug_id: null });
  assert.deepEqual(bezugPatch(true, 'rechnung', A), { bezug_typ: null, bezug_id: null });
});

test('Waechter: Formularseite nutzt den Motor, SQL ist additiv', () => {
  const seite = fs.readFileSync(new URL('../app/dashboard/formulare/page.tsx', import.meta.url), 'utf8');
  assert.match(seite, /fristenUebersicht\(/);
  assert.match(seite, /naechsteFaellig\(/);
  assert.match(seite, /bezugPatch\(/);
  const sql = fs.readFileSync(new URL('../supabase-sql/p388-protokoll-bezug-frist.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\bdelete\s+from\b|\btruncate\b/i);
  assert.match(sql, /add column if not exists bezug_typ/i);
  assert.match(sql, /add column if not exists intervall_monate/i);
});
