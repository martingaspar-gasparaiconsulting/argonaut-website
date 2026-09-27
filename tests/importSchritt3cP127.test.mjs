// Umzug Schritt 3, Teil 3 (27.09.2026) · Paket 127 — Qualifikationen (Verweis
// auf Mitarbeiter ueber Personalnummer/Name/E-Mail), Bestellungen mit
// Positionen (Zeilen je Bestellnummer gruppiert, ERP-Bestellwesen).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  katalogFuerZiel, vorschlagMapping, spaltenBilanz, erkennungsFelder, erkennungsSpalten, baueBestandIndex, findeImBestand,
  baueKundenIndex, verknuepfeKunde, verweisAusMitarbeitern, verweisAusLieferanten, istPersonalnummerLabel, MOTOR_TABELLEN, EIGEN,
} from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, qualiSchluessel, QUALI_MUSTER, schluesselWerte } from '../out/importParser.js';
import {
  gruppiereBestellungen, baueArtikelIndex, kopfStatus, positionsStatus, kopfFuerDatenbank, positionFuerDatenbank, bestellSumme,
  HOHER_POSITIONSWERT,
} from '../out/importBestellungen.js';
import { QUALIFIKATIONEN } from '../out/dispoPlus.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));

function spalten(t, cols) {
  return cols.map((c) => ({
    tabelle: t, spalte: c, pflicht: false, generiert: false,
    datentyp: c === 'id' || (c.endsWith('_id')) ? 'uuid'
      : /(datum|_am$|_bis$|_erwartet$)/.test(c) ? 'date'
        : /(menge|preis|position$)/.test(c) ? 'numeric' : 'text',
  }));
}
const DB = [
  ...spalten('mitarbeiter_qualifikation', ['id', 'owner_user_id', 'mitarbeiter_id', 'art', 'gueltig_bis', 'nachweis', 'erstellt_am']),
  ...spalten('bestellungen', ['id', 'owner_user_id', 'bestellnummer', 'lieferant_id', 'status', 'bestelldatum', 'lieferdatum_erwartet', 'notizen', 'created_at']),
  ...spalten('bestellpositionen', ['id', 'owner_user_id', 'bestellung_id', 'artikel_id', 'bezeichnung', 'menge', 'einzelpreis', 'menge_geliefert', 'position']),
];
const ziel = (k, db = DB) => katalogFuerZiel(k, db).ziel;
function datei(text, zielKey, db = DB) {
  const t = leseCsv(text);
  const z = ziel(zielKey, db);
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  const b = pruefeAlles(zielKey, map, t.kopf, t.zeilen, { ziel: z, heute: HEUTE });
  return { t, z, map, b };
}

// Mitarbeiter wie Haldenberg (nach Import 07: Personalnummer als Eigenes Feld)
const MA = [
  { id: 'm1', vorname: 'Thomas', nachname: 'Haldenberg', email: 'thomas.haldenberg@elektro-haldenberg.example' },
  { id: 'm3', vorname: 'Kevin', nachname: 'Stadler', email: 'kevin.stadler@elektro-haldenberg.example' },
  { id: 'm4', vorname: 'Murat', nachname: 'Özdemir', email: 'murat.oezdemir@elektro-haldenberg.example' },
  { id: 'm5', vorname: 'Jonas', nachname: 'Rieker', email: null },
  { id: 'm6', vorname: 'Patrick', nachname: 'Gruber', email: null },
  { id: 'm7', vorname: 'Leon', nachname: 'Kaltenbach', email: null },
  { id: 'm9', vorname: 'Rudolf', nachname: 'Merz', email: null },
];
const PNR = { m1: 'M-001', m3: 'M-003', m4: 'M-004', m5: 'M-005', m6: 'M-006', m7: 'M-007', m9: 'M-009' };

test('Paket 127: Motor-Tabellen und SQL-Whitelist stimmen ueberein (19)', () => {
  for (const t of ['mitarbeiter_qualifikation', 'bestellungen', 'bestellpositionen']) assert.ok(MOTOR_TABELLEN.includes(t), t);
  const sql = lies('supabase-sql/p127-import-schritt3c.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].sort());
  assert.equal(whitelist.length, 19);
  assert.match(sql, /revoke all on function public\.import_feldkatalog\(text\[\]\) from anon/);
  assert.match(sql, /whist_insert_ma/);
  assert.doesNotMatch(sql, /\b(drop table|delete from|truncate|drop policy)\b/i);
});

test('Qualifikations-Schluessel: bekannte Befaehigungen auf die Dispo-Liste, der Rest bleibt', () => {
  const keys = new Set(QUALIFIKATIONEN.map((q) => q.key));
  for (const [, k] of QUALI_MUSTER) assert.ok(keys.has(k), `${k} fehlt in dispoPlus`);
  assert.equal(qualiSchluessel('Elektrofachkraft nach DGUV V3'), 'elektrofachkraft');
  assert.equal(qualiSchluessel('Erste Hilfe (Betriebshelfer)'), 'erste_hilfe');
  assert.equal(qualiSchluessel('Erste Hilfe (Grundausbildung)'), 'erste_hilfe');
  assert.equal(qualiSchluessel('Hubarbeitsbühne (Bedienerschein)'), 'hubarbeitsbuehne');
  assert.equal(qualiSchluessel('Staplerschein'), 'stapler');
  assert.equal(qualiSchluessel('Kältemittel-Sachkunde Kat. I'), 'kaeltemittel');
  assert.equal(qualiSchluessel('Schaltberechtigung bis 30 kV'), null);
  assert.equal(qualiSchluessel('Photovoltaik und Speicher'), null);
  assert.equal(qualiSchluessel('Brandschutzbeauftragter'), null);   // Helfer ist nicht Beauftragter
  assert.equal(qualiSchluessel('Ladungssicherung'), null);
});

test('Personalnummer als Eigenes Feld wird erkannt', () => {
  for (const l of ['Personalnummer', 'Pers.-Nr.', 'PersNr', 'Mitarbeiternummer', 'MA-Nr']) assert.ok(istPersonalnummerLabel(l), l);
  for (const l of ['Kundennummer', 'Verrechnungssatz', 'Personal']) assert.ok(!istPersonalnummerLabel(l), l);
});

test('Qualifikationen (Haldenberg 03): alle Spalten zugeordnet, Art uebersetzt, Status/Erworben im Nachweis', () => {
  const { t, z, map, b } = datei(lies('tests/fixtures/haldenberg-03-qualifikationen.csv'), 'mitarbeiter_qualifikation');
  assert.equal(map['Personalnummer'], 'kunde_nummer');
  assert.equal(map['Name'], 'kunde');
  assert.equal(map['Qualifikation'], 'art');
  assert.equal(map['Erworben'], 'erworben');
  assert.equal(map['Gueltig bis'], 'gueltig_bis');
  assert.equal(map['Status'], 'quali_status');
  const bil = spaltenBilanz(t.kopf, t.zeilen, map, z);
  assert.equal(bil.verschluckt, 0);
  assert.equal(bil.feld, 6);
  assert.equal(b.gesamt, 17);
  assert.equal(b.gut, 17);
  const s1 = b.saetze[0];
  assert.equal(s1.art, 'Eintragung Handwerksrolle (Meisterbrief)');
  assert.equal(s1.gueltig_bis, undefined);
  assert.match(s1.nachweis, /Erworben am: 20\.06\.2008/);
  assert.match(s1.nachweis, /Status im Altsystem: unbefristet/);
  const efk = b.saetze.find((s) => s.__kunde === 'M-003' && s.art === 'elektrofachkraft');
  assert.ok(efk);
  assert.match(efk.nachweis, /Bezeichnung im Altsystem: Elektrofachkraft nach DGUV V3/);
  const eh = b.saetze.find((s) => s.__kunde === 'M-001' && s.art === 'erste_hilfe');
  assert.equal(eh.gueltig_bis, '2026-02-13');
  // unbekannte Befaehigungen -> Warnung, Name bleibt
  assert.ok(b.warnungen.some((w) => /Schaltberechtigung bis 30 kV/.test(w.meldung)));
  // keine virtuellen Felder in den Datensatz
  for (const s of b.saetze) { assert.equal(s.kunde, undefined); assert.equal(s.erworben, undefined); assert.equal(s.quali_status, undefined); }
});

test('Qualifikationen: Verknuepfung ueber Personalnummer, sonst Name, sonst E-Mail; ohne Treffer keine Zeile', () => {
  const idx = baueKundenIndex(verweisAusMitarbeitern(MA, PNR));
  const z = ziel('mitarbeiter_qualifikation');
  const { b } = datei(lies('tests/fixtures/haldenberg-03-qualifikationen.csv'), 'mitarbeiter_qualifikation');
  const ergebnisse = b.saetze.map((s) => verknuepfeKunde(s, z.kundeVerweis, idx));
  assert.ok(ergebnisse.every((e) => e.treffer.art === 'gefunden'));
  assert.equal(ergebnisse.find((e) => e.gesucht === 'M-004').satz.mitarbeiter_id, 'm4');
  // Ohne Personalnummer-Feld: ueber den Namen („Murat Özdemir")
  const idxOhne = baueKundenIndex(verweisAusMitarbeitern(MA, {}));
  const e2 = verknuepfeKunde({ __kunde: 'M-004', __kunde2: 'Murat Özdemir', art: 'x' }, z.kundeVerweis, idxOhne);
  assert.equal(e2.treffer.art, 'gefunden');
  assert.equal(e2.satz.mitarbeiter_id, 'm4');
  // E-Mail
  const e3 = verknuepfeKunde({ __kunde: 'kevin.stadler@elektro-haldenberg.example', art: 'x' }, z.kundeVerweis, idxOhne);
  assert.equal(e3.satz.mitarbeiter_id, 'm3');
  // unbekannt -> keiner (Pflicht-Verweis: die Seite lehnt die Zeile ab)
  assert.equal(verknuepfeKunde({ __kunde: 'M-099', art: 'x' }, z.kundeVerweis, idx).treffer.art, 'keiner');
  assert.equal(z.kundeVerweis.pflicht, true);
  assert.equal(z.nurChef, true);
  // zwei gleichnamige Mitarbeiter -> nie verknuepft
  const idxDoppelt = baueKundenIndex(verweisAusMitarbeitern([...MA, { id: 'mx', vorname: 'Kevin', nachname: 'Stadler' }], {}));
  assert.equal(verknuepfeKunde({ __kunde: 'Kevin Stadler' }, z.kundeVerweis, idxDoppelt).treffer.art, 'mehrdeutig');
});

test('Qualifikationen: Erkennung im Bestand ueber Mitarbeiter + Art, doppelt in der Datei nur einmal', () => {
  const z = ziel('mitarbeiter_qualifikation');
  assert.deepEqual(erkennungsFelder(z), ['mitarbeiter_id+art']);
  assert.deepEqual(erkennungsSpalten(erkennungsFelder(z)), ['mitarbeiter_id', 'art']);
  const bestand = baueBestandIndex([{ id: 'q1', mitarbeiter_id: 'm3', art: 'erste_hilfe' }], erkennungsFelder(z));
  assert.equal(findeImBestand({ mitarbeiter_id: 'm3', art: 'erste_hilfe' }, erkennungsFelder(z), bestand), 'q1');
  assert.equal(findeImBestand({ mitarbeiter_id: 'm4', art: 'erste_hilfe' }, erkennungsFelder(z), bestand), undefined);
  const { b } = datei('Personalnummer;Qualifikation;Gueltig bis\r\nM-003;Erste Hilfe;01.10.2026\r\nM-003;Ersthelfer (Auffrischung);01.10.2028\r\nM-004;Erste Hilfe;\r\n', 'mitarbeiter_qualifikation');
  assert.equal(b.gut, 2);
  assert.equal(b.dubletten_in_datei, 1);
  assert.deepEqual(schluesselWerte({ __kunde: 'M-003', art: 'erste_hilfe' }, z), ['__kunde+art:m-003|erste_hilfe']);
});

test('Qualifikationen ohne Katalog (SQL p127 fehlt): Ziel ohne Felder', () => {
  const k = katalogFuerZiel('mitarbeiter_qualifikation', []);
  assert.equal(k.ziel.felder.length, 0);
  assert.equal(k.ausDb, false);
});

test('Bestellungen: Katalog — Positionsfelder nur mit bestellpositionen', () => {
  const mit = katalogFuerZiel('bestellungen', DB);
  for (const k of ['bestellnummer', 'bestelldatum', 'kunde', 'kunde_nummer', 'artikelnummer', 'bezeichnung', 'menge', 'einzelpreis', 'gesamt_netto', 'menge_geliefert', 'einheit']) {
    assert.ok(mit.ziel.felder.some((f) => f.key === k), k);
  }
  const ohnePos = katalogFuerZiel('bestellungen', DB.filter((c) => c.tabelle !== 'bestellpositionen'));
  assert.ok(!ohnePos.ziel.felder.some((f) => f.key === 'menge'));
  assert.ok(ohnePos.fehlend.some((f) => f.key === 'menge'));
  // ohne menge_geliefert-Spalte: das Feld fehlt, der Rest bleibt
  const ohneGeliefert = katalogFuerZiel('bestellungen', DB.filter((c) => !(c.tabelle === 'bestellpositionen' && c.spalte === 'menge_geliefert')));
  assert.ok(!ohneGeliefert.ziel.felder.some((f) => f.key === 'menge_geliefert'));
  assert.ok(ohneGeliefert.ziel.felder.some((f) => f.key === 'menge'));
});

test('Positions-Status und Status der Bestellung', () => {
  assert.equal(positionsStatus('teilgeliefert'), 'teil');
  assert.equal(positionsStatus('Geliefert'), 'geliefert');
  assert.equal(positionsStatus('bestellt'), 'bestellt');
  assert.equal(positionsStatus('versendet'), 'bestellt');
  assert.equal(positionsStatus('Storniert'), 'storniert');
  assert.equal(positionsStatus('irgendwas'), null);
  assert.equal(kopfStatus([{ menge: 5, menge_geliefert: 5, status: 'geliefert' }, { menge: 2, menge_geliefert: 2, status: null }]), 'geliefert');
  assert.equal(kopfStatus([{ menge: 5, menge_geliefert: 5, status: 'geliefert' }, { menge: 2, menge_geliefert: 0, status: 'bestellt' }]), 'teilweise_geliefert');
  assert.equal(kopfStatus([{ menge: 5, menge_geliefert: 0, status: 'teil' }]), 'teilweise_geliefert');
  assert.equal(kopfStatus([{ menge: 5, menge_geliefert: 0, status: 'bestellt' }]), 'bestellt');
  assert.equal(kopfStatus([{ menge: 5, menge_geliefert: 0, status: 'storniert' }]), 'storniert');
  assert.equal(kopfStatus([{ menge: 5, menge_geliefert: 0, status: 'storniert' }, { menge: 1, menge_geliefert: 1, status: 'geliefert' }]), 'geliefert');
});

test('Bestellungen (Haldenberg 13): 45 Zeilen -> 15 Bestellungen, nichts verschluckt, Fallen gemeldet', () => {
  const { t, z, map, b } = datei(lies('tests/fixtures/haldenberg-13-bestellungen.csv'), 'bestellungen');
  assert.equal(map['Bestellnummer'], 'bestellnummer');
  assert.equal(map['Lieferant'], 'kunde');
  assert.equal(map['Artikelnummer'], 'artikelnummer');
  assert.equal(map['Gesamt netto'], 'gesamt_netto');
  assert.equal(map['Einheit'], 'einheit');
  assert.equal(map['Status'], 'status');
  const bil = spaltenBilanz(t.kopf, t.zeilen, map, z);
  assert.equal(bil.verschluckt, 0);
  assert.equal(bil.eigen, 0);
  assert.equal(b.gesamt, 45);
  assert.equal(b.gut, 45);                       // keine Zeile als „doppelt" verworfen
  assert.equal(b.dubletten_in_datei, 0);

  const artikel = baueArtikelIndex([
    { id: 'a1', artikelnummer: 'B-8012', einheit: 'Stk' },
    { id: 'a2', artikelnummer: 'L-8003', einheit: 'm' },
  ]);
  const g = gruppiereBestellungen(b.saetze, b.zeilenNummern, artikel);
  assert.equal(g.bestellungen.length, 15);
  assert.equal(g.abgelehnt.length, 0);
  const s = bestellSumme(g.bestellungen);
  assert.equal(s.positionen, 45);
  // jede Datei-Zeile steckt in genau einer Bestellung
  const alle = g.bestellungen.flatMap((x) => x.zeilen).sort((a, c) => a - c);
  assert.deepEqual(alle, b.zeilenNummern.slice().sort((a, c) => a - c));

  const b410 = g.bestellungen.find((x) => x.kopf.bestellnummer === 'B-2026-0410');
  assert.equal(b410.positionen.length, 3);
  assert.equal(b410.kopf.bestelldatum, '2026-09-10');            // fruehestes der drei Daten
  assert.match(b410.kopf.notizen, /Bestelldaten im Altsystem: 10\.09\.2026, 13\.09\.2026, 15\.09\.2026/);
  assert.ok(b410.warnungen.some((w) => /3 verschiedene Bestelldaten/.test(w.meldung)));
  assert.equal(b410.kopf.__kunde, 'Vollmann Licht- und Systemtechnik');
  assert.equal(b410.kopf.status, 'bestellt');
  const p1 = b410.positionen[0];
  assert.equal(p1.artikel_id, 'a1');
  assert.equal(p1.bezeichnung, 'DALI-Gateway 64 Adressen');
  assert.equal(p1.menge, 100);
  assert.equal(p1.einzelpreis, 468);
  assert.equal(p1.position, 1);
  // ohne Artikel: Einheit in die Bezeichnung
  assert.equal(b410.positionen[1].bezeichnung, 'LED-Strahler 30 W mit Bewegungsmelder (Stk)');
  assert.ok(b410.warnungen.some((w) => /Artikel „B-5004" nicht gefunden/.test(w.meldung)));

  // 0411: geliefert + teilgeliefert gemischt -> teilweise_geliefert; geliefert = volle Menge
  const b411 = g.bestellungen.find((x) => x.kopf.bestellnummer === 'B-2026-0411');
  assert.equal(b411.kopf.status, 'teilweise_geliefert');
  assert.equal(b411.positionen.find((p) => p.bezeichnung.startsWith('FI/LS')).menge_geliefert, 500);
  assert.equal(b411.positionen[0].menge_geliefert, 0);             // teilgeliefert ohne Menge
  assert.match(b411.kopf.notizen, /teilgeliefert, gelieferte Menge unbekannt/);
  assert.ok(b411.warnungen.some((w) => /Ungewöhnlich hoher Positionswert/.test(w.meldung)));   // 187.500 €

  // 0417: 1.000 Installationstester -> 1,89 Mio. als Warnung, aber uebernommen
  const b417 = g.bestellungen.find((x) => x.kopf.bestellnummer === 'B-2026-0417');
  assert.equal(b417.positionen[0].menge, 1000);
  assert.ok(b417.warnungen.some((w) => /1\.890\.000,00 €/.test(w.meldung)));
  // Meterware mit Artikel: Einheit kommt vom Artikel, nicht in die Bezeichnung
  const b414 = g.bestellungen.find((x) => x.kopf.bestellnummer === 'B-2026-0414');
  assert.equal(b414.positionen[0].artikel_id, 'a2');
  assert.equal(b414.positionen[0].bezeichnung, 'Mantelleitung NYM-J 5x1,5 mm², Meterware (Trommel)');
  assert.equal(b414.positionen[0].menge, 1000);
  assert.equal(b414.positionen[0].einzelpreis, 1.12);

  // Datenbank-Saetze: keine Hilfsfelder, Positionen mit Fremdschluessel
  const kopf = kopfFuerDatenbank(b410.kopf);
  assert.ok(!Object.keys(kopf).some((k) => k.startsWith('__') || k === 'extra'));
  assert.deepEqual(Object.keys(positionFuerDatenbank(p1, 'b1')).sort(), ['artikel_id', 'bestellung_id', 'bezeichnung', 'einzelpreis', 'menge', 'menge_geliefert', 'position']);
  assert.equal(positionFuerDatenbank(p1, 'b1').bestellung_id, 'b1');
});

test('Bestellungen: Lieferant verknuepft ueber Name, Nummer oder E-Mail', () => {
  const idx = baueKundenIndex(verweisAusLieferanten([
    { id: 'l1', name: 'Vollmann Licht- und Systemtechnik', lieferantennummer: 'LF-010', email: 'info@vollmann.example' },
    { id: 'l2', name: 'Ladepunkt Süd GmbH' },
  ]));
  const z = ziel('bestellungen');
  assert.equal(z.kundeVerweis.quelle, 'lieferanten');
  assert.equal(verknuepfeKunde({ __kunde: 'Vollmann Licht- und Systemtechnik', bestellnummer: 'x' }, z.kundeVerweis, idx).satz.lieferant_id, 'l1');
  assert.equal(verknuepfeKunde({ __kunde: 'LF-010' }, z.kundeVerweis, idx).satz.lieferant_id, 'l1');
  assert.equal(verknuepfeKunde({ __kunde: 'ladepunkt süd gmbh' }, z.kundeVerweis, idx).satz.lieferant_id, 'l2');
  assert.equal(verknuepfeKunde({ __kunde: 'Unbekannt AG' }, z.kundeVerweis, idx).treffer.art, 'keiner');
});

test('Bestellungen: verschiedene Lieferanten unter einer Nummer -> ganze Bestellung mit Grund raus', () => {
  const { b } = datei('Bestellnummer;Lieferant;Bezeichnung;Menge;Einzelpreis\r\nB-1;Firma A;Schraube;10;1,00\r\nB-1;Firma B;Mutter;5;0,50\r\nB-2;Firma A;Dübel;100;0,10\r\n', 'bestellungen');
  const g = gruppiereBestellungen(b.saetze, b.zeilenNummern);
  assert.equal(g.bestellungen.length, 1);
  assert.equal(g.abgelehnt.length, 1);
  assert.deepEqual(g.abgelehnt[0].zeilen, [2, 3]);
  assert.match(g.abgelehnt[0].grund, /2 verschiedene Lieferanten/);
});

test('Bestellungen: Preis aus Gesamt, Abweichung gemeldet, geliefert-Menge aus der Datei, leere Menge ist Fehler', () => {
  const { b } = datei('Bestellnummer;Bezeichnung;Menge;Einzelpreis;Gesamt netto;Geliefert;Status\r\n'
    + 'B-9;Kabel;10;;25,00;;bestellt\r\n'
    + 'B-9;Dose;4;2,00;9,00;;bestellt\r\n'
    + 'B-9;Rohr;6;1,00;6,00;2;teilgeliefert\r\n'
    + 'B-9;Leer;;1,00;;;bestellt\r\n', 'bestellungen');
  assert.equal(b.gut, 3);
  assert.ok(b.fehler.some((f) => f.zeile === 5 && /Pflichtfeld/.test(f.meldung)));
  const g = gruppiereBestellungen(b.saetze, b.zeilenNummern);
  const [k] = g.bestellungen;
  assert.equal(k.positionen[0].einzelpreis, 2.5);
  assert.ok(k.warnungen.some((w) => /aus Gesamt 25,00 €/.test(w.meldung)));
  assert.ok(k.warnungen.some((w) => /Gesamt 9,00 € passt nicht/.test(w.meldung)));
  assert.equal(k.positionen[2].menge_geliefert, 2);
  assert.equal(k.kopf.status, 'teilweise_geliefert');
  assert.ok(!k.warnungen.some((w) => /gelieferte Menge fehlt/.test(w.meldung)));   // Menge steht da
  assert.equal(HOHER_POSITIONSWERT, 100000);
});

test('Artikel-Index: doppelte Artikelnummer -> keine Verknuepfung (nie raten)', () => {
  const idx = baueArtikelIndex([{ id: 'a', artikelnummer: 'X-1' }, { id: 'b', artikelnummer: 'x-1' }, { id: 'c', artikelnummer: 'Y-2' }]);
  assert.equal(idx.get('x-1'), undefined);
  assert.equal(idx.get('y-2').id, 'c');
});

test('Unbekannte Spalte in Bestellungen -> Eigenes Feld (Modul bestellungen)', () => {
  const { map, z } = datei('Bestellnummer;Bezeichnung;Menge;Kostenstelle\r\nB-1;X;1;4711\r\n', 'bestellungen');
  assert.equal(map['Kostenstelle'], EIGEN);
  assert.equal(z.eigeneFelderModul, 'bestellungen');
  assert.equal(zielDef('bestellungen').kinder.tabelle, 'bestellpositionen');
});

test('Seite: Bestellungen eigener Weg, Verweis-Lader fuer alle Quellen, Rueckgaengig nimmt Positionen mit', () => {
  const s = lies('app/dashboard/import/page.tsx');
  assert.match(s, /if \(ziel\.kinder\) \{ await importiereMitPositionen\(\); return; \}/);
  assert.match(s, /quelle === 'mitarbeiter'/);
  assert.match(s, /istPersonalnummerLabel/);
  assert.match(s, /quelle === 'lieferanten'/);
  assert.match(s, /z\.kinder\.tabelle\)\.delete\(\)\.in\(z\.kinder\.fremdschluessel/);
  assert.match(s, /keine halbe Bestellung/);
  assert.doesNotMatch(s, /Bitte zuerst die Kunden importieren/);
});

test('Wartung: Protokoll gehoert dem Betrieb, Rueckfall ohne SQL', () => {
  const s = lies('app/dashboard/wartung/page.tsx');
  assert.match(s, /insert\(\{ \.\.\.historie, owner_user_id: besitzer \?\? uid \}\)/);
  assert.match(s, /insert\(\{ \.\.\.historie, owner_user_id: uid \}\)/);
  assert.doesNotMatch(s, /wartungshistorie'\)\.insert\(\{\s*owner_user_id: uid,/);
});

test('Lieferanten-Akte zeigt Eigene Felder', () => {
  const s = lies('app/dashboard/erp/lieferanten/[id]/page.tsx');
  assert.match(s, /ladeFelder\("lieferanten"\)/);
  assert.match(s, /<EigeneFelderAnzeige/);
});
