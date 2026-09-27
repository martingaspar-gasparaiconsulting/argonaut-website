// Paket 129 (27.09.2026) — Karten mit uebergeordnetem Eintrag: Rezepturen
// (Zutaten je Rezept), Zuschnitt-Teile (je Projekt), Tour-Stopps (je Tour).
// Fehlende Rezepte/Projekte/Touren legt der Import an — mit den Werten der
// ersten Zeile (Typ, Datum …) und festen Grundwerten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  katalogFuerZiel, vorschlagMapping, spaltenBilanz, erkennungsFelder, erkennungsSpalten, MOTOR_TABELLEN, EIGEN,
  nachschlagIndex, fehlendeNamen, loeseNachschlag, elternZeilen, positionenJeEintrag, heuteBerlin, baueBestandIndex, findeImBestand,
} from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));

const NEU = ['rezeptur', 'zuschnitt', 'tour_stopps'];
const VORLAGE = { rezeptur: 'rezeptur-import-vorlage.csv', zuschnitt: 'zuschnitt-teile-import-vorlage.csv', tour_stopps: 'tour-stopps-import-vorlage.csv' };
const ELTERN = {
  rezepturen: ['id', 'owner_user_id', 'name', 'typ', 'basis_menge', 'basis_einheit'],
  zuschnitt_projekt: ['id', 'owner_user_id', 'bezeichnung', 'material', 'stangenlaenge', 'saegeblatt_mm', 'status'],
  tour: ['id', 'owner_user_id', 'bezeichnung', 'datum', 'fahrer', 'fahrzeug', 'status'],
};

function dbFuer(z) {
  const typ = (f) => (f.typ === 'zahl' ? 'numeric' : f.typ === 'datum' ? 'date' : 'text');
  const cols = [{ tabelle: z.tabelle, spalte: 'id', datentyp: 'uuid' }, { tabelle: z.tabelle, spalte: 'owner_user_id', datentyp: 'uuid' }];
  for (const f of z.felder) if (!f.virtuell) cols.push({ tabelle: z.tabelle, spalte: f.key, datentyp: typ(f) });
  cols.push({ tabelle: z.tabelle, spalte: z.nachschlag.spalte, datentyp: 'uuid' });
  for (const c of ELTERN[z.nachschlag.tabelle]) cols.push({ tabelle: z.nachschlag.tabelle, spalte: c, datentyp: 'text' });
  return cols.map((c) => ({ pflicht: false, ...c }));
}
const ziel = (k) => katalogFuerZiel(k, dbFuer(zielDef(k))).ziel;
function datei(text, k) {
  const t = leseCsv(text);
  const z = ziel(k);
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  const b = pruefeAlles(k, map, t.kopf, t.zeilen, { ziel: z, heute: HEUTE });
  return { t, z, map, b, bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 129: drei Ziele, Karten zeigen auf den Motor, SQL-Whitelist = Motor-Tabellen (41)', () => {
  for (const k of NEU) {
    assert.equal(zielDef(k).nurMitKatalog, true);
    assert.equal(importQuellen().find((q) => q.key === k)?.motor, k, k);
    assert.ok(MOTOR_TABELLEN.includes(zielDef(k).tabelle));
    assert.ok(MOTOR_TABELLEN.includes(zielDef(k).nachschlag.tabelle));
  }
  const sql = lies('supabase-sql/p129-import-karten2.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].sort());
  assert.equal(whitelist.length, 41);
  assert.match(sql, /revoke all on function public\.import_feldkatalog\(text\[\]\) from anon/);
  assert.doesNotMatch(sql, /\b(drop table|delete from|truncate|drop policy|update public)\b/i);
});

test('Alte Vorlagen und neue Mustervorlagen werden vollstaendig erkannt', () => {
  for (const k of NEU) {
    for (const text of [lies(`public/vorlagen/${VORLAGE[k]}`), baueMustervorlage(k)]) {
      const { t, map, bil } = datei(text, k);
      assert.equal(bil.verschluckt, 0, k);
      const offen = t.kopf.filter((s) => !map[s] || map[s] === EIGEN);
      assert.deepEqual(offen, [], `${k}: ${offen.join(', ')}`);
    }
  }
});

test('Rezeptur: Zeilen je Rezept, Typ an das Rezept, Rolle uebersetzt, Position je Rezept', () => {
  const { b, z } = datei('Rezept;Typ;Zutat;Menge;Einheit;Preis;Rolle\r\n'
    + 'Bauernbrot;Brot;Weizenmehl 550;10;kg;0,80;Mehl\r\n'
    + 'Bauernbrot;Brot;Wasser;6,5;l;0;Schüttung\r\n'
    + 'Leberwurst;Wurst;Schweineleber;3;kg;4,20;\r\n'
    + 'Bauernbrot;;Salz;0,2;kg;0,50;\r\n', 'rezeptur');
  assert.equal(b.gut, 4);
  const [m, w, l, sa] = b.saetze;
  assert.equal(m.__nach, 'Bauernbrot');
  assert.deepEqual(m.__nachMit, { typ: 'teig' });
  assert.equal(m.rolle, 'mehl');
  assert.equal(w.rolle, 'wasser');
  assert.equal(w.menge, 6.5);
  assert.deepEqual(l.__nachMit, { typ: 'wurst' });
  assert.equal(l.rolle, 'sonstige');
  assert.equal(sa.__nachMit, undefined);
  assert.equal(m.rezept, undefined);
  assert.equal(m.rezept_typ, undefined);
  assert.deepEqual(positionenJeEintrag(b.saetze, 'position'), [1, 2, 1, 3]);
  // fehlende Rezepte: je Name einmal, Typ aus der ersten Zeile, feste Grundwerte
  const zeilen = elternZeilen(fehlendeNamen(b.saetze, new Map()), b.saetze, z.nachschlag, 'chef', '2026-09-27');
  assert.deepEqual(zeilen, [
    { basis_einheit: 'kg', typ: 'teig', owner_user_id: 'chef', name: 'Bauernbrot' },
    { basis_einheit: 'kg', typ: 'wurst', owner_user_id: 'chef', name: 'Leberwurst' },
  ]);
  // Bestand: rezeptur_id + Zutat
  assert.deepEqual(erkennungsFelder(z), ['rezeptur_id+bezeichnung']);
  assert.deepEqual(erkennungsSpalten(erkennungsFelder(z)), ['rezeptur_id', 'bezeichnung']);
  const idx = nachschlagIndex([{ id: 'r1', name: 'Bauernbrot' }], 'name');
  const r = loeseNachschlag(m, z.nachschlag, idx, true);
  assert.equal(r.satz.rezeptur_id, 'r1');
  assert.equal(r.satz.__nachMit, undefined);
  const bestand = baueBestandIndex([{ id: 'z9', rezeptur_id: 'r1', bezeichnung: 'Weizenmehl 550' }], erkennungsFelder(z));
  assert.equal(findeImBestand(r.satz, erkennungsFelder(z), bestand), 'z9');
});

test('Rezeptur: gleiche Zutat zweimal im selben Rezept nur einmal, im anderen Rezept erlaubt', () => {
  const { b } = datei('Rezept;Zutat;Menge\r\nA;Salz;1\r\nA;Salz;2\r\nB;Salz;1\r\n', 'rezeptur');
  assert.equal(b.gut, 2);
  assert.equal(b.dubletten_in_datei, 1);
});

test('Zuschnitt: ohne Projekt-Spalte ein Projekt „Übernommen aus dem Altsystem", Stangenlaenge fest 6000', () => {
  const { b, z } = datei(lies('public/vorlagen/zuschnitt-teile-import-vorlage.csv'), 'zuschnitt');
  assert.ok(b.gut >= 1);
  assert.ok(b.saetze.every((s) => s.__nach === 'Übernommen aus dem Altsystem'));
  const [p] = elternZeilen(fehlendeNamen(b.saetze, new Map()), b.saetze, z.nachschlag, 'chef', '2026-09-27');
  assert.deepEqual(p, { stangenlaenge: 6000, status: 'offen', owner_user_id: 'chef', bezeichnung: 'Übernommen aus dem Altsystem' });
  const mit = datei('Projekt;Material;Stangenlänge;Teil;Länge;Anzahl\r\nCarport;Alu 40x40;6500;Pfosten;2.400;4\r\nCarport;;;Riegel;1.180;8\r\n', 'zuschnitt').b;
  assert.deepEqual(mit.saetze[0].__nachMit, { material: 'Alu 40x40', stangenlaenge: 6500 });
  assert.equal(mit.saetze[0].laenge, 2400);
  const [p2] = elternZeilen(['Carport'], mit.saetze, z.nachschlag, 'chef');
  assert.equal(p2.stangenlaenge, 6500);   // Datei schlaegt den Grundwert
  assert.equal(p2.material, 'Alu 40x40');
  assert.equal(datei('Teil;Anzahl\r\nX;2\r\n', 'zuschnitt').b.gut, 0);   // Laenge ist Pflicht
});

test('Tour-Stopps: Tour von heute (deutsche Zeit), Reihenfolge aus der Datei oder laufend, Status', () => {
  const { z } = datei('a\r\n', 'tour_stopps');
  const { b } = datei(lies('public/vorlagen/tour-stopps-import-vorlage.csv'), 'tour_stopps');
  const [t] = elternZeilen(fehlendeNamen(b.saetze, new Map()), b.saetze, z.nachschlag, 'chef', '2026-09-27');
  assert.deepEqual(t, { status: 'geplant', datum: '2026-09-27', owner_user_id: 'chef', bezeichnung: 'Übernommen aus dem Altsystem' });
  assert.ok(b.saetze.every((s) => typeof s.reihenfolge === 'number'));
  assert.ok(positionenJeEintrag(b.saetze, 'reihenfolge').every((n) => n === null));   // Datei hat Nummern
  const zwei = datei('Tour;Datum;Fahrer;Empfänger;Adresse;Status\r\nNord;01.10.2026;Rudi;Bäckerei A;Weg 1;geliefert\r\nNord;;;Metzgerei B;Weg 2;\r\nSüd;02.10.2026;;Kiosk C;Weg 3;abwesend\r\n', 'tour_stopps').b;
  assert.deepEqual(zwei.saetze[0].__nachMit, { datum: '2026-10-01', fahrer: 'Rudi' });
  assert.deepEqual(positionenJeEintrag(zwei.saetze, 'reihenfolge'), [1, 2, 1]);
  assert.deepEqual(zwei.saetze.map((s) => s.status), ['zugestellt', 'offen', 'nicht_angetroffen']);
  assert.equal(zwei.saetze[1].kolli, 1);
  const zeilen = elternZeilen(['Nord', 'Süd'], zwei.saetze, z.nachschlag, 'chef', '2026-09-27');
  assert.equal(zeilen[0].datum, '2026-10-01');
  assert.equal(zeilen[1].datum, '2026-10-02');
  assert.equal(zeilen[1].status, 'geplant');
  // heuteBerlin: 27.09. 23:30 UTC ist in Berlin schon der 28.
  assert.equal(heuteBerlin(new Date(Date.UTC(2026, 8, 27, 23, 30))), '2026-09-28');
});

test('Ohne Eltern-Tabelle im Katalog: Werte fuer das Rezept werden nicht angeboten', () => {
  const ohne = katalogFuerZiel('rezeptur', dbFuer(zielDef('rezeptur')).filter((c) => c.tabelle !== 'rezepturen'));
  assert.ok(!ohne.ziel.felder.some((f) => f.key === 'rezept_typ'));
  assert.ok(ohne.ziel.felder.some((f) => f.key === 'rezept'));
});

test('Seite: Eltern mit Werten anlegen, laufende Nummer nur wo die Datei keine hat', () => {
  const s = lies('app/dashboard/import/page.tsx');
  assert.match(s, /\.insert\(elternZeilen\(fehlen\.slice\(i, i \+ 200\), bericht\.saetze, nach, neuOwner\)\)/);
  assert.match(s, /positionenJeEintrag\(bericht\.saetze, nach\.positionSpalte\)/);
  assert.match(s, /satz0\[nach\.positionSpalte\] == null/);
});
