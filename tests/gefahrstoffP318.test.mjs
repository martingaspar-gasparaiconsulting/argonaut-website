// Paket 318 (11.10.2026): G2a Gefahrstoffverzeichnis 2.0 (Teil 1)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  LAGERKLASSEN, istLagerklasse, lagerklasseText, bestandZahl, mengeKgL, mengenbereichAus, lagerInfo,
  sdbPfad, sdbPfadPasst, besteArtikelSdb, sdbQuelle, sdbErinnerungsTag, sdbIstAlt, erinnerungsTitel,
  zusatzHinweise, lagerplatzSauber, dateiPruefen,
} from '../out/gefahrstoffLager.js';
import { MENGENBEREICHE, verzeichnisZeilen } from '../out/qualitaet.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const B = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const H = '2026-10-11';

test('Lagerklassen: 24 Klassen nach TRGS 510, gleiche Liste wie der Datenbank-Wächter', () => {
  assert.equal(LAGERKLASSEN.length, 24);
  assert.equal(new Set(LAGERKLASSEN.map((l) => l.key)).size, 24);
  const sql = lies('supabase-sql/p318-gefahrstoff-2.sql');
  const m = sql.match(/lagerklasse in \(([^)]+)\)/);
  assert.ok(m, 'Liste im SQL');
  const imSql = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(imSql, LAGERKLASSEN.map((l) => l.key));
  assert.equal(istLagerklasse('3'), true);
  assert.equal(istLagerklasse('9'), false, 'LGK 9 gibt es nicht');
  assert.equal(istLagerklasse(3), false);
  assert.equal(lagerklasseText('8B'), 'LGK 8B · Nicht brennbare ätzende Gefahrstoffe');
  assert.equal(lagerklasseText(null), '—');
});

test('Menge aus dem Lager: kg/l umrechnen, Stück nie raten', () => {
  assert.equal(mengeKgL(5, 'kg'), 5);
  assert.equal(mengeKgL(500, 'g'), 0.5);
  assert.equal(mengeKgL(2, 't'), 2000);
  assert.equal(mengeKgL(250, 'ml'), 0.25);
  assert.equal(mengeKgL(3, 'Ltr.'), 3);
  assert.equal(mengeKgL(10, 'Stk'), null, 'Stück nicht umrechenbar');
  assert.equal(mengeKgL(-4, 'l'), 0, 'negativer Bestand zählt als 0');
  assert.equal(mengeKgL(null, 'l'), null);
  assert.equal(bestandZahl('1.234,5'), 1234.5, 'über den zentralen Leser');
  assert.equal(bestandZahl(''), null);
  assert.equal(bestandZahl('abc'), null);
});

test('Mengenbereich: Grenzen wie die Auswahl im Verzeichnis', () => {
  const alle = [0, 1, 1.0001, 10, 10.5, 100, 101, 1000, 1000.1].map(mengenbereichAus);
  assert.deepEqual(alle, ['bis 1 kg/l', 'bis 1 kg/l', '1–10 kg/l', '1–10 kg/l', '10–100 kg/l', '10–100 kg/l', '100–1.000 kg/l', '100–1.000 kg/l', 'über 1.000 kg/l']);
  for (const v of alle) assert.ok(MENGENBEREICHE.includes(v), `${v} steht in MENGENBEREICHE`);
  assert.equal(mengenbereichAus(null), null);
});

test('Lager-Info: Vorschlag, Abweichung nur als Hinweis, kein Bestand ehrlich benannt', () => {
  const a = lagerInfo(120, 'l', '10–100 kg/l');
  assert.equal(a.vorschlag, '100–1.000 kg/l');
  assert.equal(a.abweichung, true);
  assert.match(a.text, /120 l/);
  assert.equal(lagerInfo(120, 'l', '100–1.000 kg/l').abweichung, false);
  assert.equal(lagerInfo(120, 'l', '').abweichung, false, 'leer = keine Abweichung, nur Vorschlag');
  const s = lagerInfo(12, 'Stk', 'bis 1 kg/l');
  assert.equal(s.vorschlag, null); assert.equal(s.abweichung, false); assert.match(s.text, /nicht in kg\/l umrechnen/);
  assert.match(lagerInfo(null, 'kg', '').text, /nicht gepflegt/);
  assert.match(lagerInfo(1234.5, 'kg', '').text, /1\.234,5 kg/);
});

test('Eigene SDB-Datei: Ordner Betrieb/Stoff, passt zum Wächter', () => {
  const p = sdbPfad(B, S, 'SDB Aceton Ü.pdf', 'abc123');
  assert.equal(p, `${B}/${S}/abc123-sdb_aceton_ue.pdf`);
  assert.equal(sdbPfadPasst(p, B, S), true);
  assert.equal(sdbPfadPasst(p, S, B), false, 'fremder Betrieb');
  assert.equal(sdbPfadPasst(`${B}/${S}/../x-a.pdf`, B, S), false);
  assert.equal(sdbPfadPasst(`${B}/${S}/sub/x-a.pdf`, B, S), false);
  assert.equal(sdbPfadPasst(`${B}/${S}/x-a.docx`, B, S), false);
  assert.equal(sdbPfadPasst(null, B, S), false);
  assert.equal(dateiPruefen({ name: 'a.pdf', size: 10, type: 'application/pdf' }).ok, true);
  assert.equal(dateiPruefen({ name: 'a.exe', size: 10, type: '' }).ok, false);
  const sql = lies('supabase-sql/p318-gefahrstoff-2.sql');
  assert.match(sql, /split_part\(new\.sdb_pfad, '\/', 2\) <> new\.id::text/);
  assert.match(sql, /\^\[A-Za-z0-9\]\+-\[a-z0-9\._-\]\+\\\.pdf\$/);
});

test('SDB vom Artikel: Deutsch vor anderen Sprachen, dann neueste; ersetzte nie', () => {
  const l = [
    { id: '1', art: 'sdb', sprache: 'en', ausgabe_am: '2026-05-01', aktuell: true },
    { id: '2', art: 'sdb', sprache: 'de', ausgabe_am: '2024-01-01', aktuell: true },
    { id: '3', art: 'sdb', sprache: 'de', ausgabe_am: '2026-01-01', aktuell: false },
    { id: '4', art: 'tdb', sprache: 'de', ausgabe_am: '2026-09-01', aktuell: true },
  ];
  assert.equal(besteArtikelSdb(l).id, '2');
  assert.equal(besteArtikelSdb(l.filter((x) => x.id !== '2')).id, '1');
  assert.equal(besteArtikelSdb([l[2], l[3]]), null);
  assert.equal(besteArtikelSdb(null), null);
  assert.equal(sdbQuelle({ sdb_pfad: 'x', sdb_name: 'a.pdf' }, l[1]).art, 'datei', 'eigene Datei geht vor');
  assert.equal(sdbQuelle({}, l[1]).art, 'artikel');
  assert.match(sdbQuelle({}, l[0]).text, /Sprache EN/);
  assert.equal(sdbQuelle({}, null).art, 'keine');
});

test('Erinnerung: Fassung + 3 Jahre, frühestens heute; Schaltjahr', () => {
  assert.equal(sdbErinnerungsTag('2025-03-01', H), '2028-03-01');
  assert.equal(sdbErinnerungsTag('2020-03-01', H), H, 'schon überfällig = heute');
  assert.equal(sdbErinnerungsTag(null, H), H);
  assert.equal(sdbErinnerungsTag('2024-02-29', '2024-03-01'), '2027-02-28');
  assert.equal(sdbIstAlt('2023-10-10', H), true);
  assert.equal(sdbIstAlt('2023-10-11', H), false, 'genau 3 Jahre noch nicht alt');
  assert.equal(sdbIstAlt('2023-02-31', H), false, 'kein gültiges Datum');
  assert.equal(erinnerungsTitel('Aceton', '2022-05-04'), 'Aceton: aktuelles Sicherheitsdatenblatt anfordern (Fassung vom 04.05.2022)');
  assert.equal(erinnerungsTitel('', null), 'Gefahrstoff: Sicherheitsdatenblatt anfordern');
});

test('Zusatz-Hinweise: nur gelb, nie neue Pflichtfehler', () => {
  assert.equal(zusatzHinweise({ lagerklasse: '3', lagerplatz: 'Schrank 1', sdbVorhanden: true, lager: null }).length, 0);
  const h = zusatzHinweise({ lagerklasse: null, lagerplatz: ' ', sdbVorhanden: false, lager: { text: '', vorschlag: 'über 1.000 kg/l', abweichung: true } });
  assert.equal(h.length, 4);
  assert.match(h.join(' '), /Lagerklasse fehlt/);
  assert.match(h.join(' '), /über 1\.000 kg\/l/);
  assert.equal(lagerplatzSauber('  Halle  2 \n Schrank '), 'Halle 2 Schrank');
  assert.equal(lagerplatzSauber('   '), null);
  assert.equal(lagerplatzSauber('x'.repeat(100)).length, 80);
});

test('Verzeichnis (CSV/Druck) hat Lagerklasse und Lagerplatz hinten, alte Spalten unverändert', () => {
  const v = verzeichnisZeilen([{ bezeichnung: 'Aceton', lagerklasse: '3', lagerplatz: 'Schrank 1', sdb_datum: '2025-03-01' }]);
  assert.equal(v[0].length, 11);
  assert.equal(v[0][9], 'Lagerklasse (TRGS 510)'); assert.equal(v[0][10], 'Lagerplatz');
  assert.equal(v[1][7], '01.03.2025');
  assert.equal(v[1][9], 'LGK 3'); assert.equal(v[1][10], 'Schrank 1');
  assert.equal(verzeichnisZeilen([{ bezeichnung: 'X' }])[1][9], '');
});

test('SQL p318: additiv, Besitzer = Betrieb, Mitarbeiter-Lesen bleibt (GefStoffV), Speicher nur Chef', () => {
  const sql = lies('supabase-sql/p318-gefahrstoff-2.sql');
  assert.ok(!/\bdrop\s+(table|column|policy\s+if\s+exists\s+gefahrstoff_)/i.test(sql), 'nichts Bestehendes löschen');
  assert.match(sql, /set default coalesce\(public\.mein_chef_id\(\), auth\.uid\(\)\)/);
  assert.match(sql, /add column if not exists artikel_id\s+uuid references public\.artikel\(id\) on delete set null/);
  assert.match(sql, /Der Artikel gehoert nicht zu diesem Betrieb/);
  assert.match(sql, /Der Betrieb eines Gefahrstoffs ist fest/);
  assert.ok(!/create policy gefahrstoff_/.test(sql), 'Regeln der Tabelle bleiben unverändert');
  for (const r of ['select', 'insert', 'delete']) assert.match(sql, new RegExp(`gefahrstoffsdb_${r}[\\s\\S]{0,260}mein_chef_id\\(\\) is null`), `Speicher ${r} nur Chef`);
  assert.match(sql, /'gefahrstoff-sdb', 'gefahrstoff-sdb', false/);
  // Gegenprobe 11.10.: ohne „is not null" liess CHECK einen Pfad ohne Dateinamen durch (NULL gilt als bestanden)
  assert.match(sql, /sdb_pfad is not null and sdb_name is not null and sdb_bytes is not null/);
});

test('Route /api/gefahrstoff/sdb: Login, eigener Betrieb, Pfad-Prüfung vor dem Dienst-Schlüssel', () => {
  const r = lies('app/api/gefahrstoff/sdb/route.ts');
  assert.match(r, /auth\.getUser\(\)/);
  assert.match(r, /from\('gefahrstoff'\)[\s\S]{0,140}\.eq\('owner_user_id', betrieb\)/);
  const iStoff = r.indexOf("from('gefahrstoff')");
  const iAdmin = r.indexOf('const db = admin()');
  assert.ok(iStoff > 0 && iAdmin > iStoff, 'Stoff zuerst mit Anmeldung lesen, erst dann Dienst-Schlüssel');
  assert.match(r, /sdbPfadPasst\(stoff\.sdb_pfad, betrieb, stoff\.id\)/);
  assert.match(r, /pfadPasst\(d\.datei_pfad, betrieb, stoff\.artikel_id\)/);
  assert.match(r, /from\('artikel'\)[\s\S]{0,80}\.eq\('owner_user_id', betrieb\)/);
  assert.match(r, /createSignedUrl\(pfad, 60\)/);
  assert.match(r, /\.eq\('aktuell', true\)/);
});

test('Seite: SDB öffnen nur über den Server, Datei-Pfad über sdbPfad, Löschen räumt die Datei weg', () => {
  const s = lies('app/dashboard/nachweise/gefahrstoffe/page.tsx');
  assert.match(s, /href=\{`\/api\/gefahrstoff\/sdb\?id=\$\{z\.id\}`\}/);
  assert.ok(!/createSignedUrl/.test(s), 'kein Direkt-Link aus der Seite');
  assert.match(s, /sdbPfad\(betrieb, gespeichert, datei\.name, zufall\(\)\)/);
  assert.match(s, /if \(z\.sdb_pfad\) await supabase\.storage\.from\(BUCKET\)\.remove\(\[z\.sdb_pfad\]\)/);
  assert.match(s, /from\('erinnerung'\)\.insert/);
});
