// Paket 144 (28.09.2026) — Shop-Bestellungen NUR als Archiv (GEMEINSAM, freigegeben 27.09.2026):
// Status „abgeschlossen", keine Lagerbuchung, keine Rechnung, keine Mails; Positionen je Bestellnummer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN, erkennungsFelder } from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';
import { importErlaubt } from '../out/importRechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// shop_bestellungen live = 16 Spalten (buendel17 14 + kontakt_id + lager_gebucht)
const SPALTEN = [['id', 'uuid'], ['owner_user_id', 'uuid'], ['quelle', 'text'], ['extern_id', 'text'], ['besteller', 'text'], ['email', 'text'],
  ['status', 'text'], ['brutto_summe', 'numeric'], ['positionen', 'jsonb'], ['bestell_am', 'timestamp with time zone'], ['rechnung_id', 'uuid'],
  ['notiz', 'text'], ['erstellt_am', 'timestamp with time zone'], ['aktualisiert_am', 'timestamp with time zone'], ['kontakt_id', 'uuid'], ['lager_gebucht', 'boolean']];
const DB = SPALTEN.map(([spalte, datentyp]) => ({ tabelle: 'shop_bestellungen', spalte, datentyp, pflicht: false }));
const ziel = () => katalogFuerZiel('shop', DB).ziel;
function datei(text) {
  const t = leseCsv(text); const z = ziel();
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles('shop', map, t.kopf, t.zeilen, { ziel: z }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 144: Karte auf dem Motor, nur Chef, Status/Lager/Rechnung nie aus der Datei', () => {
  assert.equal(SPALTEN.length, 16);
  assert.equal(importQuellen().find((x) => x.key === 'shop')?.motor, 'shop');
  const z = zielDef('shop');
  assert.equal(z.nurChef, true);
  assert.equal(z.eigeneFelderModul, 'shop_bestellungen');
  assert.ok(lies('app/dashboard/shop/page.tsx').includes("const MODUL = 'shop_bestellungen';"));
  assert.equal(importErlaubt('shop', { chef: false, module: ['shop'], schreibModule: ['shop'] }).ok, false);
  const keys = ziel().felder.map((f) => f.key);
  for (const k of ['status', 'positionen', 'rechnung_id', 'lager_gebucht']) assert.ok(!keys.includes(k), k);
  for (const k of ['pos_bezeichnung', 'pos_menge', 'pos_einzelpreis']) assert.ok(keys.includes(k), k + ' ohne Kind-Tabelle angeboten');
  assert.deepEqual(katalogFuerZiel('shop', DB).zusatz.map((f) => f.key), []);
});

test('Mehrere Zeilen einer Bestellnummer = EINE Bestellung mit Positionen; immer abgeschlossen', () => {
  const r = datei('Name;Created at;Billing Name;Email;Total;Lineitem name;Lineitem quantity;Lineitem price;Financial Status\n#1001;03.03.2026;Anna Beispiel;anna@example.de;59,80;Duftkerze;2;19,90;paid\n#1001;;;;;Geschenkbox;1;20,00;\n#1002;15.04.2026;Bernd;b@example.de;12,50;Postkarte;5;2,50;refunded\n');
  assert.equal(r.b.gut, 2);
  assert.equal(r.b.schlecht, 0, 'Positionszeilen sind nicht schlecht');
  assert.equal(r.b.zusammengefasst, 1);
  assert.equal(r.b.dubletten_in_datei, 0);
  const [a, b] = r.b.saetze;
  assert.equal(a.status, 'abgeschlossen'); assert.equal(b.status, 'abgeschlossen');
  assert.deepEqual(a.positionen, [{ bezeichnung: 'Duftkerze', menge: 2, einzelpreis: 19.9 }, { bezeichnung: 'Geschenkbox', menge: 1, einzelpreis: 20 }]);
  assert.equal(a.brutto_summe, 59.8);
  assert.equal(a.besteller, 'Anna Beispiel');
  assert.match(a.notiz, /Status im Altsystem: paid/);
  assert.match(b.notiz, /Status im Altsystem: refunded/);
  for (const s of r.b.saetze) for (const k of ['pos_bezeichnung', 'pos_menge', 'pos_einzelpreis', 'status_alt', 'lager_gebucht', 'rechnung_id']) assert.ok(!(k in s), k);
  assert.ok(r.b.hinweise.some((h) => /1 Zeilen waren weitere Positionen/.test(h)));
  assert.equal(r.bil.verschluckt, 0);
});

test('Ohne Gesamtsumme: aus Positionen gerechnet + Warnung; abweichende Summe in Folgezeile warnt', () => {
  const r = datei('Bestellnummer;Artikel;Menge;Einzelpreis;Gesamt\nA-1;X;2;10;\nA-1;Y;1;5;\nA-2;Z;1;3;3\nA-2;W;1;4;9\n');
  assert.equal(r.b.saetze[0].brutto_summe, 25);
  assert.ok(r.b.warnungen.some((w) => /aus den Positionen gerechnet/.test(w.meldung)));
  assert.equal(r.b.saetze[1].brutto_summe, 3);
  assert.ok(r.b.warnungen.some((w) => w.zeile === 5 && /Andere Gesamtsumme/.test(w.meldung)));
});

test('Folgezeile fuellt leere Kopffelder; Position ohne Menge = 1 Stueck', () => {
  const r = datei('Bestellnummer;Kunde;E-Mail;Artikel;Einzelpreis\nC-1;Clara;;Tasse;8\nC-1;;clara@example.de;Teller;6\n');
  const s = r.b.saetze[0];
  assert.equal(s.email, 'clara@example.de');
  assert.equal(s.besteller, 'Clara');
  assert.deepEqual(s.positionen.map((p) => p.menge), [1, 1]);
  assert.equal(s.brutto_summe, 14);
});

test('Erkennung Shop-System + Bestellnummer; ohne Bestellnummer faellt die Zeile heraus', () => {
  assert.deepEqual(erkennungsFelder(ziel()), ['quelle+extern_id']);
  const r = datei('Bestellnummer;Kunde;Gesamt\n;Anna;10\nB-1;Bernd;20\n');
  assert.equal(r.b.gut, 1);
  assert.equal(r.b.saetze[0].quelle, 'import');
  assert.ok(r.b.fehler.some((f) => f.zeile === 2 && /Pflichtfeld/.test(f.meldung)));
});

test('Shop-Seite: Archiv getrennt, ohne Rechnung/Lager/Status; Retouren ohne Archiv', () => {
  const s = lies('app/dashboard/shop/page.tsx');
  assert.ok(s.includes("const ARCHIV = 'abgeschlossen';"));
  assert.ok(s.includes(".neq('status', ARCHIV)"));
  assert.ok(s.includes("{b.status === ARCHIV ? ("));
  assert.ok(lies('app/dashboard/shop/retouren/page.tsx').includes(".neq('status', 'abgeschlossen')"));
});

test('Andere Ziele unveraendert: Bestellungen (ERP) behalten ihre Positionen fuer die Kind-Tabelle', () => {
  const z = zielDef('bestellungen');
  assert.equal(z.jsonPositionen, undefined);
  const r = pruefeAlles('bestellungen', { Bestellnummer: 'bestellnummer', Artikel: 'pos_bezeichnung' }, ['Bestellnummer', 'Artikel'], [['B1', 'X'], ['B1', 'Y']]);
  assert.equal(r.zusammengefasst, undefined);
});

test('Mustervorlage laeuft rund: 3 Zeilen -> 2 Bestellungen', () => {
  const m = datei(baueMustervorlage('shop').replace(/^﻿/, ''));
  assert.equal(m.bil.verschluckt, 0);
  assert.ok(!Object.values(m.map).includes(EIGEN));
  assert.equal(m.b.gut, 2);
  assert.equal(m.b.saetze[0].positionen.length, 2);
  assert.equal(m.b.saetze[1].positionen[0].menge, 5);
});
