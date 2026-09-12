/* ============================================================
 * ARGONAUT OS · Wer greift auf welche Tabelle zu?  (Punkt 2.6)
 * Fassung 3 · 12.09.2026
 *
 * WARUM FASSUNG 2
 * Fassung 1 hat gefragt: "Kommt in dieser DATEI irgendwo ein anon-Import
 * vor?" Das ist zu grob. Eine Server-Route prueft voellig richtig erst mit
 * lib/supabase-server (anon + Cookie), WER eingeloggt ist, und arbeitet
 * dann mit createAdminClient auf der Tabelle. Fassung 1 hat solche Routen
 * als "TOT" gemeldet — 15 Fehlalarme.
 *
 * Fassung 2 loest die VARIABLE auf: bei `admin.from('x')` wird geschaut,
 * womit `admin` erzeugt wurde. Nur das entscheidet, ob RLS greift.
 *
 * Ausserdem wird `.storage.from('belege')` nicht mehr mitgezaehlt — das
 * ist der Datei-Eimer im storage-Bereich, nicht die Tabelle `belege`.
 * Storage hat eigene Regeln und wird getrennt ausgewiesen.
 *
 * ZUR ERINNERUNG, WARUM DAS UEBERHAUPT ZAEHLT
 *   lib/supabase-admin.ts   Service-Role — umgeht RLS
 *   lib/supabase-server.ts  ANON-Key + Cookie — RLS gilt!
 *   lib/supabase.ts         ANON-Key im Browser — RLS gilt
 * Bei einer Tabelle mit RLS und ohne Regel liefern die letzten beiden
 * garantiert nichts zurueck — ohne Fehlermeldung, ohne roten Build.
 *
 * Dieses Skript LIEST NUR. Es aendert keine einzige Datei.
 *
 * AUFRUF   node scripts/pruefe-rls-nutzung.cjs
 * ERGEBNIS supabase-sql/_BEFUND-rls-nutzung.txt  (und auf dem Bildschirm)
 * ============================================================ */

const fs = require('fs');
const path = require('path');

const WURZEL = process.cwd();
const ORDNER = ['app', 'lib', 'components'];
const ENDUNGEN = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const UEBERSPRINGEN = new Set(['node_modules', '.next', '.git', 'out', '.vercel']);

// Standardliste: die 23 Tabellen mit RLS und ohne Regel (Stand 12.09.2026).
// Andere Tabellen pruefen: Namen einfach anhaengen, z.B.
//   node scripts/pruefe-rls-nutzung.cjs agents betreiber_flags
const STANDARD = [
  'ads_zugang', 'api_schluessel', 'bank_zugang', 'belege',
  'betriebs_geheimnisse', 'chat_tarif', 'chat_verbrauch',
  'churned_customers', 'demo_hr_backup', 'dossier_leads', 'elster_zugang',
  'ki_nutzung', 'mail_zugang', 'marktplatz_zugang', 'modul_nutzung',
  'oeffentliche_bestellungen', 'social_zugang', 'training_data',
  'versand_zugang', 'web_ereignisse', 'website_anfragen', 'website_termine',
  'whatsapp_zugang',
];
const ARGUMENTE = process.argv.slice(2).filter((a) => /^[a-z0-9_]+$/i.test(a));
const TABELLEN = ARGUMENTE.length ? ARGUMENTE : STANDARD;
const LISTENNAME = ARGUMENTE.length
  ? 'eigene Liste (' + ARGUMENTE.length + ' Tabellen)'
  : 'Standardliste (23 gesperrte Tabellen)';

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

// ---------- Schritt 1: Welcher Importname steht fuer welche Client-Art? ----------
function importArten(inhalt) {
  const karte = new Map();
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(inhalt))) {
    const quelle = m[2];
    let art = null;
    if (/supabase-admin/.test(quelle)) art = 'ADMIN';
    else if (/supabase-server/.test(quelle)) art = 'SERVER-ANON';
    else if (/(^|\/)supabase$/.test(quelle)) art = 'BROWSER-ANON';
    if (!art) continue;
    for (const teil of m[1].split(',')) {
      const t = teil.trim();
      if (!t) continue;
      const als = t.match(/^(\w+)\s+as\s+(\w+)$/);
      karte.set(als ? als[2] : t, art);
    }
  }
  // Direkt erzeugter Browser-Client ohne Umweg ueber lib/supabase.ts
  if (/createBrowserClient\s*\(/.test(inhalt)) karte.set('createBrowserClient', 'BROWSER-ANON');
  if (/createServerClient\s*\(/.test(inhalt)) karte.set('createServerClient', 'SERVER-ANON');
  return karte;
}

// ---------- Schritt 2: Welche Variable haelt welchen Client? ----------
function variablenArten(inhalt, impArten) {
  const karte = new Map();
  const re = /(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:await\s+)?(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(inhalt))) {
    const art = impArten.get(m[2]);
    if (art) karte.set(m[1], art);
  }
  return karte;
}

function zeileVon(inhalt, index) {
  let n = 1;
  for (let i = 0; i < index && i < inhalt.length; i++) if (inhalt[i] === '\n') n++;
  return n;
}

// ---------- Suchen ----------
const dateien = ORDNER.flatMap((o) => sammle(path.join(WURZEL, o), []));
const befund = new Map(TABELLEN.map((t) => [t, []]));

for (const datei of dateien) {
  let inhalt;
  try {
    inhalt = fs.readFileSync(datei, 'utf8');
  } catch {
    continue;
  }
  const kurz = path.relative(WURZEL, datei).replace(/\\/g, '/');
  const impArten = importArten(inhalt);
  const varArten = variablenArten(inhalt, impArten);

  for (const tabelle of TABELLEN) {
    // (variable) [.storage] .from('tabelle')
    // \s deckt auch Zeilenumbrueche ab — mehrzeilige Ketten wie
    //   await admin
    //     .from('ads_zugang')
    // werden dadurch der Variablen `admin` zugeordnet.
    const re = new RegExp(
      "(\\w+)\\s*(\\.\\s*storage\\s*)?\\.\\s*from\\(\\s*['\"`]" + tabelle + "['\"`]",
      'g',
    );
    let m;
    while ((m = re.exec(inhalt))) {
      const variable = m[1];
      const istStorage = Boolean(m[2]);
      const zeile = zeileVon(inhalt, m.index);
      const art = istStorage
        ? 'STORAGE'
        : varArten.get(variable) || 'UNKLAR(' + variable + ')';
      const zeilenText = inhalt.split(/\r?\n/)[zeile - 1] || '';
      befund.get(tabelle).push({
        datei: kurz,
        zeile,
        art,
        text: zeilenText.trim().slice(0, 100),
      });
    }
  }
}

// ---------- Urteil je Tabelle ----------
function urteil(stellen) {
  const echte = stellen.filter((s) => s.art !== 'STORAGE');
  if (echte.length === 0) {
    return stellen.length
      ? 'NUR-STORAGE · nur der Datei-Eimer, nicht die Tabelle'
      : 'UNBENUTZT · nirgends im Code angefasst';
  }
  const arten = new Set(echte.map((s) => s.art));
  if ([...arten].some((a) => a.startsWith('UNKLAR'))) {
    return 'PRUEFEN · Client einer Variablen nicht aufloesbar';
  }
  if ([...arten].every((a) => a === 'ADMIN')) {
    return 'ABSICHT · nur ueber Service-Role — Sperre ist richtig';
  }
  return 'TOT · anon-Client trifft RLS ohne Regel — liefert nichts';
}

// ---------- Bericht ----------
const zeilen = [];
const z = (s = '') => zeilen.push(s);

z('='.repeat(72));
z('ARGONAUT OS · Befund Fassung 3 · ' + LISTENNAME);
z('Erzeugt: ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
z('Durchsucht: ' + dateien.length + ' Dateien in ' + ORDNER.join(', '));
z('='.repeat(72));
z();
z('LESART');
z('  ABSICHT      jeder Zugriff laeuft ueber createAdminClient — nichts tun');
z('  TOT          mindestens ein Zugriff mit anon-Client — liefert nichts');
z('  PRUEFEN      eine Variable liess sich nicht aufloesen — von Hand ansehen');
z('  NUR-STORAGE  nur der Datei-Eimer gleichen Namens, nicht die Tabelle');
z('  UNBENUTZT    kein Code-Zugriff gefunden');
z();
if (ARGUMENTE.length) {
  z('ACHTUNG BEI EIGENER LISTE');
  z('  Dieses Skript kennt die Regeln in der Datenbank nicht. "TOT" heisst');
  z('  hier nur: es gibt einen Zugriff mit anon-Client. Ob der ins Leere');
  z('  laeuft, haengt daran, ob die Tabelle eine passende Regel hat. Bei');
  z('  einer Tabelle mit `using (true)` funktioniert der Zugriff — und ist');
  z('  genau der Grund, warum man die Regel nicht einfach zumachen darf.');
  z();
}

const gruppen = {};
for (const t of TABELLEN) {
  const kopf = urteil(befund.get(t)).split(' ')[0];
  (gruppen[kopf] = gruppen[kopf] || []).push(t);
}

z('-'.repeat(72));
z('KURZFASSUNG');
z('-'.repeat(72));
for (const kopf of ['TOT', 'PRUEFEN', 'NUR-STORAGE', 'ABSICHT', 'UNBENUTZT']) {
  const liste = gruppen[kopf] || [];
  z(kopf.padEnd(12) + ' ' + liste.length + (liste.length ? ': ' + liste.join(', ') : ''));
}
z();

z('-'.repeat(72));
z('EINZELHEITEN — nur was nicht ABSICHT oder UNBENUTZT ist');
z('-'.repeat(72));
let etwasGezeigt = false;
for (const t of TABELLEN) {
  const stellen = befund.get(t);
  const u = urteil(stellen);
  const kopf = u.split(' ')[0];
  if (kopf === 'ABSICHT' || kopf === 'UNBENUTZT') continue;
  etwasGezeigt = true;
  z();
  z('### ' + t);
  z('    ' + u);
  for (const s of stellen) {
    z('    ' + s.art.padEnd(22) + s.datei + ':' + s.zeile);
    z('        ' + s.text);
  }
}
if (!etwasGezeigt) z();
if (!etwasGezeigt) z('    Nichts zu zeigen — jede Tabelle ist entweder ABSICHT oder UNBENUTZT.');
z();

const bericht = zeilen.join('\n');
const dateiname = ARGUMENTE.length
  ? '_BEFUND-rls-nutzung-eigene.txt'
  : '_BEFUND-rls-nutzung.txt';
fs.writeFileSync(path.join(WURZEL, 'supabase-sql', dateiname), bericht, 'utf8');
console.log(bericht);
console.log('\nGeschrieben nach: supabase-sql/' + dateiname);
