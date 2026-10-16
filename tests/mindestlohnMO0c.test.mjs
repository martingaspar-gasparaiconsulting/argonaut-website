import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  mindestlohnAm, minijobGrenzeAm, minijobLohn, maxMinijobStunden, minijobStatus, pruefeStundenlohn, lohnWarnung, empfehlungText, naechsteErhoehung, vorlagenAm, BEKANNT_BIS,
} from '../out/mindestlohn.js';
import { gesundheitsBezug } from '../out/gesundheitsHinweis.js';

// ===========================================================================
// MO0c (16.10.2026) — Mindestlohn je Monat, Minijob-Grenze, Branchen-Vorlage;
// Gesundheitsangaben nicht im offenen Wellness-Feld
// ===========================================================================

test('gesetzlicher Mindestlohn und Minijob-Grenze je Jahr (§ 8 Abs. 1a SGB IV)', () => {
  assert.equal(mindestlohnAm('2025-06-01').euro, 12.82);
  assert.equal(mindestlohnAm('2026-10').euro, 13.9);
  assert.equal(mindestlohnAm('2027-01-01').euro, 14.6);
  assert.equal(minijobGrenzeAm('2025-03'), 556);
  assert.equal(minijobGrenzeAm('2026-10'), 603);
  assert.equal(minijobGrenzeAm('2027-01'), 633);
  assert.equal(mindestlohnAm('kaputt'), null);
  assert.equal(mindestlohnAm('2028-01').veraltet, true);
  assert.equal(mindestlohnAm('2027-12').veraltet, false);
});

test('erlaubte Stunden haengen am echten Stundenlohn', () => {
  assert.equal(Math.round(maxMinijobStunden(null, '2026-10') * 100) / 100, 43.38);
  assert.equal(Math.round(maxMinijobStunden(15, '2026-10') * 100) / 100, 40.2);   // Gebaeudereinigung LG1
  assert.equal(Math.round(maxMinijobStunden(null, '2027-01') * 100) / 100, 43.36); // 633 / 14,60
  // Martin 16.10.: eigener Wert zaehlt IMMER, unter der Empfehlung nur Hinweis
  const l = minijobLohn(12, '2026-10');
  assert.equal(l.euro, 12);
  assert.equal(l.herkunft, 'eigener');
  assert.match(l.hinweis, /unter der Mindestlohn-Empfehlung/);
  assert.equal(minijobLohn(14, '2026-12').euro, 14);
  assert.equal(minijobLohn(14, '2027-01').euro, 14);
  assert.match(minijobLohn(14, '2027-01').hinweis, /bitte prüfen/);
  assert.equal(minijobLohn('', '2026-10').herkunft, 'gesetzlich');
});

test('Ampel und Eingabepruefung', () => {
  assert.equal(minijobStatus(41, 40.2), 'ueber');
  assert.equal(minijobStatus(37, 40.2), 'knapp');
  assert.equal(minijobStatus(20, 40.2), 'ok');
  assert.equal(pruefeStundenlohn(null), null);
  assert.equal(pruefeStundenlohn(15), null);
  assert.equal(pruefeStundenlohn(13), null, 'unter Empfehlung ist kein Fehler');
  assert.match(lohnWarnung(13, '2026-10'), /unter der Mindestlohn-Empfehlung/);
  assert.equal(lohnWarnung(15, '2026-10'), null);
  assert.match(pruefeStundenlohn(0), /Stundenlohn/);
  assert.match(pruefeStundenlohn(900), /500/);
});

test('Empfehlung mit Stand und naechster Erhoehung, nie als feste Vorgabe', () => {
  const t = empfehlungText('2026-10');
  assert.match(t, /^Empfehlung \(Stand \d{2}\.\d{2}\.\d{4}\): gesetzlicher Mindestlohn 13,90 €/);
  assert.match(t, /nächste bekannte Erhöhung ab 01\.01\.2027: 14,60 €/);
  assert.match(t, /Ihr eigener Wert geht immer vor/);
  assert.equal(naechsteErhoehung('2027-03'), null);
  assert.doesNotMatch(empfehlungText('2027-03'), /nächste/);
});

test('Branchen-Vorlage Gebaeudereinigung nur in ihrem Zeitraum', () => {
  const v = vorlagenAm('2026-10');
  assert.equal(v.length, 2);
  assert.equal(v.find((x) => x.key === 'gebaeudereinigung_lg1').euro, 15);
  assert.equal(v.find((x) => x.key === 'gebaeudereinigung_lg6').euro, 18.4);
  assert.equal(vorlagenAm('2027-01').length, 0);
});

test('WAECHTER: Mindestlohn-Tabelle ist aktuell (sonst rot, bitte nachtragen)', () => {
  const heute = new Date().toISOString().slice(0, 10);
  assert.ok(heute <= BEKANNT_BIS, `Mindestlohn nach ${BEKANNT_BIS} in lib/mindestlohn.ts nachtragen`);
});

test('WAECHTER: Schichtplan rechnet nicht mehr mit festen 603 € / 13,90 €', () => {
  const s = fs.readFileSync('app/dashboard/schichtplan/page.tsx', 'utf8');
  assert.ok(!/const MINDESTLOHN\s*=/.test(s));
  assert.ok(!/const MINIJOB_EUR\s*=/.test(s));
  assert.ok(s.includes('maxMinijobStunden(m.minijob_stundenlohn'));
  assert.ok(s.includes("'minijob_stundenlohn' in m"), 'Lohn-Pflege muss vor SQL ausgeblendet sein');
});

test('Gesundheitsbezug wird erkannt — Vorlieben nicht', () => {
  assert.equal(gesundheitsBezug('Allergie gegen Nüsse'), 'allergie');
  assert.equal(gesundheitsBezug('allergisch auf Duftstoffe'), 'allergie');
  assert.equal(gesundheitsBezug('Laktoseintoleranz'), 'unvertraeglichkeit');
  assert.equal(gesundheitsBezug('nimmt Blutverdünner'), 'medikation');
  assert.equal(gesundheitsBezug('ist schwanger, 5. Monat'), 'kontraindikation');
  assert.equal(gesundheitsBezug('Neurodermitis an den Händen'), 'hinweis');
  assert.equal(gesundheitsBezug('Herzrhythmusstörungen'), 'hinweis');
  assert.equal(gesundheitsBezug('herzlich, mag Tee, ohne Zucker'), null);
  assert.equal(gesundheitsBezug('wunderbare Kundin, Top-Bewertung'), null);
  assert.equal(gesundheitsBezug('bitte nicht vor 10 Uhr anrufen, darf nicht warten'), null);
  assert.equal(gesundheitsBezug('mag es warm, Lieblingsöl Lavendel'), null);
  assert.equal(gesundheitsBezug(''), null);
});

test('WAECHTER: Wellness-Anlage schreibt Gesundheitsbezug nie ins offene Feld', () => {
  const w = fs.readFileSync('app/dashboard/wellness/page.tsx', 'utf8');
  assert.ok(w.includes('hinweise: bezug ? null : (hinweisText || null)'));
  assert.ok(w.includes("fetch('/api/gesundheit-notiz'"));
  // Verschieben: erst sichern, dann leeren
  const i = w.indexOf('async function hinweisVerschieben');
  const teil = w.slice(i, i + 1500);
  assert.ok(teil.indexOf('geschuetztSpeichern(') < teil.indexOf("update({ hinweise: null })"));
});
