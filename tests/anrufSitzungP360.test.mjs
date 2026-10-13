// ============================================================================
// tests/anrufSitzungP360.test.mjs — Paket 360 (13.10.2026)
// VK4 Anruf-Sitzung, Teil 1: Warteschlange, Ergebnis-Codes, Rückrufe.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ERGEBNISSE, MAX_VERSUCHE, telefonNorm, naechsterVersuch, warteschlange, kontaktStand, rueckrufVorschlaege, lokalZuIso,
  anrufPruefen, anrufZeile, tagesZahlen, seitText,
} from '../out/anrufSitzung.js';
import { NAV_LINKS } from '../out/rechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const JETZT = new Date('2026-10-13T08:00:00Z'); // 10:00 Berlin
const Q = { rueckrufe: true, neue: true, offene: true, liste: true };
const iso = (minuten) => new Date(JETZT.getTime() + minuten * 60_000).toISOString();

test('Ergebnis-Codes: acht Stück, beendende und erreichte richtig markiert, Schlüssel wie in SQL p360', () => {
  assert.deepEqual(ERGEBNISSE.map((e) => e.key), ['nicht_erreicht', 'mailbox', 'besetzt', 'rueckruf', 'gespraech', 'termin', 'kein_interesse', 'falsche_nummer']);
  assert.deepEqual(ERGEBNISSE.filter((e) => e.beendet).map((e) => e.key), ['termin', 'kein_interesse', 'falsche_nummer']);
  const sql = lies('supabase-sql/p360-anruf-sitzung.sql');
  for (const e of ERGEBNISSE) assert.match(sql, new RegExp(`'${e.key}'`), e.key);
  assert.equal(MAX_VERSUCHE, 6);
});

test('Telefonnummer für tel:', () => {
  assert.equal(telefonNorm('07031 / 123 45-6'), '07031123456');
  assert.equal(telefonNorm('+49 171 1234567'), '+491711234567');
  assert.equal(telefonNorm('0049 171 1234567'), '+491711234567');
  assert.equal(telefonNorm('123'), null);
  assert.equal(telefonNorm(''), null);
  assert.equal(telefonNorm(null), null);
});

test('Nächster Versuch wie die Datenbank: Rückruf-Zeit, 2 Std., ab 3. Versuch 20 Std., sonst keiner', () => {
  const t = '2026-10-13T08:00:00.000Z';
  assert.equal(naechsterVersuch('nicht_erreicht', t, 1), '2026-10-13T10:00:00.000Z');
  assert.equal(naechsterVersuch('mailbox', t, 3), '2026-10-14T04:00:00.000Z');
  assert.equal(naechsterVersuch('rueckruf', t, 2, '2026-10-15T07:00:00.000Z'), '2026-10-15T07:00:00.000Z');
  assert.equal(naechsterVersuch('termin', t, 1), null);
  assert.equal(naechsterVersuch('gespraech', t, 1), null);
  const sql = lies('supabase-sql/p360-anruf-sitzung.sql');
  assert.match(sql, /v_anzahl >= 3 then interval '20 hours' else interval '2 hours'/);
});

test('Warteschlange: Reihenfolge Rückruf → neu (neueste zuerst) → erneut (wenigste Versuche) → Liste', () => {
  const leads = [
    { id: 'alt', name: 'Alt', telefon: '0711 1', created_at: iso(-600) },
    { id: 'frisch', name: 'Frisch', telefon: '0711 2', created_at: iso(-5) },
    { id: 'r', name: 'Rückruf', telefon: '0711 3', anruf_versuche: 1, letzter_anruf_ergebnis: 'rueckruf', naechster_anruf_am: iso(-10) },
    { id: 'o2', name: 'Zwei', telefon: '0711 4', anruf_versuche: 2, letzter_anruf_ergebnis: 'mailbox', naechster_anruf_am: iso(-1) },
    { id: 'o1', name: 'Eins', telefon: '0711 5', anruf_versuche: 1, letzter_anruf_ergebnis: 'besetzt', naechster_anruf_am: iso(-1) },
  ];
  const kontakte = [{ id: 'k', vorname: 'Kai', nachname: 'K', telefon: '0711 6' }];
  const w = warteschlange({ leads, kontakte, jetzt: JETZT, quellen: Q });
  assert.deepEqual(w.map((x) => x.id), ['r', 'frisch', 'alt', 'o1', 'o2', 'k']);
  assert.deepEqual(w.map((x) => x.grund), ['rueckruf', 'neu', 'neu', 'offen', 'offen', 'liste']);
  assert.equal(w[5].name, 'Kai K');
});

test('Warteschlange: wer rausfällt', () => {
  const leads = [
    { id: 'ohneTel', name: 'x', telefon: '' },
    { id: 'kunde', name: 'x', telefon: '0711 11', stufe: 'kunde' },
    { id: 'verlorenStatus', name: 'x', telefon: '0711 12', status: 'verloren' },
    { id: 'termin', name: 'x', telefon: '0711 13', anruf_versuche: 1, letzter_anruf_ergebnis: 'termin' },
    { id: 'zuOft', name: 'x', telefon: '0711 14', anruf_versuche: 6, letzter_anruf_ergebnis: 'nicht_erreicht' },
    { id: 'spaeter', name: 'x', telefon: '0711 15', anruf_versuche: 1, letzter_anruf_ergebnis: 'mailbox', naechster_anruf_am: iso(30) },
    { id: 'rueckrufTrotz6', name: 'x', telefon: '0711 16', anruf_versuche: 6, letzter_anruf_ergebnis: 'rueckruf', naechster_anruf_am: iso(-1) },
    { id: 'doppelteNummer', name: 'y', telefon: '0711 16' },
  ];
  const kontakte = [
    { id: 'widerspruch', telefon: '0711 21', werbe_widerspruch_am: '2026-01-01' },
    { id: 'mobil', vorname: 'M', mobil: '0171 22' },
    { id: 'kInteresse', telefon: '0711 23' },
  ];
  const anrufe = [{ kontakt_id: 'kInteresse', ergebnis: 'kein_interesse', erstellt_am: iso(-100) }];
  const w = warteschlange({ leads, kontakte, anrufeKontakte: anrufe, jetzt: JETZT, quellen: Q });
  assert.deepEqual(w.map((x) => x.id).sort(), ['mobil', 'rueckrufTrotz6']);
  assert.equal(w.find((x) => x.id === 'mobil').telefon, '0171' + '22');
});

test('Warteschlange: Quellen-Schalter und „nur meine"', () => {
  const leads = [
    { id: 'a', name: 'a', telefon: '0711 31', setter_user_id: 'ich' },
    { id: 'b', name: 'b', telefon: '0711 32', closer_user_id: 'ich' },
    { id: 'c', name: 'c', telefon: '0711 33', setter_user_id: 'du' },
    { id: 'r', name: 'r', telefon: '0711 34', anruf_versuche: 1, letzter_anruf_ergebnis: 'rueckruf', naechster_anruf_am: iso(-1), setter_user_id: 'ich' },
  ];
  assert.deepEqual(warteschlange({ leads, jetzt: JETZT, quellen: Q, ich: 'ich', nurMeine: true }).map((x) => x.id), ['r', 'a', 'b']);
  assert.deepEqual(warteschlange({ leads, jetzt: JETZT, quellen: { ...Q, neue: false } }).map((x) => x.id), ['r']);
  assert.deepEqual(warteschlange({ leads, jetzt: JETZT, quellen: { ...Q, rueckrufe: false } }).map((x) => x.id).sort(), ['a', 'b', 'c']);
  const kontakte = [{ id: 'k', telefon: '0711 35' }];
  assert.equal(warteschlange({ leads: [], kontakte, jetzt: JETZT, quellen: { ...Q, liste: false } }).length, 0);
});

test('Kontakt-Stand aus Anrufen: Versuche, letztes Ergebnis, nächster Versuch', () => {
  const m = kontaktStand([
    { kontakt_id: 'k', ergebnis: 'nicht_erreicht', erstellt_am: '2026-10-12T08:00:00.000Z' },
    { kontakt_id: 'k', ergebnis: 'rueckruf', rueckruf_am: '2026-10-14T07:00:00.000Z', erstellt_am: '2026-10-13T07:00:00.000Z' },
    { lead_id: 'l', ergebnis: 'termin', erstellt_am: '2026-10-13T07:00:00.000Z' },
  ]);
  assert.deepEqual(m.get('k'), { versuche: 2, letztes: 'rueckruf', letzterAm: '2026-10-13T07:00:00.000Z', naechster: '2026-10-14T07:00:00.000Z' });
  assert.equal(m.size, 1);
});

test('Rückruf-Zeit in Berliner Zeit, auch über die Zeitumstellung', () => {
  const v = rueckrufVorschlaege(JETZT);
  assert.deepEqual(v.map((x) => x.text), ['In 1 Std.', 'Heute 16:00', 'Morgen 9:00', 'Morgen 14:00', 'In 1 Woche 9:00']);
  assert.equal(v[1].iso, '2026-10-13T14:00:00.000Z');
  assert.equal(v[2].iso, '2026-10-14T07:00:00.000Z');
  assert.equal(v[4].iso, '2026-10-20T07:00:00.000Z');
  const abends = rueckrufVorschlaege(new Date('2026-10-13T15:00:00Z'));
  assert.ok(!abends.some((x) => x.text === 'Heute 16:00'), 'nach 16 Uhr kein „heute 16:00"');
  const vorUmstellung = rueckrufVorschlaege(new Date('2026-10-24T08:00:00Z'));
  assert.equal(vorUmstellung.find((x) => x.text === 'Morgen 9:00').iso, '2026-10-25T08:00:00.000Z', 'am 25.10. gilt Winterzeit');
  assert.equal(lokalZuIso('2026-10-14T09:30'), '2026-10-14T07:30:00.000Z');
  assert.equal(lokalZuIso('Quatsch'), null);
});

test('Prüfung vor dem Speichern und Zeile für die Datenbank', () => {
  assert.deepEqual(anrufPruefen('termin', null, '', JETZT), []);
  assert.equal(anrufPruefen('rueckruf', null, '', JETZT).length, 1);
  assert.equal(anrufPruefen('rueckruf', iso(-60), '', JETZT).length, 1);
  assert.equal(anrufPruefen('rueckruf', iso(400 * 1440), '', JETZT).length, 1);
  assert.deepEqual(anrufPruefen('rueckruf', iso(60), '', JETZT), []);
  assert.equal(anrufPruefen('quatsch', null, '', JETZT).length, 1);
  assert.equal(anrufPruefen('termin', null, 'x'.repeat(2001), JETZT).length, 1);
  assert.deepEqual(anrufZeile({ typ: 'kontakt', id: 'k' }, 'mailbox', iso(60), '  ', 'b', 'u'),
    { owner_user_id: 'b', user_id: 'u', lead_id: null, kontakt_id: 'k', ergebnis: 'mailbox', rueckruf_am: null, notiz: null });
  assert.equal(anrufZeile({ typ: 'lead', id: 'l' }, 'rueckruf', 'X', 'n', 'b', 'u').rueckruf_am, 'X');
});

test('Tageszahlen und „vor …"-Text', () => {
  assert.deepEqual(tagesZahlen([{ ergebnis: 'nicht_erreicht' }, { ergebnis: 'termin' }, { ergebnis: 'rueckruf' }, { ergebnis: 'mailbox' }]), { anrufe: 4, erreicht: 2, termine: 1, quote: 50 });
  assert.deepEqual(tagesZahlen([]), { anrufe: 0, erreicht: 0, termine: 0, quote: 0 });
  assert.equal(seitText(iso(-5), JETZT), 'vor 5 Min.');
  assert.equal(seitText(iso(-180), JETZT), 'vor 3 Std.');
  assert.equal(seitText(iso(-3 * 1440), JETZT), 'vor 3 Tagen');
});

test('Quelltext: SQL, Menü, Seite, Sicherung, DSGVO', () => {
  const sql = lies('supabase-sql/p360-anruf-sitzung.sql');
  assert.match(sql, /new\.erstellt_am := now\(\)/, 'Zeit vom Server');
  assert.match(sql, /new\.user_id := auth\.uid\(\)/, 'Person vom Server');
  assert.match(sql, /interval '15 minutes'/, 'Zurücknehmen 15 Minuten');
  assert.match(sql, /as restrictive/, 'freie Setter nur eigene Anrufe');
  assert.match(sql, /exception when others then new\.aktivitaet_id := null/, 'Cockpit ist Beiwerk');
  assert.doesNotMatch(sql, /drop table|truncate|policy [a-z0-9_]+ on public\.(leads|kontakte)/i, 'nie destruktiv, keine Regeln an leads/kontakte');
  const nav = NAV_LINKS.find((n) => n.href === '/dashboard/akquise/sitzung');
  assert.ok(nav, 'Menüeintrag');
  assert.equal(nav.modul, undefined, 'Unterseite ohne eigenen Modul-Schlüssel');
  const seite = lies('app/dashboard/akquise/sitzung/page.tsx');
  assert.match(seite, /href=\{`tel:\$\{aktuell\.telefon\}`\}/);
  assert.match(seite, /Werbeanrufe bei Verbrauchern sind nur mit vorheriger ausdrücklicher Einwilligung/);
  assert.doesNotMatch(seite, /haben Sie nicht|Ihre Liste/, 'Mitarbeitertexte anredefrei');
  assert.match(lies('lib/sicherungTabellen.ts'), /'vk_anruf'/);
  assert.match(lies('lib/dsgvoDaten.ts'), /tabelle: 'vk_anruf'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/akquise\/sitzung'/);
  assert.match(lies('app/dashboard/akquise/page.tsx'), /\/dashboard\/akquise\/sitzung/);
});
