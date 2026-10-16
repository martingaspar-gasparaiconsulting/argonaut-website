import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { taktRunden, effektiverPreis, zeileNetto, pruefeLeistung, tarifAusKatalog, offeneJeKunde, sammelPosten, kundeSchluessel } from '../out/mengenAbrechnung.js';

// MO4 (16.10.2026) — Mengen-Abrechnung: Erfassung, Takt, Zuschlag, Sammelpositionen

test('Takt: Stunden auf den angefangenen Takt aufrunden, andere Einheiten nie', () => {
  assert.equal(taktRunden(1.1, 'Std', 15), 1.25);
  assert.equal(taktRunden(1.25, 'Std', 15), 1.25, 'genau auf dem Takt bleibt');
  assert.equal(taktRunden(0.2, 'Std', 30), 0.5);
  assert.equal(taktRunden(2.01, 'Std', 60), 3);
  assert.equal(taktRunden(1.1, 'km', 15), 1.1);
  assert.equal(taktRunden(1.1, 'Std', 0), 1.1);
});

test('Preis mit Zuschlag auf Cent, Zeile in Cent (Datenbank hat 2 Stellen)', () => {
  assert.equal(effektiverPreis('48', '25'), 60);
  assert.equal(effektiverPreis('0,60', ''), 0.6);
  assert.equal(effektiverPreis('33,33', '10'), 36.66);
  assert.equal(zeileNetto({ menge: 2.5, einzelpreis: 48, zuschlag_prozent: 0 }), 120);
  assert.equal(zeileNetto({ menge: '12', einzelpreis: '0,60', zuschlag_prozent: null }), 7.2);
});

test('Eingabe pruefen', () => {
  const h = '2026-10-16';
  const gut = { datum: '2026-10-15', kontakt_id: 'k1', bezeichnung: 'Mähen', menge: '2,5', einheit: 'ha', einzelpreis: '85', zuschlag_prozent: '', mwst_satz: '19' };
  const r = pruefeLeistung(gut, h);
  assert.equal(r.fehler, null);
  assert.equal(r.zeile.menge, 2.5); assert.equal(r.zeile.einzelpreis, 85); assert.equal(r.zeile.mwst_satz, 19); assert.equal(r.zeile.zuschlag_prozent, 0);
  assert.match(pruefeLeistung({ ...gut, datum: '2026-10-17' }, h).fehler, /Zukunft/);
  assert.match(pruefeLeistung({ ...gut, kontakt_id: '', empfaenger_name: '' }, h).fehler, /Kunden/);
  assert.match(pruefeLeistung({ ...gut, menge: '0' }, h).fehler, /Menge/);
  assert.match(pruefeLeistung({ ...gut, einheit: 'Liter' }, h).fehler, /Einheit/);
  assert.match(pruefeLeistung({ ...gut, einzelpreis: '' }, h).fehler, /Preis/);
  assert.equal(pruefeLeistung({ ...gut, einzelpreis: '0' }, h).fehler, null, '0 € ist erlaubt (Kulanz)');
  assert.match(pruefeLeistung({ ...gut, zuschlag_prozent: '400' }, h).fehler, /Zuschlag/);
  assert.equal(pruefeLeistung({ ...gut, mwst_satz: '0' }, h).zeile.mwst_satz, 0, '0 % bleibt 0');
  assert.equal(pruefeLeistung({ ...gut, einheit: 'Std', menge: '1,1', takt: 15 }, h).zeile.menge, 1.25);
});

test('Tarif aus dem Leistungskatalog', () => {
  assert.deepEqual(tarifAusKatalog({ bezeichnung: 'Baggerstunde', einheit: 'Std', einheitspreis_netto: null, stundensatz_netto: 95, mwst_satz: 19 }), { bezeichnung: 'Baggerstunde', einheit: 'Std', einzelpreis: '95', mwst_satz: '19' });
  assert.equal(tarifAusKatalog({ bezeichnung: 'Aushub', einheit: 'm³', einheitspreis_netto: '42.5' }).einzelpreis, '42,5');
  assert.equal(tarifAusKatalog({ bezeichnung: 'Pauschale', festpreis_netto: 150 }).einheit, 'Psch');
});

const rows = [
  { id: 'a', datum: '2026-10-02', kontakt_id: 'k1', bezeichnung: 'Mähen', menge: 2, einheit: 'ha', einzelpreis: 85, zuschlag_prozent: 0, mwst_satz: 19 },
  { id: 'b', datum: '2026-10-09', kontakt_id: 'k1', bezeichnung: 'mähen ', menge: 1.5, einheit: 'ha', einzelpreis: 85, zuschlag_prozent: 0, mwst_satz: 19 },
  { id: 'c', datum: '2026-10-10', kontakt_id: 'k1', bezeichnung: 'Mähen', menge: 1, einheit: 'ha', einzelpreis: 85, zuschlag_prozent: 25, mwst_satz: 19 },
  { id: 'd', datum: '2026-10-03', kontakt_id: 'k1', bezeichnung: 'Anfahrt', menge: 12, einheit: 'km', einzelpreis: 0.6, zuschlag_prozent: 0, mwst_satz: 19 },
  { id: 'e', datum: '2026-10-04', empfaenger_name: 'Herr Weber', bezeichnung: 'Mähen', menge: 1, einheit: 'ha', einzelpreis: 85, mwst_satz: 19 },
  { id: 'f', datum: '2026-09-04', kontakt_id: 'k1', bezeichnung: 'Alt', menge: 1, einheit: 'Std', einzelpreis: 50, mwst_satz: 19, abgerechnet: true, rechnung_id: 'r' },
];

test('Offene je Kunde: abgerechnete zaehlen nicht, Name als Kunde ohne Kontakt', () => {
  const o = offeneJeKunde(rows);
  assert.equal(o.length, 2);
  const k1 = o.find((x) => x.kontakt_id === 'k1');
  assert.equal(k1.anzahl, 4);
  assert.equal(k1.netto, 170 + 127.5 + 106.25 + 7.2);
  assert.deepEqual([k1.von, k1.bis], ['2026-10-02', '2026-10-10']);
  assert.equal(kundeSchluessel({ empfaenger_name: ' Herr Weber ' }), 'n:herr weber');
});

test('Sammelpositionen: gleiche Leistung + Preis zusammen, Zuschlag getrennt, Summe stimmt', () => {
  const p = sammelPosten(rows.filter((r) => r.kontakt_id === 'k1' && !r.abgerechnet));
  assert.equal(p.length, 3);
  const maehen = p.find((x) => x.einzelpreis === 85);
  assert.equal(maehen.menge, 3.5);
  assert.match(maehen.bezeichnung, /^Mähen \(02\.10\.2026–09\.10\.2026, 2 Einsätze\)$/);
  const zuschlag = p.find((x) => x.einzelpreis === 106.25);
  assert.match(zuschlag.bezeichnung, /inkl\. 25 % Zuschlag/);
  const summe = p.reduce((s, x) => s + x.gesamt_netto, 0);
  assert.equal(Math.round(summe * 100), Math.round((297.5 + 106.25 + 7.2) * 100));
  for (const x of p) assert.equal(x.gesamt_netto, Math.round(x.menge * x.einzelpreis * 100) / 100, 'Zeile = Menge × Preis');
  assert.ok(sammelPosten(rows.slice(0, 2), true).every((x) => x.mwst_satz === 0), 'Kleinunternehmer 0 %');
});

test('Waechter: Route nach Muster, Seite nutzt die Logik, SQL additiv', () => {
  const route = fs.readFileSync(new URL('../app/api/rechnung-aus-mengen/route.ts', import.meta.url), 'utf8');
  assert.match(route, /sammelPosten\(/);
  assert.match(route, /kopfSummen\(/);
  assert.match(route, /kleinunternehmer/);
  assert.match(route, /kunden\.size !== 1/);
  const seite = fs.readFileSync(new URL('../app/dashboard/mengen/page.tsx', import.meta.url), 'utf8');
  assert.match(seite, /pruefeLeistung\(/);
  const sql = fs.readFileSync(new URL('../supabase-sql/p396-mengen-leistung.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\bdelete\s+from\b/i);
});
