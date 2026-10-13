// ARGONAUT OS · Paket 350 (A2) · Datei-Sicherung des Speichers
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  signieren, uriKodieren, LEER_HASH, verschluesseln, entschluesseln, schluesselKennung, amzDatum, sha256Hex,
} from '../out/speicherSicherungKrypto.js';
import {
  konfigAusEnv, zielSchluessel, ausZielSchluessel, brauchtSicherung, stapelBilden, zeitReicht, listeLesen, glockeNoetig,
  probeAuswerten, istSchonVorhanden, ampel, typSauber, zuGross, groesseText, KLEIN_GRENZE, GROESSE_GRENZE, BUDGET_MS, RESERVE_MS,
} from '../out/speicherSicherung.js';
import { WEITERE_TABELLEN, HAUPT_BEREICHE, NIE_SICHERN, SYSTEM_TABELLEN, alleSicherungsBereiche, istZugangsTabelle } from '../out/sicherungTabellen.js';

const lies = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ohneKommentar = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('SigV4: die vier veröffentlichten AWS-Beispiele stimmen aufs Byte', () => {
  const a = signieren({ methode: 'GET', pfad: '/', koepfe: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' }, inhaltHash: LEER_HASH, region: 'us-east-1', dienst: 'service', schluesselId: 'AKIDEXAMPLE', geheimnis: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', amzDatum: '20150830T123600Z' });
  assert.equal(a.signatur, '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  assert.equal(a.authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  const s3 = { region: 'us-east-1', dienst: 's3', schluesselId: 'AKIAIOSFODNN7EXAMPLE', geheimnis: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', amzDatum: '20130524T000000Z' };
  const host = 'examplebucket.s3.amazonaws.com';
  const get = signieren({ ...s3, methode: 'GET', pfad: '/test.txt', koepfe: { host, range: 'bytes=0-9', 'x-amz-content-sha256': LEER_HASH, 'x-amz-date': s3.amzDatum }, inhaltHash: LEER_HASH });
  assert.equal(get.signatur, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  const liste = signieren({ ...s3, methode: 'GET', pfad: '/', abfrage: [['prefix', 'J'], ['max-keys', '2']], koepfe: { host, 'x-amz-content-sha256': LEER_HASH, 'x-amz-date': s3.amzDatum }, inhaltHash: LEER_HASH });
  assert.equal(liste.signatur, '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
  const h = '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072';
  const put = signieren({ ...s3, methode: 'PUT', pfad: uriKodieren('/test$file.text', true), koepfe: { date: 'Fri, 24 May 2013 00:00:00 GMT', host, 'x-amz-content-sha256': h, 'x-amz-date': s3.amzDatum, 'x-amz-storage-class': 'REDUCED_REDUNDANCY' }, inhaltHash: h });
  assert.equal(put.signatur, '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
  assert.equal(sha256Hex('Welcome to Amazon S3.'), h);
  assert.equal(amzDatum(new Date('2026-10-13T10:40:05.123Z')), '20261013T104005Z');
});

test('URI-Kodierung: Umlaute byteweise, Leerzeichen %20, Schrägstrich nur im Pfad', () => {
  assert.equal(uriKodieren('a b/Ä.pdf', true), 'a%20b/%C3%84.pdf');
  assert.equal(uriKodieren('a b/Ä.pdf', false), 'a%20b%2F%C3%84.pdf');
  assert.equal(uriKodieren("A-z_0.~!*'()", false), 'A-z_0.~%21%2A%27%28%29');
});

test('AES-256-GCM: hin und zurück, an Ort gebunden, Manipulation fällt auf', () => {
  const k = 'ab'.repeat(32);
  const klar = Buffer.from('Rechnung 2026-001 · 1.234,56 €');
  const c1 = verschluesseln(klar, k, 'belege/a/1.pdf');
  const c2 = verschluesseln(klar, k, 'belege/a/1.pdf');
  assert.equal(c1.subarray(0, 4).toString('ascii'), 'AGS1');
  assert.equal(c1.length, 4 + 12 + klar.length + 16);
  assert.notDeepEqual(c1, c2, 'jedes Mal ein neuer IV');
  assert.deepEqual(entschluesseln(c1, k, 'belege/a/1.pdf'), klar);
  assert.throws(() => entschluesseln(c1, k, 'belege/a/2.pdf'), 'anderer Name');
  assert.throws(() => entschluesseln(c1, 'cd'.repeat(32), 'belege/a/1.pdf'), 'anderer Schlüssel');
  const kaputt = Buffer.from(c1); kaputt[20] ^= 1;
  assert.throws(() => entschluesseln(kaputt, k, 'belege/a/1.pdf'), 'ein Bit verändert');
  assert.throws(() => entschluesseln(Buffer.from('xxxx' + 'a'.repeat(40)), k, 'x'), /AGS1/);
  assert.throws(() => verschluesseln(klar, 'zu-kurz', 'x'), /64 Hex/);
  assert.match(schluesselKennung(k), /^k[0-9a-f]{11}$/);
  assert.ok(!schluesselKennung(k).includes(k.slice(0, 8)), 'Kennung verrät den Schlüssel nicht');
});

test('Einrichtung: ohne Variablen nichts, falsche Werte mit Klartext, richtige ergeben das Ziel', () => {
  const leer = konfigAusEnv({});
  assert.equal(leer.eingerichtet, false);
  assert.equal(leer.fehlend.length, 6);
  const gut = { SPEICHER_SICHERUNG_ENDPOINT: 'https://fsn1.your-objectstorage.com/', SPEICHER_SICHERUNG_REGION: 'fsn1', SPEICHER_SICHERUNG_BUCKET: 'argonaut-sicherung', SPEICHER_SICHERUNG_KEY_ID: 'ID', SPEICHER_SICHERUNG_SECRET: 'GEHEIM', SPEICHER_SICHERUNG_SCHLUESSEL: 'AB'.repeat(32) };
  const k = konfigAusEnv(gut);
  assert.equal(k.eingerichtet, true);
  assert.equal(k.cfg.endpoint, 'https://fsn1.your-objectstorage.com');
  assert.equal(k.cfg.host, 'fsn1.your-objectstorage.com');
  assert.equal(k.cfg.schluessel, 'ab'.repeat(32));
  const http = konfigAusEnv({ ...gut, SPEICHER_SICHERUNG_ENDPOINT: 'http://fsn1.your-objectstorage.com' });
  assert.equal(http.eingerichtet, false); assert.match(http.fehler.join(' '), /https/);
  const kurz = konfigAusEnv({ ...gut, SPEICHER_SICHERUNG_SCHLUESSEL: 'abc' });
  assert.equal(kurz.eingerichtet, false); assert.match(kurz.fehler.join(' '), /64 Hex/);
  assert.equal(konfigAusEnv({ ...gut, SPEICHER_SICHERUNG_BUCKET: 'Gross_Bucket' }).eingerichtet, false);
  assert.equal(konfigAusEnv({ ...gut, SPEICHER_SICHERUNG_ENDPOINT: 'https://x.de/pfad' }).eingerichtet, false);
});

test('Ziel-Namen: hin und zurück, fremde Schlüssel werden ignoriert', () => {
  for (const [b, n] of [['belege', 'u1/2026/Ä b.pdf'], ['rechnung-ablage', 'x.pdf'], ['kfz_medien', 'a/b/c/d.jpg']]) {
    assert.deepEqual(ausZielSchluessel(zielSchluessel(b, n)), { bucket: b, name: n });
  }
  assert.equal(zielSchluessel('belege', 'a.pdf'), 'speicher/belege/a.pdf.ags');
  assert.equal(ausZielSchluessel('anderes/belege/a.pdf.ags'), null);
  assert.equal(ausZielSchluessel('speicher/belege/a.pdf'), null);
  assert.equal(ausZielSchluessel('speicher/belege.ags'), null);
  assert.throws(() => zielSchluessel('../x', 'a'));
  assert.throws(() => zielSchluessel('b', '/abs'));
});

test('Was gesichert wird: neu, geändert, fehlerhaft — sonst nicht', () => {
  const o = { bucket: 'b', name: 'n', geaendert: '2026-10-13T08:00:00+00:00', groesse: 10, etag: 'e1', typ: 'application/pdf' };
  assert.equal(brauchtSicherung(o, null), true);
  const d = { bucket: 'b', name: 'n', quelle_etag: 'e1', quelle_geaendert: '2026-10-13T08:00:00.000Z', sha256: 'a'.repeat(64), fehler: null, versuche: 0 };
  assert.equal(brauchtSicherung(o, d), false, 'gleiche Zeit in anderer Schreibweise');
  assert.equal(brauchtSicherung({ ...o, etag: 'e2' }, d), true);
  assert.equal(brauchtSicherung({ ...o, geaendert: '2026-10-13T09:00:00Z' }, d), true);
  assert.equal(brauchtSicherung(o, { ...d, sha256: null }), true);
  assert.equal(zuGross({ groesse: GROESSE_GRENZE }), false);
  assert.equal(zuGross({ groesse: GROESSE_GRENZE + 1 }), true);
});

test('Stapel: große Dateien allein, kleine zu dritt, Reihenfolge bleibt; Zeitbudget mit Reserve', () => {
  const g = (n, groesse) => ({ n, groesse });
  const s = stapelBilden([g(1, 5), g(2, 5), g(3, KLEIN_GRENZE + 1), g(4, 5), g(5, 5), g(6, 5), g(7, 5), g(8, null)]);
  assert.deepEqual(s.map((x) => x.map((y) => y.n)), [[1, 2], [3], [4, 5, 6], [7, 8]]);
  assert.equal(zeitReicht(0, BUDGET_MS - RESERVE_MS - 1), true);
  assert.equal(zeitReicht(0, BUDGET_MS - RESERVE_MS), false);
});

test('ListObjectsV2 lesen: Schlüssel entschärft, Ordner, Fortsetzung', () => {
  const xml = '<?xml version="1.0"?><ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>speicher/b/a&amp;b.pdf.ags</Key><Size>42</Size></Contents><Contents><Key>speicher/b/x.ags</Key><Size>7</Size></Contents><CommonPrefixes><Prefix>speicher/belege/</Prefix></CommonPrefixes><NextContinuationToken>1/abc&amp;=</NextContinuationToken></ListBucketResult>';
  const l = listeLesen(xml);
  assert.deepEqual(l.eintraege, [{ key: 'speicher/b/a&b.pdf.ags', groesse: 42 }, { key: 'speicher/b/x.ags', groesse: 7 }]);
  assert.deepEqual(l.ordner, ['speicher/belege/']);
  assert.equal(l.weiter, '1/abc&=');
  assert.equal(listeLesen('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>').weiter, null);
});

test('Glocke: frisch eingerichtet still, Dauerfehler / 26 Stunden / fehlende Probe wecken', () => {
  const jetzt = new Date('2026-10-20T12:00:00Z');
  const h = (n) => new Date(jetzt.getTime() - n * 3_600_000).toISOString();
  assert.equal(glockeNoetig({ jetzt, letzterErfolg: h(1), letzteProbe: null, dauerFehler: 0, ersterLauf: h(2) }), null, 'erste Stunden: keine Probe-Mahnung');
  assert.equal(glockeNoetig({ jetzt, letzterErfolg: null, letzteProbe: null, dauerFehler: 0, ersterLauf: null }), null, 'noch nie gelaufen (nicht eingerichtet)');
  assert.match(glockeNoetig({ jetzt, letzterErfolg: h(1), letzteProbe: h(5), dauerFehler: 2, ersterLauf: h(3) }).nachricht, /2 Datei/);
  assert.match(glockeNoetig({ jetzt, letzterErfolg: h(27), letzteProbe: h(30), dauerFehler: 0, ersterLauf: h(100) }).nachricht, /26 Stunden/);
  assert.match(glockeNoetig({ jetzt, letzterErfolg: null, letzteProbe: h(1), dauerFehler: 0, ersterLauf: h(30) }).nachricht, /26 Stunden/);
  assert.match(glockeNoetig({ jetzt, letzterErfolg: h(1), letzteProbe: null, dauerFehler: 0, ersterLauf: h(30) }).nachricht, /Probe/);
  assert.match(glockeNoetig({ jetzt, letzterErfolg: h(1), letzteProbe: h(91 * 24), dauerFehler: 0, ersterLauf: h(2000) }).nachricht, /90 Tage/);
  assert.equal(glockeNoetig({ jetzt, letzterErfolg: h(1), letzteProbe: h(89 * 24), dauerFehler: 0, ersterLauf: h(2000) }), null);
});

test('Probe-Auswertung, Ampel, „schon vorhanden", Typ und Größe', () => {
  const gut = { bucket: 'b', name: 'n', entschluesselt: true, hashGleich: true, echt: true, echtOk: true, fehler: null };
  const nurHash = { ...gut, echt: false, echtOk: null };
  assert.equal(probeAuswerten([gut, nurHash, nurHash]).ok, true);
  assert.equal(probeAuswerten([nurHash]).ok, false, 'ohne echte Rückspielung keine bestandene Probe');
  assert.equal(probeAuswerten([gut, { ...nurHash, hashGleich: false, fehler: 'Prüfsumme weicht ab.' }]).ok, false);
  assert.equal(probeAuswerten([{ ...gut, echtOk: false }]).ok, false);
  assert.equal(probeAuswerten([]).ok, false);
  const z = { quelle_dateien: 5, quelle_bytes: 1, gesichert: 5, gesichert_bytes: 1, offen: 0, fehler: 0, dauerhaft: 0, fehlend: 0 };
  const jetzt = new Date('2026-10-20T12:00:00Z');
  assert.equal(ampel(false, z, null, jetzt).farbe, 'aus');
  assert.equal(ampel(true, z, '2026-10-20T11:40:00Z', jetzt).farbe, 'gruen');
  assert.equal(ampel(true, { ...z, offen: 3 }, '2026-10-20T11:40:00Z', jetzt).farbe, 'gelb');
  assert.equal(ampel(true, { ...z, dauerhaft: 1 }, '2026-10-20T11:40:00Z', jetzt).farbe, 'rot');
  assert.equal(ampel(true, z, '2026-10-19T08:00:00Z', jetzt).farbe, 'rot');
  assert.equal(ampel(true, null, null, jetzt).farbe, 'rot');
  assert.equal(istSchonVorhanden({ statusCode: '409', message: 'x' }), true);
  assert.equal(istSchonVorhanden({ message: 'The resource already exists' }), true);
  assert.equal(istSchonVorhanden({ message: 'Bucket not found', statusCode: '404' }), false);
  assert.equal(istSchonVorhanden(null), false);
  assert.equal(typSauber('application/pdf'), 'application/pdf');
  assert.equal(typSauber('text/html\r\nX-Evil: 1'), 'application/octet-stream');
  assert.equal(groesseText(1536), '1,5 KB');
});

test('Datensicherung (Excel): jede Tabelle mit owner_user_id ist gesichert oder bewusst ausgenommen', () => {
  const bekannt = new Set([...WEITERE_TABELLEN, ...HAUPT_BEREICHE.map((b) => b.table), ...NIE_SICHERN, ...SYSTEM_TABELLEN]);
  const fehlt = [];
  for (const f of readdirSync(new URL('../supabase-sql/', import.meta.url)).filter((x) => x.endsWith('.sql'))) {
    const t = lies('supabase-sql/' + f);
    for (const m of t.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\n\);/gi)) {
      if (/\bowner_user_id\b/.test(m[2]) && !bekannt.has(m[1].toLowerCase())) fehlt.push(`${m[1]} (${f})`);
    }
  }
  assert.deepEqual(fehlt, [], 'in lib/sicherungTabellen.ts eintragen: ' + fehlt.join(', '));
  for (const t of ['box_bestellung', 'reife_charge', 'vorbestell_aktion', 'kfz_bestand', 'rechnung_ablage', 'beleg_ablage']) {
    assert.ok(alleSicherungsBereiche().some((b) => b.table === t), t + ' fehlt in der Sicherung');
  }
  for (const t of SYSTEM_TABELLEN) assert.ok(!alleSicherungsBereiche().some((b) => b.table === t), t + ' gehört nicht in die Datei');
  for (const b of alleSicherungsBereiche()) assert.ok(!istZugangsTabelle(b.table));
});

test('Quelltext: Cron, Admin-Schloss mit Zwei-Faktor, nie überschreiben, kein neues Paket, Kachel', () => {
  const cron = ohneKommentar(lies('app/api/cron/speicher-sicherung/route.ts'));
  assert.match(cron, /await cronGuard\(req\)/);
  assert.match(cron, /export const maxDuration = 300/);
  const vercel = JSON.parse(lies('vercel.json'));
  assert.ok(vercel.crons.some((c) => c.path === '/api/cron/speicher-sicherung' && c.schedule === '40 * * * *'));
  const adm = ohneKommentar(lies('app/api/admin/speicher-sicherung/route.ts'));
  assert.match(adm, /betreiberPruefung\(\)/);
  assert.match(adm, /stand\.aal !== 'aal2'/);
  assert.match(adm, /BESTAETIGUNG_WORT/);
  const srv = ohneKommentar(lies('lib/speicherSicherungServer.ts'));
  assert.ok(!/upsert:\s*true/.test(srv), 'Wiederherstellung und Probe überschreiben nie');
  assert.equal((srv.match(/upsert:\s*false/g) ?? []).length, 2);
  assert.match(srv, /\.remove\(\[pfad\]\)/, 'Probe-Dateien werden wieder gelöscht');
  assert.match(srv, /verschluesseln\(klar, cfg\.schluessel, zusatzDaten\(o\.bucket, o\.name\)\)/, 'nur verschlüsselt ins Ziel');
  assert.match(srv, /speicher_sicherung_frei/, 'Sperre wird immer freigegeben');
  const pkg = JSON.parse(lies('package.json'));
  assert.ok(!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((n) => /aws|s3/i.test(n)), 'kein neues S3-Paket');
  const seite = lies('app/admin/command-center/speicher-sicherung/page.tsx');
  assert.ok(!/speicherSicherungServer|speicherSicherungKrypto/.test(seite), 'Seite lädt keine Server-/Krypto-Datei');
  assert.ok(!/node:crypto/.test(ohneKommentar(lies('lib/speicherSicherung.ts'))), 'reine Logik ohne node:crypto (auch im Browser nutzbar)');
  assert.match(lies('app/admin/command-center/page.tsx'), /\/admin\/command-center\/speicher-sicherung/);
});

test('SQL p350: nur Server-Rechte, Sperre, Abgleich mit Mindestfrist, Probe-Bucket privat', () => {
  const s = lies('supabase-sql/p350-speicher-sicherung.sql').replace(/--.*$/gm, '');
  for (const t of ['speicher_sicherung_datei', 'speicher_sicherung_lauf', 'speicher_sicherung_stand']) {
    assert.match(s, new RegExp(`create table if not exists public\\.${t}`));
    assert.match(s, new RegExp(`alter table public\\.${t} enable row level security`));
  }
  assert.match(s, /revoke all on public\.speicher_sicherung_datei, public\.speicher_sicherung_lauf, public\.speicher_sicherung_stand from anon, authenticated/);
  const fn = [...s.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]);
  assert.equal(fn.length, 7);
  for (const f of fn) {
    assert.match(s, new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated`), f);
    assert.match(s, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to service_role`), f);
  }
  assert.ok(!/policy/i.test(s), 'keine Regel für Nutzer');
  assert.match(s, /greatest\(p_tage, 7\)/);
  assert.match(s, /'sicherung-probe', 'sicherung-probe', false/);
  assert.match(s, /bucket_id <> 'sicherung-probe'/);
  assert.ok(!/\b(drop table|truncate|delete from)\b/i.test(s), 'nichts Destruktives');
});
