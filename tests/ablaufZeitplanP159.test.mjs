// Paket 159 (28.09.2026) — Abläufe: Auslöser Zeitplan und Knopf (ohne Vorgang), gemeinsamer Ausführer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { zeitplanSlot, slotKennung } from '../out/ablaufZeit.js';
import { pruefeAblauf, ausloeserHatVorgang, ausloeserText, fahrplan, AUSLOESER_ARTEN } from '../out/ablauf.js';
import { aktionenFuer, neuerAusloeser } from '../out/ablaufEditor.js';
import { aktionPlanen, laufbereit, OHNE_VORGANG } from '../out/ablaufMotor.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// Montag 28.09.2026: 07:30 Berlin = 05:30 UTC (Sommerzeit)
const MO_0730 = new Date('2026-09-28T05:30:00Z');
const MO_0630 = new Date('2026-09-28T04:30:00Z');

test('Zeitplan: täglich ab der Uhrzeit (Berliner Zeit), vorher nicht', () => {
  const t = { art: 'zeitplan', rhythmus: 'taeglich', uhrzeit: '07:00' };
  assert.equal(zeitplanSlot(t, MO_0730), '2026-09-28 07:00');
  assert.equal(zeitplanSlot(t, MO_0630), null);
  assert.equal(zeitplanSlot(t, new Date('2026-09-28T21:59:00Z')), '2026-09-28 07:00', 'spät am Tag holt nach');
  assert.equal(zeitplanSlot(t, new Date('2026-09-28T22:30:00Z')), null, '00:30 Berlin am 29. ist vor 07:00');
  // Winterzeit: 07:00 Berlin = 06:00 UTC
  assert.equal(zeitplanSlot(t, new Date('2026-12-01T05:59:00Z')), null);
  assert.equal(zeitplanSlot(t, new Date('2026-12-01T06:00:00Z')), '2026-12-01 07:00');
  assert.equal(zeitplanSlot({ ...t, uhrzeit: 'quatsch' }, MO_0730), '2026-09-28 07:00', 'ungültige Uhrzeit -> 07:00');
  assert.equal(zeitplanSlot({ art: 'datum', trigger: 'x', tage: 0 }, MO_0730), null);
});

test('Zeitplan: wöchentlich 1 = Montag … 7 = Sonntag; monatlich mit Monatsende', () => {
  const w = { art: 'zeitplan', rhythmus: 'woechentlich', uhrzeit: '07:00', wochentag: 1 };
  assert.equal(zeitplanSlot(w, MO_0730), '2026-09-28 07:00');
  assert.equal(zeitplanSlot({ ...w, wochentag: 2 }, MO_0730), null);
  assert.equal(zeitplanSlot({ ...w, wochentag: 7 }, new Date('2026-09-27T08:00:00Z')), '2026-09-27 07:00', 'Sonntag');
  const m = { art: 'zeitplan', rhythmus: 'monatlich', uhrzeit: '07:00', tag: 28 };
  assert.equal(zeitplanSlot(m, MO_0730), '2026-09-28 07:00');
  assert.equal(zeitplanSlot({ ...m, tag: 1 }, MO_0730), null);
  const ende = { ...m, tag: 31 };
  assert.equal(zeitplanSlot(ende, new Date('2026-09-30T08:00:00Z')), '2026-09-30 07:00', 'September hat 30 Tage');
  assert.equal(zeitplanSlot(ende, new Date('2026-10-30T08:00:00Z')), null);
  assert.equal(zeitplanSlot(ende, new Date('2026-10-31T08:00:00Z')), '2026-10-31 07:00');
  assert.equal(zeitplanSlot({ ...m, tag: 30 }, new Date('2027-02-28T08:00:00Z')), '2027-02-28 07:00', 'Februar');
  assert.equal(zeitplanSlot({ art: 'zeitplan', rhythmus: 'jaehrlich' }, MO_0730), null);
});

test('Slot-Kennung: fest je Ablauf + Slot, UUID-Form (Unique-Index verhindert Doppel)', () => {
  const a = slotKennung('abl-1', '2026-09-28 07:00');
  assert.equal(a, slotKennung('abl-1', '2026-09-28 07:00'));
  assert.notEqual(a, slotKennung('abl-1', '2026-09-29 07:00'));
  assert.notEqual(a, slotKennung('abl-2', '2026-09-28 07:00'));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('Ohne Vorgang: nur Aktionen, die nichts Bestehendes ändern; kein Wenn', () => {
  const z = neuerAusloeser('zeitplan');
  assert.deepEqual(z, { art: 'zeitplan', rhythmus: 'woechentlich', uhrzeit: '07:00', wochentag: 1, tag: 1 });
  assert.equal(ausloeserHatVorgang(z), false);
  assert.equal(ausloeserHatVorgang({ art: 'knopf' }), false);
  assert.equal(ausloeserHatVorgang({ art: 'knopf', modul: 'rechnung' }), true);
  assert.equal(ausloeserHatVorgang(neuerAusloeser('datum')), true);
  assert.equal(ausloeserHatVorgang(null), false);
  const keys = aktionenFuer(z).map((a) => a.key);
  for (const k of ['status_aendern', 'mahnstufe_erhoehen', 'notiz_anhaengen']) assert.ok(!keys.includes(k), k);
  assert.ok(keys.includes('aufgabe_anlegen') && keys.includes('mail_senden') && keys.includes('freigabe_chef'));
  const f = (schritte, a = z) => pruefeAblauf({ name: 'Wochenstart', ausloeser: a, schritte }).fehler.join(' | ');
  assert.match(f([{ id: 's', typ: 'aktion', aktion: 'notiz_anhaengen', config: { text: 'x' } }]), /braucht einen Vorgang/);
  assert.match(f([{ id: 'm', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kunde', betreff: 'b', text: 't' } }]), /Mail nur an eine feste Adresse/);
  assert.match(f([{ id: 'w', typ: 'wenn', bedingung: { verknuepfung: 'und', regeln: [{ feld: 'a', operator: 'leer' }] }, dann: [], sonst: [] }]), /Wenn\/Sonst braucht einen Vorgang/);
  assert.equal(f([{ id: 'a', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Wochenplanung' } }, { id: 'm', typ: 'aktion', aktion: 'mail_senden', config: { an: 'feste_adresse', adresse: 'team@betrieb.example', betreff: 'Wochenstart', text: 'Los geht es' } }]), '');
});

test('Zeitplan/Knopf sind einschaltbar; Prüfung von Wochentag/Tag; Knopf im Modul noch nicht', () => {
  assert.equal(AUSLOESER_ARTEN.find((a) => a.art === 'zeitplan').imMotor, true);
  assert.equal(AUSLOESER_ARTEN.find((a) => a.art === 'knopf').imMotor, true);
  assert.equal(AUSLOESER_ARTEN.find((a) => a.art === 'ereignis').imMotor, true); // seit Paket 166
  const schritte = [{ id: 'a', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Kasse zählen' } }];
  const woche = { name: 'W', ausloeser: neuerAusloeser('zeitplan'), schritte, aktiv: true };
  assert.equal(laufbereit(woche), true);
  assert.match(pruefeAblauf({ ...woche, ausloeser: { ...woche.ausloeser, wochentag: 8 } }).fehler.join(), /Wochentag/);
  assert.match(pruefeAblauf({ ...woche, ausloeser: { art: 'zeitplan', rhythmus: 'monatlich', uhrzeit: '07:00', tag: 0 } }).fehler.join(), /Tag im Monat/);
  assert.equal(laufbereit({ ...woche, ausloeser: { art: 'knopf' } }), true);
  const modul = pruefeAblauf({ ...woche, ausloeser: { art: 'knopf', modul: 'rechnung' } });
  assert.equal(modul.aktivierbar, false);
  assert.equal(ausloeserText({ art: 'zeitplan', rhythmus: 'woechentlich', uhrzeit: '07:00', wochentag: 1 }), 'Wöchentlich am Montag um 07:00 Uhr');
  assert.equal(ausloeserText({ art: 'zeitplan', rhythmus: 'monatlich', uhrzeit: '06:30', tag: 15 }), 'Monatlich am 15. um 06:30 Uhr');
  assert.equal(ausloeserText({ art: 'knopf' }), 'Per Knopf auf der Seite Abläufe');
});

test('Aktionen ohne Vorgang planen: Aufgabe mit Besitzer, Mail an feste Adresse (keine Werbe-Sperre)', () => {
  const ablauf = { name: 'Wochenstart', ausloeser: neuerAusloeser('zeitplan') };
  const jetzt = MO_0730;
  const auf = aktionPlanen({ id: 'a', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Wochenplanung {{heute}}', faellig_in_tagen: 0 } }, ablauf, OHNE_VORGANG, 'o1', {}, jetzt);
  assert.deepEqual([auf.art, auf.daten.titel, auf.daten.owner_user_id, auf.daten.projekt_id], ['anlegen', 'Wochenplanung 28.09.2026', 'o1', null]);
  const mail = aktionPlanen({ id: 'm', typ: 'aktion', aktion: 'mail_senden', config: { an: 'feste_adresse', adresse: 'team@betrieb.example', betreff: 'Wochenstart', text: 'Hallo' } }, ablauf, OHNE_VORGANG, 'o1', {}, jetzt);
  assert.equal(mail.art, 'mail');
  const f = fahrplan({ schritte: [{ id: 'a', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'x' } }, { id: 'w', typ: 'warten', stunden: 2 }] }, null, {}, jetzt);
  assert.equal(f.danach.art, 'warten');
});

test('Code: gemeinsamer Ausführer streng je Betrieb; Zeitplan im Motor; Knopf nur Chef, mit Deckel', () => {
  const aus = lies('lib/ablaufAusfuehren.ts');
  for (const a of aus.split('db.from(').slice(1)) {
    const stueck = a.slice(0, 400);
    if (/^plan\.tabelle\)\.insert\(\{ \.\.\.plan\.daten, owner_user_id: ownerId \}\)/.test(stueck)) continue;
    if (/^'ablauf_protokoll'\)\.insert\(\{\s*owner_user_id: lauf\.owner_user_id/.test(stueck)) continue;
    if (/^'ablauf_laeufe'\)\.insert\(\{\s*owner_user_id: ablauf\.owner_user_id/.test(stueck)) continue;
    // Paket 167: Firmenname aus dem Profil DES Betriebs (Profil-Kennung = Betrieb)
    if (/^'profiles'\)\.select\('firma_name'\)\.eq\('id', ownerId\)/.test(stueck)) continue;
    assert.match(stueck, /owner_user_id/, `ohne Betriebs-Filter: db.from(${stueck.slice(0, 80)}`);
  }
  assert.match(aus, /if \(r\.ergebnis === 'fehler'\) \{/);
  const cron = lies('app/api/cron/ablaeufe/route.ts');
  assert.match(cron, /zeitplanSlot\(ablauf\.ausloeser, jetzt\)/);
  assert.match(cron, /const slot = zeitplanSlot\(ablauf\.ausloeser, jetzt\);\n    if \(!slot\) continue;/, 'nicht faellig -> kein Lauf');
  assert.match(cron, /slotKennung\(ablauf\.id, slot\)/);
  assert.match(cron, /if \(!mitVorgang\) \{/);
  const start = lies('app/api/ablaeufe/start/route.ts');
  assert.match(start, /ablauf\.owner_user_id !== user\.id/);
  assert.match(start, /freieStarts\(count \?\? 0\) <= 0/);
  assert.match(start, /if \(!laufbereit\(ablauf\)\)/);
  const probe = lies('app/api/ablaeufe/probe/route.ts');
  assert.doesNotMatch(probe, /\.(insert|update|delete)\(/, 'Probelauf schreibt nichts');
  assert.doesNotMatch(probe, /ablaufAusfuehren/, 'Probelauf importiert den Ausführer (und damit den Mailversand) nicht');
});
