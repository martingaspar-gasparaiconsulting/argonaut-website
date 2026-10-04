// ============================================================================
// tests/belegAblageP198.test.mjs — Paket 198: Mahnungen und Angebots-Zusagen fest
//   ablegen, Rechnungen automatisch festschreiben (GoBD / Nachweis).
//   Dateiprüfung je Art, Pfade je Betrieb, Zusage-Nachweis mit fester
//   Reihenfolge, Auto-Festschreiben, Routen, Mahnungs-Seite, SQL.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  istBelegArt, belegTypFuer, pruefeBelegDatei, belegName, mahnungDateiname, belegPfad, belegPfadPasstZu,
  annahmeNachweis, autoFestschreiben, belegAblageFehlt, BELEG_MAX_BYTES, BELEG_ART_TEXT,
} from '../out/belegAblage.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const enc = (s) => new TextEncoder().encode(s);

const BETRIEB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BEZUG = '11111111-2222-4333-8444-555555555555';

test('Arten: nur Mahnung und Zusage; Mahnung = PDF, Zusage = JSON', () => {
  assert.equal(istBelegArt('mahnung'), true);
  assert.equal(istBelegArt('angebot_annahme'), true);
  assert.equal(istBelegArt('gutschrift'), false);
  assert.equal(belegTypFuer('mahnung'), 'application/pdf');
  assert.equal(belegTypFuer('angebot_annahme'), 'application/json');
  assert.equal(BELEG_ART_TEXT.mahnung, 'Mahnung');
});

test('Dateiprüfung: Mahnung nur echtes PDF, Zusage nur JSON-Objekt, 10 MB', () => {
  assert.deepEqual(pruefeBelegDatei(enc('%PDF-1.7 x'), 'mahnung'), { ok: true, typ: 'application/pdf' });
  assert.equal(pruefeBelegDatei(enc('{"a":1}'), 'mahnung').ok, false);
  assert.deepEqual(pruefeBelegDatei(enc('{"a":1}'), 'angebot_annahme'), { ok: true, typ: 'application/json' });
  assert.equal(pruefeBelegDatei(enc('[1,2]'), 'angebot_annahme').ok, false);
  assert.equal(pruefeBelegDatei(enc('kein json'), 'angebot_annahme').ok, false);
  assert.equal(pruefeBelegDatei(new Uint8Array(0), 'mahnung').ok, false);
  const gross = new Uint8Array(BELEG_MAX_BYTES + 1); gross.set(enc('%PDF-'));
  assert.equal(pruefeBelegDatei(gross, 'mahnung').ok, false);
});

test('Namen und Pfade: sicher, je Betrieb, Prüfung beim Ausliefern', () => {
  assert.equal(belegName('Mahnung Ä/../x', 'application/pdf'), 'Mahnung_Ae_.._x.pdf');
  assert.equal(mahnungDateiname(1, 'RE-1'), 'Zahlungserinnerung_RE-1.pdf');
  assert.equal(mahnungDateiname(2, 'RE-1'), 'Mahnung1_RE-1.pdf');
  assert.equal(mahnungDateiname(4, null), 'LetzteMahnung_Dokument.pdf');
  const p = belegPfad(BETRIEB, 'mahnung', BEZUG, Date.UTC(2026, 9, 4), 'M.pdf');
  assert.equal(p, `${BETRIEB}/beleg/mahnung/2026/${BEZUG}/${Date.UTC(2026, 9, 4)}_M.pdf`);
  assert.equal(belegPfadPasstZu(p, BETRIEB, 'mahnung', BEZUG), true);
  assert.equal(belegPfadPasstZu(p, BETRIEB, 'angebot_annahme', BEZUG), false);
  assert.equal(belegPfadPasstZu(p, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'mahnung', BEZUG), false);
  assert.equal(belegPfadPasstZu(`${BETRIEB}/beleg/mahnung/2026/../x`, BETRIEB, 'mahnung', BEZUG), false);
  assert.throws(() => belegPfad('kein-uuid', 'mahnung', BEZUG, 0, 'x.pdf'));
  assert.throws(() => belegPfad(BETRIEB, 'gutschrift', BEZUG, 0, 'x.pdf'));
});

test('Zusage-Nachweis: feste Reihenfolge, Positionen sortiert, keine Mail/IP', () => {
  const opts = {
    kopf: { id: BEZUG, angebotsnummer: 'AN-7', titel: 'Bad', kunde_name: 'Frau M', gueltig_bis: '2026-11-01', netto_summe: '100', mwst_summe: 19, brutto_summe: 119, kunde_email: 'm@x.de' },
    positionen: [{ position: 2, bezeichnung: 'B', menge: 1, einzelpreis: 40, mwst_satz: 19, gesamt_netto: 40 }, { position: 1, bezeichnung: 'A', menge: '2', einzelpreis: 30, mwst_satz: 19, gesamt_netto: 60 }],
    betrieb: 'Muster GmbH', name: 'Maria M', erklaerung: 'Ich nehme an.', zeitpunkt: '2026-10-04T10:00:00.000Z',
  };
  const a = annahmeNachweis(opts);
  const b = annahmeNachweis({ ...opts, positionen: [...opts.positionen].reverse() });
  assert.equal(a, b);
  const j = JSON.parse(a);
  assert.deepEqual(j.positionen.map((p) => p.bezeichnung), ['A', 'B']);
  assert.equal(j.positionen[0].menge, 2);
  assert.deepEqual(j.summen, { netto: 100, mwst: 19, brutto: 119 });
  assert.equal(j.zusage.name, 'Maria M');
  assert.equal(a.includes('m@x.de'), false);
  assert.equal(pruefeBelegDatei(enc(a), 'angebot_annahme').ok, true);
});

test('Auto-Festschreiben: Zahlung, Mahnung, Meldung ja — Storno, sonstiges nein', () => {
  assert.equal(autoFestschreiben({ zahlungsstatus: 'offen' }, { zahlungsstatus: 'bezahlt' }), true);
  assert.equal(autoFestschreiben({ zahlungsstatus: 'offen' }, { zahlungsstatus: 'teilbezahlt' }), true);
  assert.equal(autoFestschreiben({ zahlungsstatus: 'teilbezahlt' }, { zahlungsstatus: 'bezahlt' }), false);
  assert.equal(autoFestschreiben({ mahnstufe: 0 }, { mahnstufe: 1 }), true);
  assert.equal(autoFestschreiben({ mahnstufe: 2 }, { mahnstufe: 2 }), false);
  assert.equal(autoFestschreiben({}, { zahlung_gemeldet_am: '2026-10-04' }), true);
  assert.equal(autoFestschreiben({ zahlungsstatus: 'offen' }, { zahlungsstatus: 'storniert' }), false);
  assert.equal(autoFestschreiben({ festgeschrieben_am: '2026-10-01', mahnstufe: 0 }, { mahnstufe: 1 }), false);
  assert.equal(belegAblageFehlt('relation "public.beleg_ablage" does not exist'), true);
  assert.equal(belegAblageFehlt('permission denied'), false);
});

test('Route beleg-ablage: Abrechnungsrecht, Rechnung mit Sitzung, Prüfsumme beim Ausliefern', () => {
  const s = lies('app/api/beleg-ablage/route.ts');
  assert.match(s, /abrechnungPruefen\(/);
  assert.match(s, /from\('rechnungen'\)\.select\('id, owner_user_id, rechnungsnummer'\)/);
  assert.match(s, /owner_user_id\) !== abr\.betrieb/);
  assert.match(s, /sha256Hex\(bytes\) !== zeile\.datei_hash/);
  assert.match(s, /belegPfadPasstZu\(/);
  const srv = lies('lib/belegAblageServer.ts');
  assert.match(srv, /upsert: false/);
  assert.match(srv, /pruefeBelegDatei\(/);
});

test('Zusage-Route legt Nachweis nach der Annahme ab, Fehler hält die Zusage nicht auf', () => {
  const s = lies('app/api/oeffentlich/angebot/route.ts');
  const i = s.indexOf("art: 'angebot_annahme'");
  assert.ok(i > 0);
  assert.ok(s.indexOf("eq('status', 'gesendet')") < i, 'erst nach der erfolgreichen Annahme');
  assert.match(s, /if \(entscheidung === 'annehmen'\) \{\s*try \{/);
});

test('Mahnungs-Seite: „gesendet" legt genau das PDF ab, Liste der Originale', () => {
  const s = lies('app/dashboard/mahnwesen/[id]/page.tsx');
  assert.match(s, /fetch\("\/api\/beleg-ablage", \{ method: "POST"/);
  assert.match(s, /letztesPdf\.schluessel === pdfSchluessel\(\)/);
  assert.match(s, /from\("beleg_ablage"\)/);
  assert.match(s, /\/api\/beleg-ablage\?id=/);
  const m = lies('app/api/admin/musterbetrieb-xxl/route.ts');
  assert.match(m, /from\('beleg_ablage'\)\.delete\(\)/);
});

test('SQL p198: unveränderbar, Auto-Festschreiben, Angebot gesperrt, Zwei-Faktor, Rückweg', () => {
  const s = lies('supabase-sql/p198-beleg-ablage.sql');
  assert.match(s, /create table if not exists public\.beleg_ablage/);
  assert.match(s, /raise exception 'Abgelegte Belege sind unveränderbar/);
  assert.match(s, /create trigger p198_auto_fest\s+before update on public\.rechnungen/);
  assert.match(s, /in \('bezahlt', 'teilbezahlt'\)/);
  assert.match(s, /coalesce\(new\.mahnstufe, 0\) > coalesce\(old\.mahnstufe, 0\)/);
  assert.match(s, /create trigger p198_angebot_fest\s+before update or delete on public\.angebote/);
  assert.match(s, /create trigger p198_angebot_position_fest\s+before insert or update or delete on public\.angebot_positionen/);
  assert.match(s, /create policy p164s3_aal on public\.beleg_ablage as restrictive/);
  assert.match(s, /RÜCKWEG/);
  assert.doesNotMatch(s, /\bdrop table\b|\btruncate\b|delete from public\./i);
});
