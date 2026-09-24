// Paket PH (24.09.2026) — Ausschreibungs-Radar (B12).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS, statusFuer, fristAmpel, CPV_VORSCHLAEGE, saubererBegriff, leseProfil, tedAbfrage, textAus,
  leseTedFund, sortiereFunde, EIGNUNG, erkenneEignung, abgleich, leseAnalyse, systemPrompt,
} from '../out/ausschreibung.js';

const HEUTE = '2026-09-24';

test('Status und Frist-Ampel', () => {
  assert.equal(STATUS.length, 7);
  assert.equal(statusFuer('bieten'), 'bieten');
  assert.equal(statusFuer('quatsch'), 'neu');
  assert.equal(fristAmpel(null, HEUTE).stufe, 'offen');
  assert.equal(fristAmpel('2026-09-23', HEUTE).stufe, 'vorbei');
  assert.equal(fristAmpel('2026-09-24', HEUTE).stufe, 'rot');
  assert.equal(fristAmpel('2026-09-27', HEUTE).stufe, 'rot');
  assert.equal(fristAmpel('2026-09-28', HEUTE).stufe, 'gelb');
  assert.equal(fristAmpel('2026-10-04', HEUTE).stufe, 'gelb');
  assert.equal(fristAmpel('2026-10-05', HEUTE).stufe, 'gruen');
  assert.match(fristAmpel('2026-09-25', HEUTE).text, /1 Tag \(25\.09\.2026\)/);
});

test('CPV-Liste: achtstellig und eindeutig', () => {
  assert.ok(CPV_VORSCHLAEGE.every((c) => /^\d{8}$/.test(c.code)));
  assert.equal(new Set(CPV_VORSCHLAEGE.map((c) => c.code)).size, CPV_VORSCHLAEGE.length);
});

test('Suchbegriffe: Anfuehrungszeichen und Backslash fliegen raus (TED verwirft sonst still Filter)', () => {
  assert.equal(saubererBegriff('Dach "sanierung" \\ (neu)'), 'Dach sanierung neu');
  const p = leseProfil({ suchwoerter: 'Dachdecker, Fassade; xy\nSpenglerarbeiten', cpv: ['45260000', '4526', 'abc'], region: 'Böblingen, Stuttgart', tage: 500 });
  assert.deepEqual(p.suchwoerter, ['Dachdecker', 'Fassade', 'Spenglerarbeiten']);
  assert.deepEqual(p.cpv, ['45260000']);
  assert.deepEqual(p.region, ['Böblingen', 'Stuttgart']);
  assert.equal(p.tage, 90);
  assert.equal(leseProfil({}).tage, 30);
});

test('TED-Abfrage: Deutschland, Zeitraum, Stichwort ODER CPV', () => {
  assert.equal(tedAbfrage(leseProfil({}), HEUTE), null);
  const q = tedAbfrage(leseProfil({ suchwoerter: ['Dachdecker', 'Fassade'], cpv: ['45260000'], tage: 30 }), HEUTE);
  assert.equal(q, 'buyer-country IN (DEU) AND publication-date>=20260825 AND (FT~("Dachdecker") OR FT~("Fassade") OR classification-cpv=45260000) SORT BY publication-date DESC');
  const e = tedAbfrage(leseProfil({ suchwoerter: ['Maler'] }), HEUTE);
  assert.match(e, /AND FT~\("Maler"\) SORT/);
});

test('TED-Fund lesen: Sprache, Frist, Link, Region', () => {
  const n = {
    'publication-number': '612345-2026',
    'publication-date': '2026-09-20+02:00',
    'notice-title': { eng: 'Roofing works', deu: 'Dachsanierung Grundschule' },
    'buyer-name': { deu: ['Stadt Böblingen', 'Stadt Böblingen'] },
    'buyer-city': { deu: ['Böblingen'] },
    'classification-cpv': ['45261000', '45260000'],
    'deadline-receipt-tender-date-lot': ['2026-10-15+02:00', '2026-10-20+02:00'],
    'estimated-value-proc': [250000],
  };
  const f = leseTedFund(n, ['Böblingen']);
  assert.equal(f.extern_id, 'ted:612345-2026');
  assert.equal(f.titel, 'Dachsanierung Grundschule');
  assert.equal(f.auftraggeber, 'Stadt Böblingen');
  assert.equal(f.abgabe_am, '2026-10-15');
  assert.equal(f.veroeffentlicht, '2026-09-20');
  assert.deepEqual(f.cpv, ['45261000', '45260000']);
  assert.equal(f.wert, 250000);
  assert.equal(f.region_treffer, true);
  assert.match(f.link, /ted\.europa\.eu\/de\/notice\/-\/detail\/612345-2026$/);
  assert.equal(leseTedFund({}, []), null);
  const karg = leseTedFund({ 'publication-number': '1-2026' }, ['Sindelfingen']);
  assert.equal(karg.titel, 'Ohne Titel');
  assert.equal(karg.abgabe_am, null);
  assert.equal(karg.wert, null);
  assert.equal(karg.region_treffer, false);
  assert.equal(textAus({ fra: 'x' }), 'x');
});

test('Funde sortieren: Region zuerst, dann naechste Frist', () => {
  const f = (id, r, a) => ({ extern_id: id, region_treffer: r, abgabe_am: a });
  const s = sortiereFunde([f('a', false, '2026-10-01'), f('b', true, null), f('c', true, '2026-10-30'), f('d', false, null), f('e', false, '2026-09-30')]);
  assert.deepEqual(s.map((x) => x.extern_id), ['c', 'b', 'e', 'a', 'd']);
});

test('Eignungsnachweise im Text erkennen', () => {
  const text = 'Mit dem Angebot sind vorzulegen: Nachweis der Eintragung in die Handwerksrolle, Unbedenklichkeitsbescheinigung der Krankenkasse, '
    + 'Nachweis Betriebshaftpflicht (3 Mio. EUR), drei Referenzen, Eigenerklärung zu Russland-Sanktionen, Freistellungsbescheinigung nach § 48b EStG. '
    + 'Präqualifizierte Unternehmen weisen die Eignung durch Eintrag im PQ-Verzeichnis nach.';
  const k = erkenneEignung(text);
  for (const x of ['gewerbe', 'krankenkasse', 'haftpflicht', 'referenzen', 'sanktionen', 'freistellung', 'pq']) assert.ok(k.includes(x), x);
  assert.ok(!k.includes('umsatz'));
  assert.deepEqual(erkenneEignung('Bitte liefern Sie Fliesen.'), []);
  assert.equal(new Set(EIGNUNG.map((e) => e.key)).size, EIGNUNG.length);
});

test('Abgleich mit der Nachweis-Mappe: gueltig am Abgabetag', () => {
  const mappe = [
    { art: 'unbedenklichkeit_kk', gueltig_bis: '2026-10-10' },
    { art: 'betriebshaftpflicht', gueltig_bis: '2027-01-01', kuendigungsfrist_monate: 3 },
    { art: 'gewerbe', letzte_am: '2019-03-01' },
    { art: 'unbedenklichkeit_bg', gueltig_bis: '2026-09-01' },
  ];
  const r = Object.fromEntries(abgleich(['krankenkasse', 'haftpflicht', 'gewerbe', 'bg', 'mindestlohn', 'referenzen', 'gibtsnicht'], mappe, HEUTE, '2026-10-15').map((z) => [z.key, z.stand]));
  assert.equal(r.krankenkasse, 'bald');      // laeuft am 10.10. ab, Abgabe 15.10.
  assert.equal(r.haftpflicht, 'ok');          // Kuendigungsfrist zaehlt hier NICHT, nur der Ablauf
  assert.equal(r.gewerbe, 'ok');              // Anlass-Nachweis ohne Intervall
  assert.equal(r.bg, 'abgelaufen');
  assert.equal(r.mindestlohn, 'fehlt');
  assert.equal(r.referenzen, 'selbst');
  assert.equal('gibtsnicht' in r, false);
  // ohne Abgabedatum gilt heute
  assert.equal(abgleich(['krankenkasse'], mappe, HEUTE, null)[0].stand, 'ok');
  // zwei Eintraege: der bessere zaehlt
  assert.equal(abgleich(['bg'], [...mappe, { art: 'unbedenklichkeit_bg', gueltig_bis: '2027-03-01' }], HEUTE, '2026-10-15')[0].stand, 'ok');
  // Eintrag ohne Datum
  assert.equal(abgleich(['bg'], [{ art: 'unbedenklichkeit_bg' }], HEUTE)[0].stand, 'fehlt');
});

test('KI-Auswertung: Frist nur mit Wortlaut, Eignung zusaetzlich aus dem Text', () => {
  const roh = JSON.stringify({
    titel: 'Dachsanierung Grundschule', auftraggeber: 'Stadt Böblingen', abgabe_am: '2026-10-15', abgabe_text: 'Ablauf der Angebotsfrist: 15.10.2026, 10:00 Uhr',
    fragen_bis: '2026-10-08', fragen_text: null, eignung: ['Referenzen'], lose: ['Los 1 Dach'],
  });
  const a = leseAnalyse(roh, 'Unbedenklichkeitsbescheinigung der Berufsgenossenschaft beifügen.', HEUTE);
  assert.equal(a.abgabe_am, '2026-10-15');
  assert.equal(a.fragen_bis, null);
  assert.ok(a.hinweise.some((h) => /Bieterfragen/.test(h)));
  assert.ok(a.eignung_keys.includes('bg'));
  assert.ok(a.eignung_keys.includes('referenzen'));
  const leer = leseAnalyse('kaputt', '', HEUTE);
  assert.equal(leer.titel, 'Ausschreibung');
  assert.ok(leer.hinweise.some((h) => /Keine eindeutige Abgabefrist/.test(h)));
  assert.match(systemPrompt(), /Wortlaut/);
});
