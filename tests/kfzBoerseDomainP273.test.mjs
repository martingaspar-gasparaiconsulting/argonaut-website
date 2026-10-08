// ============================================================================
// tests/kfzBoerseDomainP273.test.mjs — Paket 273 (08.10.2026) · Fahrzeugbörse auf der
// Domain des Betriebs, Menüpunkt „Fahrzeuge", „Präsentiert mit ARGONAUT OS".
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hostSauber, kanonisch, domainPfad, ARGONAUT_LINK } from '../out/kfzBoerse.js';
import { seiteHtml } from '../out/webBloecke.js';
import { fussHtml } from '../out/webRecht.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const K = 'abcdefghijklmnopqrstuvwx';
const ID = '11111111-2222-4333-8444-555555555555';

test('Host säubern: Port, www, Großschreibung; Unsinn wird abgelehnt', () => {
  assert.equal(hostSauber('WWW.Autohaus-Muster.de:443'), 'autohaus-muster.de');
  assert.equal(hostSauber('fahrzeuge.autohaus-muster.de'), 'fahrzeuge.autohaus-muster.de');
  assert.equal(hostSauber('autohaus.de.'), 'autohaus.de');
  for (const x of ['', 'localhost', 'a/b.de', 'evil.de/../x', '-x.de', 'x..de', '<script>.de', 'https://x.de', null, 42]) assert.equal(hostSauber(x), null, String(x));
});

test('Google-Adresse: Händler-Domain, sonst argonaut-os.com mit Kennung', () => {
  assert.equal(kanonisch({ kennung: K, fahrzeugId: ID, domain: 'www.autohaus.de', basis: 'https://argonaut-os.com' }), `https://autohaus.de/fahrzeuge/${ID}`);
  assert.equal(kanonisch({ kennung: K, domain: 'autohaus.de', basis: 'https://argonaut-os.com' }), 'https://autohaus.de/fahrzeuge');
  assert.equal(kanonisch({ kennung: K, fahrzeugId: ID, domain: null, basis: 'https://argonaut-os.com/' }), `https://argonaut-os.com/fahrzeuge/${K}/${ID}`);
  assert.equal(kanonisch({ kennung: K, domain: 'kaputt', basis: 'https://argonaut-os.com' }), `https://argonaut-os.com/fahrzeuge/${K}`);
  assert.equal(domainPfad(), '/fahrzeuge');
  assert.equal(domainPfad(ID), `/fahrzeuge/${ID}`);
});

test('Kunden-Webseite: Menüpunkt „Fahrzeuge" nur mit Börse und nur mit sicherem Pfad', () => {
  const ci = { firma: 'Autohaus Test' };
  const ohne = seiteHtml({ bloecke: [] }, ci, 2026, {});
  assert.ok(!/>Fahrzeuge</.test(ohne));
  assert.match(seiteHtml({ bloecke: [] }, ci, 2026, { fahrzeugeLink: '/fahrzeuge' }), /<a href="\/fahrzeuge">Fahrzeuge<\/a>/);
  assert.match(seiteHtml({ bloecke: [] }, ci, 2026, { fahrzeugeLink: `/fahrzeuge/${K}` }), new RegExp(`<a href="/fahrzeuge/${K}">Fahrzeuge</a>`));
  for (const boese of ['javascript:alert(1)', 'https://evil.de', '/fahrzeuge"><script>', `/fahrzeuge/${K}/x`]) {
    assert.ok(!/>Fahrzeuge</.test(seiteHtml({ bloecke: [] }, ci, 2026, { fahrzeugeLink: boese })), boese);
  }
});

test('„Präsentiert mit ARGONAUT OS": im Fuß jeder Kunden-Webseite und der Börse, nur Marke', () => {
  const fuss = fussHtml({ firma: 'X' }, 2026, {});
  assert.match(fuss, /<a class="ao-fuss-ao" href="https:\/\/argonaut-os\.com" rel="noopener">Präsentiert mit ARGONAUT OS<\/a>/);
  assert.match(seiteHtml({ bloecke: [] }, { firma: 'X' }, 2026, {}), /Präsentiert mit ARGONAUT OS/);
  assert.equal(ARGONAUT_LINK, 'https://argonaut-os.com');
  assert.match(lies('app/fahrzeuge/BoerseTeile.tsx'), /Präsentiert mit ARGONAUT OS/);
});

test('Proxy: /fahrzeuge auf fremder Domain -> Börse, vor der allgemeinen Kundenseite; Dashboard unberührt', () => {
  const p = lies('proxy.ts');
  const weiche = p.indexOf("pfad === '/fahrzeuge' || pfad.startsWith('/fahrzeuge/')");
  const allgemein = p.indexOf('url.pathname = `/p-domain/');
  assert.ok(weiche > 0 && allgemein > weiche, 'Börsen-Weiche steht vor der Kundenseiten-Weiche');
  assert.match(p, /!istEigeneDomain\(host\) && \(pfad === '\/fahrzeuge'/);
  assert.match(p, /url\.pathname = `\/fahrzeuge-domain\/\$\{encodeURIComponent\(host\.split\(':'\)\[0\]\)\}\$\{pfad\.slice\('\/fahrzeuge'\.length\)\}`/);
  assert.match(p, /const RESERVIERT = \['\/dashboard', '\/auth'\]/);
});

test('Lader: Betrieb nur über die Domain, nie geraten, Börse muss an sein', () => {
  const l = lies('lib/kfzBoerseLaden.ts');
  assert.match(l, /from\('web_seiten'\)\.select\('owner_user_id, domain, status'\)\.in\('domain', \[d, `www\.\$\{d\}`\]\)/);
  assert.match(l, /besitzer\.length !== 1\) return null/);
  assert.match(l, /einst\.aktiv && einst\.kennung \?/);
  assert.match(l, /domains\.length === 1 \? domains\[0\] : null/);
  for (const s of ['app/fahrzeuge-domain/[host]/page.tsx', 'app/fahrzeuge-domain/[host]/[id]/page.tsx']) {
    const t = lies(s);
    assert.match(t, /betriebZuDomain\(db, host\)/);
    assert.match(t, /hostSauber\(decodeURIComponent\(hostRoh\)\)/);
    assert.ok(!/from\('kfz_bestand'\)/.test(t));
  }
  for (const s of ['app/fahrzeuge/[kennung]/page.tsx', 'app/fahrzeuge/[kennung]/[id]/page.tsx']) assert.match(lies(s), /kanonisch\(\{ kennung: k, fahrzeugId: (id|fid), domain, basis \}\)/);
  const a = lies('app/fahrzeuge/BoerseAnsichten.tsx');
  assert.match(a, /index: false, follow: false/);
  assert.match(a, /canonical: ctx\.kanon\(/);
  assert.match(a, /url: ctx\.kanon\(f\.id\)/);
});

test('Webseiten-Auslieferung: Menüpunkt nur bei eingeschalteter Börse; nur-Börse-Domain leitet auf /fahrzeuge', () => {
  const d = lies('app/p-domain/[host]/route.ts');
  assert.match(d, /aktiveBoerseKennung\(/);
  assert.match(d, /fahrzeugeLink: '\/fahrzeuge'/);
  assert.match(d, /location: '\/fahrzeuge'/);
  assert.match(lies('app/p/[id]/route.ts'), /fahrzeugeLink: `\/fahrzeuge\/\$\{boerse\}`/);
  assert.match(lies('lib/kfzBoerseLaden.ts'), /return e\.aktiv \? e\.kennung : null/);
});
