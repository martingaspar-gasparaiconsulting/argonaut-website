/* ============================================================
 * ARGONAUT OS · Wer greift auf die gesperrten Tabellen zu?  (Punkt 2.6)
 * Stand: 12.09.2026
 *
 * WOZU
 * 23 Tabellen haben RLS an, aber keine einzige Regel. Das heisst: An die
 * Daten kommt nur der Service-Role-Schluessel. Fuer jede dieser Tabellen
 * gibt es genau zwei Moeglichkeiten:
 *
 *   ABSICHT  Sie wird ausschliesslich ueber lib/supabase-admin.ts
 *            (createAdminClient) angefasst. Dann ist die Sperre sogar die
 *            sicherste Variante, die es gibt.
 *
 *   TOT      Sie wird ueber lib/supabase.ts (Browser) oder
 *            lib/supabase-server.ts angefasst. BEIDE benutzen den
 *            anon-Schluessel — RLS gilt dort. Ohne Regel kommt kein
 *            einziger Datensatz zurueck. Build gruen, Tests gruen,
 *            Seite leer. Genau das Muster der Betriebs-Akte vom 11.09.
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

const TABELLEN = [
  'ads_zugang', 'api_schluessel', 'bank_zugang', 'belege',
  'betriebs_geheimnisse', 'chat_tarif', 'chat_verbrauch',
  'churned_customers', 'demo_hr_backup', 'dossier_leads', 'elster_zugang',
  'ki_nutzung', 'mail_zugang', 'marktplatz_zugang', 'modul_nutzung',
  'oeffentliche_bestellungen', 'social_zugang', 'training_data',
  'versand_zugang', 'web_ereignisse', 'website_anfragen', 'website_termine',
  'whatsapp_zugang',
];

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

// ---------- Welchen Client benutzt diese Datei? ----------
// Wichtig: supabase-server.ts benutzt den ANON-Key, nicht den Service-Role-Key.
// RLS gilt dort also genauso wie im Browser. Nur createAdminClient umgeht sie.
function clientArt(inhalt) {
  const arten = [];
  if (/createAdminClient|supabase-admin|SUPABASE_SERVICE_ROLE_KEY/.test(inhalt)) {
    arten.push('ADMIN');
  }
  if (/from\s+['"][^'"]*lib\/supabase-server['"]|@\/lib\/supabase-server/.test(inhalt)) {
    arten.push('SERVER-ANON');
  }
  if (/from\s+['"][^'"]*lib\/supabase['"]|@\/lib\/supabase['"]/.test(inhalt)) {
    arten.push('BROWSER-ANON');
  }
  if (/createBrowserClient/.test(inhalt)) {
    if (!arten.includes('BROWSER-ANON')) arten.push('BROWSER-ANON');
  }
  return arten.length ? arten : ['UNKLAR'];
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
  const arten = clientArt(inhalt);
  const istClientDatei = /^\s*['"]use client['"]/m.test(inhalt);
  const zeilen = inhalt.split(/\r?\n/);

  for (const tabelle of TABELLEN) {
    // Exakt .from('tabelle') — verhindert, dass "belege" auch in
    // "belege_ocr" oder "beleg_positionen" anschlaegt.
    const muster = new RegExp(
      "\\.(from|rpc)\\(\\s*['\"`]" + tabelle + "['\"`]\\s*\\)",
    );
    zeilen.forEach((zeile, i) => {
      if (muster.test(zeile)) {
        befund.get(tabelle).push({
          datei: path.relative(WURZEL, datei).replace(/\\/g, '/'),
          zeile: i + 1,
          arten,
          istClientDatei,
          text: zeile.trim().slice(0, 110),
        });
      }
    });
  }
}

// ---------- Urteil je Tabelle ----------
function urteil(stellen) {
  if (stellen.length === 0) return 'UNBENUTZT · nirgends im Code angefasst';
  const alleArten = new Set(stellen.flatMap((s) => s.arten));
  const nurAdmin = [...alleArten].every((a) => a === 'ADMIN');
  if (nurAdmin) return 'ABSICHT · nur ueber Service-Role — Sperre ist richtig';
  if (alleArten.has('BROWSER-ANON') || alleArten.has('SERVER-ANON')) {
    return 'TOT · wird mit anon-Key gelesen, RLS blockt — liefert nichts';
  }
  return 'PRUEFEN · Client-Art nicht eindeutig erkannt';
}

// ---------- Bericht ----------
const zeilen = [];
const z = (s = '') => zeilen.push(s);

z('='.repeat(72));
z('ARGONAUT OS · Befund: Nutzung der 23 gesperrten Tabellen');
z('Erzeugt: ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
z('Durchsucht: ' + dateien.length + ' Dateien in ' + ORDNER.join(', '));
z('='.repeat(72));
z();
z('LESART');
z('  ABSICHT    nur createAdminClient — alles gut, nichts tun');
z('  TOT        anon-Key trifft auf RLS ohne Regel — liefert garantiert');
z('             nichts, ohne dass irgendwo ein Fehler erscheint');
z('  UNBENUTZT  kein Code-Zugriff gefunden');
z('  PRUEFEN    Client-Art nicht eindeutig — von Hand ansehen');
z();

const gruppen = { TOT: [], PRUEFEN: [], ABSICHT: [], UNBENUTZT: [] };
for (const t of TABELLEN) {
  const u = urteil(befund.get(t));
  gruppen[u.split(' ')[0]].push(t);
}

z('-'.repeat(72));
z('KURZFASSUNG');
z('-'.repeat(72));
for (const [name, liste] of Object.entries(gruppen)) {
  z(name.padEnd(10) + ' ' + liste.length + (liste.length ? ': ' + liste.join(', ') : ''));
}
z();

z('-'.repeat(72));
z('EINZELHEITEN');
z('-'.repeat(72));
for (const t of TABELLEN) {
  const stellen = befund.get(t);
  z();
  z('### ' + t);
  z('    ' + urteil(stellen));
  if (!stellen.length) continue;
  for (const s of stellen) {
    z('    ' + s.arten.join('+').padEnd(14) +
      (s.istClientDatei ? '[use client] ' : '') +
      s.datei + ':' + s.zeile);
    z('        ' + s.text);
  }
}
z();

const bericht = zeilen.join('\n');
const ziel = path.join(WURZEL, 'supabase-sql', '_BEFUND-rls-nutzung.txt');
fs.writeFileSync(ziel, bericht, 'utf8');

console.log(bericht);
console.log('\nGeschrieben nach: supabase-sql/_BEFUND-rls-nutzung.txt');
