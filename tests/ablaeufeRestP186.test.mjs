// ============================================================================
// tests/ablaeufeRestP186.test.mjs — Paket 186: Löschen ohne Nachweis-Verlust,
// hängende Läufe nach 2 Std. beenden, Webhook-Neuversuche (1 h / 6 h / 24 h).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  laufHaengt, haengtGrenze, webhookWiederholbar, neuversuchPlanen, ablaufSichtbar, loeschFrage,
  HAENGT_NACH_STUNDEN, MAX_NEUVERSUCHE, NEUVERSUCH_ABSTAENDE_STUNDEN, OFFENE_STATUS_BEIM_LOESCHEN,
} from '../out/ablaufRobust.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const JETZT = new Date('2026-10-01T10:00:00Z');
const vor = (h) => new Date(JETZT.getTime() - h * 3600e3).toISOString();

test('Hängt: nur „läuft", ab 2 Stunden, laeuft_seit vor gestartet_am', () => {
  assert.equal(HAENGT_NACH_STUNDEN, 2);
  assert.equal(laufHaengt({ status: 'laeuft', gestartet_am: vor(3) }, JETZT), true);
  assert.equal(laufHaengt({ status: 'laeuft', gestartet_am: vor(1) }, JETZT), false);
  assert.equal(laufHaengt({ status: 'laeuft', gestartet_am: vor(2) }, JETZT), true);
  // Seit 30 Tagen gestartet, aber gerade eben fortgesetzt -> hängt NICHT
  assert.equal(laufHaengt({ status: 'laeuft', gestartet_am: vor(720), laeuft_seit: vor(0.5) }, JETZT), false);
  assert.equal(laufHaengt({ status: 'laeuft', gestartet_am: vor(720), laeuft_seit: vor(2.5) }, JETZT), true);
  for (const st of ['wartet', 'freigabe', 'fertig', 'fehler', null]) assert.equal(laufHaengt({ status: st, gestartet_am: vor(99) }, JETZT), false, String(st));
  assert.equal(laufHaengt({ status: 'laeuft' }, JETZT), false);
  assert.equal(haengtGrenze(JETZT), vor(2));
});

test('Webhook: Neuversuch nur, wenn Warten hilft', () => {
  for (const st of [500, 502, 503, 504, 429, 408]) assert.equal(webhookWiederholbar({ ok: false, status: st, meldung: '' }), true, String(st));
  assert.equal(webhookWiederholbar({ ok: false, status: null, meldung: 'Zeitlimit überschritten' }), true);
  assert.equal(webhookWiederholbar({ ok: false, status: null, meldung: 'getaddrinfo ENOTFOUND x' }), true);
  for (const st of [400, 401, 403, 404, 410, 301]) assert.equal(webhookWiederholbar({ ok: false, status: st, meldung: '' }), false, String(st));
  for (const m of ['Nur https', 'Adresse unlesbar', 'Adresse zeigt ins interne Netz (127.0.0.1) — nicht verbunden.', 'Webhook-Geheimnis fehlt auf dem Server']) {
    assert.equal(webhookWiederholbar({ ok: false, status: null, meldung: m }), false, m);
  }
  assert.equal(webhookWiederholbar({ ok: true, status: 200, meldung: '' }), false);
});

test('Neuversuche: 3 Stück nach 1, 6, 24 Stunden — dann aufgeben; Zählung je Schritt', () => {
  assert.equal(MAX_NEUVERSUCHE, 3);
  assert.deepEqual([...NEUVERSUCH_ABSTAENDE_STUNDEN], [1, 5, 18]);
  let stand = { neuversuch_pfad: null, neuversuche: 0 };
  let t = JETZT;
  const zeiten = [];
  for (let i = 1; i <= 3; i++) {
    const p = neuversuchPlanen(stand, '2', t);
    assert.equal(p.art, 'neuversuch');
    assert.equal(p.nr, i);
    zeiten.push((new Date(p.weiter_am).getTime() - JETZT.getTime()) / 3600e3);
    assert.match(p.meldung, new RegExp(`Neuversuch ${i} von 3`));
    stand = { neuversuch_pfad: '2', neuversuche: p.nr };
    t = new Date(p.weiter_am);
  }
  assert.deepEqual(zeiten, [1, 6, 24]);
  assert.equal(neuversuchPlanen(stand, '2', t).art, 'aufgeben');
  // anderer Schritt -> neue Zählung
  const anders = neuversuchPlanen({ neuversuch_pfad: '2', neuversuche: 3 }, '4', t);
  assert.equal(anders.art, 'neuversuch'); assert.equal(anders.nr, 1);
  assert.equal(neuversuchPlanen(null, '0', JETZT).nr, 1);
});

test('Löschen: gelöschte unsichtbar, Rückfrage nennt offene Läufe und dass das Protokoll bleibt', () => {
  assert.equal(ablaufSichtbar({ geloescht_am: null }), true);
  assert.equal(ablaufSichtbar({}), true);
  assert.equal(ablaufSichtbar({ geloescht_am: '2026-10-01T10:00:00Z' }), false);
  assert.equal(ablaufSichtbar(null), false);
  assert.match(loeschFrage('Mahnung', 0), /Protokoll bleiben/);
  assert.match(loeschFrage('Mahnung', 1), /1 wartender Lauf endet/);
  assert.match(loeschFrage('Mahnung', 3), /3 wartende Läufe enden/);
  assert.deepEqual([...OFFENE_STATUS_BEIM_LOESCHEN], ['wartet', 'freigabe']);
});

test('WÄCHTER Motor: laufbereit lehnt gelöschte Abläufe ab', () => {
  const s = ohneKommentare(lies('lib/ablaufMotor.ts'));
  assert.match(s, /\(ablauf as \{ geloescht_am\?: string \| null \}\)\.geloescht_am\) return false/);
});

test('WÄCHTER Ausführung: Neuversuch am selben Schritt, Fehler-Glocke, laeuft_seit beim Start', () => {
  const s = ohneKommentare(lies('lib/ablaufAusfuehren.ts'));
  assert.match(s, /wiederholbar: webhookWiederholbar\(r\)/);
  assert.match(s, /neuversuchPlanen\(lauf, e\.pfad, jetzt\)/);
  assert.match(s, /status: 'wartet', pfad: e\.pfad, weiter_am: nv\.weiter_am/);
  assert.match(s, /await laufFehlerGlocke\(db, lauf, ablauf\.name, r\.meldung\)/);
  assert.match(s, /laeuft_seit: jetzt\.toISOString\(\)/);
});

test('WÄCHTER Cron: hängende Läufe beenden, Fortsetzen setzt laeuft_seit', () => {
  const s = ohneKommentare(lies('app/api/cron/ablaeufe/route.ts'));
  assert.match(s, /laufHaengt\(lauf, jetzt\)/);
  assert.match(s, /status: 'fehler', meldung: HAENGT_MELDUNG/);
  assert.match(s, /\.eq\('status', 'laeuft'\)\.select\('id'\)/);
  assert.match(s, /laufFehlerGlocke\(admin, lauf, name, HAENGT_MELDUNG\)/);
  assert.match(s, /update\(\{ status: 'laeuft', laeuft_seit: jetzt\.toISOString\(\) \}\)/);
});

test('WÄCHTER Seite: Löschen blendet aus (kein delete), beendet offene Läufe, Liste zeigt nur sichtbare', () => {
  const s = ohneKommentare(lies('app/dashboard/ablaeufe/page.tsx'));
  assert.ok(!/from\('ablaeufe'\)[^;]*\.delete\(/.test(s), 'Abläufe nie echt löschen');
  assert.match(s, /update\(\{ aktiv: false, geloescht_am: jetzt/);
  assert.match(s, /status: 'abgebrochen', meldung: 'Ablauf gelöscht'/);
  assert.match(s, /sichtbar\.map\(\(a\)/);
  assert.match(s, /onClick=\{\(\) => loeschen\(a\)\}/);
});

test('WÄCHTER SQL p186: nur hinzu, Schranke gegen echtes Löschen', () => {
  const s = lies('supabase-sql/p186-ablaeufe-rest.sql');
  assert.match(s, /add column if not exists geloescht_am/);
  assert.match(s, /add column if not exists laeuft_seit/);
  assert.match(s, /as restrictive for delete to authenticated using \(false\)/);
  assert.ok(!/drop table|drop column|delete from|truncate/i.test(s));
});
