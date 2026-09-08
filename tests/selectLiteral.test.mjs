import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// ARGONAUT OS · Wächter: Spaltenlisten sind einzelne Zeichenketten   (B10)
//
// WARUM ES DIESEN TEST GIBT:
// Der Supabase-Client liest die Spaltenliste in `.select(...)` auf TYP-Ebene
// aus. Sie muss deshalb EINE Zeichenkette sein. Wer sie mit `+` über zwei
// Zeilen zusammensetzt — was beim Formatieren einer langen Zeile ganz
// natürlich passiert — bekommt für den Compiler nur noch `string`. Die
// Abfrage liefert dann `GenericStringError[]` statt der Zeilen, und
// `npx next build` bricht ab. Zur Laufzeit hätte alles funktioniert.
//
// Das ist am 08.09.26 genau so passiert (D5, Werbe-Spalten auf `kontakte`)
// und hat einen ganzen Push gekostet. Die Prüf-Umgebung kann es nicht sehen,
// weil dort ein Stub steht — also fängt es dieser Test ab, vor dem Push.
// ============================================================================

const ORDNER = ['app', 'lib'];
const ENDUNGEN = ['.ts', '.tsx'];

function dateien(pfad) {
  let raus = [];
  let eintraege;
  try { eintraege = readdirSync(pfad); } catch { return raus; }
  for (const e of eintraege) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue;
    const voll = join(pfad, e);
    let s;
    try { s = statSync(voll); } catch { continue; }
    if (s.isDirectory()) raus = raus.concat(dateien(voll));
    else if (ENDUNGEN.some((x) => e.endsWith(x))) raus.push(voll);
  }
  return raus;
}

/**
 * Findet `.select('…'` und schaut, was direkt nach dem schließenden
 * Anführungszeichen kommt. Ein `+` dort bedeutet: zusammengesetzt.
 */
function gestueckelteSelects(inhalt) {
  const treffer = [];
  const re = /\.select\(\s*(['"`])/g;
  let m;
  while ((m = re.exec(inhalt)) !== null) {
    const anfuehrung = m[1];
    let i = m.index + m[0].length;
    // Bis zum schließenden Anführungszeichen laufen (Escapes beachten).
    while (i < inhalt.length) {
      if (inhalt[i] === '\\') { i += 2; continue; }
      if (inhalt[i] === anfuehrung) break;
      i++;
    }
    i++; // hinter das schließende Zeichen
    while (i < inhalt.length && /\s/.test(inhalt[i])) i++;
    if (inhalt[i] === '+') {
      const zeile = inhalt.slice(0, m.index).split('\n').length;
      treffer.push(zeile);
    }
  }
  return treffer;
}

test('keine .select()-Spaltenliste ist mit + zusammengesetzt', () => {
  const gefunden = [];
  for (const ordner of ORDNER) {
    for (const d of dateien(ordner)) {
      const inhalt = readFileSync(d, 'utf8');
      for (const zeile of gestueckelteSelects(inhalt)) {
        gefunden.push(`${d}:${zeile}`);
      }
    }
  }
  assert.deepEqual(
    gefunden, [],
    'Diese select()-Aufrufe setzen die Spaltenliste mit + zusammen. '
    + 'Der Compiler sieht dann nur noch `string` und die Abfrage liefert '
    + 'GenericStringError statt der Zeilen — der Build bricht ab. '
    + 'Bitte die Spaltenliste in EINE Zeichenkette schreiben:\n  '
    + gefunden.join('\n  '),
  );
});

// ---- Der Wächter selbst wird geprüft: Er muss anschlagen können. ----

test('der Wächter erkennt eine zusammengesetzte Liste', () => {
  const boese = "supabase.from('x').select('a, b, '\n  + 'c, d')";
  assert.equal(gestueckelteSelects(boese).length, 1);
});

test('der Wächter schlägt bei einer sauberen Liste NICHT an', () => {
  const gut = "supabase.from('x').select('a, b, c, d').eq('id', 1)";
  assert.deepEqual(gestueckelteSelects(gut), []);
});

test('ein + nach dem select-Aufruf ist kein Treffer', () => {
  const harmlos = "const n = obj.select('a, b').laenge + 1;";
  assert.deepEqual(gestueckelteSelects(harmlos), []);
});

test('mehrere Treffer in einer Datei werden alle gemeldet', () => {
  const zwei = "a.select('a, '\n + 'b')\n\nb.select('c, '\n + 'd')";
  assert.equal(gestueckelteSelects(zwei).length, 2);
});

test('gemeldet wird die Zeilennummer, nicht nur die Anzahl', () => {
  const drin = "// Kopf\n// Kopf\nx.select('a, '\n  + 'b')";
  assert.deepEqual(gestueckelteSelects(drin), [3]);
});
