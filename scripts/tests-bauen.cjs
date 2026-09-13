#!/usr/bin/env node
// ============================================================================
// ARGONAUT OS · scripts/tests-bauen.cjs
//
// Übersetzt alle Logik-Dateien, die von den Tests gebraucht werden, nach out/.
//
// ▄▄▄ WARUM ES DAS BRAUCHT ▄▄▄
// Die Tests unter tests/ importieren aus '../out/<name>.js'. Dieses out/ steht
// nicht im Repo (.gitignore) und wurde nur gelegentlich von Hand gefüllt — am
// 13.09.2026 lagen dort 8 Dateien bei 33 Test-Dateien. Wer `node --test tests/`
// startete, bekam für die übrigen 25 ein MODULE_NOT_FOUND und konnte meinen,
// die Tests seien kaputt. Sie waren es nie; es fehlte die Übersetzung.
//
// ▄▄▄ WARUM GEBÜNDELT ▄▄▄
// Manche Logik-Dateien greifen auf andere zu (abTest -> mailMessung,
// freebie -> newsletter). TypeScript schreibt solche Importe ohne .js-Endung;
// Node im ESM-Betrieb verlangt sie aber. Deshalb wird gebündelt: was
// dazugehört, landet in derselben Datei, und kein Import zeigt ins Leere.
//
// ▄▄▄ WARUM ES AM 13.09. ABENDS FEHLSCHLUG ▄▄▄
// Der erste Entwurf rief esbuild über `npx.cmd` auf. Node weigert sich unter
// Windows seit 18.20/20.12, eine .cmd-Datei ohne Shell zu starten (Schutz vor
// CVE-2024-27980) und antwortet mit "spawnSync npx.cmd EINVAL". Deshalb jetzt
// drei Wege, in dieser Reihenfolge:
//   1. esbuild als Modul laden und seine JS-Schnittstelle nutzen — dabei
//      entsteht überhaupt kein Unterprozess, also auch kein EINVAL.
//   2. Die Programmdatei in node_modules/.bin — unter Windows über die Shell.
//   3. npx — ebenfalls über die Shell, mit von Hand gesetzten Anführungszeichen.
// Weg 1 greift, sobald `npm install` gelaufen ist: esbuild steht seit dem
// 13.09. als devDependency in der package.json.
//
// ▄▄▄ WARUM PLATFORM NODE ▄▄▄
// Erst hieß es hier "neutral". Dann fiel lib/whatsappEingang.ts durch: die
// Datei holt sich createHmac aus 'node:crypto'. Bei "neutral" kennt esbuild
// die eingebauten Node-Bausteine nicht und meldet "Could not resolve". Die
// Tests laufen ohnehin in Node — also ist "node" die richtige Ansage: Node
// bringt crypto, fs und Konsorten selbst mit, sie bleiben außen vor.
//
// Aufruf:  node scripts/tests-bauen.cjs                (alle)
//          node scripts/tests-bauen.cjs segmente abTest (nur diese)
// ============================================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.resolve(__dirname, '..');
const TESTS = path.join(WURZEL, 'tests');
const AUS = path.join(WURZEL, 'out');
const WINDOWS = process.platform === 'win32';

/** Wo nach einer Logik-Datei gesucht wird — in dieser Reihenfolge. */
const ORTE = [
  (name) => path.join(WURZEL, 'lib', name + '.ts'),
  (name) => path.join(WURZEL, 'app', 'dashboard', '_components', name + '.ts'),
  (name) => path.join(WURZEL, 'app', 'vorschau', '_lib', name + '.ts'),
  (name) => path.join(WURZEL, 'lib', name + '.tsx'),
];

function quelleFuer(name) {
  for (const ort of ORTE) {
    const p = ort(name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Alle Namen, die die Tests aus ../out/ importieren. */
function gebrauchteNamen() {
  if (!fs.existsSync(TESTS)) return [];
  const namen = new Set();
  for (const datei of fs.readdirSync(TESTS)) {
    if (!datei.endsWith('.test.mjs')) continue;
    const inhalt = fs.readFileSync(path.join(TESTS, datei), 'utf8');
    const treffer = inhalt.matchAll(/from\s+['"]\.\.\/out\/([A-Za-z0-9_-]+)\.js['"]/g);
    for (const t of treffer) namen.add(t[1]);
  }
  return [...namen].sort();
}

// ---------------------------------------------------------------------------
// Weg 1: esbuild als Modul
// ---------------------------------------------------------------------------

function esbuildModul() {
  try {
    // Ausdrücklich aus dem Repo auflösen, nicht aus irgendeinem Elternordner.
    const pfad = require.resolve('esbuild', { paths: [WURZEL] });
    const mod = require(pfad);
    if (mod && typeof mod.buildSync === 'function') return mod;
  } catch {
    /* nicht installiert — dann eben über die Shell */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Weg 2 und 3: esbuild als Programm, unter Windows immer über die Shell
// ---------------------------------------------------------------------------

/** Setzt Anführungszeichen, wo die Shell sonst am Leerzeichen zerteilen würde. */
function zitiere(wert) {
  if (!/[\s&|<>^()"']/.test(wert)) return wert;
  return '"' + String(wert).replace(/"/g, '\\"') + '"';
}

function esbuildProgramm() {
  const bin = path.join(
    WURZEL, 'node_modules', '.bin',
    WINDOWS ? 'esbuild.cmd' : 'esbuild',
  );
  if (fs.existsSync(bin)) {
    return { befehl: bin, vorne: [], ueberShell: WINDOWS, woher: 'node_modules/.bin' };
  }
  return {
    befehl: WINDOWS ? 'npx.cmd' : 'npx',
    vorne: ['--yes', 'esbuild'],
    ueberShell: WINDOWS,
    woher: 'npx',
  };
}

function baueMitProgramm(werkzeug, quelle, ziel) {
  const roh = [
    ...werkzeug.vorne,
    quelle,
    '--bundle',
    '--format=esm',
    '--platform=node',
    '--outfile=' + ziel,
    '--log-level=warning',
  ];
  // Bei shell:true reicht Node die Teile unverändert an cmd.exe weiter und
  // zerteilt dort an jedem Leerzeichen. Also selbst in Anführungszeichen setzen.
  const args = werkzeug.ueberShell ? roh.map(zitiere) : roh;
  const befehl = werkzeug.ueberShell ? zitiere(werkzeug.befehl) : werkzeug.befehl;
  execFileSync(befehl, args, {
    stdio: 'pipe',
    cwd: WURZEL,
    shell: werkzeug.ueberShell,
    windowsHide: true,
  });
}

// ---------------------------------------------------------------------------

function main() {
  const nurDiese = process.argv.slice(2);
  const alle = gebrauchteNamen();
  const namen = nurDiese.length > 0 ? alle.filter((n) => nurDiese.includes(n)) : alle;

  if (namen.length === 0) {
    console.log('Keine Test-Importe aus ../out/ gefunden. Nichts zu tun.');
    return;
  }

  fs.mkdirSync(AUS, { recursive: true });

  const modul = esbuildModul();
  const werkzeug = modul ? null : esbuildProgramm();
  const tsconfig = path.join(WURZEL, 'tsconfig.json');
  const hatTsconfig = fs.existsSync(tsconfig);

  const gebaut = [];
  const ohneQuelle = [];
  const kaputt = [];

  for (const name of namen) {
    const quelle = quelleFuer(name);
    if (!quelle) { ohneQuelle.push(name); continue; }
    const ziel = path.join(AUS, name + '.js');
    try {
      if (modul) {
        modul.buildSync({
          entryPoints: [quelle],
          outfile: ziel,
          bundle: true,
          format: 'esm',
          platform: 'node',
          logLevel: 'warning',
          absWorkingDir: WURZEL,
          ...(hatTsconfig ? { tsconfig } : {}),
        });
      } else {
        baueMitProgramm(werkzeug, quelle, ziel);
      }
      gebaut.push(name);
    } catch (e) {
      const text = String((e && e.stderr) || (e && e.message) || e).trim();
      kaputt.push({ name, grund: text.split('\n').filter(Boolean)[0] || 'unbekannt' });
    }
  }

  console.log('');
  console.log('  esbuild:        ' + (modul ? 'als Modul aus node_modules' : 'über ' + werkzeug.woher));
  console.log('  übersetzt:      ' + gebaut.length + ' von ' + namen.length);
  if (ohneQuelle.length > 0) {
    console.log('  ohne Quelle:    ' + ohneQuelle.join(', '));
    console.log('                  (ein Test importiert etwas, das es nicht mehr gibt —');
    console.log('                   entweder umbenannt oder der Test ist veraltet)');
  }
  if (kaputt.length > 0) {
    console.log('  nicht gebaut:');
    for (const k of kaputt) console.log('    ' + k.name + ' — ' + k.grund);
    if (!modul) {
      console.log('');
      console.log('  Hinweis: esbuild liegt nicht in node_modules. Ein einziges');
      console.log('           npm install -D esbuild  behebt das dauerhaft.');
    }
  }
  console.log('');

  // Ein fehlendes Gegenstück ist kein Grund, gar nicht zu testen: die anderen
  // laufen trotzdem. Nur ein echter Übersetzungsfehler bricht ab.
  if (kaputt.length > 0) process.exit(1);
}

main();
