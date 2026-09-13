import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_SEKUNDEN, MAX_SEKUNDEN, STANDARD_SEKUNDEN,
  MIN_SPERRE_TAGE, MAX_SPERRE_TAGE, STANDARD_SPERRE_TAGE, HANDY_BREITE,
  sekunden, sperreTage, einstellung, fehltZurEinblendung,
  sollZeigen, darstellung, beschreibe, VORLAGE,
} from '../out/einblendung.js';

const HEUTE = '2026-09-13';

// ------------------------------------------------------------------ Grenzen

test('sekunden hält die Untergrenze — nie sofort', () => {
  assert.equal(sekunden(0), MIN_SEKUNDEN);
  assert.equal(sekunden(1), MIN_SEKUNDEN);
  assert.equal(sekunden(-99), MIN_SEKUNDEN);
});

test('sekunden hält die Obergrenze und nimmt gültige Werte an', () => {
  assert.equal(sekunden(9999), MAX_SEKUNDEN);
  assert.equal(sekunden(30), 30);
});

test('sekunden fällt bei Unsinn auf die Voreinstellung', () => {
  assert.equal(sekunden('abc'), STANDARD_SEKUNDEN);
  assert.equal(sekunden(null), STANDARD_SEKUNDEN);
  assert.equal(sekunden(undefined), STANDARD_SEKUNDEN);
});

test('sperreTage hält beide Grenzen', () => {
  assert.equal(sperreTage(1), MIN_SPERRE_TAGE);
  assert.equal(sperreTage(99999), MAX_SPERRE_TAGE);
  assert.equal(sperreTage(60), 60);
  assert.equal(sperreTage('x'), STANDARD_SPERRE_TAGE);
});

// -------------------------------------------------------------- Einstellung

test('einstellung bändigt alle Werte auf einmal', () => {
  const e = einstellung({ titel: '  Hallo  ', text: 'Text', nach_sekunden: 0, sperre_tage: 1, bei_verlassen: true });
  assert.equal(e.titel, 'Hallo');
  assert.equal(e.nachSekunden, MIN_SEKUNDEN);
  assert.equal(e.sperreTage, MIN_SPERRE_TAGE);
  assert.equal(e.beiVerlassen, true);
  assert.equal(e.knopf, 'Anmelden', 'ohne Angabe eine sinnvolle Beschriftung');
});

test('einstellung kommt mit einer leeren Eingabe klar', () => {
  const e = einstellung(null);
  assert.equal(e.nachSekunden, STANDARD_SEKUNDEN);
  assert.equal(e.sperreTage, STANDARD_SPERRE_TAGE);
  assert.equal(e.beiVerlassen, false);
});

test('bei_verlassen ist nur bei echtem true an', () => {
  assert.equal(einstellung({ bei_verlassen: 'ja' }).beiVerlassen, false);
  assert.equal(einstellung({ bei_verlassen: 1 }).beiVerlassen, false);
  assert.equal(einstellung({ bei_verlassen: true }).beiVerlassen, true);
});

test('die Vorlage ist vollständig', () => {
  assert.deepEqual(fehltZurEinblendung(VORLAGE), []);
});

test('fehltZurEinblendung verlangt Überschrift und Begründung', () => {
  const fehlt = fehltZurEinblendung({ titel: 'Hi', text: 'kurz' });
  assert.ok(fehlt.some((f) => /Überschrift/.test(f)));
  assert.ok(fehlt.some((f) => /lohnt/.test(f)));
});

// ------------------------------------------------------------- Zeigen?

test('einem neuen Besucher wird die Einladung gezeigt', () => {
  const e = sollZeigen({}, HEUTE, 30);
  assert.equal(e.zeigen, true);
  assert.equal(e.grund, 'noch nie gezeigt');
});

test('wer sich eingetragen hat, wird nie wieder gefragt', () => {
  const e = sollZeigen({ angemeldet: true, zuletztGezeigt: '2020-01-01' }, HEUTE, 30);
  assert.equal(e.zeigen, false);
  assert.match(e.grund, /bereits eingetragen/);
});

test('nach dem Wegklicken ist Ruhe', () => {
  const e = sollZeigen({ zuletztGezeigt: '2026-09-01' }, HEUTE, 30);
  assert.equal(e.zeigen, false);
  assert.match(e.grund, /Tagen Ruhe/);
});

test('nach Ablauf der Ruhefrist darf wieder gefragt werden', () => {
  const e = sollZeigen({ zuletztGezeigt: '2026-07-01' }, HEUTE, 30);
  assert.equal(e.zeigen, true);
});

test('die Mindest-Ruhefrist gilt auch gegen eine zu kleine Einstellung', () => {
  // 1 Tag eingestellt, gestern weggeklickt — die Untergrenze von 7 greift.
  const e = sollZeigen({ zuletztGezeigt: '2026-09-12' }, HEUTE, 1);
  assert.equal(e.zeigen, false);
});

test('ein unbrauchbarer Zustand schaltet die Einblendung NICHT dauerhaft ab', () => {
  assert.equal(sollZeigen({ zuletztGezeigt: 'kaputt' }, HEUTE, 30).zeigen, true);
  assert.equal(sollZeigen(null, HEUTE, 30).zeigen, true);
  assert.equal(sollZeigen({ zuletztGezeigt: '' }, HEUTE, 30).zeigen, true);
});

test('ein Datum in der Zukunft wird nicht als abgelaufen gelesen', () => {
  const e = sollZeigen({ zuletztGezeigt: '2027-01-01' }, HEUTE, 30);
  assert.equal(e.zeigen, false);
});

test('angemeldet schlägt alles — auch eine abgelaufene Frist', () => {
  const e = sollZeigen({ angemeldet: true, zuletztGezeigt: '2020-01-01' }, HEUTE, 7);
  assert.equal(e.zeigen, false);
});

// ------------------------------------------------------------ Darstellung

test('auf dem Handy ein Balken, am Rechner eine Einblendung', () => {
  assert.equal(darstellung(390), 'balken');
  assert.equal(darstellung(HANDY_BREITE - 1), 'balken');
  assert.equal(darstellung(HANDY_BREITE), 'overlay');
  assert.equal(darstellung(1440), 'overlay');
});

test('ohne bekannte Breite wird die schonendere Form gewählt', () => {
  assert.equal(darstellung(undefined), 'balken');
  assert.equal(darstellung('abc'), 'balken');
  assert.equal(darstellung(0), 'balken');
});

// ------------------------------------------------------------------ Texte

test('beschreibe nennt Wartezeit, Ruhefrist und die Handy-Regel', () => {
  const satz = beschreibe({ nach_sekunden: 30, sperre_tage: 60, bei_verlassen: true });
  assert.match(satz, /30 Sekunden/);
  assert.match(satz, /60 Tage Ruhe/);
  assert.match(satz, /Handy/);
  assert.match(satz, /Zeiger die Seite verlässt/);
});

test('die Vorlage siezt und verspricht nichts, was nicht eingehalten wird', () => {
  const alles = VORLAGE.titel + ' ' + VORLAGE.text + ' ' + VORLAGE.knopf;
  assert.ok(!/\b(du|dir|dein|deine)\b/i.test(alles), 'Kundentext muss siezen');
  assert.match(VORLAGE.text, /Weitergabe/);
});
