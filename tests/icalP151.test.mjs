// Paket 151 (28.09.2026) — Umzug Schritt 7: iCalendar (.ics) -> neues Import-Ziel „Termine".
// Testdaten selbst gebaut nach RFC 5545 (kein Kundenmaterial).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { istIcal, leseIcal, leseZeit, leseDauer, zoneAus, berlinText } from '../out/icalLeser.js';
import { pruefeAlles, zielDef } from '../out/importParser.js';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, MOTOR_TABELLEN, EIGEN } from '../out/importMotor.js';
import { importQuellen } from '../out/importKatalog.js';
import { erkenneDatei } from '../out/umzugPlan.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Microsoft Corporation//Outlook 16.0//EN',
  'BEGIN:VTIMEZONE', 'TZID:W. Europe Standard Time', 'BEGIN:STANDARD', 'DTSTART:16011028T030000', 'END:STANDARD', 'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'UID:040000008200E00074C5B7101A82E00800000000',
  'SUMMARY:Aufmaß Bad\\, EG',
  'BEGIN:VALARM', 'TRIGGER:-PT15M', 'DESCRIPTION:Erinnerung', 'END:VALARM',
  'DTSTART;TZID="W. Europe Standard Time":20261014T083000',
  'DTEND;TZID="W. Europe Standard Time":20261014T100000',
  'LOCATION:Hauptstraße 5\\, Böblingen',
  'DESCRIPTION:Fliesen mitbringen\\nSchlüssel beim Nachbarn',
  'ORGANIZER;CN=Elektro Haldenberg:mailto:info@haldenberg.example',
  'ATTENDEE;CN="Müller: Anna";ROLE=REQ-PARTICIPANT:mailto:Anna.Mueller@kunde.example',
  'ATTENDEE;CN=Monteur Tom:mailto:tom@haldenberg.example',
  'ATTENDEE;ROLE=NON-PARTICIPANT:mailto:raum@haldenberg.example',
  'CATEGORIES:Aufmaß,Bad',
  'END:VEVENT',
  'BEGIN:VEVENT', 'UID:2', 'SUMMARY:Betriebsurlaub', 'DTSTART;VALUE=DATE:20261222', 'DTEND;VALUE=DATE:20261224', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:3', 'SUMMARY:Wartung Heizung', 'DTSTART:20260115T090000Z', 'DURATION:PT45M', 'STATUS:TENTATIVE',
  'RRULE:FREQ=YEARLY;COUNT=5', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:4', 'SUMMARY:Abgesagt', 'DTSTART;TZID=America/New_York:20260701T090000', 'DTEND;TZID=America/New_York:20260701T100000', 'STATUS:CANCELLED', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:5', 'SUMMARY:Schwebend', 'DTSTART:20260701T090000', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:6', 'SUMMARY:Feiertag', 'DTSTART;VALUE=DATE:20261003', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:7', 'SUMMARY:Fantasiezone', 'DTSTART;TZID=Mars/Olympus:20260701T090000', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:8', 'SUMMARY:Ohne Beginn', 'END:VEVENT',
  'BEGIN:VTODO', 'SUMMARY:Aufgabe', 'END:VTODO',
  'END:VCALENDAR',
].join('\r\n').replace('DESCRIPTION:Fliesen mitbringen\\nSchlüssel beim Nachbarn', 'DESCRIPTION:Fliesen mitbringen\\nSchlüssel beim\r\n  Nachbarn');

// Datenbank-Katalog wie live (28.09.2026) nachgebaut
function dbFuer(z) {
  const typ = (f) => (f.typ === 'zahl' ? 'numeric' : f.typ === 'datum' ? 'date' : f.typ === 'zeitpunkt' ? 'timestamp with time zone' : 'text');
  // Pflicht wie live: owner_user_id, titel, beginn_am, ende_am (NOT NULL ohne Standard)
  const PFLICHT = new Set(['titel', 'beginn_am', 'ende_am']);
  const cols = [{ tabelle: z.tabelle, spalte: 'id', datentyp: 'uuid' }, { tabelle: z.tabelle, spalte: 'owner_user_id', datentyp: 'uuid', pflicht: true }];
  for (const f of z.felder) if (!f.virtuell) cols.push({ tabelle: z.tabelle, spalte: f.key, datentyp: typ(f), pflicht: PFLICHT.has(f.key) });
  cols.push({ tabelle: z.tabelle, spalte: 'kontakt_id', datentyp: 'uuid' });
  for (const s of z.ausblenden ?? []) cols.push({ tabelle: z.tabelle, spalte: s, datentyp: 'text' });
  return cols.map((c) => ({ pflicht: false, ...c }));
}
const zielTermine = () => katalogFuerZiel('termine', dbFuer(zielDef('termine'))).ziel;
const zeileVon = (r, titel) => Object.fromEntries(r.kopf.map((k, i) => [k, r.zeilen.find((z) => z[0] === titel)[i]]));

test('Erkennen und Zeitbausteine', () => {
  assert.equal(istIcal('kalender.ics', ''), true);
  assert.equal(istIcal('export.txt', 'BEGIN:VCALENDAR\r\n'), true);
  assert.equal(istIcal('kunden.csv', 'Name;Mail'), false);
  assert.equal(zoneAus('W. Europe Standard Time'), 'Europe/Berlin');
  assert.equal(zoneAus('/mozilla.org/20050126_1/Europe/Berlin'), 'Europe/Berlin');
  assert.equal(zoneAus('Mars/Olympus'), null);
  assert.equal(leseDauer('PT45M'), 45 * 60000);
  assert.equal(leseDauer('P1W'), 7 * 86400000);
  assert.equal(leseDauer('P1DT2H'), 26 * 3600000);
  assert.equal(leseDauer('P'), null);
  assert.equal(berlinText(Date.UTC(2026, 0, 15, 9, 0)), '2026-01-15 10:00', 'Winter UTC+1');
  assert.equal(berlinText(Date.UTC(2026, 6, 1, 9, 0)), '2026-07-01 11:00', 'Sommer UTC+2');
  assert.equal(leseZeit({ name: 'DTSTART', params: { TZID: 'America/New_York' }, wert: '20260701T090000' }).text, '2026-07-01 15:00');
});

test('Outlook-Export: Zeitzone, Faltung, Maskierung, Teilnehmer, Kategorien, Alarm ueberspringen', () => {
  const r = leseIcal(ICS);
  assert.equal(r.anzahl, 7, 'VEVENT ohne Beginn und VTODO nicht');
  const a = zeileVon(r, 'Aufmaß Bad, EG');
  assert.equal(a.beginn_am, '2026-10-14 08:30');
  assert.equal(a.ende_am, '2026-10-14 10:00');
  assert.equal(a.ort, 'Hauptstraße 5, Böblingen');
  assert.equal(a.beschreibung, 'Fliesen mitbringen\nSchlüssel beim Nachbarn', 'VALARM-Beschreibung ueberschreibt nicht');
  assert.equal(a.kunde_email, 'anna.mueller@kunde.example');
  assert.equal(a.kunde_name, 'Müller: Anna', 'Doppelpunkt im Namen (in Anfuehrungszeichen) trennt nicht');
  assert.equal(a['Weitere Teilnehmer'], 'Monteur Tom <tom@haldenberg.example>');
  assert.equal(a.Organisator, 'Elektro Haldenberg <info@haldenberg.example>');
  assert.equal(a.Kategorien, 'Aufmaß,Bad');
  assert.equal(a.status, 'geplant');
  const u = zeileVon(r, 'Betriebsurlaub');
  assert.equal(u.beginn_am, '2026-12-22 00:00');
  assert.equal(u.ende_am, '2026-12-24 00:00', 'DTEND bei ganztags ist exklusiv');
  assert.equal(u['Ganztägig'], 'ja');
  assert.equal(zeileVon(r, 'Feiertag').ende_am, '2026-10-04 00:00', 'ganztags ohne Ende = ein Tag');
  const w = zeileVon(r, 'Wartung Heizung');
  assert.equal(w.beginn_am, '2026-01-15 10:00');
  assert.equal(w.ende_am, '2026-01-15 10:45', 'DURATION');
  assert.equal(w['Serie (Wiederholungsregel)'], 'FREQ=YEARLY;COUNT=5');
  assert.match(w.Zusage, /vorläufig/);
  assert.equal(zeileVon(r, 'Abgesagt').status, 'abgesagt');
  assert.equal(zeileVon(r, 'Abgesagt').beginn_am, '2026-07-01 15:00');
  assert.equal(zeileVon(r, 'Schwebend').beginn_am, '2026-07-01 09:00', 'ohne Zone = deutsche Zeit');
  assert.equal(zeileVon(r, 'Schwebend').ende_am, '');
  assert.equal(zeileVon(r, 'Fantasiezone').beginn_am, '2026-07-01 09:00');
  for (const h of [/1 Serientermine/, /2 ganztägige/, /1 abgesagte/, /1 vorläufige/, /1 Termine mit unbekannter Zeitzone/, /1 Einträge ohne lesbaren Beginn/, /1 Aufgaben\/Notizen/]) assert.ok(r.hinweise.some((x) => h.test(x)), String(h));
  assert.equal(leseIcal('Hallo').anzahl, 0);
  assert.ok(leseIcal('Hallo').hinweise.some((x) => /Keine iCalendar-Datei/.test(x)));
});

test('Ziel Termine: Katalog, Karte, SQL additiv, keine automatischen Mails', () => {
  const z = zielDef('termine');
  assert.equal(z.tabelle, 'termine');
  assert.ok(MOTOR_TABELLEN.includes('termine'));
  assert.equal(importQuellen().find((q) => q.key === 'termine')?.motor, 'termine');
  for (const k of ['quelle', 'bestaetigung_gesendet_am', 'erinnerung_gesendet_am', 'mitarbeiter_id']) assert.ok(z.ausblenden.includes(k), k);
  const sql = lies('supabase-sql/p151-import-termine.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].sort());
  assert.equal(whitelist.length, 73);
  assert.ok(!/\b(drop table|delete from|truncate|alter table)\b/i.test(sql));
  assert.match(sql, /revoke all on function public\.import_feldkatalog\(text\[\]\) from anon/);
});

test('Durch den Motor: Zeitpunkte, Ende-Regel, ganzer Tag, Quelle import, Mails als erledigt', () => {
  const r = leseIcal(ICS);
  const ziel = zielTermine();
  const map = vorschlagMapping(r.kopf, r.zeilen, ziel);
  for (const k of ['titel', 'beginn_am', 'ende_am', 'ort', 'beschreibung', 'kunde_email', 'kunde_name', 'status']) assert.equal(map[k], k, k);
  for (const k of r.kopf.slice(8)) assert.equal(map[k], EIGEN, `${k} -> Eigenes Feld`);
  assert.equal(spaltenBilanz(r.kopf, r.zeilen, map, ziel).verschluckt, 0);
  const b = pruefeAlles('termine', map, r.kopf, r.zeilen, { ziel });
  assert.equal(b.gut, 7);
  const t = (titel) => b.saetze.find((s) => s.titel === titel);
  assert.equal(t('Aufmaß Bad, EG').beginn_am, '2026-10-14T06:30:00.000Z');
  assert.equal(t('Aufmaß Bad, EG').ende_am, '2026-10-14T08:00:00.000Z');
  assert.equal(t('Schwebend').ende_am, '2026-07-01T08:00:00.000Z', 'ohne Ende: 1 Stunde (Datenbank verlangt ende > beginn)');
  assert.equal(t('Betriebsurlaub').ende_am, '2026-12-23T23:00:00.000Z');
  for (const s of b.saetze) {
    assert.equal(s.quelle, 'import');
    assert.ok(s.erinnerung_gesendet_am && s.bestaetigung_gesendet_am, 'keine Erinnerungs-/Bestaetigungs-Mail fuer importierte Termine');
    assert.ok(s.ende_am > s.beginn_am);
  }
  assert.equal(t('Abgesagt').status, 'abgesagt');
  assert.equal(erkenneDatei('kalender.ics', r.kopf, r.zeilen, { dbSpalten: dbFuer(zielDef('termine')) }).ziel, 'termine');
});

test('Kalender-Liste als CSV: nur Datum = ganzer Tag, Ende vor Beginn = 1 Stunde', () => {
  const kopf = ['Betreff', 'Datum', 'Ende', 'Kunde', 'Status'];
  const zeilen = [['Messe', '12.11.2026', '', 'Hr. Kurz', 'bestätigt'], ['Kaputt', '12.11.2026 10:00', '12.11.2026 09:00', '', 'storniert']];
  const ziel = zielTermine();
  const map = vorschlagMapping(kopf, zeilen, ziel);
  assert.equal(map.Datum, 'beginn_am');
  const b = pruefeAlles('termine', map, kopf, zeilen, { ziel });
  assert.equal(b.gut, 2);
  assert.equal(b.saetze[0].beginn_am, '2026-11-11T23:00:00.000Z');
  assert.equal(b.saetze[0].ende_am, '2026-11-12T23:00:00.000Z');
  assert.equal(b.saetze[1].ende_am, '2026-11-12T10:00:00.000Z');
  assert.equal(b.saetze[1].status, 'abgesagt');
  assert.ok(b.warnungen.some((w) => /ganztägiger Termin/.test(w.meldung)));
  assert.ok(b.warnungen.some((w) => /1 Stunde/.test(w.meldung)));
});

test('Seiten: Import-Center und Umzugsstapel lesen .ics', () => {
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(s.includes('} else if (istIcal(f.name, text.slice(0, 200))) {'));
  assert.ok(lies('app/dashboard/import/UmzugStapel.tsx').includes('if (istIcal(f.name, text.slice(0, 200)))'));
});
