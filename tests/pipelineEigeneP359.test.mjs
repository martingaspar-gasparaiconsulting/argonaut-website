// ============================================================================
// tests/pipelineEigeneP359.test.mjs — Paket 359 (13.10.2026)
// VK1 Verkaufsteam, Teil 2: eigene Pipelines, Stufen, Setter/Closer je Deal.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  stufenFuer, stufeIn, ersteOffene, dealsIn, startAuswahl, sortiert, VORLAGEN, vorlageStufen, schluesselAus,
  pipelinePruefen, stufePruefen, verschieben, stufeLoeschbar, umzugWerte, pipelineZahlen, istEntschieden,
} from '../out/pipelineEigene.js';
import { zaehlePipeline, forecastGewichtet } from '../out/pipeline.js';
import { dealScore, istOffeneStufe } from '../out/dealScoring.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const P = 'p1';
const STUFEN_ROH = [
  { pipeline_id: P, schluessel: 'gewonnen', name: 'Auftrag erteilt', wahrscheinlichkeit: 100, art: 'gewonnen', position: 1000 },
  { pipeline_id: P, schluessel: 'termin', name: 'Termin', wahrscheinlichkeit: '40', art: 'offen', position: 1 },
  { pipeline_id: P, schluessel: 'erstkontakt', name: 'Erstkontakt', wahrscheinlichkeit: 10, art: 'offen', position: 0 },
  { pipeline_id: P, schluessel: 'verloren', name: 'Abgesagt', wahrscheinlichkeit: 0, art: 'verloren', position: 1001 },
  { pipeline_id: 'p2', schluessel: 'anfrage', name: 'Anfrage', wahrscheinlichkeit: 30, art: 'offen', position: 0 },
];

test('Stufen: ohne Pipeline die 6 Standard-Stufen, eigene in Reihenfolge, Gewonnen/Verloren am Ende', () => {
  assert.deepEqual(stufenFuer(null, STUFEN_ROH).map((s) => s.key), ['lead', 'qualifiziert', 'angebot', 'verhandlung', 'gewonnen', 'verloren']);
  const st = stufenFuer(P, STUFEN_ROH);
  assert.deepEqual(st.map((s) => s.key), ['erstkontakt', 'termin', 'gewonnen', 'verloren']);
  assert.deepEqual(st.map((s) => s.label), ['Erstkontakt', 'Termin', 'Auftrag erteilt', 'Abgesagt']);
  assert.equal(st[1].wahrscheinlichkeit, 40, 'Text aus der Datenbank wird gelesen');
  assert.deepEqual(st.map((s) => s.offen), [true, true, false, false]);
  // Pipeline ohne Gewonnen/Verloren-Zeilen (z. B. noch nicht geladen): trotzdem vorhanden
  const p2 = stufenFuer('p2', STUFEN_ROH);
  assert.deepEqual(p2.map((s) => s.key), ['anfrage', 'gewonnen', 'verloren']);
});

test('Stufe nachschlagen, erste offene, Umzug in andere Pipeline', () => {
  const st = stufenFuer(P, STUFEN_ROH);
  assert.equal(stufeIn(st, 'termin').label, 'Termin');
  assert.equal(stufeIn(st, 'gibtsnicht').key, 'erstkontakt', 'Rückfall auf erste offene');
  assert.equal(ersteOffene(st), 'erstkontakt');
  assert.deepEqual(umzugWerte(P, STUFEN_ROH), { pipeline_id: P, stufe: 'erstkontakt', wahrscheinlichkeit: 10 });
  assert.deepEqual(umzugWerte('', STUFEN_ROH), { pipeline_id: null, stufe: 'lead', wahrscheinlichkeit: 10 });
});

test('Gewonnen/Verloren tragen in jeder Pipeline dieselben Schlüssel — Kennzahlen und Scoring zählen eigene Stufen als offen', () => {
  const deals = [
    { pipeline_id: P, stufe: 'termin', wert_netto: '1.000,00', wahrscheinlichkeit: 40 },
    { pipeline_id: P, stufe: 'gewonnen', wert_netto: 500 },
    { pipeline_id: P, stufe: 'verloren', wert_netto: 300 },
    { pipeline_id: null, stufe: 'angebot', wert_netto: 200 },
  ];
  const k = zaehlePipeline(dealsIn(deals, P));
  assert.equal(k.offen, 1); assert.equal(k.gewonnen, 1); assert.equal(k.verloren, 1);
  assert.equal(k.pipelineWert, 1000); assert.equal(k.gewonnenWert, 500); assert.equal(k.winRate, 50);
  assert.equal(forecastGewichtet(dealsIn(deals, P)), 400);
  assert.equal(dealsIn(deals, null).length, 1);
  assert.equal(dealsIn(deals, '').length, 1, 'leer = Standard');
  assert.equal(istOffeneStufe('termin'), true, 'eigene Stufe ist offen');
  assert.equal(istOffeneStufe('gewonnen'), false);
  assert.equal(istOffeneStufe(''), false);
  assert.ok(dealScore({ stufe: 'termin', wert_netto: 1000, wahrscheinlichkeit: 40 }, new Date('2026-10-13')).score > 0);
  assert.equal(istEntschieden('verloren'), true);
  assert.equal(istEntschieden('termin'), false);
});

test('Schlüssel aus Namen: Umlaute, eindeutig, nie gewonnen/verloren', () => {
  assert.equal(schluesselAus('Bedarf geklärt', []), 'bedarf_geklaert');
  assert.equal(schluesselAus('Größe & Maß', []), 'groesse_mass');
  assert.equal(schluesselAus('Termin', ['termin']), 'termin_2');
  assert.equal(schluesselAus('Termin', ['termin', 'termin_2']), 'termin_3');
  assert.equal(schluesselAus('Gewonnen', []), 'gewonnen_offen');
  assert.equal(schluesselAus('!!!', []), 'stufe');
  assert.match(schluesselAus('x'.repeat(80), []), /^[a-z0-9_]{1,40}$/);
});

test('Vorlagen: nur offene Stufen, Positionen fortlaufend, Schlüssel passen zur Datenbank-Regel', () => {
  assert.ok(VORLAGEN.some((v) => v.key === 'auftraggeber'));
  const z = vorlageStufen('neukunden', 'neu');
  assert.equal(z.length, 5);
  assert.deepEqual(z.map((s) => s.position), [0, 1, 2, 3, 4]);
  assert.ok(z.every((s) => s.art === 'offen' && /^[a-z0-9_]{1,40}$/.test(s.schluessel) && !['gewonnen', 'verloren'].includes(s.schluessel)));
  assert.equal(new Set(z.map((s) => s.schluessel)).size, 5);
  assert.deepEqual(vorlageStufen('leer', 'neu'), []);
  assert.deepEqual(vorlageStufen('gibtsnicht', 'neu'), []);
});

test('Prüfungen wie die Datenbank: Name, Doppelname, Wahrscheinlichkeit 0–100', () => {
  const pl = [{ id: 'a', name: 'Neukunden' }];
  assert.deepEqual(pipelinePruefen('Bestand', pl), []);
  assert.equal(pipelinePruefen(' neukunden ', pl).length, 1);
  assert.deepEqual(pipelinePruefen('Neukunden', pl, 'a'), [], 'eigener Name beim Umbenennen');
  assert.equal(pipelinePruefen('', pl).length, 1);
  assert.equal(pipelinePruefen('Standard', pl).length, 1);
  assert.deepEqual(stufePruefen({ name: 'Termin', wahrscheinlichkeit: '40' }), { fehler: [], wahrscheinlichkeit: 40 });
  assert.equal(stufePruefen({ name: 'Termin', wahrscheinlichkeit: '120' }).fehler.length, 1);
  assert.equal(stufePruefen({ name: 'Termin', wahrscheinlichkeit: 'viel' }).fehler.length, 1);
  assert.equal(stufePruefen({ name: '', wahrscheinlichkeit: '10' }).fehler.length, 1);
  assert.deepEqual(stufePruefen({ name: 'Auftrag', wahrscheinlichkeit: 'egal' }, 'gewonnen'), { fehler: [], wahrscheinlichkeit: 100 });
  assert.deepEqual(stufePruefen({ name: 'Abgesagt', wahrscheinlichkeit: '50' }, 'verloren'), { fehler: [], wahrscheinlichkeit: 0 });
});

test('Reihenfolge, Löschbarkeit, Start-Ansicht, Sortierung, Zahlen je Pipeline', () => {
  const eigene = STUFEN_ROH.filter((s) => s.pipeline_id === P);
  assert.deepEqual(verschieben(eigene, 'termin', -1), [{ schluessel: 'termin', position: 0 }, { schluessel: 'erstkontakt', position: 1 }]);
  assert.deepEqual(verschieben(eigene, 'erstkontakt', -1), [], 'ganz oben bleibt oben');
  assert.deepEqual(verschieben(eigene, 'gewonnen', 1), [], 'Gewonnen wandert nicht');
  const deals = [{ pipeline_id: P, stufe: 'termin' }];
  assert.match(stufeLoeschbar(eigene.find((s) => s.schluessel === 'termin'), deals), /noch 1 Deal\./);
  assert.equal(stufeLoeschbar(eigene.find((s) => s.schluessel === 'erstkontakt'), deals), null);
  assert.match(stufeLoeschbar(eigene.find((s) => s.schluessel === 'gewonnen'), []), /nur umbenennen/);
  const pl = [{ id: 'a', name: 'B', aktiv: true }, { id: 'b', name: 'A', standard: true }, { id: 'c', name: 'C', aktiv: false }];
  assert.equal(startAuswahl(pl, null), 'b');
  assert.equal(startAuswahl(pl, 'a'), 'a');
  assert.equal(startAuswahl(pl, 'c'), 'b', 'gemerkte inaktive Pipeline nicht öffnen');
  assert.equal(startAuswahl(pl, ''), '', 'gemerkter Standard bleibt');
  assert.equal(startAuswahl([], 'weg'), '');
  assert.deepEqual(sortiert(pl).map((p) => p.id), ['b', 'a', 'c']);
  assert.deepEqual(pipelineZahlen(P, [{ pipeline_id: P, stufe: 'termin' }, { pipeline_id: P, stufe: 'gewonnen' }, { pipeline_id: null, stufe: 'lead' }]),
    { gesamt: 2, offen: 1, gewonnen: 1, verloren: 0 });
});

test('Quelltext: SQL p359 und Seite halten die Regeln ein', () => {
  const sql = lies('supabase-sql/p359-eigene-pipelines.sql');
  assert.match(sql, /\(art = 'gewonnen'\) = \(schluessel = 'gewonnen'\)/, 'Gewonnen-Schlüssel fest');
  assert.match(sql, /'gewonnen', 'Gewonnen', 100, 'gewonnen'/, 'Gewonnen/Verloren automatisch');
  assert.match(sql, /on delete restrict/, 'Pipeline mit Deals nicht löschbar');
  assert.match(sql, /gibt es in dieser Pipeline nicht/, 'Stufe muss zur Pipeline passen');
  assert.doesNotMatch(sql, /drop table|truncate|delete from public\.crm_deal/i, 'nie destruktiv');
  assert.doesNotMatch(sql, /policy [a-z0-9_]+ on public\.crm_deal/i, 'Regeln von crm_deal bleiben unberührt (kein Aussperr-Risiko)');
  const seite = lies('app/dashboard/pipeline/page.tsx');
  assert.doesNotMatch(seite, /\bSTUFEN\b|stufeWahrscheinlichkeit|OFFENE_STUFEN/, 'Seite nutzt die Stufen der gewählten Pipeline');
  assert.match(seite, /if \(aktuelle\) zeile\.pipeline_id = aktuelle/, 'ohne SQL 359 bleibt das Anlegen wie bisher');
  assert.match(seite, /nichtsGeschrieben/);
  const heute = lies('app/dashboard/heute/page.tsx');
  assert.match(heute, /!istEntschieden\(String\(d\.stufe\)\)/, 'Heute zählt überfällige Deals aller Pipelines');
  assert.doesNotMatch(heute, /OFFENE_STUFEN|'lead',\s*'qualifiziert'/, 'keine feste Stufenliste mehr in Heute');
  assert.match(lies('lib/sicherungTabellen.ts'), /'crm_pipeline', 'crm_pipeline_stufe'/);
  assert.match(lies('lib/guideWissen.ts'), /Pipelines verwalten/);
  const verw = lies('app/dashboard/pipeline/PipelinesVerwalten.tsx');
  assert.match(verw, /\.update\(\{ standard: false \}\)\.eq\('standard', true\)/, 'alte Start-Ansicht zuerst lösen (eindeutig je Betrieb)');
});
