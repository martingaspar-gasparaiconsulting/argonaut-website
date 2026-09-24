// Paket PR (24.09.2026) — Pflichten-Helfer: Kassen-Meldung § 146a Abs. 4 AO (K03), Barrierefreiheit BFSG (K04).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  einMonatSpaeter, staetteSchluessel, meldepflichtig, pruefeSystem, meldeStand, snapshotFuer, ausfuellhilfe, verzeichnisCsv,
} from '../out/kassenMeldung.js';
import { betroffenheit, kontrast, abdunkelnBis, ciKontraste, pruefeHtml, erklaerungText, MLBF } from '../out/barrierefreiheit.js';
import { seiteHtml } from '../out/webBloecke.js';

const S = (o) => ({ id: 'x', betriebsstaette: 'Hauptstr. 1, 71032 Böblingen', art: 'kasse_pc', seriennummer: 'SN1', anschaffung_am: '2026-09-01', tse_seriennummer: 'TSE1', tse_bsi_id: 'BSI-K-TR-0490-2021', ...o });

test('Kasse: Fristen ein Monat ohne Ueberlauf, Staetten-Schluessel', () => {
  assert.equal(einMonatSpaeter('2026-01-31'), '2026-02-28');
  assert.equal(einMonatSpaeter('2026-12-15'), '2027-01-15');
  assert.equal(einMonatSpaeter('2028-01-30'), '2028-02-29');
  assert.equal(staetteSchluessel(' Hauptstr. 1,  Böblingen '), staetteSchluessel('hauptstr 1 böblingen'));
});

test('Kasse: Pruefung eines Systems', () => {
  assert.deepEqual(pruefeSystem(S({}), '2026-09-24').fehler, []);
  const f = pruefeSystem(S({ seriennummer: '', anschaffung_am: '2026-10-01', tse_seriennummer: '' }), '2026-09-24').fehler;
  assert.equal(f.length, 3);
  assert.ok(pruefeSystem(S({ ausser_betrieb_am: '2026-08-01' }), '2026-09-24').fehler.some((x) => /vor der Anschaffung/.test(x)));
  assert.ok(pruefeSystem(S({ tse_bsi_id: 'irgendwas' }), '2026-09-24').hinweise.some((x) => /ungewöhnlich/.test(x)));
  const taxi = pruefeSystem(S({ art: 'taxameter', tse_seriennummer: '' }), '2026-09-24');
  assert.deepEqual(taxi.fehler, []);
  assert.equal(meldepflichtig(S({ art: 'taxameter', tse_seriennummer: '' })), false);
  assert.equal(meldepflichtig(S({ art: 'taxameter' })), true);
});

test('Kasse: Meldestand je Betriebsstaette ueber die Momentaufnahme', () => {
  const heute = '2026-09-24';
  const sys = [
    S({ id: 'alt', anschaffung_am: '2024-03-01' }),
    S({ id: 'neu', anschaffung_am: '2026-09-10' }),
    S({ id: 'weg', anschaffung_am: '2024-01-01', ausser_betrieb_am: '2026-08-01', ausser_grund: 'Defekt' }),
    S({ id: 'uralt', anschaffung_am: '2020-01-01', ausser_betrieb_am: '2025-03-01' }),
    S({ id: 'taxi', art: 'taxameter', tse_seriennummer: '', betriebsstaette: 'Hauptstr. 1, 71032 Böblingen' }),
    S({ id: 'filiale', betriebsstaette: 'Filiale Sindelfingen', anschaffung_am: '2026-09-20' }),
  ];
  // noch nie gemeldet
  let st = meldeStand(sys, [], heute);
  const haupt = st.find((g) => g.schluessel === staetteSchluessel('Hauptstr. 1, 71032 Böblingen'));
  assert.deepEqual(haupt.offen.map((o) => [o.system.id, o.ereignis, o.frist, o.ampel]), [
    ['alt', 'anschaffung', '2025-07-31', 'rot'],
    ['weg', 'anschaffung', '2025-07-31', 'rot'],
    ['weg', 'ausserbetriebnahme', '2026-09-01', 'rot'],
    ['neu', 'anschaffung', '2026-10-10', 'gelb'],
  ]);
  assert.equal(haupt.ampel, 'rot');
  assert.equal(st[0].schluessel, haupt.schluessel, 'rote Staette zuerst');
  // gemeldet im Juli 2025 (alt + weg aktiv), danach passiert: neu dazu, weg ausser Betrieb
  const meldung = { betriebsstaette: 'hauptstr 1 71032 böblingen', gemeldet_am: '2025-07-20', snapshot: [{ id: 'alt', ausser_betrieb_am: null }, { id: 'weg', ausser_betrieb_am: null }] };
  st = meldeStand(sys, [meldung], heute);
  const h2 = st.find((g) => g.schluessel === haupt.schluessel);
  assert.deepEqual(h2.offen.map((o) => [o.system.id, o.ereignis]), [['weg', 'ausserbetriebnahme'], ['neu', 'anschaffung']]);
  // nach neuer Meldung ist alles gruen
  const snap = snapshotFuer(h2);
  assert.deepEqual(snap.map((x) => x.id).sort(), ['alt', 'neu', 'uralt', 'weg'].sort());
  st = meldeStand(sys, [meldung, { betriebsstaette: h2.betriebsstaette, gemeldet_am: '2026-09-24', snapshot: snap }], heute);
  assert.equal(st.find((g) => g.schluessel === haupt.schluessel).ampel, 'gruen');
  assert.equal(st.find((g) => g.betriebsstaette === 'Filiale Sindelfingen').ampel, 'gelb');
});

test('Kasse: Ausfuellhilfe mit allen Systemen, CSV sicher', () => {
  const sys = [S({ id: 'a' }), S({ id: 'b', seriennummer: 'SN2', ausser_betrieb_am: '2026-09-20', ausser_grund: 'Verkauf' }), S({ id: 'c', anschaffung_am: '2020-01-01', ausser_betrieb_am: '2025-01-01' })];
  const [g] = meldeStand(sys, [], '2026-09-24');
  const t = ausfuellhilfe(g, { name: 'Muster GmbH', steuernummer: '' });
  assert.match(t, /System 1[\s\S]*SN1[\s\S]*System 2[\s\S]*SN2[\s\S]*Außerbetriebnahme: 20\.09\.2026 \(Verkauf\)/);
  assert.doesNotMatch(t, /System 3/, 'vor dem Stichtag ausser Betrieb und nie gemeldet');
  assert.match(t, /\[Steuernummer\]/);
  const csv = verzeichnisCsv([S({ hersteller: '=HYPERLINK("x")', modell: 'A;B' })]);
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"A;B"/);
});

test('BFSG: Betroffenheit', () => {
  assert.equal(betroffenheit({ verbraucher: false, onlineVertrag: true, beschaeftigte: 50, umsatzMio: 9 }).ergebnis, 'nicht_betroffen');
  assert.equal(betroffenheit({ verbraucher: true, onlineVertrag: false, beschaeftigte: 50, umsatzMio: 9 }).ergebnis, 'nicht_betroffen');
  assert.equal(betroffenheit({ verbraucher: true, onlineVertrag: true, beschaeftigte: 9, umsatzMio: 2 }).ergebnis, 'ausgenommen');
  assert.equal(betroffenheit({ verbraucher: true, onlineVertrag: true, beschaeftigte: 10, umsatzMio: 1 }).ergebnis, 'betroffen');
  assert.equal(betroffenheit({ verbraucher: true, onlineVertrag: true, beschaeftigte: 5, umsatzMio: 2.5 }).ergebnis, 'betroffen');
  assert.equal(betroffenheit({ verbraucher: true, onlineVertrag: true, beschaeftigte: null, umsatzMio: 1 }).ergebnis, 'unklar');
  assert.equal(betroffenheit({ verbraucher: null, onlineVertrag: true, beschaeftigte: 1, umsatzMio: 1 }).ergebnis, 'unklar');
});

test('BFSG: Kontrast nach WCAG und Vorschlaege', () => {
  assert.equal(kontrast('#000', '#fff'), 21);
  assert.equal(kontrast('#fff', '#fff'), 1);
  assert.equal(kontrast('#777777', '#ffffff'), 4.48);
  assert.equal(kontrast('rot', '#fff'), null);
  const v = abdunkelnBis('#4CAF7D', '#FFFFFF', 4.5);
  assert.ok(kontrast(v, '#FFFFFF') >= 4.5);
  const k = ciKontraste({});
  assert.deepEqual(k.filter((x) => !x.ok).map((x) => x.id), ['knopf', 'oberzeile'], 'Standardfarben: Knopf und Oberzeile zu hell');
  assert.ok(k.filter((x) => !x.ok).every((x) => x.vorschlag && kontrast(x.id === 'knopf' ? '#FFFFFF' : x.vorschlag, x.id === 'knopf' ? x.vorschlag : '#FFFFFF') >= x.ziel));
  const gut = ciKontraste({ farbe_primaer: '#0A1628', farbe_sekundaer: '#8A5A00', farbe_akzent: '#1E6B45' });
  assert.deepEqual(gut.filter((x) => !x.ok).map((x) => x.id), ['oberzeile_titel'], 'Zweitfarbe kann nicht auf Weiss UND auf dunkler Hauptfarbe reichen');
  assert.equal(gut.find((x) => x.id === 'oberzeile_titel').vorschlag, null);
});

test('BFSG: HTML-Pruefung findet typische Fehler', () => {
  const schlecht = `<!doctype html><html><head><meta name="viewport" content="width=device-width, user-scalable=no"><style>a:focus{outline:none}</style></head><body>
    <h1>A</h1><h1>B</h1><h4>C</h4><h2></h2>
    <img src="a.jpg"><img src="b.jpg" alt=""><img src="c.jpg" alt="Deko" >
    <iframe src="x"></iframe>
    <input type="text" name="n" placeholder="Name"><input type="hidden" name="h"><input aria-hidden="true" name="hp">
    <label>Mail <input type="email" name="m"></label><label for="t">T</label><input id="t" name="t">
    <button></button><button aria-label="Menü"></button><a href="/x"></a><a href="/y">hier</a><a href="/z"><img src="l.png" alt="Logo"></a>
    <video autoplay src="v.mp4"></video>
    <script>var x = '<img src=q>';</script></body></html>`;
  const b = Object.fromEntries(pruefeHtml(schlecht).map((x) => [x.id, x.anzahl]));
  assert.deepEqual(b, { sprache: 1, zoom: 1, bild_alt: 1, feld_label: 1, knopf_name: 1, link_name: 1, bild_alt_leer: 1, iframe_titel: 1, link_vage: 1, h1_mehrfach: 2, h_sprung: 1, h_leer: 1, fokus: 1, autoplay: 1 });
  assert.equal(pruefeHtml(schlecht)[0].schwere, 'rot', 'rote Befunde zuerst');
  const gut = '<html lang="de"><head><style>input:focus{outline:none;box-shadow:0 0 0 3px red}</style></head><body><h1>A</h1><h2>B</h2></body></html>';
  assert.deepEqual(pruefeHtml(gut), []);
});

test('BFSG: Website-Bauer erzeugt Seiten ohne automatisch erkennbare Fehler', () => {
  const html = seiteHtml({ bloecke: [
    { typ: 'hero', titel: 'Willkommen', unterzeile: 'u', knopf: 'Anfragen' },
    { typ: 'galerie', titel: 'Arbeiten', anzahl: 2, bilder: ['https://x.de/a.jpg', 'https://x.de/b.jpg'] },
    { typ: 'video', titel: 'Film', url: 'https://vimeo.com/123' },
    { typ: 'newsletter', titel: 'News', text: 't' }, { typ: 'kontakt', titel: 'Kontakt', text: 't' },
    { typ: 'termin', titel: 'Termin', text: 't' }, { typ: 'einblendung', titel: 'E', text: 't' },
    { typ: 'produkte', titel: 'Shop' }, { typ: 'faq', titel: 'FAQ', fragen: [{ frage: 'a', antwort: 'b' }] },
  ] }, { firma: 'Muster GmbH' }, 2026, { oeffentlichId: 'abc' });
  assert.deepEqual(pruefeHtml(html).map((x) => x.id), []);
  assert.match(html, /alt="Arbeiten – Bild 2"/);
  assert.doesNotMatch(html, /href="#barrierefreiheit"/, 'ohne Text kein Abschnitt');
  const mit = seiteHtml({ bloecke: [{ typ: 'hero', titel: 'Hallo', unterzeile: 'u', knopf: 'k' }] },
    { firma: 'Muster GmbH', barrierefreiheit_text: erklaerungText({ firma: 'Muster GmbH', leistung: '<b>Shop</b>', stand: '24.09.2026', erfuellt: [], barrieren: [] }) }, 2026);
  assert.match(mit, /<section class="recht" id="barrierefreiheit">/);
  assert.match(mit, /<a href="#barrierefreiheit">Barrierefreiheit<\/a>/);
  assert.match(mit, /&lt;b&gt;Shop/, 'Text wird maskiert');
  assert.deepEqual(pruefeHtml(mit).map((x) => x.id), []);
});

test('BFSG: Erklaerung nach Anlage 3', () => {
  const t = erklaerungText({ firma: 'Muster GmbH', anschrift: 'Hauptstr. 1, 71032 Böblingen', email: 'info@muster.de', leistung: 'Online-Shop für Werkzeug.', stand: '24.09.2026', erfuellt: ['Alle Funktionen sind mit der Tastatur bedienbar.'], barrieren: [] });
  for (const h of ['## Unser Angebot', '## Wie wir die Anforderungen', '## Bekannte Einschränkungen', '## Barriere melden', '## Zuständige Marktüberwachungsbehörde']) assert.ok(t.includes(h), h);
  assert.ok(t.includes(MLBF.anschrift));
  assert.match(t, /keine Barrieren bekannt/);
  assert.match(t, /- Alle Funktionen sind mit der Tastatur/);
  assert.doesNotMatch(erklaerungText({ firma: 'X', leistung: 'L', stand: 's', erfuellt: [], barrieren: [] }), /Tastatur bedienbar/, 'nur Angekreuztes wird behauptet');
});
