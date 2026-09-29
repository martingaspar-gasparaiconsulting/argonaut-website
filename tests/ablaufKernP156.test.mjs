// Paket 156 (28.09.2026) — Ablauf-Baukasten Teil 1: der Kern (reine Logik) + Datenbank.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  pruefeGruppe, fuellePlatzhalter, standardWerte, wertAmPfad, schrittAn, nachfolger, fahrplan,
  pruefeAblauf, regelZuAblauf, ausloeserIstWerbung, ausloeserText, schrittText, ablaufAktion,
  ABLAUF_AKTIONEN, EREIGNISSE, GRENZEN,
} from '../out/ablauf.js';
import { AKTIONEN, TRIGGER } from '../out/automation.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const JETZT = new Date('2026-09-28T10:00:00Z');

const RECHNUNG = { rechnungsnummer: 'RE-2026-0042', kunde_name: 'Müller GmbH', brutto_summe: 1190, zahlungsstatus: 'offen', mahnstufe: 1, faelligkeitsdatum: '2026-09-01', kunde: { email: 'buchhaltung@mueller.example', ort: 'Böblingen' } };

// Ein Mahn-Ablauf wie aus dem Leben: Erinnerung, 7 Tage warten, wenn noch offen und > 500 € -> Freigabe -> Mahnstufe, sonst Aufgabe
const MAHNLAUF = {
  name: 'Mahnlauf',
  ausloeser: { art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 7 },
  schritte: [
    { id: 'a', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kunde', betreff: 'Erinnerung {{nummer}}', text: 'Guten Tag {{name}}, offen: {{betrag}}.' } },
    { id: 'b', typ: 'warten', tage: 7 },
    {
      id: 'c', typ: 'wenn',
      bedingung: { verknuepfung: 'und', regeln: [{ feld: 'zahlungsstatus', operator: 'ungleich', wert: 'bezahlt' }, { feld: 'brutto_summe', operator: 'groesser', wert: 500 }] },
      dann: [
        { id: 'd', typ: 'aktion', aktion: 'freigabe_chef', config: {} },
        { id: 'e', typ: 'aktion', aktion: 'mahnstufe_erhoehen', config: { hoechste_stufe: 3 } },
      ],
      sonst: [{ id: 'f', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Anrufen: {{name}}' } }],
    },
    { id: 'g', typ: 'aktion', aktion: 'notiz_anhaengen', config: { text: 'Ablauf {{ablauf}} am {{heute}}' } },
  ],
};

test('Kataloge: die fuenf bisherigen Aktionen sind im Motor, Neues ist gekennzeichnet; Ereignisse mit Werbe-Kennzeichen', () => {
  for (const a of AKTIONEN) assert.equal(ablaufAktion(a.key)?.imMotor, true, a.key);
  assert.equal(ablaufAktion('mahnstufe_erhoehen').geld, true);
  assert.equal(ablaufAktion('mail_senden').kundenpost, true);
  assert.equal(ablaufAktion('webhook_senden').extern, true);
  // Paket 157: freigabe_chef ist jetzt im Motor
  assert.equal(ablaufAktion('freigabe_chef').imMotor, true);
  // Paket 167 (bewusste Aenderung): die neuen Bausteine sind jetzt im Motor.
  for (const k of ['glocke', 'termin_anlegen', 'pdf_erstellen', 'ki_schritt', 'webhook_senden']) assert.equal(ablaufAktion(k).imMotor, true, k);
  assert.equal(new Set(ABLAUF_AKTIONEN.map((a) => a.key)).size, ABLAUF_AKTIONEN.length);
  assert.equal(EREIGNISSE.find((e) => e.key === 'kontakt_angelegt').werbung, true);
  assert.equal(EREIGNISSE.find((e) => e.key === 'rechnung_angelegt').werbung, false);
});

test('Bedingungen UND/ODER, verschachtelt, Punkt-Pfad; leere Gruppe trifft zu', () => {
  assert.equal(pruefeGruppe(null, RECHNUNG), true);
  assert.equal(pruefeGruppe({ verknuepfung: 'und', regeln: [] }, RECHNUNG), true);
  const und = { verknuepfung: 'und', regeln: [{ feld: 'brutto_summe', operator: 'groesser', wert: 1000 }, { feld: 'mahnstufe', operator: 'gleich', wert: 2 }] };
  assert.equal(pruefeGruppe(und, RECHNUNG), false);
  assert.equal(pruefeGruppe({ ...und, verknuepfung: 'oder' }, RECHNUNG), true);
  const verschachtelt = { verknuepfung: 'und', regeln: [{ feld: 'zahlungsstatus', operator: 'gleich', wert: 'offen' }, { verknuepfung: 'oder', regeln: [{ feld: 'kunde.ort', operator: 'gleich', wert: 'Stuttgart' }, { feld: 'kunde.ort', operator: 'enthaelt', wert: 'böb' }] }] };
  assert.equal(pruefeGruppe(verschachtelt, RECHNUNG), true);
  assert.equal(pruefeGruppe({ verknuepfung: 'und', regeln: [{ feld: 'kunde.plz', operator: 'leer' }] }, RECHNUNG), true);
  assert.equal(wertAmPfad(RECHNUNG, 'kunde.email'), 'buchhaltung@mueller.example');
  assert.equal(wertAmPfad(RECHNUNG, 'x.y.z'), undefined);
});

test('Platzhalter: vorbereitete Werte, Punkt-Pfad, Datum deutsch, Unbekanntes leer', () => {
  const w = standardWerte({ name: 'Mahnlauf' }, RECHNUNG, JETZT);
  assert.equal(w.name, 'Müller GmbH');
  assert.equal(w.nummer, 'RE-2026-0042');
  assert.match(w.betrag, /1\.190,00/);
  const t = fuellePlatzhalter('{{name}} · {{ kunde.email }} · {{faelligkeitsdatum}} · {{gibtsnicht}} · {{kunde}} · {{ablauf}}', RECHNUNG, w);
  assert.equal(t, 'Müller GmbH · buchhaltung@mueller.example · 01.09.2026 ·  ·  · Mahnlauf');
  assert.equal(fuellePlatzhalter('', RECHNUNG), '');
  assert.equal(fuellePlatzhalter('{{mahnstufe}}', RECHNUNG), '1');
});

test('Wege: schrittAn und nachfolger durch Wenn/Sonst', () => {
  const s = MAHNLAUF.schritte;
  assert.equal(schrittAn(s, '0').id, 'a');
  assert.equal(schrittAn(s, '2.dann.1').id, 'e');
  assert.equal(schrittAn(s, '2.sonst.0').id, 'f');
  assert.equal(schrittAn(s, '2.dann.9'), null);
  assert.equal(schrittAn(s, '0.dann.0'), null);
  assert.equal(schrittAn(s, '7'), null);
  assert.equal(nachfolger(s, '0'), '1');
  assert.equal(nachfolger(s, '2.dann.0'), '2.dann.1');
  assert.equal(nachfolger(s, '2.dann.1'), '3', 'Zweig zu Ende -> nach dem Wenn weiter');
  assert.equal(nachfolger(s, '2.sonst.0'), '3');
  assert.equal(nachfolger(s, '3'), null);
  // verschachtelt: Ende eines inneren Zweigs am Ende eines aeusseren
  const tief = [{ id: 'w1', typ: 'wenn', bedingung: { verknuepfung: 'und', regeln: [{ feld: 'x', operator: 'leer' }] }, dann: [{ id: 'w2', typ: 'wenn', bedingung: { verknuepfung: 'und', regeln: [{ feld: 'y', operator: 'leer' }] }, dann: [{ id: 'z', typ: 'stopp' }], sonst: [] }], sonst: [] }, { id: 'ende', typ: 'stopp' }];
  assert.equal(nachfolger(tief, '0.dann.0.dann.0'), '1');
});

test('Fahrplan: Aktionen bis zum Warten; nach dem Warten Wenn entscheidet; Freigabe haelt an; Ende', () => {
  const f1 = fahrplan(MAHNLAUF, null, RECHNUNG, JETZT);
  assert.deepEqual(f1.jetzt.map((e) => e.pfad), ['0']);
  assert.equal(f1.danach.art, 'warten');
  assert.equal(f1.danach.bis, '2026-10-05T10:00:00.000Z');
  assert.equal(f1.danach.weiter, '2');
  // noch offen und > 500 -> Freigabe haelt an, Mahnstufe erst danach
  const f2 = fahrplan(MAHNLAUF, '2', RECHNUNG, JETZT);
  assert.deepEqual(f2.jetzt, [{ pfad: '2', art: 'bedingung', ergebnis: true }]);
  assert.deepEqual(f2.danach, { art: 'freigabe', pfad: '2.dann.0', weiter: '2.dann.1' });
  const f3 = fahrplan(MAHNLAUF, '2.dann.1', RECHNUNG, JETZT);
  assert.deepEqual(f3.jetzt.map((e) => e.pfad), ['2.dann.1', '3']);
  assert.equal(f3.danach.art, 'fertig');
  // kleiner Betrag -> Sonst-Zweig, dann weiter nach dem Wenn
  const f4 = fahrplan(MAHNLAUF, '2', { ...RECHNUNG, brutto_summe: 80 }, JETZT);
  assert.deepEqual(f4.jetzt.map((e) => `${e.pfad}${e.art === 'bedingung' ? `:${e.ergebnis}` : ''}`), ['2:false', '2.sonst.0', '3']);
  // Stopp beendet
  const f5 = fahrplan({ schritte: [{ id: 'x', typ: 'stopp' }, { id: 'y', typ: 'aktion', aktion: 'glocke', config: { text: 'nie' } }] }, null, {}, JETZT);
  assert.deepEqual(f5, { jetzt: [], danach: { art: 'stopp', pfad: '0' } });
  // leer
  assert.deepEqual(fahrplan({ schritte: [] }, null, {}, JETZT), { jetzt: [], danach: { art: 'fertig' } });
  // Wenn mit leerem Zweig -> direkt weiter
  const leerZweig = { schritte: [{ id: 'w', typ: 'wenn', bedingung: { verknuepfung: 'und', regeln: [{ feld: 'a', operator: 'leer' }] }, dann: [], sonst: [] }, { id: 'n', typ: 'aktion', aktion: 'notiz_anhaengen', config: { text: 't' } }] };
  assert.deepEqual(fahrplan(leerZweig, null, {}, JETZT).jetzt.map((e) => e.pfad), ['0', '1']);
});

test('Pruefung: Mahnlauf ist gueltig und seit Paket 157 einschaltbar (Freigabe im Motor); Glocke noch nicht', () => {
  const p = pruefeAblauf(MAHNLAUF);
  assert.deepEqual(p.fehler, []);
  assert.equal(p.aktivierbar, true);
  const mitGlocke = pruefeAblauf({ ...MAHNLAUF, schritte: [...MAHNLAUF.schritte, { id: 'z', typ: 'aktion', aktion: 'glocke', config: { text: 'x' } }] });
  // Paket 167 (bewusste Aenderung): Glocke ist im Motor -> einschaltbar.
  assert.equal(mitGlocke.aktivierbar, true);
  assert.ok(!mitGlocke.hinweise.some((h) => /noch nicht ausführt/.test(h)));
  // Knopf direkt im Modul fuehrt der Motor weiterhin noch nicht aus.
  const imModul = pruefeAblauf({ ...MAHNLAUF, ausloeser: { art: 'knopf', modul: 'rechnungen' } });
  assert.equal(imModul.aktivierbar, false);
  assert.ok(imModul.hinweise.some((h) => /noch nicht ausführt/.test(h)));
  // Rechnung ueberfaellig ist Betriebspost -> kein Werbe-Hinweis
  assert.ok(!p.hinweise.some((h) => /Werbung/.test(h)));
});

test('Schutzgelaender: Geld nur nach Freigabe (im selben Zweig), nie „bezahlt", Werbung nur mit Einwilligung, Webhook = AVV', () => {
  const ohneFreigabe = { ...MAHNLAUF, schritte: [{ id: 'e', typ: 'aktion', aktion: 'mahnstufe_erhoehen', config: {} }] };
  assert.ok(pruefeAblauf(ohneFreigabe).fehler.some((f) => /Freigabe durch den Chef/.test(f)));
  // Freigabe nur im Sonst-Zweig gilt nicht fuer den Dann-Zweig
  const falscherZweig = { ...MAHNLAUF, schritte: [{ id: 'w', typ: 'wenn', bedingung: { verknuepfung: 'und', regeln: [{ feld: 'a', operator: 'leer' }] }, dann: [{ id: 'e', typ: 'aktion', aktion: 'mahnstufe_erhoehen', config: {} }], sonst: [{ id: 'd', typ: 'aktion', aktion: 'freigabe_chef', config: {} }] }] };
  assert.ok(pruefeAblauf(falscherZweig).fehler.some((f) => /Freigabe/.test(f)));
  // Freigabe VOR dem Wenn gilt in beiden Zweigen
  const davor = { ...MAHNLAUF, schritte: [{ id: 'd', typ: 'aktion', aktion: 'freigabe_chef', config: {} }, { ...falscherZweig.schritte[0], sonst: [] }] };
  assert.deepEqual(pruefeAblauf(davor).fehler, []);
  const bezahlt = { ...MAHNLAUF, schritte: [{ id: 's', typ: 'aktion', aktion: 'status_aendern', config: { neuer_status: 'bezahlt' } }] };
  assert.ok(pruefeAblauf(bezahlt).fehler.some((f) => /Zahlungseingang/.test(f)));
  const werbung = { name: 'Rueckholung', ausloeser: { art: 'datum', trigger: 'kontakt_lange_still', tage: 180 }, schritte: [{ id: 'm', typ: 'aktion', aktion: 'mail_senden', config: { an: 'kunde', betreff: 'Lange nicht gesehen', text: 'Hallo' } }] };
  assert.equal(ausloeserIstWerbung(werbung.ausloeser), true);
  assert.ok(pruefeAblauf(werbung).hinweise.some((h) => /Einwilligung/.test(h)));
  assert.equal(pruefeAblauf(werbung).aktivierbar, true, 'mit Hinweis, aber einschaltbar (der Motor prueft die Einwilligung je Kunde)');
  const fest = { ...werbung, schritte: [{ ...werbung.schritte[0], config: { ...werbung.schritte[0].config, an: 'feste_adresse', adresse: 'chef@betrieb.example' } }] };
  assert.ok(!pruefeAblauf(fest).hinweise.some((h) => /Einwilligung/.test(h)));
  assert.equal(ausloeserIstWerbung({ art: 'webhook' }), true, 'unbekannt gilt als Werbung');
  assert.equal(ausloeserIstWerbung({ art: 'ereignis', ereignis: 'gibtsnicht' }), true);
  const hook = { ...werbung, schritte: [{ id: 'h', typ: 'aktion', aktion: 'webhook_senden', config: { url: 'https://n8n.example/hook' } }] };
  assert.ok(pruefeAblauf(hook).hinweise.some((h) => /AVV/.test(h)));
});

test('Pruefung: Pflichtfelder, doppelte Kennung, Wartezeit, Tiefe, Groesse, Auslöser', () => {
  const f = (a) => pruefeAblauf(a).fehler.join(' | ');
  assert.match(f({ ...MAHNLAUF, name: ' ' }), /Namen/);
  assert.match(f({ ...MAHNLAUF, ausloeser: { art: 'irgendwas' } }), /Auslöser/);
  assert.match(f({ ...MAHNLAUF, ausloeser: { art: 'datum', trigger: 'gibtsnicht', tage: 0 } }), /Unbekannter Datums-Auslöser/);
  assert.match(f({ ...MAHNLAUF, ausloeser: { art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 400 } }), /0 bis 365/);
  assert.match(f({ ...MAHNLAUF, ausloeser: { art: 'zeitplan', rhythmus: 'taeglich', uhrzeit: '25:00' } }), /HH:MM/);
  assert.match(f({ ...MAHNLAUF, schritte: [] }), /Mindestens ein Schritt/);
  assert.match(f({ ...MAHNLAUF, schritte: [{ id: 'a', typ: 'aktion', aktion: 'mail_senden', config: { betreff: 'x' } }] }), /„text" fehlt/);
  assert.match(f({ ...MAHNLAUF, schritte: [{ id: 'a', typ: 'stopp' }, { id: 'a', typ: 'stopp' }] }), /doppelte Kennung/);
  assert.match(f({ ...MAHNLAUF, schritte: [{ id: 'w', typ: 'warten', tage: 0 }] }), /Wartezeit/);
  assert.match(f({ ...MAHNLAUF, schritte: [{ id: 'w', typ: 'warten', tage: 400 }] }), /Wartezeit/);
  assert.equal(pruefeAblauf({ ...MAHNLAUF, schritte: [{ id: 'w', typ: 'warten', stunden: 2 }] }).fehler.length, 0);
  assert.match(f({ ...MAHNLAUF, schritte: [{ id: 'x', typ: 'aktion', aktion: 'raketenstart', config: {} }] }), /unbekannte Aktion/);
  assert.match(f({ ...MAHNLAUF, schritte: [{ id: 'w', typ: 'wenn', bedingung: { verknuepfung: 'und', regeln: [] }, dann: [], sonst: [] }] }), /Wenn ohne Bedingung/);
  let tief = { id: 'z', typ: 'stopp' };
  for (let i = 0; i < 7; i++) tief = { id: `w${i}`, typ: 'wenn', bedingung: { verknuepfung: 'und', regeln: [{ feld: 'a', operator: 'leer' }] }, dann: [tief], sonst: [] };
  assert.match(f({ ...MAHNLAUF, schritte: [tief] }), /verschachtelt/);
  const viele = Array.from({ length: GRENZEN.schritte + 1 }, (_, i) => ({ id: `n${i}`, typ: 'stopp' }));
  assert.match(f({ ...MAHNLAUF, schritte: viele }), /Höchstens 50 Schritte/);
});

test('Uebernahme alter Regeln: gleiches Verhalten, startet AUS, Geld-Aktion bekommt Freigabe davor', () => {
  const alt = { id: 'r1', name: 'Mahnung', beschreibung: null, trigger_typ: 'rechnung_ueberfaellig', bedingung: [{ feld: 'brutto_summe', operator: 'groesser', wert: 100 }], aktion_typ: 'mail_senden', aktion_config: { an: 'kunde', betreff: 'Erinnerung', text: 'Bitte zahlen' }, wartezeit_tage: 14 };
  const { ablauf, hinweise } = regelZuAblauf(alt);
  assert.equal(ablauf.aktiv, false);
  assert.deepEqual(ablauf.ausloeser, { art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 14, filter: { verknuepfung: 'und', regeln: alt.bedingung } });
  assert.equal(ablauf.schritte.length, 1);
  assert.deepEqual(hinweise, []);
  assert.deepEqual(pruefeAblauf(ablauf).fehler, []);
  assert.equal(pruefeAblauf(ablauf).aktivierbar, true);
  const geld = regelZuAblauf({ ...alt, aktion_typ: 'mahnstufe_erhoehen', aktion_config: {} });
  assert.deepEqual(geld.ablauf.schritte.map((s) => s.aktion), ['freigabe_chef', 'mahnstufe_erhoehen']);
  assert.ok(geld.hinweise.some((h) => /Freigabe/.test(h)));
  assert.deepEqual(pruefeAblauf(geld.ablauf).fehler, []);
  assert.equal(regelZuAblauf({ ...alt, bedingung: null, wartezeit_tage: '3' }).ablauf.ausloeser.filter, null);
  assert.equal(regelZuAblauf({ ...alt, wartezeit_tage: -5 }).ablauf.ausloeser.tage, 0);
  // Alle bisherigen Ausloeser lassen sich uebernehmen
  for (const t of TRIGGER) assert.deepEqual(pruefeAblauf(regelZuAblauf({ ...alt, trigger_typ: t.key }).ablauf).fehler, [], t.key);
});

test('In Worten', () => {
  assert.equal(ausloeserText({ art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 1 }), 'Rechnung ist überfällig, nach 1 Tag');
  assert.equal(ausloeserText({ art: 'zeitplan', rhythmus: 'woechentlich', uhrzeit: '08:00' }), 'Wöchentlich um 08:00 Uhr');
  assert.equal(ausloeserText({ art: 'ereignis', ereignis: 'lead_eingegangen' }), 'Anfrage eingegangen');
  assert.equal(schrittText({ id: 'w', typ: 'warten', tage: 2, stunden: 3 }), 'Warten: 2 Tage 3 Std.');
  assert.equal(schrittText(MAHNLAUF.schritte[2]), 'Wenn … (2 Bedingungen)');
  assert.equal(schrittText(MAHNLAUF.schritte[0]), 'E-Mail senden');
});

test('SQL p156: vier neue Tabellen, nichts Bestehendes angefasst, Versionen/Protokoll nur anhaengen', () => {
  const sql = lies('supabase-sql/p156-ablaeufe-kern.sql');
  assert.ok(!/\b(drop table|delete from|truncate)\b/i.test(sql));
  for (const z of sql.match(/alter table[^;]*;/gi) ?? []) assert.match(z, /^alter table public\.(ablaeufe|ablauf_versionen|ablauf_laeufe|ablauf_protokoll)\s+enable row level security;$/, z);
  assert.ok(!/automation_regeln|automation_log/.test(sql.replace(/^--.*$/gm, '')));
  for (const t of ['ablaeufe', 'ablauf_versionen', 'ablauf_laeufe', 'ablauf_protokoll']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${t} \\(`));
    assert.match(sql, new RegExp(`alter table public\\.${t}\\s+enable row level security`));
  }
  assert.match(sql, /aktiv\s+boolean not null default false/, 'startet AUS');
  assert.match(sql, /ablauf_laeufe_einmalig on public\.ablauf_laeufe \(ablauf_id, ziel_typ, ziel_id\) where ziel_id is not null and probe = false/);
  assert.ok(!/on public\.ablauf_versionen for (update|delete|all)/.test(sql));
  assert.ok(!/on public\.ablauf_protokoll for (update|delete|all)/.test(sql));
  // Mitarbeiter nur lesen
  for (const m of sql.matchAll(/create policy (\w+) on public\.\w+ for (\w+)[^;]*mein_chef_id\(\)/g)) assert.equal(m[2], 'select', m[1]);
});
