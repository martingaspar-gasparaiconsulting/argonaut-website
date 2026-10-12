// Paket 323 (11.10.2026): S4 Shop mehrsprachig — Sprachen, Oberfläche, Produkt-Texte, Freigabe
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SHOP_SPRACHEN, FREMD_SPRACHEN, TEXT_DE, TEXT_EN, TEXT_KEYS, platzhalter, saubereTexte, pruefeOberflaeche,
  oberflaecheFuer, darfAnbieten, angeboteneSprachen, waehleSprache, textHash, uebersetzungsStatus, produktText,
  freigabeFehler, zeileFuerSpeichern, uebersetzAuftrag, inPakete, dokumenteSortiert, dokSprachen,
} from '../out/shopSprachen.js';
import { uebersetzSystem, spracheFuer, mitRueckuebersetzung } from '../out/mehrsprachig.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('24 Sprachen wie im mehrsprachigen Team, 23 zum Übersetzen, alle auch in der Datenbank-Regel', () => {
  assert.equal(SHOP_SPRACHEN.length, 24);
  assert.equal(FREMD_SPRACHEN.length, 23);
  assert.ok(!FREMD_SPRACHEN.some((s) => s.code === 'de'));
  const sql = lies('supabase-sql/p323-shop-sprachen.sql');
  const liste = /sprache in \(([^)]+)\)/.exec(sql)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual([...liste].sort(), FREMD_SPRACHEN.map((s) => s.code).sort());
});

test('Englisch fest eingebaut: jeder Text da, Platzhalter genau wie im Deutschen', () => {
  assert.deepEqual(Object.keys(TEXT_EN).sort(), [...TEXT_KEYS].sort());
  assert.deepEqual(pruefeOberflaeche(TEXT_EN), []);
  for (const k of TEXT_KEYS) assert.equal(platzhalter(TEXT_EN[k]).join(' '), platzhalter(TEXT_DE[k]).join(' '), k);
  assert.match(TEXT_EN.bestellen, /obligation to pay/);
  assert.deepEqual(platzhalter(TEXT_DE.datenschutz), ['{/link}', '{link}']);
});

test('Oberfläche: unvollständig oder Platzhalter verändert -> keine Freigabe', () => {
  const halb = { ...TEXT_EN }; delete halb.bestellen;
  assert.match(pruefeOberflaeche(halb)[0], /1 Text fehlen/);
  const falsch = { ...TEXT_EN, auf_rechnung: 'Faktura (14 dni)' };
  assert.ok(pruefeOberflaeche(falsch).some((f) => f.includes('auf_rechnung')));
  assert.deepEqual(Object.keys(saubereTexte({ unbekannt: 'x', leer: ' ', sprache: '  Język  ' })), ['sprache']);
});

test('oberflaecheFuer: Deutsch und Englisch immer, andere nur freigegeben und vollständig', () => {
  assert.equal(oberflaecheFuer('de', null).bestellen, 'Zahlungspflichtig bestellen');
  assert.equal(oberflaecheFuer('en', null).bestellen, TEXT_EN.bestellen);
  // Englisch: eigene Änderung erst nach Freigabe, kaputte Platzhalter nie
  const eigen = { ...TEXT_EN, in_warenkorb: 'Into the basket', ab: 'from' };
  assert.equal(oberflaecheFuer('en', { sprache: 'en', texte: eigen, status: 'vorschlag' }).in_warenkorb, 'Add to cart');
  const fr = oberflaecheFuer('en', { sprache: 'en', texte: eigen, status: 'freigegeben' });
  assert.equal(fr.in_warenkorb, 'Into the basket');
  assert.equal(fr.ab, 'from {n}');
  const pl = { ...TEXT_EN, sprache: 'Język' };
  assert.equal(oberflaecheFuer('pl', { sprache: 'pl', texte: pl, status: 'vorschlag' }), null);
  assert.equal(oberflaecheFuer('pl', { sprache: 'pl', texte: pl, status: 'freigegeben' }).sprache, 'Język');
  assert.equal(oberflaecheFuer('pl', { sprache: 'pl', texte: { sprache: 'Język' }, status: 'freigegeben' }), null);
  assert.equal(oberflaecheFuer('xx', null), null);
});

test('Anbieten und Auswahl: nur freigegebene Sprachen, Deutsch immer, Browser-Sprache greift', () => {
  assert.equal(darfAnbieten('en', null), null);
  assert.match(darfAnbieten('fr', null), /freigeben/);
  const zeilen = [
    { sprache: 'en', aktiv: true, status: 'vorschlag', texte: {} },
    { sprache: 'fr', aktiv: true, status: 'vorschlag', texte: TEXT_EN },
    { sprache: 'tr', aktiv: true, status: 'freigegeben', texte: TEXT_EN },
    { sprache: 'pl', aktiv: false, status: 'freigegeben', texte: TEXT_EN },
  ];
  const an = angeboteneSprachen(zeilen);
  assert.deepEqual(an, ['de', 'en', 'tr']);
  assert.equal(waehleSprache('tr', 'en-US', an), 'tr');
  assert.equal(waehleSprache(null, 'fr-FR,en-US;q=0.8,de;q=0.5', an), 'en');
  assert.equal(waehleSprache('pl', 'pl-PL', an), 'de');
  assert.equal(waehleSprache(undefined, '', an), 'de');
});

test('Prüfsumme: gleicher Text gleich, geänderter Text -> veraltet -> Shop zeigt Deutsch', () => {
  const de = { name: 'Reiniger  Pro', beschreibung: 'Für Metall.\r\n5 l Kanister' };
  const h = textHash(de.name, de.beschreibung);
  assert.match(h, /^[0-9a-f]{8}$/);
  assert.equal(textHash('Reiniger Pro', 'Für Metall.\n5 l Kanister'), h);
  assert.notEqual(textHash('Reiniger Pro', 'Für Metall.\n10 l Kanister'), h);
  const z = { sprache: 'en', name: 'Cleaner Pro', beschreibung: 'For metal.\n5 l canister', quelle_hash: h, status: 'freigegeben' };
  assert.equal(uebersetzungsStatus(de, z), 'freigegeben');
  assert.deepEqual(produktText(de, z), { name: 'Cleaner Pro', beschreibung: 'For metal.\n5 l canister', uebersetzt: true });
  const neu = { ...de, beschreibung: 'Für Metall.\n10 l Kanister' };
  assert.equal(uebersetzungsStatus(neu, z), 'veraltet');
  assert.equal(produktText(neu, z).uebersetzt, false);
  assert.equal(produktText(neu, z).beschreibung, 'Für Metall.\n10 l Kanister');
  assert.equal(uebersetzungsStatus(de, { ...z, status: 'vorschlag' }), 'vorschlag');
  assert.equal(produktText(de, { ...z, status: 'vorschlag' }).name, 'Reiniger Pro');
  assert.equal(uebersetzungsStatus(de, null), 'fehlt');
});

test('Nie gemischt: fehlt die übersetzte Beschreibung, bleibt alles Deutsch', () => {
  const de = { name: 'Reiniger', beschreibung: 'Für Metall.' };
  const z = { sprache: 'en', name: 'Cleaner', beschreibung: '', quelle_hash: textHash(de.name, de.beschreibung), status: 'freigegeben' };
  assert.deepEqual(produktText(de, z), { name: 'Reiniger', beschreibung: 'Für Metall.', uebersetzt: false });
  assert.deepEqual(freigabeFehler(de, z), ['Die übersetzte Beschreibung fehlt.']);
  assert.deepEqual(freigabeFehler({ name: 'X', beschreibung: '' }, { name: 'Y', beschreibung: null }), []);
});

test('Speichern: gesäubert, Prüfsumme des aktuellen Deutsch, immer als Vorschlag', () => {
  const z = zeileFuerSpeichern('a1', 'fr', { name: 'Reiniger', beschreibung: null }, { name: '  Nettoyant   pro ', beschreibung: '', rueck_name: 'Reiniger Profi' });
  assert.deepEqual(z, { artikel_id: 'a1', sprache: 'fr', name: 'Nettoyant pro', beschreibung: null, rueck_name: 'Reiniger Profi', rueck_beschreibung: null, quelle_hash: textHash('Reiniger', null), status: 'vorschlag' });
});

test('Übersetzungs-Aufträge passen in die Grenzen von /api/uebersetzen', () => {
  const p = Array.from({ length: 23 }, (_, i) => ({ id: 'a' + i, name: 'Produkt ' + i, beschreibung: i % 2 ? 'Text ' + i : '' }));
  const pakete = inPakete(p);
  assert.deepEqual(pakete.map((x) => x.length), [10, 10, 3]);
  for (const pk of pakete) {
    const a = uebersetzAuftrag(pk);
    assert.ok(a.texte.length <= 20);
    assert.equal(a.texte.length, a.zuordnung.length);
  }
  const a = uebersetzAuftrag([{ id: 'x', name: 'N', beschreibung: 'B' }, { id: 'y', name: '', beschreibung: 'nur Text' }]);
  assert.deepEqual(a.zuordnung, [{ id: 'x', feld: 'name' }, { id: 'x', feld: 'beschreibung' }]);
  const lang = Array.from({ length: 4 }, (_, i) => ({ id: 'l' + i, name: 'N', beschreibung: 'x'.repeat(4000) }));
  assert.deepEqual(inPakete(lang).map((x) => x.length), [2, 2]);
});

test('Shop-Prompt: Platzhalter, Marken und Zahlen bleiben, Rückübersetzung wird verlangt', () => {
  const s = uebersetzSystem(spracheFuer('ar'), 'shop');
  assert.match(s, /\{n\}, \{summe\}, \{name\}, \{link\} und \{\/link\}/);
  assert.match(s, /CAS- und UN-Nummern/);
  assert.match(s, /9\. Gib zu jedem Text zusätzlich "rueck"/);
  assert.match(s, /"rueck"/);
  assert.ok(mitRueckuebersetzung('shop') && mitRueckuebersetzung('anweisung') && !mitRueckuebersetzung('chat'));
  assert.match(uebersetzSystem(spracheFuer('pl'), 'anweisung'), /8\. Gib zu jedem Text/);
  assert.doesNotMatch(uebersetzSystem(spracheFuer('pl'), 'chat'), /rueck/);
});

test('Dokumente: Kundensprache zuerst, dann Deutsch, Reihenfolge sonst stabil', () => {
  const d = [{ id: 1, sprache: 'de' }, { id: 2, sprache: 'fr' }, { id: 3, sprache: 'en' }, { id: 4, sprache: 'de' }];
  assert.deepEqual(dokumenteSortiert(d, 'en').map((x) => x.id), [3, 1, 4, 2]);
  assert.deepEqual(dokSprachen([{ sprache: 'en' }, { sprache: null }, { sprache: 'en' }]), ['de', 'en']);
});

test('Wächter im SQL: Freigabe nur Geschäftsleitung, Sprache nur mit freigegebenen Texten, kein Löschen für Mitarbeiter', () => {
  const sql = lies('supabase-sql/p323-shop-sprachen.sql');
  assert.match(sql, /if new\.status = 'freigegeben' and v_chef is not null/);
  assert.match(sql, /if new\.sprache <> 'en' and new\.status <> 'freigegeben' then\s+new\.aktiv := false;/);
  assert.doesNotMatch(sql, /p323_\w+ on public\.\w+ for delete/);
  const route = lies('app/api/uebersetzen/route.ts');
  assert.match(route, /body\.modus === 'shop' \? 'shop'/);
  assert.match(route, /leseUebersetzung\(roh, zuSenden\.length, mitRueck\)/);
});
