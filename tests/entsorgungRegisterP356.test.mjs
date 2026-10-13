// ============================================================================
// tests/entsorgungRegisterP356.test.mjs — Paket 356 (13.10.2026)
// A4c Fachpaket Entsorgung, Teil 2: Abfallregister und ADR-Beförderungspapier.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  verfahrenLesen, mengeLesen, mengeText, inKg, nummernLesen, eintragPruefen, ausWiegeschein as regAusWiegeschein, offeneScheine, summen, csvZelle, registerCsv, registerHtml,
} from '../out/abfallRegister.js';
import {
  unLesen, nebengefahrLesen, punkteMengeLesen, positionPruefen, positionZeile, punkteRechnen, papierPruefen, ausWiegeschein as adrAusWiegeschein, adrHtml, zahlDe, KATEGORIEN,
} from '../out/adrPapier.js';
import { START_FREIGABE, startFrei } from '../out/startSperre.js';
import { START_INFO } from '../out/freigabeZentrale.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentar = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const NR = { erzeuger_nr: 'E12345678', befoerderer_nr: '', entsorger_nr: 'ENT999' };
const E = (id, datum, extra = {}) => ({
  id, datum, richtung: 'annahme', abfall_schluessel_id: 's1', abfall_schluessel: '170904', abfall_bezeichnung: 'Bauabfall', gefaehrlich: false, menge: 1000, einheit: 'kg',
  erzeuger: 'Bau Meier', erzeuger_nr: null, befoerderer: null, befoerderer_nr: null, entsorger: 'Muster', entsorger_nr: 'ENT999', nachweis_nr: null, schein_nr: null,
  verfahren: 'R5', kennzeichen: 'BB-1', wiegeschein_id: null, notiz: null, status: 'gueltig', storno_grund: null, storniert_am: null, erfasst_am: datum + 'T08:00:00Z', erfasst_name: 'Max', ...extra,
});
const POS = { un_nr: '2212', benennung: 'ASBEST, AMPHIBOL', klasse: '9', vg: 'II', tunnel: 'E', versandstuecke: '2 Big Bags', menge: '800 kg', kategorie: '3', menge_punkte: 800, abfall: true, umwelt: false };

test('Register: Verfahren, Menge, Einheiten wie die Datenbank', () => {
  assert.equal(verfahrenLesen('r 5'), 'R5');
  assert.equal(verfahrenLesen('D15'), 'D15');
  assert.equal(verfahrenLesen('R13'), 'R13');
  assert.equal(verfahrenLesen('R14'), undefined);
  assert.equal(verfahrenLesen('D16'), undefined);
  assert.equal(verfahrenLesen('X1'), undefined);
  assert.equal(verfahrenLesen(''), null);
  assert.equal(mengeLesen('2,5'), 2.5);
  assert.equal(mengeLesen('1.234,567'), 1234.567);
  assert.equal(mengeLesen('1,2345'), undefined, 'höchstens drei Nachkommastellen');
  assert.equal(mengeLesen('0'), undefined);
  assert.equal(mengeLesen(''), null);
  assert.equal(mengeText(4000, 'kg'), '4.000 kg');
  assert.equal(mengeText(2.5, 't'), '2,5 t');
  assert.equal(mengeText(12, 'm3'), '12 m³');
  assert.equal(inKg(2.5, 't'), 2500);
  assert.equal(inKg(3, 'm3'), null);
  assert.deepEqual(nummernLesen({ erzeuger_nr: ' e123 ', fremd: 1 }), { erzeuger_nr: 'E123', befoerderer_nr: '', entsorger_nr: '' });
});

test('Register: Prüfung vor dem Speichern, Hinweise bei gefährlichem Abfall', () => {
  const g = { datum: '2026-10-13', richtung: 'annahme', abfall_schluessel_id: 's1', menge: '4000', einheit: 'kg', verfahren: 'r5' };
  const ok = eintragPruefen(g, '2026-10-13');
  assert.equal(ok.ok, true);
  assert.equal(ok.verfahren, 'R5');
  assert.deepEqual(ok.hinweise, []);
  assert.match(eintragPruefen({ ...g, datum: '2026-10-14' }, '2026-10-13').fehler.join(' '), /Zukunft/);
  assert.match(eintragPruefen({ ...g, abfall_schluessel_id: null }, '2026-10-13').fehler.join(' '), /Abfallschlüssel/);
  assert.match(eintragPruefen({ ...g, verfahren: 'R14' }, '2026-10-13').fehler.join(' '), /R1 bis R13/);
  assert.match(eintragPruefen({ ...g, erzeuger_nr: 'X'.repeat(21) }, '2026-10-13').fehler.join(' '), /Erzeugernummer/);
  const gef = eintragPruefen(g, '2026-10-13', true);
  assert.equal(gef.ok, true, 'gefährlich sperrt nicht');
  assert.equal(gef.hinweise.length, 2);
});

test('Register: Übernahme aus dem Wiegeschein (Annahme vs. Abgabe) und offene Scheine', () => {
  const w = { id: 'w1', richtung: 'eingang', abgeschlossen_am: '2026-10-12T22:30:00Z', netto_kg: 8220, abfall_schluessel_id: 's1', kunde_name: 'Bau Meier', kennzeichen: 'BB-1', herkunft: 'Baustelle Hauptstr.' };
  const a = regAusWiegeschein(w, NR, 'Muster GmbH');
  assert.equal(a.datum, '2026-10-13', 'Berliner Abschlusstag');
  assert.equal(a.richtung, 'annahme');
  assert.equal(a.menge, '8220');
  assert.equal(a.erzeuger, 'Bau Meier, Baustelle Hauptstr.');
  assert.equal(a.entsorger, 'Muster GmbH');
  assert.equal(a.entsorger_nr, 'ENT999');
  assert.equal(a.erzeuger_nr, '');
  const b = regAusWiegeschein({ ...w, richtung: 'ausgang' }, NR, 'Muster GmbH');
  assert.equal(b.richtung, 'abgabe');
  assert.equal(b.erzeuger, 'Muster GmbH');
  assert.equal(b.erzeuger_nr, 'E12345678');
  assert.equal(b.entsorger, 'Bau Meier, Baustelle Hauptstr.');
  const scheine = [{ id: 'w1', status: 'abgeschlossen', netto_kg: 1 }, { id: 'w2', status: 'abgeschlossen', netto_kg: 2 }, { id: 'w3', status: 'offen', netto_kg: null }, { id: 'w4', status: 'abgeschlossen', netto_kg: 4 }];
  const off = offeneScheine(scheine, [{ wiegeschein_id: 'w1', status: 'gueltig' }, { wiegeschein_id: 'w4', status: 'storniert' }]);
  assert.deepEqual(off.map((x) => x.id), ['w2', 'w4'], 'storniert zählt nicht als erledigt');
});

test('Register: Summen je Schlüssel (t in kg, ohne Storno, nur Zeitraum)', () => {
  const s = summen([
    E('1', '2026-01-10'), E('2', '2026-02-10', { menge: 2.5, einheit: 't' }), E('3', '2026-02-11', { status: 'storniert' }),
    E('4', '2026-02-12', { menge: 10, einheit: 'm3' }), E('5', '2025-12-31'), E('6', '2026-03-01', { abfall_schluessel: '170605*', gefaehrlich: true, menge: 50 }),
  ], '2026-01-01', '2026-12-31');
  assert.equal(s.length, 2);
  assert.equal(s[0].schluessel, '170605*');
  assert.equal(s[1].kg, 3500);
  assert.deepEqual(s[1].sonst, [{ menge: 10, einheit: 'm3' }]);
  assert.equal(s[1].anzahl, 3);
});

test('Register: CSV mit BOM, Semikolon, Formel-Schutz; Druck mit Storno-Grund', () => {
  assert.equal(csvZelle('=SUMME(A1)'), "'=SUMME(A1)");
  assert.equal(csvZelle('-5'), "'-5");
  assert.equal(csvZelle('a;b'), '"a;b"');
  assert.equal(csvZelle('x"y'), '"x""y"');
  const c = registerCsv([E('1', '2026-01-10', { erzeuger: '=HYPERLINK("x")', menge: 2.5, einheit: 't' })]);
  assert.ok(c.startsWith('﻿Datum;Richtung;Abfallschlüssel'));
  assert.match(c, /10\.01\.2026;Annahme;17 09 04;Bauabfall;nein;2,5;t;"'=HYPERLINK\(""x""\)"/);
  const h = registerHtml([E('1', '2026-01-10', { erzeuger: 'A <b>' }), E('2', '2026-01-11', { status: 'storniert', storno_grund: 'falsche Menge' })], '2026-01-01', '2026-01-31',
    { name: 'Muster GmbH', strasse: 'Hof 1', plz: '71032', ort: 'Böblingen', telefon: null, email: null }, NR, '2026-10-13T10:00:00Z');
  assert.match(h, /Abfallregister/);
  assert.match(h, /Erzeugernummer E12345678/);
  assert.match(h, /storniert.*falsche Menge/);
  assert.match(h, /A &lt;b&gt;/);
  assert.match(h, /1\.000 kg/);
  assert.match(h, /übermittelt nichts/);
});

test('ADR: UN-Nummer, Nebengefahren, Pflichtangaben wie die Datenbank', () => {
  assert.equal(unLesen('UN 1203'), '1203');
  assert.equal(unLesen('un1203'), '1203');
  assert.equal(unLesen('123'), null);
  assert.equal(nebengefahrLesen('(6.1, 8)'), '6.1, 8');
  assert.equal(nebengefahrLesen('10'), undefined);
  assert.equal(nebengefahrLesen(''), null);
  assert.deepEqual(positionPruefen(POS, 1), []);
  assert.match(positionPruefen({ ...POS, un_nr: '221' }, 1).join(' '), /UN-Nummer/);
  assert.match(positionPruefen({ ...POS, klasse: '10' }, 1).join(' '), /Klasse/);
  assert.match(positionPruefen({ ...POS, klasse: '4' }, 1).join(' '), /Klasse/, '4 allein gibt es nicht (4.1–4.3)');
  assert.match(positionPruefen({ ...POS, tunnel: 'X' }, 1).join(' '), /Tunnel/);
  assert.match(positionPruefen({ ...POS, kategorie: '2', menge_punkte: null }, 1).join(' '), /Punkte/);
  assert.deepEqual(positionPruefen({ ...POS, kategorie: '4', menge_punkte: null }, 1), [], 'Kategorie 4 braucht keine Punkte-Menge');
  assert.match(papierPruefen({ datum: '2026-10-13', absender: 'A', empfaenger: 'B' }, [], true).join(' '), /mindestens eine/);
  assert.deepEqual(papierPruefen({ datum: '2026-10-13', absender: 'A', empfaenger: 'B' }, [], false), [], 'Entwurf ohne Positionen geht');
  assert.equal(punkteMengeLesen('1.000,5'), 1000.5);
  assert.equal(punkteMengeLesen('-1'), undefined);
});

test('ADR: Zeile in der Reihenfolge von 5.4.1.1.1 (ABFALL, Nebengefahr, VG, Tunnel, UMWELTGEFÄHRDEND)', () => {
  assert.equal(positionZeile({ un_nr: '1203', benennung: 'BENZIN', klasse: '3', vg: 'II', tunnel: 'D/E', versandstuecke: '', menge: '' }), 'UN 1203 BENZIN, 3, II, (D/E)');
  assert.equal(positionZeile(POS), 'ABFALL UN 2212 ASBEST, AMPHIBOL, 9, II, (E)');
  assert.equal(positionZeile({ un_nr: 'UN1993', benennung: 'ENTZÜNDBARER FLÜSSIGER STOFF, N.A.G.', klasse: '3', nebengefahr: '6.1', vg: 'III', tunnel: '-', umwelt: true, versandstuecke: '', menge: '' }),
    'UN 1993 ENTZÜNDBARER FLÜSSIGER STOFF, N.A.G., 3 (6.1), III, UMWELTGEFÄHRDEND', 'Tunnelcode „-" erscheint nicht');
});

test('ADR: 1000-Punkte-Rechnung (Faktoren 50/3/1/0, Kategorie 0, ohne Kategorie)', () => {
  assert.deepEqual(KATEGORIEN.map((k) => k.faktor), [null, 50, 3, 1, 0]);
  const p = punkteRechnen([{ ...POS, kategorie: '1', menge_punkte: 10 }, { ...POS, kategorie: '2', menge_punkte: 100 }, { ...POS, kategorie: '3', menge_punkte: 150 }, { ...POS, kategorie: '4', menge_punkte: 5000 }]);
  assert.equal(p.summe, 500 + 300 + 150);
  assert.equal(p.freistellung, true);
  assert.equal(punkteRechnen([{ ...POS, kategorie: '3', menge_punkte: 1000 }]).freistellung, true, 'genau 1000 ist erlaubt');
  assert.equal(punkteRechnen([{ ...POS, kategorie: '3', menge_punkte: 1000.5 }]).freistellung, false);
  assert.equal(punkteRechnen([{ ...POS, kategorie: '2', menge_punkte: 334 }]).summe, 1002);
  const k0 = punkteRechnen([{ ...POS, kategorie: '0' }, { ...POS, kategorie: '3', menge_punkte: 1 }]);
  assert.equal(k0.kat0, true);
  assert.equal(k0.freistellung, false);
  const ohne = punkteRechnen([{ ...POS, kategorie: '' }]);
  assert.equal(ohne.ohneKategorie, 1);
  assert.equal(ohne.freistellung, false);
  assert.equal(punkteRechnen([]).freistellung, false);
  assert.equal(zahlDe(1234.5), '1.234,5');
});

test('ADR: Druck — ENTWURF ohne Freigabe, Storno-Stempel, Punkte-Vermerk, maskiert', () => {
  const a = { id: 'a', nummer: 'ADR-2026-0001', datum: '2026-10-14', absender: 'Muster GmbH, Hof 1', empfaenger: 'Deponie <X>', befoerderer: null, kennzeichen: 'BB-X 1',
    wiegeschein_id: null, positionen: [POS], hinweise: null, status: 'ausgestellt', ausgestellt_am: '2026-10-13T10:00:00Z', ausgestellt_name: 'Max', storno_grund: null, storniert_am: null, erstellt_am: '2026-10-13T09:00:00Z' };
  const gesperrt = adrHtml(a, null, false);
  assert.match(gesperrt, /ENTWURF – nicht als Beförderungspapier verwenden/);
  assert.match(gesperrt, /ABFALL UN 2212 ASBEST, AMPHIBOL, 9, II, \(E\)/);
  assert.match(gesperrt, /Deponie &lt;X&gt;/);
  assert.match(gesperrt, /Berechneter Wert nach ADR 1\.1\.3\.6\.4: <b>800<\/b>/);
  assert.ok(!/ENTWURF/.test(adrHtml(a, null, true)), 'freigegeben und ausgestellt: kein ENTWURF');
  assert.match(adrHtml({ ...a, status: 'entwurf' }, null, true), /ENTWURF/, 'Entwurf bleibt Entwurf');
  assert.match(adrHtml({ ...a, status: 'storniert', storno_grund: 'Fahrt abgesagt' }, null, true), /STORNIERT[\s\S]*Fahrt abgesagt/);
  const v = adrAusWiegeschein({ id: 'w', kunde_name: 'Deponie', kennzeichen: 'BB-1', netto_kg: 8220, abfall_bezeichnung: 'x' }, 'Muster', '2026-10-13');
  assert.equal(v.kopf.empfaenger, 'Deponie');
  assert.equal(v.positionen[0].abfall, true);
  assert.equal(v.positionen[0].menge, '8.220 kg');
  assert.equal(v.positionen[0].menge_punkte, 8220);
});

test('Start-Schalter adrPapier: aus, in der Freigabe-Zentrale und im Sperr-Gedächtnis', () => {
  assert.equal(START_FREIGABE.adrPapier, false);
  assert.equal(startFrei('adrPapier'), false);
  assert.equal(startFrei('adrPapier', { adrPapier: true }), true);
  assert.match(START_INFO.adrPapier.anwalt, /R58/);
  assert.match(lies('docs/ARGONAUT-SPERR-GEDAECHTNIS.md'), /SCHALTER startSperre\.adrPapier = aus/);
  const g = ohneKommentar(lies('app/dashboard/entsorgung/Gefahrgut.tsx'));
  assert.match(g, /const frei = startFrei\('adrPapier', freigabe\);/);
  assert.match(g, /if \(ausstellen && !frei\)/, 'Ausstellen ohne Freigabe abgelehnt');
  assert.match(g, /adrHtml\(a, firma, frei\)/);
});

test('SQL p356: nur anhängen, Storno durch Chef, je Schein ein Eintrag, Pflichtangaben beim Ausstellen, additiv', () => {
  const sql = lies('supabase-sql/p356-abfallregister-adr.sql');
  assert.match(sql, /create unique index if not exists abfall_register_ein_schein on public\.abfall_register \(wiegeschein_id\) where status = 'gueltig'/);
  assert.match(sql, /verfahren ~ '\^\(R\(\[1-9\]\|1\[0-3\]\)\|D\(\[1-9\]\|1\[0-5\]\)\)\$'/);
  assert.match(sql, /p356_register_waechter[\s\S]*new := old;[\s\S]*Stornieren darf nur die Geschäftsleitung/);
  assert.match(sql, /new\.erfasst_name := public\.p353_name/);
  assert.match(sql, /if tg_table_name = 'adr_papier' and old\.status = 'entwurf' then return old; end if;/);
  assert.match(sql, /if current_user in \('authenticated', 'anon'\) then\s+raise exception 'Dieser Eintrag bleibt erhalten/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('p356_adr_'/);
  assert.match(sql, /coalesce\(e->>'un_nr', ''\) !~ '\^\[0-9\]\{4\}\$'/);
  assert.match(sql, /darf_ich_modul_aendern\(''entsorgung''\)/);
  assert.ok(!/p356_ma_delete/.test(sql));
  assert.match(sql, /tabellen = 2 \| regeln = 8 \| ausloeser = 6 \| rls_an = 2/);
  assert.ok(!/\bdrop table\b|\btruncate\b|\bdelete from\b/i.test(sql), 'additiv');
});

test('Quelltext: Reiter, Sicherung, Verzeichnis, Guide, Anrede, keine Zeitstempel aus dem Browser', () => {
  const seite = lies('app/dashboard/entsorgung/page.tsx');
  assert.match(seite, /<Register /);
  assert.match(seite, /<Gefahrgut /);
  assert.match(lies('lib/sicherungTabellen.ts'), /'abfall_register', 'adr_papier'/);
  assert.match(lies('lib/verarbeitungsverzeichnis.ts'), /Abfallregister/);
  assert.match(lies('lib/guideWissen.ts'), /„📒 Register"/);
  for (const f of ['Register.tsx', 'Gefahrgut.tsx', 'page.tsx']) {
    const q = ohneKommentar(lies('app/dashboard/entsorgung/' + f));
    assert.ok(!/\b(du|dein|deine|dich|dir)\b/i.test(q.replace(/[a-z]+\.[a-z]+/g, '')), f + ' duzt nicht');
    assert.ok(!/KI-Agent|KI-Crew/.test(q));
  }
  const reg = ohneKommentar(lies('app/dashboard/entsorgung/Register.tsx'));
  assert.ok(!/erfasst_am\s*:|erfasst_name\s*:/.test(reg), 'Zeit und Name setzt die Datenbank');
  assert.ok(!/from\('abfall_register'\)\.delete/.test(reg), 'Register: kein Löschen');
  const adr = ohneKommentar(lies('app/dashboard/entsorgung/Gefahrgut.tsx'));
  assert.ok(!/ausgestellt_am\s*:|nummer\s*:/.test(adr), 'Nummer und Ausstellzeit setzt die Datenbank');
});
