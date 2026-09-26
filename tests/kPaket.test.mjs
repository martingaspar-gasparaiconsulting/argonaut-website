// Paket K (26.09.2026) — Kleinkram K1 bis K5.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function alleDateien(dir, out = []) {
  for (const e of fs.readdirSync(new URL('../' + dir, import.meta.url), { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) alleDateien(p, out); else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}
function funktion(s, name) {
  const i = s.search(new RegExp(`async function ${name}\\(`));
  assert.ok(i >= 0, name);
  let t = s.indexOf('{', s.indexOf(')', i)), tiefe = 0, j = t;
  for (; j < s.length; j++) { if (s[j] === '{') tiefe++; else if (s[j] === '}') { tiefe--; if (!tiefe) break; } }
  return s.slice(i, j + 1);
}

test('K1 Löschen fragt nach — und meldet, wenn nichts gelöscht wurde', () => {
  const ziele = [['bde', 'loesche'], ['ertraege', 'loesche'], ['chargen', 'delVerwendung'], ['chargen', 'delMerkmal'],
    ['fertigung', 'posLoeschen'], ['zuschnitt', 'teilLoeschen'], ['betriebskosten', 'loesche'], ['expose', 'interLoeschen'],
    ['gutachten', 'positionLoeschen'], ['hilfsmittel', 'positionLoeschen'], ['ernte', 'loescheVerkauf'], ['bau-lv', 'posLoeschen']];
  for (const [d, f] of ziele) {
    const body = funktion(lies(`app/dashboard/${d}/page.tsx`), f);
    const iC = body.indexOf('window.confirm('), iD = body.indexOf('.delete()');
    assert.ok(iC > 0 && iC < iD, `${d}/${f}: Rückfrage vor dem Löschen`);
    assert.ok(body.includes('nichtsGeschrieben('), `${d}/${f}: Löschen ohne Prüfung`);
  }
  assert.ok(!/löschen mit ✕ sofort, ohne Rückfrage/.test(lies('lib/guideWissen.ts')));
});

test('K2 keine Du-Form in Leerzuständen', () => {
  const du = /(?:text|titel)="(?:Lege|Behalte|Erstelle|Verwalte|Erfasse|Dokumentiere|Plane|Lade|Buche|Melde|Verleihe|Kalkuliere|Sende|Pflege|Starte|Trage|Füge)\s/;
  const treffer = alleDateien('app').filter((p) => du.test(lies(p)));
  assert.deepEqual(treffer, []);
});

test('K3 Umlaute in sichtbaren Texten', () => {
  assert.ok(!lies('app/dashboard/energie/page.tsx').includes("'Waermepumpe'") && !lies('app/dashboard/energie/page.tsx').includes('>Waermepumpe<'));
  const sp = lies('app/dashboard/schichtplan/page.tsx');
  for (const alt of ['Schicht hinzufuegen', 'Vorlage wirklich loeschen?', 'Schichtart uebernehmen']) assert.ok(!sp.includes(alt), alt);
  const pa = lies('app/dashboard/einstellungen/PruefAuge.tsx');
  assert.ok(!pa.includes('Firmendaten pruefen') && pa.includes('Firmendaten prüfen'));
  const au = lies('lib/automation.ts');
  assert.ok(au.includes("label: 'Rechnung ist überfällig'") && !au.includes('Freundliche Gruesse'));
  // Schlüssel bleiben unangetastet
  assert.ok(au.includes("key: 'faellig_in_tagen'"));
  assert.ok(lies('app/dashboard/abo-rechnungen/page.tsx').includes('a.naechste_faellig'));
});

test('K4 Leertexte versprechen nichts, was es nicht gibt', () => {
  assert.ok(!lies('app/dashboard/aufmass/page.tsx').includes('Aufmaß in ein Angebot übernehmen'));
  assert.ok(!lies('app/dashboard/verleih/page.tsx').includes('Kaution buchen'));
  assert.ok(!lies('app/dashboard/personal/page.tsx').includes('Eintritt, Stunden und Standort ergänzen'));
  assert.ok(!lies('app/dashboard/bautagebuch/page.tsx').includes('Wetter, Arbeiten und Stunden erfassen'));
});

test('K5 Befund-Abfrage ändert nichts', () => {
  const sql = lies('supabase-sql/k5-zugriffsregeln-befund.sql').replace(/--[^\n]*/g, '');
  assert.ok(/^\s*select/i.test(sql));
  assert.ok(!/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b/i.test(sql));
});
