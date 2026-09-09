// ============================================================================
// ARGONAUT OS · tests/importKatalog.test.mjs
//
// Prueft den Import-Katalog und die erzeugten Mustervorlagen — reine Logik,
// keine Datenbank, kein Browser. Laeuft mit `node --test`.
//
// Warum diese Tests: am 09.09.2026 stellte sich heraus, dass die zwei
// wichtigsten Datenarten (Kontakte, Artikel) im Katalog KEINEN Vorlagen-Knopf
// hatten, obwohl der Parser laengst eine passende Vorlage erzeugen konnte.
// Test 3 und 4 sorgen dafuer, dass das nicht wieder auseinanderlaeuft.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMPORT_QUELLEN, IMPORT_GRUPPEN, importQuellen, hatVorlage,
  zaehleImporte, gruppiereImporte, sucheImporte, quellenFuerModule, modulAusZiel,
} from '../out/importKatalog.js';

import {
  ZIELE, zielDef, baueMustervorlage, errateMapping, ZEILEN_JE_MUSTERVORLAGE,
} from '../out/importParser.js';

// --- 1) Katalog ist in sich stimmig ----------------------------------------

test('jede Quelle hat einen eindeutigen Schluessel', () => {
  const keys = IMPORT_QUELLEN.map((q) => q.key);
  assert.equal(new Set(keys).size, keys.length, 'doppelter Schluessel im Katalog');
});

test('jede Quelle gehoert zu einer bekannten Gruppe und hat ein Ziel', () => {
  const gruppen = new Set(IMPORT_GRUPPEN.map((g) => g.key));
  for (const q of IMPORT_QUELLEN) {
    assert.ok(gruppen.has(q.gruppe), `unbekannte Gruppe bei ${q.key}: ${q.gruppe}`);
    assert.ok(q.zielHref.startsWith('/dashboard/'), `Ziel ohne /dashboard/ bei ${q.key}`);
    assert.ok(q.label.trim().length > 0 && q.beschreibung.trim().length > 0, `Text fehlt bei ${q.key}`);
  }
});

test('importQuellen() gibt eine Kopie zurueck, nicht die Konstante', () => {
  const a = importQuellen();
  a.pop();
  assert.notEqual(a.length, IMPORT_QUELLEN.length);
});

// --- 2) Vorlagen-Pfade ------------------------------------------------------

test('jede vorlage zeigt auf /vorlagen/ und endet auf .csv', () => {
  for (const q of IMPORT_QUELLEN.filter((x) => x.vorlage)) {
    assert.ok(q.vorlage.startsWith('/vorlagen/'), `falscher Vorlagen-Pfad bei ${q.key}`);
    assert.ok(q.vorlage.endsWith('.csv'), `Vorlage ohne .csv bei ${q.key}`);
  }
});

test('eine Quelle hat entweder eine Datei-Vorlage oder eine erzeugte — nie beides', () => {
  for (const q of IMPORT_QUELLEN) {
    assert.ok(!(q.vorlage && q.musterZiel), `${q.key} haette zwei Vorlagen-Knoepfe`);
  }
});

// --- 3) musterZiel trifft ein echtes Ziel im Parser -------------------------

test('jedes musterZiel gibt es wirklich in ZIELE', () => {
  const zielKeys = new Set(ZIELE.map((z) => z.key));
  for (const q of IMPORT_QUELLEN.filter((x) => x.musterZiel)) {
    assert.ok(zielKeys.has(q.musterZiel), `musterZiel "${q.musterZiel}" (${q.key}) steht in keinem ZIEL`);
    assert.ok(zielDef(q.musterZiel), `zielDef() findet ${q.musterZiel} nicht`);
  }
});

test('die zwei wichtigsten Datenarten haben eine Vorlage — Kontakte und Artikel', () => {
  for (const key of ['kontakte', 'artikel']) {
    const q = IMPORT_QUELLEN.find((x) => x.key === key);
    assert.ok(q, `${key} fehlt im Katalog`);
    assert.ok(hatVorlage(q), `${key} hat keinen Vorlagen-Knopf — genau der Fehler vom 09.09.`);
  }
});

test('zaehleImporte zaehlt erzeugte Vorlagen mit', () => {
  const kpi = zaehleImporte(IMPORT_QUELLEN);
  const datei = IMPORT_QUELLEN.filter((q) => q.vorlage).length;
  const erzeugt = IMPORT_QUELLEN.filter((q) => q.musterZiel).length;
  assert.equal(kpi.gesamt, IMPORT_QUELLEN.length);
  assert.equal(kpi.mitVorlage, datei + erzeugt);
  assert.ok(erzeugt > 0, 'keine einzige erzeugte Vorlage im Katalog');
});

// --- 4) Die erzeugten Vorlagen sind gueltige CSV ----------------------------

test('jede erzeugte Vorlage hat Kopfzeile plus drei Beispielzeilen, alle gleich breit', () => {
  assert.equal(ZEILEN_JE_MUSTERVORLAGE, 3);
  for (const q of IMPORT_QUELLEN.filter((x) => x.musterZiel)) {
    const csv = baueMustervorlage(q.musterZiel);
    assert.ok(csv.startsWith('﻿'), `BOM fehlt bei ${q.musterZiel} — deutsches Excel zeigt dann Kraut`);
    const zeilen = csv.replace(/^﻿/, '').trim().split('\r\n');
    assert.equal(zeilen.length, 1 + ZEILEN_JE_MUSTERVORLAGE, `falsche Zeilenzahl bei ${q.musterZiel}`);
    const breite = zeilen[0].split(';').length;
    for (const z of zeilen) {
      assert.equal(z.split(';').length, breite, `ungleiche Spaltenzahl bei ${q.musterZiel}: ${z}`);
    }
  }
});

test('Pflichtfelder sind in JEDER Beispielzeile gefuellt', () => {
  for (const q of IMPORT_QUELLEN.filter((x) => x.musterZiel)) {
    const ziel = zielDef(q.musterZiel);
    const pflicht = ziel.felder.map((f, i) => (f.pflicht ? i : -1)).filter((i) => i >= 0);
    if (pflicht.length === 0) continue;
    const zeilen = baueMustervorlage(q.musterZiel).replace(/^﻿/, '').trim().split('\r\n').slice(1);
    for (const z of zeilen) {
      const spalten = z.split(';');
      for (const i of pflicht) {
        assert.ok((spalten[i] ?? '').trim().length > 0,
          `Pflichtfeld leer in Beispielzeile von ${q.musterZiel}: "${z}"`);
      }
    }
  }
});

test('die eigene Vorlage wird vom eigenen Parser wieder erkannt', () => {
  for (const q of IMPORT_QUELLEN.filter((x) => x.musterZiel)) {
    const kopf = baueMustervorlage(q.musterZiel).replace(/^﻿/, '').split('\r\n')[0].split(';');
    const map = errateMapping(kopf, q.musterZiel);
    const ziel = zielDef(q.musterZiel);
    for (const f of ziel.felder) {
      assert.ok(Object.values(map).includes(f.key),
        `Feld "${f.key}" der Vorlage ${q.musterZiel} wird beim Wiedereinlesen nicht erkannt`);
    }
  }
});

test('unbekanntes Ziel liefert leere Vorlage statt Absturz', () => {
  assert.equal(baueMustervorlage('gibtsnicht'), '');
  assert.equal(baueMustervorlage(''), '');
});

// --- 5) Branchen-Filter -----------------------------------------------------

test('modulAusZiel nimmt den laengsten passenden Pfad', () => {
  const pfade = { erp: '/dashboard/erp', lieferanten: '/dashboard/erp/lieferanten' };
  assert.equal(modulAusZiel('/dashboard/erp/lieferanten', pfade), 'lieferanten');
  assert.equal(modulAusZiel('/dashboard/erp/preisliste', pfade), 'erp');
  assert.equal(modulAusZiel('/dashboard/unbekannt', pfade), undefined);
  assert.equal(modulAusZiel('', pfade), undefined);
});

test('ohne Modulliste bleiben alle Quellen sichtbar', () => {
  const pfade = { crm: '/dashboard/crm' };
  assert.equal(quellenFuerModule([], pfade).length, IMPORT_QUELLEN.length);
  assert.equal(quellenFuerModule(null, pfade).length, IMPORT_QUELLEN.length);
});

test('der Branchen-Filter laesst Kontakte drin, wenn crm gebucht ist', () => {
  const pfade = { crm: '/dashboard/crm', zuschnitt: '/dashboard/zuschnitt' };
  const gefiltert = quellenFuerModule(['crm'], pfade);
  assert.ok(gefiltert.some((q) => q.key === 'kontakte'), 'Kontakte verschwinden trotz crm');
  assert.ok(!gefiltert.some((q) => q.key === 'zuschnitt'), 'Zuschnitt bleibt trotz fehlendem Modul');
});

test('gruppieren und suchen verlieren keine Quelle', () => {
  const summe = gruppiereImporte(IMPORT_QUELLEN).reduce((n, g) => n + g.quellen.length, 0);
  assert.equal(summe, IMPORT_QUELLEN.length, 'eine Quelle faellt beim Gruppieren raus');
  assert.equal(sucheImporte(IMPORT_QUELLEN, '').length, IMPORT_QUELLEN.length);
  assert.ok(sucheImporte(IMPORT_QUELLEN, 'lieferant').length >= 1);
  assert.equal(sucheImporte(IMPORT_QUELLEN, 'xyzgibtsnicht').length, 0);
});
