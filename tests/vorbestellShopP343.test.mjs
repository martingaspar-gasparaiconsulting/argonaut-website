// ============================================================================
// tests/vorbestellShopP343.test.mjs — Paket 343 (12.10.2026)
// BV3b Feinkost Teil 2: Vorbestellung und Vormerkliste im Shop-Schaufenster
// (Bereitschaft, LMIV im Fernabsatz, Positivliste, Höchstmenge je Kunde über
// mehrere Bestellungen, Start-Schalter, Schnittstelle, Shop-Texte)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  einheitNorm, nachGewicht, fernabsatzFehlend, etikettZumArtikel, shopBereitschaft, lmivFuerShop, shopAktion,
  kundeBisher, schonVorgemerkt, shopEingabe, shopVorbestellPruefen, voraussichtlich, vbMailTexte, tagText, mengeFuer,
} from '../out/vorbestellShop.js';
import { aktionStand } from '../out/vorbestellAktion.js';
import { START_FREIGABE, startFrei } from '../out/startSperre.js';
import { TEXT_DE, TEXT_EN, TEXT_ZUSATZ_KEYS, TEXT_PFLICHT_KEYS, platzhalter, pruefeOberflaeche } from '../out/shopSprachen.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const ETIKETT = {
  artikel_id: 'art1', status: 'aktiv', art: 'verpackt', bezeichnung: 'Rinderrücken, trocken gereift',
  zutaten: 'Rindfleisch, Meersalz, Senfsaat', allergene: 'senf', spuren: 'Sellerie', nettomenge: 'nach Gewicht',
  mhd: null, verantwortlicher: 'Metzgerei Muster, Hauptstr. 1, 71032 Böblingen',
  energie_kj: 1000, energie_kcal: 239, fett: 18, gesaettigt: 8, kohlenhydrate: 0, zucker: 0, eiweiss: 20, salz: 0.8,
};
const ARTIKEL = { id: 'art1', bezeichnung: 'Dry-Aged Rib-Eye', verkaufspreis: '89,90', einheit: 'kg', aktiv: true, shop_mwst: 7, shop_beschreibung: '42 Tage am Knochen gereift', shop_bild_url: 'https://x.de/b.jpg' };
const A = { id: 'a1', titel: 'Dry-Aged Rib-Eye 42 Tage', artikel_id: 'art1', im_shop: true, menge_gesamt: 10, einheit: 'kg', max_je_kunde: 2, abhol_von: '2026-12-20', abhol_bis: '2026-12-23', bestell_schluss: '2026-12-15', status: 'offen' };
const P = (menge, status = 'offen', kunde_mail = null, kunde_tel = null) => ({ kunde_name: 'X', menge, status, abhol_tag: '2026-12-21', kunde_mail, kunde_tel });

test('Einheit: Artikel-Schreibweisen werden erkannt, Unbekanntes passt nie', () => {
  assert.equal(einheitNorm('Kg'), 'kg');
  assert.equal(einheitNorm(' Stück '), 'Stk');
  assert.equal(einheitNorm('St.'), 'Stk');
  assert.equal(einheitNorm('Liter'), 'l');
  assert.equal(einheitNorm('Gramm'), 'g');
  assert.equal(einheitNorm('Karton'), null);
  assert.equal(einheitNorm(null), null);
  assert.ok(nachGewicht('kg') && nachGewicht('g') && !nachGewicht('Stk') && !nachGewicht('l'));
});

test('LMIV im Fernabsatz: alles aus Art. 9 außer MHD; lose Ware Bezeichnung + Allergene', () => {
  assert.deepEqual(fernabsatzFehlend(ETIKETT), [], 'MHD fehlt — im Fernabsatz keine Pflicht vor dem Kauf');
  assert.deepEqual(fernabsatzFehlend({ ...ETIKETT, zutaten: '', salz: null }), ['Zutatenverzeichnis', 'Nährwertdeklaration']);
  assert.deepEqual(fernabsatzFehlend({ art: 'lose', bezeichnung: 'Gans', allergene: '' }), ['Allergenangabe']);
  assert.deepEqual(fernabsatzFehlend(null), ['Etikett']);
  // vollständiges Etikett wird bevorzugt, archivierte zählen nicht
  const e1 = { ...ETIKETT, id: 'e1', zutaten: '' }, e2 = { ...ETIKETT, id: 'e2' }, e3 = { ...ETIKETT, id: 'e3', status: 'archiv' };
  assert.equal(etikettZumArtikel([e1, e2], 'art1').id, 'e2');
  assert.equal(etikettZumArtikel([e1], 'art1').id, 'e1');
  assert.equal(etikettZumArtikel([e3], 'art1'), null);
  assert.equal(etikettZumArtikel([e2], null), null);
});

test('Bereitschaft: Artikel, Preis, Einheit, Etikett — jeder Grund einzeln', () => {
  assert.deepEqual(shopBereitschaft(A, ARTIKEL, ETIKETT), []);
  assert.match(shopBereitschaft({ ...A, artikel_id: null }, ARTIKEL, ETIKETT)[0], /Kein Artikel verknüpft/);
  assert.match(shopBereitschaft(A, null, ETIKETT)[0], /nicht mehr da/);
  assert.match(shopBereitschaft(A, { ...ARTIKEL, id: 'fremd' }, ETIKETT)[0], /nicht mehr da/);
  assert.match(shopBereitschaft(A, { ...ARTIKEL, verkaufspreis: 0 }, ETIKETT).join(' '), /keinen Verkaufspreis/);
  assert.match(shopBereitschaft(A, { ...ARTIKEL, aktiv: false }, ETIKETT).join(' '), /ausgelistet/);
  assert.match(shopBereitschaft(A, { ...ARTIKEL, einheit: 'Stück' }, ETIKETT).join(' '), /Einheit passt nicht: Aktion in kg, Preis des Artikels je Stück/);
  assert.match(shopBereitschaft(A, ARTIKEL, null).join(' '), /kein Etikett/);
  assert.match(shopBereitschaft(A, ARTIKEL, { ...ETIKETT, verantwortlicher: '' }).join(' '), /Verantwortlicher/);
});

test('Schaufenster: nur im Shop, nur offen, nur vorbestellbar/ausgebucht, nur vollständig — Positivliste', () => {
  const st = aktionStand(A, [P(3)], '2026-11-01');
  const s = shopAktion(A, st, ARTIKEL, ETIKETT, 89.9, 7);
  assert.ok(s);
  assert.deepEqual(Object.keys(s).sort(), ['abhol_bis', 'abhol_von', 'beschreibung', 'bestell_schluss', 'bild', 'einheit', 'frei', 'id', 'lmiv', 'max_je_kunde', 'mwst', 'nach_gewicht', 'name', 'phase', 'preis', 'titel'].sort());
  assert.equal(s.frei, 7); assert.equal(s.phase, 'vorbestellbar'); assert.equal(s.nach_gewicht, true);
  assert.equal(JSON.stringify(s).includes('menge_gesamt'), false, 'keine Gesamtmenge nach außen');
  assert.equal(shopAktion({ ...A, im_shop: false }, st, ARTIKEL, ETIKETT, 89.9, 7), null);
  assert.equal(shopAktion({ ...A, status: 'entwurf' }, aktionStand({ ...A, status: 'entwurf' }, [], '2026-11-01'), ARTIKEL, ETIKETT, 89.9, 7), null);
  assert.equal(shopAktion(A, aktionStand(A, [], '2026-12-16'), ARTIKEL, ETIKETT, 89.9, 7), null, 'nach Bestellschluss nicht mehr');
  assert.equal(shopAktion(A, st, ARTIKEL, { ...ETIKETT, zutaten: '' }, 89.9, 7), null);
  assert.equal(shopAktion(A, st, ARTIKEL, ETIKETT, 0, 7), null);
  const aus = shopAktion(A, aktionStand(A, [P(10)], '2026-11-01'), ARTIKEL, ETIKETT, 89.9, 7);
  assert.equal(aus.phase, 'ausgebucht');
  // Pflichtangaben: Allergen fett, Nährwerte deutsch, Positivliste
  const l = s.lmiv;
  assert.deepEqual(l.allergene, ['Senf']);
  assert.ok(l.zutaten.some((z) => z.b && /Senf/.test(z.t)), 'Senf fett');
  assert.equal(l.zutaten.map((z) => z.t).join(''), ETIKETT.zutaten, 'Zutatentext vollständig');
  assert.deepEqual(l.naehrwerte.find((n) => n.label === 'Salz'), { label: 'Salz', wert: '0,8 g', unter: false });
  assert.equal(l.naehrwerte.length, 8);
  assert.equal(lmivFuerShop({ art: 'lose', bezeichnung: 'Gans', allergene: '' }).naehrwerte.length, 0);
});

test('Höchstmenge je Kunde gilt über alle Vorbestellungen (gleiche E-Mail oder Telefon)', () => {
  const ps = [P(1.5, 'offen', 'Max@Muster.de'), P(1, 'storniert', 'max@muster.de'), P(0.5, 'offen', null, '+49 7031 123456')];
  assert.equal(kundeBisher(ps, ' max@muster.de', null), 1.5);
  assert.equal(kundeBisher(ps, null, '07031/123456'.replace('0', '+49 ')), 0.5);
  assert.equal(kundeBisher(ps, 'andere@x.de', '0'), 0, 'kurze Nummern zählen nicht');
  const st = aktionStand(A, ps, '2026-11-01');
  const e = { name: 'Max', mail: 'max@muster.de', tel: '', menge: 1, tag: '2026-12-21' };
  const r = shopVorbestellPruefen(e, A, st, ps);
  assert.equal(r.ok, false);
  assert.match(r.fehler, /schon 1,5 kg vorbestellt, möglich sind noch 0,5 kg/);
  const ok = shopVorbestellPruefen({ ...e, menge: 0.5 }, A, st, ps);
  assert.equal(ok.ok, true);
  assert.equal(ok.felder.quelle, 'shop');
  assert.equal(shopVorbestellPruefen({ ...e, mail: '', tel: '' }, A, st, ps).ok, false);
  // ausgebucht -> Hinweis auf Vormerkliste
  const voll = aktionStand(A, [P(10)], '2026-11-01');
  assert.match(shopVorbestellPruefen({ ...e, menge: 0.5 }, A, voll, []).fehler, /Vormerkliste/);
  // Abholtag außerhalb
  assert.equal(shopVorbestellPruefen({ ...e, menge: 0.5, tag: '2026-12-24' }, A, st, ps).ok, false);
});

test('Vormerkliste: doppelte Einträge erkannt; Eingaben begrenzt; Menge über den gemeinsamen Leser', () => {
  const vm1 = [{ kunde_mail: 'a@b.de', kunde_tel: null, status: 'wartet' }, { kunde_mail: 'c@d.de', status: 'abgemeldet' }];
  assert.equal(schonVorgemerkt(vm1, 'A@B.de', null), true);
  assert.equal(schonVorgemerkt(vm1, 'c@d.de', null), false, 'abgemeldet zählt nicht');
  const e = shopEingabe({ name: ' Max '.repeat(50), email: 'x@y.de', telefon: 5, menge: '1,5', abhol_tag: '2026-12-21T10:00' });
  assert.equal(e.name.length, 120); assert.equal(e.tel, ''); assert.equal(e.menge, 1.5); assert.equal(e.tag, '2026-12-21');
  assert.equal(shopEingabe({ menge: { x: 1 } }).menge, null);
  assert.equal(voraussichtlich(1.25, 89.9), 112.38);
  assert.equal(voraussichtlich(0.1 + 0.2, 10), 3);
});

test('Mails: Englisch nur bei en, gleiche Platzhalter; Datum und Menge je Sprache', () => {
  const de = vbMailTexte('de'), en = vbMailTexte('en');
  assert.equal(vbMailTexte('fr'), de);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
  for (const k of Object.keys(de)) assert.equal(platzhalter(en[k]).join(' '), platzhalter(de[k]).join(' '), k);
  assert.equal(tagText('2026-12-21', 'de'), '21.12.2026');
  assert.equal(tagText('2026-12-21', 'en'), '21/12/2026');
  assert.equal(mengeFuer(3, 'Stk', 'en'), '3 pcs');
  assert.equal(mengeFuer(1.5, 'kg', 'de'), '1,5 kg');
});

test('Start-Schalter: vorbestellShop aus, Sperr-Gedächtnis, Schnittstelle prüft beide Schalter', () => {
  assert.equal(START_FREIGABE.vorbestellShop, false);
  assert.equal(startFrei('vorbestellShop'), false);
  assert.match(lies('docs/ARGONAUT-SPERR-GEDAECHTNIS.md'), /SCHALTER startSperre\.vorbestellShop = aus/);
  const r = lies('app/api/oeffentlich/vorbestellung/route.ts');
  assert.match(r, /const gesperrt = \(await startSperrGrundServer\('shop'\)\) \|\| \(await startSperrGrundServer\('vorbestellShop'\)\);.*\n\s+if \(gesperrt\) return NextResponse\.json\(\{ error: gesperrt \}, \{ status: 403 \}\);/);
  // Betrieb nur über die veröffentlichte Seite, Aktion neu geprüft wie im Schaufenster
  assert.match(r, /\.eq\('oeffentlich_id', seite\)/);
  assert.match(r, /inh\.status !== 'live'/);
  assert.match(r, /shopAktion\(g\.aktion, g\.stand, g\.artikel, g\.etikett, g\.preis, g\.mwst\)/);
  assert.match(r, /drossel\(db, 'oeffentlich\/vorbestellung'/);
  assert.match(r, /if \(g\.stand\.phase !== 'ausgebucht'\)/);
  assert.match(r, /b\.einwilligung !== true/);
  assert.ok(!/console\.error\([^)]*e\.mail/.test(r), 'keine Kundendaten im Protokoll');
  const p = lies('app/api/oeffentlich/shop-produkte/route.ts');
  assert.match(p, /startFrei\('shop', freigabe\) && startFrei\('vorbestellShop', freigabe\)\s+\? fuerSchaufenster\(await ladeAktionen\(db, betrieb, heute, basis\)\)/);
  const srv = lies('lib/vorbestellShopServer.ts');
  for (const t of ['vorbestell_aktion', 'vorbestell_posten', 'artikel', 'etikett_produkt']) {
    assert.match(srv, new RegExp(`from\\('${t}'\\)\\.select\\([^)]*\\)\\s*\\.eq\\('owner_user_id', betrieb\\)`), t + ' hart auf den Betrieb');
  }
  assert.match(lies('lib/offeneTueren.ts'), /pfad: 'oeffentlich\/vorbestellung'/);
  assert.match(lies('lib/drossel.ts'), /'oeffentlich\/vorbestellung': \[/);
  assert.match(lies('supabase-sql/p343-vorbestellung-shop.sql'), /add column if not exists im_shop boolean not null default false/);
});

test('Shop-Texte: neue Texte sind Zusatz (freigegebene Sprachen bleiben im Shop), Englisch vollständig, shop.js gleich', () => {
  const vb = Object.keys(TEXT_DE).filter((k) => k.startsWith('vb_'));
  assert.ok(vb.length >= 25);
  for (const k of vb) {
    assert.ok(TEXT_ZUSATZ_KEYS.includes(k), k + ' muss Zusatz sein');
    assert.ok(!TEXT_PFLICHT_KEYS.includes(k));
    assert.ok(TEXT_EN[k], k + ' englisch');
    assert.equal(platzhalter(TEXT_EN[k]).join(' '), platzhalter(TEXT_DE[k]).join(' '), k);
  }
  // eine Sprache, die vor Paket 343 freigegeben war (nur Pflicht-Texte), bleibt freigabefähig
  const alt = {}; for (const k of TEXT_PFLICHT_KEYS) alt[k] = TEXT_DE[k];
  assert.deepEqual(pruefeOberflaeche(alt), []);
  const SHOP = lies('public/shop.js');
  const m = /var DE = (\{[\s\S]*?\n  \});/.exec(SHOP);
  const de = JSON.parse(JSON.stringify(vm.runInNewContext('(' + m[1] + ')')));
  for (const k of vb) assert.equal(de[k], TEXT_DE[k], k);
  // Pflichtangaben deutsch, alles maskiert, Knopf mit Zahlungspflicht, Einwilligung als eigener Haken
  assert.match(SHOP, /'<details class="ao-vb-pflicht"><summary>' \+ TH\('vb_pflicht'\) \+ '<\/summary><div lang="de" dir="ltr">'/);
  assert.match(SHOP, /l\.zutaten\[i\]\.b \? '<b>' \+ esc\(l\.zutaten\[i\]\.t\) \+ '<\/b>' : esc\(l\.zutaten\[i\]\.t\)/);
  assert.match(SHOP, /TH\(aus \? 'vb_vormerken' : 'vb_bestellen'\)/);
  assert.match(SHOP, /name="einwilligung"/);
  assert.match(SHOP, /if \(aus && !el\.einwilligung\.checked\)/);
  assert.match(SHOP, /esc\(vbEinw\)/);
  assert.match(SHOP, /fetch\('\/api\/oeffentlich\/vorbestellung'/);
  assert.match(SHOP, /menge: m, abhol_tag/);
  assert.match(SHOP, /el\.menge\.valueAsNumber/);
});
