// Paket 133 (27.09.2026) — Umzug Schritt 4 Teil 2: HACCP-Plan, HACCP-Kontrollen,
// Kassen & TSE, Retainer, Duengung, Forst-Objekte, Baeume auf dem Import-Motor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  katalogFuerZiel, vorschlagMapping, spaltenBilanz, MOTOR_TABELLEN, EIGEN, erkennungsFelder,
  nachschlagIndex, loeseNachschlag, elternZeilen, fehlendeNamen, baueKundenIndex, verknuepfeKunde,
} from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage, intervallTage } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));
const NEU = { haccp_plan: 'lm_haccp_plan', haccp: 'lm_haccp', kassen: 'kassen_system', retainer: 'agentur_retainer', duengung: 'schlag_duengung', forst_objekte: 'forst_objekte', forst_baeume: 'forst_baeume' };
const ELTERN = { lm_haccp_plan: ['id', 'kontrollpunkt'], schlag: ['id', 'bezeichnung', 'status'], forst_objekte: ['id', 'bezeichnung'] };

function dbFuer(z) {
  const typ = (f) => (f.typ === 'zahl' ? 'numeric' : f.typ === 'datum' ? 'date' : f.typ === 'jaNein' ? 'boolean' : 'text');
  const cols = [{ tabelle: z.tabelle, spalte: 'id', datentyp: 'uuid' }];
  for (const f of z.felder) if (!f.virtuell) cols.push({ tabelle: z.tabelle, spalte: f.key, datentyp: f.key === 'intervall_tage' ? 'integer' : f.key === 'in_ordnung' ? 'boolean' : typ(f) });
  if (z.kundeVerweis) cols.push({ tabelle: z.tabelle, spalte: z.kundeVerweis.spalte, datentyp: 'uuid' });
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

test('Paket 133: sieben Ziele, Karten auf dem Motor, SQL-Whitelist = Motor-Tabellen (55)', () => {
  for (const [k, t] of Object.entries(NEU)) {
    const q = importQuellen().find((x) => x.key === k);
    assert.equal(q?.motor, k, k);
    assert.equal(q?.musterZiel, k, k);
    assert.equal(zielDef(k).tabelle, t);
    assert.equal(zielDef(k).nurMitKatalog, true);
    assert.ok(MOTOR_TABELLEN.includes(t), t);
  }
  const sql = lies('supabase-sql/p133-import-schritt4b.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].slice(0, 55).sort());
  assert.equal(whitelist.length, 55);
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

test('HACCP-Plan: Intervall als Zahl oder Wort, Unbekanntes = taeglich', () => {
  assert.equal(intervallTage('täglich'), 1);
  assert.equal(intervallTage('wöchentlich'), 7);
  assert.equal(intervallTage('14-tägig'), 14);
  assert.equal(intervallTage('3 Tage'), 3);
  assert.equal(intervallTage('2,6'), 3);
  assert.equal(intervallTage(''), 1);
  const w = [];
  assert.equal(intervallTage('nach Bedarf', 5, w), 1);
  assert.ok(/täglich/.test(w[0].meldung));
  const { b } = datei('Kontrollpunkt;Sollwert;Häufigkeit\r\nKühlhaus 1;max. 4 °C;monatlich\r\n', 'haccp_plan');
  assert.deepEqual([b.saetze[0].intervall_tage, b.saetze[0].aktiv], [30, true]);
});

test('HACCP-Kontrollen: i.O./n.i.O., Unklares = Abweichung, Plan verknuepft', () => {
  const { b, z } = datei('Datum;Kontrollpunkt;Temperatur;Ergebnis;Maßnahme;Kürzel\r\n'
    + '25.09.2026;Kühlhaus 1;3,5 °C;i.O.;;MK\r\n'
    + '25.09.2026;Fritteuse;181 °C;n.i.O.;Öl gewechselt;MK\r\n'
    + '26.09.2026;Kühlhaus 1;6 °C;grenzwertig;;LB\r\n'
    + '26.09.2026;Kühlhaus 2;4 °C;;;LB\r\n', 'haccp');
  assert.equal(b.gut, 4);
  const [a, f, g, l] = b.saetze;
  assert.deepEqual([a.in_ordnung, a.massnahme, a.messwert], [true, undefined, '3,5 °C']);
  assert.equal(f.in_ordnung, false);
  assert.match(f.massnahme, /^Öl gewechselt/);
  assert.equal(g.in_ordnung, false);
  assert.match(g.massnahme, /Maßnahme bitte prüfen/);
  assert.match(g.massnahme, /Ergebnis im Altsystem: grenzwertig/);
  assert.ok(b.warnungen.some((w) => w.zeile === 4 && /Abweichung/.test(w.meldung)));
  assert.ok(!b.warnungen.some((w) => w.zeile === 3), 'n.i.O. ist ein klares Ergebnis — keine Warnung');
  assert.equal(l.in_ordnung, true);
  const idx = nachschlagIndex([{ id: 'p1', kontrollpunkt: 'Kühlhaus 1' }], 'kontrollpunkt');
  assert.equal(loeseNachschlag(a, z.nachschlag, idx, false).satz.plan_id, 'p1');
  const ohne = loeseNachschlag(l, z.nachschlag, idx, false);
  assert.equal(ohne.satz.plan_id, undefined);
  assert.equal(ohne.satz.kontrollpunkt, 'Kühlhaus 2');   // Name bleibt im echten Feld
});

test('Kassen: nur Chef, Art-Liste, alter Wert in der Notiz, Erkennung ueber Seriennummer', () => {
  assert.equal(zielDef('kassen').nurChef, true);
  const { b } = datei('Filiale;Kassenart;Hersteller;Seriennummer;TSE Seriennummer;Gemietet\r\n'
    + 'Böblingen;iPad;Beispiel POS;BP-1;TSE-1;ja\r\n'
    + 'Herrenberg;Waage mit Kasse;Muster;MW-2;;nein\r\n', 'kassen');
  assert.equal(b.gut, 2);
  const [a, w] = b.saetze;
  assert.deepEqual([a.art, a.gemietet, a.tse_seriennummer], ['kasse_app', true, 'TSE-1']);
  assert.equal(w.art, 'sonstiges');
  assert.match(w.notiz, /Art im Altsystem: Waage mit Kasse/);
  assert.deepEqual(erkennungsFelder(ziel('kassen')), ['seriennummer', 'tse_seriennummer', 'betriebsstaette+modell']);
  const { b: ohne } = datei('Hersteller;Seriennummer\r\nMuster;X\r\n', 'kassen');
  assert.equal(ohne.gut, 0);                      // Betriebsstaette ist Pflicht (Mitteilung ans Finanzamt)
});

test('Retainer: Kunde verknuepft, Status-Liste, Pauschale in der Notiz, es wird nichts abgerechnet', () => {
  const z = zielDef('retainer');
  assert.deepEqual(z.kundeVerweis.ausFeldern, ['kunde_name']);
  const { b } = datei('Kunde;Paket;Stunden pro Monat;Stundensatz;Pauschale;Status\r\nMuster GmbH;Social Media;20;95,00;1.900,00;gekündigt\r\n', 'retainer');
  const [r] = b.saetze;
  assert.deepEqual([r.kunde_name, r.bezeichnung, r.monatsstunden, r.stundensatz, r.status], ['Muster GmbH', 'Social Media', 20, 95, 'beendet']);
  assert.match(r.notiz, /Monatsbetrag: 1\.900,00/);
  const idx = baueKundenIndex([{ id: 'k9', firma: 'Muster GmbH' }]);
  assert.equal(verknuepfeKunde(r, z.kundeVerweis, idx).satz.kontakt_id, 'k9');
  assert.doesNotMatch(lies('lib/importParser.ts').match(/key: 'retainer'[\s\S]*?\n  \},\n/)[0], /rechnung/i);
});

test('Duengung: Schlag per Name (fehlende angelegt), Art/Einheit-Listen', () => {
  const { b, z } = datei('Schlag;Datum;Dünger;Art;Menge;Einheit;N\r\n'
    + 'Am Bach;15.03.2026;KAS 27;Handelsdünger;200;kg;54\r\n'
    + 'Neues Feld;20.03.2026;Gülle;Wirtschaftsdünger;25;m³/ha;80\r\n', 'duengung');
  assert.equal(b.gut, 2);
  const [a, g] = b.saetze;
  assert.deepEqual([a.art, a.einheit, a.menge, a.n_gesamt, a.__nach], ['mineralisch', 'kg/ha', 200, 54, 'Am Bach']);
  assert.deepEqual([g.art, g.einheit], ['organisch', 'm3/ha']);
  const bestand = nachschlagIndex([{ id: 's1', bezeichnung: 'Am Bach' }], 'bezeichnung');
  const fehl = fehlendeNamen(b.saetze, bestand);
  assert.deepEqual(fehl, ['Neues Feld']);
  const [neu] = elternZeilen(fehl, b.saetze, z.nachschlag, 'chef');
  assert.deepEqual(neu, { status: 'aktiv', owner_user_id: 'chef', bezeichnung: 'Neues Feld' });
  const { b: ohne } = datei('Datum;Dünger\r\n15.03.2026;KAS\r\n', 'duengung');
  assert.equal(ohne.gut, 0);                      // ohne Schlag keine Duengung
});

test('Baeume: Objekt angelegt, Baum-Nr. erkennt wieder, Zustand-Liste, naechste Kontrolle gerechnet', () => {
  const { b } = datei('Objekt;Baum-Nr.;Baumart;BHD;Vitalität;Intervall;Kontrolliert am\r\n'
    + 'Stadtpark Nord;17;Bergahorn;40;abgängig;6;01.09.2026\r\n'
    + 'Stadtpark Nord;18;Linde;55;vital;;15.05.2026\r\n', 'forst_baeume');
  assert.equal(b.gut, 2);
  const [a, l] = b.saetze;
  assert.deepEqual([a.zustand, a.kontrollintervall_monate, a.letzte_kontrolle, a.naechste_kontrolle], ['kritisch', 6, '2026-09-01', '2027-03-01']);
  assert.match(a.notiz, /Baum-Nr\.: 17/);
  assert.deepEqual([l.zustand, l.naechste_kontrolle], ['gut', '2027-05-15']);
  assert.deepEqual(erkennungsFelder(ziel('forst_baeume')), ['objekt_id+notiz']);
  // gleiche Datei zweimal -> gleicher Notiztext -> wiedererkannt
  const zweit = datei('Objekt;Baum-Nr.;Baumart;BHD;Vitalität;Intervall;Kontrolliert am\r\nStadtpark Nord;17;Bergahorn;40;abgängig;6;01.09.2026\r\n', 'forst_baeume').b.saetze[0];
  assert.equal(zweit.notiz, a.notiz);
});
