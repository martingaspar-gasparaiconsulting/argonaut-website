// ============================================================================
// tests/kfzKaufstatusP281.test.mjs — Paket 281 (09.10.2026) · K15a Kaufstatus im Kundenportal
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  portalSichtbar, kaufSchritte, portalKauf, briefStand, kontaktVorschlag, kontaktAusKaeufer, mailNorm,
} from '../out/kfzKaufstatus.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const HEUTE = '2026-10-09';
function vg(o = {}) {
  return { nr: 'V-0007', status: 'vertrag', reserviert_bis: null, vertrag_am: '2026-10-05', liefertermin: '2026-10-20', uebergabe_am: null,
    preis_brutto: 20000, zusatz: [{ text: 'Zulassung', betrag: 150 }], inzahlung_ankauf_id: null, inzahlung_betrag: null, anzahlung: 2000, ...o };
}
const FZ = { marke: 'VW', modell: 'Golf', variante: '1.5 TSI', erstzulassung: '2021-03-01', farbe: 'Blau', fin: 'WVWZZZ1KZAW000001', ek_netto: 12000, notiz: 'intern' };
const stand = (l) => l.map((x) => `${x.key}:${x.stand}`).join(' ');

test('Sichtbar erst ab reserviert, nie storniert oder Angebot', () => {
  assert.equal(portalSichtbar('angebot'), false);
  assert.equal(portalSichtbar('storniert'), false);
  assert.equal(portalSichtbar('reserviert'), true);
  assert.equal(portalSichtbar('vertrag'), true);
  assert.equal(portalSichtbar('uebergeben'), true);
  assert.equal(portalKauf(vg({ status: 'angebot' }), FZ, null, null, HEUTE), null);
});

test('Schritte: genau ein aktiver, Zulassung nur mit Auftrag', () => {
  assert.equal(stand(kaufSchritte(vg({ status: 'reserviert', reserviert_bis: '2026-10-12' }), null, HEUTE)), 'reserviert:aktiv vertrag:offen bereit:offen uebergeben:offen');
  assert.match(kaufSchritte(vg({ status: 'reserviert', reserviert_bis: '2026-10-12' }), null, HEUTE)[0].text, /12\.10\.2026/);
  assert.equal(stand(kaufSchritte(vg(), null, HEUTE)), 'reserviert:erledigt vertrag:erledigt bereit:aktiv uebergeben:offen');
  const z = { art: 'zulassung', status: 'beim_amt', termin: '2026-10-15', kennzeichen_neu: null };
  const s1 = kaufSchritte(vg(), z, HEUTE);
  assert.equal(stand(s1), 'reserviert:erledigt vertrag:erledigt zulassung:aktiv bereit:offen uebergeben:offen');
  assert.match(s1[2].text, /Zulassungsstelle/);
  const s2 = kaufSchritte(vg(), { ...z, status: 'erledigt', kennzeichen_neu: 'BB-AG 281' }, HEUTE);
  assert.equal(stand(s2), 'reserviert:erledigt vertrag:erledigt zulassung:erledigt bereit:aktiv uebergeben:offen');
  assert.match(s2[2].text, /BB-AG 281/);
  assert.equal(kaufSchritte(vg(), { ...z, status: 'storniert' }, HEUTE).some((x) => x.key === 'zulassung'), false);
  assert.match(kaufSchritte(vg({ liefertermin: '2026-10-01' }), null, HEUTE).find((x) => x.key === 'bereit').text, /abstimmen/, 'vergangener Termin');
  const fertig = kaufSchritte(vg({ status: 'uebergeben', uebergabe_am: '2026-10-08' }), z, HEUTE);
  assert.ok(fertig.every((x) => x.stand === 'erledigt'));
  assert.equal(fertig.filter((x) => x.stand === 'aktiv').length, 0);
  for (const status of ['reserviert', 'vertrag']) for (const zs of [null, 'offen', 'beim_amt', 'erledigt', 'storniert']) {
    const l = kaufSchritte(vg({ status }), zs ? { ...z, status: zs } : null, HEUTE);
    assert.equal(l.filter((x) => x.stand === 'aktiv').length, 1, `${status}/${zs}`);
  }
});

test('Portal-Daten: Positivliste, Geld aus dem Verkauf, Brief grob', () => {
  const k = portalKauf(vg({ inzahlung_ankauf_id: 'a1', inzahlung_betrag: 5000 }), FZ, null, 'im_haus', HEUTE);
  assert.equal(k.fahrzeug, 'VW Golf 1.5 TSI');
  assert.equal(k.erstzulassung, '03/2021');
  assert.deepEqual(k.geld, { gesamt: 20150, anzahlung: 2000, inzahlung: 5000, rest: 13150 });
  assert.equal(k.brief, 'beim_haendler');
  const roh = JSON.stringify(k);
  for (const verboten of ['WVWZZZ', '12000', 'intern', 'ek_netto', 'fin']) assert.ok(!roh.includes(verboten), verboten);
  assert.deepEqual(Object.keys(k).sort(), ['brief', 'erstzulassung', 'fahrzeug', 'farbe', 'geld', 'nr', 'schritte', 'statusText'].sort());
  assert.equal(portalKauf(vg(), null, null, null, HEUTE).fahrzeug, 'Ihr Fahrzeug');
  assert.equal(briefStand('beim_kaeufer'), 'uebergeben');
  assert.equal(briefStand('bei_zulassung'), 'zulassung');
  assert.equal(briefStand('ausgegeben'), 'beim_haendler', 'an wen ausgegeben, sieht der Käufer nie');
  assert.equal(briefStand('fehlt'), null);
  assert.equal(briefStand(null), null);
});

test('Kontakt-Vorschlag nur über eindeutige E-Mail, nie über den Namen', () => {
  const k = [
    { id: '1', email: 'Max@Beispiel.de', vorname: 'Max', nachname: 'Muster' },
    { id: '2', email: 'anna@beispiel.de', vorname: 'Max', nachname: 'Muster' },
    { id: '3', email: 'doppelt@beispiel.de' }, { id: '4', email: ' DOPPELT@beispiel.de ' },
  ];
  assert.equal(mailNorm(' A@B.DE '), 'a@b.de');
  const t = kontaktVorschlag('max@beispiel.de ', k);
  assert.equal(t.art, 'treffer'); assert.equal(t.kontakt.id, '1');
  assert.deepEqual(kontaktVorschlag('doppelt@beispiel.de', k), { art: 'mehrdeutig', anzahl: 2 });
  assert.deepEqual(kontaktVorschlag('', k), { art: 'keiner' });
  assert.deepEqual(kontaktVorschlag('Max Muster', k), { art: 'keiner' }, 'Name ist keine E-Mail');
  assert.deepEqual(kontaktVorschlag('neu@beispiel.de', k), { art: 'keiner' });
});

test('Neuer Kontakt aus Käuferdaten', () => {
  const n = kontaktAusKaeufer({ nr: 'V-0007', kaeufer_name: 'Erika Mustermann', kaeufer_firma: null, kaeufer_email: ' erika@beispiel.de ', kaeufer_tel: '07031 1234', kaeufer_anschrift: 'Hauptstr. 1\n71032 Böblingen' });
  assert.equal(n.vorname, 'Erika'); assert.equal(n.nachname, 'Mustermann');
  assert.equal(n.email, 'erika@beispiel.de');
  assert.equal(n.status, 'kunde'); assert.equal(n.quelle, 'Fahrzeugverkauf');
  assert.match(n.notizen, /V-0007/); assert.match(n.notizen, /Hauptstr\. 1, 71032 Böblingen/);
  assert.equal(kontaktAusKaeufer({ nr: null, kaeufer_name: ' ', kaeufer_firma: null, kaeufer_email: 'x@y.de', kaeufer_tel: null, kaeufer_anschrift: null }), null);
  assert.equal(kontaktAusKaeufer({ nr: null, kaeufer_name: null, kaeufer_firma: 'Autohaus GmbH', kaeufer_email: null, kaeufer_tel: null, kaeufer_anschrift: null }).firma, 'Autohaus GmbH');
});

test('Einbau: Portal-Route hart gefiltert, Karte in der Akte, Portal-Seite, Guide', () => {
  const r = lies('app/api/oeffentlich/portal/route.ts');
  const teil = r.slice(r.indexOf('Paket 281'), r.indexOf('// 7)'));
  assert.match(teil, /from\('kfz_verkauf'\)[\s\S]*?\.eq\('owner_user_id', ownerId\)\.eq\('kontakt_id', kontaktId\)/);
  assert.match(teil, /\.in\('status', \['reserviert', 'vertrag', 'uebergeben'\]\)/);
  for (const t of ['kfz_bestand', 'kfz_zulassung', 'kfz_tresor']) assert.match(teil, new RegExp(`from\\('${t}'\\)[^\\n]*\\.eq\\('owner_user_id', ownerId\\)`), t);
  assert.doesNotMatch(teil, /\bfin\b|ek_netto|notiz/, 'nichts Internes laden');
  assert.match(teil, /portalKauf\(/);
  assert.match(r, /sendungen, kaeufe \}/);
  assert.match(lies('app/dashboard/kfz/bestand/KfzVerkauf.tsx'), /<KfzKaufstatus v=\{aktiv\}/);
  const karte = lies('app/dashboard/kfz/bestand/KfzKaufstatus.tsx');
  assert.match(karte, /kontaktVorschlag\(/);
  assert.match(karte, /owner_user_id: v\.owner_user_id, kontakt_id: v\.kontakt_id/);
  assert.match(karte, /replace\(\/\[,\(\)"\*\]\/g/, 'Suchfilter abgesichert');
  assert.match(lies('app/portal/[token]/page.tsx'), /<PortalKauf kaeufe=\{kaeufe\} \/>/);
  assert.match(lies('lib/guideWissen.ts'), /Kaufstatus für den Käufer/);
});
