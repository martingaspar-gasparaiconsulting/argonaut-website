// ============================================================================
// tests/passwortWechsel.test.mjs
//
// Befund vom 15.09.2026: Das Aendern des Passworts verlangte das alte nicht.
// Wer ein unbeaufsichtigtes, angemeldetes Geraet erwischt, uebernimmt das Konto
// in zwei Feldern.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruefeEingabe, MIN_LAENGE, FEHLER_ALTES_PASSWORT, ERFOLG_TEXT } from '../out/passwortWechsel.js';

test('DER KERN: ohne altes Passwort geht nichts', () => {
  const r = pruefeEingabe({ alt: '', neu: 'einNeuesGeheimnis', wdh: 'einNeuesGeheimnis' });
  assert.equal(r.ok, false);
  assert.match(r.fehler, /aktuelles Passwort/);
});

test('ein vollstaendiger, gueltiger Wechsel geht durch', () => {
  const r = pruefeEingabe({ alt: 'altesGeheimnis', neu: 'neuesGeheimnis', wdh: 'neuesGeheimnis' });
  assert.equal(r.ok, true);
  assert.equal(r.fehler, null);
});

test('zu kurz wird abgewiesen, die Grenze sitzt genau', () => {
  const kurz = 'a'.repeat(MIN_LAENGE - 1);
  const grenze = 'a'.repeat(MIN_LAENGE);
  assert.equal(pruefeEingabe({ alt: 'x', neu: kurz, wdh: kurz }).ok, false);
  assert.equal(pruefeEingabe({ alt: 'x', neu: grenze, wdh: grenze }).ok, true);
  assert.ok(MIN_LAENGE >= 8, 'die Untergrenze darf nicht unter 8 fallen');
});

test('Tippfehler in der Wiederholung faellt auf', () => {
  const r = pruefeEingabe({ alt: 'alt', neu: 'neuesGeheimnis', wdh: 'neuesGeheimni' });
  assert.equal(r.ok, false);
  assert.match(r.fehler, /stimmen nicht ueberein|stimmen nicht überein/);
});

test('dasselbe Passwort noch einmal ist kein Wechsel', () => {
  const r = pruefeEingabe({ alt: 'gleichesGeheimnis', neu: 'gleichesGeheimnis', wdh: 'gleichesGeheimnis' });
  assert.equal(r.ok, false);
  assert.match(r.fehler, /unterscheiden/);
});

test('es kommt immer nur EIN Fehler, und zwar der erste', () => {
  // Alles ist falsch: kein altes, zu kurz, verschieden. Gemeldet wird das alte.
  const r = pruefeEingabe({ alt: '', neu: 'ab', wdh: 'cd' });
  assert.match(r.fehler, /aktuelles Passwort/);
  assert.equal(r.fehler.includes('\n'), false, 'keine Fehlerliste');
});

test('leere und kaputte Eingaben werfen nicht', () => {
  for (const e of [null, undefined, {}, { alt: null, neu: null, wdh: null }, { alt: 1, neu: 2, wdh: 3 }]) {
    const r = pruefeEingabe(e);
    assert.equal(typeof r.ok, 'boolean', JSON.stringify(e));
    assert.ok(r.ok === false, JSON.stringify(e) + ' wurde durchgelassen');
  }
});

test('Leerzeichen zaehlen als Zeichen — sie werden nicht wegtrimmt', () => {
  const mitLeer = '  ab  cd  ';
  assert.equal(mitLeer.length, 10);
  assert.equal(pruefeEingabe({ alt: 'x', neu: mitLeer, wdh: mitLeer }).ok, true);
});

test('DIE AUSSPERR-FALLE: die Fehlermeldung nennt den Weg fuer Eingeladene', () => {
  // Wer ueber eine Einladung kam und nie ein Passwort vergeben hat, kommt hier
  // nicht weiter. Steht der Hinweis nicht in DERSELBEN Meldung, sitzt er fest.
  assert.match(FEHLER_ALTES_PASSWORT, /Passwort vergessen/);
  assert.match(FEHLER_ALTES_PASSWORT, /Einladung/);
});

test('die Erfolgsmeldung verschweigt die Nebenwirkung nicht', () => {
  assert.match(ERFOLG_TEXT, /abgemeldet/);
  assert.match(ERFOLG_TEXT, /andere/i);
});

test('alle Texte siezen und sind nie leer', () => {
  for (const t of [FEHLER_ALTES_PASSWORT, ERFOLG_TEXT]) {
    assert.ok(t.trim().length > 20, 'Text zu kurz: ' + t);
    assert.ok(!/\bdu\b|\bdein/i.test(t), 'geduzt: ' + t);
  }
  for (const e of [{ alt: '', neu: '', wdh: '' }, { alt: 'x', neu: 'ab', wdh: 'ab' }, { alt: 'x', neu: 'abcdefgh', wdh: 'abcdefgi' }]) {
    const f = pruefeEingabe(e).fehler;
    assert.ok(f && f.trim().length > 10, JSON.stringify(e));
    assert.ok(!/\bdu\b|\bdein/i.test(f), 'geduzt: ' + f);
  }
});
