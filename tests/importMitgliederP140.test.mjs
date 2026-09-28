// Paket 140 (28.09.2026) — Mitglieder & Abos (GEMEINSAM, freigegeben 27.09.2026):
// Name, Beitrag, Intervall, Status, Vertragsdaten — Bankverbindung und SEPA-Mandat NIE.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, sperrGrund, EIGEN, erkennungsFelder } from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage, fehlendePflichtfelder, GELDFELDER } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';
import { importErlaubt } from '../out/importRechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// Spalten von mitglieder live (buendel8 + PS5 + erst_einzug) = 27, wie die p138-Kontrolle zeigte
const SPALTEN = [['id', 'uuid'], ['owner_user_id', 'uuid'], ['name', 'text', true], ['email', 'text'], ['telefon', 'text'],
  ['betrag', 'numeric'], ['intervall', 'text'], ['status', 'text'], ['beginn_am', 'date'], ['kuendigung_zum', 'date'],
  ['iban', 'text'], ['bic', 'text'], ['mandatsreferenz', 'text'], ['mandat_datum', 'date'], ['letzte_einziehung', 'date'],
  ['notiz', 'text'], ['erstellt_am', 'timestamp with time zone'], ['erst_einzug', 'boolean'],
  ['vertragsart', 'text'], ['mitglieds_nr', 'text'], ['abgeschlossen_am', 'date'], ['erstlaufzeit_monate', 'integer'],
  ['kuendigungsfrist_monate', 'numeric'], ['verlaengerung_monate', 'integer'], ['satzung_frist_monate', 'numeric'],
  ['satzung_zum', 'text'], ['kuendigung_eingang', 'date']];
const DB = SPALTEN.map(([spalte, datentyp, pflicht]) => ({ tabelle: 'mitglieder', spalte, datentyp, pflicht: !!pflicht }));
const ziel = () => katalogFuerZiel('mitglieder', DB).ziel;
function datei(text) {
  const t = leseCsv(text); const z = ziel();
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles('mitglieder', map, t.kopf, t.zeilen, { ziel: z }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 140: 27 Spalten, alle bekannt; Karte auf dem Motor; nur Chef; Eigene Felder wie das Modul', () => {
  assert.equal(SPALTEN.length, 27);
  const q = importQuellen().find((x) => x.key === 'mitglieder');
  assert.equal(q?.motor, 'mitglieder');
  assert.equal(q?.zielHref, '/dashboard/mitglieder');
  const z = zielDef('mitglieder');
  assert.equal(z.nurChef, true);
  assert.equal(z.eigeneFelderModul, 'mitglieder');
  assert.ok(lies('app/dashboard/mitglieder/page.tsx').includes("const MODUL = 'mitglieder';"));
  assert.equal(importErlaubt('mitglieder', { chef: false, module: ['mitglieder'], schreibModule: ['mitglieder'] }).ok, false);
  assert.equal(importErlaubt('mitglieder', { chef: true, module: [], schreibModule: null }).ok, true);
  // Kein Datenbankfeld bleibt „unbekannt" als Zusatz uebrig
  assert.deepEqual(katalogFuerZiel('mitglieder', DB).zusatz.map((f) => f.key), []);
});

test('Bank- und Mandatsfelder werden NIE angeboten — auch nicht exakt benannt', () => {
  const keys = ziel().felder.map((f) => f.key);
  for (const k of ['iban', 'bic', 'mandatsreferenz', 'mandat_datum', 'letzte_einziehung', 'erst_einzug']) {
    assert.ok(!keys.includes(k), k + ' darf kein Feld sein');
  }
});

test('Bankspalten gesperrt mit Hinweis „SEPA-Mandat neu erfassen"; verschluckt = 0', () => {
  const r = datei('Name;IBAN;BIC;Mandatsreferenz;Mandat-Datum;Letzte Einziehung;Erstlastschrift;Kontoinhaber\nAnna Beispiel;DE02120300000000202051;BYLADEM1001;MR-1;01.01.2024;01.09.2026;nein;Anna Beispiel\n');
  assert.equal(r.b.gut, 1);
  assert.deepEqual(Object.keys(r.b.saetze[0]).filter((k) => !k.startsWith('__')).sort(), ['intervall', 'name', 'status', 'vertragsart']);
  for (const sp of ['IBAN', 'BIC', 'Mandatsreferenz', 'Mandat-Datum', 'Letzte Einziehung', 'Erstlastschrift', 'Kontoinhaber']) {
    assert.match(sperrGrund(sp, r.z) ?? '', /SEPA-Mandat in ARGONAUT neu erfassen/, sp);
    assert.ok(!r.map[sp] || r.map[sp] === '', sp + ' nicht zugeordnet');
  }
  assert.equal(r.bil.verschluckt, 0);
  assert.equal(r.bil.nicht, 7);
  assert.ok(r.bil.eintraege.filter((e) => e.art === 'nicht').every((e) => /SEPA-Mandat/.test(e.grund)));
  // andere Ziele behalten den allgemeinen Grund
  assert.doesNotMatch(sperrGrund('IBAN', zielDef('kontakte')) ?? '', /SEPA-Mandat/);
});

test('Vorname + Nachname ergeben den Pflicht-Namen; ganz ohne Namen faellt die Zeile heraus', () => {
  const r = datei('Mitgliedsnummer;Vorname;Nachname;Beitrag\nM-1;Anna;Beispiel;39,90\nM-2;;;10\n');
  assert.deepEqual(fehlendePflichtfelder(r.map, 'mitglieder', r.z), []);
  assert.equal(r.b.gut, 1);
  assert.equal(r.b.saetze[0].name, 'Anna Beispiel');
  assert.equal(r.b.saetze[0].betrag, 39.9);
  assert.ok(!('lead_vorname' in r.b.saetze[0]));
  assert.ok(r.b.fehler.some((f) => f.zeile === 3 && /Pflichtfeld ist leer/.test(f.meldung)));
  // Ohne Name UND ohne Vor-/Nachname fehlt das Pflichtfeld schon beim Zuordnen
  const o = datei('Mitgliedsnummer;Beitrag\nM-1;10\n');
  assert.deepEqual(fehlendePflichtfelder(o.map, 'mitglieder', o.z).map((f) => f.key), ['name']);
});

test('Listen: Intervall, Status, Vertragsart, Satzung — alter Wert in der Notiz', () => {
  const r = datei('Name;Zahlweise;Status;Mitgliedsart;Austritt zum;Kündigung zum\nA;monatlich;ruhend;Mitgliedschaft;Ende des Geschäftsjahres;\nB;jährlich;ausgetreten;Abo;;\nC;alle 2 Jahre;Probe;xyz;;\n');
  const [a, b, c] = r.b.saetze;
  assert.equal(a.intervall, 'monat'); assert.equal(a.status, 'pausiert'); assert.equal(a.vertragsart, 'verein'); assert.equal(a.satzung_zum, 'jahresende');
  assert.equal(b.intervall, 'jahr'); assert.equal(b.status, 'gekuendigt'); assert.equal(b.vertragsart, 'studio');
  assert.ok(r.b.warnungen.some((w) => w.zeile === 3 && /Austrittsdatum nachtragen/.test(w.meldung)));
  assert.equal(c.intervall, 'monat'); assert.equal(c.status, 'aktiv'); assert.equal(c.vertragsart, 'studio');
  assert.match(c.notiz, /Intervall im Altsystem: alle 2 Jahre/);
  assert.match(c.notiz, /Status im Altsystem: Probe/);
  assert.match(c.notiz, /Vertragsart im Altsystem: xyz/);
  assert.ok(!('satzung_zum' in c), 'ohne Angabe kein Satzungstermin');
});

test('Halbjaehrlich -> jaehrlich x 2, woechentlich -> monatlich x 52/12, mit Notiz und Warnung', () => {
  const r = datei('Name;Beitrag;Intervall\nA;60,00;halbjährlich\nB;10,00;wöchentlich\nC;;halbjährlich\n');
  const [a, b, c] = r.b.saetze;
  assert.equal(a.intervall, 'jahr'); assert.equal(a.betrag, 120);
  assert.match(a.notiz, /Intervall im Altsystem: halbjährlich \(60,00 €\) — in ARGONAUT jährlich 120,00 €/);
  assert.equal(b.intervall, 'monat'); assert.equal(b.betrag, 43.33);
  assert.equal(c.intervall, 'jahr'); assert.ok(!('betrag' in c) || c.betrag == null);
  assert.equal(r.b.warnungen.filter((w) => w.feld === 'Intervall').length, 3);
});

test('Beitrag ist ein Geldfeld: unlesbar -> Zeile NICHT uebernommen (nie still 0 €)', () => {
  assert.ok(GELDFELDER.includes('betrag'));
  const r = datei('Name;Beitrag\nA;zwanzig Euro\nB;20\n');
  assert.equal(r.b.gut, 1);
  assert.ok(r.b.fehler.some((f) => f.zeile === 2 && /kein lesbarer Betrag/.test(f.meldung)));
});

test('Erkennung: Mitgliedsnummer, sonst Name + E-Mail (Familien mit einer E-Mail bleiben getrennt)', () => {
  assert.deepEqual(erkennungsFelder(ziel()), ['mitglieds_nr', 'name+email']);
  const r = datei('Name;E-Mail\nAnna Beispiel;familie@example.de\nBen Beispiel;familie@example.de\nAnna Beispiel;familie@example.de\n');
  assert.equal(r.b.gut, 2);
  assert.equal(r.b.dubletten_in_datei, 1);
});

test('Plausibilitaet: Kuendigung vor Beginn, negativer Beitrag -> Warnung', () => {
  const r = datei('Name;Beitrag;Beginn;Kündigung zum\nA;-5;01.06.2026;31.12.2025\n');
  assert.ok(r.b.warnungen.some((w) => /Negativer Beitrag/.test(w.meldung)));
  assert.ok(r.b.warnungen.some((w) => /vor dem Beginn/.test(w.meldung)));
});

test('Mustervorlage laeuft rund: alle Spalten erkannt, nichts als Eigenes Feld, 3 Mitglieder', () => {
  const m = datei(baueMustervorlage('mitglieder').replace(/^﻿/, ''));
  assert.equal(m.bil.verschluckt, 0);
  assert.ok(!Object.values(m.map).includes(EIGEN));
  assert.equal(m.b.gut, 3);
  assert.equal(m.b.saetze[1].intervall, 'jahr');
  assert.equal(m.b.saetze[1].vertragsart, 'verein');
  assert.equal(m.b.saetze[2].status, 'gekuendigt');
  assert.equal(m.b.saetze[2].kuendigung_zum, '2026-10-31');
  assert.equal(m.b.saetze[0].erstlaufzeit_monate, 12);
});
