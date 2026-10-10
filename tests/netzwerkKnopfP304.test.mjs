// Paket 304 (10.10.2026): N1b Netzwerk-Knöpfe in Projekt, Auftrag und Objektzeiten
// + Mitarbeiter erreichen das Betriebs-Netzwerk, sobald sie eines der Module haben.
// Claude-Befund: Vorher schickte der Pfad-Riegel jeden Mitarbeiter von /dashboard/netzwerk
// (auch aus der Glocke) auf „Mein Bereich“ — der Eintrag hatte weder Modul noch „immer“.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LAUFEND_STATUS, laufendJeBezug, knopfText, knopfLink } from '../out/netzwerk.js';
import { LAUFEND } from '../out/partnerNetzwerk.js';
import { NAV_LINKS, mitarbeiterDarf, sichtbareNavLinks, ALLE_MODUL_KEYS, MODUL_PFADE, pfadErlaubtFuerNutzerTyp } from '../out/rechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('Laufend = offen, angenommen, fertig (gleich wie lib/partnerNetzwerk und die Datenbank)', () => {
  assert.deepEqual([...LAUFEND_STATUS], LAUFEND);
  const z = laufendJeBezug([
    { bezug_typ: 'objekt', bezug_id: A, status: 'offen' },
    { bezug_typ: 'objekt', bezug_id: A, status: 'fertig' },
    { bezug_typ: 'objekt', bezug_id: A, status: 'beendet' },
    { bezug_typ: 'objekt', bezug_id: A, status: 'storniert' },
    { bezug_typ: 'objekt', bezug_id: A, status: 'abgelehnt' },
    { bezug_typ: 'objekt', bezug_id: B, status: 'angenommen' },
    { bezug_typ: 'projekt', bezug_id: B, status: 'offen' },
    { bezug_typ: 'objekt', bezug_id: 'kaputt', status: 'offen' },
  ], 'objekt');
  assert.deepEqual(z, { [A]: 2, [B]: 1 });
  assert.deepEqual(laufendJeBezug(null, 'projekt'), {});
});

test('Knopf: Text und Ziel', () => {
  assert.equal(knopfText(0), '🤝 An Partner geben');
  assert.equal(knopfText(3), '🤝 An Partner geben · 3 laufend');
  assert.equal(knopfText(2, true), '🤝 Partner · 2 laufend');
  assert.equal(knopfText(-1), '🤝 An Partner geben');
  assert.equal(knopfText(1.5), '🤝 An Partner geben');
  assert.equal(knopfText('4'), '🤝 An Partner geben');
  assert.equal(knopfLink('projekt', A), `/dashboard/netzwerk/bezug?typ=projekt&id=${A}`);
  assert.equal(knopfLink('auftrag', A), `/dashboard/netzwerk/bezug?typ=auftrag&id=${A}`);
  assert.equal(knopfLink('objekt', A), `/dashboard/netzwerk/bezug?typ=objekt&id=${A}`);
  assert.equal(knopfLink('objekt', 'x'), null);
  assert.equal(knopfLink('kfz_bestand', A), null);
});

test('Mitarbeiter: Betriebs-Netzwerk mit einem der Module — ohne fremde Pfade freizugeben', () => {
  for (const m of ['projekte', 'auftraege', 'objektzeiten', 'kfz']) {
    assert.equal(mitarbeiterDarf('/dashboard/netzwerk', [m]), true, m);
    assert.equal(mitarbeiterDarf('/dashboard/netzwerk/bezug', [m]), true, m);
    assert.ok(sichtbareNavLinks(false, new Set([m]), null).some((l) => l.href === '/dashboard/netzwerk'), m);
  }
  assert.equal(mitarbeiterDarf('/dashboard/netzwerk', []), false);
  assert.equal(mitarbeiterDarf('/dashboard/netzwerk', ['crm']), false);
  assert.ok(!sichtbareNavLinks(false, new Set(['crm']), null).some((l) => l.href === '/dashboard/netzwerk'));
  // vorher (ohne einesVon) war der Pfad für Mitarbeiter ganz zu
  assert.equal(mitarbeiterDarf('/dashboard/netzwerk', ['verleih', 'personal']), false);
  // Chef sieht es weiter immer
  assert.ok(sichtbareNavLinks(true, new Set(), null).some((l) => l.href === '/dashboard/netzwerk'));
  // kein eigener Modul-Schlüssel (taucht nicht in der Rechte-Liste auf)
  const e = NAV_LINKS.find((l) => l.href === '/dashboard/netzwerk');
  assert.equal(e.modul, undefined);
  assert.ok(!ALLE_MODUL_KEYS.includes('netzwerk'));
  for (const pf of Object.values(MODUL_PFADE)) assert.ok(!pf.includes('/dashboard/netzwerk'));
  // Sitz-Typ: self_service nie, standard ja
  assert.equal(pfadErlaubtFuerNutzerTyp('/dashboard/netzwerk', 'self_service'), false);
  assert.equal(pfadErlaubtFuerNutzerTyp('/dashboard/netzwerk', 'standard'), true);
  // einesVon nur mit echten Modul-Schlüsseln
  for (const l of NAV_LINKS.filter((x) => x.einesVon)) for (const k of l.einesVon) assert.ok(ALLE_MODUL_KEYS.includes(k), `${l.href}: ${k}`);
});

test('Knöpfe stehen in Projekt-Akte, Auftrags-Akte und Objektzeiten', () => {
  const p = lies('app/dashboard/projekte/[id]/page.tsx');
  assert.match(p, /<PartnerKnopf typ="projekt" id=\{projekt\.id\} \/>/);
  const a = lies('app/dashboard/auftraege/[id]/page.tsx');
  assert.match(a, /<PartnerKnopf typ="auftrag" id=\{id\} \/>/);
  const o = lies('app/dashboard/objektzeiten/page.tsx');
  assert.match(o, /usePartnerZaehler\('objekt'\)/);
  assert.match(o, /<PartnerKnopf typ="objekt" id=\{o\.id\} anzahl=\{partnerZahl\?\.\[o\.id\] \?\? 0\}/);
  const k = lies('app/dashboard/netzwerk/PartnerKnopf.tsx');
  assert.match(k, /\.eq\('owner_user_id', betrieb\)/, 'zählt nur Aufträge, die der eigene Betrieb vergeben hat');
  assert.match(k, /\.in\('status', \[\.\.\.LAUFEND_STATUS\]\)/);
});
