// Paket 302 (10.10.2026): J1 Jobticket, Dienstrad, Mobilitätszuschuss
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  leistungPruefen, kostenJeMonat, fristAmpel, aktiv, erinnerungsTag, lohnListe, lohnCsv, monate, imMonat, centText,
} from '../out/mobilitaet.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const H = '2026-10-10';
const MA = '11111111-1111-4111-8111-111111111111';
const basis = { mitarbeiterId: MA, name: ' Anna  Muster ', art: 'jobticket', betrag: '29,00', turnus: 'monatlich', beginn: '2026-01-01', behandlung: 'offen', heute: H };

test('Leistung prüfen: Pflichtangaben, Beträge in Cent, Laufzeit', () => {
  const ok = leistungPruefen({ ...basis, eigenanteil: '1.234,56', ende: '2026-12-31', nachweis: ' Abo ' });
  assert.equal(ok.ok, true);
  assert.equal(ok.zeile.person_name, 'Anna Muster');
  assert.equal(ok.zeile.betrag_cent, 2900);
  assert.equal(ok.zeile.eigenanteil_cent, 123456);
  assert.equal(ok.zeile.nachweis, 'Abo');
  assert.equal(ok.zeile.mitarbeiter_id, MA);
  assert.equal(leistungPruefen({ ...basis, betrag: '4,395' }).zeile.betrag_cent, 440, 'halber Cent wird aufgerundet');
  assert.equal(leistungPruefen({ ...basis, name: 'A' }).ok, false);
  assert.equal(leistungPruefen({ ...basis, art: 'auto' }).ok, false);
  assert.equal(leistungPruefen({ ...basis, turnus: 'jaehrlich' }).ok, false);
  assert.equal(leistungPruefen({ ...basis, betrag: '' }).ok, false, 'Betrag Pflicht');
  assert.equal(leistungPruefen({ ...basis, betrag: 'abc' }).ok, false);
  assert.equal(leistungPruefen({ ...basis, betrag: '-5' }).ok, false);
  assert.equal(leistungPruefen({ ...basis, betrag: '0' }).ok, false, '0 + 0');
  assert.equal(leistungPruefen({ ...basis, betrag: '0', eigenanteil: '40' }).ok, true, 'reine Gehaltsumwandlung');
  assert.equal(leistungPruefen({ ...basis, betrag: '5000,01' }).ok, false, 'über 5.000 €');
  assert.equal(leistungPruefen({ ...basis, ende: '2025-12-31' }).ok, false, 'Ende vor Beginn');
  assert.equal(leistungPruefen({ ...basis, ende: '2026-02-30' }).ok, false, 'kein Datum');
  assert.equal(leistungPruefen({ ...basis, beginn: '' }).ok, false);
  assert.equal(leistungPruefen({ ...basis, turnus: 'einmalig', ende: '2026-02-01' }).ok, false, 'einmalig ohne Ende');
  assert.equal(leistungPruefen({ ...basis, mitarbeiterId: 'x' }).zeile.mitarbeiter_id, null);
});

test('Lohn-Hinweis: steuerfrei/pauschal nur mit Bestätigung des Steuerberaters', () => {
  assert.equal(leistungPruefen({ ...basis, behandlung: 'steuerfrei' }).ok, false);
  assert.equal(leistungPruefen({ ...basis, behandlung: 'pauschal', stbAm: '2026-10-11' }).ok, false, 'Zukunft');
  const ok = leistungPruefen({ ...basis, behandlung: 'pauschal', stbAm: '2026-09-01', stbName: 'Kanzlei X' });
  assert.equal(ok.ok, true);
  assert.equal(ok.zeile.stb_bestaetigt_am, '2026-09-01');
  assert.equal(ok.zeile.stb_name, 'Kanzlei X');
  const offen = leistungPruefen({ ...basis, stbAm: '2026-09-01', stbName: 'X' });
  assert.equal(offen.zeile.stb_bestaetigt_am, null, 'offen speichert keine Bestätigung (wie DB)');
  assert.equal(offen.zeile.stb_name, null);
  assert.equal(leistungPruefen({ ...basis, behandlung: 'freibetrag' }).ok, false);
});

test('Kosten je Monat: Laufzeit, einmalig, Eigenanteil, je Art', () => {
  const L = [
    { person_name: 'A', art: 'jobticket', betrag_cent: 2900, eigenanteil_cent: 0, turnus: 'monatlich', beginn: '2026-03-15', ende: '2026-05-10', lohn_behandlung: 'offen' },
    { person_name: 'B', art: 'dienstrad', betrag_cent: 1000, eigenanteil_cent: 4500, turnus: 'monatlich', beginn: '2026-01-01', ende: null, lohn_behandlung: 'pauschal' },
    { person_name: 'C', art: 'fahrtkosten', betrag_cent: 20000, eigenanteil_cent: 0, turnus: 'einmalig', beginn: '2026-04-30', ende: null, lohn_behandlung: 'offen' },
  ];
  const k = kostenJeMonat(L, '2026-02-10', '2026-06-01');
  assert.deepEqual(k.map((x) => x.monat), ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']);
  assert.deepEqual(k.map((x) => x.betrieb_cent), [1000, 3900, 23900, 3900, 1000]);
  assert.equal(k[2].jeArt.fahrtkosten, 20000);
  assert.equal(k[2].jeBehandlung.offen, 22900);
  assert.equal(k[2].eigen_cent, 4500);
  assert.equal(k[2].anzahl, 3);
  assert.equal(monate('2026-11-05', '2027-02-01').length, 4, 'über den Jahreswechsel');
  assert.equal(monate('2020-01-01', '2030-01-01').length, 60, 'höchstens 60');
  assert.equal(imMonat(L[0], '2026-06-01'), false);
});

test('Fristen-Ampel und Erinnerung', () => {
  const l = { turnus: 'monatlich', ende: '2026-11-05', nachweis_bis: '2027-03-01' };
  assert.deepEqual(fristAmpel(l, H), { stufe: 'bald', tage: 26, was: 'laufzeit' });
  assert.equal(fristAmpel({ ...l, ende: '2026-10-09' }, H).stufe, 'abgelaufen');
  assert.equal(fristAmpel({ ...l, ende: null }, H).was, 'nachweis');
  assert.equal(fristAmpel({ ...l, ende: null }, H).stufe, 'ok');
  assert.equal(fristAmpel({ ...l, ende: null, nachweis_bis: '2026-11-09' }, H).stufe, 'bald', '30 Tage ist noch bald');
  assert.equal(fristAmpel({ ...l, ende: null, nachweis_bis: '2026-11-10' }, H).stufe, 'ok', '31 Tage');
  assert.equal(fristAmpel({ turnus: 'monatlich', ende: null, nachweis_bis: null }, H).stufe, 'keine');
  assert.equal(fristAmpel({ turnus: 'einmalig', ende: '2026-10-01', nachweis_bis: null }, H).stufe, 'keine', 'einmalig hat keine Laufzeit');
  assert.equal(erinnerungsTag('2026-12-31', H), '2026-12-01');
  assert.equal(erinnerungsTag('2026-10-20', H), H, 'nie in der Vergangenheit');
  const m = { turnus: 'monatlich', beginn: '2026-01-01', ende: '2026-10-10' };
  assert.equal(aktiv(m, H), true);
  assert.equal(aktiv({ ...m, ende: '2026-10-09' }, H), false);
  assert.equal(aktiv({ ...m, beginn: '2026-10-11', ende: null }, H), false);
  assert.equal(aktiv({ turnus: 'einmalig', beginn: '2026-10-01', ende: null }, H), true);
});

test('Liste und CSV für die Lohnabrechnung', () => {
  const L = [
    { person_name: 'Zora', art: 'jobticket', betrag_cent: 2900, eigenanteil_cent: 0, turnus: 'monatlich', beginn: '2026-01-01', ende: null, lohn_behandlung: 'steuerfrei', stb_bestaetigt_am: '2026-01-05' },
    { person_name: 'Ärne; "B"', art: 'dienstrad', betrag_cent: 123456, eigenanteil_cent: 5, turnus: 'monatlich', beginn: '2026-01-01', ende: null, lohn_behandlung: 'offen' },
    { person_name: 'Weg', art: 'dienstrad', betrag_cent: 100, eigenanteil_cent: 0, turnus: 'monatlich', beginn: '2026-01-01', ende: '2026-09-30', lohn_behandlung: 'offen' },
  ];
  const z = lohnListe(L, '2026-10-01');
  assert.deepEqual(z.map((x) => x.person), ['Ärne; "B"', 'Zora']);
  const csv = lohnCsv(z, '2026-10-01').split('\r\n');
  assert.equal(csv.length, 3);
  assert.match(csv[0], /^Monat;Mitarbeiter;/);
  assert.equal(csv[1], '2026-10;"Ärne; ""B""";Dienstrad;1234,56;0,05;Mit Steuerberater klären;');
  assert.equal(csv[2], '2026-10;Zora;Jobticket / Deutschlandticket;29,00;0,00;Steuerfrei (laut Steuerberater);2026-01-05');
  assert.equal(centText(0), '0,00');
  assert.equal(centText(-150), '-1,50');
});

test('Code: keine Steuer-Pauschalen, DB-Regel, Menü, Hilfe, Link', () => {
  const lib = lies('lib/mobilitaet.ts');
  assert.doesNotMatch(lib, /\b(50 ?€|15 ?%|25 ?%|0,30|0,38|44 ?€|50 Euro)\b/, 'keine Steuersätze/Freigrenzen im Code');
  const sql = lies('supabase-sql/p302-mobilitaet.sql');
  assert.match(sql, /lohn_behandlung = 'offen' or stb_bestaetigt_am is not null/);
  assert.match(sql, /darf_ich_modul_aendern\('personal'\)/);
  assert.doesNotMatch(sql, /for delete to authenticated/, 'Löschen nur über die Chef-Regel');
  assert.match(lies('lib/rechte.ts'), /href: '\/dashboard\/personal\/mobilitaet'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/personal\/mobilitaet': \{/);
  assert.match(lies('app/dashboard/personal/page.tsx'), /\/dashboard\/personal\/mobilitaet/);
  const seite = lies('app/dashboard/personal/mobilitaet/page.tsx');
  assert.doesNotMatch(seite, /toFixed\(/);
  assert.doesNotMatch(seite, /KI-Agent/);
});
