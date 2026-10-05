// ============================================================================
// tests/kalkulatorAndockenP211.test.mjs — Paket 211 (Stufe 3 · B9 Paket 2 Andocken)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  einheitNorm, mengeAusAufmass, planStunden, istVergleich, echteMarge, andockHinweise, ausIstZeiten, mitIstVorrang,
} from '../out/kalkulatorAndocken.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// Maler: 8 min Streichen + 3 min Abkleben je m², Lohnkosten 0,85 €/min, Farbe 0,25 l × 14,90 €
const KALK = {
  menge: 120, einheit: 'm²',
  posten: [
    { id: 'a', art: 'material', bezeichnung: 'Farbe', menge_je_einheit: 0.25, einheit: 'l', preis_je_einheit: 14.9, verschnitt_prozent: 0 },
    { id: 'b', art: 'zeit', bezeichnung: 'Streichen, zwei Anstriche', menge_je_einheit: 8, einheit: 'min', preis_je_einheit: 0.85 },
    { id: 'c', art: 'zeit', bezeichnung: 'Abkleben und Abdecken', menge_je_einheit: 3, einheit: 'min', preis_je_einheit: 0.85 },
  ],
  zuschlaege: { gemeinkosten_prozent: 15, wagnis_gewinn_prozent: 10, skonto_prozent: 0, rabatt_prozent: 0, mwst_satz: 19 },
};

test('Einheiten vergleichbar', () => {
  assert.equal(einheitNorm('m2'), 'm²');
  assert.equal(einheitNorm('qm'), 'm²');
  assert.equal(einheitNorm(' M² '), 'm²');
  assert.equal(einheitNorm('lfm'), 'm');
  assert.equal(einheitNorm('Stck.'), 'Stk');
  assert.equal(einheitNorm('Sack'), 'Sack');
});

test('Menge aus Aufmaß: Summe, Rechenweg, nur eine Einheit', () => {
  const pos = [
    { id: '1', bezeichnung: 'Wand Nord', menge: 23.1, einheit: 'm2', rechenweg: '4,20*2,75*2' },
    { id: '2', bezeichnung: 'Wand Süd', menge: '11,55', einheit: 'm²' },
    { id: '3', bezeichnung: 'Sockelleiste', menge: 12, einheit: 'lfm' },
    { id: '4', bezeichnung: 'Leer', menge: 0, einheit: 'm²' },
    { id: '5', bezeichnung: 'Pauschale', menge: 1, einheit: 'psch' },
  ];
  const r = mengeAusAufmass(pos, ['1', '2']);
  assert.equal(r.ok, true);
  assert.equal(r.menge, 34.65);
  assert.equal(r.einheit, 'm²');
  assert.match(r.rechenweg, /Wand Nord: 4,20\*2,75\*2 = 23,1/);
  assert.equal(mengeAusAufmass(pos, ['1', '3']).ok, false);
  assert.match(mengeAusAufmass(pos, ['1', '3']).fehler, /verschiedene Einheiten/);
  assert.equal(mengeAusAufmass(pos, ['4']).ok, false);
  assert.equal(mengeAusAufmass(pos, ['5']).ok, false);
  assert.equal(mengeAusAufmass(pos, []).ok, false);
  assert.equal(mengeAusAufmass(pos, ['x']).ok, false);
});

test('Plan-Stunden und Ist-Vergleich', () => {
  assert.equal(planStunden(KALK), 22);            // 11 min × 120 m² = 1320 min
  const v = istVergleich(KALK, { istStunden: 26.4, istKosten: 0 });
  assert.equal(v.planStunden, 22);
  assert.equal(v.istStunden, 26.4);
  assert.equal(v.abweichungProzent, 20);
  assert.equal(v.istStundenJeEinheit, 0.22);
  const leer = istVergleich(KALK, { istStunden: 0, istKosten: 0 });
  assert.equal(leer.faktor, null);
  assert.equal(leer.abweichungProzent, null);
  assert.equal(planStunden({ menge: 10, posten: [{ art: 'zeit', menge_je_einheit: 0.5, einheit: 'h' }] }), 5);
  // Energie (kWh) und Fremdleistung zählen nie als Arbeitszeit
  assert.equal(planStunden({ menge: 10, posten: [{ art: 'zeit', menge_je_einheit: 0.5, einheit: 'h' }, { art: 'energie', menge_je_einheit: 2, einheit: 'kWh' }, { art: 'fremd', menge_je_einheit: 30, einheit: 'min' }] }), 5);
});

test('Echte Marge: Ist-Lohn zum Kostensatz der Kalkulation, gleicher Gemeinkosten-Zuschlag', () => {
  // Plan: Material 447,00 · Zeit 1122,00 · Einzel 1569 · GK 235,35 · SK 1804,35 · WG 180,44 · Netto 1984,79 · Marge 9,1 %
  const plan = echteMarge(KALK, { istStunden: 22, istKosten: 0 });
  assert.equal(plan.angebotNetto, 1984.79);
  assert.equal(plan.lohnsatz, 51);                 // 1122 € / 22 h
  assert.equal(plan.istSelbstkosten, 1804.35);     // Ist = Plan → Selbstkosten gleich
  assert.equal(plan.echteMargeProzent, plan.planMargeProzent);
  assert.equal(plan.materialQuelle, 'kalkulation');
  const mehr = echteMarge(KALK, { istStunden: 26.4, istKosten: 0 });
  assert.equal(mehr.istLohn, 1346.4);
  assert.equal(mehr.istSelbstkosten, 2062.41);     // (1346,40 + 447) × 1,15
  assert.equal(mehr.echteMargeProzent, -3.9);
  const projekt = echteMarge(KALK, { istStunden: 22, istKosten: 600 });
  assert.equal(projekt.materialQuelle, 'projekt');
  assert.equal(projekt.istMaterial, 600);
  assert.equal(echteMarge(KALK, { istStunden: 0, istKosten: 0 }).echteMargeProzent, null);
});

test('Hinweise im Klartext', () => {
  const v = istVergleich(KALK, { istStunden: 26.4, istKosten: 0 });
  const m = echteMarge(KALK, { istStunden: 26.4, istKosten: 0 });
  const h = andockHinweise('Whg. Müller', v, m);
  assert.ok(h.some((t) => /geplant 22 h, erfasst 26,4 h \(\+20 %\)/.test(t)));
  assert.ok(h.some((t) => /trägt sich der Auftrag nicht/.test(t)));
  assert.ok(h.some((t) => /keine Material-\/Fremdkosten erfasst/.test(t)));
  const ohne = andockHinweise('X', istVergleich(KALK, { istStunden: 0, istKosten: 0 }), echteMarge(KALK, { istStunden: 0, istKosten: 0 }));
  assert.equal(ohne.length, 1);
  assert.match(ohne[0], /noch keine Stunden erfasst/);
  const ohneZeit = { ...KALK, posten: [KALK.posten[0]] };
  assert.ok(andockHinweise('Y', istVergleich(ohneZeit, { istStunden: 5, istKosten: 0 }), echteMarge(ohneZeit, { istStunden: 5, istKosten: 0 }))
    .some((t) => /keine Zeit-Positionen/.test(t)));
});

test('Zeit-Normwerte aus Ist-Stunden — nur Vorschläge, Ist hat Vorrang', () => {
  const liste = [
    { name: 'A', gewerk: 'maler', einheit: 'm²', menge: 120, posten: KALK.posten, istStunden: 26.4 },   // Faktor 1,2
    { name: 'B', gewerk: 'maler', einheit: 'm²', menge: 120, posten: KALK.posten, istStunden: 24.2 },   // Faktor 1,1
    { name: 'C', gewerk: 'maler', einheit: 'm²', menge: 120, posten: KALK.posten, istStunden: 500 },    // Faktor 22,7 → verworfen
    { name: 'D', gewerk: 'tischler', einheit: 'm²', menge: 120, posten: KALK.posten, istStunden: 22 },
  ];
  const v = ausIstZeiten(liste, 'maler', { zeit_streichen_zwei_anstriche: 8 });
  assert.equal(v.length, 2);
  const streichen = v.find((x) => x.schluessel === 'zeit_streichen_zwei_anstriche');
  assert.equal(streichen.anzahl, 2);
  assert.equal(streichen.vorschlag, 9.2);          // Median aus 9,6 und 8,8
  assert.equal(streichen.abweichung_prozent, 15);
  assert.match(streichen.hinweis, /^Aus erfassten Projekt-Stunden/);
  const schaetzung = [{ ...streichen, schluessel: 'zeit_streichen_zwei_anstriche', vorschlag: 8 }, { ...streichen, schluessel: 'material_farbe', vorschlag: 0.25 }];
  const zusammen = mitIstVorrang(schaetzung, v);
  assert.equal(zusammen.filter((x) => x.schluessel === 'zeit_streichen_zwei_anstriche').length, 1);
  assert.equal(zusammen.find((x) => x.schluessel === 'zeit_streichen_zwei_anstriche').vorschlag, 9.2);
  assert.ok(zusammen.some((x) => x.schluessel === 'material_farbe'));
});

test('Verdrahtung Kalkulator-Seite und SQL', () => {
  const seite = lies('app/dashboard/kalkulator/page.tsx');
  assert.match(seite, /projekt_id: projektWahl \|\| null/);
  assert.match(seite, /mitIstVorrang\(ausEigenen, ausIst\)/);
  assert.match(seite, /<AufmassUebernahme/);
  assert.match(seite, /andockHinweise\(/);
  assert.match(seite, /\/aufmass_\/\.test/);           // Rückfall ohne SQL p211
  const sql = lies('supabase-sql/p211-kalkulation-andocken.sql');
  assert.match(sql, /add column if not exists aufmass_id uuid/);
  assert.doesNotMatch(sql.replace(/-- RÜCKWEG[\s\S]*?-- =+/, ''), /drop column|drop policy|delete from/i);
});
