import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sichererTyp, sichererDateiname, asciiName, contentDisposition,
  anhangIndex, ordnerErlaubt, suchText, suchKriterium, ordnerListe, groesseText,
  MAX_ANHANG_BYTES,
} from '../out/mailAbruf.js';

// ============================================================================
// Punkt 3.4 — Ordner, Suche und Anhang-Download im Posteingang.
//
// Der Schwerpunkt dieser Tests liegt auf dem Anhang. Ein Anhang ist eine
// Datei von einem Fremden, mit einem Namen und einem Typ, die er sich
// ausgesucht hat. Beides geht in HTTP-Kopfzeilen und in den Browser des
// Chefs. Die Tests halten fest, dass nichts davon ungeprüft durchrutscht.
// ============================================================================

// ------------------------------------------------------------- sichererTyp

test('nur harmlose Typen werden übernommen', () => {
  assert.equal(sichererTyp('application/pdf'), 'application/pdf');
  assert.equal(sichererTyp('image/png'), 'image/png');
  assert.equal(sichererTyp('APPLICATION/PDF'), 'application/pdf', 'Grossschreibung egal');
  assert.equal(sichererTyp('text/plain; charset=utf-8'), 'text/plain', 'Parameter fliegen weg');
});

test('gefährliche Typen werden zu octet-stream', () => {
  assert.equal(sichererTyp('text/html'), 'application/octet-stream', 'HTML wuerde im Dashboard laufen');
  assert.equal(sichererTyp('image/svg+xml'), 'application/octet-stream', 'SVG kann Skript enthalten');
  assert.equal(sichererTyp('application/xhtml+xml'), 'application/octet-stream');
  assert.equal(sichererTyp('application/javascript'), 'application/octet-stream');
  assert.equal(sichererTyp(''), 'application/octet-stream');
  assert.equal(sichererTyp(null), 'application/octet-stream');
  assert.equal(sichererTyp(undefined), 'application/octet-stream');
  assert.equal(sichererTyp(42), 'application/octet-stream');
});

test('ein Schmuggel-Typ hinter dem Semikolon hilft nicht', () => {
  assert.equal(sichererTyp('application/pdf; name="x.html"'), 'application/pdf');
  assert.equal(sichererTyp('text/html; charset=utf-8'), 'application/octet-stream');
});

// -------------------------------------------------------- sichererDateiname

test('Pfadanteile werden abgeschnitten', () => {
  assert.equal(sichererDateiname('../../etc/passwd'), 'passwd');
  assert.equal(sichererDateiname('C:\\Windows\\system32\\x.dll'), 'x.dll');
  assert.equal(sichererDateiname('/tmp/rechnung.pdf'), 'rechnung.pdf');
});

test('Zeichen, die eine Kopfzeile aufbrechen, fliegen raus', () => {
  assert.equal(sichererDateiname('a"b.pdf'), 'ab.pdf');
  assert.equal(sichererDateiname('a;b.pdf'), 'ab.pdf');
  assert.equal(sichererDateiname('a\r\nSet-Cookie: x=1'), 'aSet-Cookie: x=1'.replace(/["';\r\n]/g, ''));
  assert.equal(/[\r\n"';]/.test(sichererDateiname('x"\r\n;y.pdf')), false);
});

test('leerer oder unbrauchbarer Name wird zu "anhang"', () => {
  assert.equal(sichererDateiname(''), 'anhang');
  assert.equal(sichererDateiname(null), 'anhang');
  assert.equal(sichererDateiname('   '), 'anhang');
  assert.equal(sichererDateiname('...'), 'anhang');
  assert.equal(sichererDateiname('/'), 'anhang');
});

test('Umlaute bleiben erhalten, die Länge wird begrenzt', () => {
  assert.equal(sichererDateiname('Angebot Müller.pdf'), 'Angebot Müller.pdf');
  assert.equal(sichererDateiname('x'.repeat(500)).length, 200);
});

// ------------------------------------------------------ contentDisposition

test('Content-Disposition ist IMMER attachment, nie inline', () => {
  const d = contentDisposition('rechnung.pdf');
  assert.match(d, /^attachment;/);
  assert.equal(d.includes('inline'), false);
});

test('Content-Disposition liefert ASCII und UTF-8 nebeneinander', () => {
  const d = contentDisposition('Angebot Müller.pdf');
  assert.match(d, /filename="Angebot M_ller\.pdf"/, 'ASCII-Fassung mit Ersatzzeichen');
  assert.match(d, /filename\*=UTF-8''Angebot%20M%C3%BCller\.pdf/, 'echte Fassung mit Umlaut');
});

test('ein Name mit Kopfzeilen-Schmuggel kann die Kopfzeile nicht aufbrechen', () => {
  const d = contentDisposition('x.pdf"\r\nSet-Cookie: a=b');
  assert.equal(/[\r\n]/.test(d), false, 'kein Zeilenumbruch im Kopfzeilenwert');
  assert.equal(d.split('"').length, 3, 'genau ein Paar Anfuehrungszeichen');
});

test('asciiName ersetzt alles Fremde', () => {
  assert.equal(asciiName('Grüße.txt'), 'Gr__e.txt');
  assert.equal(asciiName('日本語'), '___');
});

// -------------------------------------------------------------- anhangIndex

test('nur echte Indizes werden akzeptiert', () => {
  assert.equal(anhangIndex('0'), 0);
  assert.equal(anhangIndex('12'), 12);
  assert.equal(anhangIndex(''), null);
  assert.equal(anhangIndex('-1'), null);
  assert.equal(anhangIndex('1.5'), null);
  assert.equal(anhangIndex('abc'), null);
  assert.equal(anhangIndex('999'), null, 'ab 200 ist Schluss');
  assert.equal(anhangIndex(null), null);
});

// ------------------------------------------------------------ ordnerErlaubt

test('ohne Wunsch wird INBOX geöffnet', () => {
  assert.equal(ordnerErlaubt('', ['INBOX', 'Gesendet']), 'INBOX');
  assert.equal(ordnerErlaubt(null, ['INBOX']), 'INBOX');
});

test('nur ein Ordner, den der Server selbst gemeldet hat, wird geöffnet', () => {
  assert.equal(ordnerErlaubt('Gesendet', ['INBOX', 'Gesendet']), 'Gesendet');
  assert.equal(ordnerErlaubt('Papierkorb', ['INBOX', 'Gesendet']), null, 'nicht gemeldet = kein Rateversuch');
});

test('INBOX geht immer, auch in anderer Schreibweise', () => {
  assert.equal(ordnerErlaubt('inbox', []), 'INBOX');
});

test('Ordnername mit Zeilenumbruch wird abgelehnt', () => {
  assert.equal(ordnerErlaubt('INBOX\r\nX', ['INBOX\r\nX']), null);
  assert.equal(ordnerErlaubt('x'.repeat(201), []), null);
});

// ----------------------------------------------------------------- Suche

test('leerer Suchtext heisst: nicht suchen', () => {
  assert.equal(suchText(''), null);
  assert.equal(suchText('   '), null);
  assert.equal(suchText(null), null);
});

test('Suchtext wird getrimmt und begrenzt', () => {
  assert.equal(suchText('  Müller  '), 'Müller');
  assert.equal(suchText('x'.repeat(300)).length, 100);
});

test('das Suchkriterium ist ein Objekt, kein zusammengebauter Text', () => {
  const k = suchKriterium('Müller');
  assert.deepEqual(k, { or: [{ subject: 'Müller' }, { from: 'Müller' }] });
  assert.equal(typeof k, 'object');
});

// ---------------------------------------------------------- ordnerListe

test('Ordnerliste: ohne Duplikate, ohne leere, INBOX zuerst', () => {
  const l = ordnerListe([
    { path: 'Gesendet' }, { path: 'INBOX' }, { path: '' },
    { path: 'Gesendet' }, { path: 'Archiv' }, { path: null },
  ]);
  assert.deepEqual(l, ['INBOX', 'Archiv', 'Gesendet']);
});

test('Ordnerliste mit nichts drin bleibt leer', () => {
  assert.deepEqual(ordnerListe([]), []);
  assert.deepEqual(ordnerListe(null), []);
  assert.deepEqual(ordnerListe(undefined), []);
});

// ---------------------------------------------------------- groesseText

test('Größen werden lesbar', () => {
  assert.equal(groesseText(0), '');
  assert.equal(groesseText(512), '512 B');
  assert.equal(groesseText(2048), '2 KB');
  assert.equal(groesseText(3 * 1024 * 1024), '3,0 MB');
  assert.equal(groesseText('keine Zahl'), '');
});

test('die Obergrenze steht fest und ist nicht 0', () => {
  assert.equal(MAX_ANHANG_BYTES, 20 * 1024 * 1024);
});
