// Paket 331 (12.10.2026): PS-1 Preis-Spiegel für Dienstleister — eigener Preis, Mitbewerber von Hand, Marktmitte und Position
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  katalogPreis, postenPreis, postenPruefen, anbieterPruefen, vergleichPruefen, bruttoVon,
  neuesteJeAnbieter, spiegelLage, uebersicht, rang, MAX_TAGE, MIN_VERGLEICHE,
} from '../out/preisSpiegel.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = '2026-10-12';
const v = (anbieter, preis, am = HEUTE, ist_brutto = true) => ({ anbieter, preis, ist_brutto, erfasst_am: am });

test('Katalog-Preis: Pauschale gewinnt, Zeit-Leistung = Standardmenge × Stundensatz, Menge je Einheit, brutto mit Steuersatz', () => {
  assert.deepEqual(katalogPreis({ id: 'a', festpreis_netto: 25.21, stundensatz_netto: 60, erfassungsart: 'minuten', standard_wert: 30 }), { netto: 25.21, brutto: 30, mwst: 19, je: 'je Leistung' });
  assert.deepEqual(katalogPreis({ id: 'b', stundensatz_netto: 60, erfassungsart: 'minuten', standard_wert: 30 }), { netto: 30, brutto: 35.7, mwst: 19, je: 'je Leistung (30 Min)' });
  assert.deepEqual(katalogPreis({ id: 'c', stundensatz_netto: 58, erfassungsart: 'stunden', standard_wert: 1 }), { netto: 58, brutto: 69.02, mwst: 19, je: 'je Stunde' });
  assert.equal(katalogPreis({ id: 'd', erfassungsart: 'stueck', einheit: 'm²', einheitspreis_netto: 10, mwst_satz: 7 }).je, 'je m²');
  assert.equal(katalogPreis({ id: 'd', erfassungsart: 'stueck', einheit: 'm²', einheitspreis_netto: 10, mwst_satz: 7 }).brutto, 10.7);
  assert.equal(katalogPreis({ id: 'e', erfassungsart: 'aw', standard_wert: 10, aw_minuten: 6, stundensatz_netto: 120 }).netto, 120);
  assert.equal(katalogPreis({ id: 'e', erfassungsart: 'aw', standard_wert: 10, aw_minuten: 6, stundensatz_netto: 120 }).je, 'je Leistung (1 Std)');
  assert.equal(katalogPreis({ id: 'f', erfassungsart: 'stunden' }), null, 'ohne Preis nichts erfinden');
  assert.equal(katalogPreis(null), null);
});

test('Posten: mit Leistung Preis aus dem Katalog, frei mit eigenem Bruttopreis; Prüfung', () => {
  const k = { id: 'k', festpreis_netto: 100, mwst_satz: 19 };
  assert.equal(postenPreis({ id: 'p', bezeichnung: 'X', leistung_id: 'k', eigener_preis: 5, mwst_satz: 19 }, k).brutto, 119);
  assert.equal(postenPreis({ id: 'p', bezeichnung: 'X', leistung_id: 'k', eigener_preis: 5, mwst_satz: 19 }, null), null, 'Leistung gelöscht/unbekannt -> kein Preis, kein Rückfall auf Handpreis');
  assert.deepEqual(postenPreis({ id: 'p', bezeichnung: 'Schnitzel', leistung_id: null, eigener_preis: 14.9, mwst_satz: 7 }, null), { brutto: 14.9, netto: 13.93, mwst: 7, je: 'je Posten' });
  assert.equal(postenPruefen({ bezeichnung: '  ', leistung_id: null, eigener_preis: 1, mwst_satz: 19 }).ok, false);
  assert.equal(postenPruefen({ bezeichnung: 'A', leistung_id: null, eigener_preis: -1, mwst_satz: 19 }).ok, false);
  assert.equal(postenPruefen({ bezeichnung: 'A', leistung_id: null, eigener_preis: 1, mwst_satz: 31 }).ok, false);
  const mitL = postenPruefen({ bezeichnung: ' Herren  schnitt ', leistung_id: 'k', eigener_preis: 9, mwst_satz: null });
  assert.deepEqual(mitL, { ok: true, felder: { bezeichnung: 'Herren schnitt', leistung_id: 'k', eigener_preis: null, mwst_satz: 19 } });
});

test('Mitbewerber-Kennung: keine Telefonnummer, keine E-Mail, kein Link', () => {
  assert.equal(anbieterPruefen('Salon Innenstadt').ok, true);
  assert.equal(anbieterPruefen('Pizzeria Nr. 1').ok, true);
  assert.equal(anbieterPruefen('Salon 07031 123456').ok, false);
  assert.equal(anbieterPruefen('info@salon.de').ok, false);
  assert.equal(anbieterPruefen('www.salon.de').ok, false);
  assert.equal(anbieterPruefen('').ok, false);
  assert.equal(anbieterPruefen('x'.repeat(41)).ok, false);
});

test('Vergleich prüfen: Preis Pflicht, Link nur https, Datum nicht in der Zukunft, Entfernung 0–500', () => {
  const g = { anbieter: 'Mitbewerber A', preis: 29.9, ist_brutto: true, quelle: '', entfernung_km: 1.25, link: null, notiz: null };
  const r = vergleichPruefen({ ...g, am: '2027-01-01' }, HEUTE);
  assert.equal(r.ok, true);
  assert.equal(r.felder.erfasst_am, HEUTE);
  assert.equal(r.felder.quelle, 'Sonstige');
  assert.equal(r.felder.entfernung_km, 1.3);
  assert.equal(vergleichPruefen({ ...g, preis: null }, HEUTE).ok, false);
  assert.equal(vergleichPruefen({ ...g, link: 'http://x.de' }, HEUTE).ok, false);
  assert.equal(vergleichPruefen({ ...g, entfernung_km: 900 }, HEUTE).ok, false);
  assert.equal(vergleichPruefen({ ...g, anbieter: 'a@b.de' }, HEUTE).ok, false);
});

test('Netto erfasste Preise werden mit dem Steuersatz des Postens brutto', () => {
  assert.equal(bruttoVon(v('A', 100, HEUTE, false), 19), 119);
  assert.equal(bruttoVon(v('A', 100, HEUTE, false), 7), 107);
  assert.equal(bruttoVon(v('A', 100, HEUTE, true), 19), 100);
  assert.equal(bruttoVon(v('A', 0), 19), null);
});

test('Je Mitbewerber zählt nur der neueste aktuelle Eintrag; älter als 180 Tage zählt nicht', () => {
  const liste = [v('Salon A', 20, '2026-09-01'), v('salon  a', 25, '2026-10-01'), v('Salon B', 30, '2026-01-01')];
  const n = neuesteJeAnbieter(liste, HEUTE);
  assert.equal(n.length, 1);
  assert.equal(n[0].preis, 25);
  assert.equal(MAX_TAGE, 180);
});

test('Lage: unter 3 Mitbewerbern keine Aussage; dreimal derselbe zählt einmal', () => {
  const eigen = { netto: 25.21, brutto: 30, mwst: 19, je: 'je Leistung' };
  const l = spiegelLage(eigen, [v('A', 20), v('A', 22), v('A', 24), v('B', 30)], HEUTE);
  assert.equal(l.basis, 'zu_wenig');
  assert.equal(l.anbieter, 2);
  assert.equal(l.stufe, 'dim');
  assert.equal(MIN_VERGLEICHE, 3);
});

test('Lage: Mitte, Abweichung, Klasse, Farbe', () => {
  const liste = [v('A', 20), v('B', 25), v('C', 30), v('D', 35), v('E', 40)];
  const mk = (b) => ({ netto: b / 1.19, brutto: b, mwst: 19, je: 'je Leistung' });
  const mitte = spiegelLage(mk(30), liste, HEUTE);
  assert.equal(mitte.median, 30);
  assert.equal(mitte.q1, 25);
  assert.equal(mitte.q3, 35);
  assert.equal(mitte.abweichungProzent, 0);
  assert.equal(mitte.klasse, 'mitte');
  assert.equal(mitte.stufe, 'ok');
  const teuer = spiegelLage(mk(36), liste, HEUTE);
  assert.equal(teuer.abweichungProzent, 20);
  assert.equal(teuer.klasse, 'oben');
  assert.equal(teuer.stufe, 'warn');
  assert.equal(teuer.guenstiger, 4);
  const billig = spiegelLage(mk(19), liste, HEUTE);
  assert.equal(billig.klasse, 'unten');
  assert.equal(billig.stufe, 'info');
  assert.match(billig.text, /günstiger als alle/);
  assert.match(billig.text, /verschenken/);
  const ohne = spiegelLage(null, liste, HEUTE);
  assert.equal(ohne.basis, 'ok');
  assert.equal(ohne.abweichung, null);
  assert.match(ohne.text, /noch kein eigener Preis/);
});

test('Lage: netto erfasste Mitbewerber werden vor der Mitte umgerechnet', () => {
  const liste = [v('A', 100, HEUTE, false), v('B', 119), v('C', 119)];
  const l = spiegelLage({ netto: 100, brutto: 119, mwst: 19, je: 'je Leistung' }, liste, HEUTE);
  assert.equal(l.median, 119);
  assert.equal(l.min, 119);
  assert.equal(l.abweichungProzent, 0);
});

test('Übersicht und Sortierung', () => {
  const liste = [v('A', 20), v('B', 25), v('C', 30), v('D', 35), v('E', 40)];
  const mk = (b) => ({ netto: b, brutto: b, mwst: 0, je: 'x' });
  const lagen = [spiegelLage(mk(36), liste, HEUTE), spiegelLage(mk(19), liste, HEUTE), spiegelLage(null, [], HEUTE), spiegelLage(mk(30), [...liste, v('F', 1, '2025-01-01')], HEUTE)];
  const u = uebersicht(lagen);
  assert.deepEqual({ ...u }, { posten: 4, mitAussage: 3, unten: 1, mitte: 1, oben: 1, ohnePreis: 1, mittlereAbweichung: rundeErw((20 + (-36.666) + 0) / 3), veraltet: 1 });
  assert.deepEqual(lagen.map(rang), [1, 0, 2, 3]);
});
function rundeErw(x) { return Math.round(x * 10) / 10; }

test('Seite, Menü, Guide und SQL hängen zusammen', () => {
  const seite = lies('app/dashboard/leistungskatalog/preis-spiegel/page.tsx');
  assert.match(seite, /from '@\/lib\/preisSpiegel'/);
  assert.match(seite, /preis_spiegel_posten/);
  assert.match(seite, /preis_spiegel_vergleich/);
  assert.doesNotMatch(seite, /fetch\(/, 'kein Auslesen fremder Seiten');
  assert.match(lies('lib/rechte.ts'), /\/dashboard\/leistungskatalog\/preis-spiegel/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/leistungskatalog\/preis-spiegel'/);
  const sql = lies('supabase-sql/p331-preis-spiegel.sql');
  assert.match(sql, /create table if not exists public\.preis_spiegel_posten/);
  assert.match(sql, /create table if not exists public\.preis_spiegel_vergleich/);
  assert.match(sql, /p331_preis_spiegel_waechter/);
  assert.doesNotMatch(sql, /\bdrop table\b|\btruncate\b|\bdelete from\b/i);
});
