// Paket 195 (30.09.2026) — „7 Tage kostenlos testen" ist eine ANFRAGE:
// Martin schaltet jeden Testzugang persoenlich frei. Die Seiten duerfen nicht
// versprechen, dass der Test sofort startet; die 7 Tage laufen ab Freischaltung.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Branchenseite: Knopf sagt „Zugang anfordern" und gibt die Branche mit', () => {
  const s = lies('app/vorschau/_components/HeroCta.tsx');
  assert.match(s, /7 Tage kostenlos testen · Zugang anfordern →/);
  assert.match(s, /\/testen\?branche=\$\{encodeURIComponent\(branche\)\}/);
});

test('Testseite: Anfrage statt Sofortstart, 7 Tage ab Freischaltung, Branche vorbelegt', () => {
  const s = lies('app/testen/page.tsx');
  assert.match(s, /'Testzugang anfordern →'/);
  assert.doesNotMatch(s, /7 Tage kostenlos starten/);
  assert.match(s, /Die 7 Tage beginnen mit der Freischaltung/);
  assert.match(s, /persönlich/);
  assert.match(s, /Ihre Anfrage ist bei uns/);
  assert.match(s, /URLSearchParams\(window\.location\.search\)\.get\('branche'\)/);
});

test('Dossier, E-Book und erste Test-Mail versprechen keinen sofort laufenden Test', () => {
  for (const p of ['app/vorschau/_lib/dossierHtml.ts', 'app/vorschau/_lib/ebookHtml.ts']) {
    const s = lies(p);
    assert.match(s, /Testzugang anfordern →/, p);
    assert.doesNotMatch(s, /Kostenlos starten →/, p);
  }
  const m = lies('lib/dossierSequenz.ts');
  assert.doesNotMatch(m, /Ihr 7-Tage-Test ist startklar/);
  assert.doesNotMatch(m, /Ihr ARGONAUT-Test läuft —/);
  assert.match(m, /Wir richten Ihren Zugang persönlich/);
});
