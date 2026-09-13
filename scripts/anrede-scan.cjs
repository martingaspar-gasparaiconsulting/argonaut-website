#!/usr/bin/env node
// ============================================================================
// ARGONAUT OS · scripts/anrede-scan.cjs — Punkt 3.1, Paket 9
//
// Durchsucht app/, lib/ und components/ nach Anrede-Stellen und schreibt eine
// Arbeitsliste nach supabase-sql/_BEFUND-anrede-3.txt.
//
// ▄▄▄ WARUM ES DIESE ZWEITE FASSUNG GIBT ▄▄▄
// Der alte Scan (_BEFUND-anrede.txt, Fassung 2) hat in sechs von sechs Paketen
// danebengelegen. Am 13.09.2026 nachgemessen:
//   · Von 26 gemeldeten „IMPERATIV?"-Zeilen war fast alles Code — oeffne(),
//     waehle(), speichere(), JSX-Attribute. Echter Text: eine Zeile.
//   · Das Wort „versuche" kam im ganzen Befund NICHT vor, obwohl
//     „Bitte versuche es später erneut." an fünf Stellen im Code stand.
// Eine Liste mit 148 Einträgen, von denen 140 Fehlalarme sind, kostet mehr
// Zeit als gar keine Liste. Die Erkennung steckt deshalb jetzt in
// lib/anredeScan.ts und ist mit 33 Tests abgesichert.
//
// ▄▄▄ DIESES SKRIPT ÄNDERT NICHTS ▄▄▄
// Es liest und schreibt genau eine Datei: den Befund. Kein Code wird angefasst.
//
// ▄▄▄ WARUM DIE ÜBERSETZUNG AN tests-bauen.cjs ABGEGEBEN WIRD ▄▄▄
// Die Logik liegt als TypeScript in lib/. Statt die Übersetzung hier ein
// zweites Mal zu bauen (mit denselben Windows-Fallstricken, siehe den Kopf von
// tests-bauen.cjs), wird das vorhandene Skript aufgerufen — über process.execPath,
// also node.exe direkt. Kein npx, kein .cmd, kein EINVAL.
//
// Aufruf:  node scripts/anrede-scan.cjs
//          node scripts/anrede-scan.cjs --alle     (auch Betreiber und Prompts)
// ============================================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WURZEL = path.resolve(__dirname, '..');
const ORDNER = ['app', 'lib', 'components'];
const ENDUNGEN = ['.ts', '.tsx'];
const UEBERSPRINGEN = new Set(['node_modules', '.next', 'out', '.git', 'public', 'supabase-sql', 'docs', 'tests', 'scripts']);
const ZIEL = path.join(WURZEL, 'supabase-sql', '_BEFUND-anrede-3.txt');
const ALLE = process.argv.includes('--alle');

// ---------------------------------------------------------------------------
// Logik bereitstellen
// ---------------------------------------------------------------------------

function logikPfad() {
  const quelle = path.join(WURZEL, 'lib', 'anredeScan.ts');
  const ziel = path.join(WURZEL, 'out', 'anredeScan.js');
  if (!fs.existsSync(quelle)) {
    console.error('lib/anredeScan.ts fehlt — ohne die Logik kann nicht gesucht werden.');
    process.exit(1);
  }
  const aktuell = fs.existsSync(ziel)
    && fs.statSync(ziel).mtimeMs >= fs.statSync(quelle).mtimeMs;
  if (!aktuell) {
    console.log('Übersetze lib/anredeScan.ts …');
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'tests-bauen.cjs'), 'anredeScan'], {
        stdio: 'inherit', cwd: WURZEL,
      });
    } catch {
      console.error('\nÜbersetzung fehlgeschlagen. Bitte einmal `npm install` laufen lassen.');
      process.exit(1);
    }
  }
  // out/ gehoert allein den Tests und diesem Skript. Ohne die kleine
  // package.json warnt Node bei jedem Lauf ueber den fehlenden Modultyp.
  const merk = path.join(WURZEL, 'out', 'package.json');
  if (!fs.existsSync(merk)) {
    try { fs.writeFileSync(merk, '{ "type": "module" }\n', 'utf8'); } catch { /* egal */ }
  }
  return ziel;
}

// ---------------------------------------------------------------------------
// Dateien einsammeln
// ---------------------------------------------------------------------------

function dateien() {
  const raus = [];
  function geh(abs) {
    let eintraege;
    try { eintraege = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of eintraege) {
      if (e.name.startsWith('.') || UEBERSPRINGEN.has(e.name)) continue;
      const p = path.join(abs, e.name);
      if (e.isDirectory()) geh(p);
      else if (ENDUNGEN.includes(path.extname(e.name))) raus.push(p);
    }
  }
  for (const o of ORDNER) geh(path.join(WURZEL, o));
  return raus.sort();
}

/** Pfad so schreiben, wie er im Repo steht — mit Schrägstrich, nicht Backslash. */
function kurz(abs) {
  return path.relative(WURZEL, abs).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Bericht
// ---------------------------------------------------------------------------

const UEBERSCHRIFT = {
  'anrede-anweisung': [
    'ANWEISUNG AN DIE KI — hier wird das Duzen ANGEORDNET',
    'Diese Stellen wiegen am schwersten: im Code steht kein geduzter Satz, er',
    'entsteht erst zur Laufzeit. Eine einzige Zeile faerbt jede Ausgabe eines',
    'Bausteins. Gefunden am 13.09. in app/api/ki-auge: „Sprich den Unternehmer',
    'direkt an (\'du\')". Richtig macht es app/api/analyse-ki: „Sie-Ansprache".',
  ],
  endkunde: [
    'ENDKUNDE — verlaesst das Haus, muss IMMER gesiezt werden',
    'E-Mails, PDFs, oeffentliche Seiten, Abmelde- und Bestaetigungsseiten.',
    'Das liest der Kunde des Kunden. Hier ist Duzen nicht Geschmack, sondern',
    'ein Fehler, den der Betrieb ausbaden muss.',
  ],
  chef: [
    'CHEF — der zahlende Kunde, wird gesiezt',
    'Dashboard, Auswertungen, alles was der Betriebsinhaber sieht.',
  ],
  mitarbeiter: [
    'MITARBEITER — ANREDEFREI, weder duzen noch siezen',
    'Muster, das sich bewaehrt hat: „Du hast diesen Plan bestaetigt" wird',
    '„Plan bestaetigt" · „Bitte wende dich an deinen Vorgesetzten" wird',
    '„Bitte an den Vorgesetzten wenden" · „Deine Tour" wird „Meine Tour".',
  ],
  betreiber: [
    'BETREIBER — Martins eigene Oberflaeche, hier darf geduzt bleiben',
    'app/admin/**. Nur zur Vollstaendigkeit gezaehlt, nichts zu tun.',
  ],
  kiprompt: [
    'KI-PROMPTS OHNE ANREDE-REGEL — nicht aendern',
    'Anweisungen an das Sprachmodell („Du bist ein Berater"). Die liest nie',
    'ein Mensch. Nur zur Vollstaendigkeit gezaehlt.',
  ],
};

function abschnitt(titelZeilen, funde) {
  const z = ['', '-'.repeat(76), ...titelZeilen, '-'.repeat(76), ''];
  if (funde.length === 0) { z.push('  (nichts gefunden)'); return z; }
  let letzte = '';
  for (const f of funde) {
    if (f.pfad !== letzte) { z.push('', `### ${f.pfad}`); letzte = f.pfad; }
    const art = f.art === 'anrede-anweisung' ? 'ANWEISUNG' : f.art.toUpperCase();
    z.push(`  ${String(f.zeile).padStart(5)} | ${art.padEnd(10)} | ${f.treffer.padEnd(12)} | ${f.text}`);
  }
  return z;
}

// ---------------------------------------------------------------------------
// Lauf
// ---------------------------------------------------------------------------

(async function main() {
  const mod = await import('file://' + logikPfad().split(path.sep).join('/'));
  const liste = dateien();
  console.log(`Durchsuche ${liste.length} Dateien in ${ORDNER.join(', ')} …`);

  let alleFunde = [];
  for (const abs of liste) {
    let quelle;
    try { quelle = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    try {
      alleFunde = alleFunde.concat(mod.bewerteDatei(kurz(abs), quelle));
    } catch (e) {
      // Eine schwierige Datei darf den ganzen Lauf nicht kippen.
      console.warn(`  uebersprungen: ${kurz(abs)} (${e && e.message ? e.message : 'Lesefehler'})`);
    }
  }

  const sortiert = mod.sortiere(alleFunde);
  const anweisung = sortiert.filter((f) => f.art === 'anrede-anweisung');
  const rest = sortiert.filter((f) => f.art !== 'anrede-anweisung');
  const prompts = rest.filter((f) => f.kiPrompt);
  const echte = rest.filter((f) => !f.kiPrompt);
  const je = (r) => echte.filter((f) => f.rolle === r);

  const zuTun = anweisung.length + je('endkunde').length + je('chef').length + je('mitarbeiter').length;
  const dateienBetroffen = new Set([...anweisung, ...je('endkunde'), ...je('chef'), ...je('mitarbeiter')].map((f) => f.pfad));

  const zeilen = [
    '='.repeat(76),
    'ARGONAUT OS · Anrede-Scan · Fassung 3   (Punkt 3.1, Paket 9)',
    `Erzeugt: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    `Durchsucht: ${liste.length} Dateien in ${ORDNER.join(', ')}`,
    '='.repeat(76),
    '',
    'Gesucht wird NUR in Zeichenketten und JSX-Text. Kommentare, Funktionsnamen',
    'und JSX-Attribute fallen weg — dort steht nichts, was jemand liest.',
    'Die Erkennung liegt in lib/anredeScan.ts und ist mit Tests abgesichert',
    '(tests/anredeScan.test.mjs). Dieses Skript aendert keine einzige Datei.',
    '',
    '-'.repeat(76),
    'KURZFASSUNG',
    '-'.repeat(76),
    `ANWEISUNG an die KI   ${String(anweisung.length).padStart(4)}  <- zuerst, faerbt ganze Bausteine`,
    `ENDKUNDE              ${String(je('endkunde').length).padStart(4)}  siezen`,
    `CHEF                  ${String(je('chef').length).padStart(4)}  siezen`,
    `MITARBEITER           ${String(je('mitarbeiter').length).padStart(4)}  anredefrei`,
    `unklar                ${String(je('unklar').length).padStart(4)}  ansehen`,
    '',
    `BETREIBER             ${String(je('betreiber').length).padStart(4)}  nichts zu tun`,
    `KI-Prompts            ${String(prompts.length).padStart(4)}  nicht aendern`,
    '',
    `ZU TUN: ${zuTun} Stellen in ${dateienBetroffen.size} Dateien.`,
  ];

  zeilen.push(...abschnitt(UEBERSCHRIFT['anrede-anweisung'], anweisung));
  zeilen.push(...abschnitt(UEBERSCHRIFT.endkunde, je('endkunde')));
  zeilen.push(...abschnitt(UEBERSCHRIFT.chef, je('chef')));
  zeilen.push(...abschnitt(UEBERSCHRIFT.mitarbeiter, je('mitarbeiter')));
  if (je('unklar').length) zeilen.push(...abschnitt(['UNKLAR — Rolle nicht zuzuordnen, ansehen'], je('unklar')));
  if (ALLE) {
    zeilen.push(...abschnitt(UEBERSCHRIFT.betreiber, je('betreiber')));
    zeilen.push(...abschnitt(UEBERSCHRIFT.kiprompt, prompts));
  } else {
    zeilen.push('', '-'.repeat(76),
      `(${je('betreiber').length} Betreiber-Stellen und ${prompts.length} KI-Prompts ausgelassen —`,
      ' mit  node scripts/anrede-scan.cjs --alle  kommen sie mit in den Bericht.)');
  }
  zeilen.push('');

  fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
  fs.writeFileSync(ZIEL, zeilen.join('\n'), 'utf8');

  console.log('');
  console.log(`  ANWEISUNG an die KI  ${anweisung.length}`);
  console.log(`  ENDKUNDE             ${je('endkunde').length}`);
  console.log(`  CHEF                 ${je('chef').length}`);
  console.log(`  MITARBEITER          ${je('mitarbeiter').length}`);
  console.log(`  unklar               ${je('unklar').length}`);
  console.log(`  (Betreiber ${je('betreiber').length}, KI-Prompts ${prompts.length} — nichts zu tun)`);
  console.log('');
  console.log(`ZU TUN: ${zuTun} Stellen in ${dateienBetroffen.size} Dateien.`);
  console.log(`Bericht: ${kurz(ZIEL)}`);
})();
