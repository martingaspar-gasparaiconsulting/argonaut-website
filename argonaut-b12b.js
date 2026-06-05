// === ARGONAUT B1.2-b: Auto-Trigger fuer Dokument-Upload ===
// Anpassung von DocumentsClient.tsx + Anlage der Server-Route zu n8n.
// Aendert nur die noetigen Stellen. Schreibt nur, wenn ALLE Edits sitzen.

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const clientPath = path.join(root, 'app', 'dashboard', 'documents', 'DocumentsClient.tsx');

if (!fs.existsSync(clientPath)) {
  console.log('FEHLER: DocumentsClient.tsx nicht gefunden unter ' + clientPath);
  console.log('Bitte das Script im Repo-Stammordner (argonaut-website) ausfuehren.');
  process.exit(1);
}

let src = fs.readFileSync(clientPath, 'utf8');

// --- Backup der aktuellen Client-Datei ---
const backupPath = clientPath.replace(/\.tsx$/, '.BACKUP-B1-2b.tsx');
fs.writeFileSync(backupPath, src, 'utf8');

const log = [];
let ok = 0;

// 1) Alte AUTO_ASSIGN-Konstante entfernen
const reConst = /const AUTO_ASSIGN: Record<string, string\[\]> = \{[\s\S]*?\n\}\n/;
if (reConst.test(src)) {
  src = src.replace(reConst, '');
  ok++; log.push('1) AUTO_ASSIGN-Konstante entfernt .......... OK');
} else { log.push('1) AUTO_ASSIGN-Konstante ................... NICHT GEFUNDEN'); }

// 2) Alten Auto-Zuweisungs-Block durch den n8n-Webhook-Trigger ersetzen
const reBlock = /\/\/ Auto-Agenten zuweisen[\s\S]*?\n {4}\}/;
const trigger =
"// Analyse-Pipeline automatisch starten (n8n-Webhook ueber sichere Server-Route)\n" +
"    try {\n" +
"      await fetch('/api/documents/trigger-analysis', {\n" +
"        method: 'POST',\n" +
"        headers: { 'Content-Type': 'application/json' },\n" +
"        body: JSON.stringify({\n" +
"          document_id: doc.id,\n" +
"          user_id: userId,\n" +
"          storage_path: path,\n" +
"          file_type: fileType,\n" +
"        }),\n" +
"      })\n" +
"    } catch (e) {\n" +
"      console.error('Analyse-Trigger fehlgeschlagen:', e)\n" +
"    }";
if (reBlock.test(src)) {
  src = src.replace(reBlock, trigger);
  ok++; log.push('2) Upload-Trigger eingebaut ................ OK');
} else { log.push('2) Auto-Zuweisungs-Block .................. NICHT GEFUNDEN'); }

// 3) availableAgents aus den useCallback-Dependencies entfernen
const depsOld = '}, [userId, maxMB, storageFull, availableAgents, supabase])';
const depsNew = '}, [userId, maxMB, storageFull, supabase])';
if (src.indexOf(depsOld) !== -1) {
  src = src.replace(depsOld, depsNew);
  ok++; log.push('3) Dependencies bereinigt ................. OK');
} else { log.push('3) Dependencies-Zeile ..................... NICHT GEFUNDEN'); }

// 4) Server-Route anlegen (Bruecke Browser -> n8n, umgeht CORS)
const routeDir = path.join(root, 'app', 'api', 'documents', 'trigger-analysis');
fs.mkdirSync(routeDir, { recursive: true });
const routeContent =
"import { NextRequest, NextResponse } from 'next/server'\n" +
"\n" +
"// Production-Webhook des n8n-Workflows. Diese URL ist nicht geheim.\n" +
"const N8N_WEBHOOK_URL = 'https://n8n.srv1133627.hstgr.cloud/webhook/argonaut-doc-analyze'\n" +
"\n" +
"export async function POST(req: NextRequest) {\n" +
"  try {\n" +
"    const body = await req.json()\n" +
"    const document_id = body.document_id\n" +
"    const user_id = body.user_id\n" +
"    const storage_path = body.storage_path\n" +
"    const file_type = body.file_type\n" +
"\n" +
"    if (!document_id || !user_id || !storage_path) {\n" +
"      return NextResponse.json(\n" +
"        { ok: false, error: 'document_id, user_id und storage_path sind erforderlich.' },\n" +
"        { status: 400 }\n" +
"      )\n" +
"    }\n" +
"\n" +
"    const res = await fetch(N8N_WEBHOOK_URL, {\n" +
"      method: 'POST',\n" +
"      headers: { 'Content-Type': 'application/json' },\n" +
"      body: JSON.stringify({ document_id, user_id, storage_path, file_type }),\n" +
"    })\n" +
"\n" +
"    if (!res.ok) {\n" +
"      const text = await res.text()\n" +
"      return NextResponse.json(\n" +
"        { ok: false, error: 'n8n-Status ' + res.status + ': ' + text },\n" +
"        { status: 502 }\n" +
"      )\n" +
"    }\n" +
"\n" +
"    return NextResponse.json({ ok: true })\n" +
"  } catch (err) {\n" +
"    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'\n" +
"    return NextResponse.json({ ok: false, error: msg }, { status: 500 })\n" +
"  }\n" +
"}\n";
fs.writeFileSync(path.join(routeDir, 'route.ts'), routeContent, 'utf8');
log.push('4) Server-Route angelegt .................. OK');

// --- Nur schreiben, wenn alle 3 Client-Edits sassen ---
console.log('');
console.log(log.join('\n'));
console.log('');
if (ok === 3) {
  fs.writeFileSync(clientPath, src, 'utf8');
  console.log('=== ALLES OK: DocumentsClient.tsx aktualisiert + Route angelegt ===');
  console.log('Backup liegt hier: ' + backupPath);
} else {
  console.log('=== ABBRUCH: ' + ok + '/3 Client-Edits gefunden ===');
  console.log('DocumentsClient.tsx wurde NICHT geaendert. (Backup + Route stehen bereits.)');
  console.log('Bitte diese Ausgabe an Claude schicken.');
}
