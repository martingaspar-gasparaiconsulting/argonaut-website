// Paket 135 (27.09.2026) — Nutzungsrechte auf dem Import-Motor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, MOTOR_TABELLEN, EIGEN, erkennungsFelder } from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage, leseMedien, NUTZUNG_MEDIEN } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));

function dbFuer(z) {
  const typ = (f) => (f.typ === 'zahl' ? 'numeric' : f.typ === 'datum' ? 'date' : f.typ === 'jaNein' ? 'boolean' : 'text');
  const cols = [{ tabelle: z.tabelle, spalte: 'id', datentyp: 'uuid' }, { tabelle: z.tabelle, spalte: 'retainer_id', datentyp: 'uuid' }];
  for (const f of z.felder) if (!f.virtuell) cols.push({ tabelle: z.tabelle, spalte: f.key, datentyp: f.key.endsWith('medien') ? 'ARRAY' : typ(f) });
  return cols.map((c) => ({ pflicht: false, ...c }));
}
const ziel = () => katalogFuerZiel('nutzungsrechte', dbFuer(zielDef('nutzungsrechte'))).ziel;
function datei(text) {
  const t = leseCsv(text);
  const z = ziel();
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles('nutzungsrechte', map, t.kopf, t.zeilen, { ziel: z, heute: HEUTE }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 135: Karte auf dem Motor, SQL-Whitelist = Motor-Tabellen (62)', () => {
  const q = importQuellen().find((x) => x.key === 'nutzungsrechte');
  assert.equal(q?.motor, 'nutzungsrechte');
  assert.equal(zielDef('nutzungsrechte').tabelle, 'agentur_nutzungsrecht');
  const sql = lies('supabase-sql/p135-import-nutzungsrechte.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].slice(0, 62).sort(), 'Paket 138 haengt weitere an');
  assert.equal(whitelist.length, 62);
  assert.doesNotMatch(sql, /\b(drop table|delete from|truncate|drop policy|update public)\b/i);
});

test('Nutzungsarten-Liste stimmt mit dem Modul ueberein', () => {
  const modul = lies('lib/papiereIdentifizierung.ts').match(/export const MEDIEN = (\[[^\]]*\])/)[1];
  assert.deepEqual([...NUTZUNG_MEDIEN], JSON.parse(modul.replace(/'/g, '"')));
});

test('leseMedien: Komma, Semikolon, „und", Schreibweisen, Unbekanntes getrennt', () => {
  assert.deepEqual(leseMedien('Print, Web; Instagram und Plakat'), { medien: ['Print', 'Website', 'Social Media', 'Außenwerbung'], unbekannt: [] });
  assert.deepEqual(leseMedien('TV/Video, Messe/Event'), { medien: ['TV/Video', 'Messe/Event'], unbekannt: [] });
  assert.deepEqual(leseMedien('Online-Werbung | Radio'), { medien: ['Online-Werbung'], unbekannt: ['Radio'] });
  assert.deepEqual(leseMedien(''), { medien: [], unbekannt: [] });
});

test('Mustervorlage laeuft unveraendert durch, Medien werden Listen', () => {
  const { t, map, bil, b } = datei(baueMustervorlage('nutzungsrechte'));
  assert.equal(bil.verschluckt, 0);
  assert.deepEqual(t.kopf.filter((s) => !map[s] || map[s] === EIGEN), []);
  assert.equal(b.gut, 3);
  assert.deepEqual(b.saetze[0].medien, ['Print', 'Website', 'Social Media']);
  assert.deepEqual(b.saetze[1].fremd_medien, undefined);
  assert.ok(!ziel().felder.some((f) => f.key === 'retainer_id'));
});

test('Recht/eigenes Recht uebersetzt, Unbekanntes in der Notiz, nie ein ungueltiger Wert', () => {
  const { b } = datei('Motiv;Kunde;Lizenzart;Kanäle;Gültig ab;Gültig bis;Fotograf;Eingekauftes Recht\r\n'
    + 'Team-Foto;Muster GmbH;exklusiv;Print, Radio;01.01.2026;31.12.2025;Studio X;nicht exklusiv\r\n'
    + 'Logo;Beispiel AG;Buyout;Website;;;;RF\r\n');
  assert.equal(b.gut, 2);
  const [a, l] = b.saetze;
  assert.deepEqual([a.recht, a.medien, a.fremd_recht], ['ausschliesslich', ['Print'], 'einfach']);
  assert.match(a.notiz, /Nutzungsarten im Altsystem: Radio/);
  assert.ok(b.warnungen.some((w) => w.zeile === 2 && /vor dem Beginn/.test(w.meldung)));
  assert.equal(l.recht, 'einfach');
  assert.match(l.notiz, /Recht im Altsystem: Buyout/);
  assert.equal(l.fremd_recht, undefined);
  assert.match(l.notiz, /Eigenes Recht im Altsystem: RF/);
  assert.deepEqual(erkennungsFelder(ziel()), ['werk+kunde+von', 'werk+kunde']);
});
