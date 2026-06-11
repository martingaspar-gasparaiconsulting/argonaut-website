const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'components', 'Hero.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const before = content;
content = content.replace(/marginBottom: '20px' }}>110<\/p>/, "marginBottom: '20px' }}>198</p>");

if (content !== before) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Hero.tsx: 110 -> 198 ersetzt.');
} else {
  console.log('⚠️ Keine Aenderung - Pattern nicht gefunden.');
}
