// Paket 301 (10.10.2026): Unterseiten im Menü erben das Modul der Elternseite.
// Befund (Martin, Valtier Automobile): „🪙 Trinkgeld-Verteilung“ und „🏁 Trackday & Kartbahn“ standen im Menü,
// ein Klick landete wieder auf der Startseite — das Menü hielt Unterseiten ohne eigenen Modul-Schlüssel für „Infra“,
// der Pfad-Riegel ordnete sie aber dem (nicht gebuchten) Eltern-Modul zu. Betraf rund 50 Unterseiten in allen Branchen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV_LINKS, navModul, sichtbareNavLinks, pfadPasst } from '../out/rechte.js';
import { nurGebuchteLinks, pfadGebucht, modulKeyFuerPfad } from '../out/tenantModule.js';
import { nurStandortAktiveLinks } from '../out/standortModule.js';
import { kategorieModule, KATEGORIE_MODULE } from '../out/branchenkatalog.js';

const href = (l) => l.href;

test('Unterseiten erben das Modul der Elternseite (wie der Pfad-Riegel)', () => {
  assert.equal(navModul({ href: '/dashboard/gastro/trinkgeld' }), 'gastro');
  assert.equal(navModul({ href: '/dashboard/veranstaltungen/motorsport' }), 'veranstaltungen');
  assert.equal(navModul({ href: '/dashboard/veranstaltungen/motorsport/teile' }), 'veranstaltungen');
  assert.equal(navModul({ href: '/dashboard/kfz/bestand' }), 'kfz');
  assert.equal(navModul({ href: '/dashboard/einstellungen' }), undefined, 'Infra bleibt Infra');
  for (const l of NAV_LINKS) assert.equal(navModul(l), modulKeyFuerPfad(l.href) ?? navModul(l), l.href);
  const geerbt = NAV_LINKS.filter((l) => !l.modul && navModul(l));
  assert.ok(geerbt.length >= 40, `Unterseiten: ${geerbt.length}`);
});

test('Jede Branche: was im Menü steht, lässt sich auch öffnen — kein Klick führt zurück auf die Startseite', () => {
  const kategorien = Object.keys(KATEGORIE_MODULE);
  assert.ok(kategorien.length >= 19);
  for (const kat of kategorien) {
    const gebucht = new Set(kategorieModule(kat));
    const menue = nurGebuchteLinks(sichtbareNavLinks(true, new Set(), null), gebucht);
    for (const l of menue) assert.ok(pfadGebucht(l.href, gebucht), `${kat}: ${l.label} (${l.href}) im Menü, aber gesperrt`);
  }
  const kfz = new Set(kategorieModule('Fahrzeuge & Mobilität'));
  const menue = nurGebuchteLinks(sichtbareNavLinks(true, new Set(), null), kfz).map(href);
  assert.ok(!menue.includes('/dashboard/gastro/trinkgeld'), 'Trinkgeld nicht beim Autohaus');
  if (!kfz.has('veranstaltungen')) assert.ok(!menue.includes('/dashboard/veranstaltungen/motorsport'), 'Trackday nur mit Veranstaltungen');
  assert.ok(menue.includes('/dashboard/kfz/bestand') && menue.includes('/dashboard/kfz/chef'), 'Kfz-Unterseiten bleiben');
  const gastro = new Set(kategorieModule('Gastronomie, Hotellerie & Tourismus'));
  assert.ok(nurGebuchteLinks(sichtbareNavLinks(true, new Set(), null), gastro).map(href).includes('/dashboard/gastro/trinkgeld'), 'Gastro sieht Trinkgeld');
});

test('Mitarbeiter sehen Unterseiten, wenn sie das Eltern-Modul dürfen — sonst nicht', () => {
  const mit = sichtbareNavLinks(false, new Set(['kfz']), null).map(href);
  assert.ok(mit.includes('/dashboard/kfz/bestand') && mit.includes('/dashboard/kfz/verkauf'));
  assert.ok(!mit.includes('/dashboard/gastro/trinkgeld'));
  const ohne = sichtbareNavLinks(false, new Set(), null).map(href);
  assert.ok(!ohne.includes('/dashboard/kfz/bestand'));
  // nur-Chef-Einträge bleiben dem Chef vorbehalten
  for (const l of NAV_LINKS.filter((x) => x.nurChef)) assert.ok(!mit.includes(l.href) || l.immer, l.href);
});

test('Starter-Modus und Standort: ausgeblendetes Eltern-Modul blendet auch die Unterseiten aus', () => {
  const chefOhneGastro = sichtbareNavLinks(true, new Set(), new Set(['kfz'])).map(href);
  assert.ok(!chefOhneGastro.includes('/dashboard/gastro/trinkgeld'));
  assert.ok(chefOhneGastro.includes('/dashboard/kfz/bestand'));
  const links = NAV_LINKS.filter((l) => pfadPasst(l.href, '/dashboard/kfz'));
  assert.equal(nurStandortAktiveLinks(links, new Set(['kfz'])).length, 0, 'am Standort abgeschaltet → auch Unterseiten weg');
  assert.equal(nurStandortAktiveLinks(links, null).length, links.length, 'fail-open');
});

test('Kein Link ins Leere: jeder Pfad /dashboard/… im Code hat eine Seite', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const dateien = [];
  const lauf = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') lauf(p); } else if (/\.(tsx?|mjs)$/.test(e.name)) dateien.push(p); } };
  lauf(path.join(WURZEL, 'app')); lauf(path.join(WURZEL, 'lib'));
  const seiten = new Set(dateien.filter((d) => /[\\/](page\.tsx|route\.ts)$/.test(d)).map((d) => '/' + path.relative(path.join(WURZEL, 'app'), path.dirname(d)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join('/')));
  const gibt = (h) => {
    const p = h.split(/[?#]/)[0].replace(/\/$/, '');
    if (seiten.has(p)) return true;
    const t = p.split('/');
    return [...seiten].some((s) => { const u = s.split('/'); return u.length === t.length && u.every((x, i) => x === t[i] || x.startsWith('[')); });
  };
  // Muster, Platzhalter und Beispiele in Kommentaren
  const AUSNAHMEN = new Set(['/dashboard/:pfad*', '/dashboard/...', '/dashboard/…', '/dashboard/angebote/neu', '/dashboard/holzhandel', '/dashboard/api']);
  const tot = [];
  for (const d of dateien) {
    const s = fs.readFileSync(d, 'utf8');
    for (const m of s.matchAll(/[`'"](\/dashboard\/[^`'"\s]*)[`'"]/g)) {
      const h = m[1].replace(/\$\{[^}]*\}/g, 'X');
      if (!AUSNAHMEN.has(h) && !gibt(h)) tot.push(`${path.relative(WURZEL, d)}: ${h}`);
    }
  }
  assert.deepEqual(tot, []);
});
