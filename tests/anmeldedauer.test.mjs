import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MERK_COOKIE, BLEIBEN_SEKUNDEN, MERK_SEKUNDEN, HAEKCHEN_HINWEIS,
  dauerFuer, leseWunsch, wunschAusWert, merkCookieText, dauerText,
} from '../out/anmeldedauer.js';

// ============================================================================
// Diese Tests halten die Entscheidungen vom 08.09.26 fest. Sie betreffen die
// Anmeldung — wer hier etwas ändert, sollte den Grund kennen.
// ============================================================================

test('„Angemeldet bleiben" heißt 30 Tage, nicht 400', () => {
  assert.equal(BLEIBEN_SEKUNDEN, 30 * 24 * 60 * 60);
  // Die Vorgabe der Bibliothek lag bei 400 Tagen — das war nie eine Wahl.
  assert.ok(BLEIBEN_SEKUNDEN < 400 * 24 * 60 * 60);
});

test('ohne Haken gibt es KEIN maxAge — Sitzungs-Cookie', () => {
  const ohne = dauerFuer(false);
  assert.equal(ohne.maxAge, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(ohne, 'maxAge'), false);
});

test('maxAge 0 wäre der Fehler, den man hier leicht macht', () => {
  // maxAge: 0 löscht das Cookie sofort und meldet den Menschen im selben
  // Moment wieder ab. Deshalb darf es nirgends auftauchen.
  assert.notEqual(dauerFuer(false).maxAge, 0);
  assert.equal(dauerFuer(true).maxAge, BLEIBEN_SEKUNDEN);
});

test('das Merk-Cookie überlebt die Sitzung, für die es gilt', () => {
  assert.ok(MERK_SEKUNDEN > BLEIBEN_SEKUNDEN,
    'sonst verfällt die Entscheidung vor der Anmeldung, auf die sie sich bezieht');
});

// ---------- Auslesen ----------

test('fehlendes Cookie heißt: angemeldet bleiben', () => {
  // Wer heute angemeldet ist, hat nie eine Wahl getroffen. Ihn beim nächsten
  // Seitenaufruf hinauszuwerfen wäre eine Verschlechterung ohne Ansage.
  assert.equal(leseWunsch(''), true);
  assert.equal(leseWunsch(null), true);
  assert.equal(leseWunsch('andere=werte; noch_eine=1'), true);
});

test('nur eine ausdrückliche 0 schaltet ab', () => {
  assert.equal(leseWunsch(`${MERK_COOKIE}=0`), false);
  assert.equal(leseWunsch(`${MERK_COOKIE}=1`), true);
  assert.equal(leseWunsch(`vorher=x; ${MERK_COOKIE}=0; nachher=y`), false);
  assert.equal(leseWunsch(`vorher=x; ${MERK_COOKIE}=1; nachher=y`), true);
});

test('ein ähnlich heißendes Cookie wird nicht verwechselt', () => {
  assert.equal(leseWunsch(`mein_${MERK_COOKIE}=0`), true, 'nur der genaue Name zählt');
  assert.equal(leseWunsch(`${MERK_COOKIE}_alt=0`), true);
});

test('wunschAusWert für Proxy und Server', () => {
  assert.equal(wunschAusWert('0'), false);
  assert.equal(wunschAusWert(' 0 '), false);
  assert.equal(wunschAusWert('1'), true);
  assert.equal(wunschAusWert(undefined), true);
  assert.equal(wunschAusWert(''), true);
});

// ---------- Schreiben ----------

test('merkCookieText: mit Haken dauerhaft, ohne Haken Sitzung', () => {
  const mit = merkCookieText(true);
  assert.match(mit, new RegExp(`^${MERK_COOKIE}=1`));
  assert.match(mit, /Max-Age=\d+/);
  assert.match(mit, /Path=\//);
  assert.match(mit, /SameSite=Lax/);

  const ohne = merkCookieText(false);
  assert.match(ohne, new RegExp(`^${MERK_COOKIE}=0`));
  assert.ok(!/Max-Age/.test(ohne), 'ohne Haken kein Max-Age — sonst überlebt die Wahl den Browser');
});

test('das Merk-Cookie enthält kein Geheimnis', () => {
  for (const b of [true, false]) {
    const t = merkCookieText(b);
    assert.match(t, /=(0|1);/, 'nur 0 oder 1');
    assert.ok(t.length < 120, 'kein Token, keine Kennung');
  }
});

// ---------- Texte ----------

test('dauerText sagt in Klartext, was passiert', () => {
  assert.match(dauerText(true), /30 Tage/);
  assert.match(dauerText(false), /Browser schließen/);
  for (const b of [true, false]) {
    const t = dauerText(b);
    assert.ok(!/\bdu\b|\bdein/i.test(t), 'siezt');
    assert.ok(!/fuer|ueber|koennen|schliessen/.test(t), 'echte Umlaute');
  }
});

test('der Hinweis nennt den Grund, nicht nur die Regel', () => {
  assert.match(HAEKCHEN_HINWEIS, /fremden/);
  assert.match(HAEKCHEN_HINWEIS, /Browser/);
  assert.ok(!/\bdu\b|\bdein/i.test(HAEKCHEN_HINWEIS));
});
