// ============================================================================
// tests/fahrzeugMappeFm3P307.test.mjs — Paket 307 (10.10.2026) · FM3
// Fahrzeugschein auslesen (nur Vorschläge, keine Personendaten, Deckel) und
// Übernahme der Mappen-Fotos in die Fahrzeugakte (nie Schein/Unterlagen/Botschaft).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  lesbar, jsonAusText, finSauber, ezSauber, kwSauber, kraftstoffSauber, erkanntSauber, vorschlaege, uebernehmen,
  LESEN_MAX_BYTES, LESEN_MAX_JE_MAPPE, SCHEIN_SYSTEM, NOTIZ_SCHEIN_GELESEN,
} from '../out/fahrzeugMappeAuslesen.js';
import {
  uebernahmePlan, standardAuswahl, mappeIdAusPfad, darfUebernommenWerden, schabloneOhneDoppel, ergebnisText, SCHABLONE_AUS_FACH, NIE_UEBERNEHMEN, UEBERNAHME_FAECHER,
} from '../out/fahrzeugMappeBestand.js';
import { DROSSEL } from '../out/drossel.js';
import { angabenBereinigen, mappeDatenschutz } from '../out/fahrzeugMappe.js';
import { onlineEingabePruefen } from '../out/kfzAnkauf.js';
import { SCHABLONE } from '../out/kfzMedien.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('lesbar: nur JPEG/PNG/WebP/PDF bis zur Grenze, HEIC nie', () => {
  assert.equal(lesbar('image/jpeg', 2_000_000).ok, true);
  assert.equal(lesbar('application/pdf', 100).ok, true);
  assert.equal(lesbar('image/heic', 100).ok, false);
  assert.equal(lesbar('image/jpeg', LESEN_MAX_BYTES + 1).ok, false);
  assert.equal(lesbar('image/jpeg', 0).ok, false);
  assert.equal(lesbar('text/html', 10).ok, false);
});

test('KI-Antwort: JSON auch mit Zaun, sonst null', () => {
  assert.deepEqual(jsonAusText('```json\n{"marke":"VW"}\n```'), { marke: 'VW' });
  assert.deepEqual(jsonAusText('Hier: {"a":1} fertig'), { a: 1 });
  assert.equal(jsonAusText('kein json'), null);
  assert.equal(jsonAusText('[1,2]'), null);
  assert.equal(jsonAusText('{kaputt'), null);
  assert.equal(jsonAusText(null), null);
});

test('Felder säubern: FIN, Erstzulassung, kW, Kraftstoff', () => {
  assert.equal(finSauber('wvw zzz 1kz 6w 000 001'), 'WVWZZZ1KZ6W000001');
  assert.equal(finSauber('WVWZZZ1KZ6W00000I'), '', 'I ist nie in einer FIN');
  assert.equal(finSauber('WVWZZZ1KZ6W0000'), '');
  assert.equal(ezSauber('14.03.2019', 2026), '03/2019');
  assert.equal(ezSauber('3/2019', 2026), '03/2019');
  assert.equal(ezSauber('2019-03-14', 2026), '03/2019');
  assert.equal(ezSauber('14.03.2027', 2026), '', 'Zukunft');
  assert.equal(ezSauber('32.03.2019', 2026), '');
  assert.equal(ezSauber('14.13.2019', 2026), '');
  assert.equal(kwSauber('110/5500'), '110');
  assert.equal(kwSauber('85 kW'), '85');
  assert.equal(kwSauber('0'), '');
  assert.equal(kwSauber('5000'), '');
  assert.equal(kwSauber(''), '');
  assert.equal(kraftstoffSauber('Benzin'), 'Benzin');
  assert.equal(kraftstoffSauber('DIESEL'), 'Diesel');
  assert.equal(kraftstoffSauber('Elektro'), 'Elektro');
  assert.equal(kraftstoffSauber('Hybr.Benzin/E'), 'Hybrid (Benzin/Elektro)');
  assert.equal(kraftstoffSauber('Diesel/Elektro'), 'Hybrid (Diesel/Elektro)');
  assert.equal(kraftstoffSauber('Super E10'), 'Benzin');
  assert.equal(kraftstoffSauber('LPG'), 'Autogas (LPG)');
});

test('erkanntSauber: nur sechs Fahrzeugfelder — Namen, Anschrift, Kennzeichen fallen weg', () => {
  const e = erkanntSauber({
    marke: 'VOLKSWAGEN', modell: 'Golf', fin: 'WVWZZZ1KZ6W000001', erstzulassung: '14.03.2019', leistung_kw: '110/5500', kraftstoff: 'Benzin',
    name: 'Max Muster', anschrift: 'Hauptstr. 1', kennzeichen: 'BB-XY 123', halter: 'Max',
  }, 2026);
  assert.deepEqual(e, { marke: 'VOLKSWAGEN', modell: 'Golf', fin: 'WVWZZZ1KZ6W000001', erstzulassung: '03/2019', leistung: '110', kraftstoff: 'Benzin' });
  assert.deepEqual(erkanntSauber(null, 2026), {});
  assert.deepEqual(erkanntSauber({ marke: '<script>x', fin: 'unsinn' }, 2026), { marke: 'script x' });
});

test('Vorschläge: leere Felder vorgewählt, Eingetragenes nie; Übernahme nur Angehaktes', () => {
  const erkannt = { marke: 'VOLKSWAGEN', modell: 'Golf', fin: 'WVWZZZ1KZ6W000001' };
  const v = vorschlaege(erkannt, { marke: 'VW', modell: 'golf' });
  assert.deepEqual(v.map((x) => [x.key, x.vorgewaehlt, x.gleich]), [['marke', false, false], ['modell', false, true], ['fin', true, false]]);
  const neu = uebernehmen({ marke: 'VW', name: 'Max' }, erkannt, ['fin']);
  assert.deepEqual(neu, { marke: 'VW', name: 'Max', fin: 'WVWZZZ1KZ6W000001', schein_gelesen: true });
  assert.deepEqual(uebernehmen({ marke: 'VW' }, erkannt, []), { marke: 'VW' }, 'nichts angehakt = nichts geändert');
  assert.deepEqual(uebernehmen({}, erkannt, ['name']), {}, 'fremde Schlüssel gehen nicht');
});

test('Angaben: Leistung und Merker „schein_gelesen" kommen durch; Ankauf bekommt leistung_kw', () => {
  const a = angabenBereinigen({ leistung: '110', schein_gelesen: true, fremd: 1 });
  assert.deepEqual(a, { leistung: '110', schein_gelesen: true });
  assert.deepEqual(angabenBereinigen({ schein_gelesen: 'ja' }), {});
  const basis = { name: 'Max', email: 'm@x.de', marke: 'VW', modell: 'Golf', km: '50.000', datenschutz: true };
  assert.equal(onlineEingabePruefen({ ...basis, leistung: '110' }, 2026).daten.leistung_kw, 110);
  assert.equal('leistung_kw' in onlineEingabePruefen(basis, 2026).daten, false, 'ohne Angabe kein Feld (altes Formular unverändert)');
  assert.equal('leistung_kw' in onlineEingabePruefen({ ...basis, leistung: '99999' }, 2026).daten, false, 'Unsinn wird verworfen, nicht abgelehnt');
  assert.match(NOTIZ_SCHEIN_GELESEN, /bitte mit dem Original vergleichen/);
});

test('Datenschutz und Anweisung: KI-Anbieter genannt, keine Personendaten', () => {
  const t = mappeDatenschutz({ name: 'Autohaus X' });
  assert.match(t, /Anthropic PBC \(USA, Standardvertragsklauseln\)/);
  assert.match(t, /Namen und Anschrift werden dabei nicht ausgelesen/);
  assert.match(SCHEIN_SYSTEM, /Lies KEINE Personendaten/);
  assert.match(SCHEIN_SYSTEM, /erfinde, ergänze oder rate nichts/);
});

test('Deckel: 3 Versuche je Mappe (30 Tage) passend zu LESEN_MAX_JE_MAPPE', () => {
  const r = DROSSEL['oeffentlich/fahrzeugmappe/schein'];
  assert.ok(r);
  const ziel = r.find((x) => x.art === 'ziel');
  assert.equal(ziel.max, LESEN_MAX_JE_MAPPE);
  assert.equal(ziel.fensterSek, 30 * 86400);
});

test('Route Schein: nur Entwurf, nur Fach schein, Datei aus dem Speicher, KI beim Betrieb, nichts gespeichert', () => {
  const s = ohneKommentare(lies('app/api/oeffentlich/fahrzeugmappe/schein/route.ts'));
  assert.match(s, /mappe\.status !== 'entwurf'/);
  assert.match(s, /d\.fach !== 'schein'/);
  assert.match(s, /storage\.from\(MAPPE_BUCKET\)\.download\(d\.pfad\)/);
  assert.match(s, /kiFetch\('fahrzeugmappe-schein'[\s\S]*\}, betrieb\)/);
  assert.match(s, /modellFuer\('kfz\.schein\.lesen'\)/);
  assert.match(s, /erkanntSauber\(/);
  assert.doesNotMatch(s, /\.insert\(|\.update\(|\.upsert\(/, 'die Route speichert nichts');
  assert.ok(s.indexOf('drossel(db') > s.indexOf("d.fach !== 'schein'"), 'Deckel erst nach den Prüfungen');
  const seite = lies('app/ankauf/FahrzeugMappe.tsx');
  assert.match(seite, /Ausgewählte übernehmen/);
  assert.match(seite, /setzeAlle\(uebernehmen\(angaben, erkannt, erkanntAuswahl\)\)/);
});

test('Übernahme: Schablonen-Zuordnung passt zu lib/kfzMedien', () => {
  const ansichten = new Set(SCHABLONE.map((s) => s.key));
  for (const [fach, ziel] of Object.entries(SCHABLONE_AUS_FACH)) if (ziel) assert.ok(ansichten.has(ziel), `${fach} -> ${ziel}`);
  for (const f of NIE_UEBERNEHMEN) assert.equal(darfUebernommenWerden(f), false, f);
  // Doppelt gesichert: Sperrliste vollständig UND keines davon in der Auswahl-Liste
  assert.deepEqual([...NIE_UEBERNEHMEN].sort(), ['botschaft', 'rechnung', 'schein', 'service', 'sonstiges', 'tuev']);
  for (const f of NIE_UEBERNEHMEN) assert.ok(!UEBERNAHME_FAECHER.some((x) => x.key === f), `${f} darf nicht wählbar sein`);
  assert.equal(darfUebernommenWerden('vorne_links'), true);
  assert.equal(darfUebernommenWerden('gibtsnicht'), false);
});

const B = '11111111-1111-4111-8111-111111111111';
const M = '22222222-2222-4222-8222-222222222222';
const F = '33333333-3333-4333-8333-333333333333';
const id = (n) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const datei = (n, fach, mime = 'image/jpeg', zeit = '2026-10-10T10:00:00Z') => ({ id: id(n), fach, mime, pfad: `${B}/${M}/${id(n)}.${mime === 'video/mp4' ? 'mp4' : 'jpg'}`, bytes: 1000, erstellt_am: zeit });

test('Übernahme-Plan: Auswahl, Reihenfolge, nie Schein/Botschaft, nur eigener Ordner, nie doppelt', () => {
  const dateien = [
    datei(1, 'schein'), datei(2, 'tacho'), datei(3, 'vorne_links'), datei(4, 'weitere', 'image/jpeg', '2026-10-10T09:00:00Z'),
    datei(5, 'botschaft', 'video/mp4'), datei(6, 'kaltstart', 'video/mp4'), datei(7, 'schaden'), datei(8, 'tuev'),
    { ...datei(9, 'seite_links'), pfad: `${B}/99999999-9999-4999-8999-999999999999/${id(9)}.jpg` }, // fremde Mappe
    { ...datei(10, 'seite_rechts'), mime: 'application/pdf' },
  ];
  const std = standardAuswahl(dateien);
  assert.deepEqual(std.sort(), [id(2), id(3), id(4), id(9), id(10)].sort(), 'vorgewählt: nur Fahrzeugfotos');
  const alle = dateien.map((d) => d.id);
  const p = uebernahmePlan({ betrieb: B, mappe: M, bestand: F, dateien, auswahl: alle, schonDa: [id(2)], startPosition: 4 });
  assert.deepEqual(p.schritte.map((s) => s.dateiId), [id(3), id(4), id(7), id(6)], 'Schablone vorn, Rest danach; Tacho schon da');
  assert.deepEqual(p.schritte.map((s) => s.position), [5, 6, 7, 8]);
  assert.equal(p.schritte[0].schablone, 'front_links');
  assert.equal(p.schritte[0].nach, `${B}/${F}/mappe-${id(3)}.jpg`);
  assert.equal(p.schritte[3].art, 'video');
  assert.equal(p.schritte[3].schablone, null);
  assert.ok(!p.schritte.some((s) => [id(1), id(5), id(8), id(9), id(10)].includes(s.dateiId)), 'Schein, Botschaft, TÜV, fremde Mappe, PDF nie');
  assert.equal(mappeIdAusPfad(p.schritte[0].nach), id(3));
  assert.equal(mappeIdAusPfad(`${B}/${F}/1234-abc.jpg`), null);
  assert.deepEqual(uebernahmePlan({ betrieb: 'x', mappe: M, bestand: F, dateien, auswahl: alle, schonDa: [], startPosition: 0 }).schritte, []);
  // Belegte Ansicht im Bestand: Foto kommt ohne Schablone dazu
  const o = schabloneOhneDoppel(p.schritte, ['front_links']);
  assert.equal(o[0].schablone, null);
  assert.equal(ergebnisText(2, 1), '2 Fotos und 1 Video aus der Fahrzeugmappe in die Fahrzeugakte übernommen.');
  assert.match(ergebnisText(0, 0), /nichts/);
});

test('Route Übernahme: Login, Lesen mit Login, Einträge mit Login, Kopien bei Fehler weg', () => {
  const s = ohneKommentare(lies('app/api/kfz/fahrzeugmappe/uebernehmen/route.ts'));
  assert.match(s, /auth\.getUser\(\)/);
  assert.match(s, /supabase\.from\('kfz_ankauf'\)/);
  assert.match(s, /supabase\.from\('kfz_mappe_datei'\)/);
  assert.match(s, /supabase\.from\('kfz_bestand_medien'\)\.insert/);
  assert.match(s, /copy\(s\.von, s\.nach, \{ destinationBucket: MEDIEN_BUCKET \}\)/);
  assert.match(s, /if \(insErr\) \{\s*await admin\.storage\.from\(MEDIEN_BUCKET\)\.remove/);
  const seite = lies('app/dashboard/kfz/ankauf/[id]/page.tsx');
  assert.match(seite, /\/api\/kfz\/fahrzeugmappe\/uebernehmen/);
  assert.match(lies('app/dashboard/kfz/ankauf/[id]/MappeKarte.tsx'), /INZAHLUNG_HINWEIS/);
});
