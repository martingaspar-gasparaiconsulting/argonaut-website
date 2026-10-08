// ============================================================================
// tests/kfzTresorP277.test.mjs — Paket 277 (08.10.2026) · K13 Brief-Tresor und Aufbereitung
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  eintragPruefen, statusWechsel, ueberfaellig, briefLage, zulassungFortschritt, unterlagenBereinigen, evbPruefen,
  zulassungStatusPruefen, kzNorm, aufbereitungAuftrag, istInternerAuftrag, kostenUebernahme, kostenBezeichnung, restOffenAus,
  artName, statusName, ZULASSUNG_ARTEN, INTERN_KUNDE,
} from '../out/kfzTresor.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const HEUTE = '2026-10-08';
const JETZT = '2026-10-08T10:00:00.000Z';

test('Tresor-Eintrag prüfen', () => {
  assert.deepEqual(eintragPruefen({ art: 'zb2', ort: ' Tresor Fach 3 ' }), { ok: true, felder: { art: 'zb2', bezeichnung: null, anzahl: 1, ort: 'Tresor Fach 3', status: 'im_haus' } });
  assert.equal(eintragPruefen({ art: 'schluessel', anzahl: 2, status: 'fehlt' }).felder.status, 'fehlt');
  assert.equal(eintragPruefen({ art: 'kaputt' }).ok, false);
  assert.equal(eintragPruefen({ art: 'schluessel', anzahl: 0 }).ok, false);
  assert.equal(eintragPruefen({ art: 'schluessel', anzahl: 1.5 }).ok, false);
  assert.equal(eintragPruefen({ art: 'schluessel', anzahl: 21 }).ok, false);
  assert.equal(eintragPruefen({ art: 'zb2', status: 'ausgegeben' }).ok, false, 'neu nie direkt ausgegeben');
  assert.equal(eintragPruefen({ art: 'zb2', status: 'beim_kaeufer' }).ok, false);
  assert.equal(eintragPruefen({ art: 'sonstiges' }).ok, false, 'Sonstiges braucht Bezeichnung');
  assert.equal(artName('zb2', true), 'Brief (ZB II)');
  assert.equal(statusName('bei_bank'), 'Bei der Bank (Finanzierung)');
});

test('Ausgabe, Rückgabe, Käufer — Brief-Sperre bei offenem Geld', () => {
  const a = statusWechsel({ art: 'schluessel', status: 'im_haus' }, 'ausgegeben', { an: ' Max Probe ', bis: '2026-10-10' }, HEUTE, JETZT);
  assert.deepEqual(a, { ok: true, hinweis: null, felder: { status: 'ausgegeben', ausgegeben_an: 'Max Probe', ausgegeben_am: JETZT, zurueck_bis: '2026-10-10' } });
  assert.match(statusWechsel({ art: 'schluessel', status: 'im_haus' }, 'ausgegeben', { an: '' }, HEUTE, JETZT).fehler, /wer/);
  assert.match(statusWechsel({ art: 'schluessel', status: 'im_haus' }, 'ausgegeben', { an: 'X', bis: '2026-10-07' }, HEUTE, JETZT).fehler, /Vergangenheit/);
  assert.deepEqual(statusWechsel({ art: 'schluessel', status: 'ausgegeben' }, 'im_haus', {}, HEUTE, JETZT).felder, { status: 'im_haus', ausgegeben_an: null, ausgegeben_am: null, zurueck_bis: null });
  assert.equal(statusWechsel({ art: 'zb2', status: 'im_haus' }, 'im_haus', {}, HEUTE, JETZT).ok, false);
  const offen = statusWechsel({ art: 'zb2', status: 'im_haus' }, 'beim_kaeufer', { an: 'K', restOffen: 1500 }, HEUTE, JETZT);
  assert.equal(offen.ok, false);
  assert.match(offen.fehler, /1\.500,00 € offen/);
  const bezahlt = statusWechsel({ art: 'zb2', status: 'im_haus' }, 'beim_kaeufer', { an: 'K', restOffen: 0 }, HEUTE, JETZT);
  assert.deepEqual([bezahlt.ok, bezahlt.hinweis, bezahlt.felder.ausgegeben_an], [true, null, 'K']);
  assert.match(statusWechsel({ art: 'zb2', status: 'im_haus' }, 'beim_kaeufer', { restOffen: null }, HEUTE, JETZT).hinweis, /kein Verkauf/);
  assert.equal(statusWechsel({ art: 'schluessel', status: 'im_haus' }, 'beim_kaeufer', { restOffen: 999 }, HEUTE, JETZT).ok, true, 'Sperre nur für den Brief');
  assert.match(statusWechsel({ art: 'zb2', status: 'beim_kaeufer' }, 'im_haus', {}, HEUTE, JETZT).fehler, /abgeschlossen/);
  assert.equal(ueberfaellig({ status: 'ausgegeben', zurueck_bis: '2026-10-07' }, HEUTE), true);
  assert.equal(ueberfaellig({ status: 'ausgegeben', zurueck_bis: '2026-10-08' }, HEUTE), false);
  assert.equal(ueberfaellig({ status: 'ausgegeben', zurueck_bis: null }, HEUTE), false);
  assert.equal(ueberfaellig({ status: 'im_haus', zurueck_bis: '2026-01-01' }, HEUTE), false);
});

test('Brief-Wächter und offener Betrag aus dem Verkauf', () => {
  assert.equal(briefLage('bestand', []).stufe, 'warn');
  assert.equal(briefLage('zulauf', []).stufe, 'dim');
  assert.equal(briefLage('bestand', [{ art: 'zb2', status: 'im_haus' }]).stufe, 'ok');
  assert.equal(briefLage('bestand', [{ art: 'zb2', status: 'bei_bank' }]).stufe, 'ok');
  assert.equal(briefLage('bestand', [{ art: 'zb2', status: 'fehlt' }]).stufe, 'bad');
  assert.match(briefLage('reserviert', [{ art: 'zb2', status: 'ausgegeben' }]).text, /nicht im Haus: Ausgegeben/);
  assert.equal(briefLage('bestand', [{ art: 'schluessel', status: 'im_haus' }]).stufe, 'warn', 'Schlüssel ersetzt keinen Brief');
  assert.equal(briefLage('verkauft', []).stufe, 'dim');
  assert.equal(restOffenAus(null, null), null);
  assert.equal(restOffenAus({ status: 'storniert', rest: 5000 }, null), null);
  assert.equal(restOffenAus({ status: 'vertrag', rest: 5000 }, { zahlungsstatus: 'bezahlt' }), 0);
  assert.equal(restOffenAus({ status: 'vertrag', rest: 5000 }, { zahlungsstatus: 'offen' }), 5000);
  assert.equal(restOffenAus({ status: 'vertrag', rest: -300 }, null), 0);
});

test('Zulassung: Unterlagen, eVB, Statuswechsel, Kennzeichen', () => {
  assert.deepEqual(ZULASSUNG_ARTEN.map((a) => a.key), ['zulassung', 'ummeldung', 'abmeldung', 'ausfuhr', 'kurzzeit']);
  const leer = zulassungFortschritt('ummeldung', {});
  assert.deepEqual([leer.erledigt, leer.gesamt, leer.vollstaendig], [0, 6, false]);
  const alle = { zb1: true, zb2: true, evb: true, ausweis: true, sepa: true, hu: true };
  assert.equal(zulassungFortschritt('ummeldung', alle).vollstaendig, true, 'Vollmacht und Wunschkennzeichen sind optional');
  assert.equal(zulassungFortschritt('abmeldung', { zb1: true, schilder: true }).vollstaendig, true);
  assert.deepEqual(unterlagenBereinigen('abmeldung', { zb1: true, zb2: true, schilder: 'ja', boese: true }), { zb1: true, schilder: false, ausweis: false, vollmacht: false });
  assert.deepEqual(evbPruefen(' a1b 2c3d '), { ok: true, evb: 'A1B2C3D' });
  assert.deepEqual(evbPruefen(''), { ok: true, evb: null });
  assert.equal(evbPruefen('A1B2C3').ok, false);
  assert.equal(evbPruefen('A1B2-C3D').ok, false);
  assert.match(zulassungStatusPruefen('offen', 'beim_amt', 'ummeldung', {}).fehler, /fehlen noch: Zulassungsbescheinigung Teil I/);
  assert.equal(zulassungStatusPruefen('offen', 'beim_amt', 'ummeldung', alle).ok, true);
  assert.equal(zulassungStatusPruefen('offen', 'storniert', 'ummeldung', {}).ok, true, 'stornieren geht immer');
  assert.equal(zulassungStatusPruefen('erledigt', 'offen', 'ummeldung', alle).ok, false);
  assert.equal(kzNorm(' bb   ag 123 '), 'BB AG 123');
  assert.equal(kzNorm(''), null);
});

test('Aufbereitung: interner Auftrag, nie Kundenrechnung, Kosten nie doppelt', () => {
  const f = aufbereitungAuftrag({ id: 'b1', interne_nr: 'F-0007', marke: 'Porsche', modell: '911', kennzeichen: 'BB-AG 1', fin: 'WP0ZZZ99ZTS392124', km_stand: 42000 }, ' Politur ', '2026-10-12');
  assert.equal(f.titel, 'Aufbereitung F-0007 Porsche 911');
  assert.deepEqual([f.kunde_name, f.kfz_bestand_id, f.zugesagt_am, f.kilometerstand, f.prioritaet], [INTERN_KUNDE, 'b1', '2026-10-12', 42000, 'normal']);
  assert.match(f.beschreibung, /Keine Kundenrechnung[\s\S]*Politur$/);
  assert.equal(aufbereitungAuftrag({ id: 'b', interne_nr: null, marke: null, modell: null, kennzeichen: null, fin: null, km_stand: null }, null, 'morgen').zugesagt_am, null);
  assert.equal(istInternerAuftrag({ kfz_bestand_id: 'b1' }), true);
  assert.equal(istInternerAuftrag({ kfz_bestand_id: null }), false);
  assert.equal(istInternerAuftrag(null), false);
  const a = { id: 'aaaaaaaa-1111', nummer: 'W-0042', status: 'fertig' };
  assert.equal(kostenBezeichnung(a), 'Werkstattauftrag W-0042');
  assert.equal(kostenBezeichnung({ id: 'abcdef12-xyz', nummer: null }), 'Werkstattauftrag abcdef12');
  assert.deepEqual(kostenUebernahme(a, 399.995, []), { ok: true, felder: { art: 'aufbereitung', bezeichnung: 'Werkstattauftrag W-0042', betrag_netto: 400, plan: false } });
  assert.match(kostenUebernahme({ ...a, status: 'in_arbeit' }, 100, []).fehler, /noch nicht fertig/);
  assert.match(kostenUebernahme(a, 100, ['Werkstattauftrag W-0042']).fehler, /schon in der Kalkulation/);
  assert.match(kostenUebernahme(a, 0, []).fehler, /größer 0/);
  assert.equal(kostenUebernahme({ ...a, status: 'abgeholt' }, 50, ['Werkstattauftrag W-0041']).ok, true);
});

test('Verdrahtung: Akte-Reiter, Übersicht, Rechnungssperre, Menü, Hub, Guide, SQL', () => {
  const akte = lies('app/dashboard/kfz/bestand/[id]/page.tsx');
  assert.match(akte, /\['tresor', 'Brief und Schlüssel'\]/);
  assert.match(akte, /<KfzTresor onGeaendert=/);
  const route = lies('app/api/rechnung-aus-werkstatt/route.ts');
  assert.match(route, /istInternerAuftrag\(intern\.data/);
  assert.match(route, /status: 409/);
  assert.ok(route.indexOf('istInternerAuftrag(intern.data') < route.indexOf('Doppel-Schutz: bereits fakturiert'), 'Sperre vor dem Doppel-Schutz');
  const karte = lies('app/dashboard/kfz/bestand/KfzTresor.tsx');
  assert.match(karte, /restOffenAus\(/);
  assert.match(karte, /kostenUebernahme\(a, betrag, kostenBez\)/);
  assert.doesNotMatch(karte, /window\.(prompt|confirm|alert)/);
  assert.match(lies('app/dashboard/kfz/tresor/page.tsx'), /Leerzustand/);
  assert.match(lies('lib/rechte.ts'), /\/dashboard\/kfz\/tresor/);
  assert.match(lies('app/dashboard/kfz/page.tsx'), /\/dashboard\/kfz\/tresor/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/kfz\/tresor': \{/);
  const sql = lies('supabase-sql/p277-kfz-tresor.sql');
  assert.match(sql, /check \(status <> 'ausgegeben' or ausgegeben_an is not null\)/);
  assert.match(sql, /evb ~ '\^\[A-Z0-9\]\{7\}\$'/);
  assert.match(sql, /add column if not exists kfz_bestand_id uuid references public\.kfz_bestand\(id\) on delete set null/);
  assert.doesNotMatch(sql, /policy [a-z0-9_]+ on public\.kfz_tresor_log for (insert|update|delete|all)/, 'Verlauf nur lesbar');
  assert.doesNotMatch(sql, /drop table|delete from|truncate/i, 'nichts Zerstörerisches');
});
