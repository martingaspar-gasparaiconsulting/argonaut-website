// update-website-zahlen.js
// Aktualisiert projektweit: 110 -> 198 Branchen, 1.229 -> 2.100+ Automatisierungen,
// und den Schritt-1-Text im 4-Schritte-Bereich
// node update-website-zahlen.js

const fs = require('fs');
const path = require('path');

function walk(dir, exts, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    if (entry.isDirectory()) {
      walk(full, exts, fileList);
    } else if (exts.some(e => entry.name.endsWith(e))) {
      fileList.push(full);
    }
  }
  return fileList;
}

const root = __dirname;
const targets = [];
for (const dir of ['app', 'components']) {
  const full = path.join(root, dir);
  if (fs.existsSync(full)) {
    walk(full, ['.tsx', '.ts'], targets);
  }
}

let totalFiles = 0;
const changedFiles = [];

for (const file of targets) {
  let content = fs.readFileSync(file, 'utf8');
  const before = content;

  // 1) "Alle 110 Branchen" -> "Alle 198 Branchen"
  content = content.replace(/Alle 110 Branchen/g, 'Alle 198 Branchen');

  // 2) "110 Branchen" (alle weiteren Vorkommen, z.B. "Branchen abgedeckt")
  content = content.replace(/110 Branchen/g, '198 Branchen');

  // 3) generisches "110" gefolgt von Branchen-Kontext in Headlines (z.B. nur Zahl in stat-card)
  //    Wird hier konservativ NICHT pauschal ersetzt, um keine falschen Treffer zu erzeugen.

  // 4) "1.229 Automatisierungen" -> "2.100+ Automatisierungen"
  content = content.replace(/1\.229\+? Automatisierungen/g, '2.100+ Automatisierungen');

  // 5) "1229 Automatisierungen" (ohne Punkt)
  content = content.replace(/1229\+? Automatisierungen/g, '2.100+ Automatisierungen');

  // 6) Headline "24 Agenten. 1.229 Automatisierungen. Ein System."
  content = content.replace(/1\.229 Automatisierungen\. Ein System\./g, '2.100+ Automatisierungen. Ein System.');
  content = content.replace(/1229 Automatisierungen\. Ein System\./g, '2.100+ Automatisierungen. Ein System.');

  // 7) generische "1.229" und "1229" Vorkommen (z.B. in Pricing-Box-Text)
  content = content.replace(/1\.229/g, '2.100+');
  content = content.replace(/\b1229\b/g, '2.100+');

  // 8) Schritt-1-Text: "Alles inklusive — kein Basis-Paket nötig." -> Vorschlag B
  content = content.replace(
    /8 bis 24 Agenten\. Je nach Betrieb und Wachstumsziel\. Alles inklusive — kein Basis-Paket nötig\./g,
    '8 bis 24 Agenten. Starten Sie passend zu Ihrer Größe und wachsen Sie flexibel mit.'
  );
  // Variante mit normalem Bindestrich/Leerzeichen-Unterschieden abfangen
  content = content.replace(
    /8 bis 24 Agenten\.\s*Je nach Betrieb und Wachstumsziel\.\s*Alles inklusive\s*[—-]\s*kein Basis[-\s]?Paket n[öo]tig\.?/g,
    '8 bis 24 Agenten. Starten Sie passend zu Ihrer Größe und wachsen Sie flexibel mit.'
  );

  if (content !== before) {
    fs.writeFileSync(file, content, 'utf8');
    totalFiles++;
    changedFiles.push(path.relative(root, file));
  }
}

console.log(`\n✅ FERTIG`);
console.log(`   ${totalFiles} Dateien aktualisiert:`);
changedFiles.forEach(f => console.log(`   - ${f}`));
console.log(`\n📋 Ersetzungen:`);
console.log(`   110 Branchen -> 198 Branchen`);
console.log(`   1.229 / 1229 Automatisierungen -> 2.100+ Automatisierungen`);
console.log(`   Schritt-1-Text -> Wachstum-Variante (Vorschlag B)`);
