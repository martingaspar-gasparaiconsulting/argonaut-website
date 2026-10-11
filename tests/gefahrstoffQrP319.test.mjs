// Paket 319 (11.10.2026): G2a Gefahrstoffverzeichnis 2.0 Teil 2 — QR am Lagerplatz
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  HANDY_PFAD, platzSchluessel, platzUrl, plaetzeMitAnzahl, stoffeAmPlatz, qrSvg, betriebsanweisungText,
} from '../out/gefahrstoffLager.js';
import { mitarbeiterDarf, pfadErlaubtFuerNutzerTyp } from '../out/rechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Handy-Ansicht liegt unter Mein Bereich: jeder Beschäftigte, auch Self-Service, ohne Modul-Recht', () => {
  assert.equal(HANDY_PFAD, '/dashboard/mein-bereich/gefahrstoffe');
  assert.equal(mitarbeiterDarf(HANDY_PFAD, []), true, 'ohne jedes Modul');
  assert.equal(pfadErlaubtFuerNutzerTyp(HANDY_PFAD, 'self_service'), true);
  assert.equal(pfadErlaubtFuerNutzerTyp(HANDY_PFAD, 'standard'), true);
  assert.equal(mitarbeiterDarf('/dashboard/nachweise/gefahrstoffe', []), false, 'Pflege-Seite bleibt geschützt');
  assert.ok(fs.existsSync(path.join(WURZEL, 'app/dashboard/mein-bereich/gefahrstoffe/page.tsx')));
});

test('Lagerplatz-Adresse: kodiert, gesäubert, ohne doppelten Schrägstrich', () => {
  assert.equal(platzUrl('https://argonaut-os.com/', '  Schrank  Halle 2 '), 'https://argonaut-os.com/dashboard/mein-bereich/gefahrstoffe?platz=Schrank%20Halle%202');
  assert.equal(platzUrl('https://x.de', 'Öl & Fett/Regal #3'), 'https://x.de/dashboard/mein-bereich/gefahrstoffe?platz=%C3%96l%20%26%20Fett%2FRegal%20%233');
  assert.equal(platzUrl('https://x.de', ''), 'https://x.de/dashboard/mein-bereich/gefahrstoffe');
  const u = new URL(platzUrl('https://x.de', 'Öl & Fett/Regal #3'));
  assert.equal(u.searchParams.get('platz'), 'Öl & Fett/Regal #3', 'kommt beim Lesen unverändert zurück');
});

test('Plätze zählen und Stoffe filtern: Groß/klein und Leerzeichen egal', () => {
  const l = [
    { bezeichnung: 'Zement', lagerplatz: 'Halle 2' }, { bezeichnung: 'Aceton', lagerplatz: 'halle  2' },
    { bezeichnung: 'Lack', lagerplatz: 'Schrank A' }, { bezeichnung: 'Reiniger', lagerplatz: null }, { bezeichnung: 'X', lagerplatz: '  ' },
  ];
  assert.deepEqual(plaetzeMitAnzahl(l), [{ platz: 'Halle 2', anzahl: 2 }, { platz: 'Schrank A', anzahl: 1 }]);
  assert.deepEqual(stoffeAmPlatz(l, 'HALLE 2').map((s) => s.bezeichnung), ['Aceton', 'Zement']);
  assert.equal(stoffeAmPlatz(l, '').length, 5, 'leer = alle');
  assert.equal(stoffeAmPlatz(l, 'Keller').length, 0);
  assert.equal(platzSchluessel(' A  b '), 'a b');
  assert.deepEqual(plaetzeMitAnzahl(null), []);
});

test('QR als SVG: weiße Ruhezone, nur Module, unsichere Farbe wird schwarz', () => {
  const m = [[true, false], [false, true]];
  const s = qrSvg(m);
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 10 10"/);
  assert.match(s, /<rect width="10" height="10" fill="#ffffff"\/>/);
  assert.match(s, /d="M4 4h1v1h-1zM5 5h1v1h-1z"/);
  assert.match(qrSvg(m, '"><script>'), /fill="#000000"/);
  assert.equal(qrSvg([]), '');
});

test('Betriebsanweisung: ehrlich — nur Datum, fehlt = rot mit Handlungsanweisung', () => {
  assert.deepEqual(betriebsanweisungText('2025-07-01'), { ok: true, text: 'Betriebsanweisung vom 01.07.2025 — hängt am Arbeitsplatz aus bzw. liegt bei der Geschäftsleitung' });
  assert.equal(betriebsanweisungText(null).ok, false);
  assert.match(betriebsanweisungText('2025-02-30').text, /fehlt/);
});

test('Handy-Seite: nur lesen, SDB über den Server, kein Schreiben', () => {
  const s = lies('app/dashboard/mein-bereich/gefahrstoffe/page.tsx');
  assert.ok(!/\.(insert|update|delete|upsert)\(/.test(s), 'keine Schreibzugriffe');
  assert.ok(!/storage\./.test(s), 'kein Direktzugriff auf den Speicher');
  assert.match(s, /href=\{`\/api\/gefahrstoff\/sdb\?id=\$\{s\.id\}`\}/);
  assert.match(s, /<Leerzustand /);
});

test('Pflege-Seite: QR-Aushang nur Chef, Adresse über platzUrl, Name maskiert', () => {
  const s = lies('app/dashboard/nachweise/gefahrstoffe/page.tsx');
  assert.match(s, /istChef && zeilen\.length > 0 && <button style=\{knopf\} onClick=\{qrAushang\}/);
  assert.match(s, /platzUrl\(herkunft, p\.platz\)/);
  assert.match(s, /<h1>\$\{esc\(p\.platz\)\}<\/h1>/);
  const m = lies('app/dashboard/mein-bereich/page.tsx');
  assert.match(m, /href="\/dashboard\/mein-bereich\/gefahrstoffe"/);
  // Kein Guide-Eintrag: der Guide kennt nur Menue-Seiten (tests/guideWissenA2) — die Handy-Seite erklaert sich selbst (Leerzustand)
});
