// ============================================================================
// tests/kfzVerkaufP266.test.mjs — Paket 266 (07.10.2026) · K6 Verkaufsunterlagen
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  naechsteVerkaufNr, zusatzBereinigen, betraege, barSumme, gwgNoetig, inzahlungVorschlag, steuerZeilen, gewaehrErlaubt,
  wechselErlaubt, pruefen, bestandNachVerkauf, dokumentInhalt, alsText, vorschadenSatz, haftungText, dateiName, DOK_ARTEN,
} from '../out/kfzVerkauf.js';
import { pdfText } from '../out/kfzVerkaufPdf.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = '2026-10-07';

const basis = () => ({
  nr: 'V-0001', status: 'angebot', kaeufer_art: 'verbraucher', kaeufer_name: 'Max Muster', kaeufer_firma: null,
  kaeufer_anschrift: 'Teststraße 1\n71032 Böblingen', kaeufer_tel: null, kaeufer_email: null, kaeufer_ustid: null, ausweis_geprueft: true,
  preis_brutto: 20000, zusatz: [], inzahlung_ankauf_id: null, inzahlung_betrag: null, anzahlung: null, anzahlung_am: null, anzahlung_art: null,
  rest_art: 'ueberweisung', gwg_erledigt: false, gewaehr: 'gesetzlich', gewaehr_gesondert: false, angebot_gueltig_bis: null, reserviert_bis: null,
  vertrag_am: null, liefertermin: null, vereinbarungen: null, uebergabe_am: null, km_uebergabe: null, schluessel: null, papiere: [],
});
const fz = () => ({
  interne_nr: 'F-0007', marke: 'Testmarke', modell: 'Kombi', variante: '2.0', fin: 'WVWZZZ1KZAW000001', kennzeichen: 'BB-AB 123',
  erstzulassung: '2019-03-01', km_stand: 85000, leistung_kw: 110, kraftstoff: 'Diesel', farbe: 'Grau', hu_bis: '2027-05-01', vorbesitzer: 2,
  vorschaden: 'keine_bekannt', vorschaden_text: null, besteuerung: '25a', vk_brutto: 20500,
});

test('Nummern V-0001 ff., Zusatzleistungen bereinigt', () => {
  assert.equal(naechsteVerkaufNr([]), 'V-0001');
  assert.equal(naechsteVerkaufNr(['V-0009', null, 'A-0100', 'V-0002']), 'V-0010');
  assert.deepEqual(zusatzBereinigen([{ text: ' Zulassung ', betrag: 149.999 }, { text: '', betrag: 5 }, { text: 'x', betrag: -1 }, 'kaputt']), [{ text: 'Zulassung', betrag: 150 }]);
  assert.deepEqual(zusatzBereinigen({}), []);
  assert.equal(zusatzBereinigen(Array.from({ length: 15 }, (_, i) => ({ text: `L${i}`, betrag: 1 }))).length, 10);
});

test('Beträge: Zusatz, Inzahlungnahme, Anzahlung, Rest und Auszahlung', () => {
  const v = { ...basis(), zusatz: [{ text: 'Zulassung', betrag: 150 }, { text: 'Überführung', betrag: 349.5 }], inzahlung_ankauf_id: 'a1', inzahlung_betrag: 5000, anzahlung: 1000 };
  assert.deepEqual(betraege(v), { fahrzeug: 20000, zusatz: 499.5, gesamt: 20499.5, inzahlung: 5000, anzahlung: 1000, rest: 14499.5 });
  assert.equal(betraege({ ...v, inzahlung_ankauf_id: null }).inzahlung, 0, 'ohne gewähltes Fahrzeug keine Anrechnung');
  assert.equal(betraege({ ...basis(), preis_brutto: 3000, inzahlung_ankauf_id: 'a', inzahlung_betrag: 4000 }).rest, -1000);
});

test('GwG: Bar-Anzahlung und Bar-Rest zählen zusammen, Grenze 10.000 €', () => {
  const v = { ...basis(), preis_brutto: 12000, anzahlung: 3000, anzahlung_art: 'bar', rest_art: 'ueberweisung' };
  assert.equal(barSumme(v), 3000); assert.equal(gwgNoetig(v), false);
  const v2 = { ...v, rest_art: 'bar' };
  assert.equal(barSumme(v2), 12000); assert.equal(gwgNoetig(v2), true);
  assert.equal(gwgNoetig({ ...basis(), preis_brutto: 9999.99, rest_art: 'bar' }), false);
  assert.equal(gwgNoetig({ ...basis(), preis_brutto: 10000, rest_art: 'bar' }), true);
  // Inzahlungnahme ist kein Bargeld
  assert.equal(barSumme({ ...basis(), preis_brutto: 15000, inzahlung_ankauf_id: 'a', inzahlung_betrag: 6000, rest_art: 'bar' }), 9000);
  // Ohne Haken kein Vertrag
  const p = pruefen({ ...v2 }, fz(), 'vertrag', HEUTE);
  assert.ok(p.fehler.some((f) => /Geldwäschegesetz/.test(f)));
  assert.equal(pruefen({ ...v2, gwg_erledigt: true }, fz(), 'vertrag', HEUTE).fehler.length, 0);
});

test('Inzahlungnahme-Vorschlag: Ankaufspreis, sonst Angebot; Unternehmen brutto', () => {
  assert.equal(inzahlungVorschlag({ nr: 'A-1', marke: null, modell: null, fin: null, kennzeichen: null, km_stand: null, verkaeufer_art: 'privat', ankaufpreis: 4000, angebot: 3500 }), 4000);
  assert.equal(inzahlungVorschlag({ nr: 'A-1', marke: null, modell: null, fin: null, kennzeichen: null, km_stand: null, verkaeufer_art: 'privat', ankaufpreis: null, angebot: 3500 }), 3500);
  assert.equal(inzahlungVorschlag({ nr: 'A-1', marke: null, modell: null, fin: null, kennzeichen: null, km_stand: null, verkaeufer_art: 'gewerblich', ankaufpreis: 1000, angebot: null }), 1190);
  assert.equal(inzahlungVorschlag({ nr: 'A-1', marke: null, modell: null, fin: null, kennzeichen: null, km_stand: null, verkaeufer_art: 'privat', ankaufpreis: null, angebot: null }), null);
});

test('Steuerzeilen: Regel mit enthaltener USt, § 25a ohne Ausweis, offen leer', () => {
  assert.deepEqual(steuerZeilen(11900, 'regel'), ['darin 19 % Umsatzsteuer: 1.900,00 € (netto 10.000,00 €)']);
  assert.match(steuerZeilen(11900, '25a')[0], /§ 25a UStG/);
  assert.deepEqual(steuerZeilen(11900, null), []);
});

test('Sachmängelhaftung: Verbraucher nie ausgeschlossen, Verkürzung nur gesondert', () => {
  assert.equal(gewaehrErlaubt('verbraucher', 'ausgeschlossen'), false);
  assert.equal(gewaehrErlaubt('unternehmer', 'ausgeschlossen'), true);
  assert.equal(gewaehrErlaubt('verbraucher', 'ein_jahr'), true);
  const aus = pruefen({ ...basis(), gewaehr: 'ausgeschlossen' }, fz(), 'vertrag', HEUTE);
  assert.ok(aus.fehler.some((f) => /Verbrauchern/.test(f)));
  const kurz = pruefen({ ...basis(), gewaehr: 'ein_jahr' }, fz(), 'vertrag', HEUTE);
  assert.ok(kurz.fehler.some((f) => /gesondert/.test(f)));
  assert.equal(pruefen({ ...basis(), gewaehr: 'ein_jahr', gewaehr_gesondert: true }, fz(), 'vertrag', HEUTE).fehler.length, 0);
  assert.equal(pruefen({ ...basis(), kaeufer_art: 'unternehmer', kaeufer_firma: 'X GmbH', gewaehr: 'ein_jahr' }, fz(), 'vertrag', HEUTE).fehler.length, 0, 'Unternehmer: ohne gesondert');
  assert.deepEqual(haftungText('verbraucher', 'gesetzlich'), ['Es gelten die gesetzlichen Rechte bei Sachmängeln.']);
  assert.match(haftungText('unternehmer', 'ausgeschlossen').join(' '), /Leben, Körper oder Gesundheit/);
  assert.deepEqual(haftungText('verbraucher', 'ausgeschlossen'), ['Es gelten die gesetzlichen Rechte bei Sachmängeln.'], 'Ausschluss gegenüber Verbraucher fällt auf gesetzlich zurück');
});

test('Status-Wechsel und Pflichtangaben', () => {
  assert.equal(wechselErlaubt('angebot', 'vertrag'), true);
  assert.equal(wechselErlaubt('vertrag', 'angebot'), false);
  assert.equal(wechselErlaubt('uebergeben', 'storniert'), false);
  assert.equal(wechselErlaubt('storniert', 'angebot'), false);
  const r = pruefen({ ...basis(), reserviert_bis: null }, fz(), 'reserviert', HEUTE);
  assert.ok(r.fehler.some((f) => /bis wann/.test(f)));
  assert.ok(pruefen({ ...basis(), reserviert_bis: '2026-10-01' }, fz(), 'reserviert', HEUTE).fehler.some((f) => /Vergangenheit/.test(f)));
  assert.ok(pruefen({ ...basis(), kaeufer_anschrift: null }, fz(), 'vertrag', HEUTE).fehler.some((f) => /Anschrift/.test(f)));
  assert.ok(pruefen({ ...basis(), preis_brutto: null }, fz(), 'reserviert', HEUTE).fehler.some((f) => /Fahrzeugpreis/.test(f)));
  const ue = pruefen({ ...basis(), status: 'vertrag' }, fz(), 'uebergeben', HEUTE);
  assert.ok(ue.fehler.some((f) => /Kilometerstand/.test(f)));
  assert.ok(ue.hinweise.some((h) => /noch 20\.000,00 € offen/.test(h)));
  assert.ok(pruefen({ ...basis(), status: 'uebergeben' }, fz(), 'storniert', HEUTE).fehler.length > 0, 'übergeben lässt sich nicht stornieren');
  assert.ok(pruefen(basis(), { ...fz(), vk_brutto: 21000 }, 'vertrag', HEUTE).hinweise.some((h) => /Nachlass 1\.000,00 €/.test(h)));
});

test('Bestand-Status folgt dem Verkauf', () => {
  assert.deepEqual(bestandNachVerkauf('reserviert', 'bestand', HEUTE, null), { status: 'reserviert' });
  assert.deepEqual(bestandNachVerkauf('vertrag', 'reserviert', HEUTE, '2026-10-05'), { status: 'verkauft', verkauft_am: '2026-10-05' });
  assert.deepEqual(bestandNachVerkauf('vertrag', 'bestand', HEUTE, null), { status: 'verkauft', verkauft_am: HEUTE });
  assert.deepEqual(bestandNachVerkauf('storniert', 'verkauft', HEUTE, null), { status: 'bestand', verkauft_am: null });
  assert.equal(bestandNachVerkauf('storniert', 'aufbereitung', HEUTE, null), null, 'fremder Status bleibt');
  assert.equal(bestandNachVerkauf('angebot', 'bestand', HEUTE, null), null);
});

test('Kaufvertrag: Vorschaden nie geschönt, gesonderte Vereinbarung mit eigener Unterschrift, § 25a', () => {
  assert.match(vorschadenSatz({ vorschaden: null, vorschaden_text: null }), /nicht bekannt/);
  assert.match(vorschadenSatz({ vorschaden: 'ja', vorschaden_text: 'Heckschaden 2021 repariert' }), /Heckschaden 2021 repariert/);
  const v = { ...basis(), gewaehr: 'ein_jahr', gewaehr_gesondert: true, inzahlung_ankauf_id: 'a1', inzahlung_betrag: 5000, anzahlung: 1000, anzahlung_art: 'bar' };
  const inz = { nr: 'A-0003', marke: 'Altmarke', modell: 'Klein', fin: null, kennzeichen: 'BB-X 1', km_stand: 1, verkaeufer_art: 'privat', ankaufpreis: 5000, angebot: null };
  const d = dokumentInhalt('kaufvertrag', v, { ...fz(), vorschaden: 'ja', vorschaden_text: 'Heckschaden' }, null, inz, HEUTE);
  const text = alsText(d);
  assert.match(text, /Heckschaden/);
  assert.match(text, /Differenzbesteuerung nach § 25a/);
  assert.match(text, /Inzahlungnahme \(Altmarke Klein, BB-X 1\)/);
  assert.match(text, /Noch zu zahlen: 14\.000,00 €/);
  assert.match(text, /Ankauf A-0003/);
  assert.match(text, /Eigentum des Verkäufers/);
  const ges = d.abschnitte.find((a) => a.titel === 'Gesonderte Vereinbarung zur Verjährung');
  assert.ok(ges && ges.eigeneUnterschrift, 'eigene Unterschrift');
  assert.equal(dokumentInhalt('kaufvertrag', basis(), fz(), null, null, HEUTE).abschnitte.some((a) => a.eigeneUnterschrift), false);
  assert.deepEqual(d.links.zeilen, ['______________________________'], 'ohne Firmendaten Leerzeile');
  // Regelsteuer zeigt enthaltene USt
  assert.match(alsText(dokumentInhalt('kaufvertrag', basis(), { ...fz(), besteuerung: 'regel' }, null, null, HEUTE)), /darin 19 % Umsatzsteuer/);
  // Finanzierung: keine Vermittlung
  assert.match(alsText(dokumentInhalt('angebot', { ...basis(), rest_art: 'finanzierung' }, fz(), null, null, HEUTE)), /vermittelt nicht/);
});

test('Alle sechs Unterlagen entstehen, Firmenkopf, Dateinamen ohne Umlaute', () => {
  const firma = { name: 'Autohaus Test', strasse: 'Hof 1', plz: '71032', ort: 'Böblingen', telefon: null, email: 'info@test.de' };
  const v = { ...basis(), anzahlung: 500, anzahlung_art: 'karte', anzahlung_am: '2026-10-06', reserviert_bis: '2026-10-14', km_uebergabe: 85012, schluessel: 2, papiere: ['Zulassungsbescheinigung Teil I'] };
  assert.equal(DOK_ARTEN.length, 6);
  for (const d of DOK_ARTEN) {
    const inh = dokumentInhalt(d.key, v, fz(), firma, null, HEUTE);
    assert.ok(inh.titel && inh.abschnitte.length && inh.unterschriften.length, d.key);
    assert.ok([...inh.links.zeilen, ...inh.rechts.zeilen].includes('Autohaus Test'), d.key);
  }
  assert.match(alsText(dokumentInhalt('uebergabe', v, fz(), firma, null, HEUTE)), /85\.012 km/);
  assert.match(alsText(dokumentInhalt('anzahlung', v, fz(), firma, null, HEUTE)), /Erhalten: 500,00 €/);
  assert.match(alsText(dokumentInhalt('reservierung', v, fz(), firma, null, HEUTE)), /14\.10\.2026/);
  assert.match(alsText(dokumentInhalt('vollmacht', v, fz(), firma, null, HEUTE)), /SEPA-Lastschriftmandat/);
  assert.equal(dateiName('uebergabe', 'V-0001'), 'Empfangsbestaetigung-V-0001.pdf');
  assert.equal(dateiName('anzahlung', null), 'Quittung-Anzahlung-Verkauf.pdf');
});

test('PDF-Text: nur Zeichen der Standardschrift', () => {
  assert.equal(pdfText('− 5,00 € → „ok"'), '- 5,00 € -> "ok"');
  assert.equal(pdfText('Größe § 25a · — …'), 'Größe § 25a · — …');
  assert.equal(pdfText('CO₂ ✓'), 'CO ');
});

test('Verdrahtung: Reiter, SQL-Schutz, Menü, Leitfaden, Wächter', () => {
  const akte = lies('app/dashboard/kfz/bestand/[id]/page.tsx');
  assert.match(akte, /\['verkauf', 'Verkauf'\]/);
  assert.match(akte, /<KfzVerkauf /);
  const sql = lies('supabase-sql/p266-kfz-verkauf.sql');
  assert.match(sql, /kfz_verkauf_ein_laufender_uq on public\.kfz_verkauf \(bestand_id\) where status <> 'storniert'/);
  assert.match(sql, /kfz_verkauf_inzahlung_uq/);
  assert.doesNotMatch(sql, /drop table|delete from|truncate/i);
  assert.doesNotMatch(sql, /ausweis_nr|ausweis_nummer|ausweisnummer\s+text/i, 'keine Ausweisnummern');
  assert.match(lies('lib/rechte.ts'), /href: '\/dashboard\/kfz\/verkauf'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/kfz\/verkauf': \{/);
  const ui = lies('app/dashboard/kfz/bestand/KfzVerkauf.tsx');
  assert.doesNotMatch(ui, /window\.confirm|window\.alert/, 'Rückfragen in der Seite');
  assert.match(ui, /signaturStarten\(supabase, f\.owner_user_id/, 'Signatur gehört dem Betrieb');
  for (const p of ['lib/kfzVerkauf.ts', 'app/dashboard/kfz/bestand/KfzVerkauf.tsx', 'app/dashboard/kfz/verkauf/page.tsx']) {
    const q = lies(p);
    assert.doesNotMatch(q, /Math\.round\([^)]*\*\s*100\)\s*\/\s*100/, `${p}: centRunden statt Math.round`);
    assert.doesNotMatch(q, /replace\(',', '\.'\)/, `${p}: leseZahl statt eigener Zahlen-Leser`);
  }
});
