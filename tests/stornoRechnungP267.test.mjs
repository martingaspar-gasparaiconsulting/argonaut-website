// ============================================================================
// tests/stornoRechnungP267.test.mjs — Paket 267 (07.10.2026) · Stornorechnung als Beleg
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  stornoKnoepfe, dokumentTitel, stornoBezugText, stornoZahlungText, stornoFrage, stornoFehlerText, grundBereinigen, stornoPositionen,
} from '../out/stornoRechnung.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const lage = (x) => ({ status: 'offen', festgeschrieben: false, istStorno: false, hatStorno: false, istChef: true, ...x });

test('Knöpfe: verschickt nur per Stornorechnung, nie verschickt auch per Status', () => {
  assert.deepEqual(stornoKnoepfe(lage({ festgeschrieben: true })), { stornorechnung: true, nurStatus: false, reaktivieren: false, hinweis: null });
  assert.deepEqual(stornoKnoepfe(lage({})), { stornorechnung: true, nurStatus: true, reaktivieren: false, hinweis: null });
  const nachtraeglich = stornoKnoepfe(lage({ status: 'storniert', festgeschrieben: true }));
  assert.equal(nachtraeglich.stornorechnung, true);
  assert.match(nachtraeglich.hinweis, /nachträglich/);
  assert.equal(stornoKnoepfe(lage({ status: 'storniert' })).reaktivieren, true);
});

test('Knöpfe: mit Stornorechnung nichts mehr, Stornorechnung selbst unveränderbar, Mitarbeiter ohne Knöpfe', () => {
  const durch = stornoKnoepfe(lage({ status: 'storniert', festgeschrieben: true, hatStorno: true }));
  assert.equal(durch.stornorechnung || durch.nurStatus || durch.reaktivieren, false);
  assert.match(durch.hinweis, /neue Rechnung/);
  const selbst = stornoKnoepfe(lage({ status: 'storniert', istStorno: true }));
  assert.equal(selbst.stornorechnung || selbst.nurStatus || selbst.reaktivieren, false);
  const ma = stornoKnoepfe(lage({ istChef: false }));
  assert.equal(ma.stornorechnung || ma.nurStatus || ma.reaktivieren, false);
});

test('Titel, Verweis, Zahlungstext', () => {
  assert.equal(dokumentTitel(null, true), 'Stornorechnung');
  assert.equal(dokumentTitel('abschlag', true), 'Stornorechnung', 'Storno schlägt die Art');
  assert.equal(dokumentTitel('schluss', false), 'Schlussrechnung');
  assert.equal(dokumentTitel('abschlag', false), 'Abschlagsrechnung');
  assert.equal(dokumentTitel('', false), 'Rechnung');
  assert.match(stornoBezugText('RE-2026-0012', '2026-09-30'), /Rechnung Nr\. RE-2026-0012 vom 30\.09\.2026/);
  assert.match(stornoBezugText(null, null), /Nr\. — vom —/);
  assert.match(stornoZahlungText(119), /119,00 € gezahlt.*erstatten/);
  assert.match(stornoZahlungText(0), /nichts zahlen/);
  assert.doesNotMatch(stornoZahlungText(0), /überweisen|IBAN/);
  assert.match(stornoFrage('RE-1', 50), /50,00 €.*Erstattung/s);
  assert.doesNotMatch(stornoFrage('RE-1', 0), /Erstattung/);
});

test('Fehlertexte, Grund, Positionen', () => {
  assert.match(stornoFehlerText('Could not find the function public.p267_storno_erstellen'), /SQL Paket 267/);
  assert.match(stornoFehlerText('Zu dieser Rechnung gibt es schon eine Stornorechnung.'), /schon eine Stornorechnung/);
  assert.equal(grundBereinigen('  Kunde\n trat   zurück '), 'Kunde trat zurück');
  assert.equal(grundBereinigen(''), null);
  assert.equal(grundBereinigen(null), null);
  assert.equal(grundBereinigen('x'.repeat(400)).length, 300);
  assert.deepEqual(stornoPositionen([{ menge: 2, gesamt_netto: 60, einzelpreis: 30 }, { menge: 0, gesamt_netto: 0 }]), [{ menge: -2, gesamt_netto: -60, einzelpreis: 30 }, { menge: 0, gesamt_netto: 0 }]);
});

test('SQL: Verweis eindeutig, alles in einem Schritt, nur Chef, Schutz, nichts destruktiv', () => {
  const sql = lies('supabase-sql/p267-stornorechnung.sql');
  assert.match(sql, /add column if not exists storno_zu uuid references public\.rechnungen\(id\) on delete restrict/);
  assert.match(sql, /create unique index if not exists rechnungen_storno_zu_uq on public\.rechnungen \(storno_zu\) where storno_zu is not null/);
  assert.match(sql, /security invoker/, 'Datenbank-Regeln gelten für den Aufrufer');
  assert.match(sql, /auth\.uid\(\) <> o\.owner_user_id/, 'nur Geschäftsleitung');
  assert.match(sql, /'menge', -coalesce\(p\.menge, 0\)/);
  assert.match(sql, /festgeschrieben_am = now\(\)/);
  assert.match(sql, /lässt sich nicht reaktivieren/);
  assert.match(sql, /Eine Stornorechnung bleibt „storniert"/);
  assert.match(sql, /i\.indisunique/, 'eindeutige Spalten werden nicht kopiert');
  assert.doesNotMatch(sql, /drop table|truncate|delete from/i);
});

test('Verdrahtung: PDF-Route und Rechnungsseite', () => {
  const route = lies('app/api/rechnung-pdf/route.ts');
  assert.match(route, /const istStorno = !!rechnung\?\.storno_zu/);
  assert.match(route, /\(bereitsBezahlt \|\| istStorno\) \? null : girocodeVonDaten/, 'kein GiroCode auf der Stornorechnung');
  assert.match(route, /const bank = istStorno/, 'keine Zahlungsaufforderung');
  assert.match(route, /!rechnung\?\.storno_zu\) \{/, 'kein Bezahllink');
  const seite = lies('app/dashboard/rechnungen/[id]/page.tsx');
  assert.match(seite, /supabase\.rpc\("p267_storno_erstellen"/);
  assert.match(seite, /stornoKnoepfe\(\{/);
  assert.match(seite, /storno_bezug: stornoBezug \?/);
});
