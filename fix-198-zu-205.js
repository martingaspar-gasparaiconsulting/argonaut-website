// fix-198-zu-205.js
// Ersetzt projektweit "198 Branchen" (und Varianten) durch "205 Branchen"
// node fix-198-zu-205.js

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

  // "198 Branchen" -> "205 Branchen" (alle Vorkommen, inkl. "Alle 198 Branchen")
  content = content.replace(/198 Branchen/g, '205 Branchen');

  // Standalone "198" als Stats-Zahl (Hero.tsx Banner) - vorsichtig nur wenn von "Branchen abgedeckt" Kontext umgeben
  // Bereits durch "198 Branchen" oben abgedeckt falls Text direkt dabei steht.
  // Fuer das Stats-Banner (>198</p>) separat:
  content = content.replace(/marginBottom: '20px' }}>198<\/p>/, "marginBottom: '20px' }}>205</p>");

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
console.log(`   198 Branchen -> 205 Branchen (alle Vorkommen)`);
console.log(`   Stats-Banner Zahl 198 -> 205`);
