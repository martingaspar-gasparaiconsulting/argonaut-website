// ============================================================================
// tests/reifeP339.test.mjs — Paket 339 (12.10.2026)
// BV3a Manufaktur Teil 1: Reife-Uhr (Reifetage, Ampel, Verlust, Klima, Eingaben)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  REIFE_ARTEN, vorlage, tagNr, plusTage, reifeTage, reifeStand, stufenRang, letzteMenge, verlustProzent, klimaAbweichung,
  tageOhneMessung, chargePruefen, messungPruefen, naechsteNummer, reifeUebersicht,
} from '../out/reife.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const C = { start_datum: '2026-10-01', ziel_tage: 28, min_tage: 21, max_tage: 60, status: 'reift' };

test('Datum: echte Kalendertage, Monats- und Schaltjahrgrenzen', () => {
  assert.equal(tagNr('2026-02-30'), null);
  assert.equal(tagNr('2026-13-01'), null);
  assert.equal(tagNr('quatsch'), null);
  assert.equal(plusTage('2026-01-31', 28), '2026-02-28');
  assert.equal(plusTage('2028-02-28', 1), '2028-02-29');
  assert.equal(plusTage('2026-10-24', 7), '2026-10-31', 'Zeitumstellung 25.10. spielt keine Rolle');
  assert.equal(reifeTage('2026-10-01', '2026-10-01'), 0);
  assert.equal(reifeTage('2026-10-01', '2026-11-01'), 31);
  assert.equal(reifeTage('2026-10-05', '2026-10-01'), null, 'vor dem Start');
});

test('Ampel: jung, reift, bereit, überreif, abgeschlossen', () => {
  let s = reifeStand(C, '2026-10-11');
  assert.equal(s.stufe, 'jung'); assert.equal(s.tage, 10); assert.match(s.text, /Mindestreife in 11 Tagen/);
  assert.equal(s.bereitAb, '2026-10-22'); assert.equal(s.zielAm, '2026-10-29'); assert.equal(s.spaetestens, '2026-11-30');
  assert.equal(s.prozent, 36);
  s = reifeStand(C, '2026-10-22'); assert.equal(s.stufe, 'reift'); assert.match(s.text, /Ziel in 7 Tagen/);
  s = reifeStand(C, '2026-10-29'); assert.equal(s.stufe, 'bereit'); assert.equal(s.prozent, 100);
  s = reifeStand(C, '2026-11-30'); assert.equal(s.stufe, 'bereit', 'Tag 60 ist noch erlaubt');
  s = reifeStand(C, '2026-12-01'); assert.equal(s.stufe, 'ueber'); assert.match(s.text, /1 Tag über/); assert.equal(s.prozent, 100);
  s = reifeStand({ ...C, status: 'abgeschlossen', end_datum: '2026-10-30' }, '2027-01-01');
  assert.equal(s.stufe, 'fertig'); assert.equal(s.tage, 29, 'zählt bis zum Enddatum');
  assert.equal(reifeStand({ ...C, start_datum: '2026-11-01' }, '2026-10-12').stufe, 'geplant');
  assert.equal(reifeStand({ ...C, status: 'verworfen' }, '2026-10-12').stufe, 'verworfen');
  // ohne Mindest- und Höchstreife
  assert.equal(reifeStand({ start_datum: '2026-10-01', ziel_tage: 10 }, '2026-10-05').stufe, 'jung');
  assert.equal(reifeStand({ start_datum: '2026-10-01', ziel_tage: 10 }, '2026-10-20').stufe, 'bereit', 'ohne Höchstreife nie überreif');
  // Ziel fehlt (Altdaten) -> kein Absturz
  assert.equal(reifeStand({ start_datum: '2026-10-01', ziel_tage: null, min_tage: 5 }, '2026-10-08').stufe, 'reift');
  assert.ok(stufenRang('ueber') < stufenRang('bereit') && stufenRang('bereit') < stufenRang('jung') && stufenRang('jung') < stufenRang('fertig'));
});

test('Verlust aus den eigenen Wiegungen', () => {
  assert.equal(verlustProzent(10, 9.2), 8);
  assert.equal(verlustProzent(12.5, 10.2), 18.4);
  assert.equal(verlustProzent(10, 10.3), -3, 'Zunahme wird gezeigt, nicht versteckt');
  assert.equal(verlustProzent(null, 9), null);
  assert.equal(verlustProzent(10, null), null);
  assert.equal(verlustProzent(10, 0), null);
  const m = [
    { datum: '2026-10-05', menge: 11.9 },
    { datum: '2026-10-09', temperatur: 2 },
    { datum: '2026-10-08', menge: 11.5, erstellt_am: '2026-10-08T08:00:00Z' },
    { datum: '2026-10-08', menge: 11.4, erstellt_am: '2026-10-08T17:00:00Z' },
  ];
  assert.deepEqual(letzteMenge(m), { datum: '2026-10-08', menge: 11.4 }, 'neueste Wiegung, Klima-Messung ohne Gewicht zählt nicht');
  assert.equal(letzteMenge([{ datum: '2026-10-08', temperatur: 2 }]), null);
  assert.equal(tageOhneMessung(m, '2026-10-01', '2026-10-16'), 7);
  assert.equal(tageOhneMessung([], '2026-10-01', '2026-10-03'), 2, 'ohne Messung ab Start');
});

test('Klima: Abweichungen vom Soll', () => {
  const k = { temp_min: 1, temp_max: 3, feuchte_min: 75, feuchte_max: 85 };
  assert.deepEqual(klimaAbweichung({ datum: 'x', temperatur: 2, feuchte: 80 }, k), []);
  assert.deepEqual(klimaAbweichung({ datum: 'x', temperatur: 5, feuchte: 70 }, k), ['Temperatur 5 °C über Soll 3 °C', 'Luftfeuchte 70 % unter Soll 75 %']);
  assert.deepEqual(klimaAbweichung({ datum: 'x', temperatur: 0.5 }, k), ['Temperatur 0,5 °C unter Soll 1 °C']);
  assert.deepEqual(klimaAbweichung({ datum: 'x', temperatur: 30, feuchte: 5 }, {}), [], 'ohne Soll keine Warnung');
  assert.deepEqual(klimaAbweichung({ datum: 'x', temperatur: 3 }, k), [], 'Grenze selbst ist erlaubt');
});

test('Vorlagen: alle Arten, Startwerte in sich stimmig', () => {
  for (const a of REIFE_ARTEN) {
    const v = vorlage(a);
    if (v.zielTage !== null) {
      assert.ok(v.minTage <= v.zielTage && v.zielTage <= v.maxTage, a);
      assert.ok(v.temp[0] <= v.temp[1] && v.feuchte[0] <= v.feuchte[1], a);
    }
  }
  assert.equal(vorlage('quatsch').label, 'Sonstiges');
  assert.equal(vorlage('wein').verlust, false);
});

test('Eingaben prüfen: Charge', () => {
  const ok = { produkt: ' Rinderrücken ', art: 'dry_aged', start_datum: '2026-10-01', ziel_tage: 28, min_tage: 21, max_tage: 60, start_menge: 12.5, einheit: 'kg', lagerort: '', temp_min: 1, temp_max: 3, feuchte_min: 75, feuchte_max: 85, notiz: '' };
  const r = chargePruefen(ok, '2026-10-12');
  assert.equal(r.ok, true); assert.equal(r.felder.produkt, 'Rinderrücken'); assert.equal(r.felder.lagerort, null);
  const f = (x) => chargePruefen({ ...ok, ...x }, '2026-10-12');
  assert.equal(f({ produkt: '  ' }).ok, false);
  assert.equal(f({ art: 'bier' }).ok, false);
  assert.equal(f({ start_datum: '2026-02-30' }).ok, false);
  assert.equal(f({ start_datum: '2028-01-01' }).ok, false, 'mehr als ein Jahr in der Zukunft');
  assert.equal(f({ ziel_tage: null }).ok, false);
  assert.equal(f({ ziel_tage: 2.5 }).ok, false, 'nur ganze Tage');
  assert.match(f({ min_tage: 30 }).fehler, /Mindestreife/);
  assert.match(f({ max_tage: 20 }).fehler, /Höchstreife/);
  assert.equal(f({ start_menge: 0 }).ok, false);
  assert.equal(f({ einheit: 'Sack' }).ok, false);
  assert.match(f({ temp_min: 5, temp_max: 3 }).fehler, /Temperatur/);
  assert.equal(f({ feuchte_max: 120 }).ok, false);
});

test('Eingaben prüfen: Messung', () => {
  const g = (x) => messungPruefen({ datum: '2026-10-05', menge: null, temperatur: null, feuchte: null, notiz: '', ...x }, '2026-10-01', '2026-10-12');
  assert.equal(g({ menge: 11.9 }).ok, true);
  assert.equal(g({}).ok, false, 'leer');
  assert.match(g({ datum: '2026-09-30', menge: 1 }).fehler, /vor dem Start/);
  assert.match(g({ datum: '2026-10-13', menge: 1 }).fehler, /Zukunft/);
  assert.equal(g({ menge: -1 }).ok, false);
  assert.equal(g({ feuchte: 101 }).ok, false);
  assert.equal(g({ temperatur: -5 }).ok, true, 'Tiefkühl erlaubt');
});

test('Nummern und Übersicht', () => {
  assert.equal(naechsteNummer([], 2026), 'RF-2026-001');
  assert.equal(naechsteNummer(['RF-2026-001', 'RF-2026-009', 'RF-2025-120', null, 'x'], 2026), 'RF-2026-010');
  assert.equal(naechsteNummer(['RF-2026-999'], 2026), 'RF-2026-1000');
  const u = reifeUebersicht([reifeStand(C, '2026-10-11'), reifeStand(C, '2026-10-29'), reifeStand(C, '2026-12-05'), reifeStand({ ...C, status: 'abgeschlossen', end_datum: '2026-10-30' }, '2026-12-05')]);
  assert.deepEqual(u, { laufend: 3, bereit: 1, ueber: 1, jung: 1 });
});

test('Quelltext: Seite, SQL, Menü, Guide', () => {
  const seite = lies('app/dashboard/lebensmittel/reife/page.tsx');
  assert.ok(seite.includes("from('reife_charge')") && seite.includes("from('reife_messung')"));
  assert.ok(!/\.update\([^)]*\)\s*\.eq\('id', m\.id\)/.test(seite), 'Messungen werden nie geändert');
  assert.ok(seite.includes('leseZahl'), 'Zahlen nur über lib/zahlen');
  const sql = lies('supabase-sql/p339-reife-uhr.sql');
  assert.match(sql, /Eine Messung wird nicht geändert/);
  assert.match(sql, /c\.id = new\.charge_id and c\.owner_user_id = new\.owner_user_id/);
  assert.ok(!/p339_ma_delete/.test(sql), 'Mitarbeiter löschen nichts');
  assert.ok(lies('lib/rechte.ts').includes("href: '/dashboard/lebensmittel/reife'"));
  assert.ok(lies('lib/guideWissen.ts').includes("'/dashboard/lebensmittel/reife': {"));
  assert.ok(lies('app/dashboard/lebensmittel/page.tsx').includes('href="/dashboard/lebensmittel/reife"'));
});
