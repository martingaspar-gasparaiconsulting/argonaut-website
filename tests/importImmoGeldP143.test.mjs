// Paket 143 (28.09.2026) — Kautionen + Mietzahlungen (GEMEINSAM, freigegeben 27.09.2026, nur Chef).
// Stand des Kautionskontos und nur BEZAHLTE Mieten — keine Buchungen, keine Mahnlaeufe.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN, erkennungsFelder } from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage, leseMonat, GELDFELDER } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';
import { importErlaubt } from '../out/importRechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// Live laut p138-Kontrolle: immo_kaution 11, immo_zahlungen 8 Spalten
const KAUTION = [['id', 'uuid'], ['owner_user_id', 'uuid'], ['vertrag_id', 'uuid', true], ['soll', 'numeric'], ['eingaenge', 'jsonb'],
  ['anlage', 'text'], ['zinsen', 'numeric'], ['einbehalte', 'jsonb'], ['rueckgabe_am', 'date'], ['ausgezahlt', 'numeric'], ['erstellt_am', 'timestamp with time zone']];
const ZAHLUNG = [['id', 'uuid'], ['owner_user_id', 'uuid'], ['vertrag_id', 'uuid', true], ['monat', 'date'], ['betrag', 'numeric'],
  ['bezahlt_am', 'date'], ['notiz', 'text'], ['erstellt_am', 'timestamp with time zone']];
const db = (tab, sp) => sp.map(([spalte, datentyp, pflicht]) => ({ tabelle: tab, spalte, datentyp, pflicht: !!pflicht }));
function datei(key, dbs, text) {
  const t = leseCsv(text); const z = katalogFuerZiel(key, dbs).ziel;
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles(key, map, t.kopf, t.zeilen, { ziel: z }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}
const K = (text) => datei('kautionen', db('immo_kaution', KAUTION), text);
const Z = (text) => datei('mietzahlungen', db('immo_zahlungen', ZAHLUNG), text);

test('Paket 143: beide Karten auf dem Motor, nur Chef, Mietvertrag Pflicht und nie angelegt', () => {
  assert.equal(KAUTION.length, 11); assert.equal(ZAHLUNG.length, 8);
  for (const key of ['kautionen', 'mietzahlungen']) {
    assert.equal(importQuellen().find((x) => x.key === key)?.motor, key);
    const z = zielDef(key);
    assert.equal(z.nurChef, true, key);
    assert.equal(z.nachschlag.tabelle, 'immo_mietvertraege');
    assert.equal(z.nachschlag.nameSpalte, 'mieter_name');
    assert.equal(z.nachschlag.pflicht, true);
    assert.equal(z.nachschlag.anlegen, undefined, 'Vertraege werden nie angelegt');
    assert.equal(importErlaubt(key, { chef: false, module: ['immobilien'], schreibModule: ['immobilien'] }).ok, false);
    assert.equal(importErlaubt(key, { chef: true, module: [], schreibModule: null }).ok, true);
  }
  assert.deepEqual(katalogFuerZiel('kautionen', db('immo_kaution', KAUTION)).zusatz.map((f) => f.key), []);
  assert.deepEqual(katalogFuerZiel('mietzahlungen', db('immo_zahlungen', ZAHLUNG)).zusatz.map((f) => f.key), []);
  for (const g of ['soll', 'ausgezahlt', 'betrag']) assert.ok(GELDFELDER.includes(g), g);
  // Die Mieter-Seite liest genau diese Form
  const seite = lies('app/dashboard/immobilien/mieter/page.tsx');
  assert.ok(seite.includes('einbehalte: { grund: string; betrag: number }[]'));
});

test('Kaution: eingezahlt -> EIN Eingang, Einbehalt mit Grund, Warnungen', () => {
  const r = K('Mieter;Kaution;Eingezahlt;Eingezahlt am;Einbehalt;Grund;Ausgezahlt\nAnna Beispiel;2100;2100;01.03.2024;;;\nBernd Muster;1800;2000;;150;;500\n');
  const [a, b] = r.b.saetze;
  assert.deepEqual(a.eingaenge, [{ am: '2024-03-01', betrag: 2100 }]);
  assert.ok(!('einbehalte' in a));
  assert.ok(!('eingezahlt' in a) && !('eingezahlt_am' in a) && !('einbehalt' in a), 'Rechenfelder nie in die DB');
  assert.equal(a.__nach, 'Anna Beispiel');
  assert.match(b.eingaenge[0].am, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(b.einbehalte, [{ grund: 'Übernommen aus dem Altsystem', betrag: 150 }]);
  assert.ok(r.b.warnungen.some((w) => w.zeile === 3 && /Kein Eingangsdatum/.test(w.meldung)));
  assert.ok(r.b.warnungen.some((w) => w.zeile === 3 && /mehr als vereinbart/.test(w.meldung)));
  assert.ok(r.b.warnungen.some((w) => w.zeile === 3 && /ohne Rückgabedatum/.test(w.meldung)));
  assert.equal(r.bil.verschluckt, 0);
});

test('Kaution: ein Konto je Vertrag — derselbe Mieter zweimal in der Datei nur einmal; ohne Mieter raus', () => {
  assert.deepEqual(erkennungsFelder(katalogFuerZiel('kautionen', db('immo_kaution', KAUTION)).ziel), ['vertrag_id']);
  const r = K('Mieter;Kaution\nAnna Beispiel;2100\nAnna Beispiel;2100\n;900\n');
  assert.equal(r.b.gut, 1);
  assert.equal(r.b.dubletten_in_datei, 1);
  assert.ok(r.b.fehler.some((f) => f.zeile === 4 && /Pflichtfeld/.test(f.meldung)));
  const u = K('Mieter;Kaution\nAnna;viel\n');
  assert.ok(u.b.fehler.some((f) => /kein lesbarer Betrag/.test(f.meldung)));
});

test('Mietmonat lesen: 07/2026, 9.2026, 2026-08, Juli 2026, Aug 26, Datum; Unsinn = null', () => {
  assert.equal(leseMonat('07/2026'), '2026-07-01');
  assert.equal(leseMonat('9.2026'), '2026-09-01');
  assert.equal(leseMonat('2026-08'), '2026-08-01');
  assert.equal(leseMonat('Juli 2026'), '2026-07-01');
  assert.equal(leseMonat('März 2026'), '2026-03-01');
  assert.equal(leseMonat('Aug 26'), '2026-08-01');
  assert.equal(leseMonat('15.08.2026'), '2026-08-01');
  assert.equal(leseMonat('13/2026'), null);
  assert.equal(leseMonat('bald'), null);
});

test('Mietzahlungen: nur bezahlt — offene/rueckstaendige Zeilen und Zeilen ohne Zahlungsdatum fallen heraus', () => {
  const r = Z('Mieter;Monat;Miete;Zahlungsdatum;Status\nAnna Beispiel;07/2026;850;01.07.2026;bezahlt\nAnna Beispiel;08/2026;850;;offen\nBernd Muster;08/2026;720;;\nBernd Muster;09/2026;720;02.09.2026;Rückstand\n');
  assert.equal(r.b.gut, 1);
  assert.equal(r.b.saetze[0].monat, '2026-07-01');
  assert.equal(r.b.saetze[0].bezahlt_am, '2026-07-01');
  assert.ok(!('zahlstatus_alt' in r.b.saetze[0]));
  assert.ok(r.b.fehler.some((f) => f.zeile === 3 && /Nicht \(voll\) bezahlt/.test(f.meldung)));
  assert.ok(r.b.fehler.some((f) => f.zeile === 4 && /Pflichtfeld/.test(f.meldung)));
  assert.ok(r.b.fehler.some((f) => f.zeile === 5 && /Nicht \(voll\) bezahlt/.test(f.meldung)));
  assert.equal(r.bil.verschluckt, 0);
});

test('Mietzahlungen: ohne/unlesbarer Monat -> Monat der Zahlung + Warnung; Doppelte in der Datei einmal', () => {
  const r = Z('Mieter;Monat;Betrag;Bezahlt am\nAnna;;850;03.08.2026\nAnna;Sommer;850;03.09.2026\nAnna;10/2026;850;01.10.2026\nAnna;10/2026;850;01.10.2026\n');
  assert.equal(r.b.gut, 3);
  assert.equal(r.b.dubletten_in_datei, 1);
  assert.equal(r.b.saetze[0].monat, '2026-08-01');
  assert.equal(r.b.saetze[1].monat, '2026-09-01');
  assert.match(r.b.saetze[1].notiz, /Monat im Altsystem: Sommer/);
  assert.equal(r.b.warnungen.filter((w) => w.feld === 'Monat').length, 2);
  assert.deepEqual(erkennungsFelder(katalogFuerZiel('mietzahlungen', db('immo_zahlungen', ZAHLUNG)).ziel), ['vertrag_id+monat+betrag+bezahlt_am']);
});

test('Mustervorlagen laufen rund', () => {
  const k = K(baueMustervorlage('kautionen').replace(/^﻿/, ''));
  assert.equal(k.bil.verschluckt, 0);
  assert.ok(!Object.values(k.map).includes(EIGEN));
  assert.equal(k.b.gut, 3);
  assert.deepEqual(k.b.saetze[2].einbehalte, [{ grund: 'Reparatur Türschloss', betrag: 150 }]);
  assert.equal(k.b.saetze[2].ausgezahlt, 2285.2);
  const z = Z(baueMustervorlage('mietzahlungen').replace(/^﻿/, ''));
  assert.equal(z.bil.verschluckt, 0);
  assert.ok(!Object.values(z.map).includes(EIGEN));
  assert.equal(z.b.gut, 3);
  assert.equal(z.b.saetze[1].monat, '2026-08-01');
});
