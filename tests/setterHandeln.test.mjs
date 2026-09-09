// ============================================================================
// ARGONAUT OS · tests/setterHandeln.test.mjs
//
// Was der Setter am Ende tut, greift in echte Kundendaten: ein Lead im CRM,
// eine Stufe in der Pipeline, ein Link mit persönlichen Angaben darin.
// Drei Dinge stehen deshalb hier besonders im Blick:
//
//   · KEINE Werbe-Einwilligung, nur weil jemand gechattet hat.
//   · Die Stufe wird NICHT geschönt — ein gezeigter Link ist kein Termin.
//   · Der Buchungslink zeigt nie irgendwohin, wo er nicht hinsoll.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import { baueAusbeute } from '../out/setter.js';
import {
  baueLead,
  buchungsLink,
  abschlussText,
  quelleFuerKanal,
  stufeNachGespraech,
} from '../out/setterHandeln.js';

const AUSBEUTE = baueAusbeute({
  name: 'Petra Wagner',
  kontakt: 'p.wagner@web.de',
  anliegen: 'Dachrinne undicht',
  plz: '71034',
});

// --- 1) Der Lead ------------------------------------------------------------

test('der Lead trägt Name, Kontakt und Anliegen', () => {
  const l = baueLead({ ownerId: 'owner-1', ausbeute: AUSBEUTE, kanal: 'website' });
  assert.equal(l.owner_user_id, 'owner-1');
  assert.equal(l.name, 'Petra Wagner');
  assert.equal(l.email, 'p.wagner@web.de');
  assert.equal(l.telefon, null);
  assert.match(l.nachricht, /Dachrinne undicht/);
  assert.match(l.nachricht, /plz: 71034/);
});

test('NIEMALS eine Werbe-Einwilligung aus einem Chat', () => {
  for (const kanal of ['website', 'whatsapp', 'social', 'telefon']) {
    const l = baueLead({ ownerId: 'o', ausbeute: AUSBEUTE, kanal });
    assert.equal(l.werbung_einwilligung, false,
      'wer eine Frage stellt, hat nicht in Newsletter eingewilligt — das kostet sonst eine Abmahnung');
    assert.equal(l.ist_bestand, false);
  }
});

test('ohne Namen wird der Lead nicht namenlos', () => {
  const l = baueLead({ ownerId: 'o', ausbeute: baueAusbeute({ kontakt: 'x@y.de' }), kanal: 'website' });
  assert.equal(l.name, 'Unbekannt');
});

test('leere Felder werden null, nicht Leerstring', () => {
  const l = baueLead({ ownerId: 'o', ausbeute: baueAusbeute({ name: 'P' }), kanal: 'website' });
  assert.equal(l.email, null);
  assert.equal(l.telefon, null);
});

test('die Quelle sagt, über welchen Kanal er kam', () => {
  assert.equal(quelleFuerKanal('website'), 'Website-Berater');
  assert.equal(quelleFuerKanal('whatsapp'), 'WhatsApp-Berater');
  assert.equal(quelleFuerKanal('WHATSAPP'), 'WhatsApp-Berater');
  assert.equal(quelleFuerKanal('unbekannt'), 'KI-Berater');
  assert.equal(quelleFuerKanal(null), 'KI-Berater');
});

// --- 2) Die Stufe darf nicht geschönt werden --------------------------------

test('ein gezeigter Buchungslink ist KEIN gebuchter Termin', () => {
  assert.equal(stufeNachGespraech(), 'eintragung',
    'termin_gebucht setzt die Online-Buchung, wenn wirklich gebucht wurde');
  const l = baueLead({ ownerId: 'o', ausbeute: AUSBEUTE, kanal: 'website' });
  assert.equal(l.stufe, 'eintragung');
});

// --- 3) Der Buchungslink ----------------------------------------------------

test('der Link führt zur echten Buchungsseite, mit vorausgefüllten Angaben', () => {
  const l = buchungsLink({ basis: 'https://argonaut-os.com', slug: 'muster-bau', ausbeute: AUSBEUTE });
  assert.ok(l.startsWith('https://argonaut-os.com/buchen/muster-bau?'), l);
  assert.match(l, /name=Petra\+Wagner/);
  assert.match(l, /email=p.wagner%40web.de/);
  assert.match(l, /notiz=/);
});

test('ohne Slug gibt es keinen Link — statt einer toten Seite', () => {
  assert.equal(buchungsLink({ basis: 'https://x.de', slug: '', ausbeute: AUSBEUTE }), '');
  assert.equal(buchungsLink({ basis: 'https://x.de', slug: null, ausbeute: AUSBEUTE }), '');
  assert.equal(buchungsLink({ basis: '', slug: 'abc', ausbeute: AUSBEUTE }), '');
});

test('ANGRIFF: ein Slug kann nicht aus der Buchungsseite ausbrechen', () => {
  for (const boese of ['../admin', '..%2Fadmin', 'a/b', 'a?x=1', 'a#b', 'https://boese.de', 'a b', '-start']) {
    assert.equal(
      buchungsLink({ basis: 'https://x.de', slug: boese, ausbeute: AUSBEUTE }), '',
      `Slug haette abgewiesen werden muessen: ${boese}`,
    );
  }
});

test('Sonderzeichen in den Angaben zerlegen den Link nicht', () => {
  const a = baueAusbeute({ name: 'Müller & Söhne', kontakt: 'a+b@c.de', anliegen: 'Frage: 50% Rabatt?' });
  const l = buchungsLink({ basis: 'https://x.de', slug: 'abc', ausbeute: a });
  assert.ok(l.startsWith('https://x.de/buchen/abc?'), l);
  assert.ok(!l.includes(' '), 'Leerzeichen müssen kodiert sein');
  assert.ok(!l.includes('&S'), 'ein rohes & würde einen zweiten Parameter erfinden');
  const u = new URL(l);
  assert.equal(u.searchParams.get('name'), 'Müller & Söhne');
  assert.equal(u.searchParams.get('email'), 'a+b@c.de');
});

test('ein Schrägstrich am Ende der Basis erzeugt keinen doppelten', () => {
  const l = buchungsLink({ basis: 'https://x.de/', slug: 'abc', ausbeute: baueAusbeute({}) });
  assert.equal(l, 'https://x.de/buchen/abc');
});

// --- 4) Der Abschlusssatz ---------------------------------------------------

test('mit Termin-Ziel und Link führt der Satz zum Buchen', () => {
  const t = abschlussText({ ziel: 'termin', link: 'https://x.de/buchen/a', hatKontakt: true });
  assert.match(t, /Termin/i);
  assert.ok(t.includes('https://x.de/buchen/a'));
});

test('ohne Link wird nichts versprochen, was nicht geht', () => {
  const t = abschlussText({ ziel: 'termin', link: '', hatKontakt: true });
  assert.ok(!t.includes('http'));
  assert.match(t, /melden uns/i);
});

test('fehlt der Kontakt, sagt der Satz genau das', () => {
  for (const ziel of ['termin', 'rueckruf', 'anfrage']) {
    const t = abschlussText({ ziel, link: '', hatKontakt: false });
    assert.match(t, /brauchen wir noch/i, `Ziel ${ziel}: der fehlende Kontakt muss angesprochen werden`);
  }
});

test('jeder Abschlusssatz siezt', () => {
  const saetze = [
    abschlussText({ ziel: 'termin', link: 'https://x.de/b/a', hatKontakt: true }),
    abschlussText({ ziel: 'termin', link: '', hatKontakt: true }),
    abschlussText({ ziel: 'rueckruf', link: '', hatKontakt: true }),
    abschlussText({ ziel: 'rueckruf', link: '', hatKontakt: false }),
    abschlussText({ ziel: 'anfrage', link: '', hatKontakt: true }),
    abschlussText({ ziel: 'anfrage', link: '', hatKontakt: false }),
  ];
  for (const s of saetze) {
    assert.ok(!/\bdu\b|\bdein|\bdir\b/i.test(s), `duzt: ${s}`);
    assert.ok(s.length > 10);
  }
});
