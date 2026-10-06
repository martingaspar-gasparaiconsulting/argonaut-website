// Paket 224 (06.10.2026): Sperr-Gedächtnis — nichts vergessen beim Wiederöffnen.
// Liest die Schalter direkt aus dem Quelltext und vergleicht sie mit
// docs/ARGONAUT-SPERR-GEDAECHTNIS.md. Wer einen Schalter umlegt oder neu anlegt,
// ohne das Gedächtnis anzupassen, bekommt hier Rot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const DOC = lies('docs/ARGONAUT-SPERR-GEDAECHTNIS.md');

function schalterAusDoc() {
  const m = {};
  for (const z of DOC.split(/\r?\n/)) {
    const r = /^SCHALTER\s+([\w.]+)\s*=\s*(\w+)\s*$/.exec(z.trim());
    if (r) m[r[1]] = r[2];
  }
  return m;
}
function sperrenAusDoc(art) {
  return DOC.split(/\r?\n/).map((z) => new RegExp('^SPERRE dossier\\.' + art + ' = (.+)$').exec(z.trim())).filter(Boolean).map((r) => r[1].trim());
}
/** Liest ein Objekt der Form `NAME ... = Object.freeze({ key: true/false, ... })` aus dem Quelltext. */
function boolObjekt(datei, name) {
  const q = lies(datei);
  const i = q.indexOf('export const ' + name);
  assert.ok(i >= 0, name + ' fehlt in ' + datei);
  const block = q.slice(q.indexOf('{', q.indexOf('freeze(', i)) + 1, q.indexOf('})', i));
  const m = {};
  for (const r of block.matchAll(/(\w+)\s*:\s*(true|false)/g)) m[r[1]] = r[2] === 'true';
  return m;
}
function schluesselBlock(datei, name) {
  const q = lies(datei);
  const i = q.indexOf('export const ' + name);
  assert.ok(i >= 0, name);
  const s = q.indexOf('freeze({', i) + 8;
  let tiefe = 1; let j = s;
  while (tiefe > 0 && j < q.length) { if (q[j] === '{' || q[j] === '[') tiefe++; if (q[j] === '}' || q[j] === ']') tiefe--; j++; }
  const block = q.slice(s, j);
  // nur Schlüssel der obersten Ebene: '…': am Zeilenanfang (2 Leerzeichen)
  return [...block.matchAll(/^\s{2}'([^']+)'\s*:/gm)].map((r) => r[1]);
}

test('Start-Schalter und Import-Sperren stimmen mit dem Gedächtnis überein', () => {
  const doc = schalterAusDoc();
  for (const [datei, name, praefix] of [['lib/startSperre.ts', 'START_FREIGABE', 'startSperre'], ['lib/anwaltFreigabe.ts', 'ANWALT_FREIGABE', 'anwaltFreigabe']]) {
    const code = boolObjekt(datei, name);
    assert.ok(Object.keys(code).length >= 4, name);
    for (const [k, v] of Object.entries(code)) {
      const zeile = doc[praefix + '.' + k];
      assert.ok(zeile, `${praefix}.${k} steht nicht im Sperr-Gedächtnis`);
      assert.equal(zeile, v ? 'an' : 'aus', `${praefix}.${k}: Code ${v ? 'an' : 'aus'}, Gedächtnis ${zeile}`);
    }
    for (const k of Object.keys(doc).filter((x) => x.startsWith(praefix + '.'))) {
      assert.ok(k.slice(praefix.length + 1) in code, `${k} steht im Gedächtnis, aber nicht mehr im Code`);
    }
  }
});

test('Bestellstrecke und Zahlung stimmen mit dem Gedächtnis überein', () => {
  const doc = schalterAusDoc();
  const q = lies('lib/flags.ts');
  for (const k of ['BESTELLSTRECKE_LIVE', 'ZAHLUNG_LIVE']) {
    const r = new RegExp('export const ' + k + '\\s*=\\s*(true|false)').exec(q);
    assert.ok(r, k);
    assert.equal(doc['flags.' + k], r[1] === 'true' ? 'an' : 'aus', k);
  }
});

test('Kasse: Gedächtnis sagt demo, solange der Code nur Demo-Signaturen liefert', () => {
  const doc = schalterAusDoc();
  const q = lies('lib/kasse-tse.ts');
  const nurDemo = /IMMER modus: 'demo'/.test(q);
  assert.equal(doc['kasse.modus'], nurDemo ? 'demo' : 'live');
});

test('Dossier-Sperren: jeder gesperrte und jeder Teilbereich steht im Gedächtnis (und umgekehrt)', () => {
  const ganz = schluesselBlock('lib/dossierFreigabe.ts', 'GESPERRTE_BEREICHE');
  const teil = schluesselBlock('lib/dossierFreigabe.ts', 'FREI_IN_TEILBEREICH');
  assert.deepEqual([...sperrenAusDoc('bereich')].sort(), [...ganz].sort());
  assert.deepEqual([...sperrenAusDoc('teilbereich')].sort(), [...teil].sort());
});

test('Zurückgehaltene Branchen haben wirklich noch keinen Dossier-Text', () => {
  const q = lies('lib/fachdossier.ts');
  const teil = DOC.slice(DOC.indexOf('### Bewusst noch ohne Text'), DOC.indexOf('Regeln für alle Dossier-Texte'));
  const slugs = [...teil.matchAll(/`([a-z0-9-]+)`/g)].map((r) => r[1]);
  assert.ok(slugs.length >= 9);
  for (const s of slugs) assert.ok(!q.includes(`  '${s}': {`), s + ' hat inzwischen einen Text — Gedächtnis anpassen');
});

test('Gedächtnis nennt die acht Schritte zum Wiederöffnen', () => {
  for (const w of ['Antwort ablegen', 'Texte einbauen', 'Schalter umlegen', 'Diese Datei anpassen', 'AGB, Datenschutzerklärung und AV-Vertrag', 'Werbung nachziehen', 'Klicktest', 'Bauliste']) {
    assert.ok(DOC.includes(w), w);
  }
});
