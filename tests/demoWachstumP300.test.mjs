// Paket 300 (10.10.2026): Zeitreise für jede Branche — leeres Konto, erste Monate, nach 18 Monaten.
// Wachstums-Motor (lib/demoWachstum) und Branchen-Profile (lib/demoWachstumProfile).
// In der Test-Datenbank mit Fremdschlüsseln angelegt und in wachstumLoeschOrder restlos gelöscht (alle 19 Profile).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { wachstumSeeder, wachstumLoeschOrder, rechnungsPlan, teamPlan, kundenPlan, WACHSTUM_NOTIZ, MONATE, startwert } from '../out/demoWachstum.js';
import { WACHSTUM_PROFILE, ZEITREISE_BETRIEBE, demoIban, demoUstId } from '../out/demoWachstumProfile.js';
import { FACHDATEN, FACH_LEITTABELLE } from '../out/demoFachdatenKfz.js';
import { DEMO_BETRIEBE, GRUND_BETRIEBE, demoBetrieb } from '../out/demoBetriebe.js';
import { ZEITREISE, zeitreiseKarten } from '../out/demoZeitreise.js';
import { zeilenSichern, neuerKontext, kontextErgaenzen, loeschPlan } from '../out/musterbetriebXxl.js';
import { XXL_ALLE_SEEDER } from '../out/musterbetriebXxlBranchen.js';
import { LOESCH_ORDER } from '../out/uebungswelt.js';
import { pruefzifferDe } from '../out/ustIdNr.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const UID = '33333333-3333-4333-8333-333333333333';
const HEUTE = '2026-10-10';

function simuliere(p, heute = HEUTE) {
  const ctx = neuerKontext(UID, heute);
  const z = {};
  let n = 0;
  for (const s of wachstumSeeder(p)) {
    const zeilen = zeilenSichern(s.baue(ctx), UID);
    z[s.key] = zeilen;
    if (!zeilen.length) continue;
    kontextErgaenzen(ctx, s.tabelle, zeilen.map(() => `${s.tabelle}-${++n}`), zeilen);
  }
  return { ctx, z };
}
const SIM = Object.fromEntries(WACHSTUM_PROFILE.map((p) => [p.slug, simuliere(p)]));
const handwerk = (slug) => WACHSTUM_PROFILE.find((p) => p.slug === slug);

test('Jede Branche hat eine Zeitreise in drei Stufen; Handwerk vorn (Maler, Sanitär/Heizung), dann Kfz', () => {
  assert.equal(WACHSTUM_PROFILE.length, 19);
  assert.equal(ZEITREISE.length, 20);
  assert.deepEqual(ZEITREISE.slice(0, 3).map((r) => r.key), ['maler', 'heizung', 'kfz']);
  const kategorien = new Set();
  for (const r of ZEITREISE) {
    const k = zeitreiseKarten(r);
    assert.equal(k.length, 3, r.key);
    const b = k.map((x) => demoBetrieb(x.slug));
    assert.ok(b[0].leer && b[0].ziel === 0, `${r.key}: Stufe 1 leer`);
    assert.ok(!b[1].leer && !b[1].zeitreise, `${r.key}: Stufe 2 = bestehender Vorführ-Betrieb`);
    assert.ok(!b[2].leer && b[2].zeitreise && FACHDATEN[b[2].slug], `${r.key}: Stufe 3 mit Fachdaten`);
    assert.equal(new Set(b.map((x) => x.kategorie)).size, 1, `${r.key}: eine Kategorie`);
    kategorien.add(b[0].kategorie);
  }
  assert.equal(kategorien.size, 19, 'alle 19 Kategorien');
});

test('Vorführ-Betriebe: eindeutig, gültige IBAN und USt-IdNr., „alle anlegen“ nur für die 21 Grund-Betriebe', () => {
  assert.equal(DEMO_BETRIEBE.length, 21 + 2 + 38);
  assert.equal(GRUND_BETRIEBE.length, 21);
  assert.equal(ZEITREISE_BETRIEBE.length, 38);
  for (const feld of ['slug', 'iban', 'ustId', 'firma']) assert.equal(new Set(DEMO_BETRIEBE.map((b) => b[feld])).size, DEMO_BETRIEBE.length, feld);
  for (const b of DEMO_BETRIEBE) {
    assert.match(b.slug, /^[a-z0-9]+$/);
    const u = (b.iban.slice(4) + b.iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    let rest = 0; for (const c of u) rest = (rest * 10 + Number(c)) % 97;
    assert.equal(rest, 1, `${b.slug} IBAN`);
    assert.equal(pruefzifferDe(b.ustId.slice(2)), true, `${b.slug} USt-IdNr.`);
  }
  assert.equal(demoIban(4714014), 'DE35600501010004714014');
  assert.equal(demoUstId('82614773'), 'DE826147735');
});

test('Alle Zeilen: Vorführ-Konto, keine echte Adresse, unter 1.000 je Tabelle, nur bekannte XXL-Module', () => {
  const keys = new Set(XXL_ALLE_SEEDER.map((s) => s.key));
  for (const p of WACHSTUM_PROFILE) {
    for (const k of p.module) assert.ok(keys.has(k), `${p.slug}: Modul ${k}`);
    assert.ok(!p.module.some((k) => k.startsWith('kfz_') || k.startsWith('werkstatt_')), 'Kfz läuft über die eigene Reihe');
    const { z } = SIM[p.slug];
    for (const [key, zeilen] of Object.entries(z)) {
      assert.ok(zeilen.length < 1000, `${p.slug}.${key}: ${zeilen.length}`);
      for (const r of zeilen) {
        assert.equal(r.owner_user_id, UID);
        for (const v of Object.values(r)) {
          if (typeof v === 'string' && v.includes('@')) assert.match(v, /@example\.com$/, `${p.slug}.${key}`);
          if (typeof v === 'string') assert.ok(!v.includes('Musterbetrieb XXL'), `${p.slug}.${key}: Notiz umgeschrieben`);
        }
      }
    }
    assert.ok(z.rechnungen.length > 250 && z.mitarbeiter === undefined);
    for (const t of z.termine) {
      const wt = new Date(`${t.beginn_am.slice(0, 10)}T12:00:00Z`).getUTCDay();
      assert.ok(wt !== 0 && wt !== 6 && t.beginn_am > `${HEUTE}T23` && t.status === 'geplant', `${p.slug}: Termin ${t.beginn_am}`);
    }
    assert.ok(z.team.length >= 11);
  }
});

test('Rechnungen über 18 Monate: wachsend, eigene Nummern, Summen stimmen, Zahlungen passen, nichts in der Zukunft', () => {
  for (const p of WACHSTUM_PROFILE) {
    const plan = rechnungsPlan(p, HEUTE);
    const { z } = SIM[p.slug];
    const nr = z.rechnungen.map((r) => r.rechnungsnummer);
    assert.equal(new Set(nr).size, nr.length);
    assert.ok(nr.every((n) => n.startsWith(`${p.prefix}-`)), 'eigener Nummernkreis — nichts aus dem gemeinsamen');
    const erstes = plan.filter((x) => x.datum < '2025-07-01').length, letztes = plan.filter((x) => x.datum >= '2026-04-01').length;
    assert.ok(letztes > erstes * 0.9, `${p.slug}: Kurve wächst`);
    for (const r of z.rechnungen) {
      assert.ok(r.rechnungsdatum < HEUTE && (!r.bezahlt_am || (r.bezahlt_am >= r.rechnungsdatum && r.bezahlt_am < HEUTE)));
      assert.ok(['bezahlt', 'offen', 'teilbezahlt'].includes(r.zahlungsstatus));
      assert.equal(Math.round(r.brutto_summe * 100), Math.round(r.netto_summe * 100) + Math.round(r.mwst_summe * 100));
      assert.ok(!('festgeschrieben_am' in r), 'unverschickt — lässt sich zurücksetzen');
    }
    // Positionen ergeben die Netto-Summe
    const pos = new Map();
    for (const x of z.rechnung_positionen) pos.set(x.rechnung_id, (pos.get(x.rechnung_id) || 0) + Math.round(x.gesamt_netto * 100));
    const ids = SIM[p.slug].ctx.ids.rechnungen;
    ids.forEach((id, i) => assert.ok(Math.abs((pos.get(id) || 0) - Math.round(z.rechnungen[i].netto_summe * 100)) <= 3, `${p.slug} Rechnung ${i}`));
    const bezahlt = z.rechnungen.filter((r) => r.zahlungsstatus !== 'offen').length;
    assert.equal(z.zahlungen.length, bezahlt);
    assert.equal(new Set(z.angebote.map((a) => a.angebotsnummer)).size, z.angebote.length);
    assert.ok(z.angebote.every((a) => ['entwurf', 'gesendet', 'angenommen', 'abgelehnt'].includes(a.status)));
    assert.ok(z.auftraege.every((a) => ['entwurf', 'beauftragt', 'in_bearbeitung', 'abgeschlossen', 'storniert'].includes(a.status)));
  }
});

test('Handwerk: volle Baustelle — Monteure in der Einsatzplanung, Bautagebuch, Mängel, Aufmaße, LV, Wartung, Fuhrpark', () => {
  for (const slug of ['malerplus', 'heizungplus']) {
    const p = handwerk(slug);
    const { z } = SIM[slug];
    const team = teamPlan(p);
    const aussen = team.filter((m) => m.aussen).length;
    assert.ok(aussen >= 20, `${slug}: Monteure ${aussen}`);
    assert.ok(team.some((m) => /Auszubildend/.test(m.position)), 'Azubis');
    assert.ok(z.einsaetze.length >= 300 && z.einsaetze.every((e) => ['erledigt', 'geplant'].includes(e.status) && e.mitarbeiter_id));
    assert.ok(z.einsaetze.filter((e) => e.status === 'geplant').every((e) => e.beginn_am > `${HEUTE}T00`));
    assert.ok(z.bautagebuch.length >= 40 && z.maengel.length >= 15 && z.aufmasse.length >= 20 && z.aufmass_positionen.length >= 40);
    assert.ok(z.fahrzeuge.length >= 7, 'Fuhrpark');
    for (const k of ['xxl_bau_lv', 'xxl_bau_lv_positionen', 'xxl_bau_nachtrag', 'xxl_leistungskatalog']) assert.ok(z[k]?.length > 0, `${slug}: ${k}`);
    assert.equal(z.projekte.length, p.handwerk.baustellen.length + 2);
  }
  assert.ok(SIM.heizungplus.z.wartungsvertraege.length === 260, 'Wartungsverträge SHK');
  assert.equal(SIM.malerplus.z.wartungsvertraege, undefined);
});

test('Gleiche Daten bei jedem Lauf; anderer Tag verschiebt alles mit', () => {
  const p = WACHSTUM_PROFILE[0];
  assert.equal(JSON.stringify(simuliere(p).z.rechnungen), JSON.stringify(SIM[p.slug].z.rechnungen));
  assert.notEqual(startwert('malerplus'), startwert('heizungplus'));
  const anders = rechnungsPlan(p, '2026-03-02');
  assert.ok(anders.every((x) => x.datum < '2026-03-02'));
  assert.equal(MONATE, 18);
  assert.equal(kundenPlan(p).length, p.kunden);
});

test('Löschen: Kinder vor Eltern, jede angelegte Tabelle in der Reihenfolge, Leit-Tabelle Mitarbeiter', () => {
  const ord = wachstumLoeschOrder();
  const o = (t) => ord.indexOf(t);
  for (const [kind, eltern] of [['zahlungen', 'rechnungen'], ['rechnung_positionen', 'rechnungen'], ['angebot_positionen', 'angebote'], ['einsaetze', 'auftraege'], ['auftrag_positionen', 'auftraege'],
    ['aufgaben', 'projekte'], ['bautagebuch', 'projekte'], ['maengel', 'projekte'], ['aufmass_positionen', 'aufmasse'], ['bau_lv_positionen', 'bau_lv'], ['bau_nachtrag', 'bau_lv'],
    ['hr_zeiterfassung', 'mitarbeiter'], ['einsaetze', 'mitarbeiter'], ['marketing_kalender', 'marketing_kampagnen'], ['hotel_belegungen', 'hotel_zimmer'], ['tier_behandlungen', 'tier_tiere'], ['tier_tiere', 'mitarbeiter']]) {
    assert.ok(o(kind) >= 0 && o(kind) < o(eltern), `${kind} vor ${eltern}`);
  }
  for (const p of WACHSTUM_PROFILE) {
    assert.equal(FACH_LEITTABELLE[p.slug], 'mitarbeiter');
    for (const s of FACHDATEN[p.slug].seeder) assert.ok(ord.includes(s.tabelle) || s.tabelle === 'kontakte', `${p.slug}: ${s.tabelle} fehlt in der Lösch-Reihenfolge`);
  }
  assert.ok(!LOESCH_ORDER.includes('mitarbeiter'), 'Übungswelt legt keine Mitarbeiter an — Leit-Tabelle eindeutig');
  const plan = loeschPlan([{ tabelle: 'kontakte', datensatz_id: 'k' }, { tabelle: 'rechnungen', datensatz_id: 'r' }, { tabelle: 'zahlungen', datensatz_id: 'z' }], [...ord, ...LOESCH_ORDER]);
  assert.deepEqual(plan.map((x) => x.tabelle), ['zahlungen', 'rechnungen', 'kontakte']);
  assert.ok(WACHSTUM_NOTIZ.includes('Beispiel'));
});

test('Route und Seite: Grund-Betriebe ohne Auswahl, Zeitreisen Reihe für Reihe, Ergebnisse gesammelt', () => {
  const r = lies('app/api/admin/demo-betriebe/route.ts');
  assert.ok(r.includes('const liste = nur.length ? DEMO_BETRIEBE.filter((b) => nur.includes(b.slug)) : GRUND_BETRIEBE;'));
  const s = lies('app/admin/demo-betriebe/page.tsx');
  assert.ok(s.includes('await anlegen(zeitreiseSlugs(ZEITREISE[i]));'), 'nacheinander, nicht alles in einer Anfrage');
  assert.ok(s.includes('setErgebnisse((alt) => [...(alt || []).filter((x) => !neu.some((n) => n.slug === x.slug)), ...neu]);'));
  assert.ok(s.includes('`${GRUND_BETRIEBE.length} Betriebe anlegen`'));
});
