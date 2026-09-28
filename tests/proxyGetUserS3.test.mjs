// Paket 163 (S3, 28.09.2026) — der Pfoertner (proxy.ts) prueft die Anmeldung
// beim Anmelde-Dienst (getUser), statt dem Cookie blind zu glauben (getSession).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (s) => s.split('\n').filter((z) => !z.trim().startsWith('//')).join('\n');

test('proxy.ts: getUser, nie getSession', () => {
  const src = ohneKommentare(lies('proxy.ts'));
  assert.ok(src.includes('supabase.auth.getUser()'));
  assert.ok(!src.includes('getSession('), 'getSession glaubt dem Cookie ungeprueft');
  assert.ok(!/session\.user/.test(src), 'Weiche muss mit dem geprueften user arbeiten');
  assert.match(src, /if \(!user\) \{\s*return NextResponse\.redirect\(new URL\('\/auth\/login'/);
});

test('proxy.ts: Rollen-Weiche nutzt den geprueften Nutzer', () => {
  const src = lies('proxy.ts');
  assert.ok(src.includes(".eq('email', user.email)"));
  assert.ok(src.includes(".eq('auth_user_id', user.id)"));
});

test('Server-Pruefungen: nurAngemeldet nutzt getUser', () => {
  const src = ohneKommentare(lies('lib/nurAngemeldet.ts'));
  assert.ok(src.includes('auth.getUser()') && !src.includes('getSession('));
});

test('WAECHTER: keine Server-Route entscheidet mit getSession', () => {
  const treffer = [];
  const lauf = (dir) => {
    for (const e of fs.readdirSync(path.join(WURZEL, dir), { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) lauf(p);
      else if (e.name === 'route.ts' && /getSession\(/.test(ohneKommentare(fs.readFileSync(path.join(WURZEL, p), 'utf8')))) treffer.push(p);
    }
  };
  lauf('app/api');
  assert.deepEqual(treffer, []);
});
