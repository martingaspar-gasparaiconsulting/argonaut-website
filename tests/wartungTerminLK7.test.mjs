import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  vorschlagTag, berlinZuIso, terminVorschlag, hatOffenenTermin, tokenGueltig,
  bestaetigungsStand, wunschText, bestaetigungsUrl, einsatzAusTermin, kundenMailInhalt, autoTerminAn,
} from '../out/wartungTermin.js';
import { berechneNaechsteFaelligkeit, addiereMonate, alsDatumString } from '../out/wartungsLogik.js';

// ===========================================================================
// LK7 (16.10.2026) — Wartung legt Termine selbst an
// ===========================================================================

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345'; // 32 Zeichen
const V = { id: 'v1', owner_user_id: 'o1', titel: 'Heizung Halle 2', kunde_name: 'Huber GmbH', kontakt_id: 'k1', vertragsnummer: 'WV-7' };

test('berechneNaechsteFaelligkeit: letzte Wartung + Intervall, sonst Beginn; rollt vor bis heute', () => {
  const heute = new Date(2026, 9, 16);
  assert.equal(alsDatumString(berechneNaechsteFaelligkeit({ letzte_wartung_am: '2026-05-01', intervall_monate: 6 }, heute)), '2026-11-01');
  assert.equal(alsDatumString(berechneNaechsteFaelligkeit({ beginn_am: '2026-01-10', intervall_monate: 12 }, heute)), '2027-01-10');
  // lange nicht gewartet: rollt vor, bleibt nicht in der Vergangenheit
  assert.equal(alsDatumString(berechneNaechsteFaelligkeit({ letzte_wartung_am: '2020-03-01', intervall_monate: 12 }, heute)), '2027-03-01');
  // kein Intervall -> 12
  assert.equal(alsDatumString(berechneNaechsteFaelligkeit({ letzte_wartung_am: '2026-02-01' }, heute)), '2027-02-01');
  assert.equal(berechneNaechsteFaelligkeit({}, heute), null);
  // Monatsende: 31.01. + 1 = 28.02.
  assert.equal(alsDatumString(addiereMonate(new Date(2026, 0, 31), 1)), '2026-02-28');
});

test('vorschlagTag: Faelligkeit, frühestens übermorgen, Wochenende -> Montag', () => {
  assert.equal(vorschlagTag('2026-10-28', '2026-10-16'), '2026-10-28'); // Mittwoch
  assert.equal(vorschlagTag('2026-10-10', '2026-10-16'), '2026-10-19'); // ueberfaellig -> 18. (So) -> Mo 19.
  assert.equal(vorschlagTag('2026-10-24', '2026-10-16'), '2026-10-26'); // Samstag -> Montag
  assert.equal(vorschlagTag('2026-10-25', '2026-10-16'), '2026-10-26'); // Sonntag -> Montag
  assert.equal(vorschlagTag(null, '2026-10-14'), '2026-10-16');
  assert.equal(vorschlagTag('2026-02-30', '2026-10-14'), '2026-10-16'); // kaputtes Datum -> frueheste
  assert.equal(vorschlagTag('x', 'kaputt'), null);
});

test('berlinZuIso: Sommer- und Winterzeit richtig', () => {
  assert.equal(berlinZuIso('2026-07-01', '09:00'), '2026-07-01T07:00:00.000Z');
  assert.equal(berlinZuIso('2026-12-01', '09:00'), '2026-12-01T08:00:00.000Z');
  assert.equal(berlinZuIso('2026-10-26', '09:00'), '2026-10-26T08:00:00.000Z'); // Tag nach Umstellung
  assert.equal(berlinZuIso('2026-03-30', '09:00'), '2026-03-30T07:00:00.000Z');
  assert.equal(berlinZuIso('2026-13-01', '09:00'), null);
});

test('terminVorschlag: Zeile mit Vertrag, Token, Kunde; ohne gueltigen Token nichts', () => {
  const z = terminVorschlag(V, '2026-10-28', '2026-10-16', TOKEN, 'huber@example.de');
  assert.equal(z.wartungsvertrag_id, 'v1');
  assert.equal(z.bestaetigung_token, TOKEN);
  assert.equal(z.owner_user_id, 'o1');
  assert.equal(z.kontakt_id, 'k1');
  assert.equal(z.kunde_email, 'huber@example.de');
  assert.equal(z.status, 'geplant');
  assert.equal(z.titel, 'Wartung: Heizung Halle 2');
  assert.equal(z.beginn_am, '2026-10-28T08:00:00.000Z');
  assert.equal(z.ende_am, '2026-10-28T09:00:00.000Z');
  assert.match(z.notiz, /WV-7/);
  assert.equal(terminVorschlag(V, '2026-10-28', '2026-10-16', 'kurz', null), null);
  assert.equal(terminVorschlag(V, '2026-10-28', '2026-10-16', TOKEN, null).kunde_email, null);
});

test('Doppelschutz: offener Termin desselben Vertrags zaehlt, abgesagte/alte/fremde nicht', () => {
  const jetzt = new Date('2026-10-16T08:00:00Z');
  assert.equal(hatOffenenTermin([{ wartungsvertrag_id: 'v1', beginn_am: '2026-10-28T08:00:00Z', status: 'geplant' }], 'v1', jetzt), true);
  assert.equal(hatOffenenTermin([{ wartungsvertrag_id: 'v1', beginn_am: '2026-10-28T08:00:00Z', status: 'abgesagt' }], 'v1', jetzt), false);
  assert.equal(hatOffenenTermin([{ wartungsvertrag_id: 'v1', beginn_am: '2026-09-01T08:00:00Z', status: 'geplant' }], 'v1', jetzt), false);
  assert.equal(hatOffenenTermin([{ wartungsvertrag_id: 'v2', beginn_am: '2026-10-28T08:00:00Z', status: 'geplant' }], 'v1', jetzt), false);
  assert.equal(hatOffenenTermin([], 'v1', jetzt), false);
});

test('Token, Stand, Wunsch, Link', () => {
  assert.equal(tokenGueltig(TOKEN), true);
  assert.equal(tokenGueltig('a'.repeat(23)), false);
  assert.equal(tokenGueltig("abc'; drop table--abcdefghijk"), false);
  assert.equal(tokenGueltig(null), false);
  const jetzt = new Date('2026-10-16T08:00:00Z');
  assert.equal(bestaetigungsStand({ beginn_am: '2026-10-28T08:00:00Z', status: 'geplant' }, jetzt), 'offen');
  assert.equal(bestaetigungsStand({ beginn_am: '2026-10-28T08:00:00Z', kunde_bestaetigt_am: '2026-10-17T10:00:00Z' }, jetzt), 'bestaetigt');
  assert.equal(bestaetigungsStand({ beginn_am: '2026-10-01T08:00:00Z' }, jetzt), 'vorbei');
  assert.equal(bestaetigungsStand({ beginn_am: '2026-10-28T08:00:00Z', status: 'abgesagt', kunde_bestaetigt_am: 'x' }, jetzt), 'abgesagt');
  assert.equal(wunschText('  Di\n\nab 14 Uhr  '), 'Di ab 14 Uhr');
  assert.equal(wunschText('x'.repeat(900)).length, 500);
  assert.equal(bestaetigungsUrl('https://argonaut-os.com/', TOKEN), `https://argonaut-os.com/wartungstermin/${TOKEN}`);
  assert.equal(autoTerminAn({}), true);
  assert.equal(autoTerminAn({ termin_auto: null }), true);
  assert.equal(autoTerminAn({ termin_auto: false }), false);
});

test('Einsatz aus Termin: Owner von aussen, Felder wie Termin → Einsatz', () => {
  const e = einsatzAusTermin({ id: 't1', owner_user_id: 'fremd', titel: 'Wartung: X', notiz: 'n', beginn_am: 'b', ende_am: 'e', ort: 'Halle', kontakt_id: 'k1', kunde_name: 'Huber' }, 'o1');
  assert.equal(e.owner_user_id, 'o1');
  assert.equal(e.termin_id, 't1');
  assert.equal(e.einsatzort, 'Halle');
  assert.equal(e.beschreibung, 'n');
  assert.equal(e.status, 'geplant');
  assert.equal(e.quelle, 'termin');
});

test('Kunden-Mail: gesiezt, Namen maskiert, Link drin', () => {
  const h = kundenMailInhalt({ kundeName: '<b>Huber</b>', betrieb: 'Muster & Söhne', vertragTitel: 'Heizung', beginnIso: '2026-10-28T08:00:00Z', endeIso: '2026-10-28T09:00:00Z', link: `https://x.de/wartungstermin/${TOKEN}`, akzent: '#c9a84c' });
  assert.match(h, /&lt;b&gt;Huber&lt;\/b&gt;/);
  assert.match(h, /Muster &amp; Söhne/);
  assert.match(h, /Bitte bestätigen Sie/);
  assert.match(h, /09:00–10:00 Uhr/);
  assert.ok(h.includes(`/wartungstermin/${TOKEN}`));
  assert.doesNotMatch(h, /\bdu\b|\bdein/i);
});

test('WAECHTER: Termin → Einsatz und Kunden-Bestaetigung nutzen dieselbe Feldbelegung', () => {
  const a = fs.readFileSync('app/api/termin-zu-einsatz/route.ts', 'utf8');
  const b = fs.readFileSync('app/api/oeffentlich/wartung-termin/route.ts', 'utf8');
  assert.ok(a.includes('einsatzAusTermin('));
  assert.ok(b.includes('einsatzAusTermin('));
  assert.ok(!a.includes('const neuerEinsatz: any = {'), 'zweite Feldbelegung in termin-zu-einsatz');
});

test('WAECHTER: Cron laeuft vor dem SQL (select * + Spalten-Probe), Bestaetigen nur einmal', () => {
  const c = fs.readFileSync('app/api/wartung-erinnerung/route.ts', 'utf8');
  assert.ok(c.includes(".from('wartungsvertraege')") && c.includes(".select('*')"));
  assert.ok(c.includes('autoMoeglich'));
  assert.ok(c.includes('hatOffenenTermin('));
  const b = fs.readFileSync('app/api/oeffentlich/wartung-termin/route.ts', 'utf8');
  assert.ok(b.includes(".is('kunde_bestaetigt_am', null)"), 'Doppel-Bestaetigung nicht abgefangen');
  const w = fs.readFileSync('app/dashboard/wartung/page.tsx', 'utf8');
  assert.ok(w.includes('autoSpalte ? { termin_auto'), 'termin_auto wird ohne Spalte mitgeschickt');
});
