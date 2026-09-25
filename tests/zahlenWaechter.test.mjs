// Zahlen-Querschnitt (25.09.2026): EIN Zahlen-Leser fuer das ganze System.
//
// Warum dieser Test: Die deutsche Schreibweise (1.500 = eintausendfuenfhundert,
// 1.500,50 mit Komma vor den Cent) war am 17.09. in lib/ repariert worden — die
// Seiten unter app/ hatten aber weiter ueber hundert eigene Leser. Dieser
// Waechter liest JEDE .ts/.tsx-Datei in app/ und lib/ und schlaegt an, sobald
// irgendwo wieder selbst Komma/Punkt getauscht oder parseFloat benutzt wird.
// Wer eine Zahl aus einem Feld liest, nimmt lib/zahlen.ts (leseZahl,
// leseZahlOder, zahlAusFeld) — und zum Vorbelegen eines Feldes zahlFeld.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { leseZahl, zahlAusFeld, zahlFeld, zahlText } from '../out/zahlen.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

/** Ausnahmen — jede mit Grund. Nur ganze Dateien, keine Pauschal-Ordner. */
const ERLAUBT = {
  'lib/zahlen.ts': 'der zentrale Leser selbst',
  'lib/gaeb.ts': 'GAEB-Datei: der Punkt ist dort laut Norm Dezimaltrenner',
  'lib/erechnung-parser.ts': 'E-Rechnung (XML): Maschinenformat, Punkt ist Dezimaltrenner',
  'lib/haccp.ts': 'Temperatur aus Freitext ("<= 7 °C"), nie Tausender',
  'app/dashboard/_components/aufmassLogik.ts': 'Aufmass: bewusst "1.234" = 1,234 mit Hinweis — Entscheidung bei Martin',
  'app/dashboard/_components/aufmassFormel.ts': 'Aufmass: wie aufmassLogik, meldet mehrdeutige Zahlen',
  'app/dashboard/_components/sortimentImportLogik.ts': 'Import: gleiche Regel (drei Stellen nach dem Punkt = Tausender)',
  'app/dashboard/_components/AdressBlock.tsx': 'Geo-Koordinaten: 48.6833 ist immer ein Dezimalpunkt',
  'app/dashboard/einstellungen/AnfahrtEinstellungen.tsx': 'Geo-Koordinaten: 48.6833 ist immer ein Dezimalpunkt',
};

const VERBOTEN = [
  { re: /\.replace\(\s*(['"]),\1\s*,\s*(['"])\.\2\s*\)/, was: "replace(',', '.')" },
  { re: /\.replace\(\s*\/,\/g?\s*,\s*(['"])\.\1\s*\)/, was: "replace(/,/g, '.')" },
  { re: /\.replace\(\s*\/\\\.\/g\s*,\s*(['"])\1\s*\)/, was: "replace(/\\./g, '')" },
  { re: /\bparseFloat\(/, was: 'parseFloat(' },
];

function alleDateien(ordner) {
  const aus = [];
  for (const e of fs.readdirSync(path.join(WURZEL, ordner), { withFileTypes: true })) {
    const rel = `${ordner}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== 'node_modules') aus.push(...alleDateien(rel)); }
    else if (/\.(ts|tsx)$/.test(e.name)) aus.push(rel);
  }
  return aus;
}

function codeOhneKommentare(zeile) {
  const t = zeile.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  const i = zeile.indexOf(' // ');
  return i >= 0 ? zeile.slice(0, i) : zeile;
}

test('Kein eigener Zahlen-Leser mehr in app/ und lib/', () => {
  const funde = [];
  for (const datei of [...alleDateien('app'), ...alleDateien('lib')]) {
    if (ERLAUBT[datei]) continue;
    const zeilen = fs.readFileSync(path.join(WURZEL, datei), 'utf8').split('\n');
    zeilen.forEach((z, i) => {
      const code = codeOhneKommentare(z);
      for (const v of VERBOTEN) if (v.re.test(code)) funde.push(`${datei}:${i + 1}  ${v.was}`);
    });
  }
  assert.deepEqual(funde, [], `Eigene Zahlen-Leser gefunden — bitte lib/zahlen.ts benutzen:\n${funde.join('\n')}`);
});

test('Jede Ausnahme gibt es noch (sonst gehoert sie aus der Liste)', () => {
  for (const datei of Object.keys(ERLAUBT)) assert.ok(fs.existsSync(path.join(WURZEL, datei)), datei);
});

test('Die deutsche Regel: Punkt trennt Tausender, Komma die Cent', () => {
  assert.equal(leseZahl('1.500'), 1500);
  assert.equal(leseZahl('10.000'), 10000);
  assert.equal(leseZahl('100.000'), 100000);
  assert.equal(leseZahl('1.000.000'), 1000000);
  assert.equal(leseZahl('1.500,50'), 1500.5);
  assert.equal(leseZahl('1.200,00'), 1200);
  assert.equal(leseZahl('12,5'), 12.5);
  assert.equal(leseZahl('0,99'), 0.99);
  assert.equal(leseZahl('1.234,56 €'), 1234.56);
});

test('Werte, die der Computer selbst mit Punkt schreibt, bleiben richtig', () => {
  assert.equal(leseZahl('119.5'), 119.5);     // Beleg-Erkennung liefert 119.5
  assert.equal(leseZahl('1234.56'), 1234.56);
  assert.equal(leseZahl('0.125'), 0.125);
});

test('zahlAusFeld verhaelt sich wie Number(), nur deutsch', () => {
  assert.equal(zahlAusFeld(''), 0);
  assert.equal(zahlAusFeld('   '), 0);
  assert.ok(Number.isNaN(zahlAusFeld('abc')));
  assert.ok(Number.isNaN(zahlAusFeld('8,20 x')));
  assert.equal(zahlAusFeld('1.500'), 1500);
  assert.equal(zahlAusFeld('1.500,50'), 1500.5);
  assert.equal(zahlAusFeld(42), 42);
  assert.equal(zahlAusFeld(null), 0);
});

test('zahlFeld: Vorbelegen und Wiederlesen ergibt denselben Wert', () => {
  for (const n of [2.125, 1500, 1500.5, 0.5, 19, 7, 1234.567, 0, -3.25]) {
    assert.equal(leseZahl(zahlFeld(n)), n, `Rundlauf ${n}`);
  }
  assert.equal(zahlFeld(2.125), '2,125');   // ohne das: "2.125" -> 2125
  assert.equal(zahlFeld(null), '');
  assert.equal(zahlFeld(undefined), '');
  assert.equal(zahlFeld('Stk'), 'Stk');
  assert.equal(zahlFeld(NaN), '');
});

test('zahlText: Anzeige deutsch mit Komma', () => {
  assert.equal(zahlText(1.5, 1), '1,5');
  assert.equal(zahlText(1234.5, 2), '1.234,50');
  assert.equal(zahlText(38, 1), '38,0');
  assert.equal(zahlText(null, 1), '—');
});
