// Paket 134 (27.09.2026) — Umzug Schritt 4 Teil 3: Pflanzenschutz, Mieteinheiten,
// Mietvertraege, Expose-Interessenten, Kurs-Anmeldungen, Ehrenamts-Stunden.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  katalogFuerZiel, vorschlagMapping, spaltenBilanz, MOTOR_TABELLEN, EIGEN, erkennungsFelder, sperrGrund,
  nachschlagIndex, loeseNachschlag, elternZeilen, fehlendeNamen, nachschlagPflichtGrund,
} from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));
const NEU = { psm: 'schlag_psm', einheiten: 'immo_einheiten', mietvertraege: 'immo_mietvertraege', interessenten: 'expose_interessent', anmeldungen: 'bildung_anmeldungen', ehrenamt: 'verein_ehrenamt' };
const ELTERN = { schlag: ['id', 'bezeichnung', 'status'], immo_einheiten: ['id', 'bezeichnung', 'status'], expose: ['id', 'bezeichnung'], bildung_kurse: ['id', 'titel'] };

function dbFuer(z) {
  const typ = (f) => (f.typ === 'zahl' ? 'numeric' : f.typ === 'datum' ? 'date' : f.typ === 'jaNein' ? 'boolean' : 'text');
  const cols = [{ tabelle: z.tabelle, spalte: 'id', datentyp: 'uuid' }];
  for (const f of z.felder) if (!f.virtuell) cols.push({ tabelle: z.tabelle, spalte: f.key, datentyp: typ(f) });
  for (const s of z.ausblenden ?? []) cols.push({ tabelle: z.tabelle, spalte: s, datentyp: 'uuid' });
  if (z.nachschlag) {
    cols.push({ tabelle: z.tabelle, spalte: z.nachschlag.spalte, datentyp: 'uuid' });
    for (const c of ELTERN[z.nachschlag.tabelle]) cols.push({ tabelle: z.nachschlag.tabelle, spalte: c, datentyp: 'text' });
  }
  return cols.map((c) => ({ pflicht: false, ...c }));
}
const ziel = (k) => katalogFuerZiel(k, dbFuer(zielDef(k))).ziel;
function datei(text, k) {
  const t = leseCsv(text);
  const z = ziel(k);
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles(k, map, t.kopf, t.zeilen, { ziel: z, heute: HEUTE }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 134: sechs Ziele, Karten auf dem Motor, SQL-Whitelist = Motor-Tabellen (61)', () => {
  for (const [k, t] of Object.entries(NEU)) {
    const q = importQuellen().find((x) => x.key === k);
    assert.equal(q?.motor, k, k);
    assert.equal(q?.musterZiel, k, k);
    assert.equal(zielDef(k).tabelle, t);
    assert.equal(zielDef(k).nurMitKatalog, true);
    assert.ok(MOTOR_TABELLEN.includes(t), t);
  }
  const sql = lies('supabase-sql/p134-import-schritt4c.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].slice(0, 61).sort());
  assert.equal(whitelist.length, 61);
  assert.doesNotMatch(sql, /\b(drop table|delete from|truncate|drop policy|update public)\b/i);
  assert.match(sql, /revoke all on function public\.import_feldkatalog\(text\[\]\) from anon/);
});

test('Mustervorlagen laufen unveraendert durch, nichts verschluckt', () => {
  for (const k of Object.keys(NEU)) {
    const { t, map, bil, b } = datei(baueMustervorlage(k), k);
    assert.equal(bil.verschluckt, 0, k);
    assert.deepEqual(t.kopf.filter((s) => !map[s] || map[s] === EIGEN), [], k);
    assert.equal(b.gut, 3, k);
  }
});

test('Immobilien: Einheiten und Mietvertraege nur Chef, keine Geldbuchungen', () => {
  assert.equal(zielDef('einheiten').nurChef, true);
  assert.equal(zielDef('mietvertraege').nurChef, true);
  assert.equal(zielDef('mietvertraege').nachschlag.anlegenMit.status, 'vermietet');
  // Keine Zahlungs-/Kautionstabellen im Motor (GEMEINSAM)
  for (const t of ['immo_kaution', 'immo_zahlungen', 'markt_verkauf', 'shop_bestellungen']) assert.ok(!MOTOR_TABELLEN.includes(t), t);
  const { b, z } = datei('Wohnung;Mieter;Einzug;Auszug;Grundmiete;NK;Mietsicherheit;Status;IBAN\r\n'
    + 'Seestraße 5 · EG links;Familie Kaya;01.04.2021;;720,00;180;2.160;laufend;DE02120300000000202051\r\n'
    + 'Neubau · WE 7;Herr Ott;01.10.2026;;900;210;;gekündigt;\r\n', 'mietvertraege');
  assert.equal(b.gut, 2);
  const [k, o] = b.saetze;
  assert.deepEqual([k.kaltmiete, k.nebenkosten, k.kaution, k.status, k.beginn, k.__nach], [720, 180, 2160, 'aktiv', '2021-04-01', 'Seestraße 5 · EG links']);
  assert.equal(o.status, 'aktiv');                              // gekuendigt heisst noch nicht beendet
  assert.match(o.notiz, /Status im Altsystem: gekündigt/);
  assert.equal(sperrGrund('IBAN', z) !== null, true);            // Bankdaten nie
  const [neu] = elternZeilen(fehlendeNamen(b.saetze, nachschlagIndex([{ id: 'e1', bezeichnung: 'Seestraße 5 · EG links' }], 'bezeichnung')), b.saetze, z.nachschlag, 'chef');
  assert.deepEqual(neu, { status: 'vermietet', owner_user_id: 'chef', bezeichnung: 'Neubau · WE 7' });
  const { b: e } = datei('Haus;Wohnung;Wohnfläche;Belegung\r\nSeestraße 5;EG links;62,5;Leerstand\r\n', 'einheiten');
  assert.deepEqual([e.saetze[0].objekt, e.saetze[0].flaeche_qm, e.saetze[0].status], ['Seestraße 5', 62.5, 'frei']);
  assert.equal(e.saetze[0].notiz, undefined);                   // Leerstand ist bekannt, kein „Status im Altsystem"
  assert.deepEqual(erkennungsFelder(ziel('einheiten')), ['objekt+bezeichnung']);
});

test('Interessenten und Anmeldungen: ohne passendes Expose/Kurs faellt die Zeile mit Grund heraus', () => {
  for (const k of ['interessenten', 'anmeldungen']) {
    assert.equal(zielDef(k).nachschlag.pflicht, true, k);
    assert.ok(!zielDef(k).nachschlag.anlegen, k);                // nie ein Expose/Kurs aus dem Nichts
  }
  const { b, z } = datei('Kurs;Teilnehmer;E-Mail;Status\r\nErste Hilfe Grundkurs;Kevin Stadler;k@x.de;bezahlt\r\nUnbekannter Kurs;Anna;;abgemeldet\r\n', 'anmeldungen');
  assert.equal(b.gut, 2);
  assert.deepEqual([b.saetze[0].status, b.saetze[1].status], ['bestaetigt', 'storniert']);
  const idx = nachschlagIndex([{ id: 'k1', titel: 'Erste Hilfe Grundkurs' }], 'titel');
  assert.equal(loeseNachschlag(b.saetze[0], z.nachschlag, idx, true).satz.kurs_id, 'k1');
  const r = loeseNachschlag(b.saetze[1], z.nachschlag, idx, true);
  assert.equal(r.gefunden, false);
  assert.match(nachschlagPflichtGrund(z.nachschlag, r.name), /Kurs „Unbekannter Kurs" nicht gefunden\. Bitte zuerst die Kurse importieren/);
  const seite = lies('app/dashboard/import/page.tsx');
  assert.match(seite, /if \(nach\.pflicht && !r\.gefunden\) \{/);
  const { b: i } = datei('Objekt;Name;Mail;Stand;Newsletter\r\nHelle 3-Zimmer-Wohnung;Anna Weiß;a@x.de;Besichtigung vereinbart;ja\r\n', 'interessenten');
  assert.equal(i.saetze[0].status, 'besichtigung');
  assert.notEqual(sperrGrund('Newsletter', ziel('interessenten')), null);
  assert.deepEqual(erkennungsFelder(ziel('interessenten')), ['expose_id+email', 'expose_id+name']);
});

test('Ehrenamt: Stunden > 0 und hoechstens 24, sonst Zeile mit Grund heraus', () => {
  const { b } = datei('Name;Datum;Std;Aufgabe\r\nMaria Huber;06.09.2026;4;Aufbau\r\nPeter Ott;06.09.2026;30;Wochenende\r\nPeter Ott;07.09.2026;0;\r\nPeter Ott;08.09.2026;24;Zeltlager\r\n', 'ehrenamt');
  assert.equal(b.gut, 2);
  assert.ok(b.fehler.some((f) => f.zeile === 3 && /höchstens 24/.test(f.meldung)));
  assert.ok(b.fehler.some((f) => f.zeile === 4 && /größer als 0/.test(f.meldung)));
  assert.deepEqual(b.saetze.map((s) => s.stunden), [4, 24]);
  const z = ziel('ehrenamt');
  assert.ok(!z.felder.some((f) => f.key === 'mitglied_id' || f.key === 'erstellt_von'));
});

test('Pflanzenschutz: Schlag per Name (fehlend angelegt), Einheit/Verwendungsart-Listen, Mittel Pflicht', () => {
  const { b } = datei('Schlag;Datum;Mittel;Zulassungsnummer;Menge;Einheit;Anwendungsart;BBCH\r\nAm Bach;12.04.2026;Mittel A;000000-00;1,5;Liter;Gewächshaus;25\r\nAm Bach;13.04.2026;;;;;;\r\n', 'psm');
  assert.equal(b.gut, 1);
  const [p] = b.saetze;
  assert.deepEqual([p.aufwandmenge, p.aufwand_einheit, p.verwendungsart, p.bbch_stadium, p.zulassungsnr, p.__nach], [1.5, 'l/ha', 'gewaechshaus', '25', '000000-00', 'Am Bach']);
  assert.ok(b.fehler.some((f) => f.zeile === 3 && /Pflichtfeld/.test(f.meldung)));
  const { b: kg } = datei('Schlag;Datum;Mittel;Menge;Einheit\r\nAm Bach;12.04.2026;Mittel B;2;kg\r\n', 'psm');
  assert.equal(kg.saetze[0].aufwand_einheit, 'kg/ha');
  assert.deepEqual(erkennungsFelder(ziel('psm')), ['schlag_id+datum+mittel_name']);
});
