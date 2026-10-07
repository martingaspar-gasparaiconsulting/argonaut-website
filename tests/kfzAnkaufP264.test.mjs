// ============================================================================
// tests/kfzAnkaufP264.test.mjs — Paket 264 (07.10.2026) · K4 Teil 2
// Ankaufschein (Inhalt) und Online-Ankaufformular (Prüfung, Kennung, Tür)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kennungGueltig, neueKennung, onlineEinstellung, onlineEingabePruefen, ankaufscheinInhalt, ANKAUF_MODUL } from '../out/kfzAnkauf.js';
import { OFFENE_TUEREN } from '../out/offeneTueren.js';
import { DROSSEL } from '../out/drossel.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Kennung: 24 Zeichen a–z0–9, aus Zufall, nie aus zu wenig Zufall', () => {
  const k = neueKennung('a1B2c3d4e5f60718293a4b5c6d7e8f90');
  assert.equal(k, 'a1b2c3d4e5f60718293a4b5c');
  assert.ok(kennungGueltig(k));
  assert.equal(neueKennung('abc'), null);
  assert.equal(kennungGueltig('abc'), false);
  assert.equal(kennungGueltig('A1B2C3D4E5F60718293A4B5C'), false, 'nur Kleinbuchstaben');
  assert.equal(kennungGueltig("a1b2c3d4e5f60718293a4b5' or 1=1"), false);
  assert.equal(kennungGueltig(null), false);
  assert.equal(ANKAUF_MODUL, 'kfz-ankauf');
});

test('Online-Einstellung: nur aktiv mit gültiger Kennung', () => {
  const k = 'a'.repeat(24);
  assert.deepEqual(onlineEinstellung({ online: { aktiv: true, kennung: k } }), { aktiv: true, kennung: k });
  assert.deepEqual(onlineEinstellung({ online: { aktiv: false, kennung: k } }), { aktiv: false, kennung: k });
  assert.deepEqual(onlineEinstellung({ online: { aktiv: true, kennung: 'kurz' } }), { aktiv: false, kennung: null });
  assert.deepEqual(onlineEinstellung({ online: { aktiv: 'ja', kennung: k } }).aktiv, false);
  assert.deepEqual(onlineEinstellung(null), { aktiv: false, kennung: null });
  assert.deepEqual(onlineEinstellung({ richtwerte: {} }), { aktiv: false, kennung: null });
});

const gut = { name: 'Max Muster', email: 'max@example.com', marke: 'VW', modell: 'Golf', km: '88.500', datenschutz: true };

test('Online-Eingabe: Pflichtfelder, Zustimmung, Formate', () => {
  const r = onlineEingabePruefen(gut, 2026);
  assert.equal(r.ok, true);
  assert.equal(r.daten.km_stand, 88500);
  assert.equal(r.daten.quelle, 'online');
  assert.equal(r.daten.status, 'offen');
  assert.equal(r.daten.verkaeufer_art, 'privat');
  assert.equal(r.daten.unfall_angabe, 'unbekannt', 'ohne Angabe nie „keine bekannt"');
  assert.equal(r.daten.owner_user_id, undefined, 'Betrieb setzt nur die Route');
  assert.match(onlineEingabePruefen({ ...gut, name: ' ' }, 2026).fehler, /Namen/);
  assert.match(onlineEingabePruefen({ ...gut, email: '' }, 2026).fehler, /E-Mail-Adresse oder Telefon/);
  assert.equal(onlineEingabePruefen({ ...gut, email: '', telefon: '0711 123456' }, 2026).ok, true);
  assert.match(onlineEingabePruefen({ ...gut, email: 'kaputt' }, 2026).fehler, /gültige E-Mail/);
  assert.match(onlineEingabePruefen({ ...gut, telefon: '<script>' }, 2026).fehler, /Telefonnummer/);
  assert.match(onlineEingabePruefen({ ...gut, modell: '' }, 2026).fehler, /Marke und Modell/);
  assert.match(onlineEingabePruefen({ ...gut, km: 'viel' }, 2026).fehler, /Kilometerstand/);
  assert.match(onlineEingabePruefen({ ...gut, km: '-5' }, 2026).fehler, /Kilometerstand/);
  assert.match(onlineEingabePruefen({ ...gut, datenschutz: 'true' }, 2026).fehler, /Verarbeitung/, 'nur echtes true zählt');
  assert.equal(onlineEingabePruefen(null, 2026).ok, false);
});

test('Online-Eingabe: Erstzulassung, FIN, Unfall, Preis, Gewerbe', () => {
  assert.equal(onlineEingabePruefen({ ...gut, erstzulassung: '3/2019' }, 2026).daten.erstzulassung, '2019-03-01');
  assert.equal(onlineEingabePruefen({ ...gut, erstzulassung: '2019-11' }, 2026).daten.erstzulassung, '2019-11-01');
  assert.match(onlineEingabePruefen({ ...gut, erstzulassung: '13/2019' }, 2026).fehler, /MM\/JJJJ/);
  assert.match(onlineEingabePruefen({ ...gut, erstzulassung: '01/2030' }, 2026).fehler, /MM\/JJJJ/, 'Zukunft geht nicht');
  assert.equal(onlineEingabePruefen({ ...gut, fin: 'wba 8e9c50 gk123456' }, 2026).daten.fin, 'WBA8E9C50GK123456');
  assert.match(onlineEingabePruefen({ ...gut, fin: 'WBAOE9C50GK123456' }, 2026).fehler, /FIN/);
  const u = onlineEingabePruefen({ ...gut, unfall: 'ja', unfall_text: 'Heck' }, 2026).daten;
  assert.equal(u.unfall_angabe, 'ja'); assert.equal(u.unfall_text, 'Heck');
  assert.equal(onlineEingabePruefen({ ...gut, unfall: 'keine_bekannt', unfall_text: 'x' }, 2026).daten.unfall_text, null);
  assert.equal(onlineEingabePruefen({ ...gut, unfall: 'hack' }, 2026).daten.unfall_angabe, 'unbekannt');
  const p = onlineEingabePruefen({ ...gut, preis: '12.500 €', beschreibung: 'Scheckheft' }, 2026).daten;
  assert.match(p.notiz, /Preisvorstellung des Verkäufers: 12\.500 €/);
  assert.match(p.notiz, /Beschreibung des Verkäufers: Scheckheft/);
  assert.equal(onlineEingabePruefen(gut, 2026).daten.notiz, null);
  assert.equal(onlineEingabePruefen({ ...gut, gewerblich: true }, 2026).daten.verkaeufer_art, 'gewerblich');
  assert.equal(onlineEingabePruefen({ ...gut, gewerblich: 'true' }, 2026).daten.verkaeufer_art, 'privat');
  assert.equal(onlineEingabePruefen({ ...gut, plz: '71032', ort: 'Böblingen' }, 2026).daten.verkaeufer_anschrift, '71032 Böblingen');
  assert.equal(onlineEingabePruefen({ ...gut, beschreibung: 'x'.repeat(5000) }, 2026).daten.notiz.length <= 1600, true);
});

const ankauf = {
  nr: 'A-0004', marke: 'BMW', modell: '320d', variante: 'Touring', fin: 'WBA8E9C50GK123456', kennzeichen: 'BB-AB 123', erstzulassung: '2019-03-01',
  km_stand: 88000, leistung_kw: 140, kraftstoff: 'Diesel', farbe: 'Schwarz', vorbesitzer: 2, hu_bis: '2027-03-31',
  unfall_angabe: 'ja', unfall_text: 'Parkrempler hinten', verkaeufer_art: 'privat', ankaufpreis: 14000, ziel_vk: 18990,
  schaeden: [{ bereich: 'Tür vorn links', art: 'kratzer', stufe: 'mittel', kosten: 777, notiz: 'bis Grundierung' }], aufbereitung: 0,
  verkaeufer_name: 'Erika Muster', verkaeufer_firma: null, verkaeufer_anschrift: 'Hauptstr. 1\n71032 Böblingen', verkaeufer_tel: '0711 1', verkaeufer_email: null,
  schluessel: 2, serviceheft: 'lueckenlos', angekauft_am: '2026-10-07',
};
const firma = { name: 'Autohaus Test GmbH', strasse: 'Ring 5', plz: '71034', ort: 'Böblingen', telefon: null, email: 'info@example.com' };

test('Ankaufschein: Inhalt vollständig, Schäden ohne Beträge, nichts geschönt', () => {
  const d = ankaufscheinInhalt(ankauf, firma, '2026-10-08');
  assert.equal(d.nr, 'A-0004');
  assert.equal(d.datum, '07.10.2026', 'Ankaufsdatum vor heute');
  assert.deepEqual(d.ankaeufer, ['Autohaus Test GmbH', 'Ring 5', '71034 Böblingen', 'info@example.com']);
  assert.deepEqual(d.verkaeufer, ['Erika Muster', 'Hauptstr. 1', '71032 Böblingen', '0711 1']);
  assert.ok(d.fahrzeug.some(([k, v]) => k === 'FIN' && v === 'WBA8E9C50GK123456'));
  assert.ok(d.fahrzeug.some(([k, v]) => k === 'Erstzulassung' && v === '03/2019'));
  assert.ok(d.fahrzeug.some(([k, v]) => k.startsWith('Kilometerstand') && v === '88.000 km'));
  assert.ok(d.angaben.some(([k, v]) => k.startsWith('Unfälle') && v === 'Ja: Parkrempler hinten'));
  assert.ok(d.angaben.some(([k, v]) => k === 'Serviceheft' && v === 'lückenlos'));
  assert.deepEqual(d.maengel, ['Tür vorn links: Kratzer (mittel), bis Grundierung']);
  assert.ok(!JSON.stringify(d).includes('777'), 'interne Schadensbeträge nie auf dem Schein');
  assert.deepEqual(d.preis, ['Kaufpreis: 14.000,00 €']);
  assert.ok(d.erklaerungen.length >= 3);
});

test('Ankaufschein: Unternehmen mit USt, fehlende Angaben, ohne Firmendaten', () => {
  const g = ankaufscheinInhalt({ ...ankauf, verkaeufer_art: 'gewerblich', ankaufpreis: 10000.005 }, firma, '2026-10-07');
  assert.deepEqual(g.preis, ['Kaufpreis netto: 10.000,01 €', 'zuzüglich 19 % Umsatzsteuer: 1.900,00 €', 'Kaufpreis brutto: 11.900,01 €']);
  const leer = ankaufscheinInhalt({ ...ankauf, ankaufpreis: null, unfall_angabe: null, vorbesitzer: null, serviceheft: null, schaeden: [], angekauft_am: null, verkaeufer_name: null, verkaeufer_anschrift: null, verkaeufer_tel: null }, null, '2026-10-08');
  assert.deepEqual(leer.preis, ['Kaufpreis: ______________ €']);
  assert.equal(leer.datum, '08.10.2026');
  assert.deepEqual(leer.ankaeufer, ['______________________________']);
  assert.deepEqual(leer.verkaeufer, ['______________________________']);
  assert.deepEqual(leer.maengel, []);
  assert.ok(leer.angaben.every(([, v]) => v === '—' || /\d/.test(v)), 'nicht Erfasstes als „—", nie „keine bekannt"');
  assert.ok(leer.angaben.some(([k, v]) => k.startsWith('Unfälle') && v === '—'));
});

test('Offene Tür: eingetragen, mit Deckel, Route prüft Kennung, Spam-Falle und setzt den Betrieb selbst', () => {
  const t = OFFENE_TUEREN.find((x) => x.pfad === 'oeffentlich/kfz-ankauf');
  assert.ok(t && t.schutz === 'formular' && t.geprueft);
  assert.ok(DROSSEL['oeffentlich/kfz-ankauf'].some((r) => r.art === 'ip'));
  assert.ok(DROSSEL['oeffentlich/kfz-ankauf'].some((r) => r.art === 'ziel'));
  const src = lies('app/api/oeffentlich/kfz-ankauf/route.ts');
  assert.match(src, /kennungGueltig\(k\)/);
  assert.match(src, /firma_hp/);
  assert.match(src, /owner_user_id: betrieb/);
  assert.match(src, /rows\.length !== 1/, 'doppelte Kennung -> niemandem zuordnen');
  assert.doesNotMatch(src, /owner_user_id: b\.|b\.owner_user_id|b\.betrieb/, 'Betrieb nie vom Client');
  assert.match(src, /select\('firma, email'\)/);
  const seite = lies('app/ankauf/[kennung]/page.tsx');
  assert.doesNotMatch(seite, /@supabase|createBrowserClient/, 'kein Supabase im Client');
  assert.match(lies('app/ankauf/layout.tsx'), /index: false/);
});

test('Verdrahtung: Akte druckt den Schein, Übersicht schaltet das Formular, Guide', () => {
  const akte = lies('app/dashboard/kfz/ankauf/[id]/page.tsx');
  assert.match(akte, /ankaufscheinPdf\(/);
  assert.match(akte, /ankaufscheinInhalt\(/);
  const liste = lies('app/dashboard/kfz/ankauf/page.tsx');
  assert.match(liste, /onlineSetzen\(/);
  assert.match(liste, /\.\.\.rwRoh, online:/, 'Richtwerte bleiben beim Umschalten erhalten');
  assert.match(liste, /\.\.\.rwRoh, richtwerte:/, 'Online-Einstellung bleibt beim Richtwerte-Speichern erhalten');
  assert.match(liste, /crypto\.getRandomValues/);
  assert.match(lies('lib/guideWissen.ts'), /Ankaufschein \(PDF\)/);
  assert.doesNotMatch(lies('lib/kfzAnkaufPdf.ts'), /•/, 'nur PDF-sichere Zeichen');
});
