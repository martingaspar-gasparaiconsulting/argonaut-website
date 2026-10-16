import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { begehungStatus, begehungTerminUrl, pruefeStart, gwAusAuftrag, gehoertZuAuftrag } from '../out/gewaehrleistungAuftrag.js';

// LK2 (16.10.2026) — Gewaehrleistung am Auftrag, Begehung 3 Monate vorher

const g = (abnahme, monate, extra = {}) => ({ bezeichnung: 'A-2026-007 · Bad', abnahme_am: abnahme, regelwerk: 'bgb_bauwerk', monate, ...extra });

test('Begehung: spaeter, jetzt (3 Monate vorher), verpasst, erledigt', () => {
  // Ende 15.03.2027 -> Begehung ab 15.12.2026
  assert.equal(begehungStatus(g('2022-03-15', 60), '2026-10-16').status, 'spaeter');
  assert.equal(begehungStatus(g('2022-03-15', 60), '2026-10-16').ab, '2026-12-15');
  assert.equal(begehungStatus(g('2022-03-15', 60), '2026-12-15').status, 'jetzt');
  assert.equal(begehungStatus(g('2022-03-15', 60), '2027-03-15').status, 'jetzt', 'letzter Tag zaehlt noch');
  assert.equal(begehungStatus(g('2022-03-15', 60), '2027-03-16').status, 'verpasst');
  assert.equal(begehungStatus(g('2022-03-15', 60, { begehung_am: '2027-01-10' }), '2027-02-01').status, 'erledigt');
  assert.equal(begehungStatus(g(null, 60), '2026-10-16').status, 'unbekannt');
});

test('Termin-Link: Vorbelegung wie bei Leads, Kontakt nur als UUID', () => {
  const u = new URL('https://x.de' + begehungTerminUrl({ bezeichnung: 'A-7 · Bad', kunde_name: 'Eva Muster' }, '2027-03-15', 'kaputt'));
  assert.equal(u.pathname, '/dashboard/termine');
  assert.equal(u.searchParams.get('neu'), '1');
  assert.match(u.searchParams.get('titel'), /Gewährleistungs-Begehung: A-7 · Bad/);
  assert.match(u.searchParams.get('notiz'), /15\.03\.2027/);
  assert.equal(u.searchParams.get('kontakt'), null);
});

test('Start am Auftrag: Datum Pflicht, nicht Zukunft, Frist aus Regelwerk oder Vertrag', () => {
  const h = '2026-10-16';
  assert.match(pruefeStart({ abnahme_am: '', regelwerk: 'bgb_bauwerk' }, h).fehler, /Abnahmedatum/);
  assert.match(pruefeStart({ abnahme_am: '2026-11-01', regelwerk: 'bgb_bauwerk' }, h).fehler, /Zukunft/);
  assert.equal(pruefeStart({ abnahme_am: '2026-10-01', regelwerk: 'bgb_bauwerk' }, h).monate, 60);
  assert.equal(pruefeStart({ abnahme_am: '2026-10-01', regelwerk: 'vob_bauwerk' }, h).monate, 48);
  assert.match(pruefeStart({ abnahme_am: '2026-10-01', regelwerk: 'individuell', monate: '' }, h).fehler, /Vertrag/);
  assert.equal(pruefeStart({ abnahme_am: '2026-10-01', regelwerk: 'individuell', monate: '36' }, h).monate, 36);
  assert.match(pruefeStart({ abnahme_am: '2026-10-01', regelwerk: 'quatsch' }, h).fehler, /Art der Leistung/);
});

test('Zeile fuer die Datenbank: auftrag_id nur mit Spalte, Zuordnung auch ohne', () => {
  const a = { id: 'a1', titel: 'Bad', auftragsnummer: 'A-2026-007', projekt_id: 'p1', kunde: 'Eva' };
  const ohne = gwAusAuftrag(a, { abnahme_am: '2026-10-01', regelwerk: 'bgb_bauwerk' }, 60, false);
  assert.equal(ohne.auftrag_id, undefined);
  assert.equal(ohne.bezeichnung, 'A-2026-007 · Bad');
  assert.equal(ohne.projekt_id, 'p1');
  assert.equal(gwAusAuftrag(a, { abnahme_am: '2026-10-01', regelwerk: 'bgb_bauwerk' }, 60, true).auftrag_id, 'a1');
  assert.ok(gehoertZuAuftrag({ bezeichnung: 'A-2026-007 · Bad' }, a));
  assert.ok(!gehoertZuAuftrag({ bezeichnung: 'A-2026-0071 · Bad' }, a), 'aehnliche Nummer zaehlt nicht');
  assert.ok(gehoertZuAuftrag({ auftrag_id: 'a1', bezeichnung: 'egal' }, a));
  assert.ok(!gehoertZuAuftrag({ auftrag_id: 'a2', bezeichnung: 'A-2026-007 · Bad' }, a), 'Spalte gewinnt');
});

test('Waechter: Auftragsseite zeigt die Karte, SQL additiv', () => {
  const seite = fs.readFileSync(new URL('../app/dashboard/auftraege/[id]/page.tsx', import.meta.url), 'utf8');
  assert.match(seite, /<AuftragGewaehrleistung/);
  const sql = fs.readFileSync(new URL('../supabase-sql/p392-gewaehrleistung-auftrag.sql', import.meta.url), 'utf8');
  assert.match(sql, /add column if not exists auftrag_id/);
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\bdelete\s+from\b/i);
});
