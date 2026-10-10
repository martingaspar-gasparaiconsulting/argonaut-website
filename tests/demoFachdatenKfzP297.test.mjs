// Paket 297 (10.10.2026): Vorführ-Autohaus mit vollem Kfz-Fachpaket.
// Werte gegen die Prüfregeln aus p259–p277, p283, p291 (in der Test-Datenbank eingespielt).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  KFZ_FACH_SEEDER, KFZ_FACH_LOESCH_ORDER, KFZ_FACH_BESITZER_TABELLEN, FACHDATEN, FACH_LEITTABELLE, FAHRZEUGE, TEAM, KUNDEN, MIETFLOTTE, demoFin, FACH_NOTIZ,
} from '../out/demoFachdatenKfz.js';
import { zeilenSichern, neuerKontext, kontextErgaenzen, loeschPlan } from '../out/musterbetriebXxl.js';
import { verkaufsZeilen, filterZeitraum, zeitraum, kennzahlen } from '../out/kfzChefBlick.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const UID = '11111111-1111-4111-8111-111111111111';
const HEUTE = '2026-10-10';
const FIN = /^[A-HJ-NPR-Z0-9]{17}$/;

function simuliere(heute = HEUTE) {
  const ctx = neuerKontext(UID, heute);
  const z = {};
  let n = 0;
  for (const s of KFZ_FACH_SEEDER) {
    const zeilen = zeilenSichern(s.baue(ctx), UID);
    z[s.key] = zeilen;
    if (!zeilen.length || s.ohneId) continue;
    kontextErgaenzen(ctx, s.tabelle, zeilen.map(() => `${s.tabelle}-${++n}`), zeilen);
  }
  return { ctx, z };
}

test('Jede Tabelle bekommt Zeilen, alle gehören dem Vorführ-Betrieb, keine echte Adresse', () => {
  const { z } = simuliere();
  for (const s of KFZ_FACH_SEEDER) {
    assert.ok(z[s.key].length > 0, `${s.key} leer`);
    for (const r of z[s.key]) {
      assert.equal(r.owner_user_id, UID, s.key);
      for (const v of Object.values(r)) if (typeof v === 'string' && v.includes('@')) assert.match(v, /@example\.com$/, s.key);
    }
  }
  assert.equal(z.team.length, TEAM.length);
  assert.equal(z.kunden.length, KUNDEN.length);
});

test('Bewusst NICHT dabei: Rechnungen, Partner-Aufträge (unlöschbar), Börse, Fahrtenbuch', () => {
  const tabellen = KFZ_FACH_SEEDER.map((s) => s.tabelle);
  for (const t of ['rechnungen', 'rechnung_positionen', 'partner_auftrag', 'partner_eintrag', 'kfz_boerse_aufruf', 'fahrtenbuch_fahrt', 'fuehrerschein_kontrolle', 'miet_anfrage']) {
    assert.ok(!tabellen.includes(t), t);
  }
  const { z } = simuliere();
  for (const v of z.kfz_verkauf) assert.equal(v.rechnung_id, undefined);
  assert.ok(z.miet_buchung.every((b) => b.status === 'reserviert'), 'nur Reservierungen (bleiben löschbar)');
});

test('Bestand: Porsche, AMG, jeder Status, gültige eindeutige FIN, Werte nach den Prüfregeln', () => {
  const { z } = simuliere();
  const b = z.kfz_bestand;
  assert.equal(b.length, FAHRZEUGE.length);
  assert.deepEqual([...new Set(b.map((r) => r.status))].sort(), ['aufbereitung', 'bestand', 'reserviert', 'verkauft', 'zulauf']);
  assert.ok(b.some((r) => r.marke === 'Porsche' && r.modell === '911 Carrera S'));
  assert.ok(b.some((r) => r.variante === 'AMG Line'));
  for (const sp of ['Pkw', 'Nutzfahrzeug', 'Wohnmobil', 'Motorrad']) assert.ok(b.some((r) => r.sparte === sp), sp);
  const fins = b.map((r) => r.fin);
  for (const f of fins) assert.match(f, FIN);
  assert.equal(new Set(fins).size, fins.length);
  assert.equal(new Set(b.map((r) => r.interne_nr)).size, b.length);
  for (const r of b) {
    assert.ok(['25a', 'regel'].includes(r.besteuerung));
    assert.ok(r.ek_netto >= 0 && r.vk_brutto > r.ek_netto, r.interne_nr);
    assert.ok(['keine_bekannt', 'ja', 'unbekannt'].includes(r.vorschaden));
    assert.ok(['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(r.co2_klasse));
    assert.ok(['l', 'kwh', 'kg'].includes(r.verbrauch_einheit));
    assert.match(r.erstzulassung, /^\d{4}-\d{2}-01$/);
    assert.ok(!r.inserat_titel || r.inserat_titel.length <= 120);
    if (r.status === 'verkauft') { assert.ok(r.verkauft_am && r.verkauft_am <= HEUTE); assert.equal(r.inseriert, false); }
    else assert.equal(r.verkauft_am, null);
    if (r.status === 'zulauf') assert.equal(r.eingang_am, null);
    if (r.bewertung_anbieter) assert.ok(r.bewertung_ek <= r.bewertung_vk);
  }
  const lang = b.filter((r) => r.status === 'bestand' && r.eingang_am && r.eingang_am < '2026-07-12');
  assert.ok(lang.length >= 2, 'Langsteher über 90 Tage für die Ampel');
});

test('Chef-Blick hat Futter: Verkäufe dieses Jahr und Vorjahr, je mit Verkäufer und erzieltem Preis', () => {
  const { z, ctx } = simuliere();
  const fz = z.kfz_bestand.map((r, i) => ({ id: ctx.ids.kfz_bestand[i], interne_nr: r.interne_nr, marke: r.marke, modell: r.modell, status: r.status, eingang_am: r.eingang_am, verkauft_am: r.verkauft_am, ek_netto: r.ek_netto, vk_brutto: r.vk_brutto, besteuerung: r.besteuerung }));
  const zeilen = verkaufsZeilen({ fahrzeuge: fz, kalk: z.kfz_bestand_kalk, verkaeufe: [], kosten: z.kfz_bestand_kosten, einst: { standkostenTag: 9, gemeinkostenProzent: 6 } });
  const zr = zeitraum('jahr', HEUTE);
  const jetzt = kennzahlen(filterZeitraum(zeilen, zr.von, zr.bis));
  const vj = kennzahlen(filterZeitraum(zeilen, zr.vjVon, zr.vjBis));
  assert.equal(jetzt.anzahl, 6, 'dieses Jahr');
  assert.equal(vj.anzahl, 3, 'Vorjahr bis zum selben Tag');
  for (const k of z.kfz_bestand_kalk) {
    assert.ok(['rohertrag', 'umsatz', 'fest'].includes(k.prov_v_art) && ['rohertrag', 'umsatz', 'fest'].includes(k.prov_h_art));
    assert.ok(k.verkaeufer && k.verkaeufer.length <= 120);
  }
  const verkauft = z.kfz_bestand.filter((r) => r.status === 'verkauft').length;
  assert.equal(z.kfz_bestand_kalk.filter((k) => k.vk_erzielt).length, verkauft, 'jeder Verkauf mit erzieltem Preis');
});

test('Vorgänge: Werte nach den Prüfregeln (Anfrage, Probefahrt, Tresor, Zulassung, Ankauf, Verkauf, Kosten)', () => {
  const { z } = simuliere();
  const KOSTENART = ['aufbereitung', 'reparatur', 'teile', 'lack', 'reifen', 'hu', 'transport', 'zulassung', 'werbung', 'fremd', 'sonstiges'];
  for (const k of z.kfz_bestand_kosten) assert.ok(KOSTENART.includes(k.art) && k.betrag_netto >= 0 && (k.bezeichnung ?? '').length <= 160);
  const st = new Set(z.kfz_anfrage.map((a) => a.status));
  for (const s of ['neu', 'in_arbeit', 'termin', 'angebot', 'gewonnen', 'verloren']) assert.ok(st.has(s), s);
  for (const a of z.kfz_anfrage) {
    assert.ok(['telefon', 'mail', 'laden', 'website', 'boerse', 'empfehlung', 'sonstiges'].includes(a.quelle));
    if (['gewonnen', 'verloren'].includes(a.status)) assert.ok(a.abschluss_grund && a.abgeschlossen_am); else assert.equal(a.abschluss_grund, null);
  }
  for (const p of z.kfz_probefahrt) {
    assert.ok(['geplant', 'unterwegs', 'zurueck', 'storniert'].includes(p.status) && ['eigen', 'rot', 'kurzzeit'].includes(p.kennzeichen_art));
    if (p.km_ende !== undefined && p.km_start !== undefined) assert.ok(p.km_ende >= p.km_start);
    if (p.ergebnis) assert.ok(['offen', 'interesse', 'kauf', 'kein_interesse'].includes(p.ergebnis));
  }
  for (const t of z.kfz_tresor) {
    assert.ok(['zb2', 'zb1', 'schluessel', 'coc', 'serviceheft', 'hu', 'sonstiges'].includes(t.art));
    assert.ok(['im_haus', 'ausgegeben', 'bei_zulassung', 'bei_bank', 'fehlt', 'beim_kaeufer'].includes(t.status));
    if (t.status === 'ausgegeben') assert.ok(t.ausgegeben_an);
  }
  for (const zl of z.kfz_zulassung) assert.match(zl.evb, /^[A-Z0-9]{7}$/);
  assert.deepEqual(z.kfz_ankauf.map((a) => a.status).sort(), ['angeboten', 'angekauft', 'offen']);
  for (const a of z.kfz_ankauf) {
    assert.match(a.fin, FIN);
    assert.ok(['hof', 'inzahlungnahme', 'telefon', 'online'].includes(a.quelle));
    assert.ok(Array.isArray(a.schaeden));
  }
  assert.deepEqual(z.kfz_verkauf.map((v) => v.status).sort(), ['angebot', 'reserviert', 'uebergeben']);
  for (const v of z.kfz_verkauf) {
    assert.ok(Array.isArray(v.zusatz) && v.zusatz.every((x) => x.text && x.betrag >= 0));
    assert.ok(['gesetzlich', 'ein_jahr', 'ausgeschlossen'].includes(v.gewaehr));
    if (v.gewaehr === 'ein_jahr') assert.equal(v.gewaehr_gesondert, true, 'Verkürzung nur gesondert vereinbart');
  }
  // Werkstatt kennt den verkauften Octavia (gleiche FIN wie im Handel)
  const octavia = z.kfz_bestand.find((r) => r.modell === 'Octavia Combi RS');
  assert.ok(z.werkstatt_fahrzeuge.some((w) => w.fin === octavia.fin));
  assert.ok(z.werkstatt_auftraege.some((w) => w.kfz_bestand_id), 'interne Aufbereitung am Handelsfahrzeug');
  assert.equal(demoFin('WP0', 0), 'WP0ZZZRENZ1000001');
});

test('Vermietung: Flotte nach den Prüfregeln, nur zukünftige Reservierungen ohne Überschneidung', () => {
  const { z } = simuliere();
  for (const m of z.miet_fahrzeug) {
    assert.ok(['pkw', 'transporter', 'wohnmobil', 'motorrad', 'ebike', 'luxus', 'lkw', 'anhaenger', 'kart', 'rennfahrzeug'].includes(m.art));
    assert.ok(m.mindestalter >= 14 && m.mindestalter <= 99 && m.tagessatz_cent >= 0);
  }
  assert.equal(z.miet_fahrzeug.length, MIETFLOTTE.length);
  for (const b of z.miet_buchung) {
    assert.ok(Date.parse(b.rueckgabe_plan) > Date.parse(b.abholung));
    assert.ok(b.abholung.slice(0, 10) > HEUTE, 'in der Zukunft');
  }
  assert.ok(z.miet_einstellung[0].mietbedingungen.includes('keinen Mustertext'));
});

test('Löschen: Kinder vor Eltern, Besitzer-Tabellen ohne id, Leit-Tabelle, Route und Seite verdrahtet', () => {
  for (const s of KFZ_FACH_SEEDER) {
    if (s.ohneId) continue;
    assert.ok(KFZ_FACH_LOESCH_ORDER.includes(s.tabelle) || s.tabelle === 'kontakte', s.tabelle);
  }
  const o = (t) => KFZ_FACH_LOESCH_ORDER.indexOf(t);
  for (const [kind, eltern] of [['miet_buchung', 'miet_fahrzeug'], ['werkstatt_positionen', 'werkstatt_auftraege'], ['werkstatt_auftraege', 'werkstatt_fahrzeuge'], ['werkstatt_auftraege', 'mitarbeiter'], ['kfz_verkauf', 'kfz_bestand'], ['kfz_ankauf', 'kfz_bestand'], ['kfz_tresor', 'kfz_bestand'], ['kfz_anfrage', 'mitarbeiter']]) {
    assert.ok(o(kind) < o(eltern), `${kind} vor ${eltern}`);
  }
  assert.deepEqual(KFZ_FACH_BESITZER_TABELLEN, ['miet_einstellung']);
  assert.ok(KFZ_FACH_SEEDER.filter((s) => s.ohneId).every((s) => ['kfz_bestand_kalk', 'miet_einstellung'].includes(s.tabelle)));
  assert.equal(FACHDATEN.autohaus.seeder, KFZ_FACH_SEEDER);
  assert.equal(FACH_LEITTABELLE.autohaus, 'kfz_bestand');
  const plan = loeschPlan([{ tabelle: 'kontakte', datensatz_id: 'k' }, { tabelle: 'miet_fahrzeug', datensatz_id: 'f' }, { tabelle: 'miet_buchung', datensatz_id: 'b' }], [...KFZ_FACH_LOESCH_ORDER, 'kontakte']);
  assert.deepEqual(plan.map((p) => p.tabelle), ['miet_buchung', 'miet_fahrzeug', 'kontakte']);

  const r = lies('app/api/admin/demo-betriebe/route.ts');
  assert.ok(r.includes('const fd = await fachdatenLaden(admin, k.id, b.slug, heute);'));
  assert.ok(r.includes('loeschPlan((reg as Array<{ tabelle: string; datensatz_id: string }> | null) || [], [...fachLoeschOrder(slug), ...LOESCH_ORDER])'));
  assert.ok(r.includes(".in('id', schritt.ids.slice(i, i + 200)).eq('owner_user_id', userId)"), 'Löschen nur beim Vorführ-Konto');
  assert.ok(r.includes('const gesperrt = await adminGuard();'));
  const seite = lies('app/admin/demo-betriebe/page.tsx');
  assert.ok(seite.includes("anlegen(['autohaus'])"));
  assert.ok(FACH_NOTIZ.includes('Beispiel'));
});
