// Paket 320 (11.10.2026): Q1 Prüfzertifikat je Charge + Sperre ungeprüfter Rohstoffe
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ZERT_ARTEN, zertArt, zahlDe, grenzen, spezText, istText, merkmalOk, zertifikatPruefen, bestePruefung,
  freigabeOhnePruefung, istGesperrt, zertNummer, feldText, erklaerung,
} from '../out/chargenZertifikat.js';
import { merkmalStatus } from '../out/chargen.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const gut = { merkmal: 'Reinheit', sollwert: 99.5, toleranz_minus: 0.5, toleranz_plus: 0.5, istwert: 99.8, einheit: '%' };

test('Arten: Analysenzertifikat und 3.1; Unbekanntes wird CoA', () => {
  assert.deepEqual(ZERT_ARTEN.map((a) => a.key), ['coa', 'abnahme31']);
  assert.equal(zertArt('abnahme31'), 'abnahme31');
  assert.equal(zertArt('22'), 'coa');
  assert.equal(zertArt(undefined), 'coa');
  assert.match(erklaerung('abnahme31'), /Vereinbarungen bei der Bestellung/);
});

test('Spezifikation: Grenzen als Betrag, deutsche Zahlen ohne Artefakte', () => {
  assert.deepEqual(grenzen(gut), { min: 99, max: 100 });
  assert.equal(spezText(gut), '99 – 100 %');
  assert.equal(spezText({ sollwert: 0.1, toleranz_minus: -0.2, toleranz_plus: 0.2, einheit: 'mm' }), '-0,1 – 0,3 mm', 'Minus-Toleranz als Betrag, 0,1+0,2 = 0,3');
  assert.equal(spezText({ sollwert: 7 }), '= 7');
  assert.equal(spezText({ sollwert: null }), '—');
  assert.equal(istText({ istwert: 1234.5, einheit: 'mg/kg' }), '1.234,5 mg/kg');
  assert.equal(zahlDe(0.1 + 0.2), '0,3');
});

test('Bewertung stimmt mit lib/chargen.merkmalStatus überein (auch an der Grenze)', () => {
  const faelle = [gut, { ...gut, istwert: 100 }, { ...gut, istwert: 99 }, { ...gut, istwert: 100.0001 }, { ...gut, istwert: null }, { sollwert: 5, istwert: 5 }, { sollwert: 5, istwert: 5.1 }];
  for (const m of faelle) {
    const a = merkmalOk(m);
    const b = merkmalStatus(m);
    assert.equal(a === null ? 'na' : a ? 'io' : 'nio', b, JSON.stringify(m));
  }
});

test('Zertifikat nur bei Freigabe, Merkmalen, alle i. O., Prüfdatum', () => {
  const p = { id: 'p1', art: 'endpruefung', datum: '2026-10-10' };
  assert.equal(zertifikatPruefen('freigegeben', p, [gut]).ok, true);
  assert.match(zertifikatPruefen('quarantaene', p, [gut]).gruende.join(), /nicht freigegeben/);
  assert.match(zertifikatPruefen('freigegeben', p, []).gruende.join(), /keine Merkmale/);
  assert.match(zertifikatPruefen('freigegeben', p, [{ ...gut, istwert: 98 }]).gruende.join(), /Reinheit: außerhalb der Spezifikation \(98 % statt 99 – 100 %\)/);
  assert.match(zertifikatPruefen('freigegeben', p, [{ ...gut, istwert: null }]).gruende.join(), /Istwert fehlt/);
  assert.match(zertifikatPruefen('freigegeben', { ...p, datum: null }, [gut]).gruende.join(), /Prüfdatum fehlt/);
  assert.match(zertifikatPruefen('freigegeben', null, []).gruende.join(), /Keine Prüfung/);
});

test('Vorschlag: Endprüfung vor Zwischenprüfung vor Wareneingang, sonst neueste; nur bestandene', () => {
  const ps = [
    { id: 'we', art: 'wareneingang', datum: '2026-10-09' },
    { id: 'ep-alt', art: 'endpruefung', datum: '2026-10-01' },
    { id: 'ep-neu', art: 'endpruefung', datum: '2026-10-05' },
    { id: 'ep-rot', art: 'endpruefung', datum: '2026-10-08' },
  ];
  const mj = { we: [gut], 'ep-alt': [gut], 'ep-neu': [gut], 'ep-rot': [{ ...gut, istwert: 50 }] };
  assert.equal(bestePruefung(ps, mj).id, 'ep-neu');
  assert.equal(bestePruefung([ps[0]], mj).id, 'we');
  assert.equal(bestePruefung([ps[3]], mj), null);
  assert.equal(freigabeOhnePruefung([ps[3]], mj), true);
  assert.equal(freigabeOhnePruefung(ps, mj), false);
  assert.equal(freigabeOhnePruefung([], {}), true);
});

test('Sperre und Nummer und Felder', () => {
  assert.equal(istGesperrt('quarantaene'), true);
  assert.equal(istGesperrt('gesperrt'), true);
  assert.equal(istGesperrt('freigegeben'), false);
  assert.equal(istGesperrt('verbraucht'), false);
  assert.equal(zertNummer('L 2026/07', '2026-10-10', 'coa'), 'COA-L-2026-07-20261010');
  assert.equal(zertNummer('', null, 'abnahme31'), 'APZ-CHARGE-00000000');
  assert.equal(feldText(['  Müller\n GmbH  ', 'x']), 'Müller GmbH');
  assert.equal(feldText('x'.repeat(200), 10).length, 10);
});

test('SQL p320: Wächter auf charge_verwendung, gleiche Status-Liste, nur der eigene Betrieb', () => {
  const sql = lies('supabase-sql/p320-charge-sperre.sql');
  assert.match(sql, /before insert or update on public\.charge_verwendung/);
  assert.match(sql, /new\.richtung = 'ausgang' and v_status in \('quarantaene', 'gesperrt'\)/);
  assert.match(sql, /l\.owner_user_id = coalesce\(new\.owner_user_id, v_owner\)/);
  assert.match(sql, /lower\(btrim\(l\.charge_nr\)\) = lower\(btrim\(new\.referenz\)\)/);
  assert.ok(!/drop table|drop column|create policy/i.test(sql));
});

test('Druckseite: Server prüft (fail-closed), keine Lieferanten/Abnehmer, 3.1 braucht Abnahmebeauftragten', () => {
  const s = lies('app/dashboard/chargen/[id]/zertifikat/page.tsx');
  assert.match(s, /auth\.getUser\(\)/);
  assert.match(s, /const ok = gruende\.length === 0;/);
  assert.match(s, /\{ok && pruefung && \(/);
  assert.match(s, /zArt === 'abnahme31' && !abnahme/);
  assert.ok(!/charge_verwendung|herkunft/.test(s), 'Zertifikat zeigt keine Rückverfolgung');
  assert.match(s, /ladeBetriebProfil\(supabase, user\.id\)/);
  const c = lies('app/dashboard/chargen/page.tsx');
  assert.match(c, /if \(status === "freigegeben" && l\.status !== "freigegeben" && freigabeOhnePruefung\(pfByLos\[l\.id\]/);
  assert.match(c, /Freigabe ohne bestandene Prüfung am/);
});
