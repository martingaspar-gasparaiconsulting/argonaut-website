// Paket 315 (11.10.2026): S1 Produkt-Dokumente am Artikel
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ARTEN, ERSETZT_ARTEN, MAX_BYTES, dateiPruefen, sichererName, speicherPfad, pfadPasst, dokumentPruefen,
  dokumentAmpel, anzeigeName, shopDokumente, erinnerungsTag, zaehlen, wissenName, istIsoTag,
} from '../out/produktDokumente.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const H = '2026-10-11';
const B = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';

test('Datei: nur PDF bis 20 MB', () => {
  assert.equal(dateiPruefen({ name: 'SDB.pdf', size: 1000, type: 'application/pdf' }).ok, true);
  assert.equal(dateiPruefen({ name: 'SDB.PDF', size: 1000, type: '' }).ok, true, 'leerer Typ mit .pdf');
  assert.equal(dateiPruefen({ name: 'sdb.docx', size: 1000, type: '' }).ok, false);
  assert.equal(dateiPruefen({ name: 'x.pdf', size: 1000, type: 'text/html' }).ok, false, 'Endung täuscht');
  assert.equal(dateiPruefen({ name: 'x.pdf', size: 0, type: 'application/pdf' }).ok, false);
  assert.equal(dateiPruefen({ name: 'x.pdf', size: MAX_BYTES, type: 'application/pdf' }).ok, true);
  assert.equal(dateiPruefen({ name: 'x.pdf', size: MAX_BYTES + 1, type: 'application/pdf' }).ok, false);
  assert.equal(dateiPruefen(null).ok, false);
});

test('Speicher-Pfad: Ordner Betrieb/Artikel, sauberer Name, passt zum Wächter', () => {
  assert.equal(sichererName('Sicherheitsdatenblatt Größe Ü 2.0.pdf'), 'sicherheitsdatenblatt_groesse_ue_2.0.pdf');
  assert.equal(sichererName('../../etc/passwd'), 'etc_passwd.pdf');
  assert.equal(sichererName('...pdf'), 'dokument.pdf');
  const p = speicherPfad(B, A, 'SDB v3 (DE).pdf', 'ab12-cd34');
  assert.equal(p, `${B}/${A}/ab12cd34-sdb_v3_de.pdf`);
  assert.equal(pfadPasst(p, B, A), true);
  assert.equal(pfadPasst(p, '22222222-2222-4222-8222-222222222222', A), false, 'fremder Betrieb');
  assert.equal(pfadPasst(`${B}/${A}/x/ab-y.pdf`, B, A), false, 'tiefer');
  assert.equal(pfadPasst(`${B}/${A}/ab-y.pdf/zz.pdf`, B, A), false, 'Unterordner hinter der Datei');
  assert.equal(pfadPasst(`${B}/${A}/ab-..pdf`, B, A), false, '..');
  assert.equal(pfadPasst(`${B}/${A}/ab-y.html`, B, A), false);
  assert.equal(pfadPasst(null, B, A), false);
});

test('Angaben prüfen: Art, Sprache, Daten, Texte gekürzt', () => {
  const ok = dokumentPruefen({ art: 'sdb', titel: '  Mein   SDB ', sprache: 'EN', version: ' 4.2 ', ausgabe_am: '2025-03-01', gueltig_bis: '', im_shop: true });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.zeile, { art: 'sdb', titel: 'Mein SDB', sprache: 'en', version: '4.2', ausgabe_am: '2025-03-01', gueltig_bis: null, im_shop: true });
  assert.equal(dokumentPruefen({ art: 'gefahr' }).ok, false);
  assert.equal(dokumentPruefen({ art: 'sdb', sprache: 'deu' }).ok, false);
  assert.equal(dokumentPruefen({ art: 'sdb', ausgabe_am: '2026-02-30' }).ok, false);
  assert.equal(dokumentPruefen({ art: 'zertifikat', ausgabe_am: '2026-01-01', gueltig_bis: '2025-12-31' }).ok, false);
  assert.equal(dokumentPruefen({ art: 'zertifikat', titel: 'x'.repeat(300) }).zeile.titel.length, 120);
  assert.equal(dokumentPruefen({ art: 'tdb' }).zeile.im_shop, false, 'nur ausdrücklich true');
  assert.equal(istIsoTag('2024-02-29'), true);
  assert.equal(istIsoTag('2025-02-29'), false);
});

test('Ampel: abgelaufen, läuft bald ab, alte SDB-Fassung, ersetzt', () => {
  assert.equal(dokumentAmpel({ art: 'zertifikat', gueltig_bis: '2026-10-10' }, H).stufe, 'rot');
  assert.equal(dokumentAmpel({ art: 'zertifikat', gueltig_bis: '2026-10-11' }, H).stufe, 'gelb', 'heute noch gültig');
  assert.equal(dokumentAmpel({ art: 'zertifikat', gueltig_bis: '2026-12-10' }, H).stufe, 'gelb', '60 Tage');
  assert.equal(dokumentAmpel({ art: 'zertifikat', gueltig_bis: '2026-12-11' }, H).stufe, 'gruen');
  assert.equal(dokumentAmpel({ art: 'sdb' }, H).stufe, 'gelb', 'SDB ohne Ausgabedatum');
  assert.equal(dokumentAmpel({ art: 'sdb', ausgabe_am: '2023-10-11' }, H).stufe, 'gruen', 'genau 3 Jahre');
  assert.equal(dokumentAmpel({ art: 'sdb', ausgabe_am: '2023-10-10' }, H).stufe, 'gelb');
  assert.equal(dokumentAmpel({ art: 'tdb', ausgabe_am: '2010-01-01' }, H).stufe, 'gruen', 'nur SDB hat die 3-Jahres-Regel');
  assert.equal(dokumentAmpel({ art: 'sdb', aktuell: false, gueltig_bis: '2000-01-01' }, H).stufe, 'grau');
  assert.match(dokumentAmpel({ art: 'zertifikat', gueltig_bis: '2026-10-10' }, H).text, /10\.10\.2026/);
});

test('Shop: nur freigegeben, aktuell, nicht abgelaufen; sortiert; Name', () => {
  const liste = [
    { id: '1', art: 'anleitung', im_shop: true, aktuell: true },
    { id: '2', art: 'sdb', sprache: 'en', im_shop: true, aktuell: true, version: '2' },
    { id: '3', art: 'sdb', sprache: 'de', im_shop: true, aktuell: true },
    { id: '4', art: 'sdb', im_shop: true, aktuell: false },
    { id: '5', art: 'tdb', im_shop: false, aktuell: true },
    { id: '6', art: 'zertifikat', im_shop: true, aktuell: true, gueltig_bis: '2026-10-10' },
    { id: '7', art: 'zertifikat', im_shop: true, aktuell: true, gueltig_bis: '2026-10-11', titel: 'ISO 9001' },
  ];
  const s = shopDokumente(liste, H);
  assert.deepEqual(s.map((d) => d.id), ['3', '2', '7', '1']);
  assert.equal(s[0].name, 'Sicherheitsdatenblatt');
  assert.equal(s[1].name, 'Sicherheitsdatenblatt · Version 2 · Englisch');
  assert.equal(s[2].name, 'ISO 9001');
  assert.equal(s[0].art, 'SDB');
  assert.equal(shopDokumente(Array.from({ length: 30 }, (_, i) => ({ id: String(i), art: 'anleitung', im_shop: true })), H).length, 12);
  assert.deepEqual(shopDokumente(null, H), []);
});

test('Erinnerung, Zählung, Name im Firmen-Wissen', () => {
  assert.equal(erinnerungsTag('2026-12-31', H), '2026-12-01');
  assert.equal(erinnerungsTag('2026-10-20', H), H, 'nie in der Vergangenheit');
  const z = zaehlen([
    { art: 'zertifikat', gueltig_bis: '2026-01-01', im_shop: true },
    { art: 'sdb', ausgabe_am: '2020-01-01', im_shop: true },
    { art: 'tdb', im_shop: true },
    { art: 'tdb', aktuell: false, im_shop: true },
  ], H);
  assert.deepEqual(z, { gesamt: 4, rot: 1, gelb: 1, imShop: 2, ersetzt: 1 });
  assert.equal(wissenName('Korrosionsschutz "X"/Y', { art: 'sdb', version: '3' }), 'Korrosionsschutz X Y – Sicherheitsdatenblatt · Version 3.pdf');
  assert.equal(anzeigeName({ art: 'unbekannt' }), 'Dokument');
});

test('SQL p315: Arten, Ersetzen, Größe, Regeln und Speicher wie im Code', () => {
  const sql = lies('supabase-sql/p315-produkt-dokumente.sql');
  for (const a of ARTEN) assert.ok(sql.includes(`'${a.key}'`), a.key);
  assert.match(sql, new RegExp(`art in \\(${ERSETZT_ARTEN.map((a) => `'${a}'`).join(', ')}\\)`), 'gleiche Ersetz-Arten');
  assert.ok(sql.includes(String(MAX_BYTES)));
  assert.match(sql, /'produkt-dokumente', 'produkt-dokumente', false, 20971520, array\['application\/pdf'\]/);
  assert.match(sql, /enable row level security/);
  assert.ok(!/pdok_ma_delete/.test(sql), 'Mitarbeiter löschen nicht');
  assert.match(sql, /produktdok_delete[\s\S]*mein_chef_id\(\) is null/);
  assert.match(sql, /Erwartung: 1 \| 4 \| 2 \| 3 \| true/);
  assert.ok(!/drop table|delete from|truncate/i.test(sql.replace(/RÜCKWEG[\s\S]*?=====/, '')), 'nichts Destruktives');
});

test('Öffentliche Tür: fail-closed, gelistet, gedeckelt; Shop zeigt Links', () => {
  const r = lies('app/api/oeffentlich/produkt-dokument/route.ts');
  for (const muss of ["status !== 'live'", "dok.im_shop !== true", "dok.aktuell !== true", "art.im_shop !== true", "art.aktiv === false", 'pfadPasst(', "eq('owner_user_id', betrieb)", 'createSignedUrl(', ', 60)', "drossel(db, 'oeffentlich/produkt-dokument'"]) {
    assert.ok(r.includes(muss), muss);
  }
  assert.match(lies('lib/offeneTueren.ts'), /pfad: 'oeffentlich\/produkt-dokument'/);
  assert.match(lies('lib/drossel.ts'), /'oeffentlich\/produkt-dokument': \[/);
  const sp = lies('app/api/oeffentlich/shop-produkte/route.ts');
  assert.match(sp, /from\('produkt_dokument'\)[\s\S]*eq\('owner_user_id'[\s\S]*eq\('im_shop', true\)\.eq\('aktuell', true\)/);
  assert.match(sp, /dokumente: shopDokumente\(/);
  const js = lies('public/shop.js');
  assert.match(js, /\/api\/oeffentlich\/produkt-dokument\?seite=/);
  assert.match(js, /esc\(d\[i\]\.name\)/, 'Name maskiert');
  assert.match(lies('lib/webBloecke.ts'), /\.ao-prod-dok\{/);
});

test('Dashboard: Akte, Übersicht, Menü, Hilfe', () => {
  assert.match(lies('app/dashboard/erp/[id]/page.tsx'), /<ProduktDokumente artikelId=\{artikel\.id\}/);
  const k = lies('app/dashboard/erp/[id]/ProduktDokumente.tsx');
  assert.match(k, /from\(BUCKET\)\.remove\(\[pfad\]\)/, 'Datei weg, wenn Speichern scheitert');
  assert.match(k, /fuer_team: true/);
  assert.match(lies('lib/rechte.ts'), /href: '\/dashboard\/erp\/dokumente', modul: 'erp'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/erp\/dokumente': \{/);
  assert.match(lies('app/dashboard/erp/dokumente/page.tsx'), /<Leerzustand/);
});

test('Sprachen: alle 24 aus dem mehrsprachigen Team, dazu nl und zh', async () => {
  const { SPRACHEN } = await import('../out/produktDokumente.js');
  const team = [...lies('lib/mehrsprachig.ts').matchAll(/\{ code: '([a-z]{2})'/g)].map((m) => m[1]);
  assert.equal(team.length, 24);
  const eigen = SPRACHEN.map((s) => s.key);
  for (const c of team) assert.ok(eigen.includes(c), c);
  assert.ok(eigen.includes('nl') && eigen.includes('zh'));
  assert.equal(new Set(eigen).size, eigen.length);
});
