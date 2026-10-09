// Paket 293 (09.10.2026): V2a Vermietung — Bußgelder/Halteranfragen, Gebühr, Auslastung, Fristen
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  mieterZurTatzeit, tageBis, fristAmpel, fristText, vorgangPruefen, gebuehrPruefen, gebuehrPosten, platzhalterFuellen,
  benennungText, berlinMitternacht, naechsterTag, tageImZeitraum, auslastung, prozentText, fristenFahrzeug, schlechteste, zeitraumLetzte,
} from '../out/fahrzeugMieteV2.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const FZ = '11111111-1111-4111-8111-111111111111';
const FZ2 = '11111111-1111-4111-8111-222222222222';

const A = { id: 'a', fahrzeug_id: FZ, status: 'zurueck', uebergabe_am: '2026-09-01T09:30:00+02:00', rueckgabe_ist: '2026-09-05T11:00:00+02:00' };
const B = { id: 'b', fahrzeug_id: FZ, status: 'zurueck', uebergabe_am: '2026-09-10T09:00:00+02:00', rueckgabe_ist: '2026-09-12T08:00:00+02:00' };
const U = { id: 'u', fahrzeug_id: FZ2, status: 'uebergeben', uebergabe_am: '2026-10-01T09:00:00+02:00', rueckgabe_ist: null };
const R = { id: 'r', fahrzeug_id: FZ, status: 'reserviert', uebergabe_am: null, rueckgabe_ist: null };

test('Mieter zum Tatzeitpunkt: tatsächliche Übergabe bis Rückgabe, halb-offen, wie die Datenbank', () => {
  const alle = [A, B, U, R];
  assert.equal(mieterZurTatzeit(alle, FZ, '2026-09-05T10:30:00+02:00').buchung.id, 'a', 'nach Plan-, vor Ist-Rückgabe');
  assert.equal(mieterZurTatzeit(alle, FZ, '2026-09-01T09:15:00+02:00').art, 'kein_mieter', 'vor der tatsächlichen Übergabe');
  assert.equal(mieterZurTatzeit(alle, FZ, '2026-09-12T08:00:00+02:00').art, 'kein_mieter', 'genau an der Rückgabe = nicht mehr vermietet');
  assert.equal(mieterZurTatzeit(alle, FZ, '2026-09-10T09:00:00+02:00').buchung.id, 'b', 'genau an der Übergabe = vermietet');
  assert.equal(mieterZurTatzeit(alle, FZ2, '2026-10-05T12:00:00+02:00').buchung.id, 'u', 'noch unterwegs');
  assert.equal(mieterZurTatzeit(alle, FZ, 'Unsinn').art, 'kein_mieter');
  assert.equal(mieterZurTatzeit([A, { ...B, uebergabe_am: '2026-09-05T10:00:00+02:00' }], FZ, '2026-09-05T10:30:00+02:00').art, 'mehrdeutig');
  assert.equal(mieterZurTatzeit([{ ...A, status: 'storniert' }], FZ, '2026-09-03T12:00:00+02:00').art, 'kein_mieter');
  assert.equal(mieterZurTatzeit([A], FZ2, '2026-09-03T12:00:00+02:00').art, 'kein_mieter', 'anderes Fahrzeug');
});

test('Fristen: Tage, Ampel, Text', () => {
  assert.equal(tageBis('2026-10-12', '2026-10-09'), 3);
  assert.equal(tageBis('2026-10-31', '2026-10-24'), 7, 'über die Zeitumstellung');
  assert.deepEqual(fristAmpel('2026-10-08', '2026-10-09'), { ampel: 'ueber', tage: -1 });
  assert.equal(fristAmpel('2026-10-12', '2026-10-09').ampel, 'rot');
  assert.equal(fristAmpel('2026-10-13', '2026-10-09').ampel, 'gelb');
  assert.equal(fristAmpel('2026-10-17', '2026-10-09').ampel, 'gruen');
  assert.equal(fristAmpel('2026-11-01', '2026-10-09', 30).ampel, 'gelb');
  assert.equal(fristAmpel(null, '2026-10-09').ampel, 'keine');
  assert.equal(fristAmpel('2026-02-30', '2026-10-09').ampel, 'keine');
  assert.equal(fristText(-2), '2 Tage überschritten');
  assert.equal(fristText(0), 'heute');
  assert.equal(schlechteste(['gruen', 'gelb', 'keine']), 'gelb');
  assert.equal(schlechteste([]), 'keine');
});

test('Vorgang prüfen: Pflichtangaben, keine Zukunft, Frist nicht vor Eingang', () => {
  const basis = { fahrzeugId: FZ, art: 'halteranfrage', behoerde: 'Stadt Böblingen', aktenzeichen: 'AZ-1', tatzeit: '2026-09-03T12:00:00+02:00', eingangAm: '2026-10-01', fristAm: '2026-10-15', jetzt: Date.parse('2026-10-09T12:00:00+02:00'), heute: '2026-10-09' };
  const ok = vorgangPruefen(basis);
  assert.ok(ok.ok);
  assert.equal(ok.zeile.tatzeit, '2026-09-03T10:00:00.000Z');
  assert.equal(ok.zeile.tatort, null);
  assert.equal(vorgangPruefen({ ...basis, fahrzeugId: 'x' }).ok, false);
  assert.equal(vorgangPruefen({ ...basis, art: 'strafzettel' }).ok, false);
  assert.equal(vorgangPruefen({ ...basis, behoerde: ' ' }).ok, false);
  assert.equal(vorgangPruefen({ ...basis, aktenzeichen: '' }).ok, false);
  assert.match(vorgangPruefen({ ...basis, tatzeit: '' }).grund, /Mieter/);
  assert.match(vorgangPruefen({ ...basis, tatzeit: '2026-10-11T12:00:00+02:00' }).grund, /Zukunft/);
  assert.equal(vorgangPruefen({ ...basis, eingangAm: '2026-10-10' }).ok, false, 'Eingang in der Zukunft');
  assert.match(vorgangPruefen({ ...basis, fristAm: '2026-09-20' }).grund, /vor dem Eingang/);
  assert.equal(vorgangPruefen({ ...basis, fristAm: '2026-09-30' }).ok, true, 'ein Tag Spielraum wie die Datenbank');
});

test('Bearbeitungsgebühr: Cent, Steuersatz 19 oder 0, eigener Posten ohne Bußgeld', () => {
  assert.deepEqual(gebuehrPruefen({ betrag: '25,00', ust: '19', text: '' }), { ok: true, cent: 2500, ust: 19, text: null });
  assert.deepEqual(gebuehrPruefen({ betrag: '', ust: 0 }), { ok: true, cent: 0, ust: 0, text: null });
  assert.equal(gebuehrPruefen({ betrag: '1.000,01', ust: '19' }).ok, false);
  assert.equal(gebuehrPruefen({ betrag: 'abc', ust: '19' }).ok, false);
  assert.equal(gebuehrPruefen({ betrag: '10', ust: '7' }).ok, false);
  const p = gebuehrPosten({ gebuehr_cent: 2500, gebuehr_ust_satz: 19, aktenzeichen: 'AZ-1', behoerde: 'Stadt Böblingen', art: 'anhoerung' }, 'BB-AG 1', '03.09.2026, 12:00');
  assert.equal(p.summe_cent, 2500);
  assert.equal(p.mwst_satz, 19);
  assert.match(p.bezeichnung, /Bearbeitungsgebühr Anhörungsbogen · Az\. AZ-1 \(Stadt Böblingen\) · BB-AG 1/);
  assert.equal(gebuehrPosten({ gebuehr_cent: 2500, gebuehr_ust_satz: 0, aktenzeichen: 'A', behoerde: 'B', art: 'maut' }, null, '').mwst_satz, 0);
  assert.equal(gebuehrPosten({ gebuehr_cent: 0, gebuehr_ust_satz: 19, aktenzeichen: 'A', behoerde: 'B', art: 'maut' }, null, ''), null);
});

test('Fahrerbenennung: Platzhalter, Anschrift nur vom Mieter, kein Mustertext von ARGONAUT', () => {
  assert.equal(platzhalterFuellen('Az {aktenzeichen}, {fahrer}, {unbekannt}, {tatort}', { aktenzeichen: 'X', fahrer: 'Anna', tatort: '' }), 'Az X, Anna, {unbekannt}, —');
  const basis = {
    begleittext: 'Sehr geehrte Damen und Herren,\nzu Az. {aktenzeichen} benennen wir {fahrer}.', betrieb: 'Autovermietung Test',
    vorgang: { behoerde: 'Stadt Böblingen', aktenzeichen: 'AZ-1', tatzeit: '2026-09-03T12:00:00+02:00', tatort: 'Bahnhofstraße' },
    fahrzeug: { bezeichnung: 'VW Golf', kennzeichen: 'BB-AG 1' },
    buchung: { nummer: 'MV-2026-0001', mieter_name: 'Anna Muster', mieter_anschrift: 'Weg 1\n71032 Böblingen', uebergabe_am: '2026-09-01T09:30:00+02:00', rueckgabe_ist: '2026-09-05T11:00:00+02:00' },
    fahrer: { name: 'Anna Muster', geburtsdatum: '1990-01-31', rolle: 'haupt' },
  };
  const t = benennungText(basis);
  assert.match(t, /^Sehr geehrte Damen und Herren,\nzu Az\. AZ-1 benennen wir Anna Muster\./);
  assert.match(t, /Fahrzeugführer laut Mietvertrag: Anna Muster, geboren am 31\.01\.1990/);
  assert.match(t, /Anschrift: Weg 1, 71032 Böblingen/);
  assert.match(t, /amtliches Kennzeichen BB-AG 1/);
  assert.match(t, /Tatzeit: 03\.09\.2026, 12:00, Tatort: Bahnhofstraße/);
  const z = benennungText({ ...basis, begleittext: null, fahrer: { name: 'Max Muster', geburtsdatum: '1991-01-01', rolle: 'zusatz' } });
  assert.ok(z.startsWith('Aktenzeichen: AZ-1'), 'ohne Begleittext kein Mustertext');
  assert.match(z, /Anschrift: liegt dem Vermieter nur vom Mieter vor \(Anna Muster, Weg 1, 71032 Böblingen\)/);
  assert.ok(!/Max Muster.*Weg 1/.test(z.split('\n').find((x) => x.startsWith('Fahrzeugführer'))));
  const u = benennungText({ ...basis, buchung: { ...basis.buchung, rueckgabe_ist: null } });
  assert.match(u, /bis noch unterwegs/);
});

test('Berliner Mitternacht: Sommer- und Winterzeit, Wechseltage', () => {
  assert.equal(new Date(berlinMitternacht('2026-07-01')).toISOString(), '2026-06-30T22:00:00.000Z');
  assert.equal(new Date(berlinMitternacht('2026-12-01')).toISOString(), '2026-11-30T23:00:00.000Z');
  assert.equal(new Date(berlinMitternacht('2026-10-25')).toISOString(), '2026-10-24T22:00:00.000Z', 'Umstellungstag beginnt noch in Sommerzeit');
  assert.equal(new Date(berlinMitternacht('2026-10-26')).toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal(new Date(berlinMitternacht('2026-03-29')).toISOString(), '2026-03-28T23:00:00.000Z');
  assert.equal(new Date(berlinMitternacht('2026-03-30')).toISOString(), '2026-03-29T22:00:00.000Z');
  assert.equal(naechsterTag('2026-12-31'), '2027-01-01');
  assert.equal(tageImZeitraum('2026-09-01', '2026-09-30'), 30);
  assert.deepEqual(zeitraumLetzte(30, '2026-10-09'), { von: '2026-09-10', bis: '2026-10-09' });
});

test('Auslastung: Ist-Zeit zugeschnitten, unterwegs bis jetzt, Ertrag nur gültige Rechnungen', () => {
  const buchungen = [
    // 2 volle Tage im September
    { id: 'a', fahrzeug_id: FZ, status: 'zurueck', abholung: '', rueckgabe_plan: '', uebergabe_am: '2026-09-10T00:00:00+02:00', rueckgabe_ist: '2026-09-12T00:00:00+02:00', rechnung_id: 'r1' },
    // ragt vorne in den Zeitraum: 31.08. 12:00 bis 01.09. 12:00 → 12 Std im September
    { id: 'b', fahrzeug_id: FZ, status: 'zurueck', abholung: '', rueckgabe_plan: '', uebergabe_am: '2026-08-31T12:00:00+02:00', rueckgabe_ist: '2026-09-01T12:00:00+02:00', rechnung_id: 'r2' },
    // stornierte Rechnung → ohne Rechnung
    { id: 'c', fahrzeug_id: FZ, status: 'zurueck', abholung: '', rueckgabe_plan: '', uebergabe_am: '2026-09-20T00:00:00+02:00', rueckgabe_ist: '2026-09-21T00:00:00+02:00', rechnung_id: 'r3' },
    // im August zurückgegeben: Ertrag gehört nicht in den September
    { id: 'f', fahrzeug_id: FZ, status: 'zurueck', abholung: '', rueckgabe_plan: '', uebergabe_am: '2026-08-18T00:00:00+02:00', rueckgabe_ist: '2026-08-20T00:00:00+02:00', rechnung_id: 'r4' },
    // reserviert zählt nicht
    { id: 'd', fahrzeug_id: FZ, status: 'reserviert', abholung: '2026-09-25T00:00:00+02:00', rueckgabe_plan: '2026-09-28T00:00:00+02:00', uebergabe_am: null, rueckgabe_ist: null, rechnung_id: null },
    // unterwegs seit 29.09. 0:00, jetzt = 30.09. 12:00 → 1,5 Tage
    { id: 'e', fahrzeug_id: FZ2, status: 'uebergeben', abholung: '', rueckgabe_plan: '', uebergabe_am: '2026-09-29T00:00:00+02:00', rueckgabe_ist: null, rechnung_id: null },
  ];
  const rechnungen = [
    { id: 'r1', netto_summe: '98.00', zahlungsstatus: 'offen' },
    { id: 'r2', netto_summe: 49.995, zahlungsstatus: 'bezahlt' },
    { id: 'r3', netto_summe: 49, zahlungsstatus: 'storniert' },
    { id: 'r4', netto_summe: 500, zahlungsstatus: 'bezahlt' },
  ];
  const r = auslastung({
    fahrzeuge: [{ id: FZ }, { id: FZ2 }], buchungen, rechnungen,
    vorgaenge: [{ fahrzeug_id: FZ, tatzeit: '2026-09-11T10:00:00+02:00' }, { fahrzeug_id: FZ, tatzeit: '2026-08-11T10:00:00+02:00' }],
    schaeden: [{ fahrzeug_id: FZ2, erfasst_am: '2026-09-29T10:00:00+02:00' }],
    von: '2026-09-01', bis: '2026-09-30', jetzt: Date.parse('2026-09-30T12:00:00+02:00'),
  });
  const [a, b] = r.zeilen;
  assert.equal(a.belegt_tage, 3.5, '2 + 0,5 + 1');
  assert.equal(a.mieten, 3);
  assert.equal(a.netto_cent, 9800 + 5000, '49,995 € → 5.000 Cent (inCent)');
  assert.equal(a.ohne_rechnung, 1, 'stornierte Rechnung');
  assert.equal(a.je_miettag_cent, Math.round(14800 / 3), 'Ertrag / abgerechnete Miettage (2 + 1)');
  assert.equal(a.vorgaenge, 1);
  assert.equal(b.belegt_tage, 1.5);
  assert.equal(b.schaeden, 1);
  assert.equal(b.netto_cent, 0);
  assert.equal(b.je_miettag_cent, null);
  assert.equal(r.gesamt.kalendertage, 30);
  assert.equal(r.gesamt.belegt_tage, 5);
  assert.equal(Math.round(r.gesamt.quote * 10000), Math.round((5 / 60) * 10000));
  assert.equal(prozentText(a.quote), '11,7 %');
  assert.equal(prozentText(2), '100,0 %');
  assert.equal(auslastung({ fahrzeuge: [], buchungen: [], rechnungen: [], von: '2026-09-01', bis: '2026-09-30', jetzt: 0 }).gesamt.quote, 0);
});

test('Fristen aus dem Fuhrpark: Ampel ab 30 Tagen, Buchungen über die Frist hinaus', () => {
  const b = [
    { id: 'x1', nummer: 'MV-2026-0007', status: 'reserviert', abholung: '2026-10-28T09:00:00+01:00', rueckgabe_plan: '2026-11-02T09:00:00+01:00' },
    { id: 'x2', nummer: 'MV-2026-0008', status: 'reserviert', abholung: '2026-10-20T09:00:00+02:00', rueckgabe_plan: '2026-10-31T23:00:00+01:00' },
    { id: 'x3', nummer: 'MV-2026-0009', status: 'zurueck', abholung: '2026-11-05T09:00:00+01:00', rueckgabe_plan: '2026-11-06T09:00:00+01:00' },
  ];
  const r = fristenFahrzeug({ tuev_bis: '2026-10-31', wartung_bis: null, versicherung_bis: '2027-06-30' }, b, '2026-10-09');
  assert.equal(r.length, 2);
  assert.equal(r[0].name, 'HU / TÜV');
  assert.equal(r[0].ampel, 'gelb');
  assert.deepEqual(r[0].konflikte, ['MV-2026-0007'], 'Rückgabe am Fristtag 23 Uhr ist noch in Ordnung, zurückgegebene zählen nicht');
  assert.equal(r[1].ampel, 'gruen');
  assert.deepEqual(r[1].konflikte, []);
  assert.deepEqual(fristenFahrzeug(null, b, '2026-10-09'), []);
});

test('SQL: Datenbank ordnet zu, Benennung fest, Gebühr eingefroren, Rechte, additiv', () => {
  const s = lies('supabase-sql/p293-vermietung-bussgeld.sql');
  assert.match(s, /p_tatzeit >= b\.uebergabe_am\s+and p_tatzeit < coalesce\(b\.rueckgabe_ist, 'infinity'::timestamptz\)/, 'halb-offen, unterwegs = offen');
  assert.match(s, /b\.status in \('uebergeben', 'zurueck'\)/);
  assert.match(s, /if tg_op = 'INSERT' or old\.status = 'offen' then/, 'Zuordnung immer durch die Datenbank');
  assert.match(s, /into new\.gebuehr_cent, new\.gebuehr_ust_satz/, 'Gebühr aus den Einstellungen eingefroren');
  assert.match(s, /Der Fahrer steht nicht in diesem Mietvertrag/);
  assert.match(s, /Die Fahrerbenennung ist festgehalten/);
  assert.match(s, /gebuehr_ust_satz in \(0, 19\)/);
  assert.equal((s.match(/create policy mvo_/g) || []).length, 4);
  assert.ok(!/create policy mvo_ma_delete/.test(s), 'Mitarbeiter löschen nicht');
  assert.match(s, /revoke all on function public\.p293_mieter_zur_tatzeit/);
  assert.match(s, /add column if not exists bearbeitungsgebuehr_cent/);
  assert.ok(!/drop table|drop column|truncate|delete from/i.test(s), 'nichts Destruktives');
  assert.match(s, /AUSSPERR-RISIKO: keines/);
});

test('Route Gebühren-Rechnung: Recht vor dem Anlegen, Betrieb, nur mit Mieter, Doppelschutz, kein Bußgeld', () => {
  const s = lies('app/api/rechnung-aus-bussgeld/route.ts');
  const pruef = s.indexOf('const abr = await abrechnungPruefen(supabase, user.id);');
  assert.ok(pruef > 0 && pruef < s.indexOf('from("rechnungen").insert('));
  assert.match(s, /v\.zuordnung !== "mieter" \|\| !v\.buchung_id/);
  assert.match(s, /status: 409/);
  assert.match(s, /vorhanden\.zahlungsstatus !== "storniert"/);
  assert.match(s, /gebuehrPosten\(v, kennzeichen/, 'Betrag aus dem eingefrorenen Vorgang');
  assert.ok(!/body\?\.(betrag|gebuehr|cent)/.test(s), 'Betrag nie aus dem Browser');
  assert.match(s, /zahlungsstatus: "storniert"/);
  assert.ok(!s.includes('.delete('));
  assert.match(s, /schreiber\.from\("miet_vorgang"\)\.update\(\{ gebuehr_rechnung_id: rechnungId \}\)\.eq\("id", v\.id\)\.eq\("owner_user_id", betrieb\)/);
});

test('Seiten: Abrechnen-Recht, Menü, So-geht\'s, keine eigenen Zahlenleser', () => {
  const b = lies('app/dashboard/verleih/fahrzeuge/bussgelder/page.tsx');
  const a = lies('app/dashboard/verleih/fahrzeuge/auslastung/page.tsx');
  const m = lies('app/dashboard/verleih/fahrzeuge/page.tsx');
  assert.match(b, /useDarfAbrechnen\(\)/);
  assert.match(b, /darfAbrechnen !== false/);
  assert.match(b, /\/api\/rechnung-aus-bussgeld/);
  assert.ok(!/benannt_name:|buchung_id:|zuordnung:/.test(b.split('speichern()')[1]?.split('fahrerLaden')[0] ?? ''), 'Zuordnung nie aus dem Browser');
  for (const s of [a, b, m]) {
    assert.match(s, /So geht&apos;s/);
    assert.ok(!/parseFloat|Math\.round\([^)]*\* 100\) \/ 100/.test(s));
  }
  assert.match(a, /\.range\(von, bis\)/, 'mehr als 1.000 Buchungen');
  assert.match(m, /fahrzeug_id: fzForm\.fuhrparkId \|\| null/, 'Mietflotte mit Fuhrpark verknüpfen');
  assert.match(m, /\/dashboard\/verleih\/fahrzeuge\/bussgelder/);
  const r = lies('lib/rechte.ts');
  const g = lies('lib/guideWissen.ts');
  for (const h of ['/dashboard/verleih/fahrzeuge/bussgelder', '/dashboard/verleih/fahrzeuge/auslastung']) {
    assert.ok(r.includes(`href: '${h}'`), h);
    assert.ok(g.includes(`'${h}': {`), h);
  }
  const lib = lies('lib/fahrzeugMieteV2.ts');
  assert.ok(!/parseFloat|Math\.round\([^)]*\* 100\) \/ 100/.test(lib));
});
