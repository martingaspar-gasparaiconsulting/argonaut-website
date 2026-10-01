// ============================================================================
// tests/speicherBetriebP187c.test.mjs — Paket 187c: Größen-/Typgrenzen je
// Speicherordner, Korrespondenz/Bauplan-Pins/SEPA-Mandate/Nachkauf speichern
// für den Betrieb, Ratgeber-Seite nur für den Chef.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SPEICHER_GRENZEN, mbZuBytes, NIE_ERLAUBT } from '../out/speicherGrenzen.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// Live-Stand 01.10.2026 (Martins Abfrage): Ordner ohne Größengrenze bzw. lp-medien ohne Typliste
const OHNE_GRENZE_LIVE = ['bau-plaene', 'baustellen-fotos', 'belege', 'customer-documents', 'dossiers', 'ebooks', 'einsatz-fotos', 'erechnungen', 'erstellte-dokumente', 'formulare', 'freebies', 'hr-dokumente', 'portal-dokumente', 'teamchat-dateien', 'werkstatt-anhaenge'];
const NICHT_ANFASSEN = ['ablauf-dateien', 'academy-videos', 'branchen-pdfs', 'social-videos', 'webseiten'];

test('Speicher: jeder Ordner ohne Grenze bekommt eine, keiner der schon begrenzten wird angefasst', () => {
  const ids = SPEICHER_GRENZEN.map((g) => g.bucket);
  for (const b of OHNE_GRENZE_LIVE) assert.ok(ids.includes(b), b);
  for (const b of NICHT_ANFASSEN) assert.ok(!ids.includes(b), b);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 16);
});

test('Speicher: Grenze nie unter der Code-Grenze, nie HTML/SVG, Typlisten nur wo der Typ feststeht', () => {
  for (const g of SPEICHER_GRENZEN) {
    assert.ok(g.maxMb > 0, g.bucket);
    if (g.codeMaxMb != null) assert.ok(g.maxMb >= g.codeMaxMb, `${g.bucket}: ${g.maxMb} < Code ${g.codeMaxMb}`);
    for (const t of g.typen ?? []) assert.ok(!NIE_ERLAUBT.includes(t), `${g.bucket}: ${t}`);
    assert.ok(g.grund.length > 5);
  }
  const mitTypen = SPEICHER_GRENZEN.filter((g) => g.typen).map((g) => g.bucket).sort();
  assert.deepEqual(mitTypen, ['belege', 'dossiers', 'ebooks', 'lp-medien']);
  // Code-Grenzen gegengelesen
  assert.match(lies('app/api/beleg-upload/route.ts'), /MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(lies('app/dashboard/_components/AnhaengeBox.tsx'), /MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(lies('lib/kundenPortalPlus.ts'), /DOK_MAX_BYTES = 20 \* 1024 \* 1024/);
  assert.match(lies('lib/freebie.ts'), /DATEI_MAX_BYTES = 25 \* 1024 \* 1024/);
  assert.match(lies('app/dashboard/team-chat/page.tsx'), /MAX_MB = 25/);
  assert.match(lies('lib/landingpages.ts'), /MEDIEN_MAX_MB = 6/);
  assert.match(lies('app/dashboard/documents/DocumentsClient.tsx'), /ent: 200/);
});

test('Speicher-SQL: setzt genau die Werte aus lib/speicherGrenzen, nur update, nichts löschen', () => {
  const sql = lies('supabase-sql/p187c-speicher-grenzen.sql');
  for (const g of SPEICHER_GRENZEN) {
    const typ = g.typen ? `array[${g.typen.map((t) => `'${t}'`).join(', ')}]` : 'null';
    assert.ok(sql.includes(`update storage.buckets set file_size_limit = ${mbZuBytes(g.maxMb)}, allowed_mime_types = ${typ} where id = '${g.bucket}';`), g.bucket);
  }
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /\b(delete|drop|truncate|insert)\b/i);
  assert.equal((code.match(/^update storage\.buckets/gm) || []).length, 16);
});

test('Betrieb: Korrespondenz, SEPA-Mandat, Nachkauf-Erinnerung über anlegenFuerBetrieb', () => {
  const k = ohneKommentare(lies('app/dashboard/korrespondenz/page.tsx'));
  assert.match(k, /anlegenFuerBetrieb\(\s*insertObj, betriebsKennung\(chef, userData\.user\.id\), userData\.user\.id,/);
  assert.doesNotMatch(k, /owner_user_id: userData\.user\.id/);
  const s = ohneKommentare(lies('app/dashboard/sepa-einzug/page.tsx'));
  assert.match(s, /setBesitzer\(betriebsKennung\(chefId, id\)\)/);
  assert.match(s, /anlegenFuerBetrieb\(payload, besitzer, uid,/);
  assert.doesNotMatch(s, /owner_user_id: uid, kontakt_id/);
  const n = ohneKommentare(lies('app/dashboard/wellness/nachkauf/page.tsx'));
  assert.match(n, /\}, besitzer, uid, \(d\) => supabase\.from\('erinnerung'\)\.insert\(d\)/);
  assert.doesNotMatch(n, /owner_user_id: uid, titel/);
});

test('Betrieb: Bauplan-Pins beim Mitarbeiter ohne eigene Kennung (Datenbank setzt den Betrieb)', () => {
  const p = ohneKommentare(lies('app/dashboard/bautagebuch/plaene/page.tsx'));
  assert.match(p, /\.\.\.\(istMitarbeiter \? \{\} : \{ owner_user_id: uid \}\)/);
  assert.doesNotMatch(p, /beschreibung: p\.beschreibung, owner_user_id: uid/);
  assert.match(lies('supabase-sql/pk-bau-plaene.sql'), /owner_user_id\s+uuid not null default coalesce\(mein_chef_id\(\), auth\.uid\(\)\)/);
});

test('Ratgeber-Seite: Knöpfe und Funktion nur für den Chef', () => {
  const t = ohneKommentare(lies('app/dashboard/marketing/texte/page.tsx'));
  assert.match(t, /art === 'ratgeber' && !istMitarbeiter && <button/);
  assert.match(t, /art === 'ratgeber' && webSlug && !istMitarbeiter && \(/);
  assert.match(t, /if \(istMitarbeiter\) \{ setFehler\('Webseiten legt die Geschäftsleitung an\.'\); return; \}/);
});
