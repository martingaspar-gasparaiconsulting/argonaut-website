// ============================================================================
// tests/schriftenP66.test.mjs
//
// PUNKT 66 — DIE SCHRIFTEN VEREINHEITLICHEN (21.09.2026)
//
// ▄▄▄ WAS BEIM NACHSEHEN HERAUSKAM ▄▄▄
// Der Punkt stand seit Langem auf "ganz zum Schluss". Beim Hinsehen am
// echten Code zeigte sich: die Vereinheitlichung ist LAENGST GEBAUT.
// app/globals.css leitet die Ueberschriften-Variable --font-syne per
// html:root auf DM Sans um, und html:root gewinnt gegen die
// next/font-Klasse. Es laeuft also bereits alles in einer Schrift.
//
// Offen war nur noch der Rest: app/layout.tsx LUD Syne trotzdem weiter,
// in FUENF Schnitten (400/500/600/700/800). Fuenf Schriftdateien, die bei
// jedem Seitenaufruf mitkamen und nirgends gerendert wurden.
//
// ▄▄▄ WARUM SICH NICHTS SICHTBAR AENDERT ▄▄▄
// Syne war schon vorher nicht zu sehen. Entfernt wird nur der Download.
// Deshalb verletzt dieser Schritt auch nicht die Abmachung, Schriftarbeit
// ganz zum Schluss zu machen: es ist keine Umstellung des Aussehens.
//
// ▄▄▄ WAS AUSDRUECKLICH NICHT DAZUGEHOERT ▄▄▄
// Die PDF-Belege laufen durchgehend auf der jsPDF-Standardschrift
// Helvetica - in sich einheitlich, aber eine andere Schrift als die App.
// Sie auf DM Sans umzustellen hiesse, die Schrift in jedes PDF
// einzubetten. Das macht jeden Beleg groesser und ist ein eigenes
// Vorhaben, kein Querschnitt. Steht als eigener Punkt zur Entscheidung.
//
// Diese Tests halten den Zustand fest, damit Syne nicht eines Tages
// unbemerkt zurueckkommt.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function lies(pfad) {
  return readFileSync(new URL('../' + pfad, import.meta.url), 'utf8');
}

test('die Umleitung auf eine einzige Schrift steht in globals.css', () => {
  const css = lies('app/globals.css');
  assert.match(css, /html:root\s*\{\s*--font-syne:\s*'DM Sans'/,
    'ohne diese Regel faellt die App wieder in zwei Schriften auseinander');
});

test('der Koerpertext haengt an DM Sans', () => {
  const css = lies('app/globals.css');
  assert.match(css, /font-family:\s*var\(--font-dm-sans\)/);
});

test('Syne wird nicht mehr geladen', () => {
  const layout = lies('app/layout.tsx');
  assert.ok(!/\bSyne\b\s*\(/.test(layout), 'Syne wird wieder als Schrift geladen');
  assert.ok(!/from 'next\/font\/google'[\s\S]{0,4}.*Syne/.test(layout));
  assert.ok(!layout.includes('syne.variable'),
    'die Syne-Variable haengt wieder in der Klasse');
});

test('DM Sans wird weiterhin geladen und eingehaengt', () => {
  const layout = lies('app/layout.tsx');
  assert.match(layout, /DM_Sans\(/);
  assert.match(layout, /className=\{dmSans\.variable\}/);
});

test('die Variable --font-syne bleibt definiert, auch ohne next/font', () => {
  // Sonst waere sie leer und alles, was sie benutzt, fiele auf die
  // Systemschrift zurueck. globals.css setzt sie selbst.
  const css = lies('app/globals.css');
  const treffer = css.match(/--font-syne:\s*([^;]+);/);
  assert.ok(treffer, '--font-syne wird nirgends mehr gesetzt');
  assert.match(treffer[1], /DM Sans/);
});
