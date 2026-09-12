/* ============================================================
 * ARGONAUT OS · Anrede-Scan nach ROLLE  (Punkt 3.1)
 * Stand: 12.09.2026
 *
 * DIE REGEL (Entscheidung 11.09.2026)
 *   CHEF          wird gesiezt — er ist der zahlende Kunde, auch im System.
 *   VERLAESST     siezt IMMER — E-Mails, PDFs, Rechnungen, oeffentliche
 *                 Website. Egal wer es ausloest.
 *   MITARBEITER   wird ANREDEFREI formuliert (Entscheidung 12.09.2026).
 *
 * Zur letzten Zeile: Duzen und Siezen ist im Deutschen keine Wortersetzung —
 * Verb, Possessivpronomen und Satzstellung aendern sich alle mit. Ein
 * spaeterer Kippschalter "duzen oder siezen" muesste also JEDEN Satz in zwei
 * Fassungen vorhalten, dauerhaft, auch fuer jede kuenftige Seite. Deshalb
 * zuerst der billigere Weg: die meisten dieser Saetze brauchen ueberhaupt
 * keine Anrede ("Aktuell sind keine Schichten fuer dich eingeplant" ->
 * "Aktuell sind keine Schichten eingeplant"). Was danach noch eine echte
 * Anrede traegt, ist eine Handvoll Stellen — und darueber laesst sich ueber
 * einen Schalter dann guenstig entscheiden.
 *
 * WARUM NICHT NUR PRONOMEN
 * Lehre vom 11.09.: ein Scan auf du/dir/dein uebersieht Du-Imperative ohne
 * Pronomen ("leg eine Maschine an und buche die erste Schicht"). Die werden
 * hier mitgesucht, aber getrennt ausgewiesen — Imperative sind mehrdeutig
 * ("Trage" kann ein Substantiv sein), das entscheidet ein Mensch.
 *
 * Dieses Skript LIEST NUR. Es aendert keine einzige Datei.
 *
 * AUFRUF   node scripts/pruefe-anrede.cjs
 * ERGEBNIS supabase-sql/_BEFUND-anrede.txt  (und auf dem Bildschirm)
 * ============================================================ */

const fs = require('fs');
const path = require('path');

const WURZEL = process.cwd();
const ORDNER = ['app', 'lib', 'components'];
const ENDUNGEN = ['.ts', '.tsx'];
const UEBERSPRINGEN = new Set(['node_modules', '.next', '.git', 'out', '.vercel']);

// ---------- Rollen-Zuordnung nach Pfad ----------
// Reihenfolge zaehlt: die erste passende Regel gewinnt.
const ROLLEN = [
  // Alles, was das System verlaesst — siezt immer, egal wer es ausloest.
  [/(^|\/)(lib\/[a-zA-Z]*[Pp]df|lib\/mail|lib\/newsletter|lib\/signaturHtml|lib\/autoresponder|lib\/dossierMail|lib\/freebie)/, 'VERLAESST'],
  [/^app\/vorschau\//, 'VERLAESST'],
  [/^app\/api\/oeffentlich\//, 'VERLAESST'],
  [/^app\/(impressum|datenschutz|agb|preise|branchen|kontakt)/, 'VERLAESST'],

  // Der Mitarbeiterbereich — hier ist "du" richtig.
  [/^app\/dashboard\/(mein-bereich|meine-einsaetze|zeiterfassung|schichtplan)/, 'MITARBEITER'],

  // Alles Uebrige im eingeloggten Bereich spricht den Chef an.
  [/^app\/dashboard\//, 'CHEF'],
  [/^app\/admin\//, 'BETREIBER'],
];

function rolleVon(pfad) {
  for (const [muster, rolle] of ROLLEN) if (muster.test(pfad)) return rolle;
  return 'SONSTIGES';
}

// Soll diese Rolle gesiezt werden?
function sollSiezen(rolle) {
  return rolle === 'CHEF' || rolle === 'VERLAESST';
}

// ---------- Muster ----------
// Pronomen mit Wortgrenzen, damit "durch", "Dublette", "deinstallieren"
// nicht anschlagen.
const PRONOMEN = /\b(du|dir|dich|dein|deine|deiner|deinem|deinen|deines)\b/i;

// Du-Imperative am Satzanfang, ohne Pronomen. Bewusst knapp gehalten und
// nur als Hinweis ausgewiesen — "Trage", "Suche", "Lade" koennen auch
// Substantive sein.
const IMPERATIV = /(^|[.!?:·—–]\s+|["'`>]\s*)(leg|lege|buche|trag|trage|klick|klicke|waehl|wähle|wahle|gib|lad|lade|pruef|prüfe|pruefe|sieh|schau|mach|mache|erstell|erstelle|oeffne|öffne|starte|druecke|drücke|fuege|füge|nimm|setz|setze|speicher|speichere|loesch|lösche|waehle)\b/;

// Zeilen, die sicher kein Kundentext sind.
const KEIN_TEXT = [
  /^\s*(import|export\s+(type|interface)|\/\/|\/\*|\*)/,
  /^\s*(const|let|var|function|type|interface|enum)\s+\w+\s*[:=<(]/,
];

function istCodeZeile(z) {
  return KEIN_TEXT.some((m) => m.test(z));
}

// Steht in der Zeile ueberhaupt ein Textliteral oder JSX-Text?
function hatText(z) {
  return /['"`]/.test(z) || /<[^>]*>[^<]*[A-Za-zÄÖÜäöü]/.test(z) || /^\s*[A-ZÄÖÜ]/.test(z.trim());
}

// ---------- Dateien einsammeln ----------
function sammle(ordner, treffer) {
  let eintraege;
  try {
    eintraege = fs.readdirSync(ordner, { withFileTypes: true });
  } catch {
    return treffer;
  }
  for (const e of eintraege) {
    if (UEBERSPRINGEN.has(e.name)) continue;
    const voll = path.join(ordner, e.name);
    if (e.isDirectory()) sammle(voll, treffer);
    else if (ENDUNGEN.includes(path.extname(e.name))) treffer.push(voll);
  }
  return treffer;
}

// ---------- Suchen ----------
const dateien = ORDNER.flatMap((o) => sammle(path.join(WURZEL, o), []));
const funde = [];

for (const datei of dateien) {
  let inhalt;
  try {
    inhalt = fs.readFileSync(datei, 'utf8');
  } catch {
    continue;
  }
  const kurz = path.relative(WURZEL, datei).replace(/\\/g, '/');
  const rolle = rolleVon(kurz);
  const zeilen = inhalt.split(/\r?\n/);

  zeilen.forEach((zeile, i) => {
    if (istCodeZeile(zeile) || !hatText(zeile)) return;
    const pron = PRONOMEN.test(zeile);
    const impe = !pron && IMPERATIV.test(zeile);
    if (!pron && !impe) return;
    funde.push({
      datei: kurz,
      zeile: i + 1,
      rolle,
      art: pron ? 'PRONOMEN' : 'IMPERATIV?',
      soll: sollSiezen(rolle),
      text: zeile.trim().slice(0, 110),
    });
  });
}

// ---------- Bericht ----------
const zeilen = [];
const z = (s = '') => zeilen.push(s);

z('='.repeat(76));
z('ARGONAUT OS · Anrede-Scan nach Rolle  (Punkt 3.1)');
z('Erzeugt: ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
z('Durchsucht: ' + dateien.length + ' Dateien in ' + ORDNER.join(', '));
z('='.repeat(76));
z();
z('LESART');
z('  SIEZEN       Duz-Stelle auf einer Chef-Seite oder in etwas, das das');
z('               System verlaesst — muss gesiezt werden.');
z('  ANREDEFREI   Duz-Stelle im Mitarbeiterbereich — Anrede herausnehmen,');
z('               statt sie zu duzen oder zu siezen.');
z('  ANSEHEN      Betreiber-/sonstige Datei oder ein vermuteter Imperativ;');
z('               das entscheidet ein Mensch, kein Muster.');
z();

const zuAendern = funde.filter((f) => f.soll && f.art === 'PRONOMEN');
const richtig = funde.filter((f) => f.rolle === 'MITARBEITER' && f.art === 'PRONOMEN');
const ansehen = funde.filter((f) => !zuAendern.includes(f) && !richtig.includes(f));

function proDatei(liste) {
  const m = new Map();
  for (const f of liste) m.set(f.datei, (m.get(f.datei) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

z('-'.repeat(76));
z('KURZFASSUNG');
z('-'.repeat(76));
z('SIEZEN       ' + String(zuAendern.length).padStart(4) + ' Stellen in ' + proDatei(zuAendern).length + ' Dateien');
z('ANREDEFREI   ' + String(richtig.length).padStart(4) + ' Stellen in ' + proDatei(richtig).length + ' Dateien (Mitarbeiterbereich)');
z('ANSEHEN      ' + String(ansehen.length).padStart(4) + ' Stellen in ' + proDatei(ansehen).length + ' Dateien');
z();
z('SUMME        ' + String(zuAendern.length + richtig.length + ansehen.length).padStart(4) + ' Fundstellen');
z();

z('-'.repeat(76));
z('SIEZEN — nach Datei, die dicksten zuerst');
z('-'.repeat(76));
for (const [datei, anzahl] of proDatei(zuAendern)) {
  z(String(anzahl).padStart(3) + '  ' + datei);
}
z();

z('-'.repeat(76));
z('SIEZEN — jede Stelle einzeln');
z('-'.repeat(76));
let letzte = '';
for (const f of zuAendern) {
  if (f.datei !== letzte) { z(); z('### ' + f.datei + '   [' + f.rolle + ']'); letzte = f.datei; }
  z('  ' + String(f.zeile).padStart(5) + ' │ ' + f.text);
}
z();

z('-'.repeat(76));
z('ANSEHEN — Betreiber-Seiten, Sonstiges und vermutete Imperative');
z('-'.repeat(76));
letzte = '';
for (const f of ansehen) {
  if (f.datei !== letzte) { z(); z('### ' + f.datei + '   [' + f.rolle + ']'); letzte = f.datei; }
  z('  ' + String(f.zeile).padStart(5) + ' │ ' + f.art.padEnd(11) + ' │ ' + f.text);
}
z();

z('-'.repeat(76));
z('ANREDEFREI — Mitarbeiterbereich, jede Stelle einzeln');
z('-'.repeat(76));
let letzteM = '';
for (const f of richtig) {
  if (f.datei !== letzteM) { z(); z('### ' + f.datei); letzteM = f.datei; }
  z('  ' + String(f.zeile).padStart(5) + ' │ ' + f.text);
}
z();

const bericht = zeilen.join('\n');
const ziel = path.join(WURZEL, 'supabase-sql', '_BEFUND-anrede.txt');
fs.writeFileSync(ziel, bericht, 'utf8');

// Auf dem Bildschirm nur die Kurzfassung plus die Datei-Uebersicht,
// sonst scrollt die Einzelliste alles weg.
const bisEinzeln = bericht.split('SIEZEN — jede Stelle einzeln')[0];
console.log(bisEinzeln);
console.log('Die vollstaendige Liste steht in supabase-sql/_BEFUND-anrede.txt');
