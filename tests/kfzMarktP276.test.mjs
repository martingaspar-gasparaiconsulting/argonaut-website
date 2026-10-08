// ============================================================================
// tests/kfzMarktP276.test.mjs — Paket 276 (08.10.2026) · K12b Marktvergleich
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vergleichPruefen, alterTage, aktuell, passend, quantil, marktLage, balkenPos, MAX_TAGE, MIN_VERGLEICHE } from '../out/kfzMarkt.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const HEUTE = '2026-10-08';
const v = (preis, x = {}) => ({ preis, km: 60000, erstzulassung: '2021-03-01', erfasst_am: '2026-10-01', ...x });
const EIGEN = { vk: 21000, km: 60000, erstzulassung: '2021-05-01' };

test('Eingabe prüfen: Preis Pflicht, EZ, Link nur https, Datum nie in der Zukunft', () => {
  const ok = vergleichPruefen({ preis: 19999.999, km: 61234.4, ez: '03/2021', quelle: ' mobile.de ', link: 'https://suchen.mobile.de/x', notiz: '  Leder  ' }, HEUTE);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.felder, { preis: 20000, km: 61234, erstzulassung: '2021-03-01', quelle: 'mobile.de', link: 'https://suchen.mobile.de/x', notiz: 'Leder', erfasst_am: HEUTE });
  assert.equal(vergleichPruefen({ preis: null, km: null, ez: '', quelle: '', link: '', notiz: '' }, HEUTE).ok, false);
  assert.equal(vergleichPruefen({ preis: 0, km: null, ez: '', quelle: '', link: '', notiz: '' }, HEUTE).ok, false);
  assert.equal(vergleichPruefen({ preis: 1000, km: -5, ez: '', quelle: '', link: '', notiz: '' }, HEUTE).ok, false);
  assert.match(vergleichPruefen({ preis: 1000, km: null, ez: '13/2021', quelle: '', link: '', notiz: '' }, HEUTE).fehler, /MM\/JJJJ/);
  assert.match(vergleichPruefen({ preis: 1000, km: null, ez: '', quelle: '', link: 'http://x.de', notiz: '' }, HEUTE).fehler, /https/);
  assert.match(vergleichPruefen({ preis: 1000, km: null, ez: '', quelle: '', link: 'javascript:alert(1)', notiz: '' }, HEUTE).fehler, /https/);
  const leer = vergleichPruefen({ preis: 1000, km: null, ez: null, quelle: '', link: '', notiz: '', am: '2027-01-01' }, HEUTE);
  assert.deepEqual([leer.felder.quelle, leer.felder.link, leer.felder.erfasst_am], ['Sonstige', null, HEUTE]);
  assert.equal(vergleichPruefen({ preis: 1000, km: null, ez: null, quelle: '', link: '', notiz: '', am: '2026-09-30' }, HEUTE).felder.erfasst_am, '2026-09-30');
});

test('Alter, Aktualität, Passung nach km und Erstzulassung', () => {
  assert.equal(MAX_TAGE, 30);
  assert.equal(MIN_VERGLEICHE, 3);
  assert.equal(alterTage('2026-09-08', HEUTE), 30);
  assert.equal(aktuell(v(1, { erfasst_am: '2026-09-08' }), HEUTE), true);
  assert.equal(aktuell(v(1, { erfasst_am: '2026-09-07' }), HEUTE), false);
  assert.equal(aktuell(v(0), HEUTE), false);
  assert.equal(passend(EIGEN, v(1, { km: 78000 })), true, '±30 %');
  assert.equal(passend(EIGEN, v(1, { km: 79000 })), false);
  assert.equal(passend({ km: 10000, erstzulassung: null }, v(1, { km: 25000 })), true, 'mindestens ±15.000 km');
  assert.equal(passend({ km: 10000, erstzulassung: null }, v(1, { km: 25001 })), false);
  assert.equal(passend(EIGEN, v(1, { erstzulassung: '2019-05-01' })), true, '±2 Jahre');
  assert.equal(passend(EIGEN, v(1, { erstzulassung: '2019-04-01' })), false);
  assert.equal(passend({ km: null, erstzulassung: null }, v(1, { km: 999999 })), true, 'fehlende Angabe wird nicht geprüft');
  assert.equal(quantil([10, 20, 30, 40], 0.5), 25);
  assert.equal(quantil([10, 20, 30, 40, 50], 0.25), 20);
});

test('Marktlage: zu wenige, Median, Rang, Einstufung', () => {
  const wenig = marktLage(EIGEN, [v(20000), v(22000)], HEUTE);
  assert.deepEqual([wenig.basis, wenig.median, wenig.abweichung, wenig.stufe, wenig.anzahl], ['zu_wenig', null, null, 'dim', 0], 'unter 3 keine Zahl');
  assert.match(wenig.text, /Zu wenige aktuelle Vergleiche \(2 von mindestens 3\)/);
  assert.equal(marktLage(EIGEN, [v(20000), v(22000), v(21000, { erfasst_am: '2026-08-01' })], HEUTE).basis, 'zu_wenig', 'veraltete zählen nicht');
  const l = marktLage(EIGEN, [v(19000), v(20000), v(22000), v(23000)], HEUTE);
  assert.deepEqual([l.basis, l.anzahl, l.median, l.min, l.max, l.abweichung, l.abweichungProzent, l.guenstiger, l.stufe], ['passend', 4, 21000, 19000, 23000, 0, 0, 2, 'ok']);
  assert.match(l.text, /genau in der Marktmitte/);
  assert.equal(marktLage({ ...EIGEN, vk: 22050 }, [v(19000), v(20000), v(22000), v(23000)], HEUTE).stufe, 'ok', '+5 % noch grün');
  assert.equal(marktLage({ ...EIGEN, vk: 23000 }, [v(19000), v(20000), v(22000), v(23000)], HEUTE).stufe, 'warn');
  const teuer = marktLage({ ...EIGEN, vk: 25000 }, [v(19000), v(20000), v(22000), v(23000)], HEUTE);
  assert.deepEqual([teuer.stufe, teuer.abweichungProzent], ['bad', 19]);
  assert.match(teuer.text, /teuerstes Angebot/);
  const billig = marktLage({ ...EIGEN, vk: 18000 }, [v(19000), v(20000), v(22000), v(23000)], HEUTE);
  assert.equal(billig.stufe, 'info');
  assert.match(billig.text, /günstigstes Angebot.*verschenken/);
});

test('Marktlage: unpassende Vergleiche, km-Hinweis, ohne eigenen Preis', () => {
  const gemischt = [v(19000), v(20000), v(30000, { km: 10000 }), v(31000, { erstzulassung: '2024-01-01' })];
  const l = marktLage(EIGEN, gemischt, HEUTE);
  assert.equal(l.basis, 'alle', 'nur 2 passend -> alle 4 mit Hinweis');
  assert.match(l.text, /nur 2 der Vergleiche passen/);
  const pas = marktLage(EIGEN, [...gemischt, v(21000)], HEUTE);
  assert.deepEqual([pas.basis, pas.anzahl, pas.median], ['passend', 3, 20000], 'unpassende fliegen raus');
  const wenigKm = marktLage({ ...EIGEN, km: 40000 }, [v(19000, { km: 52000 }), v(20000, { km: 55000 }), v(21000, { km: 54000 })], HEUTE);
  assert.match(wenigKm.kmText ?? '', /weniger Kilometer/);
  assert.equal(marktLage(EIGEN, [v(19000), v(20000), v(21000)], HEUTE).kmText, null);
  const ohne = marktLage({ ...EIGEN, vk: null }, [v(19000), v(20000), v(21000)], HEUTE);
  assert.deepEqual([ohne.median, ohne.abweichung, ohne.stufe], [20000, null, 'dim']);
  assert.match(ohne.text, /noch keinen Preis/);
  assert.equal(balkenPos(21000, 19000, 23000), 50);
  assert.equal(balkenPos(30000, 19000, 23000), 100);
  assert.equal(balkenPos(1, 5, 5), 50);
  assert.equal(balkenPos(null, 1, 2), null);
});

test('Verdrahtung: Akte, Preis-Cockpit, Guide, SQL ohne Personendaten, keine KI', () => {
  const logik = lies('lib/kfzMarkt.ts');
  assert.doesNotMatch(logik, /kiFetch|anthropic|openai|fetch\(/i, 'keine KI, kein Abruf fremder Seiten');
  assert.doesNotMatch(logik, /Math\.round\([^)]*\* ?100\) ?\/ ?100/, 'Rundungs-Wächter');
  const akte = lies('app/dashboard/kfz/bestand/[id]/page.tsx');
  assert.match(akte, /<KfzMarkt fz=\{\{ id: akte\.id/);
  const karte = lies('app/dashboard/kfz/bestand/KfzMarkt.tsx');
  assert.match(karte, /vergleichPruefen\(/);
  assert.match(karte, /nichtsGeschrieben/);
  assert.match(karte, /rel="noopener noreferrer nofollow"/);
  const preise = lies('app/dashboard/kfz/preise/page.tsx');
  assert.match(preise, /from\('kfz_marktvergleich'\)/);
  assert.match(preise, /marktLage\(\{ vk: f\.vk_brutto/);
  assert.match(lies('lib/guideWissen.ts'), /„Marktvergleich"/);
  const sql = lies('supabase-sql/p276-kfz-marktvergleich.sql');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /on delete cascade/);
  assert.match(sql, /link ~ '\^https:\/\/'/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(name|anbieter_name|telefon|email|verkaeufer)\b/i, 'keine Personendaten-Spalten');
});
