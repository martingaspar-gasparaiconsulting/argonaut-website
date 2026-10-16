// Paket VK5 (16.10.2026): Show-up-Maschine
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  istAktiv, einstellungLesen, rueckholTageBereinigen, markierbar, lage, showRate,
  faelligEineStunde, rueckholFaellig, buchungsLink, rueckholText, tageZwischen, STANDARD_EINSTELLUNG,
} from '../out/showUp.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const JETZT = new Date('2026-10-16T12:00:00Z'); // 14:00 Berlin
const vor = (min) => new Date(JETZT.getTime() - min * 60000).toISOString();
const nach = (min) => new Date(JETZT.getTime() + min * 60000).toISOString();

test('Status: abgesagt/storniert/verschoben/ausgefallen finden nicht statt', () => {
  for (const s of ['abgesagt', 'Storniert', ' verschoben ', 'ausgefallen']) assert.equal(istAktiv(s), false, s);
  for (const s of ['geplant', null, '', 'bestaetigt']) assert.equal(istAktiv(s), true, String(s));
});

test('Voreinstellung: nichts geht automatisch raus', () => {
  const e = einstellungLesen(null);
  assert.equal(e.erinnerung_1h, false);
  assert.equal(e.rueckhol_an, false);
  assert.deepEqual(e.rueckhol_tage, [1, 4]);
  e.rueckhol_tage.push(9);
  assert.deepEqual(STANDARD_EINSTELLUNG.rueckhol_tage, [1, 4], 'Voreinstellung darf nicht veraendert werden');
  assert.equal(einstellungLesen({ erinnerung_1h: 'ja', rueckhol_an: 1 }).erinnerung_1h, false, 'nur echtes true');
});

test('Rueckhol-Tage: 1-30, ganz, sortiert, ohne Doppelte, hoechstens 3 — wie die Datenbank-Regel', () => {
  assert.deepEqual(rueckholTageBereinigen([7, 1, 1, 0, 31, 2.5, '3', 4, 20]), [1, 4, 7]);
  assert.deepEqual(rueckholTageBereinigen('quatsch'), []);
  const sql = lies('supabase-sql/p411-show-up.sql');
  assert.match(sql, /cardinality\(rueckhol_tage\) between 1 and 3/);
  assert.match(sql, /1 <= all\(rueckhol_tage\) and 30 >= all\(rueckhol_tage\)/);
  assert.match(sql, /erinnerung_1h boolean not null default false/);
  assert.match(sql, /rueckhol_an boolean not null default false/);
});

test('Markieren nur bei vergangenen, aktiven Terminen', () => {
  assert.equal(markierbar({ id: 'a', beginn_am: vor(5) }, JETZT), true);
  assert.equal(markierbar({ id: 'a', beginn_am: nach(5) }, JETZT), false);
  assert.equal(markierbar({ id: 'a', beginn_am: vor(5), status: 'abgesagt' }, JETZT), false);
  assert.equal(markierbar({ id: 'a', beginn_am: null }, JETZT), false);
  assert.equal(lage({ id: 'a', beginn_am: vor(60), erschienen: false }, JETZT), 'nicht_erschienen');
  assert.equal(lage({ id: 'a', beginn_am: nach(60), erschienen: true }, JETZT), 'kommend');
});

test('Show-Rate: offene zaehlen nicht mit, ohne Markierung keine Zahl, 90 Tage Fenster', () => {
  const t = [
    { id: '1', beginn_am: vor(60), erschienen: true },
    { id: '2', beginn_am: vor(120), erschienen: true },
    { id: '3', beginn_am: vor(180), erschienen: true },
    { id: '4', beginn_am: vor(240), erschienen: false },
    { id: '5', beginn_am: vor(300), erschienen: null },
    { id: '6', beginn_am: vor(91 * 24 * 60), erschienen: false },
    { id: '7', beginn_am: vor(30), erschienen: false, status: 'abgesagt' },
    { id: '8', beginn_am: nach(30), erschienen: true },
  ];
  assert.deepEqual(showRate(t, JETZT), { erschienen: 3, nicht: 1, offen: 1, quote: 75 });
  assert.equal(showRate([{ id: '5', beginn_am: vor(5) }], JETZT).quote, null);
  assert.equal(showRate(t, JETZT, 365).nicht, 2);
});

test('1-Stunden-Erinnerung: Fenster 30-90 Min, je Termin nur einmal, nur mit Mail', () => {
  const basis = { id: 'x', kunde_email: 'k@x.de', beginn_am: nach(60) };
  assert.equal(faelligEineStunde(basis, JETZT), true);
  assert.equal(faelligEineStunde({ ...basis, beginn_am: nach(30) }, JETZT), false, '30 Min ist zu spaet');
  assert.equal(faelligEineStunde({ ...basis, beginn_am: nach(90) }, JETZT), true, '90 Min gehoert dazu');
  assert.equal(faelligEineStunde({ ...basis, beginn_am: nach(91) }, JETZT), false);
  assert.equal(faelligEineStunde({ ...basis, erinnerung_1h_am: vor(10) }, JETZT), false);
  assert.equal(faelligEineStunde({ ...basis, kunde_email: '  ' }, JETZT), false);
  assert.equal(faelligEineStunde({ ...basis, status: 'storniert' }, JETZT), false);
  // Zwei 15-Minuten-Laeufe hintereinander fangen jeden Termin zwischen 45 und 90 Min mindestens einmal
  for (let m = 31; m <= 90; m++) {
    const t = { ...basis, beginn_am: nach(m) };
    const a = faelligEineStunde(t, JETZT);
    const b = faelligEineStunde(t, new Date(JETZT.getTime() + 15 * 60000));
    const c = faelligEineStunde(t, new Date(JETZT.getTime() - 15 * 60000));
    assert.ok(a || b || c, `Termin in ${m} Min faellt durch`);
  }
});

test('Berliner Tage zaehlen ueber Mitternacht und Zeitumstellung richtig', () => {
  assert.equal(tageZwischen(new Date('2026-10-16T21:30:00Z'), new Date('2026-10-16T22:30:00Z')), 1, '23:30 → 00:30 Berlin');
  assert.equal(tageZwischen(new Date('2026-10-24T12:00:00Z'), new Date('2026-10-26T12:00:00Z')), 2, 'ueber die Zeitumstellung');
});

test('Rueckhol-Folge: nur nicht erschienen, nur eingeschaltet, Stufe nach Tagen, einmal je Tag, Schluss bei neuer Buchung', () => {
  const e = { erinnerung_1h: false, rueckhol_an: true, rueckhol_tage: [1, 4] };
  const t = { id: 'r', kunde_email: 'k@x.de', beginn_am: '2026-10-15T08:00:00Z', erschienen: false, rueckhol_stufe: 0 };
  assert.equal(rueckholFaellig(t, e, JETZT), true, 'Tag 1');
  assert.equal(rueckholFaellig(t, { ...e, rueckhol_an: false }, JETZT), false);
  assert.equal(rueckholFaellig({ ...t, erschienen: null }, e, JETZT), false, 'offen = nichts');
  assert.equal(rueckholFaellig({ ...t, erschienen: true }, e, JETZT), false);
  assert.equal(rueckholFaellig(t, e, JETZT, true), false, 'neu gebucht');
  assert.equal(rueckholFaellig({ ...t, beginn_am: '2026-10-16T08:00:00Z' }, e, JETZT), false, 'Tag 0');
  assert.equal(rueckholFaellig({ ...t, rueckhol_stufe: 1 }, e, JETZT), false, 'Stufe 2 erst an Tag 4');
  assert.equal(rueckholFaellig({ ...t, rueckhol_stufe: 1 }, e, new Date('2026-10-19T08:00:00Z')), true);
  assert.equal(rueckholFaellig({ ...t, rueckhol_stufe: 2 }, e, new Date('2026-11-30T08:00:00Z')), false, 'Folge zu Ende');
  assert.equal(rueckholFaellig({ ...t, rueckhol_letzte_am: '2026-10-16T05:00:00Z' }, e, JETZT), false, 'heute schon');
  assert.equal(rueckholFaellig({ ...t, kunde_email: null }, e, JETZT), false);
});

test('Buchungslink nur bei freigeschalteter Online-Buchung und sauberem Namen', () => {
  assert.equal(buchungsLink('https://argonaut-os.com/', 'mueller-bau', true), 'https://argonaut-os.com/buchen/mueller-bau');
  assert.equal(buchungsLink('https://argonaut-os.com', 'mueller-bau', false), null);
  assert.equal(buchungsLink('https://argonaut-os.com', '', true), null);
  assert.equal(buchungsLink('https://argonaut-os.com', 'x"><script>', true), null);
});

test('Rueckhol-Texte gesiezt, ohne Werbung, Schlusssatz nur in der letzten Mail', () => {
  const a = rueckholText(0, 'https://x/buchen/a', false);
  const b = rueckholText(1, null, true);
  const alles = [a.betreff, ...a.absaetze, b.betreff, ...b.absaetze].join(' ');
  assert.match(alles, /Sie/);
  assert.doesNotMatch(alles, /\b(du|dein|dich|dir)\b/i);
  assert.doesNotMatch(alles, /Rabatt|Angebot|gratis|kostenlos|%/i);
  assert.ok(!a.absaetze.join(' ').includes('nicht mehr'));
  assert.ok(b.absaetze.join(' ').includes('nicht mehr'));
  assert.ok(b.absaetze.join(' ').includes('Antworten Sie'));
});

test('Markier-Route: Anmeldung zuerst, nur Nutzer-Client, Lead nur von termin_gebucht', () => {
  const r = lies('app/api/termin-erschienen/route.ts');
  assert.ok(r.indexOf('nurAngemeldet()') < r.indexOf('createClient()'));
  assert.doesNotMatch(r, /supabase-admin|SERVICE_ROLE/);
  assert.match(r, /markierbar\(termin, jetzt\)/);
  assert.match(r, /\.eq\('stufe', 'termin_gebucht'\)/);
  assert.match(r, /geaendert\.length === 0/);
});

test('Teil 2: Rueckhol-Mails nur 9-18 Uhr Berlin (auch bei Winterzeit)', async () => {
  const { rueckholZeit, berlinStunde } = await import('../out/showUp.js');
  assert.equal(berlinStunde(new Date('2026-10-16T07:00:00Z')), 9);
  assert.equal(rueckholZeit(new Date('2026-10-16T06:59:00Z')), false, '8:59');
  assert.equal(rueckholZeit(new Date('2026-10-16T07:00:00Z')), true, '9:00');
  assert.equal(rueckholZeit(new Date('2026-10-16T15:59:00Z')), true, '17:59');
  assert.equal(rueckholZeit(new Date('2026-10-16T16:00:00Z')), false, '18:00');
  assert.equal(rueckholZeit(new Date('2026-12-01T08:00:00Z')), true, '9:00 Winterzeit');
  assert.equal(rueckholZeit(new Date('2026-12-01T07:30:00Z')), false, '8:30 Winterzeit');
});

test('Teil 2: Cron — Schloss zuerst, alles auf den Betrieb gefiltert, Belegung vor dem Versand, Zeitplan 15 Min', () => {
  const r = lies('app/api/cron/termin-showup/route.ts');
  const start = r.indexOf('async function lauf');
  assert.ok(r.indexOf('cronGuard(req)', start) < r.indexOf("from('vk_showup')", start));
  // jede Aenderung an termine ist auf den Betrieb gefiltert
  const updates = r.split(/\.from\('termine'\)\s*\.update\(/).slice(1);
  assert.equal(updates.length, 5);
  for (const u of updates) assert.match(u.slice(0, u.indexOf(';')), /\.eq\('owner_user_id', t\.owner_user_id\)/);
  // Belegung (bedingtes Update) steht VOR sendeMail
  assert.ok(r.indexOf(".is('erinnerung_1h_am', null).select('id')") < r.indexOf('sendeMail({', r.indexOf('── 1) Erinnerung')));
  assert.ok(r.indexOf(".eq('rueckhol_stufe', stufe).select('id')") < r.indexOf('sendeMail({', r.indexOf('── 2) Rueckhol')));
  assert.match(r, /rueckholZeit\(jetzt\)/);
  assert.match(r, /replace\(\/\[%_\\\\\]\/g/, 'Platzhalter in der Mail-Adresse entschaerft');
  const v = JSON.parse(lies('vercel.json'));
  assert.ok(v.crons.some((c) => c.path === '/api/cron/termin-showup' && c.schedule === '*/15 * * * *'));
});

test('Teil 2: Einstellung — nur Chef speichert, eine Zeile je Betrieb', () => {
  const p = lies('app/dashboard/termine/page.tsx');
  assert.match(p, /onConflict: "owner_user_id"/);
  assert.match(p, /disabled=\{!chef\}/);
  assert.match(p, /rpc\("mein_chef_id"\)/);
});

test('WhatsApp-Vorlage: gesiezt, Berliner Zeit, ohne Titel sinnvoll', async () => {
  const { whatsappErinnerungText } = await import('../out/showUp.js');
  const t = whatsappErinnerungText('Beratung Bad', '2026-10-17T08:00:00Z');
  assert.match(t, /„Beratung Bad“/);
  assert.match(t, /17\.10\.2026 um 10:00 Uhr/);
  assert.match(t, /geben Sie uns/);
  assert.match(whatsappErinnerungText('', '2026-12-01T08:00:00Z'), /an Ihren Termin am .* um 09:00 Uhr/);
  assert.doesNotMatch(whatsappErinnerungText('', '2026-12-01T08:00:00Z'), /„/);
  assert.doesNotMatch(whatsappErinnerungText(null, 'quatsch'), /Invalid|NaN/);
});
