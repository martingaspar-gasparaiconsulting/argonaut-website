// ============================================================================
// tests/anrufAuswertungP361.test.mjs — Paket 361 (13.10.2026)
// VK4 Anruf-Sitzung, Teil 2: Zeit bis zum ersten Anruf, Glocke, Verlauf, Auswertung.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ersteReaktion, dauerText, reaktionsZahlen, erstanrufFaellig, glockeAn, glockeText, personenZahlen, ergebnisVerteilung,
  ERSTANRUF_SCHWELLE_MIN, ERSTANRUF_FENSTER_STD,
} from '../out/anrufSitzung.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const JETZT = new Date('2026-10-13T12:00:00Z');
const vor = (min) => new Date(JETZT.getTime() - min * 60_000).toISOString();

test('Zeit bis zum ersten Anruf: Ampel 5 Min. / 1 Std., Uhr läuft ohne Anruf', () => {
  assert.deepEqual(ersteReaktion({ created_at: vor(30), erster_anruf_am: vor(27), telefon: '0711 1' }, JETZT), { minuten: 3, laeuft: false, ampel: 'gruen', text: 'angerufen nach 3 Min.' });
  assert.equal(ersteReaktion({ created_at: vor(100), erster_anruf_am: vor(55), telefon: '0711 1' }, JETZT).ampel, 'gelb');
  const w = ersteReaktion({ created_at: vor(130), telefon: '0711 1' }, JETZT);
  assert.deepEqual(w, { minuten: 130, laeuft: true, ampel: 'rot', text: 'wartet seit 2 Std. 10 Min.' });
  assert.equal(ersteReaktion({ created_at: vor(10), telefon: '' }, JETZT).minuten, null, 'ohne Nummer keine Uhr');
  assert.equal(ersteReaktion({ created_at: vor(10), telefon: '0711 1', stufe: 'verloren' }, JETZT).minuten, null, 'abgeschlossen: keine Uhr');
  assert.equal(ersteReaktion({ created_at: vor(10), erster_anruf_am: vor(5), telefon: '', stufe: 'kunde' }, JETZT).minuten, 5, 'schon angerufen zählt immer');
  assert.equal(ersteReaktion({ telefon: '0711 1' }, JETZT).ampel, 'grau');
});

test('Dauer-Text', () => {
  assert.equal(dauerText(0), '0 Min.');
  assert.equal(dauerText(59), '59 Min.');
  assert.equal(dauerText(60), '1 Std.');
  assert.equal(dauerText(125), '2 Std. 5 Min.');
  assert.equal(dauerText(3 * 1440), '3 Tage');
});

test('Kennzahlen: Median, Anteil in 5 Min. und 1 Std., wartende', () => {
  const leads = [
    { id: 'a', created_at: vor(100), erster_anruf_am: vor(98), telefon: '0711 1' },   // 2
    { id: 'b', created_at: vor(100), erster_anruf_am: vor(90), telefon: '0711 2' },   // 10
    { id: 'c', created_at: vor(300), erster_anruf_am: vor(100), telefon: '0711 3' },  // 200
    { id: 'd', created_at: vor(100), erster_anruf_am: vor(96), telefon: '0711 4' },   // 4
    { id: 'e', created_at: vor(20), telefon: '0711 5' },                              // wartet
    { id: 'f', created_at: vor(20), telefon: '' },                                    // zählt nicht
  ];
  assert.deepEqual(reaktionsZahlen(leads, JETZT), { angerufen: 4, median: 7, unter5: 50, unter60: 75, wartend: 1 });
  assert.deepEqual(reaktionsZahlen([], JETZT), { angerufen: 0, median: null, unter5: 0, unter60: 0, wartend: 0 });
  assert.equal(reaktionsZahlen(leads.slice(0, 3), JETZT).median, 10, 'ungerade Anzahl: mittlerer Wert');
});

test('Glocke: nur neue Leads zwischen 15 Min. und 24 Std., mit Nummer, offen, nie angerufen', () => {
  assert.equal(ERSTANRUF_SCHWELLE_MIN, 15);
  assert.equal(ERSTANRUF_FENSTER_STD, 24);
  const leads = [
    { id: 'jetztNeu', created_at: vor(5), telefon: '0711 1' },
    { id: 'faellig', created_at: vor(20), telefon: '0711 2' },
    { id: 'grenze', created_at: vor(15), telefon: '0711 3' },
    { id: 'alt', created_at: vor(25 * 60), telefon: '0711 4' },
    { id: 'angerufen', created_at: vor(30), telefon: '0711 5', erster_anruf_am: vor(10) },
    { id: 'ohneNr', created_at: vor(30), telefon: '' },
    { id: 'verloren', created_at: vor(30), telefon: '0711 6', status: 'verloren' },
  ];
  assert.deepEqual(erstanrufFaellig(leads, JETZT).map((l) => l.id), ['faellig', 'grenze']);
  assert.equal(glockeAn({ setter_user_id: 's', owner_user_id: 'c' }), 's');
  assert.equal(glockeAn({ setter_user_id: null, owner_user_id: 'c' }), 'c');
  assert.equal(glockeAn({}), null);
  const t = glockeText({ id: 'x', name: 'Bäckerei Huber', created_at: vor(20), quelle: 'Website', dienstleistung: 'Dachrinne' }, JETZT);
  assert.equal(t.titel, '☎️ Bäckerei Huber wartet seit 20 Min. auf den ersten Anruf');
  assert.match(t.nachricht, /Website.*Dachrinne/);
  assert.equal(t.link, '/dashboard/akquise/sitzung');
});

test('Auswertung je Person und Ergebnis-Verteilung', () => {
  const a = [
    { user_id: 'u1', anrufer_name: 'Anna', ergebnis: 'nicht_erreicht', erstellt_am: vor(1) },
    { user_id: 'u1', anrufer_name: 'Anna', ergebnis: 'termin', erstellt_am: vor(2) },
    { user_id: 'u1', anrufer_name: 'Anna', ergebnis: 'mailbox', erstellt_am: vor(3) },
    { user_id: 'u1', anrufer_name: 'Anna', ergebnis: 'gespraech', erstellt_am: vor(4) },
    { user_id: 'u2', anrufer_name: 'Ben', ergebnis: 'kein_interesse', erstellt_am: vor(5) },
  ];
  assert.deepEqual(personenZahlen(a, new Map([['u2', 'Ben Neu']])), [
    { user_id: 'u1', name: 'Anna', anrufe: 4, erreicht: 2, termine: 1, quote: 50, jeTermin: 4 },
    { user_id: 'u2', name: 'Ben Neu', anrufe: 1, erreicht: 1, termine: 0, quote: 100, jeTermin: null },
  ]);
  const c = [{ user_id: 'u3', ergebnis: 'termin', erstellt_am: vor(1) }, { user_id: 'u3', ergebnis: 'termin', erstellt_am: vor(2) }, { user_id: 'u3', ergebnis: 'mailbox', erstellt_am: vor(3) }];
  assert.equal(personenZahlen(c)[0].jeTermin, 1.5, 'Anrufe je Termin mit einer Nachkommastelle');
  assert.equal(personenZahlen(c)[0].name, 'Unbekannt');
  assert.deepEqual(ergebnisVerteilung(a).map((e) => [e.key, e.anzahl]), [['nicht_erreicht', 1], ['mailbox', 1], ['gespraech', 1], ['termin', 1], ['kein_interesse', 1]]);
});

test('Quelltext: Cron, Verlauf an Lead und Kontakt, Startskript', () => {
  const v = JSON.parse(lies('vercel.json'));
  assert.ok(v.crons.some((c) => c.path === '/api/cron/lead-erstanruf' && c.schedule === '*/5 * * * *'), 'Cron alle 5 Minuten');
  const r = lies('app/api/cron/lead-erstanruf/route.ts');
  assert.match(r, /await cronGuard\(req\)/, 'Cron nur mit Geheimnis');
  assert.match(r, /p_dedup_stunden: 24/, 'eine Glocke je Lead');
  assert.match(r, /p_ref_id: l\.id/);
  assert.match(r, /probe/);
  assert.doesNotMatch(r, /\.update\(|\.insert\(|\.delete\(/, 'Cron ändert nichts');
  assert.match(lies('app/dashboard/leads/[id]/page.tsx'), /<AnrufVerlauf leadId=\{lead\.id\} telefon=\{lead\.telefon\} angelegt=\{lead\.created_at\} \/>/);
  assert.match(lies('app/dashboard/crm/[id]/page.tsx'), /<AnrufVerlauf kontaktId=\{kontakt\.id\}/);
  const vl = lies('app/dashboard/_components/AnrufVerlauf.tsx');
  assert.match(vl, /href=\{`tel:\$\{tel\}`\}/);
  assert.match(vl, /15 \* 60_000/, 'Zurücknehmen nur 15 Minuten angeboten');
  const s = lies('app/dashboard/akquise/sitzung/page.tsx');
  assert.match(s, /stand\.istChef \|\| stand\.team\.some\(\(p\) => p\.user_id === stand\.ich && p\.funktion === 'teamleitung'\)/, 'Auswertung nur Chef/Teamleitung');
  assert.match(lies('scripts/claude-start.sh'), /createdb[\s\S]*vorlage/);
  assert.ok(fs.existsSync(path.join(WURZEL, 'scripts/pruef-pg/stub.sql')));
});
