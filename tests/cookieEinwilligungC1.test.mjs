// Paket C1 (16.10.2026): Einwilligungs-Fenster + Wiedererkennung mit Cookie
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  entscheidungPruefen, wahlLesen, gueltigeKennung, messungAktiv, kennungFuerEreignis, knopfSchrift,
  fensterHtml, fensterCss, fensterSkript, EINWILLIGUNG_VERSION, EINWILLIGUNG_VERSIONEN, COOKIE_TAGE, DATENSCHUTZ_ABSCHNITT,
} from '../out/cookieEinwilligung.js';
import { startFrei, START_FREIGABE } from '../out/startSperre.js';
import { seiteHtml } from '../out/webBloecke.js';
import { datenschutzText, fussHtml } from '../out/webRecht.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const K = '3f2b8c1e-9d4a-4b7e-8c21-5a6f7e8d9c0b';
const ci = { firma: 'Elektro Muster', farbe_primaer: '#1F3A5F', cookie_messung: true };
const bloecke = [{ typ: 'kontakt', titel: 'Kontakt', text: 'x' }];

test('Start-Schalter cookieMessung ist im Code aus (Anwalt R68)', () => {
  assert.equal(START_FREIGABE.cookieMessung, false);
  assert.equal(startFrei('cookieMessung'), false);
  assert.equal(startFrei('cookieMessung', { cookieMessung: true }), true);
  assert.match(lies('lib/freigabeZentrale.ts'), /cookieMessung: \{ titel: [^}]*anwalt: 'R68' \}/);
});

test('Messung nur, wenn Schalter UND Betrieb an sind', () => {
  assert.equal(messungAktiv(false, { cookie_messung: true }), false);
  assert.equal(messungAktiv(true, { cookie_messung: false }), false);
  assert.equal(messungAktiv(true, null), false);
  assert.equal(messungAktiv(true, {}), false);
  assert.equal(messungAktiv(true, { cookie_messung: true }), true);
  assert.equal(kennungFuerEreignis(K, false), null);
  assert.equal(kennungFuerEreignis('abc', true), null);
  assert.equal(kennungFuerEreignis(K, true), K);
});

test('Kennung: nur Zufalls-UUID v4, klein', () => {
  assert.ok(gueltigeKennung(K));
  assert.ok(!gueltigeKennung(K.toUpperCase()));
  assert.ok(!gueltigeKennung('3f2b8c1e-9d4a-1b7e-8c21-5a6f7e8d9c0b'), 'v1 nicht');
  assert.ok(!gueltigeKennung('<script>'));
  assert.ok(!gueltigeKennung(null));
});

test('Cookie lesen', () => {
  assert.deepEqual(wahlLesen(''), { wahl: null, kennung: null });
  assert.deepEqual(wahlLesen('a=1; ao_einw=nein'), { wahl: 'nein', kennung: null });
  assert.deepEqual(wahlLesen('ao_einw=ja.' + K + '; b=2'), { wahl: 'ja', kennung: K });
  assert.deepEqual(wahlLesen('ao_einw=ja.kaputt'), { wahl: null, kennung: null });
  assert.deepEqual(wahlLesen('xao_einw=nein'), { wahl: null, kennung: null });
});

test('Nachweis-Meldung wird streng geprueft', () => {
  const v = EINWILLIGUNG_VERSION;
  assert.deepEqual(entscheidungPruefen({ seite: 'abcd1234', entscheidung: 'ja', besucher_id: K, version: v }),
    { seite: 'abcd1234', entscheidung: 'ja', besucher_id: K, text_version: v });
  assert.deepEqual(entscheidungPruefen({ seite: 'abcd1234', entscheidung: 'nein', besucher_id: null, version: v }),
    { seite: 'abcd1234', entscheidung: 'nein', besucher_id: null, text_version: v });
  assert.ok('fehler' in entscheidungPruefen({ seite: 'abcd1234', entscheidung: 'nein', besucher_id: K, version: v }), 'nein ohne Kennung');
  assert.ok('fehler' in entscheidungPruefen({ seite: 'abcd1234', entscheidung: 'ja', besucher_id: null, version: v }), 'ja braucht Kennung');
  assert.ok('fehler' in entscheidungPruefen({ seite: 'abcd1234', entscheidung: 'widerruf', besucher_id: 'x', version: v }));
  assert.ok('fehler' in entscheidungPruefen({ seite: 'abcd1234', entscheidung: 'ja', besucher_id: K, version: 'erfunden' }), 'unbekannte Fassung');
  assert.ok('fehler' in entscheidungPruefen({ seite: 'a b', entscheidung: 'ja', besucher_id: K, version: v }));
  assert.ok('fehler' in entscheidungPruefen({ seite: 'abcd1234', entscheidung: 'vielleicht', version: v }));
  assert.ok('fehler' in entscheidungPruefen(null));
  assert.ok(EINWILLIGUNG_VERSIONEN.includes(v));
});

test('Fenster: Annehmen und Ablehnen gleichwertig, nichts vorausgewaehlt, startet versteckt', () => {
  const h = fensterHtml();
  const knoepfe = h.match(/<button[^>]*>[^<]*<\/button>/g);
  assert.equal(knoepfe.length, 2, 'genau zwei Knoepfe, kein Schliessen-X');
  const klassen = knoepfe.map((k) => /class="([^"]+)"/.exec(k)[1]);
  assert.equal(klassen[0], klassen[1], 'gleiche Klasse = gleiche Groesse und Farbe');
  assert.ok(knoepfe.some((k) => /data-wahl="ja"/.test(k)) && knoepfe.some((k) => /data-wahl="nein"/.test(k)));
  assert.doesNotMatch(h, /checkbox|checked/);
  assert.match(h, /^<div id="ao-einw"[^>]* hidden>/);
  assert.match(h, /href="#datenschutz"/);
  const css = fensterCss('#1F3A5F');
  assert.equal((css.match(/\.ao-einw-b\{/g) || []).length, 1, 'nur EINE Knopf-Regel');
  assert.doesNotMatch(css, /data-wahl/, 'keine Sonderregel fuer einen Knopf');
});

test('Knopfschrift nach Kontrast', () => {
  assert.equal(knopfSchrift('#1F3A5F'), '#ffffff');
  assert.equal(knopfSchrift('#F5D547'), '#000000');
  assert.equal(knopfSchrift('#fff'), '#000000');
  assert.equal(knopfSchrift('kaputt'), '#ffffff');
  assert.match(fensterCss('url(x)'), /background:#0A1628/, 'nur echte Farben');
});

// --- Das Skript im Browser nachgestellt ------------------------------------
function browser(startCookie = '') {
  const cookies = {};
  if (startCookie) { const [n, v] = startCookie.split('='); cookies[n] = v; }
  const meldungen = [];
  const knoepfe = {};
  const fenster = { hidden: true, querySelector: (q) => knoepfe[q] ?? knoepfe['[data-wahl=ja]'] };
  const mk = () => ({ handler: null, addEventListener(t, f) { this.handler = f; }, focus() {} });
  knoepfe['[data-wahl=ja]'] = mk();
  knoepfe['[data-wahl=nein]'] = mk();
  knoepfe['[data-wahl]'] = knoepfe['[data-wahl=nein]'];
  const oeffnen = mk();
  const document = {
    get cookie() { return Object.entries(cookies).map(([n, v]) => n + '=' + v).join('; '); },
    set cookie(s) { const [nv] = s.split(';'); const i = nv.indexOf('='); cookies[nv.slice(0, i)] = nv.slice(i + 1); this.gesetzt.push(s); },
    gesetzt: [],
    getElementById: (id) => (id === 'ao-einw' ? fenster : null),
    querySelectorAll: () => [oeffnen],
  };
  const window = { crypto: { randomUUID: () => K } };
  const ctx = {
    document, window, location: { protocol: 'https:' }, Date, JSON, encodeURIComponent, decodeURIComponent, Uint8Array,
    fetch: (url, o) => { meldungen.push({ url, body: JSON.parse(o.body) }); return Promise.resolve(); },
  };
  const code = fensterSkript('seite_123').replace(/^<script>/, '').replace(/<\/script>$/, '');
  vm.runInNewContext(code, ctx);
  return { cookies, meldungen, fenster, knoepfe, oeffnen, document, window };
}

test('Erstbesuch: Fenster sichtbar, KEIN Cookie, keine Kennung, keine Meldung', () => {
  const b = browser();
  assert.equal(b.fenster.hidden, false);
  assert.equal(b.document.gesetzt.length, 0);
  assert.equal(b.window.__ANALYSE_BESUCHER, undefined);
  assert.equal(b.meldungen.length, 0);
});

test('Annehmen: erst jetzt Cookie mit Kennung, Nachweis ja, Weitergabe an analyse.js', () => {
  const b = browser();
  b.knoepfe['[data-wahl=ja]'].handler();
  assert.equal(b.cookies.ao_einw, encodeURIComponent('ja.' + K));
  assert.match(b.document.gesetzt[0], /SameSite=Lax/);
  assert.match(b.document.gesetzt[0], /Secure/);
  const tage = (new Date(/expires=([^;]+)/.exec(b.document.gesetzt[0])[1]) - Date.now()) / 864e5;
  assert.ok(tage > COOKIE_TAGE - 1 && tage <= COOKIE_TAGE + 0.01);
  assert.equal(b.window.__ANALYSE_BESUCHER, K);
  assert.equal(b.fenster.hidden, true);
  assert.deepEqual(b.meldungen[0].body, { seite: 'seite_123', entscheidung: 'ja', besucher_id: K, version: EINWILLIGUNG_VERSION });
  assert.equal(b.meldungen[0].url, '/api/oeffentlich/einwilligung');
});

test('Ablehnen: nur Vermerk nein, keine Kennung, Nachweis nein', () => {
  const b = browser();
  b.knoepfe['[data-wahl=nein]'].handler();
  assert.equal(b.cookies.ao_einw, 'nein');
  assert.ok(!b.window.__ANALYSE_BESUCHER);
  assert.deepEqual(b.meldungen[0].body, { seite: 'seite_123', entscheidung: 'nein', besucher_id: null, version: EINWILLIGUNG_VERSION });
});

test('Wiederkehrer mit Ja: Fenster bleibt zu, Kennung sofort da; Widerruf ueber Cookie-Einstellungen', () => {
  const b = browser('ao_einw=' + encodeURIComponent('ja.' + K));
  assert.equal(b.fenster.hidden, true);
  assert.equal(b.window.__ANALYSE_BESUCHER, K);
  assert.equal(b.meldungen.length, 0, 'kein doppelter Nachweis');
  b.oeffnen.handler({ preventDefault() {} });
  assert.equal(b.fenster.hidden, false);
  b.knoepfe['[data-wahl=nein]'].handler();
  assert.equal(b.cookies.ao_einw, 'nein');
  assert.equal(b.window.__ANALYSE_BESUCHER, null);
  assert.deepEqual(b.meldungen[0].body.entscheidung, 'widerruf');
  assert.equal(b.meldungen[0].body.besucher_id, K);
});

test('Wiederkehrer mit Nein: Fenster bleibt zu, nichts wird gemeldet', () => {
  const b = browser('ao_einw=nein');
  assert.equal(b.fenster.hidden, true);
  assert.equal(b.meldungen.length, 0);
  assert.ok(!b.window.__ANALYSE_BESUCHER);
});

test('Webseite: ohne Freigabe kein Fenster, kein Cookie-Skript, kein Abschnitt', () => {
  const html = seiteHtml({ titel: 'T', bloecke }, ci, 2026, { oeffentlichId: 'seite_123' });
  assert.doesNotMatch(html, /ao-einw|ao_einw|Cookie-Einstellungen/);
  assert.doesNotMatch(html, new RegExp(DATENSCHUTZ_ABSCHNITT.titel.replace(/[()]/g, '.')));
  assert.match(html, /Cookiefreie Reichweitenmessung/);
});

test('Webseite mit wirksamer Messung: Fenster, Skript VOR analyse.js, Fuss-Knopf, Datenschutz-Abschnitt', () => {
  const html = seiteHtml({ titel: 'T', bloecke }, ci, 2026, { oeffentlichId: 'seite_123', cookieMessung: true });
  assert.match(html, /<div id="ao-einw"/);
  assert.match(html, /data-ao-einw-oeffnen>Cookie-Einstellungen</);
  assert.match(html, /Wiedererkennung mit Cookie \(nur mit Ihrer Einwilligung\)/);
  assert.ok(html.indexOf('/api/oeffentlich/einwilligung') < html.indexOf('src="/analyse.js"'));
});

test('Editor-Vorschau zeigt nie das Fenster', () => {
  const html = seiteHtml({ titel: 'T', bloecke }, ci, 2026, { oeffentlichId: 'seite_123', cookieMessung: true, editor: true });
  assert.doesNotMatch(html, /id="ao-einw"/);
  const ohneId = seiteHtml({ titel: 'T', bloecke }, ci, 2026, { cookieMessung: true });
  assert.doesNotMatch(ohneId, /id="ao-einw"/);
});

test('Datenschutz-Sammeltext und Fuss ohne Flagge unveraendert', () => {
  assert.doesNotMatch(datenschutzText({ firma: 'X' }), /ao_einw/);
  assert.match(datenschutzText({ firma: 'X' }, { cookieMessung: true }), /§ 25 Abs\. 1 TDDDG/);
  assert.doesNotMatch(fussHtml({ firma: 'X' }, 2026), /Cookie-Einstellungen/);
});

test('analyse.js liest und setzt weiterhin kein Cookie (eigene Seite bleibt cookiefrei)', () => {
  const js = lies('public/analyse.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(js, /document\.cookie|localStorage|sessionStorage/);
  assert.match(js, /window\.__ANALYSE_BESUCHER/);
});

test('Server: Kennung nur mit Schalter und Betriebs-Einstellung; Nachweis-Route sperrt zuerst', () => {
  const a = lies('app/api/oeffentlich/analyse/route.ts');
  assert.match(a, /startFreiServer\('cookieMessung'\)/);
  assert.match(a, /messungAktiv\(true, ciZeile/);
  assert.match(a, /delete zeile\.besucher_id/, 'ohne Spalte trotzdem zaehlen');
  const r = lies('app/api/oeffentlich/einwilligung/route.ts');
  const iSperre = r.indexOf("startFreiServer('cookieMessung')");
  assert.ok(iSperre > 0 && iSperre < r.indexOf('await req.json()'), 'Schalter vor dem Lesen');
  assert.match(r, /drossel\(db, 'oeffentlich\/einwilligung'/);
  assert.match(r, /update\(\{ besucher_id: null \}\)\.eq\('owner_user_id', owner\)/);
  assert.doesNotMatch(r, /ip_adresse|ip:\s*drosselIp\(req\.headers\)\s*,\s*\n?\s*owner/);
  for (const p of ['app/p/[id]/route.ts', 'app/p-domain/[host]/route.ts']) {
    assert.match(lies(p), /cookieMessung: messungAktiv\(await startFreiServer\('cookieMessung'\)/, p);
  }
});

test('SQL p406: additiv, Nachweis unveraenderbar, Kennung passt zur Entscheidung', () => {
  const s = lies('supabase-sql/p406-cookie-einwilligung.sql');
  assert.match(s, /add column if not exists cookie_messung boolean not null default false/);
  assert.match(s, /create table if not exists public\.web_einwilligung/);
  assert.match(s, /\(entscheidung = 'nein'\) = \(besucher_id is null\)/);
  assert.match(s, /before update on public\.web_einwilligung/);
  assert.match(s, /to_regclass\('public\.web_ereignisse'\)/);
  assert.doesNotMatch(s, /\bdrop table\b|\btruncate\b|\bdelete from\b/i);
});
