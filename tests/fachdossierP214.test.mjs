// ============================================================================
// tests/fachdossierP214.test.mjs — Paket 214 (Stufe 3 · B11a Fachdossier-Generator)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  baueDossier, dossierStand, modulName, ohneEmoji, standText, textVerstoesse, FACH_TEXTE, IN_AUFBAU_MODULE, IN_VORBEREITUNG,
} from '../out/fachdossier.js';
import { KERN_MODULE } from '../out/pakete.js';
import { KATEGORIE_MODULE } from '../out/branchenkatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ELEKTRO = { slug: 'elektriker', name: 'Elektriker & Elektrobetriebe', kategorie: 'Handwerk & Bau' };
const FRISEUR = { slug: 'friseure', name: 'Friseure', kategorie: 'Sport, Beauty & Lifestyle' };
// Paket 221: Friseure sind „in rechtlicher Vorbereitung" (Ladenkasse) — für Entwurf-Tests ein freier Betrieb ohne Text
// Paket 237 bewusst angepasst: Fitnessstudios hat jetzt Text — Beispiel ohne Text ist eine bewusst zurückgestellte Branche
const FITNESS = { slug: 'chemische-industrie', name: 'Chemische Industrie', kategorie: 'Industrie & Produktion' };
const alleKeys = (d) => [...d.kern.flatMap((g) => g.module), ...d.paket].map((m) => m.key);

test('Elektro: vollständig, kein Entwurf, QR auf die Branchenseite', () => {
  const d = baueDossier(ELEKTRO, new Date('2026-10-05T10:00:00Z'));
  assert.equal(d.entwurf, false);
  assert.deepEqual(d.luecken, []);
  assert.equal(d.zielgruppe, 'Elektrobetriebe');
  assert.equal(d.qrUrl, 'https://argonaut-os.com/branchen/elektriker');
  assert.equal(d.stand, 'Oktober 2026');
  assert.ok(d.paket.some((m) => m.key === 'pruefprotokolle'));
  assert.ok(d.paket.some((m) => m.key === 'aufmass'));
});

test('Nur Gebautes: Module in Aufbau nie als fertig, Kern nicht doppelt im Paket', () => {
  for (const b of [ELEKTRO, FRISEUR]) {
    const d = baueDossier(b);
    const keys = alleKeys(d);
    for (const k of IN_AUFBAU_MODULE) assert.ok(!keys.includes(k), k);
    assert.ok(d.paket.every((m) => !KERN_MODULE.includes(m.key)));
    for (const k of KERN_MODULE.filter((x) => !IN_AUFBAU_MODULE.has(x))) assert.ok(keys.includes(k), 'Kern fehlt: ' + k);
    // Paket 234 bewusst angepasst: in den 🟡-Bereichen fehlen Kasse und Shop absichtlich (lib/dossierFreigabe.ts)
    const weg = ['shop', 'kasse', 'wellness']; // Paket 237: Sport lässt „Gesundheit & Wellness“ weg
    for (const k of (KATEGORIE_MODULE[b.kategorie] ?? []).filter((x) => !KERN_MODULE.includes(x) && !(b === FRISEUR && weg.includes(x)))) assert.ok(keys.includes(k), 'Paket fehlt: ' + k);
    assert.equal(new Set(keys).size, keys.length, 'doppelt');
  }
});

test('Ohne geprüfte Branchentexte: Entwurf mit Lückenliste', () => {
  const d = baueDossier(FITNESS);
  assert.equal(d.entwurf, true);
  assert.equal(d.text, null);
  assert.match(d.luecken[0], /B11b/);
  const fremd = baueDossier({ slug: 'x', name: 'X', kategorie: 'Gibt es nicht' });
  assert.ok(fremd.luecken.some((l) => /kein Branchenpaket/.test(l)));
});

test('„In Vorbereitung" passt zur Branche', () => {
  // Paket 234 bewusst angepasst: Kasse steht nur in 🟡-Bereichen und wird dort weggelassen — also auch keine TSE-Zeile.
  // Der Eintrag bleibt vorbereitet und erscheint wieder, sobald OHNE_IN_TEILBEREICH geleert wird.
  const kasse = baueDossier(FRISEUR).vorbereitung.map((v) => v.was);
  assert.ok(!kasse.some((w) => /TSE/.test(w)));
  assert.ok(IN_VORBEREITUNG.some((v) => /TSE/.test(v.was) && v.wenn?.includes('kasse')));
  const elektro = baueDossier(ELEKTRO).vorbereitung.map((v) => v.was);
  assert.ok(!elektro.some((w) => /TSE/.test(w)));
  assert.ok(elektro.some((w) => /Großhändler/.test(w)));
  for (const v of baueDossier(ELEKTRO).vorbereitung) assert.ok(v.warum.length > 20, v.was);
});

test('Namen ohne Emoji, Stand, Übersicht', () => {
  assert.equal(ohneEmoji('📐 Aufmaß'), 'Aufmaß');
  assert.equal(modulName('leads'), 'Anfragen');
  assert.equal(modulName('aufmass'), 'Aufmaß');
  assert.equal(standText(new Date(2026, 0, 3)), 'Januar 2026');
  const s = dossierStand([ELEKTRO, FITNESS]);
  assert.equal(s.gesamt, 2); assert.equal(s.fertig, 1); assert.equal(s.entwurf, 1);
  assert.deepEqual(s.jeKategorie['Handwerk & Bau'], { gesamt: 1, fertig: 1, gesperrt: 0 });
});

test('Vertriebsregeln: geprüfte Texte ohne „KI-Agenten" und ohne Duzen', () => {
  for (const [slug, t] of Object.entries(FACH_TEXTE)) assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
  assert.ok(textVerstoesse('Unsere KI-Agenten helfen dir').length >= 2);
});

test('Verdrahtung: Wasserzeichen nur ohne geprüften Text, Route nur für Betreiber', () => {
  const h = lies('lib/fachdossierHtml.ts');
  // Paket 217: Martin gibt die Dossiers mit geprüften Branchentexten frei (06.10.2026)
  assert.match(h, /export const FREIGABE_ERTEILT = true;/);
  assert.match(h, /return d\.entwurf \|\| !!d\.gesperrt \|\| !FREIGABE_ERTEILT;/);
  assert.match(h, /ENTWURF – nicht zur Weitergabe/);
  // Martin 05.10.2026: kein „alles inklusive", kein Agentur-Kostenvergleich
  assert.doesNotMatch(h, /inklusive|kostet extra|10\.000|Agentur/i);
  assert.ok(textVerstoesse('Alles inklusive, kein Modul kostet extra').length >= 2);
  const r = lies('app/api/admin/fachdossier/route.ts');
  assert.match(r, /const \{ absage \} = await betreiberPruefung\(\);\n  if \(absage\) return absage;/);
  assert.match(r, /\^\[a-z0-9-\]\{1,80\}\$/);
});
