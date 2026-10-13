// ============================================================================
// tests/anrufErlaubnisP362.test.mjs — Paket 362 (13.10.2026)
// VK11 Anruf-Sperrliste und Erlaubnis-Ampel (§ 7 Abs. 2 Nr. 1, § 7a UWG).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  nummerNorm, sperrMap, einwilligungFuer, ampel, freigabe, einwilligungPruefen, sperrePruefen, nummerText, GRUND_MIN, QUELLEN,
} from '../out/anrufErlaubnis.js';
import { NAV_LINKS } from '../out/rechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const LEER = new Map();
const sql0 = () => lies('supabase-sql/p362-anruf-erlaubnis.sql');

test('Nummern einheitlich wie p362_nummer in der Datenbank', () => {
  assert.equal(nummerNorm('07031 / 22 22 22'), '+497031222222');
  assert.equal(nummerNorm('+49 (0)7031 222222'), '+497031222222', 'die (0) fällt weg – wie in der Datenbank');
  assert.match(sql0(), /replace\(coalesce\(p, ''\), '\(0\)', ''\)/);
  assert.equal(nummerNorm('0043 123 456'), '+43123456');
  assert.equal(nummerNorm('0171-5555555'), '+491715555555');
  assert.equal(nummerNorm('123456'), null, 'ohne Vorwahl nicht eindeutig');
  assert.equal(nummerNorm('0711'), null, 'zu kurz');
  assert.equal(nummerNorm(''), null);
  assert.equal(nummerText('+497031222222'), '+49 7031222222');
  const sql = lies('supabase-sql/p362-anruf-erlaubnis.sql');
  assert.match(sql, /elsif left\(s, 1\) = '0' then z := '49' \|\| substr\(s, 2\);/);
  assert.match(sql, /length\(z\) < 6 or length\(z\) > 16/);
});

test('Ampel: gesperrt rot ohne Ausweg, Lead grün, Einwilligung grün', () => {
  const sp = sperrMap([{ nummer: '+497031111111', quelle: 'widerspruch' }, { nummer: '+497031999999', entsperrt_am: '2026-10-01' }]);
  const g = ampel({ typ: 'lead', id: 'l', telefon: '07031 111111', istVerbraucher: null }, sp, []);
  assert.equal(g.farbe, 'rot'); assert.equal(g.braucht, 'gesperrt'); assert.equal(g.ausweg, false);
  assert.match(g.text, /Widerspruch/);
  assert.equal(ampel({ typ: 'kontakt', id: 'k', telefon: '07031 999999', istVerbraucher: false }, sp, []).farbe, 'gelb', 'aufgehobene Sperre zählt nicht');
  const lead = ampel({ typ: 'lead', id: 'l', telefon: '07031 123456', istVerbraucher: true }, LEER, []);
  assert.deepEqual([lead.farbe, lead.erlaubnis, lead.braucht], ['gruen', 'eigene_anfrage', 'nichts']);
  const e = [{ nummer: '+491715555555', kontakt_id: 'x' }];
  assert.equal(ampel({ typ: 'kontakt', id: 'k', telefon: '0171 5555555', istVerbraucher: true }, LEER, e).erlaubnis, 'einwilligung', 'über die Nummer');
  assert.equal(ampel({ typ: 'kontakt', id: 'x', telefon: '0171 0000000', istVerbraucher: true }, LEER, e).erlaubnis, 'einwilligung', 'über den Kontakt');
  assert.equal(ampel({ typ: 'kontakt', id: 'k', telefon: '0171 5555555', istVerbraucher: true }, LEER, [{ ...e[0], widerrufen_am: '2026-10-13' }]).farbe, 'rot', 'widerrufen zählt nicht');
});

test('Ampel: Verbraucher rot (auch Bestandskunde), Firma gelb mit Grund, unklar grau', () => {
  const v = ampel({ typ: 'kontakt', id: 'k', telefon: '07031 1234567', istVerbraucher: true, bestandskunde: true }, LEER, []);
  assert.deepEqual([v.farbe, v.erlaubnis, v.ausweg], ['rot', null, true]);
  assert.match(v.text, /auch nicht bei Bestandskunden/);
  const f = ampel({ typ: 'kontakt', id: 'k', telefon: '07031 1234567', istVerbraucher: false, bestandskunde: true }, LEER, []);
  assert.deepEqual([f.farbe, f.erlaubnis, f.braucht, f.grundVorschlag], ['gelb', 'mutmasslich', 'grund', 'Bestandskunde – ']);
  assert.equal(ampel({ typ: 'kontakt', id: 'k', telefon: '07031 1234567', istVerbraucher: false }, LEER, []).grundVorschlag, '');
  const u = ampel({ typ: 'kontakt', id: 'k', telefon: '07031 1234567', istVerbraucher: null }, LEER, []);
  assert.deepEqual([u.farbe, u.braucht], ['grau', 'einordnung']);
});

test('Freigabe: was darf gewählt und gespeichert werden', () => {
  const lead = ampel({ typ: 'lead', id: 'l', telefon: '07031 123456', istVerbraucher: null }, LEER, []);
  assert.deepEqual(freigabe(lead, { keinWerbeanruf: false, grund: '' }), { ok: true, erlaubnis: 'eigene_anfrage', grund: null });
  const firma = ampel({ typ: 'kontakt', id: 'k', telefon: '07031 1234567', istVerbraucher: false }, LEER, []);
  assert.equal(freigabe(firma, { keinWerbeanruf: false, grund: 'kurz' }).ok, false);
  assert.deepEqual(freigabe(firma, { keinWerbeanruf: false, grund: '  Wartung fällig laut Vertrag ' }), { ok: true, erlaubnis: 'mutmasslich', grund: 'Wartung fällig laut Vertrag' });
  const verbr = ampel({ typ: 'kontakt', id: 'k', telefon: '07031 1234567', istVerbraucher: true }, LEER, []);
  assert.equal(freigabe(verbr, { keinWerbeanruf: false, grund: 'Messe-Interesse gezeigt' }).ok, false, 'Verbraucher: kein mutmaßliches Interesse');
  assert.deepEqual(freigabe(verbr, { keinWerbeanruf: true, grund: 'Rückfrage zum Auftrag 2026-014' }), { ok: true, erlaubnis: 'kein_werbeanruf', grund: 'Rückfrage zum Auftrag 2026-014' });
  assert.equal(freigabe(verbr, { keinWerbeanruf: true, grund: 'kurz' }).ok, false);
  const unklar = ampel({ typ: 'kontakt', id: 'k', telefon: '07031 1234567', istVerbraucher: null }, LEER, []);
  assert.equal(freigabe(unklar, { keinWerbeanruf: false, grund: 'irgendein langer Grund' }).ok, false, 'erst einordnen');
  assert.match(freigabe(unklar, { keinWerbeanruf: false, grund: 'irgendein langer Grund' }).fehler, /„Verbraucher" oder „Firma"/);
  const gesperrt = ampel({ typ: 'lead', id: 'l', telefon: '07031 111111', istVerbraucher: null }, sperrMap([{ nummer: '+497031111111' }]), []);
  assert.equal(freigabe(gesperrt, { keinWerbeanruf: true, grund: 'Rückfrage zum Auftrag 2026-014' }).ok, false, 'gesperrt: auch kein Ausweg');
  assert.match(freigabe(gesperrt, { keinWerbeanruf: true, grund: 'Rückfrage zum Auftrag 2026-014' }).fehler, /gesperrt/);
  assert.equal(GRUND_MIN, 10);
});

test('Prüfungen Einwilligung und Sperre', () => {
  const ok = { nummer: '0171 5555555', quelle: 'schriftlich', erteilt_am: '2026-10-13', nachweis: 'Formular am Messestand' };
  assert.deepEqual(einwilligungPruefen(ok, '2026-10-13'), []);
  assert.equal(einwilligungPruefen({ ...ok, erteilt_am: '2026-10-14' }, '2026-10-13').length, 1);
  assert.equal(einwilligungPruefen({ ...ok, nachweis: 'kurz' }, '2026-10-13').length, 1);
  assert.equal(einwilligungPruefen({ ...ok, quelle: 'telepathie' }, '2026-10-13').length, 1);
  assert.equal(einwilligungPruefen({ ...ok, nummer: '123' }, '2026-10-13').length, 1);
  assert.deepEqual(QUELLEN.map((q) => q.key), ['schriftlich', 'online_formular', 'mail', 'muendlich']);
  assert.deepEqual(sperrePruefen('07031 123456'), []);
  assert.equal(sperrePruefen('123456').length, 1);
  assert.equal(einwilligungFuer([{ nummer: '+491715555555' }], null, null, null), null);
});

test('Quelltext: SQL, Sitzung, Verlauf, Menü, Sicherung, DSGVO', () => {
  const sql = lies('supabase-sql/p362-anruf-erlaubnis.sql');
  assert.match(sql, /Bei Verbrauchern reicht mutmaßliches Interesse nicht/);
  assert.match(sql, /Diese Nummer ist gesperrt/);
  assert.match(sql, /insert into public\.telefon_sperre[\s\S]*'widerspruch'/, 'Widerruf sperrt');
  assert.match(sql, /if auth\.uid\(\) is not null then raise exception 'Einwilligungen werden als Nachweis aufbewahrt/, 'nie löschen');
  assert.doesNotMatch(sql, /drop table|truncate|drop policy if exists [a-z0-9_]+ on public\.(vk_anruf|leads|kontakte)/i, 'nie destruktiv, keine Regeln an Anruf/Lead/Kontakt');
  const s = lies('app/dashboard/akquise/sitzung/page.tsx');
  assert.match(s, /disabled=\{busy \|\| !frei\.ok\}/, 'Ergebnis erst nach Freigabe');
  assert.match(s, /erlaubnis: frei\.erlaubnis, erlaubnis_grund: frei\.grund/);
  assert.match(s, /sperrIndex\.has\(n\)/, 'gesperrte Nummern nicht in der Liste');
  assert.match(s, /ist_verbraucher === true && !einwilligungFuer/, 'Verbraucher ohne Einwilligung nicht aus Gruppen');
  assert.match(s, /if \(erg === 'falsche_nummer'\) await sperrenEintragen\('falsche_nummer'/);
  assert.match(lies('app/dashboard/_components/AnrufVerlauf.tsx'), /erlaubnis: frei\.erlaubnis/);
  const nav = NAV_LINKS.find((n) => n.href === '/dashboard/akquise/sperrliste');
  assert.ok(nav); assert.equal(nav.modul, undefined);
  assert.match(lies('lib/sicherungTabellen.ts'), /'telefon_einwilligung', 'telefon_sperre'/);
  assert.match(lies('lib/dsgvoDaten.ts'), /tabelle: 'telefon_einwilligung'[^\n]*art: 'behalten'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/akquise\/sperrliste'/);
  assert.match(lies('scripts/claude-start.sh'), /p362-\*\.sql/);
});
