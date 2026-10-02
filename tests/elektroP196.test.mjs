// ============================================================================
// tests/elektroP196.test.mjs — Paket 196: Elektro-Feinschliff.
//   Messwerte mit Grenzwerten (VDE 0100-600 / 0105-100 / 0701-0702),
//   neue Prüfvorlage Erstprüfung, Auto-Mangel bei Grenzverletzung,
//   PDF-taugliche Schreibweise, Elektro-Startkatalog über profiles.branche,
//   drei Elektro-Kalkulator-Vorlagen, Rechte-Vorlage „Monteur".
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  messZahl, bewerteMesswert, grenzeText, einheitPdf, messTextPdf, zahlDe,
  zsMax, schutzleiterMax, isoMinGeraet, isoMinAnlage, rcdAusloeseBereich, schutzleiterstromMax,
  MESS_VDE_0100_600, MESS_VDE_0105, MESS_VDE_0701_0702,
} from '../out/elektroMesswerte.js';
import { PRUEF_NORMEN, pruefNorm, entwurfAusNorm, statusNachMessung, offeneMessungen, gesamtErgebnis } from '../out/pruefungen.js';
import { baueStartKatalog, brancheLeistungen } from '../out/startKatalog.js';
import { GEWERKE, ausVorlage, rechne, pruefeKalkulation } from '../out/kalkulator.js';
import { RECHTE_VORLAGEN, MONTEUR_MODULE } from '../out/rechteVorlagen.js';
import { ALLE_MODUL_KEYS, istSensibel } from '../out/rechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// ---------------------------------------------------------------------------
test('Messwert lesen: deutsche Eingabe, leer und Unsinn', () => {
  assert.equal(messZahl('0,21'), 0.21);
  assert.equal(messZahl('1.5'), 1.5);
  assert.equal(messZahl(' 300 '), 300);
  assert.equal(messZahl('1.234,5'), 1234.5);
  assert.equal(messZahl(''), null);
  assert.equal(messZahl('abc'), null);
  assert.equal(messZahl('1,2,3'), null);
  assert.equal(messZahl(null), null);
  assert.equal(messZahl(NaN), null);
});

test('Bewertung: unter min / über max = Mangel, Grenze selbst ist ok, ohne Wert = leer', () => {
  assert.equal(bewerteMesswert('0,99', 1, null), 'mangel');
  assert.equal(bewerteMesswert('1', 1, null), 'ok');
  assert.equal(bewerteMesswert('0,31', null, 0.3), 'mangel');
  assert.equal(bewerteMesswert('0,3', null, 0.3), 'ok');
  assert.equal(bewerteMesswert('14', 15, 30), 'mangel');
  assert.equal(bewerteMesswert('31', 15, 30), 'mangel');
  assert.equal(bewerteMesswert('22', 15, 30), 'ok');
  assert.equal(bewerteMesswert('', 1, null), 'leer');
  assert.equal(bewerteMesswert('5', null, null), 'ok');
});

test('Schleifenimpedanz: U0/Ia × 2/3, abgerundet (sichere Seite)', () => {
  assert.equal(zsMax('B', 16), 1.91);          // 230/80 × 2/3 = 1,9166
  assert.equal(zsMax('C', 16), 0.95);          // 230/160 × 2/3 = 0,9583
  assert.equal(zsMax('B', 16, 230, false), 2.87); // reiner Norm-Rechenwert 2,875
  assert.equal(zsMax('B', 20), 1.53);
  assert.equal(zsMax('D', 10), 0.76);          // 230/200 × 2/3 = 0,7666
  assert.equal(zsMax('B', 0), null);
  assert.equal(zsMax('X', 16), null);
});

test('Schutzleiterwiderstand 0701-0702: 0,3 Ω bis 5 m, je weitere 7,5 m + 0,1 Ω, höchstens 1 Ω', () => {
  assert.equal(schutzleiterMax(0), 0.3);
  assert.equal(schutzleiterMax(5), 0.3);
  assert.equal(schutzleiterMax(12.5), 0.4);
  assert.equal(schutzleiterMax(12.6), 0.5);
  assert.equal(schutzleiterMax(20), 0.5);
  assert.equal(schutzleiterMax(200), 1);
});

test('Isolation, RCD, Ableitströme: Norm-Werte', () => {
  assert.equal(isoMinGeraet('I'), 1);
  assert.equal(isoMinGeraet('I', true), 0.3);
  assert.equal(isoMinGeraet('II'), 2);
  assert.equal(isoMinGeraet('III'), 0.25);
  assert.deepEqual(isoMinAnlage('selv'), { minMOhm: 0.5, pruefspannungV: 250 });
  assert.deepEqual(isoMinAnlage('bis500'), { minMOhm: 1, pruefspannungV: 500 });
  assert.deepEqual(isoMinAnlage('ueber500'), { minMOhm: 1, pruefspannungV: 1000 });
  assert.deepEqual(rcdAusloeseBereich(30), { min: 15, max: 30 });
  assert.equal(rcdAusloeseBereich(0), null);
  assert.equal(schutzleiterstromMax(), 3.5);
  assert.equal(schutzleiterstromMax(6), 6);
  assert.equal(schutzleiterstromMax(14), 10);
});

test('Vorlagen-Grenzen stimmen mit den Rechen-Helfern überein', () => {
  const g = (liste, teil) => liste.find((m) => m.punkt.includes(teil));
  assert.equal(g(MESS_VDE_0100_600, 'Isolation').min, 1);
  assert.equal(g(MESS_VDE_0100_600, 'Schleifenimpedanz').max, 1.91);
  assert.equal(g(MESS_VDE_0100_600, 'Auslösezeit').max, 300);
  assert.equal(g(MESS_VDE_0100_600, 'Auslösestrom').min, 15);
  assert.equal(g(MESS_VDE_0100_600, 'Auslösestrom').max, 30);
  assert.equal(g(MESS_VDE_0100_600, 'Berührungsspannung').max, 50);
  assert.equal(g(MESS_VDE_0701_0702, 'Schutzleiterwiderstand').max, 0.3);
  assert.equal(g(MESS_VDE_0701_0702, 'Isolation').min, 1);
  assert.equal(g(MESS_VDE_0701_0702, 'Schutzleiterstrom').max, 3.5);
  assert.equal(g(MESS_VDE_0701_0702, 'Berührungsstrom').max, 0.5);
  assert.ok(MESS_VDE_0105.length >= 3);
});

test('Punkt-Texte der Messvorlagen sind PDF-tauglich (kein Ω, Δ, ≤, ≥)', () => {
  for (const m of [...MESS_VDE_0100_600, ...MESS_VDE_0105, ...MESS_VDE_0701_0702]) {
    assert.doesNotMatch(m.punkt, /[ΩΔ≤≥]/, m.punkt);
  }
  for (const n of PRUEF_NORMEN) for (const p of n.pruefpunkte) assert.doesNotMatch(p, /[ΩΔ≤≥]/, p);
});

test('Anzeige und PDF: Grenze lesbar, PDF ohne Sonderzeichen', () => {
  assert.equal(grenzeText(null, 0.3, 'Ω'), '≤ 0,3 Ω');
  assert.equal(grenzeText(1, null, 'MΩ'), '≥ 1 MΩ');
  assert.equal(grenzeText(15, 30, 'mA'), '15 – 30 mA');
  assert.equal(grenzeText(null, null, 'V'), '');
  assert.equal(einheitPdf('MΩ'), 'MOhm');
  assert.equal(einheitPdf('Ω'), 'Ohm');
  assert.equal(messTextPdf({ messwert: 0.21, einheit: 'Ω', grenz_max: 0.3 }), 'Messwert 0,21 Ohm (Grenze max. 0,3 Ohm)');
  assert.equal(messTextPdf({ messwert: 250, einheit: 'MΩ', grenz_min: 1 }), 'Messwert 250 MOhm (Grenze min. 1 MOhm)');
  assert.equal(messTextPdf({ messwert: 22, einheit: 'mA', grenz_min: 15, grenz_max: 30 }), 'Messwert 22 mA (Grenze 15 bis 30 mA)');
  assert.equal(messTextPdf({ messwert: null, einheit: 'Ω', grenz_max: 0.3 }), '');
  assert.doesNotMatch(messTextPdf({ messwert: 1, einheit: 'kΩ', grenz_min: 0.5, grenz_max: 2 }), /[ΩΔ≤≥]/);
  assert.equal(zahlDe(1.9166666), '1,917');
});

test('Neue Vorlage Erstprüfung VDE 0100-600 mit Besichtigen, Erproben, Messen', () => {
  const n = pruefNorm('elektro_erstpruefung');
  assert.ok(n, 'Vorlage fehlt');
  assert.equal(n.norm, 'DIN VDE 0100-600');
  assert.equal(n.intervall_monate, 48);
  assert.ok(n.pruefpunkte.some((p) => p.startsWith('Besichtigen')));
  assert.ok(n.pruefpunkte.some((p) => p.startsWith('Erproben')));
  assert.deepEqual(n.messungen, MESS_VDE_0100_600);
  assert.ok(n.fristHinweis);
  const keys = PRUEF_NORMEN.map((x) => x.key);
  assert.equal(new Set(keys).size, keys.length, 'doppelte Schlüssel');
  assert.ok(pruefNorm('elektro_ortsveraenderlich').messungen?.length === 4);
  assert.ok(pruefNorm('elektro_ortsfest').messungen?.length >= 3);
});

test('Entwurf aus Norm: Sichtpunkte ohne, Messpunkte mit Zahlenfeld und Grenze', () => {
  const e = entwurfAusNorm(pruefNorm('elektro_ortsveraenderlich'));
  const mess = e.filter((p) => p.mess);
  assert.equal(mess.length, 4);
  assert.equal(e.length, 2 + 4);
  const sl = mess.find((p) => p.punkt === 'Schutzleiterwiderstand');
  assert.equal(sl.grenz_max, 0.3);
  assert.equal(sl.einheit, 'Ω');
  assert.equal(sl.messwert, '');
  assert.ok(sl.tipp);
  assert.deepEqual(entwurfAusNorm(undefined), []);
  // Feuerlöscher ohne Messungen: wie bisher nur Sichtpunkte
  assert.ok(entwurfAusNorm(pruefNorm('feuerloescher')).every((p) => !p.mess));
});

test('Messwert ausserhalb der Grenze macht den Punkt automatisch zum Mangel', () => {
  const sl = { punkt: 'Schutzleiterwiderstand', status: 'ok', hinweis: '', mess: true, messwert: '0,45', einheit: 'Ω', grenz_min: null, grenz_max: 0.3 };
  assert.equal(statusNachMessung(sl), 'mangel');
  assert.equal(statusNachMessung({ ...sl, messwert: '0,12' }), 'ok');
  // ohne Messwert bleibt die Entscheidung des Prüfers stehen
  assert.equal(statusNachMessung({ ...sl, messwert: '', status: 'na' }), 'na');
  // Sichtpunkt: nie automatisch
  assert.equal(statusNachMessung({ punkt: 'Sicht', status: 'mangel', hinweis: '' }), 'mangel');
  const punkte = [{ punkt: 'Sicht', status: 'ok', hinweis: '' }, { ...sl, status: statusNachMessung(sl) }];
  assert.equal(gesamtErgebnis(punkte), 'maengel');
});

test('Offene Messungen werden gezählt, „n. z." nicht', () => {
  const m = (messwert, status = 'ok') => ({ punkt: 'x', status, hinweis: '', mess: true, messwert, einheit: 'Ω', grenz_max: 1 });
  assert.equal(offeneMessungen([m(''), m('0,2'), m('', 'na'), { punkt: 'Sicht', status: 'ok', hinweis: '' }]), 1);
});

// ---------------------------------------------------------------------------
test('Elektro-Startkatalog: erkannt über die Branche, Elektronik bewusst nicht', () => {
  assert.ok(brancheLeistungen('Elektriker & Elektrobetriebe').length >= 10);
  assert.ok(brancheLeistungen('Elektrotechnik Müller GmbH').length >= 10);
  assert.ok(brancheLeistungen('elektroinstallation').length >= 10);
  assert.equal(brancheLeistungen('Elektronik & Technologie').length, 0);
  assert.equal(brancheLeistungen('Malerbetrieb').length, 0);
  assert.deepEqual(brancheLeistungen(''), []);
  assert.deepEqual(brancheLeistungen(null), []);
});

test('Startkatalog mit Branche: Elektro zuerst, dann Kategorie, ohne Doppelte', () => {
  const z = baueStartKatalog('Handwerk & Bau', 'chef-1', [], 'Elektriker & Elektrobetriebe');
  const namen = z.map((r) => r.bezeichnung);
  assert.equal(new Set(namen.map((n) => n.toLowerCase())).size, namen.length, 'Duplikat');
  assert.ok(namen[0].includes('Elektroniker'));
  assert.ok(namen.includes('Anfahrtspauschale'), 'Kategorie-Leistungen fehlen');
  assert.ok(namen.some((n) => n.includes('VDE 0100-600')));
  assert.ok(z.every((r) => r.owner_user_id === 'chef-1'));
  const pruef = z.find((r) => r.bezeichnung.startsWith('Geräteprüfung'));
  assert.equal(pruef.erfassungsart, 'stueck');
  assert.equal(pruef.einheit, 'Gerät');
  assert.equal(pruef.einheitspreis_netto, 6.5);
  assert.equal(pruef.stundensatz_netto, null);
  // ohne Branche: unverändert wie vorher
  const alt = baueStartKatalog('Handwerk & Bau', 'chef-1', []);
  assert.ok(alt.every((r) => !r.bezeichnung.includes('Elektro')));
  // ohne Kategorie, aber Elektro-Branche: nur Elektro, kein allgemeiner Default
  const nurE = baueStartKatalog('', 'chef-1', [], 'Elektrobetrieb');
  assert.equal(nurE.length, brancheLeistungen('Elektrobetrieb').length);
  // vorhandene werden übersprungen
  const ohne = baueStartKatalog('Handwerk & Bau', 'chef-1', ['STÖRUNGSSUCHE (JE STUNDE)'], 'Elektrobetrieb');
  assert.ok(!ohne.some((r) => r.bezeichnung === 'Störungssuche (je Stunde)'));
});

test('Leistungskatalog-Seite lädt die Branche und speichert für den Betrieb', () => {
  const s = lies('app/dashboard/leistungskatalog/page.tsx');
  assert.match(s, /select\('kategorie, branche'\)/);
  assert.match(s, /baueStartKatalog\(kat, betrieb, liste\.map\(\(k\) => k\.bezeichnung \|\| ''\), branche\)/);
  assert.match(s, /const betrieb = besitzer \?\? uid/);
});

// ---------------------------------------------------------------------------
test('Kalkulator: drei Elektro-Vorlagen, rechenbar und mit Marge', () => {
  for (const key of ['elektro_zaehlerschrank', 'elektro_wallbox', 'elektro_uv']) {
    const g = GEWERKE.find((x) => x.key === key);
    assert.ok(g, key + ' fehlt');
    let i = 0;
    const k = ausVorlage(key, () => String(i++));
    assert.deepEqual(pruefeKalkulation(k), [], key);
    const e = rechne(k);
    assert.ok(e.angebotspreis_netto > e.selbstkosten, key);
    assert.ok(g.posten.some((p) => p.art === 'zeit'), key + ' ohne Arbeitszeit');
  }
  // plausible Größenordnung (netto, Startwerte)
  const preis = (key) => { let i = 0; return rechne(ausVorlage(key, () => String(i++))).angebotspreis_netto; };
  assert.ok(preis('elektro_zaehlerschrank') > 1000 && preis('elektro_zaehlerschrank') < 4000);
  assert.ok(preis('elektro_wallbox') > 900 && preis('elektro_wallbox') < 3000);
  assert.ok(preis('elektro_uv') > 500 && preis('elektro_uv') < 2500);
});

// ---------------------------------------------------------------------------
test('Rechte-Vorlage Monteur: nur echte, nicht-sensible Module', () => {
  const v = RECHTE_VORLAGEN.find((x) => x.name === 'Monteur');
  assert.ok(v);
  assert.deepEqual(v.module, MONTEUR_MODULE);
  for (const k of v.module) {
    assert.ok(ALLE_MODUL_KEYS.includes(k), k + ' ist kein Modul');
    assert.equal(istSensibel(k), false, k + ' ist sensibel');
  }
  for (const k of ['auftraege', 'einsaetze', 'pruefprotokolle', 'wartung']) assert.ok(v.module.includes(k), k);
  for (const k of ['rechnungen', 'personal', 'finanzen']) assert.ok(!v.module.includes(k), k);
  // alte Vorlagen unverändert vorhanden
  for (const n of ['Lager', 'Produktion', 'Büro', 'Vertrieb', 'Alle', 'Keine']) assert.ok(RECHTE_VORLAGEN.some((x) => x.name === n), n);
  assert.equal(RECHTE_VORLAGEN.find((x) => x.name === 'Alle').module.length, ALLE_MODUL_KEYS.length);
});

test('Rechte-Seite nutzt die Vorlagen aus der Logik-Datei', () => {
  const s = lies('app/dashboard/rechte/page.tsx');
  assert.match(s, /from "\.\.\/\.\.\/\.\.\/lib\/rechteVorlagen"/);
  assert.match(s, /const VORLAGEN = RECHTE_VORLAGEN;/);
});

// ---------------------------------------------------------------------------
test('Prüfprotokolle-Seite: Messfelder, Auto-Mangel, Ersatzweg ohne Spalten, PDF', () => {
  const s = lies('app/dashboard/pruefprotokolle/page.tsx');
  assert.match(s, /setDraft\(entwurfAusNorm\(n\)\)/);
  assert.match(s, /statusNachMessung\(/);
  assert.match(s, /messwert: messZahl\(p\.messwert\)/);
  assert.match(s, /schema cache/);           // Ersatzweg, wenn SQL p196 noch fehlt
  assert.match(s, /messTextPdf\(/);
  assert.match(s, /＋ Messwert/);
  const pdf = lies('lib/pruefPdf.ts');
  assert.match(pdf, /messTextPdf\(p\)/);
  const sql = lies('supabase-sql/p196-pruef-messwerte.sql');
  for (const c of ['messwert', 'einheit', 'grenz_min', 'grenz_max']) assert.match(sql, new RegExp(`add column if not exists ${c}\\s`));
  assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b/i);
});
