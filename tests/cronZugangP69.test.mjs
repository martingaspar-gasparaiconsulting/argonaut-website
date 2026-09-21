// ============================================================================
// tests/cronZugangP69.test.mjs — wer einen Hintergrundlauf ausloesen darf
//
// Punkt 69, 21.09.2026. Die achtzehn Zeitplaene in vercel.json haengen an drei
// verschiedenen, handkopierten Pruefungen. Diese Tests nageln die gemeinsame
// Fassung fest — vor allem die zwei Faelle, die heute falsch sind:
//
//   · Ohne hinterlegtes Geheimnis wird NICHT auf den Anmeldeweg zurueckgefallen.
//   · Ein Geheimnis aus Leerzeichen ist kein Geheimnis.
//
// Wichtig fuer die Gegenprobe: Jeder Test hier muss ROT werden, wenn man die
// zugehoerige Zeile in lib/cronZugang.ts zurueckdreht.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cronZugang, istGesetzt, gleichOhneZeitverrat, cronZugangKlartext,
} from '../out/cronZugang.js';

const GEHEIM = 'ein-langes-zufaelliges-geheimnis-1234567890';
const ALT = 'alt-geheimnis-aus-der-n8n-zeit-098765';

// ---------------------------------------------------------------------------
// DER WEG, DER FUNKTIONIEREN MUSS
// Geht der verloren, laufen achtzehn Hintergrundlaeufe nicht mehr: keine
// Mahnungen, keine Erinnerungen, keine Webinar-Mails. Das waere schlimmer als
// der Fehler, den wir reparieren.
// ---------------------------------------------------------------------------

test('DER WICHTIGSTE TEST: der Zeitplan von Vercel kommt durch', () => {
  const e = cronZugang({ geheimnis: GEHEIM, authKopf: `Bearer ${GEHEIM}` });
  assert.equal(e.frei, true);
  assert.equal(e.weg, 'bearer');
});

test('Martins Aufruf von Hand ueber die Adresse kommt durch', () => {
  const e = cronZugang({ geheimnis: GEHEIM, adresse: GEHEIM });
  assert.equal(e.frei, true);
  assert.equal(e.weg, 'adresse');
});

test('die drei n8n-Altwege kommen weiterhin durch', () => {
  const kopf = cronZugang({ geheimnis: GEHEIM, altGeheimnis: ALT, altKopf: ALT });
  assert.equal(kopf.frei, true);
  assert.equal(kopf.weg, 'alt-header');

  const bearer = cronZugang({ geheimnis: GEHEIM, altGeheimnis: ALT, authKopf: `Bearer ${ALT}` });
  assert.equal(bearer.frei, true);
  assert.equal(bearer.weg, 'alt-bearer');
});

test('der Altweg funktioniert auch, wenn nur das Alt-Geheimnis gesetzt ist', () => {
  const e = cronZugang({ geheimnis: null, altGeheimnis: ALT, altKopf: ALT });
  assert.equal(e.frei, true);
});

// ---------------------------------------------------------------------------
// BEFUND 1 — der stille Rueckfall
// ---------------------------------------------------------------------------

test('BEFUND 1: ohne hinterlegtes Geheimnis kommt NIEMAND durch', () => {
  for (const g of [undefined, null, '', '   ', '\t', '\n']) {
    const e = cronZugang({ geheimnis: g, authKopf: 'Bearer irgendwas', adresse: 'irgendwas' });
    assert.equal(e.frei, false, `geheimnis=${JSON.stringify(g)} haette abgewiesen werden muessen`);
    assert.equal(e.grund, 'kein-geheimnis');
  }
});

test('BEFUND 1: auch ein leerer Aufruf wird abgewiesen, nicht durchgereicht', () => {
  const e = cronZugang({});
  assert.equal(e.frei, false);
  assert.equal(e.grund, 'kein-geheimnis');
});

test('BEFUND 1: der Grund unterscheidet fehlendes von falschem Geheimnis', () => {
  // Der Unterschied ist fuer die Fehlersuche wichtig: "gar nichts hinterlegt"
  // ist ein Einrichtungsfehler, "stimmt nicht" ein Zugriffsversuch.
  assert.equal(cronZugang({ geheimnis: null }).grund, 'kein-geheimnis');
  assert.equal(cronZugang({ geheimnis: GEHEIM, authKopf: 'Bearer falsch' }).grund, 'kein-treffer');
});

// ---------------------------------------------------------------------------
// BEFUND 2 — ein Geheimnis aus Leerzeichen
// ---------------------------------------------------------------------------

test('BEFUND 2: ein Geheimnis aus Leerzeichen laesst niemanden durch', () => {
  // Die heutigen Endpunkte pruefen `if (secret)`. Ein einzelnes Leerzeichen ist
  // wahr — und dann kommt ?secret=%20 durch.
  const e = cronZugang({ geheimnis: ' ', adresse: ' ' });
  assert.equal(e.frei, false);
  assert.equal(e.grund, 'kein-geheimnis');
});

test('BEFUND 2: istGesetzt erkennt blanke Werte', () => {
  assert.equal(istGesetzt('abc'), true);
  assert.equal(istGesetzt(' abc '), true);
  for (const leer of ['', ' ', '   ', '\t\n', null, undefined]) {
    assert.equal(istGesetzt(leer), false, JSON.stringify(leer));
  }
});

// ---------------------------------------------------------------------------
// Was NICHT durchkommen darf
// ---------------------------------------------------------------------------

test('ein falsches Geheimnis kommt auf keinem Weg durch', () => {
  const wege = [
    { authKopf: 'Bearer falsch' },
    { authKopf: 'falsch' },
    { adresse: 'falsch' },
    { altKopf: 'falsch' },
    { authKopf: `Bearer ${GEHEIM}x` },
    { adresse: GEHEIM.slice(0, -1) },
  ];
  for (const w of wege) {
    const e = cronZugang({ geheimnis: GEHEIM, altGeheimnis: ALT, ...w });
    assert.equal(e.frei, false, JSON.stringify(w) + ' kam durch');
    assert.equal(e.grund, 'kein-treffer');
  }
});

test('ein Praefix des Geheimnisses genuegt nicht', () => {
  for (let i = 1; i < GEHEIM.length; i++) {
    const e = cronZugang({ geheimnis: GEHEIM, adresse: GEHEIM.slice(0, i) });
    assert.equal(e.frei, false, `Praefix der Laenge ${i} kam durch`);
  }
});

test('das Alt-Geheimnis oeffnet nicht den Haupt-Weg und umgekehrt', () => {
  // Wenn nur das Haupt-Geheimnis gesetzt ist, darf der Alt-Kopf nichts bewirken.
  const e = cronZugang({ geheimnis: GEHEIM, altGeheimnis: null, altKopf: ALT });
  assert.equal(e.frei, false);
});

test('leerer Kopf und leere Adresse oeffnen nichts', () => {
  const e = cronZugang({ geheimnis: GEHEIM, authKopf: '', adresse: '', altKopf: '' });
  assert.equal(e.frei, false);
  assert.equal(e.grund, 'kein-treffer');
});

test('"Bearer" allein ohne Wert oeffnet nichts', () => {
  for (const kopf of ['Bearer', 'Bearer ', 'Bearer   ']) {
    const e = cronZugang({ geheimnis: GEHEIM, authKopf: kopf });
    assert.equal(e.frei, false, JSON.stringify(kopf) + ' kam durch');
  }
});

// ---------------------------------------------------------------------------
// Der Adress-Weg: heute erlaubt, abschaltbar
// ---------------------------------------------------------------------------

test('der Adress-Weg laesst sich abschalten, ohne die Kopfzeile zu stoeren', () => {
  const aus = cronZugang({ geheimnis: GEHEIM, adresse: GEHEIM, adresseErlaubt: false });
  assert.equal(aus.frei, false, 'abgeschalteter Adress-Weg kam durch');

  const kopfGehtWeiter = cronZugang({
    geheimnis: GEHEIM, authKopf: `Bearer ${GEHEIM}`, adresseErlaubt: false,
  });
  assert.equal(kopfGehtWeiter.frei, true, 'der Zeitplan-Weg darf davon NICHT betroffen sein');
});

test('der Adress-Weg ist voreingestellt erlaubt — niemand wird ausgesperrt', () => {
  assert.equal(cronZugang({ geheimnis: GEHEIM, adresse: GEHEIM }).frei, true);
  assert.equal(cronZugang({ geheimnis: GEHEIM, adresse: GEHEIM, adresseErlaubt: undefined }).frei, true);
});

test('der Weg wird benannt, damit man ihn im Protokoll sieht', () => {
  assert.equal(cronZugang({ geheimnis: GEHEIM, adresse: GEHEIM }).weg, 'adresse');
  assert.equal(cronZugang({ geheimnis: GEHEIM, authKopf: `Bearer ${GEHEIM}` }).weg, 'bearer');
});

// ---------------------------------------------------------------------------
// Kleinigkeiten, die in der Praxis vorkommen
// ---------------------------------------------------------------------------

test('Bearer wird unabhaengig von Gross- und Kleinschreibung gelesen', () => {
  for (const kopf of [`Bearer ${GEHEIM}`, `bearer ${GEHEIM}`, `BEARER ${GEHEIM}`]) {
    assert.equal(cronZugang({ geheimnis: GEHEIM, authKopf: kopf }).frei, true, kopf);
  }
});

test('zusaetzliche Leerzeichen um den Wert stoeren nicht', () => {
  assert.equal(cronZugang({ geheimnis: GEHEIM, authKopf: `  Bearer   ${GEHEIM}  ` }).frei, true);
  assert.equal(cronZugang({ geheimnis: `  ${GEHEIM}  `, authKopf: `Bearer ${GEHEIM}` }).frei, true);
  assert.equal(cronZugang({ geheimnis: GEHEIM, adresse: ` ${GEHEIM} ` }).frei, true);
});

test('das Geheimnis darf auch ohne Bearer im Kopf stehen', () => {
  // Manche Werkzeuge setzen den nackten Wert. Das war in den Altwegen schon so.
  assert.equal(cronZugang({ geheimnis: GEHEIM, authKopf: GEHEIM }).frei, true);
});

// ---------------------------------------------------------------------------
// Der zeitkonstante Vergleich
// ---------------------------------------------------------------------------

test('gleichOhneZeitverrat entscheidet wie ===', () => {
  const paare = [
    ['abc', 'abc', true], ['abc', 'abd', false],
    ['', '', true], ['', 'a', false], ['a', '', false],
    ['abc', 'abcd', false], ['abcd', 'abc', false],
    ['äöü', 'äöü', true], ['äöü', 'äöu', false],
    [GEHEIM, GEHEIM, true], [GEHEIM, GEHEIM.toUpperCase(), false],
  ];
  for (const [a, b, soll] of paare) {
    assert.equal(gleichOhneZeitverrat(a, b), soll, `${a} / ${b}`);
  }
});

test('gleichOhneZeitverrat springt bei ungleicher Laenge nicht heraus', () => {
  // Der Kern: unterschiedliche Laengen duerfen NICHT frueh mit false abbrechen,
  // sonst verraet die Laufzeit die Laenge des Geheimnisses. Geprueft wird das
  // Ergebnis — die Laufzeit selbst ist in einem Test nicht verlaesslich messbar.
  assert.equal(gleichOhneZeitverrat('a', 'a'.repeat(500)), false);
  assert.equal(gleichOhneZeitverrat('a'.repeat(500), 'a'), false);
});

// ---------------------------------------------------------------------------
// Der Klartext — darf nie etwas verraten
// ---------------------------------------------------------------------------

test('WAECHTER: der Klartext enthaelt niemals das Geheimnis', () => {
  const faelle = [
    cronZugang({ geheimnis: GEHEIM, authKopf: `Bearer ${GEHEIM}` }),
    cronZugang({ geheimnis: GEHEIM, adresse: GEHEIM }),
    cronZugang({ geheimnis: GEHEIM, altGeheimnis: ALT, altKopf: ALT }),
    cronZugang({ geheimnis: GEHEIM, authKopf: 'Bearer falsch' }),
    cronZugang({ geheimnis: null }),
  ];
  for (const f of faelle) {
    const text = cronZugangKlartext(f);
    assert.ok(text.length > 0);
    assert.ok(!text.includes(GEHEIM), 'Geheimnis im Klartext: ' + text);
    assert.ok(!text.includes(ALT), 'Alt-Geheimnis im Klartext: ' + text);
    // Auch kein Anfangsstueck — acht Zeichen genuegen zum Abtasten.
    assert.ok(!text.includes(GEHEIM.slice(0, 8)), 'Anfangsstueck im Klartext: ' + text);
  }
});

test('der Klartext unterscheidet die beiden Absage-Gruende', () => {
  const ohne = cronZugangKlartext(cronZugang({ geheimnis: null }));
  const falsch = cronZugangKlartext(cronZugang({ geheimnis: GEHEIM, adresse: 'falsch' }));
  assert.notEqual(ohne, falsch);
  assert.ok(ohne.includes('kein Geheimnis hinterlegt'));
});

// ---------------------------------------------------------------------------
// WAECHTER gegen kuenftige Aenderungen
// ---------------------------------------------------------------------------

test('WAECHTER: es gibt genau vier Wege hinein, nicht mehr', () => {
  const wege = new Set();
  const proben = [
    { geheimnis: GEHEIM, authKopf: `Bearer ${GEHEIM}` },
    { geheimnis: GEHEIM, adresse: GEHEIM },
    { geheimnis: GEHEIM, altGeheimnis: ALT, authKopf: `Bearer ${ALT}` },
    { geheimnis: GEHEIM, altGeheimnis: ALT, altKopf: ALT },
  ];
  for (const p of proben) {
    const e = cronZugang(p);
    assert.equal(e.frei, true, JSON.stringify(p));
    wege.add(e.weg);
  }
  assert.deepEqual([...wege].sort(), ['adresse', 'alt-bearer', 'alt-header', 'bearer']);
});

test('WAECHTER: kein unbekanntes Feld oeffnet einen Weg', () => {
  // Wenn jemand spaeter ein Feld ergaenzt und die Pruefung vergisst, faellt es
  // hier auf: ein Aufruf ohne passenden Wert bleibt draussen.
  const e = cronZugang({
    geheimnis: GEHEIM,
    // @ts-expect-error absichtlich unbekannt
    irgendwas: GEHEIM, token: GEHEIM, apiKey: GEHEIM,
  });
  assert.equal(e.frei, false);
});
