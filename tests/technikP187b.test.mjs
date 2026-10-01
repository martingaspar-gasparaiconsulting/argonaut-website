// ============================================================================
// tests/technikP187b.test.mjs — Paket 187b: Zeitplan-Geheimnis nie mehr in der
// Adresse, CSP im Beobachtungsmodus mit Melde-Stelle, Abhängigkeiten ohne
// kritische Sicherheitslücken (Next.js 16.3.8, nodemailer 10).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cspText, cspBeobachtungRegel, cspMeldungenLesen, CSP_QUELLEN, CSP_BERICHT_PFAD, kopfzeilenRegel } from '../out/sicherheitsKopfzeilen.js';
import { OFFENE_TUEREN } from '../out/offeneTueren.js';
import { DROSSEL } from '../out/drossel.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function alleRouten(dir = 'app/api') {
  const aus = [];
  for (const e of fs.readdirSync(path.join(WURZEL, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) aus.push(...alleRouten(p));
    else if (e.name === 'route.ts') aus.push(p);
  }
  return aus;
}

test('Zeitplan: Adress-Geheimnis ist im Schloss standardmäßig ZU', () => {
  const s = ohneKommentare(lies('lib/cronGuard.ts'));
  assert.match(s, /adresseErlaubt: opt\.adresseErlaubt === true/);
  assert.doesNotMatch(s, /adresseErlaubt: opt\.adresseErlaubt,/);
});

test('Zeitplan: die drei Alt-Endpunkte nutzen das zentrale Schloss mit Alt-Geheimnis', () => {
  for (const f of ['app/api/rechnungen-ueberfaellig/route.ts', 'app/api/termin-erinnerung/route.ts', 'app/api/wartung-erinnerung/route.ts']) {
    const s = ohneKommentare(lies(f));
    assert.match(s, /await cronGuard\(req, \{ altGeheimnisNutzen: true \}\)/, f);
    assert.doesNotMatch(s, /function erlaubt\(/, f);
    assert.doesNotMatch(s, /searchParams\.get\('secret'\)/, f);
  }
});

test('Zeitplan-Wächter: keine Schnittstelle liest ein Geheimnis aus ?secret= und kein Endpunkt schaltet es wieder ein', () => {
  for (const f of alleRouten()) {
    const s = ohneKommentare(lies(f));
    assert.doesNotMatch(s, /searchParams\.get\(['"]secret['"]\)/, f);
    assert.doesNotMatch(s, /adresseErlaubt:\s*true/, f);
  }
});

test('CSP: nur Beobachtungsmodus (Report-Only), mit Melde-Stelle und harten Grundregeln', () => {
  const r = cspBeobachtungRegel();
  assert.equal(r.source, '/:pfad*');
  assert.equal(r.headers.length, 1);
  assert.equal(r.headers[0].key, 'Content-Security-Policy-Report-Only');
  const t = r.headers[0].value;
  assert.equal(t, cspText());
  assert.match(t, /^default-src 'self'; /);
  assert.match(t, /object-src 'none'/);
  assert.match(t, /base-uri 'self'/);
  assert.match(t, /connect-src [^;]*https:\/\/\*\.supabase\.co/);
  assert.match(t, /frame-src [^;]*https:\/\/www\.youtube-nocookie\.com/);
  assert.match(t, new RegExp(`report-uri ${CSP_BERICHT_PFAD.replace(/\//g, '\\/')}$`));
  assert.doesNotMatch(t, /frame-ancestors/);   // Einbetten des Beraters bleibt unberührt
  // Die globale Liste setzt KEINE scharfe CSP
  assert.ok(!kopfzeilenRegel().headers.some((k) => k.key === 'Content-Security-Policy'));
  assert.ok(Object.keys(CSP_QUELLEN).length >= 10);
});

test('CSP: next.config schaltet den Beobachtungsmodus ein', () => {
  const s = ohneKommentare(lies('next.config.ts'));
  assert.match(s, /\[kopfzeilenRegel\(\), cspBeobachtungRegel\(\), \.\.\.rahmenSchutzRegeln\(\)\]/);
});

test('CSP-Meldungen: beide Formate, nie Abfrage-Zeichen, höchstens 10', () => {
  const alt = JSON.stringify({ 'csp-report': {
    'document-uri': 'https://argonaut-os.com/auth/callback?code=GEHEIM&x=1',
    'violated-directive': 'script-src-elem', 'effective-directive': 'script-src-elem',
    'blocked-uri': 'https://boese.example.com/x.js?token=abc',
  } });
  const a = cspMeldungenLesen(alt);
  assert.deepEqual(a, [{ regel: 'script-src-elem', blockiert: 'https://boese.example.com', seite: '/auth/callback' }]);
  assert.ok(!JSON.stringify(a).includes('GEHEIM') && !JSON.stringify(a).includes('abc'));
  const neu = JSON.stringify(Array.from({ length: 15 }, () => ({ type: 'csp-violation', body: { documentURL: 'https://argonaut-os.com/dashboard?x=1', effectiveDirective: 'img-src', blockedURL: 'data:image/png;base64,AAA' } })));
  const n = cspMeldungenLesen(neu);
  assert.equal(n.length, 10);
  assert.deepEqual(n[0], { regel: 'img-src', blockiert: 'data', seite: '/dashboard' });
  assert.deepEqual(cspMeldungenLesen(JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'inline', 'document-uri': '' } })), [{ regel: 'script-src', blockiert: 'inline', seite: '' }]);
  for (const kaputt of ['', 'kein json', '{}', '[]', 'null', '{"csp-report":"x"}', '[{"body":null}]']) assert.deepEqual(cspMeldungenLesen(kaputt), [], kaputt);
});

test('CSP-Melde-Stelle: offene Tür mit Deckel, schreibt nichts in die Datenbank', () => {
  const t = OFFENE_TUEREN.find((x) => x.pfad === 'oeffentlich/csp-bericht');
  assert.ok(t && t.geprueft === true && t.schutz === 'formular');
  assert.ok(DROSSEL['oeffentlich/csp-bericht']?.length >= 1);
  const s = ohneKommentare(lies('app/api/oeffentlich/csp-bericht/route.ts'));
  assert.match(s, /drossel\(admin\(\), 'oeffentlich\/csp-bericht'/);
  assert.match(s, /status: 429/);
  assert.match(s, /cspMeldungenLesen\(text\)/);
  assert.doesNotMatch(s, /\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(s, /export async function GET/);
});

test('Abhängigkeiten: Next.js 16.3.8 fest, nodemailer ab 10, Sperrdatei passt dazu', () => {
  const pkg = JSON.parse(lies('package.json'));
  assert.equal(pkg.dependencies.next, '16.3.8');
  assert.equal(pkg.devDependencies['eslint-config-next'], '16.3.8');
  assert.match(pkg.dependencies.nodemailer, /^\^1\d\./);
  const lock = JSON.parse(lies('package-lock.json'));
  assert.equal(lock.packages['node_modules/next'].version, '16.3.8');
  assert.match(lock.packages['node_modules/nodemailer'].version, /^1\d\./);
  const mp = lock.packages['node_modules/mailparser'].version.split('.').map(Number);
  assert.ok(mp[0] > 3 || (mp[0] === 3 && (mp[1] > 9 || (mp[1] === 9 && mp[2] >= 25))), 'mailparser >= 3.9.25');
});
