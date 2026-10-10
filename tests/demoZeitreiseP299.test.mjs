// Paket 299 (10.10.2026): Zeitreise-Vorführung — leeres Konto, erste Monate, nach 18 Monaten —
// und der feste Platz der Vorführ-Betriebe im Command Center.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ZEITREISE, zeitreiseKarten, zeitreiseSlugs, KUNDEN_LOGIN } from '../out/demoZeitreise.js';
import { DEMO_BETRIEBE, demoBetrieb } from '../out/demoBetriebe.js';
import { FACHDATEN } from '../out/demoFachdatenKfz.js';
import { pruefzifferDe } from '../out/ustIdNr.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Kfz-Zeitreise: drei Stufen vom leeren Konto bis zum vollen Betrieb, jede mit eigenem Login', () => {
  const kfz = ZEITREISE.find((r) => r.key === 'kfz');
  assert.ok(kfz);
  assert.deepEqual(zeitreiseSlugs(kfz), ['kfzstart', 'autohaus', 'premium']);
  const karten = zeitreiseKarten(kfz);
  assert.equal(karten.length, 3);
  assert.deepEqual(karten.map((k) => k.nr), [1, 2, 3]);
  assert.deepEqual(karten.map((k) => k.email), ['kfzstart@demo.argonaut-os.com', 'autohaus@demo.argonaut-os.com', 'premium@demo.argonaut-os.com']);
  assert.deepEqual(karten.map((k) => k.passwort), ['kfzstart2026', 'autohaus2026', 'premium2026']);
  // Datenmenge wächst von Stufe zu Stufe: leer → Fachdaten klein → Fachdaten groß
  assert.equal(FACHDATEN.kfzstart, undefined);
  assert.ok(FACHDATEN.autohaus.seeder.length > 0 && FACHDATEN.premium.seeder.length >= FACHDATEN.autohaus.seeder.length);
  assert.equal(KUNDEN_LOGIN, '/auth/login');
});

test('Jede Stufe jeder Reihe ist ein echter Vorführ-Betrieb derselben Branche; nur Stufe 1 ist leer', () => {
  for (const r of ZEITREISE) {
    const kat = new Set();
    r.stufen.forEach((s, i) => {
      const b = demoBetrieb(s.slug);
      assert.ok(b, `${r.key}: ${s.slug} fehlt in DEMO_BETRIEBE`);
      kat.add(b.kategorie);
      assert.equal(!!b.leer, i === 0, `${s.slug}: nur die erste Stufe ist leer`);
      assert.ok(s.titel && s.zeigt.length > 20);
    });
    assert.equal(kat.size, 1, `${r.key}: alle Stufen in einer Kategorie`);
  }
  const start = demoBetrieb('kfzstart');
  assert.equal(start.ziel, 0, 'Startstrecke bei 0 %');
  // P300: leer sind nur die Stufe-1-Konten der Zeitreise — nie ein Grund-Betrieb
  assert.ok(DEMO_BETRIEBE.filter((b) => b.leer).every((b) => b.zeitreise && b.ziel === 0));
  assert.ok(DEMO_BETRIEBE.filter((b) => b.leer).some((b) => b.slug === 'kfzstart'));
});

test('Stammdaten aller Vorführ-Betriebe: gültige, eindeutige IBAN und USt-IdNr., eindeutige Slugs', () => {
  const n = DEMO_BETRIEBE.length;
  assert.ok(n >= 23);
  assert.equal(new Set(DEMO_BETRIEBE.map((b) => b.slug)).size, n);
  assert.equal(new Set(DEMO_BETRIEBE.map((b) => b.iban)).size, n);
  assert.equal(new Set(DEMO_BETRIEBE.map((b) => b.ustId)).size, n);
  for (const b of DEMO_BETRIEBE) {
    assert.match(b.slug, /^[a-z0-9]+$/, 'kleingeschrieben für die Bildschirmtastatur');
    const u = (b.iban.slice(4) + b.iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    let rest = 0; for (const c of u) rest = (rest * 10 + Number(c)) % 97;
    assert.equal(rest, 1, `${b.slug} IBAN`);
    let p = 10;
    for (const c of b.ustId.slice(2, 10)) { let s = (+c + p) % 10; if (s === 0) s = 10; p = (2 * s) % 11; }
    let pz = 11 - p; if (pz === 10) pz = 0;
    assert.equal(String(pz), b.ustId.slice(10), `${b.slug} USt-IdNr.`);
    // dieselbe Prüfung, die ARGONAUT bei den Firmendaten macht — sonst warnt sie mitten in der Vorführung
    assert.equal(pruefzifferDe(b.ustId.slice(2)), true, `${b.slug} USt-IdNr. (lib/ustIdNr)`);
  }
});

test('Route: leeres Konto ohne Übungswelt, ohne Fachdaten, ohne Bank- und Steuerdaten', () => {
  const r = lies('app/api/admin/demo-betriebe/route.ts');
  assert.ok(r.includes('if (!b.leer) {\n        const w = await weltLaden('), 'Übungswelt nur für volle Betriebe');
  const block = r.slice(r.indexOf('if (b.leer) {'), r.indexOf('const { data: upd, error: updErr }'));
  for (const f of ['firma_iban', 'sepa_iban', 'firma_ust_id', 'firma_steuernummer', 'firma_strasse']) assert.ok(block.includes(`'${f}'`), f);
  assert.ok(r.indexOf('if (b.leer) {') < r.indexOf("await admin.from('profiles').update(felder)"), 'vor dem Schreiben geleert');
  assert.ok(r.includes('const gesperrt = await adminGuard();'));
});

test('Command Center: Vorführung als großer Block oben und als Kachel; Seite zeigt die Zeitreise', () => {
  const cc = lies('app/admin/command-center/page.tsx');
  assert.equal(cc.split('href="/admin/demo-betriebe"').length - 1, 1, 'großer Block');
  assert.ok(cc.includes("href: '/admin/demo-betriebe'"), 'Kachel');
  assert.ok(cc.indexOf('🎬 Vorführ-Betriebe & Zeitreise') < cc.indexOf('<CtaModusSchalter'), 'oben, direkt unter den Kennzahlen');
  const seite = lies('app/admin/demo-betriebe/page.tsx');
  assert.ok(seite.includes('ZEITREISE.map((reihe)'));
  assert.ok(seite.includes('anlegen(zeitreiseSlugs(reihe))'));
  assert.ok(seite.includes('href={KUNDEN_LOGIN} target="_blank" rel="noopener noreferrer"'));
  assert.ok(seite.indexOf('Zeitreise: So wächst ARGONAUT') < seite.indexOf('Alle Vorführ-Betriebe'), 'Zeitreise zuerst');
});
