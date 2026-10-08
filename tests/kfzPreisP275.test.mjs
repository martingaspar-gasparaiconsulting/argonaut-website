// ============================================================================
// tests/kfzPreisP275.test.mjs — Paket 275 (08.10.2026) · K12a Markt und Preis (eigene Daten)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  standardRegeln, regelnLesen, untergrenze, tageSeitPreis, stufeFuer, vorschlag, aufrufeJe, anfragenJe,
  diagnose, standzeitVerteilung, uebernahmeListe, istBot, PREIS_MODUL,
} from '../out/kfzPreis.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const HEUTE = '2026-10-08';
const R = standardRegeln({ gruenBis: 60, gelbBis: 90 });

test('Regeln: Vorbelegung aus der Ampel, Bereinigung kaputter Werte', () => {
  assert.equal(PREIS_MODUL, 'kfz-preis');
  assert.deepEqual(R.stufen, [{ ab: 45, prozent: 2 }, { ab: 60, prozent: 3 }, { ab: 90, prozent: 4 }]);
  assert.equal(R.abstandTage, 14);
  assert.deepEqual(standardRegeln({ gruenBis: 90, gelbBis: 150 }).stufen.map((s) => s.ab), [75, 90, 150]);
  assert.deepEqual(standardRegeln(null).stufen.map((s) => s.ab), [45, 60, 90]);
  const r = regelnLesen({ stufen: [{ ab: 90, prozent: '4' }, { ab: 30, prozent: 1.25 }, { ab: 30, prozent: 9 }, { ab: 0, prozent: 2 }, { ab: 40, prozent: 30 }, 'kaputt'], abstandTage: 200, mindestRohertrag: '750', aufrufeViel: 2 }, R);
  assert.deepEqual(r.stufen, [{ ab: 30, prozent: 1.3 }, { ab: 90, prozent: 4 }]);
  assert.equal(r.abstandTage, 14, 'unplausibler Abstand -> Vorbelegung');
  assert.equal(r.mindestRohertrag, 750);
  assert.equal(r.aufrufeViel, 50);
  assert.deepEqual(regelnLesen(null, R), R);
  assert.deepEqual(regelnLesen({ stufen: [] }, R).stufen, [], 'leere Treppe ist erlaubt (Betrieb will keine Vorschläge)');
});

test('Untergrenze: Regelsteuer und § 25a, nie geraten', () => {
  // Regel: (10.000 + 1.000 + 200 + 500) × 1,19 = 13.923 -> 13.930
  assert.equal(untergrenze({ besteuerung: 'regel', ek: 10000, kosten: 1000, standkosten: 200, mindestRohertrag: 500 }), 13930);
  // § 25a: Bedarf 11.700, EK 10.000 -> (119 × 11.700 − 19 × 10.000) / 100 = 12.023 -> 12.030
  assert.equal(untergrenze({ besteuerung: '25a', ek: 10000, kosten: 1000, standkosten: 200, mindestRohertrag: 500 }), 12030);
  assert.equal(untergrenze({ besteuerung: null, ek: 10000, kosten: 1000, standkosten: 200, mindestRohertrag: 500 }), 12030, 'offen wie § 25a');
  assert.equal(untergrenze({ besteuerung: '25a', ek: 10000, kosten: 0, standkosten: 0, mindestRohertrag: 0 }), 10000);
  assert.equal(untergrenze({ besteuerung: '25a', ek: null, kosten: 1000, standkosten: 0, mindestRohertrag: 500 }), null);
  assert.equal(untergrenze({ besteuerung: 'regel', ek: 8403.36, kosten: -50, standkosten: NaN, mindestRohertrag: 0 }), 10000, 'negative/kaputte Kosten zählen nicht; aufgerundet auf 10 €');
});

test('Untergrenze hält K5: am Grenzpreis bleibt genau der Mindest-Rohertrag', async () => {
  const { kalkulation } = await import('../out/kfzKalkulation.js');
  for (const best of ['regel', '25a']) {
    const g = untergrenze({ besteuerung: best, ek: 15000, kosten: 1200, standkosten: 300, mindestRohertrag: 800 });
    const k = kalkulation({ besteuerung: best, ek: 15000, vk: g, kosten: 1200, standtage: 30, standkostenTag: 10, gemeinkostenProzent: 0, provV: { art: null, wert: null }, provH: { art: null, wert: null } });
    assert.ok(k.rohertrag >= 800, `${best}: Rohertrag ${k.rohertrag} >= 800`);
    const k2 = kalkulation({ besteuerung: best, ek: 15000, vk: g - 10, kosten: 1200, standtage: 30, standkostenTag: 10, gemeinkostenProzent: 0, provV: { art: null, wert: null }, provH: { art: null, wert: null } });
    assert.ok(k2.rohertrag < 800, `${best}: 10 € darunter reicht nicht mehr`);
  }
});

test('Preis-Treppe: Stufe, Abstand, Untergrenze, Sonderfälle', () => {
  assert.equal(tageSeitPreis(['2026-09-20T10:00:00Z', '2026-10-01T08:00:00Z'], HEUTE), 7);
  assert.equal(tageSeitPreis([], HEUTE), null);
  assert.equal(stufeFuer(44, R.stufen), null);
  assert.deepEqual(stufeFuer(60, R.stufen), { ab: 60, prozent: 3 });
  assert.deepEqual(stufeFuer(400, R.stufen), { ab: 90, prozent: 4 });
  const v = (x) => vorschlag({ vk: 20000, standtage: 70, seitPreis: 30, untergrenze: 15000, regeln: R, ...x });
  assert.deepEqual([v().art, v().neu, v().prozent], ['senken', 19400, 3]);
  assert.equal(v({ standtage: 20 }).art, 'halten');
  assert.equal(v({ seitPreis: 5 }).art, 'warten');
  assert.match(v({ seitPreis: 13 }).grund, /in 1 Tag\./);
  assert.equal(v({ seitPreis: null }).art, 'senken', 'ohne Preisverlauf darf gesenkt werden');
  const b = v({ untergrenze: 19800 });
  assert.deepEqual([b.art, b.neu], ['senken', 19800]);
  assert.match(b.grund, /begrenzt/);
  assert.equal(v({ untergrenze: 20000 }).art, 'grenze');
  assert.equal(v({ untergrenze: 21000 }).art, 'unter_grenze');
  assert.equal(v({ vk: null }).art, 'kein_preis');
  assert.equal(v({ vk: 0 }).art, 'kein_preis');
  assert.equal(v({ standtage: null }).art, 'zulauf');
  assert.equal(v({ untergrenze: null }).neu, 19400, 'ohne EK: Treppe ohne Grenze');
  assert.equal(vorschlag({ vk: 18990, standtage: 100, seitPreis: null, untergrenze: null, regeln: R }).neu, 18230, 'auf 10 € gerundet');
  assert.equal(vorschlag({ vk: 20000, standtage: 100, seitPreis: null, untergrenze: null, regeln: regelnLesen({ stufen: [] }, R) }).art, 'halten');
});

test('Nachfrage: Aufrufe/Anfragen 30 Tage und Diagnose', () => {
  const a = aufrufeJe([
    { bestand_id: 'f1', tag: '2026-10-08', anzahl: 5 }, { bestand_id: 'f1', tag: '2026-09-09', anzahl: 7 },
    { bestand_id: 'f1', tag: '2026-09-08', anzahl: 100 }, { bestand_id: 'f2', tag: '2026-10-01', anzahl: -3 },
  ], HEUTE);
  assert.deepEqual(a, { f1: 12 });
  const q = anfragenJe([{ bestand_id: 'f1', erstellt_am: '2026-09-09T07:00:00Z' }, { bestand_id: 'f1', erstellt_am: '2026-09-01T07:00:00Z' }, { bestand_id: null, erstellt_am: HEUTE }], HEUTE);
  assert.deepEqual(q, { f1: 1 });
  const d = (x) => diagnose({ inseriert: true, ampel: 90, aufrufe: 20, anfragen: 0, standtage: 30, aufrufeViel: 50, ...x });
  assert.equal(d({ anfragen: 2 }).stufe, 'ok');
  assert.equal(d({ ampel: 40 }).stufe, 'bad');
  assert.equal(d({ inseriert: false }).stufe, 'dim');
  assert.match(d({ aufrufe: 60 }).text, /schreckt ab/);
  assert.match(d({ aufrufe: 3 }).text, /kaum gesehen/);
  assert.equal(d({ aufrufe: 3, standtage: 5 }).stufe, 'dim', 'neu im Bestand: noch kein Urteil');
});

test('Standzeit-Verteilung, Massen-Übernahme, Bot-Filter', () => {
  const v = standzeitVerteilung([{ standtage: 10, ek: 1000 }, { standtage: 30, ek: null }, { standtage: 31, ek: 500.5 }, { standtage: 200, ek: 9000 }, { standtage: null, ek: 99999 }]);
  assert.deepEqual(v.map((x) => x.anzahl), [2, 1, 0, 0, 1]);
  assert.deepEqual(v.map((x) => x.ek), [1000, 500.5, 0, 0, 9000]);
  const s = { art: 'senken', neu: 19000, prozent: 5, stufe: null, grund: '' };
  assert.deepEqual(uebernahmeListe([
    { id: 'a', vk: 20000, v: s }, { id: 'b', vk: 19000, v: s }, { id: 'c', vk: 20000, v: { ...s, art: 'warten' } }, { id: 'd', vk: null, v: s },
  ]), [{ id: 'a', alt: 20000, neu: 19000 }]);
  assert.equal(istBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129 Safari/537.36'), false);
  assert.equal(istBot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
  assert.equal(istBot('WhatsApp/2.23'), true);
  assert.equal(istBot(''), true);
  assert.equal(istBot(null), true);
});

test('Verdrahtung: Seite, Zähler in beiden Börsen-Detailseiten, Menü, Hub, Guide, keine KI', () => {
  const logik = lies('lib/kfzPreis.ts');
  assert.doesNotMatch(logik, /kiFetch|anthropic|openai/i, 'keine KI im Preisvorschlag');
  assert.doesNotMatch(logik, /Math\.round\([^)]*\* ?100\) ?\/ ?100/, 'Rundungs-Wächter');
  const seite = lies('app/dashboard/kfz/preise/page.tsx');
  assert.match(seite, /PREIS_MODUL/);
  assert.match(seite, /kfz_boerse_aufruf/);
  assert.match(seite, /nichtsGeschrieben/, 'Preisänderung mit 0 Zeilen = Fehler');
  assert.match(seite, /Leerzustand/);
  for (const p of ['app/fahrzeuge/[kennung]/[id]/page.tsx', 'app/fahrzeuge-domain/[host]/[id]/page.tsx']) {
    assert.match(lies(p), /^\s*await aufrufZaehlen\(boerseDb\(\), d\.betrieb, d\.f\.id, await headers\(\)\);/m, `${p} zählt Aufrufe`);
  }
  const laden = lies('lib/kfzBoerseLaden.ts');
  assert.match(laden, /rpc\('p275_aufruf_zaehlen'/);
  assert.match(laden, /istBot/);
  assert.match(lies('lib/rechte.ts'), /\/dashboard\/kfz\/preise/);
  assert.match(lies('app/dashboard/kfz/page.tsx'), /\/dashboard\/kfz\/preise/);
  assert.match(lies('lib/guideWissen.ts'), /\/dashboard\/kfz\/preise/);
  const sql = lies('supabase-sql/p275-kfz-preis.sql');
  assert.match(sql, /revoke all on function public\.p275_aufruf_zaehlen\(uuid, uuid\) from anon/);
  assert.match(sql, /revoke all on function public\.p275_aufruf_zaehlen\(uuid, uuid\) from authenticated/);
  assert.doesNotMatch(sql, /\b(ip|user_agent|cookie)\s+(text|inet)/i, 'keine Besucherdaten');
});
