// ============================================================================
// ARGONAUT OS · tests/chatEinbetten.test.mjs
//
// Die Herkunftspruefung ist die einzige Kostenbremse des oeffentlichen
// Beraters: wer sie umgeht, laesst unsere KI auf unsere Rechnung laufen.
// Deshalb steht hier der Angriff mit im Test, nicht nur der Normalfall.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DOMAINS,
  normalisiereDomain,
  leseDomainListe,
  originErlaubt,
  baueEinbettSchnipsel,
  basisAusSkriptAdresse,
} from '../out/chatEinbetten.js';

// --- 1) Domain normalisieren ------------------------------------------------

test('Protokoll, Pfad, Port und www fallen weg', () => {
  assert.equal(normalisiereDomain('https://WWW.Muster-Bau.de/kontakt?x=1'), 'muster-bau.de');
  assert.equal(normalisiereDomain('http://muster-bau.de:8080'), 'muster-bau.de');
  assert.equal(normalisiereDomain('  Muster-Bau.DE  '), 'muster-bau.de');
  assert.equal(normalisiereDomain('muster-bau.de.'), 'muster-bau.de');
});

test('eine echte Subdomain bleibt erhalten — nur www gilt als dieselbe Seite', () => {
  assert.equal(normalisiereDomain('shop.muster-bau.de'), 'shop.muster-bau.de');
  assert.equal(normalisiereDomain('www.shop.muster-bau.de'), 'shop.muster-bau.de');
});

test('Unbrauchbares wird zu leer, nicht zu irgendetwas', () => {
  for (const mist of ['', '   ', 'localhost', 'kein punkt', 'http://', '...', null, undefined, 42, {}]) {
    assert.equal(normalisiereDomain(mist), '', `sollte leer sein: ${String(mist)}`);
  }
});

test('Benutzer-Doppelpunkt-Passwort-Trick wird abgeschnitten', () => {
  // https://muster-bau.de@boese.de/ zeigt in Wahrheit auf boese.de
  assert.equal(normalisiereDomain('https://muster-bau.de@boese.de/'), 'boese.de');
});

// --- 2) Liste einlesen ------------------------------------------------------

test('mehrere Domains aus Zeilen, Kommas und Semikolons', () => {
  const l = leseDomainListe('muster-bau.de\nwww.muster-bau.de, shop.muster-bau.de; https://alt.muster-bau.de/');
  assert.deepEqual(l, ['muster-bau.de', 'shop.muster-bau.de', 'alt.muster-bau.de']);
});

test('Doppelte fallen weg, Unbrauchbares auch', () => {
  assert.deepEqual(leseDomainListe('a.de\na.de\nwww.a.de\nquatsch\n'), ['a.de']);
  assert.deepEqual(leseDomainListe(''), []);
  assert.deepEqual(leseDomainListe(null), []);
});

test('die Obergrenze haelt', () => {
  const viele = Array.from({ length: 30 }, (_, i) => `d${i}.de`).join('\n');
  assert.equal(leseDomainListe(viele).length, MAX_DOMAINS);
});

// --- 3) Herkunftspruefung — der eigentliche Wächter -------------------------

test('die eingetragene Domain darf, mit und ohne www', () => {
  const erlaubt = ['muster-bau.de'];
  assert.equal(originErlaubt('https://muster-bau.de', erlaubt), true);
  assert.equal(originErlaubt('https://www.muster-bau.de', erlaubt), true);
  assert.equal(originErlaubt('http://muster-bau.de:3000', erlaubt), true);
});

test('ANGRIFF: eine Domain, die auf die erlaubte endet, darf NICHT', () => {
  const erlaubt = ['muster-bau.de'];
  assert.equal(originErlaubt('https://boese-muster-bau.de', erlaubt), false,
    'Suffix-Vergleich statt exaktem Vergleich — genau die Luecke, die dieser Test verhindert');
  assert.equal(originErlaubt('https://muster-bau.de.boese.de', erlaubt), false);
  assert.equal(originErlaubt('https://xmuster-bau.de', erlaubt), false);
});

test('ANGRIFF: nicht eingetragene Subdomain darf nicht', () => {
  assert.equal(originErlaubt('https://shop.muster-bau.de', ['muster-bau.de']), false);
  assert.equal(originErlaubt('https://muster-bau.de', ['shop.muster-bau.de']), false);
});

test('leere Liste sperrt alles, auch bei gueltiger Herkunft', () => {
  assert.equal(originErlaubt('https://muster-bau.de', []), false);
  assert.equal(originErlaubt('https://muster-bau.de', null), false);
  assert.equal(originErlaubt('https://muster-bau.de', undefined), false);
});

test('leere oder unsinnige Herkunft darf nie', () => {
  for (const o of ['', null, undefined, 'null', 'file://', 'localhost']) {
    assert.equal(originErlaubt(o, ['muster-bau.de']), false, `sollte sperren: ${String(o)}`);
  }
});

test('unbrauchbare Eintraege in der Liste oeffnen nichts', () => {
  assert.equal(originErlaubt('https://muster-bau.de', ['', '   ', 'quatsch', '*']), false);
});

// --- 4) Einbett-Schnipsel ---------------------------------------------------

test('der Schnipsel traegt eine ABSOLUTE Adresse — sonst gibt es kein /chat.js', () => {
  const s = baueEinbettSchnipsel({ basis: 'https://argonaut-os.com', oeffentlichId: 'abc123' });
  assert.ok(s.includes('src="https://argonaut-os.com/chat.js"'), s);
  assert.ok(s.includes('data-seite="abc123"'));
  assert.ok(s.includes('defer'));
});

test('ein Schrägstrich am Ende der Basis erzeugt keinen doppelten', () => {
  const s = baueEinbettSchnipsel({ basis: 'https://argonaut-os.com/', oeffentlichId: 'abc123' });
  assert.ok(s.includes('https://argonaut-os.com/chat.js'));
  assert.ok(!s.includes('//chat.js'));
});

test('Anfuehrungszeichen im Titel sprengen das Attribut nicht', () => {
  const s = baueEinbettSchnipsel({
    basis: 'https://argonaut-os.com',
    oeffentlichId: 'abc',
    titel: 'Der "beste" Berater <b>',
  });
  assert.ok(!s.includes('data-titel="Der "'), 'unmaskiertes Anfuehrungszeichen im Attribut');
  assert.ok(s.includes('&quot;'));
  assert.ok(s.includes('&lt;b&gt;'));
});

test('ohne Basis oder Kennung gibt es keinen halben Schnipsel', () => {
  assert.equal(baueEinbettSchnipsel({ basis: '', oeffentlichId: 'abc' }), '');
  assert.equal(baueEinbettSchnipsel({ basis: 'https://x.de', oeffentlichId: '' }), '');
});

// --- 5) Basis aus der Skript-Adresse ---------------------------------------

test('chat.js findet seine eigene Herkunft', () => {
  assert.equal(basisAusSkriptAdresse('https://argonaut-os.com/chat.js'), 'https://argonaut-os.com');
  assert.equal(basisAusSkriptAdresse('http://localhost:3000/chat.js?v=2'), 'http://localhost:3000');
  assert.equal(basisAusSkriptAdresse('/chat.js'), '', 'relativer Pfad liefert keine Basis');
  assert.equal(basisAusSkriptAdresse(''), '');
  assert.equal(basisAusSkriptAdresse(null), '');
});
