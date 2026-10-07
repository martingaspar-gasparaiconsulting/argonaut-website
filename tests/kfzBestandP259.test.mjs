// ============================================================================
// tests/kfzBestandP259.test.mjs — Paket 259 (07.10.2026)
// Branchen-Vorlage (Kern) + K1 Fahrzeugbestand Teil 1
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { vorlageFuer, mitKunde, feinschliffName, standtageAmpel, bekannteModule } from '../out/branchenVorlage.js';
import { standtage, imBestand, finPruefen, ezText, ezAusEingabe, passtSuche, regelPasst, summen, preisNachProzent, naechsteNr, euro, psAusKw } from '../out/kfzBestand.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = '2026-10-07';
const fz = (x = {}) => ({
  id: 'a', interne_nr: 'F-0001', status: 'bestand', sparte: 'Pkw', marke: 'Porsche', modell: '911 Carrera S', variante: 'PDK',
  fin: 'WP0ZZZ99ZNS201447', kennzeichen: 'BB-AM 911', erstzulassung: '2022-03-01', km_stand: 18400, leistung_kw: 331,
  kraftstoff: 'Benzin', farbe: 'Schwarz', farbcode: 'C9X', standort_id: 's1', eingang_am: '2026-06-02', verkauft_am: null,
  ek_netto: 118500, vk_brutto: 134900, besteuerung: '25a', inseriert: true, notiz: null, ...x,
});

test('Vorlage Kfz: Grund-Vorlage vollständig, unbekanntes Modul = null', () => {
  const v = vorlageFuer('kfz-bestand', null);
  assert.ok(v);
  assert.deepEqual(v.status.map((s) => s.key), ['zulauf', 'aufbereitung', 'bestand', 'reserviert', 'verkauft', 'archiv']);
  assert.deepEqual(v.ampel, { gruenBis: 60, gelbBis: 90 });
  assert.ok(v.spalten.find((s) => s.key === 'ek' && s.sichtbar === false), 'Einkaufspreis standardmäßig ausgeblendet');
  assert.ok(v.suchen.length >= 4);
  assert.equal(vorlageFuer('gibt-es-nicht', 'Kfz-Handel'), null);
  assert.deepEqual(bekannteModule(), ['kfz-bestand']);
});

test('Vorlage: Feinschliff je Branche (Motorrad, Boote, Caravan), Grund bleibt unberührt', () => {
  const m = vorlageFuer('kfz-bestand', 'Motorradhandel & Zubehör');
  assert.ok(m.sparten.includes('Roller'));
  assert.equal(feinschliffName('kfz-bestand', 'Motorradhandel & Zubehör'), 'Motorradhandel');
  const b = vorlageFuer('kfz-bestand', 'Boots- und Yachthandel');
  assert.equal(b.einheit, 'Boot');
  assert.equal(b.titel, 'Bootsbestand');
  const c = vorlageFuer('kfz-bestand', 'Caravan & Wohnmobil');
  assert.deepEqual(c.ampel, { gruenBis: 90, gelbBis: 150 });
  assert.equal(feinschliffName('kfz-bestand', 'Kfz-Handel'), null);
  // Kopie: Änderungen am Ergebnis dürfen die Vorlage nicht verändern
  const v1 = vorlageFuer('kfz-bestand', null); v1.status[0].label = 'X'; v1.sparten.push('Y');
  const v2 = vorlageFuer('kfz-bestand', null);
  assert.equal(v2.status[0].label, 'Im Zulauf');
  assert.ok(!v2.sparten.includes('Y'));
});

test('Kunde gewinnt, Vorlagen-Status gehen nie verloren', () => {
  const v = vorlageFuer('kfz-bestand', null);
  const k = mitKunde(v, {
    statusLabels: { bestand: 'Auf dem Hof', unbekannt: 'egal' },
    statusExtra: [{ key: 'kommission', label: 'Kommission', farbe: 'info' }, { key: 'bestand', label: 'doppelt', farbe: 'ok' }, { key: '', label: 'leer' }],
    spaltenSichtbar: { ek: true, fin: true, gibtsnicht: true },
    ampel: { gruenBis: 45, gelbBis: 30 },
    suchen: [{ key: 'ueber90', name: 'Über 120 Tage', regel: 'standtage>120' }, { key: 'eigen-1', name: 'Nur Diesel', regel: 'sparte=Pkw' }],
    sparten: [' Pkw ', '', 'Pkw', 'Transporter'],
    standkostenTag: -5,
  });
  assert.equal(k.status.find((s) => s.key === 'bestand').label, 'Auf dem Hof');
  assert.equal(k.status.length, 7, '6 Vorlage + 1 eigener, Doppelte und Leere ignoriert');
  for (const key of ['zulauf', 'aufbereitung', 'bestand', 'reserviert', 'verkauft', 'archiv']) assert.ok(k.status.some((s) => s.key === key), key);
  assert.equal(k.spalten.find((s) => s.key === 'ek').sichtbar, true);
  assert.ok(!k.spalten.some((s) => s.key === 'gibtsnicht'));
  assert.deepEqual(k.ampel, { gruenBis: 45, gelbBis: 45 }, 'gelb nie unter grün');
  assert.equal(k.suchen.find((s) => s.key === 'ueber90').regel, 'standtage>120');
  assert.ok(k.suchen.some((s) => s.key === 'eigen-1'));
  assert.deepEqual(k.sparten, ['Pkw', 'Transporter']);
  assert.equal(k.standkostenTag, 9, 'negativer Wert -> Vorlage');
  assert.deepEqual(mitKunde(v, null), v);
  assert.deepEqual(mitKunde(v, 'kaputt'), v);
});

test('Standtage-Ampel', () => {
  const a = { gruenBis: 60, gelbBis: 90 };
  assert.equal(standtageAmpel(0, a), 'ok');
  assert.equal(standtageAmpel(60, a), 'ok');
  assert.equal(standtageAmpel(61, a), 'warn');
  assert.equal(standtageAmpel(90, a), 'warn');
  assert.equal(standtageAmpel(91, a), 'bad');
  assert.equal(standtageAmpel(null, a), 'dim');
});

test('Standtage: ab Eingang, bis Verkauf, Zulauf ohne Wert', () => {
  assert.equal(standtage(fz(), HEUTE), 127);
  assert.equal(standtage(fz({ status: 'verkauft', verkauft_am: '2026-06-12' }), HEUTE), 10);
  assert.equal(standtage(fz({ status: 'zulauf' }), HEUTE), null);
  assert.equal(standtage(fz({ eingang_am: null }), HEUTE), null);
  assert.equal(standtage(fz({ eingang_am: '2026-12-01' }), HEUTE), 0, 'nie negativ');
  assert.ok(imBestand('reserviert') && !imBestand('verkauft') && !imBestand('archiv'));
});

test('FIN-Prüfung', () => {
  assert.deepEqual(finPruefen(' wp0zzz99zns-201447 '), { ok: true, fin: 'WP0ZZZ99ZNS201447' });
  assert.deepEqual(finPruefen(''), { ok: true, fin: null });
  assert.equal(finPruefen('WP0ZZZ99ZNS20144O').ok, false, 'O verboten');
  assert.match(finPruefen('WP0ZZZ99ZNS20144O').fehler, /I, O oder Q/);
  assert.equal(finPruefen('WP0ZZZ99ZNS2014').ok, false, 'zu kurz');
  assert.equal(finPruefen('WP0ZZZ99ZNS20144Ä').ok, false);
  assert.match(finPruefen('WP0ZZZ99ZNS2014').fehler, /15/);
});

test('Erstzulassung lesen und zeigen', () => {
  assert.equal(ezAusEingabe('03/2022'), '2022-03-01');
  assert.equal(ezAusEingabe('3.2022'), '2022-03-01');
  assert.equal(ezAusEingabe('2022-11'), '2022-11-01');
  assert.equal(ezAusEingabe('13/2022'), null);
  assert.equal(ezAusEingabe('irgendwann'), null);
  assert.equal(ezText('2022-03-01'), '03/2022');
  assert.equal(ezText(null), '—');
});

test('Suche und gespeicherte Suchen', () => {
  assert.ok(passtSuche(fz(), 'porsche 911'));
  assert.ok(passtSuche(fz(), 'BB-AM'));
  assert.ok(!passtSuche(fz(), 'audi'));
  assert.ok(regelPasst(fz(), 'standtage>90', HEUTE));
  assert.ok(!regelPasst(fz({ eingang_am: '2026-09-30' }), 'standtage>90', HEUTE));
  assert.ok(regelPasst(fz(), 'vk>=80000&besteuerung=25a', HEUTE));
  assert.ok(!regelPasst(fz({ vk_brutto: null }), 'vk>=80000', HEUTE), 'ohne Preis kein Treffer');
  assert.ok(regelPasst(fz({ inseriert: false }), 'inseriert=nein', HEUTE));
  assert.ok(!regelPasst(fz({ status: 'verkauft' }), 'vk>=80000', HEUTE), 'Verkaufte nur mit Status-Regel');
  assert.ok(regelPasst(fz({ status: 'verkauft' }), 'status=verkauft', HEUTE));
  assert.ok(!regelPasst(fz(), 'farbe=Schwarz', HEUTE), 'unbekanntes Feld = kein Treffer');
  assert.ok(!regelPasst(fz(), '', HEUTE));
  assert.ok(!regelPasst(fz(), 'vk>=viel', HEUTE));
});

test('Summen: nur aktiver Bestand, EK nie erfunden', () => {
  const l = [fz(), fz({ id: 'b', ek_netto: null, vk_brutto: 40000, eingang_am: '2026-09-07' }), fz({ id: 'c', status: 'verkauft', ek_netto: 1, vk_brutto: 1 })];
  const s = summen(l, HEUTE);
  assert.equal(s.anzahl, 2);
  assert.equal(s.ekSumme, 118500);
  assert.equal(s.ohneEk, 1);
  assert.equal(s.vkSumme, 174900);
  assert.equal(s.standtageSchnitt, Math.round((127 + 30) / 2));
  const leer = summen([fz({ ek_netto: null, vk_brutto: null, eingang_am: null })], HEUTE);
  assert.equal(leer.ekSumme, null);
  assert.equal(leer.vkSumme, null);
  assert.equal(leer.standtageSchnitt, null);
});

test('Preis um Prozent, interne Nummer, Anzeige', () => {
  assert.equal(preisNachProzent(134900, -2), 132200);
  assert.equal(preisNachProzent(43980, 3), 45300);
  assert.equal(preisNachProzent(null, -2), null);
  assert.equal(preisNachProzent(0, 5), null);
  assert.equal(preisNachProzent(1000, -150), 0);
  assert.equal(naechsteNr([]), 'F-0001');
  assert.equal(naechsteNr(['F-0009', null, 'X-77', 'F-0012']), 'F-0013');
  assert.equal(euro(134900), '134.900 €');
  assert.equal(euro(null), '—');
  assert.equal(psAusKw(331), 450);
  assert.equal(psAusKw(null), null);
});

test('SQL 259: additiv, Besitzer = Betrieb, Preisverlauf nur per Auslöser, Löschen nur Chef', () => {
  const s = lies('supabase-sql/p259-kfz-bestand.sql');
  assert.doesNotMatch(s, /drop table|truncate|delete from|alter table [^\n]*drop/i);
  assert.match(s, /create table if not exists public\.kfz_bestand \(/);
  assert.match(s, /execute function public\.p181_besitzer\(\)/);
  assert.match(s, /fin ~ '\^\[A-HJ-NPR-Z0-9\]\{17\}\$'/);
  assert.match(s, /after insert or update of vk_brutto on public\.kfz_bestand/);
  // Mitarbeiter: keine Lösch-Regel, Preisverlauf ohne Schreib-Regel, Einstellungen nur lesen
  assert.doesNotMatch(s, /for delete/i);
  const preis = s.split('-- kfz_bestand_preis: nur lesen')[1].split('-- modul_einstellung')[0];
  assert.doesNotMatch(preis, /for (insert|update|all)/);
  const einst = s.split('-- modul_einstellung: Chef schreibt')[1];
  assert.match(einst, /modein_ma_select on public\.modul_einstellung for select/);
  assert.doesNotMatch(einst.replace(/modein_owner_all[\s\S]*?;\n/g, ''), /for (insert|update|all)/);
});

test('Seite, Menü, Hub und Wissen', async () => {
  const p = lies('app/dashboard/kfz/bestand/page.tsx');
  assert.match(p, /finPruefen\(form\.fin\)/);
  assert.match(p, /vorlageFuer\(MODUL, branche\)/);
  assert.match(p, /mitKunde\(v, einstellung\)/);
  assert.match(p, /insert\(\{ \.\.\.zeile, owner_user_id: besitzer, interne_nr: nr \}\)/, 'Neues Fahrzeug gehört dem Betrieb');
  assert.doesNotMatch(p, /window\.confirm/, 'Rückfrage in der Seite, nicht als Browser-Dialog');
  assert.doesNotMatch(p, /\bdu\b|\bdein|KI-Agent/i);
  assert.match(lies('app/dashboard/kfz/page.tsx'), /href="\/dashboard\/kfz\/bestand"/);
  const { mitarbeiterDarf, NAV_LINKS } = await import('../out/rechte.js');
  const e = NAV_LINKS.find((l) => l.href === '/dashboard/kfz/bestand');
  assert.ok(e, 'Menüeintrag fehlt');
  assert.equal(e.modul, undefined);
  for (const r of [[], ['kfz'], ['shop']]) assert.equal(mitarbeiterDarf('/dashboard/kfz/bestand', r), mitarbeiterDarf('/dashboard/kfz', r));
  const { WISSEN } = await import('../out/guideWissen.js');
  assert.ok(WISSEN['/dashboard/kfz/bestand']);
  assert.match(WISSEN['/dashboard/kfz/bestand'].werText, /Geschäftsleitung/);
});
