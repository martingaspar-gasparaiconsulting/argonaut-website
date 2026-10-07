// ============================================================================
// tests/kfzMedienP262.test.mjs — Paket 262 (07.10.2026) · K3 Fotos und Medien
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SCHABLONE, schabloneStand, pruefeMedium, medienPfad, endungFuer, verschieben, sortiert, MEDIEN_BUCKET, VIDEO_MAX_MB } from '../out/kfzMedien.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const MB = 1024 * 1024;

test('Schablone: 14 Ansichten, Titelbild zuerst, Stand zählt nur Fotos', () => {
  assert.equal(SCHABLONE.length, 14);
  assert.equal(SCHABLONE[0].key, 'front_links');
  assert.equal(new Set(SCHABLONE.map((x) => x.key)).size, 14);
  const st = schabloneStand([{ art: 'foto', schablone: 'front_links' }, { art: 'foto', schablone: 'front_links' }, { art: 'video', schablone: 'heck' }, { art: 'foto', schablone: null }]);
  assert.deepEqual(st.belegt, ['front_links']);
  assert.equal(st.fehlt.length, 13);
  assert.equal(st.prozent, 7);
  assert.equal(schabloneStand([]).prozent, 0);
});

test('Datei-Prüfung: Fotos, Videos, HEIC ohne Typ, Größen, nie HTML/SVG', () => {
  assert.ok(pruefeMedium('foto', 'a.jpg', 'image/jpeg', 3 * MB).ok);
  assert.ok(pruefeMedium('foto', 'IMG_1.HEIC', '', 3 * MB).ok, 'HEIC unter Windows ohne Typ');
  assert.equal(pruefeMedium('foto', 'a.svg', 'image/svg+xml', 1000).ok, false);
  assert.equal(pruefeMedium('foto', 'a.html', 'text/html', 1000).ok, false);
  assert.equal(pruefeMedium('foto', 'a.jpg', 'image/jpeg', 26 * MB).ok, false);
  assert.ok(pruefeMedium('video', 'rundgang.mov', 'video/quicktime', 40 * MB).ok);
  assert.equal(pruefeMedium('video', 'r.mp4', 'video/mp4', (VIDEO_MAX_MB + 1) * MB).ok, false);
  assert.equal(pruefeMedium('video', 'r.avi', 'video/x-msvideo', MB).ok, false);
});

test('Pfad: Betrieb zuerst (Speicher-Wächter und Regeln), keine fremden Zeichen', () => {
  assert.equal(medienPfad('cccc-1', 'ffff-2', 'webp', 1700000000000, 'ab12cd34ef'), 'cccc-1/ffff-2/1700000000000-ab12cd34.webp');
  assert.equal(medienPfad('../x', 'f/../y', 'jpg', 1, 'z'), 'x/fy/1-z.jpg');
  assert.equal(medienPfad('', 'f', 'jpg', 1, 'z'), null);
  assert.equal(medienPfad('b', '', 'jpg', 1, 'z'), null);
  assert.equal(endungFuer('image/webp', 'x.jpg'), 'webp');
  assert.equal(endungFuer('video/quicktime', 'x'), 'mov');
  assert.equal(endungFuer('', 'Bild.HEIC'), 'heic');
  assert.equal(MEDIEN_BUCKET, 'fahrzeug-medien');
});

test('Reihenfolge: verschieben und sortieren', () => {
  const l = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(verschieben(l, 2, 0), [{ id: 'c', position: 1 }, { id: 'a', position: 2 }, { id: 'b', position: 3 }]);
  assert.deepEqual(verschieben(l, 0, 9).map((x) => x.id), ['a', 'b', 'c'], 'ungültig = unverändert');
  assert.deepEqual(verschieben(l, 1, 1).map((x) => x.position), [1, 2, 3]);
  const s = sortiert([
    { id: 'x', art: 'foto', schablone: 'heck', position: 0 },
    { id: 'y', art: 'foto', schablone: 'front_links', position: 0 },
    { id: 'z', art: 'foto', schablone: null, position: 1 },
  ]);
  assert.deepEqual(s.map((m) => m.id), ['y', 'x', 'z']);
});

test('SQL 262: privater Ordner, Betrieb als erster Ordner, kein HTML/SVG, additiv', () => {
  const q = lies('supabase-sql/p262-kfz-medien.sql');
  assert.doesNotMatch(q, /drop table|truncate|delete from/i);
  assert.match(q, /'fahrzeug-medien', 'fahrzeug-medien', false, 52428800/);
  const typen = q.match(/array\[([^\]]*)\]/)[1];
  assert.match(typen, /image\/webp/);
  assert.doesNotMatch(typen, /svg|html|javascript/i);
  assert.equal((q.match(/\(storage\.foldername\(name\)\)\[1\] = coalesce\(public\.mein_chef_id\(\), auth\.uid\(\)\)::text/g) || []).length, 3);
  assert.match(q, /fahrzeug_medien_insert[\s\S]*?darf_ich_modul_aendern\('kfz'\)/);
  assert.match(q, /execute function public\.p181_besitzer\(\)/);
});

test('Seiten: Reiter Fotos, Ampel mit echter Foto-Zahl, Upload mit Verkleinern', () => {
  const a = lies('app/dashboard/kfz/bestand/[id]/page.tsx');
  assert.match(a, /\['fotos', 'Fotos und Video'\]/);
  assert.match(a, /fotos: fotoZahl/);
  assert.doesNotMatch(a, /fotos: 0,/);
  const m = lies('app/dashboard/kfz/bestand/KfzMedien.tsx');
  assert.match(m, /verkleinereBild\(datei, 2400, 0\.85\)/);
  assert.match(m, /capture="environment"/);
  assert.match(m, /remove\(\[pfad\]\)/, 'Datei wird entfernt, wenn der Eintrag scheitert');
  assert.doesNotMatch(m, /window\.confirm|\bdu\b|\bdein/i);
});
