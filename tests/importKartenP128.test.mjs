// Umzug Schritt 3 · Paket 128 (27.09.2026) — 15 Karten, die bisher nur eine
// Vorlage hatten, laufen durch den Import-Motor: Objekte (mit Gruppe),
// Pruefprotokolle (mit Objekt), BDE, Chargen, Expose (nie direkt aktiv),
// Kurse, Veranstaltungen (Datum + Uhrzeit), Plaetze, Belegung, Erinnerungen,
// Gutachten, Schlaege, Tierbestand, Energie-Anlagen, Freigaben.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  katalogFuerZiel, vorschlagMapping, spaltenBilanz, erkennungsFelder, MOTOR_TABELLEN, EIGEN,
  nachschlagIndex, fehlendeNamen, loeseNachschlag,
} from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage, leseDatumZeit, plusMonate, ZIELE } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));

const NEU = ['objekte', 'pruefprotokolle', 'bde', 'chargen', 'expose', 'kurse', 'veranstaltungen', 'reservierung_plaetze',
  'belegung', 'erinnerungen', 'gutachten', 'schlaege', 'tiergruppen', 'ertraege', 'freigaben'];
const VORLAGE = {
  objekte: 'objekte-import-vorlage.csv', pruefprotokolle: 'pruefprotokolle-import-vorlage.csv', bde: 'bde-maschinen-import-vorlage.csv',
  chargen: 'chargen-import-vorlage.csv', expose: 'expose-import-vorlage.csv', kurse: 'kurse-import-vorlage.csv',
  veranstaltungen: 'veranstaltungen-import-vorlage.csv', reservierung_plaetze: 'reservierung-plaetze-import-vorlage.csv',
  belegung: 'belegung-import-vorlage.csv', erinnerungen: 'erinnerungen-import-vorlage.csv', gutachten: 'gutachten-import-vorlage.csv',
  schlaege: 'schlaege-import-vorlage.csv', tiergruppen: 'tiergruppen-import-vorlage.csv', ertraege: 'ertraege-anlagen-import-vorlage.csv',
  freigaben: 'freigaben-assets-import-vorlage.csv',
};

/** Datenbank-Spalten so, wie das Modul sie schreibt (aus den Feldern des Ziels). */
function dbFuer(z) {
  const typ = (f) => (f.typ === 'zahl' ? 'numeric' : f.typ === 'datum' ? 'date' : f.typ === 'datumZeit' ? 'timestamp without time zone' : f.typ === 'jaNein' ? 'boolean' : 'text');
  const cols = [{ tabelle: z.tabelle, spalte: 'id', datentyp: 'uuid', pflicht: false }, { tabelle: z.tabelle, spalte: 'owner_user_id', datentyp: 'uuid', pflicht: false }];
  for (const f of z.felder) if (!f.virtuell) cols.push({ tabelle: z.tabelle, spalte: f.key, datentyp: typ(f), pflicht: false });
  if (z.nachschlag) cols.push({ tabelle: z.tabelle, spalte: z.nachschlag.spalte, datentyp: 'uuid', pflicht: false });
  return cols;
}
const ziel = (k) => { const z = zielDef(k); return katalogFuerZiel(k, dbFuer(z)).ziel; };
function datei(text, k) {
  const t = leseCsv(text);
  const z = ziel(k);
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  const b = pruefeAlles(k, map, t.kopf, t.zeilen, { ziel: z, heute: HEUTE });
  return { t, z, map, b, bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 128: 15 neue Ziele, Karten zeigen auf den Motor, SQL-Whitelist = Motor-Tabellen (35)', () => {
  for (const k of NEU) {
    const z = zielDef(k);
    assert.ok(z, k);
    assert.equal(z.nurMitKatalog, true, k);
    assert.ok(MOTOR_TABELLEN.includes(z.tabelle), z.tabelle);
    const karte = importQuellen().find((q) => q.key === k);
    assert.equal(karte?.motor, k, `Karte ${k}`);
  }
  const sql = lies('supabase-sql/p128-import-karten1.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  // Paket 129 erweitert weiter — p128 ist der Stand bis dahin (die ersten 35).
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].slice(0, 35).sort());
  assert.equal(whitelist.length, 35);
  assert.match(sql, /revoke all on function public\.import_feldkatalog\(text\[\]\) from anon/);
  assert.doesNotMatch(sql, /\b(drop table|delete from|truncate|drop policy|update public)\b/i);
  // Ziel-Schluessel sind eindeutig
  assert.equal(new Set(ZIELE.map((z) => z.key)).size, ZIELE.length);
});

test('Jede alte Vorlage wird vollstaendig erkannt — keine Spalte als Eigenes Feld, nichts verschluckt', () => {
  for (const k of NEU) {
    const text = lies(`public/vorlagen/${VORLAGE[k]}`);
    const { t, map, bil } = datei(text, k);
    assert.equal(bil.verschluckt, 0, k);
    const eigen = t.kopf.filter((s) => map[s] === EIGEN);
    assert.deepEqual(eigen, [], `${k}: ${eigen.join(', ')}`);
    const nicht = t.kopf.filter((s) => !map[s]);
    assert.deepEqual(nicht, [], `${k}: nicht zugeordnet ${nicht.join(', ')}`);
  }
});

test('Jede neue Mustervorlage passt auf ihr eigenes Ziel (Rundreise)', () => {
  for (const k of NEU) {
    const { t, map, bil } = datei(baueMustervorlage(k), k);
    assert.equal(bil.verschluckt, 0, k);
    assert.ok(t.kopf.every((s) => map[s] && map[s] !== EIGEN), `${k}: ${t.kopf.filter((s) => !map[s] || map[s] === EIGEN)}`);
  }
});

test('Objekte: Typ/Zustand uebersetzt, naechste Kontrolle gerechnet, Gruppe gemerkt', () => {
  const { b } = datei('Bezeichnung;Typ;Gruppe;Zustand;Kontrollintervall;Letzte Kontrolle;Kennung\r\n'
    + 'Hebebühne 1;Maschine;Halle 2;OK;12;31.01.2026;HB-01\r\n'
    + 'Feuerlöscher Flur;Löscher;;schlecht;24;15.03.2025;FL-7\r\n'
    + 'Kran;Portalkran;Halle 2;gut;;;\r\n', 'objekte');
  assert.equal(b.gut, 3);
  const [a, f, k] = b.saetze;
  assert.equal(a.typ, 'maschine');
  assert.equal(a.zustand, 'gut');
  assert.equal(a.naechste_kontrolle, '2027-01-31');
  assert.equal(a.__nach, 'Halle 2');
  assert.equal(a.gruppe, undefined);
  assert.equal(f.typ, 'feuerloescher');
  assert.equal(f.zustand, 'kritisch');
  assert.equal(f.naechste_kontrolle, '2027-03-15');
  assert.equal(k.typ, 'sonstiges');
  assert.match(k.notiz, /Typ im Altsystem: Portalkran/);
  assert.equal(k.kontrollintervall_monate, 12);
  assert.equal(k.naechste_kontrolle, undefined);   // ohne letzte Kontrolle nichts erfunden
  assert.deepEqual(erkennungsFelder(ziel('objekte')), ['kennung', 'bezeichnung+standort']);
});

test('Nachschlag: vorhandene Gruppe verknuepft, fehlende einmal angelegt, mehrdeutig nie', () => {
  const idx = nachschlagIndex([{ id: 'g1', bezeichnung: 'Halle 2' }, { id: 'g2', bezeichnung: 'Büro' }, { id: 'g3', bezeichnung: 'büro' }], 'bezeichnung');
  assert.equal(idx.get('halle 2'), 'g1');
  assert.equal(idx.get('büro'), undefined);
  assert.deepEqual(fehlendeNamen([{ __nach: 'Halle 2' }, { __nach: 'Lager' }, { __nach: 'lager' }, {}], idx), ['Lager']);
  const n = zielDef('objekte').nachschlag;
  const r1 = loeseNachschlag({ bezeichnung: 'X', __nach: 'halle 2' }, n, idx, true);
  assert.equal(r1.satz.gruppe_id, 'g1');
  assert.equal(r1.satz.__nach, undefined);
  const r2 = loeseNachschlag({ bezeichnung: 'X', notiz: 'alt', __nach: 'Werkstatt' }, n, idx, true);
  assert.equal(r2.gefunden, false);
  assert.equal(r2.satz.notiz, 'alt\nGruppe: Werkstatt');
  assert.equal(r2.satz.gruppe_id, undefined);
  // echtes Feld (Pruefprotokoll: objekt_bezeichnung) -> kein doppelter Text
  const np = zielDef('pruefprotokolle').nachschlag;
  const r3 = loeseNachschlag({ objekt_bezeichnung: 'Leiter 3', __nach: 'Leiter 3' }, np, new Map(), false);
  assert.equal(r3.satz.bemerkung, undefined);
  assert.equal(r3.satz.objekt_bezeichnung, 'Leiter 3');
  // auch mit Textfeld: ein echtes Namensfeld wird nicht noch einmal in den Text geschrieben
  const r4 = loeseNachschlag({ bezeichnung: 'X', __nach: 'Werkstatt' }, n, idx, false);
  assert.equal(r4.satz.notiz, undefined);
  // ohne Index (Spalte fehlt): Name im Text
  assert.equal(loeseNachschlag({ __nach: 'Halle 9' }, n, null, true).satz.notiz, 'Gruppe: Halle 9');
});

test('Pruefprotokolle: Ergebnis uebersetzt, naechste Pruefung gerechnet, Objekt zum Verknuepfen', () => {
  const { b } = datei('Objekt;Prüfart;Datum;Intervall;Ergebnis\r\nLeiter 3;Leiterprüfung;10.02.2026;12;i.O.\r\nBohrmaschine;DGUV V3;01.03.2026;6;n.i.O.\r\nRegal A;Regalprüfung;05.05.2026;;mit Mängeln\r\n', 'pruefprotokolle');
  assert.equal(b.gut, 3);
  assert.equal(b.saetze[0].ergebnis, 'bestanden');
  assert.equal(b.saetze[0].naechste_pruefung, '2027-02-10');
  assert.equal(b.saetze[0].__nach, 'Leiter 3');
  assert.equal(b.saetze[1].ergebnis, 'durchgefallen');
  assert.equal(b.saetze[1].naechste_pruefung, '2026-09-01');
  assert.equal(b.saetze[2].ergebnis, 'maengel');
  assert.equal(b.saetze[2].naechste_pruefung, undefined);
  const ohneDatum = datei('Objekt;Prüfart\r\nX;Y\r\n', 'pruefprotokolle').b;
  assert.equal(ohneDatum.gut, 0);
});

test('Expose kommt nie direkt „aktiv" (Pflichtangaben erst pruefen)', () => {
  const { b } = datei('Bezeichnung;Objektart;Vermarktung;Status;Energieausweis;Preis\r\nETW Mitte;Eigentumswohnung;Verkauf;aktiv;Bedarfsausweis;349.000\r\nHalle Süd;Lagerhalle;Vermietung;reserviert;;2.500\r\n', 'expose');
  assert.equal(b.saetze[0].status, 'entwurf');
  assert.equal(b.saetze[0].objekt_art, 'wohnung');
  assert.equal(b.saetze[0].vermarktung_art, 'kauf');
  assert.equal(b.saetze[0].energie_typ, 'bedarf');
  assert.equal(b.saetze[0].preis, 349000);
  assert.equal(b.saetze[1].status, 'reserviert');
  assert.equal(b.saetze[1].objekt_art, 'wohnung');           // unbekannt -> Standard …
  assert.match(b.saetze[1].objekt_text, /Objektart im Altsystem: Lagerhalle/);   // … alter Wert bleibt
  assert.equal(b.saetze[1].vermarktung_art, 'miete');
});

test('Veranstaltungen: Datum mit Uhrzeit wie im Modul, Status und Art', () => {
  assert.equal(leseDatumZeit('12.10.2026 18:00'), '2026-10-12T18:00');
  assert.equal(leseDatumZeit('2026-10-12 9:30:00'), '2026-10-12T09:30');
  assert.equal(leseDatumZeit('2026-10-12T19:45'), '2026-10-12T19:45');
  assert.equal(leseDatumZeit('12.10.2026, 20.15 Uhr'), '2026-10-12T20:15');
  assert.equal(leseDatumZeit('12.10.2026'), '2026-10-12');
  assert.equal(leseDatumZeit('12.10.2026 25:00'), null);
  assert.equal(leseDatumZeit('bald'), null);
  const { b } = datei('Titel;Art;Beginn;Ende;Kapazität;Preis;Status\r\nHerbstfest;Feier;03.10.2026 14:00;03.10.2026 22:00;200;12,50;buchbar\r\nLesung;Lesung;kommt noch;;40;0;geplant\r\n', 'veranstaltungen');
  assert.equal(b.saetze[0].beginn, '2026-10-03T14:00');
  assert.equal(b.saetze[0].ende, '2026-10-03T22:00');
  assert.equal(b.saetze[0].art, 'fest');
  assert.equal(b.saetze[0].status, 'aktiv');
  assert.equal(b.saetze[0].preis, 12.5);
  assert.equal(b.saetze[1].art, 'vortrag');
  assert.equal(b.saetze[1].beginn, undefined);
  assert.ok(b.warnungen.some((w) => /kommt noch/.test(w.meldung)));
});

test('Wertelisten der uebrigen Ziele', () => {
  const c = datei('Charge;Typ;Status;MHD\r\nL-26-001;Los;Quarantäne;31.12.2026\r\nS-9;Seriennummer;frei;\r\n', 'chargen').b;
  assert.deepEqual([c.saetze[0].typ, c.saetze[0].status, c.saetze[0].mhd], ['charge', 'quarantaene', '2026-12-31']);
  assert.deepEqual([c.saetze[1].typ, c.saetze[1].status], ['serie', 'freigegeben']);
  const m = datei('Bezeichnung;Maschinennummer;Taktzeit;Status\r\nCNC 1;M-01;42;in Wartung\r\n', 'bde').b;
  assert.deepEqual([m.saetze[0].maschinen_nr, m.saetze[0].ideal_takt_sek, m.saetze[0].status], ['M-01', 42, 'wartung']);
  const k = datei('Titel;Art;Beginn;Plätze;Zertifikat\r\nErste Hilfe;Kursreihe;01.11.2026;12;ja\r\n', 'kurse').b;
  assert.deepEqual([k.saetze[0].art, k.saetze[0].start_am, k.saetze[0].plaetze, k.saetze[0].zertifikat_aktiv], ['serie', '2026-11-01', 12, true]);
  const bel = datei('Bezeichnung;Abrechnung;Preis;MwSt\r\nFewo Seeblick;pro Nacht;95,00;\r\nRaum 2;stündlich;30;19\r\n', 'belegung').b;
  assert.deepEqual([bel.saetze[0].abrechnungsart, bel.saetze[0].mwst_satz, bel.saetze[0].status], ['nacht', 7, 'aktiv']);
  assert.equal(bel.saetze[1].abrechnungsart, 'stunde');
  const e = datei('Titel;Kanal;Fällig am;Status\r\nRückruf Müller;Anruf;01.10.2026;\r\nAngebot nachfassen;Mail;02.10.2026;erledigt\r\n', 'erinnerungen').b;
  assert.deepEqual([e.saetze[0].kanal, e.saetze[0].status, e.saetze[0].bezug_typ], ['telefon', 'offen', 'frei']);
  assert.deepEqual([e.saetze[1].kanal, e.saetze[1].status], ['email', 'erledigt']);
  assert.ok(!ziel('erinnerungen').felder.some((f) => f.key === 'email'), 'keine E-Mail-Adressen fuer den Versand aus Dateien');
  const g = datei('Titel;Aktenzeichen;Status\r\nWertgutachten;AZ-1;abgeschlossen\r\n', 'gutachten').b;
  assert.equal(g.saetze[0].status, 'fertig');
  const t = datei('Tierart;Bezeichnung;Bestand\r\nMilchkühe;Stall Nord;48\r\nAlpakas;Weide;5\r\n', 'tiergruppen').b;
  assert.deepEqual([t.saetze[0].tierart, t.saetze[0].aktueller_bestand, t.saetze[0].meldefrist_tage, t.saetze[0].status], ['rind', 48, 7, 'aktiv']);
  assert.equal(t.saetze[1].tierart, 'sonstige');
  assert.match(t.saetze[1].notiz, /Tierart im Altsystem: Alpakas/);
  const s = datei('Schlag;Fläche ha;Kultur;Status\r\nAm Bach;4,25;Winterweizen;stillgelegt\r\n', 'schlaege').b;
  assert.deepEqual([s.saetze[0].flaeche_ha, s.saetze[0].status], [4.25, 'aktiv']);
  assert.match(s.saetze[0].notiz, /Status im Altsystem: stillgelegt/);
  const en = datei('Anlage;Typ;Leistung;Vergütung;Status\r\nDach Halle;Photovoltaik;29,9;8,2;in Betrieb\r\n', 'ertraege').b;
  assert.deepEqual([en.saetze[0].typ, en.saetze[0].nennleistung_kwp, en.saetze[0].verguetung_ct, en.saetze[0].status], ['pv', 29.9, 8.2, 'aktiv']);
  const f = datei('Titel;Kunde;Kategorie\r\nFlyer Herbst;Bäckerei Kranz;Flyer\r\n', 'freigaben').b;
  assert.equal(f.saetze[0].kategorie, 'print');
  const p = datei('Bezeichnung;Art;Kapazität;Status\r\nTisch 4;Sitzplatz;4;gesperrt\r\n', 'reservierung_plaetze').b;
  assert.deepEqual([p.saetze[0].art, p.saetze[0].status], ['tisch', 'aktiv']);
  assert.match(p.saetze[0].notiz, /Status im Altsystem: gesperrt/);
});

test('plusMonate rechnet wie das Modul (Monatsende bleibt im Monat)', () => {
  assert.equal(plusMonate('2026-01-31', 1), '2026-02-28');
  assert.equal(plusMonate('2024-01-31', 1), '2024-02-29');
  assert.equal(plusMonate('2026-11-15', 3), '2027-02-15');
});

test('Ohne SQL p128: Ziel ohne Felder, Karte fuehrt nicht halb in den Import', () => {
  assert.equal(katalogFuerZiel('objekte', []).ziel.felder.length, 0);
  const s = lies('app/dashboard/import/page.tsx');
  assert.match(s, /if \(z\?\.nurMitKatalog && dbSpalten !== null && !dbSpalten\.some/);
  assert.match(s, /nachschlagIndex\(await allesLaden\(nach\.tabelle/);
  assert.match(s, /loeseNachschlag\(/);
});

test('Eigene Felder landen im Modul-Schluessel der Seite (sichtbar, wo die Seite sie zeigt)', () => {
  const seite = { objekte: 'objekte', pruefprotokolle: 'pruefprotokolle', chargen: 'chargen', expose: 'expose', veranstaltungen: 'veranstaltungen', erinnerungen: 'erinnerungen', gutachten: 'gutachten', schlaege: 'schlagkartei', tiergruppen: 'tierbestand', ertraege: 'ertraege' };
  for (const [k, ordner] of Object.entries(seite)) {
    const modul = lies(`app/dashboard/${ordner}/page.tsx`).match(/MODUL = ['"]([a-z_]+)['"]/)[1];
    assert.equal(zielDef(k).eigeneFelderModul, modul, k);
  }
  for (const k of NEU) assert.ok(zielDef(k).eigeneFelderModul, k);
});
