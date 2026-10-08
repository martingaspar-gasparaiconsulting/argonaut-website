// ============================================================================
// tests/kfzProbefahrtP270.test.mjs — Paket 270 (08.10.2026) · K9 Probefahrt und Vorführwagen
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  naechsteFahrtNr, kzGueltig, freieKennzeichen, gefahren, mehrKm, ueberfaellig, nachfassDatum, nachfassFaellig,
  startPruefen, rueckgabePruefen, fahrtenliste, fahrtDokument, fahrtenlisteDokument, fahrtDateiName, kzNorm, plusTage,
} from '../out/kfzProbefahrt.js';
import { alsText } from '../out/kfzVerkauf.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const HEUTE = '2026-10-08';
const fahrt = (x = {}) => ({
  nr: 'P-0001', art: 'probefahrt', status: 'geplant', fahrer_name: 'Max Muster', fahrer_anschrift: 'Teststraße 1\n71032 Böblingen',
  fahrer_tel: '0170 1', fahrer_email: null, fs_geprueft: true, fs_klasse: 'B', fs_gueltig_bis: null, begleitet: true,
  kennzeichen_art: 'eigen', kennzeichen: null, start_am: '2026-10-08T08:00:00.000Z', ende_geplant: '2026-10-08T09:00:00.000Z', rueck_am: null,
  km_start: 85000, km_ende: null, km_frei: null, tank_start: 'voll', tank_ende: null, schaeden_start: null, schaeden_ende: null,
  selbstbeteiligung: null, nachfass_am: null, nachfass_erledigt: false, ergebnis: null, notiz: null, ...x,
});
const fz = (x = {}) => ({ interne_nr: 'F-0007', marke: 'Testmarke', modell: 'Kombi', fin: 'WVWZZZ1KZAW000001', kennzeichen: 'BB-AB 123', km_stand: 85000, ...x });
const ROT = [{ kennzeichen: 'BB-06123', art: 'rot', gueltig_bis: null, aktiv: true }, { kennzeichen: 'BB-K 99', art: 'kurzzeit', gueltig_bis: '2026-10-07', aktiv: true }];

test('Nummer, Kennzeichen-Gültigkeit und freie Kennzeichen', () => {
  assert.equal(naechsteFahrtNr(['P-0003', null, 'X-9', 'P-0010']), 'P-0011');
  assert.equal(naechsteFahrtNr([]), 'P-0001');
  assert.equal(kzGueltig(ROT[0], HEUTE), true);            // rot ohne Ende
  assert.equal(kzGueltig(ROT[1], HEUTE), false);           // Kurzzeit abgelaufen
  assert.equal(kzGueltig({ ...ROT[1], gueltig_bis: null }, HEUTE), false);  // Kurzzeit ohne Datum nie
  assert.equal(kzGueltig({ ...ROT[0], aktiv: false }, HEUTE), false);
  assert.equal(kzNorm(' bb-06123 '), 'BB-06123');
  assert.equal(freieKennzeichen(ROT, [{ kennzeichen: 'bb-06123', kennzeichen_art: 'rot', status: 'unterwegs' }], HEUTE).length, 0);
  assert.equal(freieKennzeichen(ROT, [{ kennzeichen: 'bb-06123', kennzeichen_art: 'rot', status: 'zurueck' }], HEUTE).length, 1);
});

test('Start: Führerschein, Anschrift, km, Tank, Rückgabezeit, Kennzeichen — Überführung ohne Anschrift', () => {
  assert.deepEqual(startPruefen(fahrt(), fz(), ROT, HEUTE).fehler, []);
  const f1 = startPruefen(fahrt({ fs_geprueft: false, fs_klasse: '', fahrer_anschrift: '', tank_start: null, km_start: null, ende_geplant: null }), fz(), ROT, HEUTE).fehler;
  for (const m of [/Führerschein nicht/, /Führerscheinklasse/, /Anschrift/, /Tankstand/, /Kilometerstand/, /Geplante Rückgabe/]) assert.ok(f1.some((x) => m.test(x)), String(m));
  assert.ok(startPruefen(fahrt({ fs_gueltig_bis: '2026-10-01' }), fz(), ROT, HEUTE).fehler.some((x) => /abgelaufen/.test(x)));
  assert.ok(startPruefen(fahrt({ ende_geplant: '2026-10-08T07:00:00.000Z' }), fz(), ROT, HEUTE).fehler.some((x) => /vor dem Start/.test(x)));
  assert.deepEqual(startPruefen(fahrt({ art: 'ueberfuehrung', fahrer_anschrift: '' }), fz(), ROT, HEUTE).fehler, []);
  // Kennzeichen
  assert.ok(startPruefen(fahrt(), fz({ kennzeichen: null }), ROT, HEUTE).fehler.some((x) => /kein Kennzeichen/.test(x)));
  assert.deepEqual(startPruefen(fahrt({ kennzeichen_art: 'rot', kennzeichen: 'bb-06123' }), fz({ kennzeichen: null }), ROT, HEUTE).fehler, []);
  assert.ok(startPruefen(fahrt({ kennzeichen_art: 'rot', kennzeichen: 'BB-06123' }), fz(), ROT, HEUTE).hinweise.some((x) => /Fahrzeugscheinheft/.test(x)));
  assert.ok(startPruefen(fahrt({ kennzeichen_art: 'kurzzeit', kennzeichen: 'BB-K 99' }), fz(), ROT, HEUTE).fehler.some((x) => /nicht mehr gültig/.test(x)));
  assert.ok(startPruefen(fahrt({ kennzeichen_art: 'rot', kennzeichen: 'XX-1' }), fz(), ROT, HEUTE).fehler.some((x) => /nicht als rotes/.test(x)));
  assert.ok(startPruefen(fahrt({ km_start: 80000 }), fz(), ROT, HEUTE).hinweise.some((x) => /unter dem Stand/.test(x)));
  assert.ok(startPruefen(fahrt({ begleitet: false }), fz(), ROT, HEUTE).hinweise.some((x) => /Unbegleitete/.test(x)));
});

test('Rückgabe: km, Tank, Mehr-km, Überfällig, Nachfass nur bei Probefahrt und Vorführwagen', () => {
  assert.ok(rueckgabePruefen(fahrt({ status: 'unterwegs' })).fehler.length === 2);
  assert.ok(rueckgabePruefen(fahrt({ km_ende: 84000, tank_ende: 'voll' })).fehler.some((x) => /unter dem Stand/.test(x)));
  const r = rueckgabePruefen(fahrt({ km_ende: 85150, km_frei: 100, tank_ende: '1/2', schaeden_ende: 'Kratzer' }));
  assert.deepEqual(r.fehler, []);
  assert.equal(r.hinweise.length, 3);
  assert.equal(gefahren(fahrt({ km_ende: 85150 })), 150);
  assert.equal(gefahren(fahrt({ km_ende: 84000 })), null);
  assert.equal(mehrKm(fahrt({ km_ende: 85150, km_frei: 100 })), 50);
  assert.equal(mehrKm(fahrt({ km_ende: 85150 })), 0);
  assert.equal(ueberfaellig(fahrt({ status: 'unterwegs' }), '2026-10-08T09:30:00.000Z'), true);
  assert.equal(ueberfaellig(fahrt({ status: 'zurueck' }), '2026-10-08T09:30:00.000Z'), false);
  assert.equal(nachfassDatum('probefahrt', '2026-10-08T15:00:00.000Z'), '2026-10-10');
  assert.equal(nachfassDatum('vorfuehrwagen', '2026-10-31T15:00:00.000Z'), '2026-11-02');
  assert.equal(nachfassDatum('ersatzwagen', '2026-10-08T15:00:00.000Z'), null);
  assert.equal(nachfassDatum('ueberfuehrung', '2026-10-08T15:00:00.000Z'), null);
  assert.equal(nachfassFaellig(fahrt({ status: 'zurueck', nachfass_am: '2026-10-08' }), HEUTE), true);
  assert.equal(nachfassFaellig(fahrt({ status: 'zurueck', nachfass_am: '2026-10-09' }), HEUTE), false);
  assert.equal(nachfassFaellig(fahrt({ status: 'zurueck', nachfass_am: '2026-10-08', nachfass_erledigt: true }), HEUTE), false);
  assert.equal(plusTage('2026-12-31', 1), '2027-01-01');
});

test('Unterlagen: keine Führerscheinnummer, Schäden nie geschönt, Selbstbeteiligung, Fahrtenliste', () => {
  const v = fahrtDokument('vereinbarung', fahrt({ selbstbeteiligung: 1000, km_frei: 50 }), fz(), null, HEUTE);
  const txt = alsText(v);
  assert.match(txt, /Vorgelegt und geprüft: ja/);
  assert.doesNotMatch(txt, /Führerscheinnummer|Nummer des Führerscheins/);
  assert.match(txt, /Selbstbeteiligung der Fahrzeugversicherung von 1\.000,00 €/);
  assert.match(txt, /Vorhandene Schäden: keine erfasst/);
  assert.match(txt, /höchstens 50 km/);
  assert.match(alsText(fahrtDokument('vereinbarung', fahrt(), fz(), null, HEUTE)), /gesetzlichen Regeln/);
  const u = alsText(fahrtDokument('vereinbarung', fahrt({ art: 'ueberfuehrung' }), fz(), null, HEUTE));
  assert.match(u, /ausschließlich der Überführung/);
  const rg = alsText(fahrtDokument('rueckgabe', fahrt({ status: 'zurueck', km_ende: 85150, tank_ende: '1/2', schaeden_ende: 'Delle Tür hinten links' }), fz(), null, HEUTE));
  assert.match(rg, /Gefahren: 150 km/);
  assert.match(rg, /Bei Rückgabe: Delle Tür hinten links/);
  const rot = alsText(fahrtDokument('vereinbarung', fahrt({ kennzeichen_art: 'rot', kennzeichen: 'bb-06123' }), fz(), null, HEUTE));
  assert.match(rot, /BB-06123 \(rotes Kennzeichen\)/);
  const zeilen = [
    { ...fahrt({ nr: 'P-0002', status: 'zurueck', kennzeichen_art: 'rot', kennzeichen: 'BB-06123', start_am: '2026-10-05T08:00:00Z' }), fahrzeug: 'A', fin: null },
    { ...fahrt({ nr: 'P-0001', status: 'zurueck', kennzeichen_art: 'rot', kennzeichen: 'bb-06123', start_am: '2026-10-01T08:00:00Z' }), fahrzeug: 'B', fin: null },
    { ...fahrt({ nr: 'P-0003', status: 'storniert', kennzeichen_art: 'rot', kennzeichen: 'BB-06123' }), fahrzeug: 'C', fin: null },
    { ...fahrt({ nr: 'P-0004', status: 'zurueck', kennzeichen_art: 'eigen', kennzeichen: 'BB-06123' }), fahrzeug: 'D', fin: null },
  ];
  const l = fahrtenliste(zeilen, 'BB-06123');
  assert.deepEqual(l.map((z) => z.nr), ['P-0001', 'P-0002']);
  assert.equal(fahrtenlisteDokument('BB-06123', l, null, HEUTE).abschnitte.length, 2);
  assert.equal(fahrtDateiName('rueckgabe', 'P-0001'), 'Rueckgabeprotokoll-P-0001.pdf');
});

test('Verdrahtung: Reiter, Übersicht, Menü, SQL additiv mit Doppel-Schutz', () => {
  const akte = lies('app/dashboard/kfz/bestand/[id]/page.tsx');
  assert.ok(akte.includes("['probefahrt', 'Probefahrt']") && akte.includes('<KfzProbefahrt '));
  const tab = lies('app/dashboard/kfz/bestand/KfzProbefahrt.tsx');
  assert.ok(tab.includes('const p = startPruefen(') && tab.includes('const p = rueckgabePruefen('));
  assert.ok(tab.includes("from('erinnerung').insert("));
  assert.ok(tab.includes("if (!aktiv || !istChef || aktiv.status !== 'geplant') return;"));
  assert.ok(lies('lib/rechte.ts').includes("href: '/dashboard/kfz/probefahrt'"));
  assert.ok(lies('lib/guideWissen.ts').includes("'/dashboard/kfz/probefahrt': {"));
  const sql = lies('supabase-sql/p270-kfz-probefahrt.sql');
  assert.doesNotMatch(sql, /drop table|drop column|delete from|truncate/i);
  assert.match(sql, /kfz_probefahrt_ein_laufender_uq on public\.kfz_probefahrt \(bestand_id\) where status = 'unterwegs'/);
  assert.match(sql, /kfz_probefahrt_kz_laufend_uq/);
  assert.doesNotMatch(sql, /fs_nummer|fuehrerschein_nr/);
});
