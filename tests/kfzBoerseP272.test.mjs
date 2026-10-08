// ============================================================================
// tests/kfzBoerseP272.test.mjs — Paket 272 (08.10.2026) · K11a eigene Fahrzeugbörse
// Positivliste (nie EK/FIN/Kennzeichen/Notiz), Sichtbarkeit, Einstellung,
// Preis mit Steuerhinweis, Energie, Filter, Anfrage-Prüfung, Strukturdaten,
// Türen + Deckel, Quelltext-Wächter (Seiten/Route lesen nur über die Positivliste).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BOERSE_SPALTEN, NIE_OEFFENTLICH, boerseEinstellung, sichtbar, oeffentlich, preisText, preisZusatz, energieZeilen,
  vorschadenText, fakten, filterLesen, filtern, auswahlWerte, anfrageEingabePruefen, strukturDaten, jsonSicher,
  kennungGueltig, neueKennung, textAuf, firmaFehlt, datenschutzHinweis, idGueltig, titel, kurzZeile,
} from '../out/kfzBoerse.js';
import { OFFENE_TUEREN } from '../out/offeneTueren.js';
import { DROSSEL } from '../out/drossel.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const K = 'abcdefghijklmnopqrstuvwx';
const ID = '11111111-2222-4333-8444-555555555555';
const zeile = (x = {}) => ({
  id: ID, interne_nr: 'F-0007', status: 'bestand', sparte: 'Pkw', marke: 'Volkswagen', modell: 'Golf', variante: 'Variant 2.0 TDI',
  erstzulassung: '2020-05-01', km_stand: 62000, leistung_kw: 110, kraftstoff: 'Diesel', farbe: 'Grau', vk_brutto: 18900, besteuerung: '25a',
  inseriert: true, ausstattung: ['Navigationssystem', ' ', 'Sitzheizung vorn'], polster: 'Stoff', vorbesitzer: 1, hu_bis: '2027-04-01',
  vorschaden: 'keine_bekannt', vorschaden_text: 'Kratzer', inserat_titel: null, inserat_text: 'Gepflegt.',
  verbrauch_komb: 4.9, verbrauch_einheit: 'l', co2_g_km: 128, co2_klasse: 'D', aktualisiert_am: '2026-10-08T08:00:00Z',
  ek_netto: 12000, fin: 'WVWZZZ1KZAW000001', kennzeichen: 'BB-XY 123', notiz: 'intern', standort_id: 's1', owner_user_id: 'u1', ...x,
});

test('Positivliste: Interna verlassen den Betrieb nie', () => {
  const f = oeffentlich(zeile());
  assert.ok(f);
  for (const feld of NIE_OEFFENTLICH) {
    assert.ok(!(feld in f), `${feld} darf nicht öffentlich sein`);
    assert.ok(!BOERSE_SPALTEN.split(',').map((x) => x.trim()).includes(feld), `${feld} steht in BOERSE_SPALTEN`);
  }
  assert.deepEqual(f.ausstattung, ['Navigationssystem', 'Sitzheizung vorn']);
  assert.equal(f.vorschaden_text, null, 'Vorschaden-Text nur bei „ja"');
  assert.equal(oeffentlich(zeile({ vorschaden: 'ja' })).vorschaden_text, 'Kratzer');
});

test('Sichtbarkeit: nur inseriert und Bestand/Aufbereitung/Zulauf', () => {
  assert.equal(sichtbar(zeile()), true);
  assert.equal(sichtbar(zeile({ status: 'zulauf' })), true);
  assert.equal(sichtbar(zeile({ status: 'aufbereitung' })), true);
  for (const st of ['reserviert', 'verkauft', 'archiv', 'irgendwas']) assert.equal(sichtbar(zeile({ status: st })), false, st);
  assert.equal(sichtbar(zeile({ inseriert: false })), false);
  assert.equal(sichtbar(zeile({ inseriert: 'true' })), false, 'nur echtes true');
  assert.equal(oeffentlich(zeile({ status: 'verkauft' })), null);
  assert.equal(oeffentlich(null), null);
});

test('Einstellung: ohne gültige Kennung nie aktiv, Google nur wenn aktiv', () => {
  assert.deepEqual(boerseEinstellung({ aktiv: true, kennung: K, google: true }), { aktiv: true, kennung: K, google: true });
  assert.deepEqual(boerseEinstellung({ aktiv: true, kennung: 'kurz', google: true }), { aktiv: false, kennung: null, google: false });
  assert.deepEqual(boerseEinstellung({ aktiv: false, kennung: K, google: true }), { aktiv: false, kennung: K, google: false });
  assert.equal(boerseEinstellung({ aktiv: true, kennung: K }).google, true, 'Martin 08.10.: Google standardmäßig an');
  assert.equal(boerseEinstellung({ aktiv: true, kennung: K, google: false }).google, false, 'abgeschaltet bleibt aus');
  assert.deepEqual(boerseEinstellung(null), { aktiv: false, kennung: null, google: false });
  assert.equal(boerseEinstellung({ aktiv: 'true', kennung: K }).aktiv, false);
  assert.equal(kennungGueltig(K), true);
  assert.equal(kennungGueltig(K.toUpperCase()), false);
  assert.equal(neueKennung('0123456789abcdef0123456789abcdef').length, 24);
  assert.equal(neueKennung('abc'), null);
  assert.equal(idGueltig(ID), true);
  assert.equal(idGueltig("1' or 1=1"), false);
});

test('Preis: exakt, mit Steuerhinweis je Besteuerung', () => {
  assert.equal(preisText(18900).replace(/\s/g, ' '), '18.900 €');
  assert.equal(preisText(18900.5).replace(/\s/g, ' '), '18.900,50 €');
  assert.equal(preisText(null), 'Preis auf Anfrage');
  assert.equal(preisText(0), 'Preis auf Anfrage');
  assert.match(preisZusatz({ vk_brutto: 1, besteuerung: '25a' }), /§ 25a UStG, MwSt\. nicht ausweisbar/);
  assert.match(preisZusatz({ vk_brutto: 1, besteuerung: 'regel' }), /inkl\. 19 % MwSt/);
  assert.equal(preisZusatz({ vk_brutto: 1, besteuerung: null }), 'Endpreis');
  assert.equal(preisZusatz({ vk_brutto: null, besteuerung: 'regel' }), null);
});

test('Energie, Vorschaden, Fakten', () => {
  assert.deepEqual(energieZeilen(oeffentlich(zeile())).map((x) => x[0]), ['Kraftstoffverbrauch kombiniert', 'CO₂-Emissionen kombiniert', 'CO₂-Klasse']);
  assert.equal(energieZeilen(oeffentlich(zeile()))[0][1], '4,9 l/100 km');
  const e = energieZeilen({ verbrauch_komb: 16.5, verbrauch_einheit: 'kwh', kraftstoff: 'Elektro', co2_g_km: 0, co2_klasse: 'A' });
  assert.equal(e[0][0], 'Stromverbrauch kombiniert');
  assert.equal(e[0][1], '16,5 kWh/100 km');
  assert.equal(e[1][1], '0 g/km');
  assert.deepEqual(energieZeilen({ verbrauch_komb: null, verbrauch_einheit: null, kraftstoff: 'Benzin', co2_g_km: null, co2_klasse: null }), []);
  assert.equal(vorschadenText({ vorschaden: 'keine_bekannt', vorschaden_text: null }), 'Keine Unfallschäden bekannt');
  assert.equal(vorschadenText({ vorschaden: 'ja', vorschaden_text: null }), 'Vorschaden vorhanden, Einzelheiten auf Anfrage');
  assert.equal(vorschadenText({ vorschaden: null, vorschaden_text: null }), 'Vorschäden: nicht bekannt');
  const fa = Object.fromEntries(fakten(oeffentlich(zeile())));
  assert.equal(fa['Erstzulassung'], '05/2020');
  assert.equal(fa['Leistung'], '110 kW (150 PS)');
  assert.equal(fa['HU bis'], '04/2027');
  assert.equal(titel(oeffentlich(zeile())), 'Volkswagen Golf Variant 2.0 TDI');
  assert.equal(titel(oeffentlich(zeile({ inserat_titel: 'Golf Variant | 150 PS' }))), 'Golf Variant | 150 PS');
  assert.match(kurzZeile(oeffentlich(zeile())), /^EZ 05\/2020 · 62.000 km · 110 kW \(150 PS\) · Diesel$/);
});

test('Filter und Sortierung: ungültiges ignoriert, ohne Preis ans Ende', () => {
  const l = [
    oeffentlich(zeile({ id: 'a', marke: 'BMW', vk_brutto: 30000, km_stand: 10000, aktualisiert_am: '2026-10-01' })),
    oeffentlich(zeile({ id: 'b', marke: 'bmw', vk_brutto: null, km_stand: 5000, aktualisiert_am: '2026-10-07' })),
    oeffentlich(zeile({ id: 'c', marke: 'Audi', kraftstoff: 'Benzin', vk_brutto: 20000, km_stand: 90000, aktualisiert_am: '2026-10-05' })),
  ];
  const f0 = filterLesen({ sort: 'quatsch', bis: 'abc', marke: '' });
  assert.deepEqual(f0, { marke: null, kraftstoff: null, preisBis: null, sort: 'neu' });
  assert.deepEqual(filtern(l, f0).map((x) => x.id), ['b', 'c', 'a']);
  assert.deepEqual(filtern(l, filterLesen({ sort: 'preis_auf' })).map((x) => x.id), ['c', 'a', 'b']);
  assert.deepEqual(filtern(l, filterLesen({ sort: 'preis_ab' })).map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(filtern(l, filterLesen({ sort: 'km' })).map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(filtern(l, filterLesen({ marke: 'BMW' })).map((x) => x.id).sort(), ['a', 'b']);
  assert.deepEqual(filtern(l, filterLesen({ bis: '25.000' })).map((x) => x.id), ['c'], 'ohne Preis fällt bei „bis" raus');
  assert.deepEqual(filtern(l, filterLesen({ kraftstoff: ['Benzin', 'x'] })).map((x) => x.id), ['c']);
  assert.deepEqual(auswahlWerte(l, 'marke'), ['Audi', 'BMW']);
});

test('Anfrage-Eingabe: Pflichtfelder, Kopfzeile, Längen', () => {
  assert.equal(anfrageEingabePruefen({ name: '', email: 'a@b.de', datenschutz: true }).ok, false);
  assert.equal(anfrageEingabePruefen({ name: 'Max', datenschutz: true }).ok, false);
  assert.equal(anfrageEingabePruefen({ name: 'Max', email: 'kaputt', datenschutz: true }).ok, false);
  assert.equal(anfrageEingabePruefen({ name: 'Max', telefon: 'abc', datenschutz: true }).ok, false);
  assert.equal(anfrageEingabePruefen({ name: 'Max', email: 'a@b.de' }).ok, false, 'ohne Zustimmung nie');
  const r = anfrageEingabePruefen({ name: '  Max Muster ', telefon: '0170 123456', wunsch: 'probefahrt', nachricht: 'x'.repeat(5000), datenschutz: true });
  assert.equal(r.ok, true);
  assert.equal(r.daten.name, 'Max Muster');
  assert.equal(r.daten.email, null);
  assert.match(r.daten.nachricht, /^\[Webseite · Probefahrt vereinbaren\]\n/);
  assert.ok(r.daten.nachricht.length <= 2000, 'passt in die Spalte nachricht');
  assert.equal(anfrageEingabePruefen({ name: 'Max', email: 'a@b.de', wunsch: 'hack', datenschutz: true }).daten.wunsch, 'info');
});

test('Strukturdaten: absolut, ohne Interna, sicher eingebettet', () => {
  const f = oeffentlich(zeile({ inserat_text: 'Text </script><script>alert(1)</script>' }));
  const d = strukturDaten(f, { basis: 'https://argonaut-os.com/', url: `https://argonaut-os.com/fahrzeuge/${K}/${ID}`, bilder: ['/api/oeffentlich/kfz-boerse-bild?k=x&m=y'], firma: 'Autohaus Test', ort: 'Böblingen' });
  assert.equal(d['@type'], 'Car');
  assert.equal(d.url, `https://argonaut-os.com/fahrzeuge/${K}/${ID}`);
  assert.equal(d.image[0], 'https://argonaut-os.com/api/oeffentlich/kfz-boerse-bild?k=x&m=y');
  assert.equal(d.offers.price, 18900);
  assert.equal(d.offers.availability, 'https://schema.org/InStock');
  assert.equal(d.mileageFromOdometer.unitCode, 'KMT');
  const text = JSON.stringify(d);
  assert.ok(!text.includes('WVWZZZ') && !text.includes('BB-XY') && !text.includes('12000'), 'keine FIN, kein Kennzeichen, kein EK');
  const sicher = jsonSicher(d);
  assert.ok(!sicher.includes('</script>') && !sicher.includes('<'));
  assert.deepEqual(JSON.parse(sicher), d);
  assert.equal(strukturDaten(oeffentlich(zeile({ status: 'zulauf' })), { basis: 'https://x.de', url: 'https://x.de/fahrzeuge/1', bilder: [], firma: null, ort: null }).offers.availability, 'https://schema.org/PreOrder');
  assert.equal(strukturDaten(oeffentlich(zeile({ vk_brutto: null })), { basis: 'https://x.de', url: 'https://x.de/fahrzeuge/1', bilder: [], firma: null, ort: null }).offers, undefined);
});

test('Darstellung und Rechtstexte', () => {
  assert.equal(textAuf('#0A1628'), '#FFFFFF');
  assert.equal(textAuf('#FFE066'), '#111827');
  assert.equal(textAuf('kaputt'), '#FFFFFF');
  assert.deepEqual(firmaFehlt({ name: 'A', strasse: 'B 1', plz: '1', ort: 'C', email: '', telefon: '1' }), []);
  assert.deepEqual(firmaFehlt({ name: '', strasse: '', plz: '', ort: '', email: '', telefon: '' }).length, 4);
  const h = datenschutzHinweis({ name: 'Autohaus Test', strasse: 'Weg 1', plz: '71032', ort: 'Böblingen', email: 'info@test.de', telefon: '' });
  assert.match(h, /^Verantwortlich: Autohaus Test, Weg 1, 71032 Böblingen, info@test\.de\./);
  assert.match(h, /Art\. 6 Abs\. 1 lit\. b DSGVO/);
  assert.ok(!/Server in der EU|EU-Server/i.test(h), 'keine Standort-Behauptung ohne Prüfung');
});

test('Türen und Deckel', () => {
  const a = OFFENE_TUEREN.find((t) => t.pfad === 'oeffentlich/kfz-boerse-anfrage');
  assert.ok(a && a.schutz === 'formular' && a.geprueft);
  assert.ok(DROSSEL['oeffentlich/kfz-boerse-anfrage'].some((r) => r.art === 'ip'));
  assert.ok(DROSSEL['oeffentlich/kfz-boerse-anfrage'].some((r) => r.art === 'ziel'));
  const b = OFFENE_TUEREN.find((t) => t.pfad === 'oeffentlich/kfz-boerse-bild');
  assert.ok(b && b.schutz === 'nur-lesen' && b.geprueft);
});

test('Quelltext-Wächter: Laden nur über Positivliste, Bild nur Foto, Route prüft Sichtbarkeit', () => {
  const laden = lies('lib/kfzBoerseLaden.ts');
  assert.ok(!/from\('kfz_bestand'\)\.select\('\*'\)/.test(laden));
  assert.equal((laden.match(/from\('kfz_bestand'\)\.select\(BOERSE_SPALTEN\)/g) || []).length, 2);
  assert.match(laden, /\.eq\('owner_user_id', betrieb\)\.eq\('inseriert', true\)\.in\('status', BOERSE_STATUS\)/);
  assert.match(laden, /\.eq\('art', 'foto'\)/);
  assert.match(laden, /rows\.length !== 1/);
  const bild = lies('app/api/oeffentlich/kfz-boerse-bild/route.ts');
  assert.match(bild, /medium\.art !== 'foto'/);
  assert.match(bild, /sichtbar\(fz/);
  assert.match(bild, /\.eq\('owner_user_id', b\.betrieb\)\.eq\('id', m\)/);
  const anf = lies('app/api/oeffentlich/kfz-boerse-anfrage/route.ts');
  assert.match(anf, /sichtbaresFahrzeug\(db, bt\.betrieb, id\)/);
  assert.match(anf, /owner_user_id: bt\.betrieb, bestand_id: id/);
  assert.match(anf, /quelle: 'website'/);
  assert.match(anf, /firma_hp/);
  // Paket 273: Seiten sind dünn, die Ansicht steht in BoerseAnsichten.tsx.
  for (const seite of ['app/fahrzeuge/[kennung]/page.tsx', 'app/fahrzeuge/[kennung]/[id]/page.tsx', 'app/fahrzeuge/BoerseAnsichten.tsx']) {
    assert.ok(!/from\('kfz_bestand'\)/.test(lies(seite)), `${seite} liest nie selbst`);
  }
  const ans = lies('app/fahrzeuge/BoerseAnsichten.tsx');
  assert.match(ans, /index: false, follow: false/);
  assert.match(ans, /einst\.google \? \{ index: true/);
  assert.ok(!/ek_netto|kfz_kalkulation/.test(ans));
});
