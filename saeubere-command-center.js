// ============================================================================
// ARGONAUT OS · saeubere-command-center.js  (Schritt 2b)
//
// Entfernt den ueberfluessigen CLIENT-Auth-Block aus
//   app/admin/command-center/page.tsx
// (getUser + NEXT_PUBLIC_ADMIN_EMAIL-Vergleich + router.push('/admin/login')).
// Der Schutz sitzt jetzt serverseitig im /admin-Layout — dieser Client-Check
// ist redundant und verweist noch auf die geloeschte /admin/login-Seite.
//
// Der grosse COMMAND_CENTER_HTML-String wird NICHT angefasst (byte-genau
// uebernommen). Idempotent + Schutzsperre + Backup.
//
// Aufruf:  node saeubere-command-center.js
// ============================================================================

const fs = require('fs');

const ZIEL = 'app/admin/command-center/page.tsx';
const BAK = ZIEL + '.bak-2b';

if (!fs.existsSync(ZIEL)) {
  console.error('ABBRUCH: Datei nicht gefunden -> ' + ZIEL);
  process.exit(1);
}

let src = fs.readFileSync(ZIEL, 'utf8');

// --- Schutzsperre: schon gesaeubert? ---------------------------------------
if (!src.includes('NEXT_PUBLIC_ADMIN_EMAIL')) {
  console.log('Schon sauber (kein NEXT_PUBLIC_ADMIN_EMAIL gefunden). Nichts geaendert.');
  process.exit(0);
}

// --- Anker finden -----------------------------------------------------------
const HTML_ANKER = 'const COMMAND_CENTER_HTML';
const idxHtml = src.indexOf(HTML_ANKER);
if (idxHtml === -1) {
  console.error('ABBRUCH: COMMAND_CENTER_HTML nicht gefunden — Datei unerwartet. Nichts geaendert.');
  process.exit(1);
}

const COMP_ANKER = 'export default function CommandCenter';
const idxComp = src.indexOf(COMP_ANKER);
if (idxComp === -1) {
  console.error('ABBRUCH: CommandCenter-Funktion nicht gefunden — Nichts geaendert.');
  process.exit(1);
}
if (idxComp < idxHtml) {
  console.error('ABBRUCH: unerwartete Reihenfolge — Nichts geaendert.');
  process.exit(1);
}

// --- Backup (einmalig) ------------------------------------------------------
if (!fs.existsSync(BAK)) {
  fs.writeFileSync(BAK, src, 'utf8');
  console.log('Backup angelegt: ' + BAK);
} else {
  console.log('Backup existiert bereits (nicht ueberschrieben): ' + BAK);
}

// --- Zusammenbauen ----------------------------------------------------------
// 1) HTML-Block = von "const COMMAND_CENTER_HTML" bis kurz vor der Komponente.
//    Wird BYTE-GENAU uebernommen (kein Re-Tippen des Riesen-Strings).
const htmlBlock = src.slice(idxHtml, idxComp);

// 2) Saubere Komponente: nur noch das iframe, keine Auth-Logik, keine Hooks.
const cleanComp =
`export default function CommandCenter() {
  return (
    <iframe
      srcDoc={COMMAND_CENTER_HTML}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 'none', margin: 0, padding: 0 }}
      title="ARGONAUT Command Center"
    />
  );
}
`;

// 3) Neuer Kopf: nur 'use client'; — die alten Imports (useState/useEffect/
//    createBrowserClient/useRouter) fallen weg, weil nicht mehr gebraucht.
const out = "'use client';\n\n" + htmlBlock + cleanComp;

fs.writeFileSync(ZIEL, out, 'utf8');
console.log('FERTIG: Client-Auth-Block entfernt. Nur noch iframe + HTML-String.');
console.log('        NEXT_PUBLIC_ADMIN_EMAIL wird hier nicht mehr referenziert.');
