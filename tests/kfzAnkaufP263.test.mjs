// ============================================================================
// tests/kfzAnkaufP263.test.mjs — Paket 263 (07.10.2026) · K4 Ankauf und Bewertung (Teil 1)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PRUEFPUNKTE, PRUEF_KEYS, pruefBereinigen, pruefStand, RICHTWERTE_START, SCHADEN_ARTEN, richtwerteMit,
  schadenBereinigen, schadenKosten, schadenSumme, besteuerungAus, bewertung, angebotAmpel, naechsteAnkaufNr,
  zuBestand, schadenFotoPfad,
} from '../out/kfzAnkauf.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Prüfprotokoll: 24 eindeutige Punkte, nur ok/mangel zählen, Fremdes fliegt raus', () => {
  assert.equal(PRUEFPUNKTE.length, 4);
  assert.equal(PRUEF_KEYS.length, 24);
  assert.equal(new Set(PRUEF_KEYS).size, 24);
  assert.deepEqual(pruefBereinigen({ lack: 'ok', motor: 'mangel', zb2: 'vielleicht', hack: 'ok' }), { lack: 'ok', motor: 'mangel' });
  assert.deepEqual(pruefBereinigen(null), {});
  assert.deepEqual(pruefBereinigen(['ok']), {});
  const st = pruefStand({ lack: 'ok', motor: 'mangel', bremsen: 'ok' });
  assert.equal(st.ok, 2); assert.equal(st.mangel, 1); assert.equal(st.offen, 21); assert.equal(st.prozent, 13);
});

test('Richtwerte: Startwerte für jede Schadensart, Betrieb überschreibt nur gültige Zahlen', () => {
  for (const a of SCHADEN_ARTEN) {
    const r = RICHTWERTE_START[a.key];
    assert.ok(r && r.length === 3, a.key);
    assert.ok(r[0] <= r[1] && r[1] <= r[2], `${a.key} steigt mit der Stärke`);
  }
  const rw = richtwerteMit({ kratzer: [100, null, -5], erfunden: [1, 2, 3], delle: 'kaputt' });
  assert.deepEqual(rw.kratzer, [100, 250, 450]);
  assert.equal(rw.erfunden, undefined);
  assert.deepEqual(rw.delle, RICHTWERTE_START.delle);
  assert.deepEqual(RICHTWERTE_START.kratzer, [80, 250, 450], 'Startwerte bleiben unverändert');
  assert.deepEqual(richtwerteMit({ glas: [0, 0, 0] }).glas, [0, 0, 0], 'null Euro ist erlaubt');
});

test('Schäden: bereinigen, eigener Betrag gewinnt, Summe centgenau', () => {
  const s = schadenBereinigen([
    { id: 'a', bereich: 'Tür vorn links', art: 'kratzer', stufe: 'mittel', kosten: null, fotos: ['b/ankauf/x/1.webp', '../boese'] },
    { id: 'b', art: 'delle', stufe: 'stark', kosten: '199.995' },
    { art: 'gibtsnicht', stufe: 'riesig', kosten: -3 },
    'kaputt',
  ]);
  assert.equal(s.length, 3);
  assert.deepEqual(s[0].fotos, ['b/ankauf/x/1.webp'], 'Pfade mit .. fliegen raus');
  assert.equal(s[2].art, 'kratzer'); assert.equal(s[2].stufe, 'leicht'); assert.equal(s[2].kosten, null);
  const rw = richtwerteMit(null);
  assert.equal(schadenKosten(s[0], rw), 250);
  assert.equal(schadenKosten(s[1], rw), 200, 'eigener Betrag, auf Cent gerundet');
  assert.equal(schadenSumme(s, rw), 530);
  assert.equal(schadenSumme([{ art: 'kratzer', stufe: 'leicht', kosten: 0.1 }, { art: 'kratzer', stufe: 'leicht', kosten: 0.2 }], rw), 0.3);
  assert.equal(schadenBereinigen('x').length, 0);
});

test('Bewertung § 25a: EK = VK − (Kosten + Marge) × 1,19, abgerundet auf 10 €', () => {
  const b = bewertung({ zielVk: 20000, schaeden: 530, aufbereitung: 300, sonstige: 170, standtagePlan: 30, standkostenTag: 10, marge: 1500, verkaeuferArt: 'privat' });
  assert.equal(b.besteuerung, '25a');
  assert.equal(b.standkosten, 300);
  assert.equal(b.kosten, 1300);
  // 20000 − 2800 × 1,19 = 16668 -> 16660
  assert.equal(b.maxAnkauf, 16660);
  assert.equal(b.maxAnkaufBrutto, null);
  assert.equal(b.lohntSich, true);
  // Probe: bei EK 16668 bleibt genau die Marge
  const ek = 16668, vk = 20000;
  const gewinn = vk - (vk - ek) * 19 / 119 - ek - 1300;
  assert.ok(Math.abs(gewinn - 1500) < 0.01);
  assert.equal(bewertung({ zielVk: 20000, schaeden: 0, aufbereitung: 0, sonstige: 0, standtagePlan: 0, standkostenTag: 0, marge: 0, verkaeuferArt: 'gewerblich_25a' }).besteuerung, '25a');
});

test('Bewertung Regelsteuer: EK netto = VK ÷ 1,19 − Kosten − Marge, brutto dazu', () => {
  const b = bewertung({ zielVk: 23800, schaeden: 1000, aufbereitung: null, sonstige: null, standtagePlan: null, standkostenTag: 15, marge: 2000, verkaeuferArt: 'gewerblich' });
  assert.equal(b.besteuerung, 'regel');
  assert.equal(b.maxAnkauf, 17000);
  assert.equal(b.maxAnkaufBrutto, 20230);
  assert.equal(besteuerungAus('gewerblich'), 'regel');
  assert.equal(besteuerungAus(null), '25a');
});

test('Bewertung erfindet nichts: ohne Verkaufspreis null, ohne Marge 0 statt negativ', () => {
  const ohne = bewertung({ zielVk: null, schaeden: 500, aufbereitung: 0, sonstige: 0, standtagePlan: 0, standkostenTag: 0, marge: 0, verkaeuferArt: 'privat' });
  assert.equal(ohne.maxAnkauf, null); assert.equal(ohne.lohntSich, null);
  const teuer = bewertung({ zielVk: 1000, schaeden: 2000, aufbereitung: 0, sonstige: 0, standtagePlan: 0, standkostenTag: 0, marge: 500, verkaeuferArt: 'privat' });
  assert.equal(teuer.maxAnkauf, 0); assert.equal(teuer.lohntSich, false);
  assert.match(teuer.rechenweg.join(' '), /keine Marge/);
  const neg = bewertung({ zielVk: 10000, schaeden: -500, aufbereitung: -1, sonstige: NaN, standtagePlan: -3, standkostenTag: 10, marge: -9, verkaeuferArt: 'privat' });
  assert.equal(neg.kosten, 0, 'negative Eingaben zählen als 0');
  assert.equal(neg.maxAnkauf, 10000);
});

test('Angebots-Ampel', () => {
  assert.equal(angebotAmpel(null, 10000).stufe, 'dim');
  assert.equal(angebotAmpel(9000, null).stufe, 'dim');
  assert.equal(angebotAmpel(9000, 10000).stufe, 'ok');
  assert.equal(angebotAmpel(10000, 10000).stufe, 'ok');
  assert.equal(angebotAmpel(10500, 10000).stufe, 'warn');
  assert.equal(angebotAmpel(10501, 10000).stufe, 'bad');
  assert.equal(angebotAmpel(500, 0).stufe, 'bad');
});

test('Nummern und Übernahme in den Bestand', () => {
  assert.equal(naechsteAnkaufNr([]), 'A-0001');
  assert.equal(naechsteAnkaufNr(['A-0009', 'F-0100', null, 'A-0003']), 'A-0010');
  const basis = {
    nr: 'A-0007', marke: 'BMW', modell: '320d', variante: null, fin: 'WBA8E9C50GK123456', kennzeichen: 'BB-AB 123', erstzulassung: '2019-03-01',
    km_stand: 88000, leistung_kw: 140, kraftstoff: 'Diesel', farbe: 'Schwarz', vorbesitzer: 2, hu_bis: '2027-03-31',
    unfall_angabe: 'ja', unfall_text: 'Parkrempler hinten', verkaeufer_art: 'privat', ankaufpreis: 14000.004, ziel_vk: 18990, schaeden: [], aufbereitung: 0,
  };
  const d = zuBestand(basis, '2026-10-07T10:00:00Z');
  assert.equal(d.status, 'bestand');
  assert.equal(d.besteuerung, '25a');
  assert.equal(d.ek_netto, 14000);
  assert.equal(d.vk_brutto, 18990);
  assert.equal(d.eingang_am, '2026-10-07');
  assert.equal(d.vorschaden, 'ja');
  assert.equal(d.vorschaden_text, 'Parkrempler hinten');
  assert.equal(d.notiz, 'Aus Ankauf A-0007');
  assert.equal(d.owner_user_id, undefined, 'Besitzer setzt die Seite bzw. die Datenbank');
  const mitSchaden = zuBestand({ ...basis, schaeden: [{ art: 'kratzer' }], unfall_angabe: null, verkaeufer_art: 'gewerblich' }, '2026-10-07');
  assert.equal(mitSchaden.status, 'aufbereitung');
  assert.equal(mitSchaden.vorschaden, 'unbekannt', 'nicht erfragt wird nie zu „keine bekannt"');
  assert.equal(mitSchaden.vorschaden_text, null);
  assert.equal(mitSchaden.besteuerung, 'regel');
  assert.equal(zuBestand({ ...basis, aufbereitung: 200 }, '2026-10-07').status, 'aufbereitung');
  assert.equal(zuBestand({ ...basis, unfall_angabe: 'keine_bekannt' }, '2026-10-07').vorschaden, 'keine_bekannt');
});

test('Schadenfoto-Pfad: erster Ordner = Betrieb (Speicher-Regeln P262), nichts Fremdes', () => {
  const b = '11111111-1111-1111-1111-111111111111', a = '22222222-2222-2222-2222-222222222222';
  assert.equal(schadenFotoPfad(b, a, 'webp', 1700000000000, 'ab12'), `${b}/ankauf/${a}/1700000000000-ab12.webp`);
  assert.equal(schadenFotoPfad('../x', a, 'jpg', 1, 'z'), null);
  assert.equal(schadenFotoPfad(b, 'a/b', 'jpg', 1, 'z'), null);
  assert.match(schadenFotoPfad(b, a, '.J/PG', 1, '../z'), /\/1-z\.jpg$/);
});

test('Verdrahtung: SQL, Seiten, Menü, Hub, Guide', () => {
  const sql = lies('supabase-sql/p263-kfz-ankauf.sql');
  assert.match(sql, /create table if not exists public\.kfz_ankauf/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /p181_besitzer/);
  assert.doesNotMatch(sql, /drop table|delete from|truncate/i, 'nie destruktiv');
  assert.doesNotMatch(sql, /^\s+(ausweis_?n(r|ummer)|personalausweis\w*)\s/im, 'keine Spalte für Ausweisnummern');
  assert.match(sql, /ausweis_geprueft\s+boolean/);
  assert.doesNotMatch(sql, /p181_ma_delete|for delete/, 'Mitarbeiter löschen keine Ankäufe');
  const akte = lies('app/dashboard/kfz/ankauf/[id]/page.tsx');
  assert.match(akte, /FotoMarkierung/);
  assert.match(akte, /zuBestand\(/);
  assert.match(akte, /schadenFotoPfad\(/);
  assert.doesNotMatch(akte, /window\.confirm|alert\(/, 'Rückfragen in der Seite');
  assert.match(lies('lib/rechte.ts'), /href: '\/dashboard\/kfz\/ankauf'/);
  assert.match(lies('app/dashboard/kfz/page.tsx'), /\/dashboard\/kfz\/ankauf/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/kfz\/ankauf': \{/);
  const logik = lies('lib/kfzAnkauf.ts');
  assert.doesNotMatch(logik, /Math\.round\([^)]*\* ?100\) ?\/ ?100/, 'Rundungs-Wächter');
  assert.doesNotMatch(logik, /Date\.now\(\)/);
});
