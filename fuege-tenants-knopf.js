// ============================================================
// ARGONAUT OS · fuege-tenants-knopf.js  (Schritt 5 / Punkt 5)
//
// Legt einen schwebenden "TENANTS & MODULE"-Knopf ueber das Command-Center,
// der auf /admin/tenants verlinkt. Aendert NUR die kleine React-Rueckgabe
// (iframe), NICHT den grossen HTML-String. Idempotent + Backup + Schutzsperre.
//
// Aufruf:  node fuege-tenants-knopf.js
// ============================================================
const fs = require('fs');

const ZIEL = 'app/admin/command-center/page.tsx';
const BAK = ZIEL + '.bak-tenants-knopf';

if (!fs.existsSync(ZIEL)) { console.error('ABBRUCH: nicht gefunden -> ' + ZIEL); process.exit(1); }
let src = fs.readFileSync(ZIEL, 'utf8');

if (src.includes('/admin/tenants')) {
  console.log('Knopf schon vorhanden (/admin/tenants gefunden). Nichts geaendert.');
  process.exit(0);
}

const ANKER = 'export default function CommandCenter';
const idx = src.indexOf(ANKER);
if (idx === -1) { console.error('ABBRUCH: CommandCenter-Funktion nicht gefunden. Nichts geaendert.'); process.exit(1); }

if (!fs.existsSync(BAK)) { fs.writeFileSync(BAK, src, 'utf8'); console.log('Backup angelegt: ' + BAK); }

const kopf = src.slice(0, idx); // 'use client' + kompletter HTML-String, unangetastet

const neu = kopf + `export default function CommandCenter() {
  return (
    <>
      <iframe
        srcDoc={COMMAND_CENTER_HTML}
        style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 'none', margin: 0, padding: 0 }}
        title="ARGONAUT Command Center"
      />
      <a
        href="/admin/tenants"
        style={{
          position: 'fixed',
          bottom: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 13,
          letterSpacing: '0.14em',
          color: '#00e5ff',
          background: 'rgba(0,20,32,0.92)',
          border: '1px solid rgba(0,229,255,0.6)',
          borderRadius: 8,
          padding: '9px 20px',
          textDecoration: 'none',
          boxShadow: '0 0 18px rgba(0,229,255,0.35)',
        }}
      >
        {'\u25A3 TENANTS & MODULE'}
      </a>
    </>
  );
}
`;

fs.writeFileSync(ZIEL, neu, 'utf8');
console.log('FERTIG: TENANTS-Knopf eingefuegt (verlinkt auf /admin/tenants).');
