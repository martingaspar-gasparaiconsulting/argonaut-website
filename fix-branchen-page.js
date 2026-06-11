// fix-branchen-page.js
// Ersetzt das hartcodierte alleBranchen-Array in app/branchen/page.tsx
// durch eine dynamische Generierung aus lib/branchen.ts (205 Branchen)
// node fix-branchen-page.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app', 'branchen', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Finde Start ("const alleBranchen = [") und Ende (erste Zeile die nur "]" ist, danach)
let startIdx = -1;
let endIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const alleBranchen = [')) {
    startIdx = i;
    break;
  }
}
if (startIdx === -1) {
  console.log('FEHLER: "const alleBranchen = [" nicht gefunden.');
  process.exit(1);
}
for (let i = startIdx + 1; i < lines.length; i++) {
  if (lines[i].trim() === ']') {
    endIdx = i;
    break;
  }
}
if (endIdx === -1) {
  console.log('FEHLER: Ende des Arrays nicht gefunden.');
  process.exit(1);
}

console.log(`Gefunden: alleBranchen von Zeile ${startIdx + 1} bis ${endIdx + 1}`);

// Ersatz-Code: dynamische Generierung aus lib/branchen.ts
const replacement = `const KATEGORIEN_REIHENFOLGE = [
  'Medizin & Gesundheit',
  'Recht, Steuern & Finanzen',
  'Finanzen & Versicherung',
  'Handwerk & Bau',
  'Industrie & Produktion',
  'Handel & E-Commerce',
  'Handel',
  'KFZ & Mobilität',
  'Logistik & Transport',
  'Immobilien & Verwaltung',
  'IT & Technologie',
  'Marketing & Kommunikation',
  'Medien & Kommunikation',
  'Gastronomie & Tourismus',
  'Lebensmittel & Nahversorgung',
  'Beauty & Lifestyle',
  'Bildung & Soziales',
  'Bildung & Training',
  'Tiere & Natur',
  'Landwirtschaft',
  'Dienstleistungen',
  'Soziales & NGO',
  'Energie & Umwelt',
]

const alleBranchen = (() => {
  const vorhandeneKategorien = new Set(getAllBranchen().map((b) => b.kategorie))
  const reihenfolge = [
    ...KATEGORIEN_REIHENFOLGE.filter((k) => vorhandeneKategorien.has(k)),
    ...[...vorhandeneKategorien].filter((k) => !KATEGORIEN_REIHENFOLGE.includes(k)),
  ]
  return reihenfolge.map((kategorie) => ({
    kategorie,
    branchen: getBranchenByKategorie(kategorie).map((b) => ({ name: b.name, slug: b.slug })),
  }))
})()`;

lines.splice(startIdx, endIdx - startIdx + 1, replacement);
content = lines.join('\n');

// Import hinzufügen (nach den bestehenden imports)
if (!content.includes("from '@/lib/branchen'")) {
  content = content.replace(
    "import { useState } from 'react'",
    "import { useState } from 'react'\nimport { getAllBranchen, getBranchenByKategorie } from '@/lib/branchen'"
  );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ app/branchen/page.tsx aktualisiert: alleBranchen wird jetzt dynamisch aus lib/branchen.ts generiert (205 Branchen, 22 Kategorien).');
