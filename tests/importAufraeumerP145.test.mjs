// Paket 145 (28.09.2026) — Umzug Schritt 5: KI-Aufraeumer. Text -> Felder des Ziels -> CSV -> derselbe Motor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  aufraeumerErlaubt, kiFelder, aufraeumerPrompt, extrahiereJsonArray, antwortZuZeilen, zeilenZuCsv, teileText, enthaeltIban,
  AUFRAEUMER_MAX_ZEICHEN, AUFRAEUMER_MAX_PORTIONEN, AUFRAEUMER_MAX_ZEILEN,
} from '../out/importAufraeumer.js';
import { zielDef, leseCsv, pruefeAlles } from '../out/importParser.js';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN } from '../out/importMotor.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Welche Ziele: Personaldaten und Bestand nie, alles andere ja', () => {
  assert.equal(aufraeumerErlaubt('mitarbeiter').ok, false);
  assert.equal(aufraeumerErlaubt('mitarbeiter_qualifikation').ok, false);
  assert.equal(aufraeumerErlaubt('bestand_filiale').ok, false);
  assert.equal(aufraeumerErlaubt('gibtesnicht').ok, false);
  for (const k of ['kontakte', 'artikel', 'lieferanten', 'spenden', 'mitglieder']) assert.equal(aufraeumerErlaubt(k).ok, true, k);
});

test('Prompt nennt genau die Felder des Ziels, verbietet Erfinden und Bankdaten, Werte wie im Text', () => {
  const z = zielDef('artikel');
  const p = aufraeumerPrompt(z);
  for (const f of kiFelder(z)) assert.ok(p.includes(`"${f.key}"`), f.key);
  assert.match(p, /Erfinde nichts/);
  assert.match(p, /IBAN/);
  assert.match(p, /GENAU so, wie sie im Text stehen/);
  assert.ok(!kiFelder(zielDef('mitglieder')).some((f) => f.key === 'lead_vorname'), 'keine Namens-Helfer');
});

test('Antwort lesen: Zaeune/Vortext, nur bekannte Felder, IBAN verworfen, leere Saetze weg', () => {
  const roh = 'Gerne:\n```json\n[{"bezeichnung":"Kabel NYM 3x1,5","verkaufspreis":"89,90","geheim":"x"},{},"quatsch",{"bezeichnung":"Dose","beschreibung":"Konto DE02 1203 0000 0000 2020 51"}]\n```';
  const liste = extrahiereJsonArray(roh);
  assert.equal(liste.length, 4);
  const z = zielDef('artikel');
  const r = antwortZuZeilen(liste, z);
  assert.deepEqual(r.zeilen[0], { bezeichnung: 'Kabel NYM 3x1,5', verkaufspreis: '89,90' });
  assert.deepEqual(r.zeilen[1], { bezeichnung: 'Dose' });
  assert.equal(r.verworfen, 2);
  assert.throws(() => extrahiereJsonArray('Tut mir leid.'));
  assert.equal(enthaeltIban('DE02120300000000202051'), true);
  assert.equal(enthaeltIban('Artikel 4711'), false);
});

test('Zeilen -> CSV mit Feldnamen -> Motor erkennt alle Spalten, nichts als Eigenes Feld', () => {
  const z = zielDef('artikel');
  const csv = zeilenZuCsv([{ bezeichnung: 'Kabel; rot', verkaufspreis: '89,90', artikelnummer: 'K-1' }, { bezeichnung: 'Dose "UP"', einheit: 'Stk' }], z);
  const t = leseCsv(csv);
  assert.equal(t.zeilen.length, 2);
  const k = katalogFuerZiel('artikel', null).ziel;
  const map = vorschlagMapping(t.kopf, t.zeilen, k);
  assert.ok(!Object.values(map).includes(EIGEN));
  assert.equal(spaltenBilanz(t.kopf, t.zeilen, map, k).verschluckt, 0);
  const b = pruefeAlles('artikel', map, t.kopf, t.zeilen, { ziel: k });
  assert.equal(b.gut, 2);
  assert.equal(b.saetze[0].bezeichnung, 'Kabel; rot');
  assert.equal(b.saetze[0].verkaufspreis, 89.9);
  assert.equal(b.saetze[1].bezeichnung, 'Dose "UP"');
});

test('Text in Portionen an Zeilengrenzen; zu viel wird gemeldet; Hoechstzahl Zeilen', () => {
  const zeile = 'x'.repeat(100);
  const text = Array.from({ length: 500 }, () => zeile).join('\n');
  const { teile, zuViel } = teileText(text, 1000);
  assert.ok(teile.every((t) => t.length <= 1000));
  assert.equal(teile.join('\n').replace(/\n/g, '').length, 500 * 100);
  assert.equal(zuViel, true);
  assert.equal(teileText('a\nb').teile.length, 1);
  assert.equal(teileText('   ').teile.length, 0);
  const lang = teileText('y'.repeat(2500), 1000);
  assert.deepEqual(lang.teile.map((t) => t.length), [1000, 1000, 500]);
  assert.equal(AUFRAEUMER_MAX_PORTIONEN, 10);
  const viele = Array.from({ length: AUFRAEUMER_MAX_ZEILEN + 5 }, (_, i) => ({ bezeichnung: `A${i}` }));
  const r = antwortZuZeilen(viele, zielDef('artikel'));
  assert.equal(r.zeilen.length, AUFRAEUMER_MAX_ZEILEN);
  assert.equal(r.verworfen, 5);
});

test('Route: Login, Import-Recht, Laengen-Deckel, kiFetch; Seite nutzt denselben Motor', () => {
  const r = lies('app/api/import-aufraeumen/route.ts');
  assert.ok(r.includes("auth.getUser()"));
  assert.ok(r.includes("{ status: 401 }"));
  assert.ok(r.includes('importErlaubt(zielKey, stand)'));
  assert.ok(r.includes('rohtext.length > AUFRAEUMER_MAX_ZEICHEN'));
  assert.ok(r.includes("kiFetch('import-aufraeumen'"));
  assert.ok(!/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(r), 'Route schreibt nichts');
  assert.equal(AUFRAEUMER_MAX_ZEICHEN, 18000);
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(s.includes('await dateiLesen(new File([csv]'));
  assert.ok(s.includes('Der Text wird dafür an unseren KI-Dienst übermittelt'));
});
