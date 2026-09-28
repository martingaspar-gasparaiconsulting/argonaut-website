// Paket 146 (28.09.2026) — Angebote NUR als Archiv (GEMEINSAM, freigegeben 28.09.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN, erkennungsFelder, kindZeilen, fuerDatenbank } from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';
import { importErlaubt } from '../out/importRechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// angebote live 23 Spalten (buendel14 19 + rabatt_prozent, rabatt_betrag, genehmigung_noetig, genehmigt) + standort_id (SQL p146)
const KOPF = [['id', 'uuid'], ['owner_user_id', 'uuid'], ['kontakt_id', 'uuid'], ['angebotsnummer', 'text'], ['titel', 'text'], ['kunde_name', 'text'],
  ['kunde_email', 'text'], ['status', 'text'], ['gueltig_bis', 'date'], ['netto_summe', 'numeric'], ['mwst_summe', 'numeric'], ['brutto_summe', 'numeric'],
  ['token', 'uuid'], ['angenommen_am', 'timestamp with time zone'], ['abgelehnt_am', 'timestamp with time zone'], ['rechnung_id', 'uuid'], ['notiz', 'text'],
  ['erstellt_am', 'timestamp with time zone'], ['aktualisiert_am', 'timestamp with time zone'], ['rabatt_prozent', 'numeric'], ['rabatt_betrag', 'numeric'],
  ['genehmigung_noetig', 'boolean'], ['genehmigt', 'boolean'], ['standort_id', 'uuid']];
const POS = [['id', 'uuid'], ['owner_user_id', 'uuid'], ['angebot_id', 'uuid'], ['position', 'integer'], ['bezeichnung', 'text'], ['menge', 'numeric'],
  ['einheit', 'text'], ['einzelpreis', 'numeric'], ['mwst_satz', 'numeric'], ['gesamt_netto', 'numeric']];
const DB = [...KOPF.map(([spalte, datentyp]) => ({ tabelle: 'angebote', spalte, datentyp, pflicht: false })),
  ...POS.map(([spalte, datentyp]) => ({ tabelle: 'angebot_positionen', spalte, datentyp, pflicht: false }))];
const ziel = () => katalogFuerZiel('angebote', DB).ziel;
function datei(text) {
  const t = leseCsv(text); const z = ziel();
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles('angebote', map, t.kopf, t.zeilen, { ziel: z }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 146: Karte auf dem Motor, Rechte ueber den Bereich, nie ueberschreiben, gesperrte Spalten', () => {
  assert.equal(importQuellen().find((x) => x.key === 'angebote')?.motor, 'angebote');
  const z = zielDef('angebote');
  assert.equal(z.nurNeu, true);
  assert.equal(z.jsonPositionen.kindTabelle.tabelle, 'angebot_positionen');
  assert.equal(importErlaubt('angebote', { chef: false, module: ['angebote'], schreibModule: ['angebote'] }).ok, true);
  const keys = ziel().felder.map((f) => f.key);
  for (const k of ['status', 'token', 'rechnung_id', 'angenommen_am', 'abgelehnt_am', 'genehmigung_noetig', 'genehmigt', 'standort_id']) assert.ok(!keys.includes(k), k);
  for (const k of ['pos_bezeichnung', 'pos_menge', 'pos_einheit', 'pos_einzelpreis', 'pos_mwst']) assert.ok(keys.includes(k), k);
  assert.deepEqual(katalogFuerZiel('angebote', DB).zusatz.map((f) => f.key), []);
  // ohne Kind-Tabelle im Katalog keine Positionsfelder
  const ohne = katalogFuerZiel('angebote', DB.filter((c) => c.tabelle === 'angebote')).ziel;
  assert.ok(!ohne.felder.some((f) => f.key === 'pos_bezeichnung'));
});

test('Zeilen gleicher Nummer = ein Angebot mit Positionen; IMMER archiv; alter Status + Datum in der Notiz', () => {
  const r = datei('Angebotsnummer;Datum;Kunde;Status;Netto;MwSt;Brutto;Leistung;Menge;Einheit;EP\nAN-17;01.10.2025;Muster Bau GmbH;angenommen;1850;351,50;2201,50;Unterverteilung;1;Stk;1450\nAN-17;;;;;;;LS-Schalter B16;10;Stk;40\nAN-18;05.10.2025;Anna;offen;100;;;Prüfung;1;Psch;100\n');
  assert.equal(r.b.gut, 2);
  assert.equal(r.b.zusammengefasst, 1);
  const [a, b] = r.b.saetze;
  assert.equal(a.status, 'archiv'); assert.equal(b.status, 'archiv');
  assert.match(a.notiz, /Status im Altsystem: angenommen/);
  assert.match(a.notiz, /Angebotsdatum: 01\.10\.2025/);
  assert.equal(a.__positionen.length, 2);
  assert.deepEqual(a.__positionen[1], { bezeichnung: 'LS-Schalter B16', menge: 10, einheit: 'Stk', einzelpreis: 40 });
  assert.ok(!('__positionen' in fuerDatenbank(a)), 'Positionen nie in die Kopf-Tabelle');
  assert.equal(b.mwst_summe, 19); assert.equal(b.brutto_summe, 119);
  assert.ok(r.b.warnungen.some((w) => w.zeile === 4 && /Nur Netto/.test(w.meldung)));
  assert.equal(r.bil.verschluckt, 0);
  for (const k of ['token', 'rechnung_id', 'angenommen_am']) assert.ok(!(k in a), k);
});

test('kindZeilen: Position laufend, Betrieb als Besitzer, gesamt_netto auf Cent, nur bekannte Felder', () => {
  const z = kindZeilen([{ bezeichnung: 'A', menge: 3, einzelpreis: 0.335, fremd: 'x' }, { bezeichnung: 'B', einzelpreis: 10 }, null], 'k1', 'angebot_id', 'betrieb');
  assert.equal(z.length, 2);
  assert.deepEqual(z[0], { owner_user_id: 'betrieb', angebot_id: 'k1', position: 1, bezeichnung: 'A', menge: 3, einzelpreis: 0.335, gesamt_netto: 1.01 });
  assert.equal(z[1].menge, 1); assert.equal(z[1].gesamt_netto, 10);
  assert.deepEqual(kindZeilen(undefined, 'k', 'angebot_id', 'b'), []);
});

test('Summen: aus Brutto zurueckgerechnet, Widerspruch gemeldet, ohne Summen aus Positionen', () => {
  const r = datei('Angebotsnummer;Brutto\nX-1;119\n');
  assert.equal(r.b.saetze[0].netto_summe, 100); assert.equal(r.b.saetze[0].mwst_summe, 19);
  const w = datei('Angebotsnummer;Netto;MwSt;Brutto\nX-2;100;19;150\n');
  assert.ok(w.b.warnungen.some((x) => /ergibt nicht Brutto/.test(x.meldung)));
  const p = datei('Angebotsnummer;Leistung;Menge;EP\nX-3;A;2;50\nX-3;B;1;20\n');
  assert.equal(p.b.saetze[0].netto_summe, 120);
  assert.equal(p.b.saetze[0].brutto_summe, 142.8);
});

test('Erkennung ueber die Angebotsnummer; Nummernkreis bleibt unberuehrt (alte Nummer wird uebernommen)', () => {
  assert.deepEqual(erkennungsFelder(ziel()), ['angebotsnummer']);
  const r = datei('Angebotsnummer;Titel\nAN-2025-0117;Alt\n');
  assert.equal(r.b.saetze[0].angebotsnummer, 'AN-2025-0117');
});

test('Seiten: Archiv ohne Link/Unterschrift/Rechnung, getrennte Liste; Rechnung aus Archiv-Shop gesperrt; Rechnung aus Angebot nur „angenommen"', () => {
  const a = lies('app/dashboard/angebote/page.tsx');
  assert.ok(a.includes("const ARCHIV = 'archiv';"));
  assert.ok(a.includes("{a.status !== ARCHIV && <button style={styles.mini} onClick={() => kopieren(a)}>"));
  assert.ok(a.includes("q.eq('status', ARCHIV) : q.neq('status', ARCHIV)"));
  assert.ok(lies('app/api/rechnung-aus-angebot/route.ts').includes('if (ang.status !== "angenommen")'));
  assert.ok(lies('app/api/oeffentlich/angebot/route.ts').includes(".in('status', ['entwurf', 'gesendet'])"));
  assert.ok(lies('app/api/rechnung-aus-shop/route.ts').includes('if (b.status === "abgeschlossen")'));
  const i = lies('app/dashboard/import/page.tsx');
  assert.ok(i.includes('kindZeilen(neuPos[p.von + j]'));
  assert.ok(i.includes("await supabase.from(ziel.tabelle).delete().in('id', ids0)"));
  assert.ok(lies('supabase-sql/p146-angebote-standort.sql').includes('add column if not exists standort_id'));
});

test('Mustervorlage laeuft rund: 3 Zeilen -> 2 Angebote', () => {
  const m = datei(baueMustervorlage('angebote').replace(/^﻿/, ''));
  assert.equal(m.bil.verschluckt, 0);
  assert.ok(!Object.values(m.map).includes(EIGEN));
  assert.equal(m.b.gut, 2);
  assert.equal(m.b.saetze[0].__positionen.length, 2);
  assert.equal(m.b.saetze[1].__positionen[0].einheit, 'Psch');
  assert.equal(m.b.saetze[0].brutto_summe, 2201.5);
});
