// Paket 179 Push 2 (30.09.2026) — Musterbetrieb XXL, Branchen-Module: 51 Tabellen
// von Werkstatt bis Zuschnitt. Spalten und Regeln gegen den LIVE-Aufbau
// (information_schema, CSV von Martin) in PGlite geprueft (Baulog).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  XXL_BRANCHEN_SEEDER, XXL_BRANCHEN_LOESCH_ORDER, XXL_ALLE_SEEDER, XXL_ALLE_LOESCH_ORDER, loeschPlanAlle,
} from '../out/musterbetriebXxlBranchen.js';
import { zeilenSichern, neuerKontext, kontextErgaenzen } from '../out/musterbetriebXxl.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const UID = '11111111-1111-4111-8111-111111111111';

function simuliere(heute = '2026-09-30') {
  const ctx = neuerKontext(UID, heute);
  const lauf = [];
  let n = 0;
  for (const s of XXL_ALLE_SEEDER) {
    const zeilen = zeilenSichern(s.baue(ctx), UID);
    lauf.push({ s, zeilen });
    if (!zeilen.length || s.zugang) continue;
    kontextErgaenzen(ctx, s.tabelle, zeilen.map(() => `${s.tabelle}-${++n}`), zeilen);
  }
  return { ctx, lauf };
}
const zeilen = (lauf, key) => lauf.find((l) => l.s.key === key).zeilen;

test('jedes Branchen-Modul bekommt Zeilen, jede mit Besitzer', () => {
  const { lauf } = simuliere();
  assert.ok(XXL_BRANCHEN_SEEDER.length >= 50);
  for (const s of XXL_BRANCHEN_SEEDER) {
    const z = zeilen(lauf, s.key);
    assert.ok(z.length > 0, `${s.key} leer`);
    for (const r of z) assert.equal(r.owner_user_id, UID, s.key);
    assert.equal(s.gruppe, 'branchen');
  }
  // Keine Tabelle doppelt zwischen Kern und Branchen.
  const tab = XXL_ALLE_SEEDER.filter((s) => !s.zugang && s.gruppe !== 'basis').map((s) => s.tabelle);
  assert.equal(new Set(tab).size, tab.length);
});

test('Kinder haengen an ihren eigenen Koepfen', () => {
  const { lauf, ctx } = simuliere();
  const paare = [
    ['werkstatt_positionen', 'auftrag_id', 'werkstatt_auftraege'], ['werkstatt_auftraege', 'fahrzeug_id', 'werkstatt_fahrzeuge'],
    ['hotel_belegungen', 'zimmer_id', 'hotel_zimmer'], ['rezeptur_zutaten', 'rezeptur_id', 'rezepturen'],
    ['logistik_sendungen', 'tour_id', 'logistik_touren'], ['tour_stopp', 'tour_id', 'tour'],
    ['energie_ablesungen', 'anlage_id', 'energie_anlagen'], ['immo_mietvertraege', 'einheit_id', 'immo_einheiten'],
    ['kanzlei_fristen', 'mandat_id', 'kanzlei_mandate'], ['bildung_termine', 'kurs_id', 'bildung_kurse'],
    ['bildung_anmeldungen', 'kurs_id', 'bildung_kurse'], ['wellness_behandlungen', 'kunde_id', 'wellness_kunden'],
    ['tier_behandlungen', 'tier_id', 'tier_tiere'], ['objekt_zeiten', 'objekt_id', 'objekte'],
    ['objekt_zeiten', 'mitarbeiter_id', 'mitarbeiter'], ['werkstatt_auftraege', 'zustaendig_mitarbeiter_id', 'mitarbeiter'],
  ];
  for (const [kind, spalte, eltern] of paare) {
    for (const r of zeilen(lauf, kind)) assert.ok(ctx.ids[eltern].includes(r[spalte]), `${kind}.${spalte}`);
    assert.ok(XXL_ALLE_LOESCH_ORDER.indexOf(kind) < XXL_ALLE_LOESCH_ORDER.indexOf(eltern), `${kind} vor ${eltern} loeschen`);
  }
  for (const r of lauf.flatMap((l) => l.zeilen)) {
    if (r.kontakt_id != null) assert.ok(ctx.ids.kontakte.includes(r.kontakt_id));
  }
});

test('Werte halten die Datenbank-Regeln (Live-Checks)', () => {
  const { lauf } = simuliere();
  const in_ = (key, spalte, werte) => { for (const r of zeilen(lauf, key)) if (r[spalte] != null) assert.ok(werte.includes(r[spalte]), `${key}.${spalte}=${r[spalte]}`); };
  in_('expose', 'objekt_art', ['wohnung', 'haus', 'gewerbe', 'grundstueck']);
  in_('expose', 'vermarktung_art', ['kauf', 'miete']);
  in_('expose', 'status', ['entwurf', 'aktiv', 'reserviert', 'verkauft', 'vermietet']);
  in_('expose', 'energie_typ', ['bedarf', 'verbrauch']);
  in_('gutschein', 'art', ['wert', 'mehrfachkarte', 'leistung']);
  in_('gutschein', 'mwst_typ', ['einzweck', 'mehrzweck']);
  in_('holz_sortiment', 'trocknungsgrad', ['frisch', 'lufttrocken', 'kammergetrocknet']);
  in_('lm_chargen', 'status', ['aktiv', 'gesperrt', 'verbraucht']);
  in_('reservierung_platz', 'art', ['tisch', 'lagerplatz', 'theke']);
  in_('werkstatt_auftraege', 'freigabe_status', ['kein_kva', 'kva_offen', 'freigegeben', 'abgelehnt']);
  for (const r of zeilen(lauf, 'holz_sortiment')) assert.ok(r.scheitlaenge_cm >= 5 && r.scheitlaenge_cm <= 200);
  for (const r of zeilen(lauf, 'hotel_belegungen')) assert.ok(r.abreise > r.anreise);
  for (const r of zeilen(lauf, 'event_veranstaltung')) assert.ok(new Date(r.ende) > new Date(r.beginn));
  const fins = zeilen(lauf, 'werkstatt_fahrzeuge').map((r) => r.fin);
  assert.equal(new Set(fins).size, fins.length, 'FIN je Betrieb eindeutig');
});

test('Keine Nachricht nach aussen, keine Gesundheitsangaben', () => {
  const { lauf } = simuliere();
  for (const { s, zeilen: z } of lauf) {
    for (const r of z) for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'string' && v.includes('@')) assert.match(v, /@example\.com$/, `${s.key}.${k}`);
    }
  }
  for (const r of zeilen(lauf, 'wellness_kunden')) { assert.ok(!r.hinweise); assert.ok(!r.geburtsdatum); }
  for (const r of zeilen(lauf, 'tier_tiere')) { assert.equal(r.erinnerung_ok, false); assert.equal(r.halter_email, null); }
  for (const r of zeilen(lauf, 'immo_mietvertraege')) assert.equal(r.mieter_email, null);
});

test('Loeschen: jede Branchen-Tabelle drin, vor dem Kern, Plan sortiert', () => {
  for (const s of XXL_BRANCHEN_SEEDER) assert.ok(XXL_BRANCHEN_LOESCH_ORDER.includes(s.tabelle), s.tabelle);
  const kern = XXL_ALLE_LOESCH_ORDER.indexOf('kontakte');
  for (const t of XXL_BRANCHEN_LOESCH_ORDER) assert.ok(XXL_ALLE_LOESCH_ORDER.indexOf(t) < kern, t);
  assert.ok(XXL_ALLE_LOESCH_ORDER.indexOf('objekt_zeiten') < XXL_ALLE_LOESCH_ORDER.indexOf('mitarbeiter'));
  const plan = loeschPlanAlle([
    { tabelle: 'mitarbeiter', datensatz_id: 'm' }, { tabelle: 'tier_tiere', datensatz_id: 't' }, { tabelle: 'tier_behandlungen', datensatz_id: 'b' },
  ]);
  assert.deepEqual(plan.map((p) => p.tabelle), ['tier_behandlungen', 'tier_tiere', 'mitarbeiter']);
});

test('Route nutzt Kern + Branchen beim Anlegen und Loeschen', () => {
  const r = ohneKommentare(lies('app/api/admin/musterbetrieb-xxl/route.ts'));
  assert.match(r, /for \(const s of XXL_ALLE_SEEDER\)/);
  assert.match(r, /loeschPlanAlle\(/);
  assert.doesNotMatch(r, /for \(const s of XXL_SEEDER\)/);
});
