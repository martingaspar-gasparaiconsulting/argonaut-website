// ============================================================================
// tests/reifeKalkP340.test.mjs — Paket 340 (12.10.2026)
// BV3a Manufaktur Teil 2: Kalkulation mit Reifeverlust (Plan/Ist, Einstand,
// Preis-Vorschlag aus Marge, g -> kg, Verlustgrenze, Rechte im SQL)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  kalkStartwerte, preisEinheit, kalkPruefen, rechne, planKalk, istKalk, verlustGrenze, einstandAbweichung, margeAmpel,
} from '../out/reifeKalk.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// Dry-Aged: 20 kg zu 18,50 €/kg, 1,20 €/Tag, 40 € sonst, 25 % Reifeverlust, 15 % Parieren, 40 % Marge, 7 %
const C = { art: 'dry_aged', start_datum: '2026-10-01', ziel_tage: 28, start_menge: 20, einheit: 'kg', status: 'reift' };
const K = { ek_art: 'je_einheit', ek_wert: 18.5, kosten_tag: 1.2, kosten_sonst: 40, parier_prozent: 15, erwarteter_verlust: 25, marge_prozent: 40, mwst_satz: 7, vk_preis: 64.9 };

test('Plan: Kosten, verkaufsfähige Menge, Einstand, Vorschlag', () => {
  const p = planKalk(C, K);
  assert.equal(p.ok, true);
  const e = p.e;
  assert.equal(e.ekGesamt, 370);
  assert.equal(e.reifekosten, 33.6, '28 Tage × 1,20 €');
  assert.equal(e.kostenGesamt, 443.6);
  assert.equal(e.endMenge, 15, '20 kg − 25 %');
  assert.equal(e.verkaufsMenge, 12.75, '15 kg − 15 % Parieren');
  assert.equal(e.ausbeuteProzent, 63.8);
  assert.equal(e.einstand, 34.79, '443,60 / 12,75');
  assert.equal(e.vorschlagNetto, 57.99, 'Einstand / (1 − 40 %)');
  assert.equal(e.vorschlagBrutto, 62.05, '57,99 × 1,07');
});

test('Gewählter Preis: Rohertrag, Marge, Aufschlag, Deckung', () => {
  const e = planKalk(C, K).e;
  assert.equal(e.vkNetto, 60.65);
  assert.equal(e.rohertragJe, 25.86);
  assert.equal(e.margeIst, 42.6);
  assert.equal(e.aufschlag, 74.3);
  assert.equal(e.deckung, 329.74);
  assert.equal(margeAmpel(e, 40), 'ok');
  assert.equal(margeAmpel(e, 45), 'warn', 'unter Wunsch-Marge');
  const billig = planKalk(C, { ...K, vk_preis: 30 }).e;
  assert.ok(billig.rohertragJe < 0);
  assert.equal(margeAmpel(billig, 40), 'bad');
});

test('Ist: Endmenge beim Abschluss, Tage bis Abschluss, Abweichung zum Plan', () => {
  const ist = istKalk({ ...C, status: 'abgeschlossen', end_menge: 14.2, end_datum: '2026-11-02' }, K, 99, '2026-11-10');
  assert.equal(ist.ok, true);
  assert.equal(ist.vorlaeufig, false);
  assert.equal(ist.e.tage, 32, 'bis Abschluss, nicht bis heute');
  assert.equal(ist.e.kostenGesamt, 448.4);
  assert.equal(ist.e.verkaufsMenge, 12.07);
  assert.equal(ist.e.einstand, 37.15);
  assert.equal(einstandAbweichung(planKalk(C, K), ist), 6.8);
  const lauf = istKalk(C, K, 16, '2026-10-21');
  assert.equal(lauf.ok, true);
  assert.equal(lauf.vorlaeufig, true, 'laufend = letzte Wiegung, vorläufig');
  assert.equal(lauf.e.tage, 20);
});

test('Ohne nötige Zahl kein Ergebnis — nie still mit 0', () => {
  assert.equal(planKalk({ ...C, start_menge: null }, K).ok, false);
  assert.equal(planKalk(C, { ...K, ek_wert: null }).ok, false);
  assert.equal(planKalk(C, { ...K, erwarteter_verlust: null }).ok, false);
  assert.equal(planKalk({ ...C, ziel_tage: null }, K).ok, false);
  assert.equal(istKalk(C, K, null, '2026-10-10').ok, false);
  assert.equal(istKalk({ ...C, status: 'abgeschlossen', end_menge: null, end_datum: '2026-11-01' }, K, 15, '2026-11-10').ok, false, 'abgeschlossen ohne Endmenge: nicht auf letzte Wiegung ausweichen');
  assert.match(istKalk({ ...C, status: 'verworfen' }, K, 15, '2026-11-10').grund, /Verlust/);
  assert.equal(rechne(C, { ...K, parier_prozent: 90 }, 0.0001, 1).ok, true);
  const ohneMarge = planKalk(C, { ...K, marge_prozent: null, vk_preis: null }).e;
  assert.equal(ohneMarge.vorschlagNetto, null);
  assert.equal(ohneMarge.margeIst, null);
  assert.equal(ohneMarge.einstand, 34.79, 'Einstand geht auch ohne Marge');
});

test('Einkauf gesamt statt je Einheit, Gramm wird je kg gerechnet', () => {
  assert.equal(planKalk(C, { ...K, ek_art: 'gesamt', ek_wert: 370 }).e.einstand, 34.79);
  assert.deepEqual(preisEinheit('g'), { einheit: 'kg', faktor: 1000 });
  const g = planKalk({ ...C, einheit: 'g', start_menge: 20000 }, { ...K, ek_wert: 0.0185 }).e;
  assert.equal(g.einstand, 34.79, 'je kg, nicht je g');
  assert.equal(g.verkaufsMenge, 12.75, 'in kg');
  assert.equal(g.ausbeuteProzent, 63.8);
});

test('Verlustgrenze: bis zu welchem Gesamtverlust der Preis die Kosten deckt', () => {
  assert.equal(verlustGrenze(C, K, 28), 63.4);
  assert.equal(verlustGrenze(C, { ...K, vk_preis: null }, 28), null);
  assert.ok(verlustGrenze(C, { ...K, vk_preis: 10 }, 28) < 0, 'Preis deckt nicht einmal ohne Verlust');
});

test('Eingaben: Grenzen, Steuersatz, Rundung', () => {
  const ok = kalkPruefen({ ek_art: 'gesamt', ek_wert: 370.123456, kosten_tag: 1.204, kosten_sonst: null, parier_prozent: 15, erwarteter_verlust: 25, marge_prozent: 40, mwst_satz: 7, vk_preis: 64.899 });
  assert.equal(ok.ok, true);
  assert.equal(ok.felder.ek_wert, 370.1235);
  assert.equal(ok.felder.kosten_tag, 1.2);
  assert.equal(ok.felder.vk_preis, 64.9);
  const basis = { ek_art: 'gesamt', ek_wert: 1, kosten_tag: null, kosten_sonst: null, parier_prozent: null, erwarteter_verlust: null, marge_prozent: null, mwst_satz: 7, vk_preis: null };
  assert.equal(kalkPruefen({ ...basis, mwst_satz: 16 }).ok, false);
  assert.equal(kalkPruefen({ ...basis, mwst_satz: null }).ok, false);
  assert.equal(kalkPruefen({ ...basis, marge_prozent: 100 }).ok, false, 'Marge 100 % = Division durch 0');
  assert.equal(kalkPruefen({ ...basis, parier_prozent: 95 }).ok, false);
  assert.equal(kalkPruefen({ ...basis, ek_wert: -1 }).ok, false);
  assert.equal(kalkPruefen({ ...basis, ek_art: 'quatsch' }).ok, false);
  assert.equal(kalkStartwerte('wein').mwst_satz, 19);
  assert.equal(kalkStartwerte('kaese').mwst_satz, 7);
  assert.equal(kalkStartwerte('confiserie').erwarteter_verlust, 0, 'ohne Wiegung kein Verlust');
});

test('SQL: eigene Tabelle, nur Chef oder „Darf abrechnen", Wächter', () => {
  const sql = lies('supabase-sql/p340-reife-kalkulation.sql');
  assert.match(sql, /create table if not exists public\.reife_kalk/);
  assert.doesNotMatch(sql, /alter table public\.reife_charge add/, 'keine Preise an der Charge — die sieht jeder mit „Lebensmittel"');
  const ma = sql.split('\n').filter((z) => /p340_ma_(select|insert|update)/.test(z) || /darf_ich_abrechnen/.test(z));
  assert.equal(sql.match(/public\.darf_ich_abrechnen\(\)/g).length, 4, 'select, insert, update using + check');
  assert.ok(ma.length >= 4);
  assert.doesNotMatch(sql, /p340_ma_delete/, 'Mitarbeiter löschen keine Kalkulation');
  assert.match(sql, /c\.id = new\.charge_id and c\.owner_user_id = new\.owner_user_id/);
  assert.match(sql, /mwst_satz in \(0, 7, 19\)/);
  assert.match(sql, /marge_prozent between 0 and 95/);
});

test('Seite: Kalkulation nur mit Recht, Geld über lib/zahlen', () => {
  const seite = lies('app/dashboard/lebensmittel/reife/page.tsx');
  assert.match(seite, /useDarfAbrechnen/);
  assert.match(seite, /from\('reife_kalk'\)/);
  assert.match(seite, /kalkErlaubt/);
  const lib = lies('lib/reifeKalk.ts');
  assert.doesNotMatch(lib, /Math\.round/, 'kein eigener Runder');
  assert.match(lib, /centRunden/);
});
