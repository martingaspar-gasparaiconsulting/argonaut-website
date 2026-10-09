// Paket 294 (09.10.2026): V2b Vermietung — unverbindliche Online-Anfrage
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  oeffentlich, einstellungLesen, kennungGueltig, mietPfad, endpreisCent, euroText, steuerHinweis, konditionen, vorschau,
  anfragePruefen, frei, reservierungsNotiz, FLOTTE_OEFFENTLICH, NIE_OEFFENTLICH, MAX_TAGE_ANFRAGE,
} from '../out/mietOnline.js';
import { OFFENE_TUEREN } from '../out/offeneTueren.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const FZ = '11111111-1111-4111-8111-111111111111';
const K = 'abcdefghijklmnopqrstuvwx';

const ROH = {
  id: FZ, bezeichnung: 'VW Golf Automatik', art: 'pkw', fs_klasse: 'B', tagessatz_cent: 4900, wochensatz_cent: 25000, frei_km_tag: 200,
  mehr_km_cent: 25, kaution_cent: 50000, mindestalter: 21, fs_jahre_min: 2, zusatzfahrer_tag_cent: 500, tank_achtel_cent: 1000, aktiv: true,
  kennzeichen: 'BB-AG 1', km_stand: 12345, notiz: 'Delle hinten', fahrzeug_id: FZ, owner_user_id: FZ,
};

test('Positivliste: nie Kennzeichen, km-Stand, Notiz, Fuhrpark, Besitzer; nur aktive Fahrzeuge', () => {
  const f = oeffentlich(ROH);
  for (const k of NIE_OEFFENTLICH) {
    assert.ok(!(k in f), k);
    assert.ok(!FLOTTE_OEFFENTLICH.split(', ').includes(k), 'Spalte ' + k);
  }
  assert.equal(f.tagessatz_cent, 4900);
  assert.equal(oeffentlich({ ...ROH, aktiv: false }), null);
  assert.equal(oeffentlich({ ...ROH, id: 'x' }), null);
  assert.equal(oeffentlich(null), null);
  assert.equal(oeffentlich({ ...ROH, art: 'rakete' }).art, 'pkw');
  assert.equal(oeffentlich({ ...ROH, fs_klasse: '<b>' }).fs_klasse, null);
  assert.equal(oeffentlich({ ...ROH, frei_km_tag: null }).frei_km_tag, null);
});

test('Einstellung: nur mit gültiger Kennung aktiv, Google nur ausdrücklich', () => {
  assert.deepEqual(einstellungLesen({ aktiv: true, kennung: K }), { aktiv: true, kennung: K, google: false });
  assert.deepEqual(einstellungLesen({ aktiv: true, kennung: K, google: true }), { aktiv: true, kennung: K, google: true });
  assert.equal(einstellungLesen({ aktiv: true, kennung: 'kurz' }).aktiv, false);
  assert.equal(einstellungLesen({ aktiv: false, kennung: K, google: true }).google, false);
  assert.equal(einstellungLesen(null).aktiv, false);
  assert.equal(kennungGueltig(K), true);
  assert.equal(kennungGueltig(K.toUpperCase()), false);
  assert.equal(mietPfad(K), '/mieten/' + K);
});

test('Endpreise (PAngV): netto + 19 % auf ganze Cent, Kleinunternehmer unverändert', () => {
  assert.equal(endpreisCent(4900, false), 5831);
  assert.equal(endpreisCent(25, false), 30, '0,2975 € → 0,30 €');
  assert.equal(endpreisCent(50, false), 60, '0,595 € → 0,60 € (halber Cent auf)');
  assert.equal(endpreisCent(4900, true), 4900);
  assert.equal(endpreisCent(-5, false), 0);
  assert.equal(euroText(5831), '58,31 €');
  assert.equal(euroText(123456), '1.234,56 €');
  assert.match(steuerHinweis(false), /inkl\. 19 % MwSt/);
  assert.match(steuerHinweis(true), /§ 19 UStG/);
});

test('Konditionen: Endpreise, Kaution unverändert, Fahrer-Bedingungen', () => {
  const z = Object.fromEntries(konditionen(oeffentlich(ROH), false).map((x) => [x.label, x.wert]));
  assert.equal(z.Tag, '58,31 €');
  assert.equal(z.Woche, '297,50 €');
  assert.equal(z.Freikilometer, '200 km je Tag');
  assert.equal(z.Mehrkilometer, '0,30 € je km');
  assert.equal(z.Kaution, '500,00 € (wird zurückgegeben)');
  assert.equal(z.Zusatzfahrer, '5,95 € je Tag');
  assert.match(z.Fahrer, /ab 21 Jahren, Führerschein seit mindestens 2 Jahren, Klasse B/);
  const u = Object.fromEntries(konditionen(oeffentlich({ ...ROH, frei_km_tag: null, wochensatz_cent: null, kaution_cent: 0 }), true).map((x) => [x.label, x.wert]));
  assert.equal(u.Freikilometer, 'unbegrenzt');
  assert.equal(u.Tag, '49,00 €');
  assert.ok(!('Woche' in u) && !('Kaution' in u) && !('Mehrkilometer' in u));
});

test('Vorschau: Miettage und Endpreis wie die Abrechnung', () => {
  const f = oeffentlich(ROH);
  const v = vorschau(f, '2026-11-01T09:00:00+01:00', '2026-11-04T09:00:00+01:00', false);
  assert.deepEqual(v, { tage: 3, endpreis_cent: endpreisCent(14700, false), frei_km: 600 });
  assert.equal(vorschau(f, '2026-11-01T09:00:00+01:00', '2026-11-11T09:00:00+01:00', false).endpreis_cent, endpreisCent(25000 + 3 * 4900, false), 'Woche + 3 Tage');
  assert.equal(vorschau(f, '2026-11-02T09:00:00+01:00', '2026-11-01T09:00:00+01:00', false), null);
});

test('Anfrage prüfen: Zeitraum, Kontakt, Datenschutz, Längen', () => {
  const jetzt = Date.parse('2026-10-09T16:00:00+02:00');
  const b = { fahrzeugId: FZ, von: '2026-11-01T09:00:00+01:00', bis: '2026-11-03T09:00:00+01:00', name: 'Eva Muster', email: 'eva@example.com', datenschutz: true };
  const ok = anfragePruefen(b, jetzt);
  assert.ok(ok.ok);
  assert.equal(ok.daten.von, '2026-11-01T08:00:00.000Z');
  assert.equal(ok.daten.telefon, null);
  assert.equal(anfragePruefen({ ...b, fahrzeugId: 'x' }, jetzt).ok, false);
  assert.match(anfragePruefen({ ...b, von: '2026-10-01T09:00:00+02:00' }, jetzt).fehler, /Vergangenheit/);
  assert.match(anfragePruefen({ ...b, bis: b.von }, jetzt).fehler, /nach der Abholung/);
  assert.match(anfragePruefen({ ...b, bis: '2027-03-15T09:00:00+01:00' }, jetzt).fehler, new RegExp(`${MAX_TAGE_ANFRAGE} Tage`));
  assert.match(anfragePruefen({ ...b, von: '2028-06-01T09:00:00+02:00', bis: '2028-06-02T09:00:00+02:00' }, jetzt).fehler, /18 Monate/);
  assert.match(anfragePruefen({ ...b, email: '', telefon: '' }, jetzt).fehler, /E-Mail-Adresse oder Telefonnummer/);
  assert.equal(anfragePruefen({ ...b, email: '', telefon: '07031 123456' }, jetzt).ok, true);
  assert.equal(anfragePruefen({ ...b, email: 'kein-at' }, jetzt).ok, false);
  assert.equal(anfragePruefen({ ...b, telefon: 'ruf an' }, jetzt).ok, false);
  assert.match(anfragePruefen({ ...b, datenschutz: 'true' }, jetzt).fehler, /zu/, 'nur echtes true');
  assert.equal(anfragePruefen({ ...b, name: 'E' }, jetzt).ok, false);
  assert.equal(anfragePruefen({ ...b, nachricht: 'x'.repeat(5000) }, jetzt).daten.nachricht.length, 1000);
  assert.equal(anfragePruefen({ ...b, name: 'Eva\u0000\u0007 Muster' }, jetzt).daten.name, 'Eva Muster');
});

test('Frei-Prüfung: reserviert/unterwegs sperren, direkt anschließend erlaubt, storniert frei', () => {
  const bu = [
    { id: 'a', fahrzeug_id: FZ, abholung: '2026-11-01T09:00:00+01:00', rueckgabe_plan: '2026-11-03T09:00:00+01:00', status: 'reserviert' },
    { id: 'b', fahrzeug_id: FZ, abholung: '2026-11-10T09:00:00+01:00', rueckgabe_plan: '2026-11-12T09:00:00+01:00', status: 'storniert' },
  ];
  assert.equal(frei(bu, FZ, '2026-11-02T09:00:00+01:00', '2026-11-04T09:00:00+01:00'), false);
  assert.equal(frei(bu, FZ, '2026-11-03T09:00:00+01:00', '2026-11-04T09:00:00+01:00'), true, 'direkt anschließend');
  assert.equal(frei(bu, FZ, '2026-11-10T09:00:00+01:00', '2026-11-11T09:00:00+01:00'), true, 'storniert');
  assert.equal(frei(bu, FZ, 'x', 'y'), false);
  assert.equal(reservierungsNotiz({ nr: 'MA-2026-0001', nachricht: 'Mit  Dachbox' }), 'Aus Online-Anfrage MA-2026-0001: Mit Dachbox');
});

test('Öffentliche Tür: registriert, Drossel, Kennung, frei/vergeben, unverbindlich, Positivliste', () => {
  const t = OFFENE_TUEREN.find((x) => x.pfad === 'oeffentlich/miet-anfrage');
  assert.ok(t && t.schutz === 'formular' && t.geprueft);
  assert.match(lies('lib/drossel.ts'), /'oeffentlich\/miet-anfrage': \[/);
  const r = lies('app/api/oeffentlich/miet-anfrage/route.ts');
  assert.match(r, /firma_hp/);
  assert.match(r, /await drossel\(db, 'oeffentlich\/miet-anfrage'/);
  assert.ok(r.indexOf('drossel(db') < r.indexOf("from('miet_anfrage').insert("));
  assert.match(r, /betriebZuMietKennung\(db, k\)/);
  assert.match(r, /owner_user_id: bt\.betrieb/);
  assert.ok(!/owner_user_id: (b|body|d)\./.test(r), 'Betrieb nie aus der Anfrage');
  assert.match(r, /if \(!frei\(belegt, fz\.id, d\.von, d\.bis\)\) \{\s*return NextResponse\.json\(\{ error: 'Im Wunschzeitraum ist das Fahrzeug leider schon vergeben/, 'vor dem Speichern auf frei prüfen');
  assert.ok(r.indexOf('frei(belegt') < r.indexOf("from('miet_anfrage').insert("));
  assert.match(r, /unverbindlich und noch keine Buchung/);
  assert.ok(!/status: ['"]reserviert|miet_buchung'\)\.insert|stripe|checkout|sepa/i.test(r), 'keine Buchung, keine Zahlung');
  const l = lies('lib/mietOnlineLaden.ts');
  assert.match(l, /select\(FLOTTE_OEFFENTLICH\)/);
  assert.match(l, /select\('id, fahrzeug_id, abholung, rueckgabe_plan, status'\)/, 'Buchungen ohne Mieter');
  assert.ok(!/mieter_name/.test(l));
});

test('Seite und SQL: noindex ohne Google-Haken, Endpreise, Anfrage-Angaben unveränderlich, kein Einfügen für Mitarbeiter', () => {
  const p = lies('app/mieten/[kennung]/page.tsx');
  assert.match(p, /robots: d\.einst\.google \? \{ index: true, follow: true \} : NICHT_FINDEN/);
  assert.match(p, /steuerHinweis\(d\.ku\)/);
  assert.match(p, /unverbindliche Anfrage/);
  const m = lies('app/mieten/[kennung]/MietListe.tsx');
  assert.ok(!/createBrowserClient|supabase/.test(m), 'kein Supabase im Browser');
  assert.match(m, /\/api\/oeffentlich\/miet-anfrage/);
  const s = lies('supabase-sql/p294-vermietung-anfrage.sql');
  assert.match(s, /Die Angaben einer Online-Anfrage bleiben, wie sie eingegangen sind/);
  assert.match(s, /Bitte zuerst eine Reservierung für dieses Fahrzeug anlegen/);
  assert.equal((s.match(/create policy man_/g) || []).length, 3);
  assert.ok(!/man_ma_insert|man_ma_delete/.test(s));
  assert.ok(!/drop table|drop column|truncate|delete from/i.test(s));
  const d = lies('app/dashboard/verleih/fahrzeuge/page.tsx');
  assert.match(d, /update\(\{ status: 'reserviert', buchung_id: data\[0\]\.id \}\)/);
  assert.match(d, /<MietOnlineEinstellung betrieb=\{uid\} \/>/);
  const e = lies('app/dashboard/verleih/fahrzeuge/MietOnlineEinstellung.tsx');
  assert.match(e, /speichern\(\{ aktiv: true, google: false \}\)/, 'Google beim Einschalten aus');
  const t2 = lies('app/fahrzeuge/BoerseTeile.tsx');
  assert.match(t2, /hinweis \?\? 'Alle Angaben nach bestem Wissen\. Irrtümer und Zwischenverkauf vorbehalten\. Maßgeblich ist der Kaufvertrag\.'/, 'Börse unverändert');
  for (const x of [p, m, d, e, lies('lib/mietOnline.ts')]) assert.ok(!/parseFloat|Math\.round\([^)]*\* 100\) \/ 100/.test(x));
});
