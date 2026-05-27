const fs = require('fs'); 
const content = fs.readFileSync('app/layout.tsx', 'utf8'); 
fs.writeFileSync('app/layout.tsx', cleaned, 'utf8'); 
console.log('Crisp entfernt!'); 
