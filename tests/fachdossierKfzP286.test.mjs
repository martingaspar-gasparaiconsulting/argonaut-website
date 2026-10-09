// Paket 286 (09.10.2026): K17b Kfz-Fachdossier — Kfz-Handel nach dem Kfz-Pilot K1–K18 neu, Zusatzseite „Ihr Fachpaket"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const KAT = 'Fahrzeuge & Mobilität';
const t = FACH_TEXTE['kfz-handel'];

test('Kfz-Handel: vollständig nach dem Richtwert, kein Entwurf, Zusatzseite 4 x 4 + 3 Partner', () => {
  assert.ok(t);
  assert.equal(t.vorteile.length, 6);
  assert.equal(t.alltag.length, 6);
  assert.equal(t.ablauf.length, 5);
  assert.equal(t.schwerpunkt?.punkte.length, 4);
  assert.equal(t.geprueftAm, '2026-10-09');
  const f = t.fachseite;
  assert.ok(f, 'fachseite');
  assert.equal(f.gruppen.length, 4);
  for (const g of f.gruppen) assert.equal(g.punkte.length, 4, g.titel);
  assert.equal(f.partner.length, 3);
  assert.ok(f.band?.titel && f.band?.text, 'Band');
  assert.equal('vorbereitung' in f, false, 'Regel P217: im Dossier steht nur, was es gibt');
  const d = baueDossier({ slug: 'kfz-handel', name: 'KFZ-Handel', kategorie: KAT });
  assert.equal(d.entwurf, false);
  assert.equal(d.gesperrt, null);
  assert.ok(d.paket.some((m) => m.key === 'kfz'), 'Fachpaket Kfz im Paket');
});

test('Kfz-Handel: Vertriebsregeln und Kfz-Vorsicht, keine Mitbewerber', () => {
  const s = JSON.stringify(t);
  assert.deepEqual(textVerstoesse(s), []);
  for (const r of [/Schaden/i, /Versicher/i, /Haftung/i, /verwert/i, /GwG/i, /Gutacht/i, /Kalkulator/i, /Aufmaß/i, /Kasse/i,
    /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /Leasing/i, /rechtssicher/i, /garantiert/i, /§/])
    assert.ok(!r.test(s), r.source);
  assert.ok(!/\d+\s*(%|Prozent)/.test(s), 'Prozent');
  // Händler-Programme aus der Altsystem-Liste sind Mitbewerber — nie im Dossier
  for (const r of [/locosoft/i, /werbas/i, /keyloop/i, /incadea/i, /autoscout/i, /mobile\.de-Export/i]) assert.ok(!r.test(s), r.source);
  // Partner nur über das eigene Konto
  assert.match(JSON.stringify(t.fachseite.partner), /eigenen (Händler-)?Konto/);
});

test('Nur Gebautes: jede genannte Handelsfunktion hat ihre Seite im Dashboard', () => {
  for (const seite of ['ankauf', 'bestand', 'anfragen', 'probefahrt', 'verkauf', 'tresor', 'preise', 'chef', 'partner'])
    assert.ok(fs.existsSync(path.join(WURZEL, 'app/dashboard/kfz', seite, 'page.tsx')), seite);
  for (const datei of ['lib/kfzBoerse.ts', 'lib/kfzFinanzierung.ts', 'lib/kfzKaufstatus.ts', 'lib/kfzImport.ts', 'lib/kfzMarkt.ts',
    'lib/kfzRechnung.ts', 'lib/partnerRechnung.ts', 'lib/kfzBewertung.ts', 'lib/partnerAnbindung.ts', 'lib/musterbetriebXxlBranchen.ts'])
    assert.ok(fs.existsSync(path.join(WURZEL, datei)), datei);
  // „Verkaufschancen mit Prognose" usw. aus dem alten Text sind raus, die Handelsakte steht drin
  assert.match(JSON.stringify(t), /Fahrzeugbörse/);
  assert.match(JSON.stringify(t), /Differenzbesteuerung/);
});

test('Zusatzseite nur bei Branchen mit fachseite; andere Dossiers unverändert', () => {
  const mit = Object.entries(FACH_TEXTE).filter(([, v]) => v.fachseite).map(([k]) => k);
  assert.deepEqual(mit, ['kfz-handel']);
  const h = lies('lib/fachdossierHtml.ts');
  assert.match(h, /if \(t\?\.fachseite\)/);
  assert.match(h, /Partner über Ihr eigenes Konto/);
  assert.match(h, /esc\(f\.band\.titel\)/);
  assert.doesNotMatch(h, /Was wir gerade noch bauen/);
  assert.match(h, /Alle beschriebenen Funktionen sind gebaut\./);
});

test('HTML: Kfz-Dossier hat eine Seite mehr als Elektro', async () => {
  const m = await import('../out/fachdossierHtml.js').catch(() => null);
  if (!m?.fachdossierHtml) return; // braucht qrcode — dann prüft der Quelltext-Test oben
  const kfz = await m.fachdossierHtml(baueDossier({ slug: 'kfz-handel', name: 'KFZ-Handel', kategorie: KAT }));
  const el = await m.fachdossierHtml(baueDossier({ slug: 'elektriker', name: 'Elektriker', kategorie: 'Handwerk & Bau' }));
  const seiten = (h) => (h.match(/<section class="seite/g) ?? []).length;
  assert.equal(seiten(kfz), seiten(el) + 1);
  assert.match(kfz, /Ihr Fahrzeughandel im Detail\./);
  assert.match(kfz, /carVertical/);
  assert.doesNotMatch(el, /Ihr Fachpaket/);
});
