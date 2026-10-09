// tests/musterbetriebKfzP285.test.mjs — Paket 285 (09.10.2026) · K17a Musterbetrieb XXL mit Handelsbestand.
// Werte gegen die Pruefregeln aus p259/p261/p265/p270/p271/p276/p277/p283 (in der Test-Datenbank eingespielt: 35 Zeilen ok).
import test from 'node:test';
import assert from 'node:assert/strict';
import { XXL_BRANCHEN_SEEDER, XXL_ALLE_SEEDER, XXL_ALLE_LOESCH_ORDER, handelFin } from '../out/musterbetriebXxlBranchen.js';
import { zeilenSichern, neuerKontext, kontextErgaenzen } from '../out/musterbetriebXxl.js';

const UID = '11111111-1111-4111-8111-111111111111';
const HEUTE = '2026-10-09';
function simuliere() {
  const ctx = neuerKontext(UID, HEUTE);
  const z = {};
  let n = 0;
  for (const s of XXL_ALLE_SEEDER) {
    const zeilen = zeilenSichern(s.baue(ctx), UID);
    z[s.key] = zeilen;
    if (!zeilen.length || s.zugang) continue;
    kontextErgaenzen(ctx, s.tabelle, zeilen.map(() => `${s.tabelle}-${++n}`), zeilen);
  }
  return { ctx, z };
}
const KFZ = ['kfz_bestand', 'kfz_bestand_kosten', 'kfz_marktvergleich', 'kfz_anfrage', 'kfz_suchauftrag', 'kfz_probefahrt', 'kfz_tresor'];
const FIN = /^[A-HJ-NPR-Z0-9]{17}$/;

test('Sieben Kfz-Handel-Tabellen im Musterbetrieb, alle mit Zeilen und Besitzer; kein Verkauf, keine Rechnung, keine Boerse', () => {
  const { z } = simuliere();
  for (const t of KFZ) {
    assert.ok(XXL_BRANCHEN_SEEDER.some((s) => s.tabelle === t), t);
    assert.ok(z[t].length > 0, `${t} leer`);
    for (const r of z[t]) assert.equal(r.owner_user_id, UID);
  }
  for (const t of ['kfz_verkauf', 'kfz_bestand_kalk', 'modul_einstellung']) assert.ok(!XXL_ALLE_SEEDER.some((s) => s.tabelle === t), t);
});

test('Bestand: jeder Status, Vorjahresverkauf fuer den Chef-Blick, gueltige eindeutige FIN, Werte nach den Pruefregeln', () => {
  const { z } = simuliere();
  const b = z.kfz_bestand;
  assert.deepEqual([...new Set(b.map((r) => r.status))].sort(), ['aufbereitung', 'bestand', 'reserviert', 'verkauft', 'zulauf']);
  const fins = b.map((r) => r.fin);
  for (const f of fins) assert.match(f, FIN);
  assert.equal(new Set(fins).size, fins.length);
  assert.match(handelFin('WVW', 0), FIN);
  assert.equal(new Set(b.map((r) => r.interne_nr)).size, b.length);
  for (const r of b) {
    assert.ok(['25a', 'regel'].includes(r.besteuerung));
    assert.ok(r.ek_netto >= 0 && r.vk_brutto > r.ek_netto, r.interne_nr);
    assert.ok(r.vorschaden === null || ['keine_bekannt', 'ja', 'unbekannt'].includes(r.vorschaden));
    assert.ok(r.vorbesitzer >= 0 && r.vorbesitzer <= 99);
    assert.match(r.erstzulassung, /^\d{4}-\d{2}-01$/);
    if (r.status === 'verkauft') { assert.ok(r.verkauft_am && r.verkauft_am <= HEUTE); assert.equal(r.inseriert, false); }
    else assert.equal(r.verkauft_am, null);
    if (r.status === 'zulauf') assert.equal(r.eingang_am, null);
    if (r.bewertung_anbieter) assert.ok(['dat', 'schwacke', 'sonstige'].includes(r.bewertung_anbieter) && r.bewertung_ek <= r.bewertung_vk);
  }
  const verkauft = b.filter((r) => r.status === 'verkauft').map((r) => r.verkauft_am.slice(0, 4));
  assert.ok(verkauft.includes('2026') && verkauft.includes('2025'), 'dieses Jahr und Vorjahr');
  assert.ok(b.some((r) => r.sparte === 'Motorrad'));
  assert.ok(b.some((r) => r.eingang_am && r.eingang_am < '2026-07-11' && r.status === 'bestand'), 'ein Langsteher (ueber 90 Standtage)');
});

test('Kinder haengen am eigenen Fahrzeug und werden vor ihm geloescht; Werte nach den Regeln', () => {
  const { z, ctx } = simuliere();
  for (const t of ['kfz_bestand_kosten', 'kfz_marktvergleich', 'kfz_probefahrt', 'kfz_tresor']) {
    for (const r of z[t]) assert.ok(ctx.ids.kfz_bestand.includes(r.bestand_id), t);
    assert.ok(XXL_ALLE_LOESCH_ORDER.indexOf(t) < XXL_ALLE_LOESCH_ORDER.indexOf('kfz_bestand'), t);
  }
  assert.ok(XXL_ALLE_LOESCH_ORDER.indexOf('kfz_anfrage') < XXL_ALLE_LOESCH_ORDER.indexOf('kfz_bestand'));
  assert.ok(XXL_ALLE_LOESCH_ORDER.indexOf('kfz_bestand') < XXL_ALLE_LOESCH_ORDER.indexOf('kontakte'));
  for (const r of z.kfz_bestand_kosten) assert.ok(['aufbereitung', 'reparatur', 'teile', 'lack', 'reifen', 'hu', 'transport', 'zulassung', 'werbung', 'fremd', 'sonstiges'].includes(r.art) && r.betrag_netto >= 0);
  for (const r of z.kfz_marktvergleich) { assert.ok(r.preis > 0); assert.equal(r.link, null, 'keine erfundenen Links'); }
  assert.ok(z.kfz_marktvergleich.length >= 3, 'ab 3 Vergleichen gibt es eine Aussage');
  for (const r of z.kfz_anfrage) assert.ok(['neu', 'in_arbeit', 'termin', 'angebot', 'gewonnen', 'verloren'].includes(r.status));
  for (const r of z.kfz_tresor) {
    assert.ok(['zb2', 'zb1', 'schluessel', 'coc', 'serviceheft', 'hu', 'sonstiges'].includes(r.art));
    assert.ok(r.status !== 'ausgegeben' || r.ausgegeben_an);
  }
  const p = z.kfz_probefahrt[0];
  assert.ok(p.km_ende >= p.km_start && p.status === 'zurueck' && p.fs_geprueft === true);
  assert.ok(!('fs_nummer' in p), 'keine Fuehrerscheinnummer');
  for (const t of KFZ) for (const r of z[t]) for (const v of Object.values(r)) if (typeof v === 'string' && v.includes('@')) assert.match(v, /@example\.com$/);
});
