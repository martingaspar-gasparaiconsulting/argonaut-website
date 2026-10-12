// ============================================================================
// tests/vorbestellungP342.test.mjs — Paket 342 (12.10.2026)
// BV3b Feinkost Teil 1: Vorbestellung und Vormerkliste (Stand, Prüfungen,
// Nachrücken, Benachrichtigung nur mit Einwilligung, Abholliste, SQL-Wächter)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  aktionStand, belegt, aktionPruefen, postenPruefen, vormerkPruefen, einwilligungText, EINWILLIGUNG_WORTLAUT,
  nachrueckVorschlag, fristAbgelaufen, warteReihe, platzInReihe, vormerkLoeschbar, benachrichtigungsText,
  mailtoLink, telLink, abholListe, mengeText, vorbestellUebersicht,
} from '../out/vorbestellAktion.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const A = { titel: 'Dry-Aged Rib-Eye', menge_gesamt: 10, einheit: 'kg', max_je_kunde: 4, abhol_von: '2026-12-20', abhol_bis: '2026-12-23', bestell_schluss: '2026-12-15', status: 'offen' };
const P = (kunde_name, menge, status = 'offen', abhol_tag = '2026-12-22') => ({ kunde_name, menge, status, abhol_tag });

test('Stand: belegt zählt offen, bereit, abgeholt — storniert und nicht abgeholt geben frei', () => {
  const ps = [P('A', 4), P('B', 2.5, 'bereit'), P('C', 1, 'abgeholt'), P('D', 3, 'storniert'), P('E', 1, 'nicht_abgeholt')];
  assert.equal(belegt(ps), 7.5);
  const s = aktionStand(A, ps, '2026-11-01');
  assert.equal(s.frei, 2.5); assert.equal(s.prozent, 75); assert.equal(s.phase, 'vorbestellbar'); assert.ok(s.buchbar);
  assert.match(s.text, /noch 2,5 kg frei/);
  assert.equal(belegt([P('x', 0.1), P('y', 0.2)]), 0.3, 'kein Binärfehler 0,30000000000000004');
});

test('Stand: Phasen in der richtigen Reihenfolge', () => {
  const voll = [P('A', 4), P('B', 4), P('C', 2)];
  assert.equal(aktionStand(A, voll, '2026-11-01').phase, 'ausgebucht');
  assert.equal(aktionStand(A, voll, '2026-11-01').buchbar, false);
  assert.equal(aktionStand(A, [], '2026-12-16').phase, 'schluss', 'nach dem Bestellschluss');
  assert.equal(aktionStand(A, [], '2026-12-15').phase, 'vorbestellbar', 'am Schlusstag noch buchbar');
  assert.equal(aktionStand(A, [], '2026-12-20').phase, 'abholung');
  assert.equal(aktionStand(A, [], '2026-12-24').phase, 'vorbei');
  assert.equal(aktionStand({ ...A, status: 'entwurf' }, [], '2026-11-01').phase, 'entwurf');
  assert.equal(aktionStand({ ...A, status: 'geschlossen' }, [], '2026-11-01').phase, 'geschlossen');
  assert.equal(aktionStand({ ...A, status: 'abgeschlossen' }, [], '2026-12-21').phase, 'abgeschlossen');
  assert.equal(aktionStand({ ...A, bestell_schluss: null }, [], '2026-12-19').phase, 'vorbestellbar');
});

test('Aktion prüfen: Zeitraum, Schluss, Höchstmenge, nie unter Vorbestelltes', () => {
  const e = { titel: ' Weihnachtsgans ', menge_gesamt: 30, einheit: 'Stk', max_je_kunde: 2, abhol_von: '2026-12-22', abhol_bis: '2026-12-24', bestell_schluss: '2026-12-10', notiz: '' };
  const ok = aktionPruefen(e);
  assert.equal(ok.ok, true); assert.equal(ok.felder.titel, 'Weihnachtsgans'); assert.equal(ok.felder.bestell_schluss, '2026-12-10');
  assert.equal(aktionPruefen({ ...e, abhol_bis: '2026-12-21' }).ok, false);
  assert.equal(aktionPruefen({ ...e, bestell_schluss: '2026-12-25' }).ok, false);
  assert.equal(aktionPruefen({ ...e, bestell_schluss: '' }).felder.bestell_schluss, null);
  assert.equal(aktionPruefen({ ...e, max_je_kunde: 31 }).ok, false);
  assert.equal(aktionPruefen({ ...e, menge_gesamt: 0 }).ok, false);
  assert.equal(aktionPruefen({ ...e, abhol_von: '2026-02-30' }).ok, false, 'kein 30. Februar');
  const r = aktionPruefen({ ...e, menge_gesamt: 5 }, 8);
  assert.equal(r.ok, false); assert.match(r.fehler, /bereits 8 Stk/);
});

test('Vorbestellung prüfen: Höchstmenge, frei, Abholtag, Kontakt', () => {
  const e = { kunde_name: 'Weber', kunde_tel: '0711 123456', kunde_mail: '', menge: 2, abhol_tag: '2026-12-22', quelle: 'theke', notiz: '' };
  assert.equal(postenPruefen(e, A, 6).ok, true);
  assert.match(postenPruefen({ ...e, menge: 5 }, A, 6).fehler, /Höchstens 4 kg/);
  assert.match(postenPruefen({ ...e, menge: 3 }, A, 2.5).fehler, /frei sind noch 2,5 kg/);
  assert.match(postenPruefen(e, A, 0).fehler, /Vormerkliste/);
  assert.match(postenPruefen({ ...e, abhol_tag: '2026-12-24' }, A, 6).fehler, /Abholung nur/);
  assert.equal(postenPruefen(e, { ...A, status: 'entwurf' }, 6).ok, false);
  assert.equal(postenPruefen({ ...e, kunde_mail: 'kaputt@' }, A, 6).ok, false);
  assert.equal(postenPruefen({ ...e, kunde_name: '  ' }, A, 6).ok, false);
  assert.equal(postenPruefen({ ...e, quelle: 'fax' }, A, 6).ok, false);
});

test('Vormerkung: NUR mit Einwilligung und einem Weg; Wortlaut wird mitgespeichert', () => {
  const e = { kunde_name: 'Mayer', kunde_tel: '', kunde_mail: 'mayer@beispiel.de', menge_wunsch: 2, einwilligung: true, notiz: '' };
  const ok = vormerkPruefen(e, A, 'Metzgerei Huber');
  assert.equal(ok.ok, true);
  assert.equal(ok.felder.einwilligung, true);
  assert.match(ok.felder.einwilligung_wortlaut, /von Metzgerei Huber einmalig/);
  assert.ok(ok.felder.einwilligung_wortlaut.length >= 20 && ok.felder.einwilligung_wortlaut.length <= 600, 'passt in die SQL-Prüfung');
  assert.match(vormerkPruefen({ ...e, einwilligung: false }, A, 'X').fehler, /Ohne Einwilligung/);
  assert.match(vormerkPruefen({ ...e, kunde_mail: '' }, A, 'X').fehler, /Telefon oder E-Mail/);
  assert.equal(vormerkPruefen({ ...e, menge_wunsch: 5 }, A, 'X').ok, false, 'Höchstmenge gilt auch hier');
  assert.equal(vormerkPruefen(e, { ...A, status: 'abgeschlossen' }, 'X').ok, false);
  assert.ok(!/\bdu\b|\bdein/i.test(EINWILLIGUNG_WORTLAUT), 'kein Duzen');
  assert.match(einwilligungText(''), /von unserem Betrieb/);
});

test('Nachrücken: der Reihe nach, Benachrichtigte halten zurück, Frist 48 Stunden', () => {
  const vm = [
    { id: '3', kunde_name: 'Drei', menge_wunsch: 1, status: 'wartet', erstellt_am: '2026-11-03T10:00:00Z' },
    { id: '1', kunde_name: 'Eins', menge_wunsch: 3, status: 'wartet', erstellt_am: '2026-11-01T10:00:00Z' },
    { id: '2', kunde_name: 'Zwei', menge_wunsch: 2, status: 'wartet', erstellt_am: '2026-11-02T10:00:00Z' },
    { id: '0', kunde_name: 'Null', menge_wunsch: 1, status: 'uebernommen', erstellt_am: '2026-10-01T10:00:00Z' },
  ];
  assert.deepEqual(warteReihe(vm).map((v) => v.id), ['1', '2', '3']);
  assert.equal(platzInReihe(vm, '2'), 2); assert.equal(platzInReihe(vm, '0'), null);
  let n = nachrueckVorschlag(vm, 4, '2026-11-05T10:00:00Z');
  assert.equal(n.naechste.id, '1');
  n = nachrueckVorschlag(vm, 2, '2026-11-05T10:00:00Z');
  assert.equal(n.naechste.id, '2', 'Eins möchte 3 — passt nicht, Zwei rückt nach');
  assert.deepEqual(n.uebersprungen.map((v) => v.id), ['1']);
  assert.equal(nachrueckVorschlag(vm, 0, '2026-11-05T10:00:00Z').naechste, null);
  const ben = [...vm, { id: '9', kunde_name: 'Neun', menge_wunsch: 2, status: 'benachrichtigt', erstellt_am: '2026-10-30T10:00:00Z', benachrichtigt_am: '2026-11-05T08:00:00Z', frist_bis: '2026-11-07T08:00:00Z' }];
  n = nachrueckVorschlag(ben, 3, '2026-11-05T10:00:00Z');
  assert.equal(n.zurueckgehalten, 2); assert.equal(n.verfuegbar, 1); assert.equal(n.naechste.id, '3');
  assert.equal(fristAbgelaufen(ben[4], '2026-11-07T08:00:01Z'), true);
  assert.equal(fristAbgelaufen(ben[4], '2026-11-07T07:59:59Z'), false);
  n = nachrueckVorschlag(ben, 3, '2026-11-08T10:00:00Z');
  assert.equal(n.zurueckgehalten, 0, 'abgelaufene Frist hält nichts mehr zurück'); assert.equal(n.naechste.id, '1');
  assert.equal(fristAbgelaufen({ status: 'benachrichtigt', benachrichtigt_am: '2026-11-01T00:00:00Z', menge_wunsch: 1 }, '2026-11-03T00:00:01Z'), true, 'ohne frist_bis: 48 Stunden');
});

test('Benachrichtigung: Sie-Text, Teilmenge, Links nur mit gültigem Weg; Löschfrist', () => {
  const v = { kunde_name: 'Mayer', menge_wunsch: 3, status: 'wartet', erstellt_am: '2026-11-01T10:00:00Z' };
  const b = benachrichtigungsText(A, v, 'Metzgerei Huber', 2);
  assert.match(b.betreff, /Dry-Aged Rib-Eye/);
  assert.match(b.text, /Guten Tag Mayer/); assert.match(b.text, /Sie hatten sich/); assert.match(b.text, /Frei sind derzeit 2 kg \(Ihr Wunsch: 3 kg\)/);
  assert.match(b.text, /48 Stunden/); assert.match(b.text, /Metzgerei Huber$/);
  assert.ok(!/\bdu\b|\bdir\b|\bdein/i.test(b.text));
  const m = mailtoLink('mayer@beispiel.de', b.betreff, b.text);
  assert.ok(m.startsWith('mailto:mayer@beispiel.de?subject=')); assert.ok(!m.includes(' '));
  assert.equal(mailtoLink('kaputt', 'x', 'y'), null);
  assert.equal(telLink('0711 / 12 34-56'), 'tel:0711123456'); assert.equal(telLink('12'), null);
  const vm = [
    { ...v, status: 'uebernommen', aktualisiert_am: '2026-11-01T00:00:00Z' },
    { ...v, status: 'erloschen', aktualisiert_am: '2026-12-01T00:00:00Z' },
    { ...v, status: 'wartet' },
  ];
  assert.equal(vormerkLoeschbar(vm, '2026-12-23', '2026-12-02').length, 1, 'nur der seit 30 Tagen erledigte');
  assert.equal(vormerkLoeschbar(vm, '2026-12-23', '2027-01-23').length, 3, '30 Tage nach Aktionsende alles');
});

test('Abholliste je Tag, Mengentext, Kacheln', () => {
  const l = abholListe([P('Zorn', 1), P('Albers', 2, 'bereit'), P('Weg', 3, 'storniert'), P('Früh', 1, 'abgeholt', '2026-12-20'), P('Kaputt', 1, 'offen', 'quatsch')]);
  assert.deepEqual(l.map((t) => t.tag), ['2026-12-20', '2026-12-22']);
  assert.deepEqual(l[1].posten.map((p) => p.kunde_name), ['Albers', 'Zorn']);
  assert.equal(l[1].summe, 3); assert.equal(l[1].offen, 2); assert.equal(l[0].offen, 0);
  assert.equal(mengeText(1234.5, 'kg'), '1.234,5 kg'); assert.equal(mengeText(null), '—');
  const st = [aktionStand(A, [], '2026-11-01'), aktionStand(A, [P('A', 10)], '2026-11-01')];
  const u = vorbestellUebersicht(st, [{ status: 'wartet', menge_wunsch: 1, erstellt_am: 'x', kunde_name: 'a' }], '2026-11-01T00:00:00Z');
  assert.deepEqual(u, { buchbar: 1, ausgebucht: 1, wartend: 1, fristAbgelaufen: 0 });
});

test('Verdrahtung: SQL-Wächter, Seite, Menü, Guide', () => {
  const sql = lies('supabase-sql/p342-vorbestellung-vormerkliste.sql');
  assert.match(sql, /for update/, 'Aktion wird beim Buchen gesperrt (kein Überbuchen bei gleichzeitigen Bestellungen)');
  assert.match(sql, /v_belegt \+ new\.menge > a\.menge_gesamt/);
  assert.match(sql, /vormerkung_einwilligung_ck check \(einwilligung = true/);
  assert.match(sql, /Die Einwilligung wird nicht nachträglich geändert/);
  assert.match(sql, /status in \('offen', 'bereit', 'abgeholt'\)/);
  assert.ok(!/\bdrop table\b|\btruncate\b|\bdelete from\b/i.test(sql), 'additiv');
  const seite = lies('app/dashboard/lebensmittel/vorbestellung/page.tsx');
  assert.match(seite, /vormerkPruefen/); assert.match(seite, /postenPruefen/); assert.match(seite, /nachrueckVorschlag/);
  assert.match(seite, /Leerzustand/);
  assert.match(lies('lib/rechte.ts'), /\/dashboard\/lebensmittel\/vorbestellung/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/lebensmittel\/vorbestellung'/);
  assert.match(lies('lib/dsgvoDaten.ts'), /tabelle: 'vormerkung'/);
});
