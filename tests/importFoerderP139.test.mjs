// Paket 139 (27.09.2026) — Foerdervorhaben (GEMEINSAM, freigegeben, nur Chef).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN, erkennungsFelder } from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage, foerderProgrammFinden, foerderEigenerKey } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';
import { importErlaubt } from '../out/importRechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// Spalten von foerder_vorhaben (buendel12 + PS4 + Seite)
const SPALTEN = [['id', 'uuid'], ['owner_user_id', 'uuid'], ['programm_key', 'text'], ['programm_name', 'text'], ['status', 'text'],
  ['frist', 'date'], ['notiz', 'text'], ['erstellt_am', 'timestamp with time zone'], ['aktualisiert_am', 'timestamp with time zone'],
  ['bewilligt_betrag', 'numeric'], ['verwendet_betrag', 'numeric'], ['nachweis_frist', 'date'], ['nachweis_status', 'text'],
  ['finanzplan', 'jsonb'], ['bewilligung_von', 'date'], ['bewilligung_bis', 'date'], ['sachbericht', 'text']];
const DB = SPALTEN.map(([spalte, datentyp]) => ({ tabelle: 'foerder_vorhaben', spalte, datentyp, pflicht: false }));
const ziel = () => katalogFuerZiel('foerdervorhaben', DB).ziel;
function datei(text) {
  const t = leseCsv(text); const z = ziel();
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles('foerdervorhaben', map, t.kopf, t.zeilen, { ziel: z }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 139: Karte auf dem Motor, nur Chef, Eigene Felder wie das Modul', () => {
  const q = importQuellen().find((x) => x.key === 'foerdervorhaben');
  assert.equal(q?.motor, 'foerdervorhaben');
  const z = zielDef('foerdervorhaben');
  assert.equal(z.nurChef, true);
  assert.equal(z.eigeneFelderModul, 'foerdermittel');
  assert.ok(lies('app/dashboard/foerdermittel/page.tsx').includes("const MODUL = 'foerdermittel';"));
  assert.equal(importErlaubt('foerdervorhaben', { chef: false, module: ['foerdermittel'], schreibModule: ['foerdermittel'] }).ok, false);
  assert.equal(importErlaubt('foerdervorhaben', { chef: true, module: [], schreibModule: null }).ok, true);
  assert.ok(!ziel().felder.some((f) => f.key === 'finanzplan'), 'jsonb nicht aus Dateien');
});

test('Programm-Zuordnung: Name, Schluessel, Kuerzel, Traeger-Woerter; unbekannt = null', () => {
  assert.equal(foerderProgrammFinden('Energieberatung im Mittelstand (EBM)')?.key, 'bafa-ebm');
  assert.equal(foerderProgrammFinden('bafa-ebm')?.key, 'bafa-ebm');
  assert.equal(foerderProgrammFinden('EBM')?.key, 'bafa-ebm');
  assert.equal(foerderProgrammFinden('BAFA Energieberatung Mittelstand')?.key, 'bafa-ebm');
  assert.equal(foerderProgrammFinden('go-digital'), null);
  assert.equal(foerderProgrammFinden('BAFA'), null, 'ein Wort allein reicht nie');
  assert.equal(foerderEigenerKey('Innovationsgutschein Musterland'), 'import-innovationsgutschein-musterland');
});

test('Alte Vorlage: alle Spalten erkannt, go-digital als eigenes Vorhaben mit Warnung', () => {
  const r = datei(lies('public/vorlagen/foerdervorhaben-import-vorlage.csv'));
  assert.equal(r.bil.verschluckt, 0);
  assert.ok(!Object.values(r.map).includes(EIGEN));
  assert.equal(r.b.gut, 3);
  assert.equal(r.b.saetze[0].programm_key, 'import-go-digital');
  assert.match(r.b.saetze[2].programm_key, /^import-regionale/);
  assert.ok(r.b.warnungen.some((w) => /go-digital.*nicht im ARGONAUT-Förderkatalog/.test(w.meldung)));
  assert.equal(r.b.saetze[1].programm_key, 'bafa-ebm');
  assert.equal(r.b.saetze[1].bewilligt_betrag, 6000);
  assert.equal(r.b.saetze[1].nachweis_status, 'offen');
});

test('Mustervorlage laeuft rund; Listen mit altem Wert; Warnungen bei Unplausiblem', () => {
  const m = datei(baueMustervorlage('foerdervorhaben').replace(/^﻿/, ''));
  assert.equal(m.bil.verschluckt, 0);
  assert.equal(m.b.gut, 3);
  const r = datei('Förderprogramm;Stand;Bewilligt;Abgerufen;Laufzeit von;Laufzeit bis;Verwendungsnachweis\nEBM;Zuwendungsbescheid;1000;1500;01.06.2026;01.01.2026;abgegeben\nXY;irgendwas;;;;;\n');
  const s = r.b.saetze[0];
  assert.equal(s.status, 'bewilligt');
  assert.equal(s.nachweis_status, 'eingereicht');
  assert.ok(r.b.warnungen.some((w) => w.zeile === 2 && /höher als bewilligt/.test(w.meldung)));
  assert.ok(r.b.warnungen.some((w) => w.zeile === 2 && /endet vor dem Beginn/.test(w.meldung)));
  assert.equal(r.b.saetze[1].status, 'interessiert');
  assert.match(r.b.saetze[1].notiz, /Status im Altsystem: irgendwas/);
});

test('Erkennung ueber den Programm-Schluessel; gleiches Programm zweimal in der Datei nur einmal', () => {
  assert.deepEqual(erkennungsFelder(ziel()), ['programm_key']);
  const r = datei('Programm;Status\nEBM;beantragt\nEnergieberatung im Mittelstand (EBM);bewilligt\n');
  assert.equal(r.b.gut, 1);
  assert.equal(r.b.dubletten_in_datei, 1);
});
