// ============================================================================
// tests/kontaktVorlageP312.test.mjs — Paket 312 (11.10.2026) · BV2 Kunden
// Kontakte (CRM) nach Branchen-Vorlage: Status-Namen je Branche, Schlüssel
// fest, Betreuungs-Ampel mit Kalendertagen, Schnellsuche, Kunde gewinnt.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vorlageFuer, mitKunde, feinschliffName, bekannteModule } from '../out/branchenVorlage.js';
import { kontaktAmpel, suchePasst, zaehlen, intervallVon, tageSeitKontakt, wiedervorlageFaellig } from '../out/kontaktVorlage.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const H = '2026-10-11';
const KEYS = ['interessent', 'aktiv', 'kunde', 'inaktiv'];

test('Kontakte-Vorlage: Grund wie bisher, Schlüssel in jeder Branche gleich', () => {
  assert.ok(bekannteModule().includes('kontakte'));
  const g = vorlageFuer('kontakte', '');
  assert.equal(g.kundenWort, 'Kunden');
  assert.equal(g.intervallTage, 30);
  assert.deepEqual(g.status.map((s) => s.label), ['Interessent', 'Aktiv', 'Kunde', 'Inaktiv']);
  for (const b of ['', 'Maler und Lackierer', 'Steuerberatung', 'Eventmanagement', 'Werbeagentur', 'Bäckerei']) {
    const v = vorlageFuer('kontakte', b);
    assert.deepEqual(v.status.map((s) => s.key), KEYS, b);
    assert.deepEqual(v.spalten.map((s) => s.key), ['firma', 'kontakt', 'letzter', 'wiedervorlage', 'quelle'], b);
    assert.equal(feinschliffName('kontakte', b), feinschliffName('auftraege', b), b);
  }
});

test('Feinschliff: Handwerk 180 Tage, Kanzlei Mandanten, Agentur Lead', () => {
  const hw = vorlageFuer('kontakte', 'Dachdecker');
  assert.equal(hw.intervallTage, 180);
  assert.equal(hw.status[0].label, 'Anfrage');
  assert.equal(hw.status[3].label, 'Ruht');
  assert.equal(hw.suchen[0].name, 'Kunden lange nicht gehört');
  const ka = vorlageFuer('kontakte', 'Rechtsanwälte');
  assert.equal(ka.kundenWort, 'Mandanten');
  assert.equal(ka.status[2].label, 'Mandant');
  assert.equal(ka.intervallTage, 90);
  assert.equal(vorlageFuer('kontakte', 'IT und Systemhaus').status[0].label, 'Lead');
  assert.equal(vorlageFuer('kontakte', 'Catering').intervallTage, 90);
  assert.equal(vorlageFuer('kontakte', 'Bäckerei').intervallTage, 30);
});

test('Kunde gewinnt: Namen, Spalten, Kunden-Wort, Intervall begrenzt', () => {
  const v = mitKunde(vorlageFuer('kontakte', 'Maler'), {
    statusLabels: { kunde: 'Stammkunde', inaktiv: '' }, spaltenSichtbar: { quelle: true, firma: false },
    kundenWort: '  Auftraggeber  ', intervallTage: 5000,
  });
  assert.equal(v.status[2].label, 'Stammkunde');
  assert.equal(v.status[3].label, 'Ruht');
  assert.equal(v.spalten.find((s) => s.key === 'quelle').sichtbar, true);
  assert.equal(v.spalten.find((s) => s.key === 'firma').sichtbar, false);
  assert.equal(v.kundenWort, 'Auftraggeber');
  assert.equal(v.intervallTage, 730);
  assert.equal(mitKunde(vorlageFuer('kontakte', ''), { intervallTage: 0 }).intervallTage, 1);
  assert.equal(mitKunde(vorlageFuer('kontakte', ''), { intervallTage: -4 }).intervallTage, 30);
  assert.equal(mitKunde(vorlageFuer('kontakte', ''), { kundenWort: '   ' }).kundenWort, 'Kunden');
  // andere Module bekommen keine Kontakt-Felder
  assert.equal(mitKunde(vorlageFuer('auftraege', ''), { kundenWort: 'X', intervallTage: 9 }).kundenWort, undefined);
  assert.equal(mitKunde(vorlageFuer('projekte', ''), { intervallTage: 9 }).intervallTage, undefined);
});

test('Ampel: im Takt grün, bis doppelt gelb, danach rot, nie kontaktiert neutral', () => {
  assert.equal(kontaktAmpel({ letzter_kontakt_am: '2026-09-11T09:00:00Z', betreuungs_intervall_tage: 30 }, H), 'gruen');
  assert.equal(kontaktAmpel({ letzter_kontakt_am: '2026-09-10', betreuungs_intervall_tage: 30 }, H), 'gelb');
  assert.equal(kontaktAmpel({ letzter_kontakt_am: '2026-08-12', betreuungs_intervall_tage: 30 }, H), 'gelb');
  assert.equal(kontaktAmpel({ letzter_kontakt_am: '2026-08-11', betreuungs_intervall_tage: 30 }, H), 'rot');
  assert.equal(kontaktAmpel({ letzter_kontakt_am: null }, H), 'neutral');
  assert.equal(kontaktAmpel({ letzter_kontakt_am: 'Quatsch' }, H), 'neutral');
  // ohne eigenes Intervall gilt das der Vorlage
  assert.equal(kontaktAmpel({ letzter_kontakt_am: '2026-06-01' }, H, 180), 'gruen');
  assert.equal(kontaktAmpel({ letzter_kontakt_am: '2026-06-01' }, H), 'rot');
  assert.equal(intervallVon({ betreuungs_intervall_tage: 0 }, 90), 90);
  assert.equal(intervallVon({ betreuungs_intervall_tage: 14.7 }, 90), 14);
  assert.equal(intervallVon({}, 0), 30);
  assert.equal(tageSeitKontakt({ letzter_kontakt_am: '2026-10-01' }, H), 10);
});

test('Suchen und Kennzahlen', () => {
  assert.equal(suchePasst('ampel=rot', {}, 'rot', H), true);
  assert.equal(suchePasst('ampel=gelb', {}, 'rot', H), false);
  assert.equal(wiedervorlageFaellig({ naechster_kontakt_am: '2026-10-11T20:00:00Z' }, H), true);
  assert.equal(wiedervorlageFaellig({ naechster_kontakt_am: '2026-10-12' }, H), false);
  assert.equal(suchePasst('wiedervorlage=faellig', { naechster_kontakt_am: '2026-10-01' }, 'gruen', H), true);
  assert.equal(suchePasst('kontakt=nie', { status: 'interessent' }, 'neutral', H), true);
  assert.equal(suchePasst('kontakt=nie', { status: 'inaktiv' }, 'neutral', H), false);
  assert.equal(suchePasst('kontakt=nie', {}, 'gruen', H), false);
  assert.equal(suchePasst('email=leer', { email: ' ' }, 'gruen', H), true);
  assert.equal(suchePasst('email=leer', { email: 'a@example.com' }, 'gruen', H), false);
  assert.equal(suchePasst('email=leer', { status: 'inaktiv' }, 'gruen', H), false);
  assert.equal(suchePasst('irgendwas', {}, 'rot', H), false);
  for (const b of ['', 'Maler', 'Notare', 'Hochzeitsplanung', 'Softwareentwicklung']) for (const s of vorlageFuer('kontakte', b).suchen) {
    assert.ok(/^(ampel=(rot|gelb|gruen)|wiedervorlage=faellig|kontakt=nie|email=leer)$/.test(s.regel), s.regel);
  }
  const liste = [
    { status: 'kunde', letzter_kontakt_am: '2026-10-01', betreuungs_intervall_tage: 30 },
    { status: 'kunde', letzter_kontakt_am: '2026-05-01', betreuungs_intervall_tage: 30, naechster_kontakt_am: '2026-10-11' },
    { status: 'interessent' },
    { status: 'aktiv', letzter_kontakt_am: '2026-08-20', betreuungs_intervall_tage: 30 },
  ];
  assert.deepEqual(zaehlen(liste, H), { gesamt: 4, kunden: 2, wiedervorlage: 1, einschlafend: 1, bald: 1 });
});

test('Code-Wächter: CRM-Liste und Kontakt-Akte nutzen die Vorlage', () => {
  const seite = lies('app/dashboard/crm/page.tsx');
  assert.match(seite, /useBranchenVorlage\(supabase, KONTAKT_MODUL\)/);
  assert.match(seite, /suchePasst\(regel, k, kontaktAmpel\(k, heuteTag, standardIv\), heuteTag\)/);
  assert.match(seite, /<KpiKarte label=\{kundenWort\}/);
  assert.match(seite, /betreuungs_intervall_tage: standardIv/);
  assert.doesNotMatch(seite, /betreuungs_intervall_tage \|\| 30|parseInt\(form\.betreuungs_intervall_tage/);
  assert.doesNotMatch(seite, /\{s\}\s*<\/option>/);
  const akte = lies('app/dashboard/crm/[id]/page.tsx');
  assert.match(akte, /useBranchenVorlage\(supabase, KONTAKT_MODUL\)/);
  assert.doesNotMatch(akte, /betreuungs_intervall_tage \|\| 30|parseInt\(form\.betreuungs_intervall_tage/);
  assert.match(akte, /<Info label="Status" wert=\{kontakt\.status \? statusLabel/);
  const ansicht = lies('app/dashboard/crm/KontaktAnsicht.tsx');
  assert.match(ansicht, /KONTAKT_MODUL = 'kontakte'/);
  assert.match(ansicht, /owner_user_id: betrieb, modul: KONTAKT_MODUL/);
  assert.equal((ansicht.match(/disabled=\{!istChef\}/g) || []).length, 4);
  const hook = lies('app/dashboard/auftraege/useAuftragVorlage.ts');
  assert.match(hook, /useBranchenVorlage\(supabase, AUFTRAG_MODUL\)/);
});
