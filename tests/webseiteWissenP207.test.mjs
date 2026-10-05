// ============================================================================
// tests/webseiteWissenP207.test.mjs — Paket 207 (Stufe 3 · B3 Website-Texte aus Firmenwissen)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { wissensSuche, leistungenText, wissensAuszug, quellenHinweis, ohneErfundeneBewertungen, MAX_LEISTUNGEN } from '../out/webseiteWissen.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Suche und Leistungen ohne Preise, gruppiert, ohne Doppelte', () => {
  assert.match(wissensSuche('webseite', 'Elektriker'), /^Elektriker webseite Leistungen/);
  const l = leistungenText([
    { bezeichnung: 'Zählerschrank tauschen', kategorie: 'Elektro' },
    { bezeichnung: 'zählerschrank tauschen', kategorie: 'Elektro' },
    { bezeichnung: 'Wallbox', kategorie: 'Elektro' },
    { bezeichnung: 'Alt', aktiv: false },
    { bezeichnung: 'Beratung' },
    { bezeichnung: '' },
  ]);
  assert.equal(l.anzahl, 3);
  assert.equal(l.text, 'Elektro: Zählerschrank tauschen; Wallbox\nAllgemein: Beratung');
  const viele = leistungenText(Array.from({ length: 50 }, (_, i) => ({ bezeichnung: 'L' + i })));
  assert.equal(viele.anzahl, MAX_LEISTUNGEN);
  assert.deepEqual(leistungenText(null), { text: '', anzahl: 0 });
});

test('Firmen-Dokumente: vertrauliche nie, Deckel, Quellen', () => {
  const namen = { a: 'Leistungsbeschreibung.pdf', b: 'Arbeitsvertrag Meier.pdf', c: 'Gehaltsliste 2026.xlsx', d: 'Firmenprofil.docx' };
  const a = wissensAuszug([
    { document_id: 'a', content: 'Wir bauen PV-Anlagen.' },
    { document_id: 'b', content: 'Gehalt 4.000 Euro' },
    { document_id: 'c', content: 'Meier 4.000' },
    { document_id: 'a', content: 'Wir bauen PV-Anlagen.' },
    { document_id: 'd', content: 'Seit 1990 in Böblingen.' },
  ], namen);
  assert.deepEqual(a.quellen, ['Leistungsbeschreibung.pdf', 'Firmenprofil.docx']);
  assert.deepEqual(a.ausgelassen, ['Arbeitsvertrag Meier.pdf', 'Gehaltsliste 2026.xlsx']);
  assert.doesNotMatch(a.text, /Gehalt|Meier/);
  assert.match(a.text, /\[Leistungsbeschreibung\.pdf\]\nWir bauen PV-Anlagen\./);
  const lang = wissensAuszug(Array.from({ length: 20 }, (_, i) => ({ document_id: 'a', content: 'x'.repeat(1000) + i })), namen, 3000);
  assert.ok(lang.text.length <= 3000);
});

test('Rückmeldung nennt Quellen und Ausgelassenes', () => {
  const t = quellenHinweis({ leistungen: 12, quellen: ['A.pdf'], ausgelassen: ['Vertrag.pdf'], wissenGenutzt: true });
  assert.match(t, /12 Leistungen aus dem Leistungskatalog/);
  assert.match(t, /1 Firmen-Dokument \(A\.pdf\)/);
  assert.match(t, /1 vertraulich klingendes Dokument wurde bewusst nicht verwendet/);
  assert.match(t, /vor dem Veröffentlichen/);
  assert.match(quellenHinweis({ leistungen: 0, quellen: [], ausgelassen: [], wissenGenutzt: false }), /Firmenwissen war ausgeschaltet/);
});

test('Keine erfundenen Kundenstimmen — nur Live-Bewertungen, höchstens einmal', () => {
  const aus = ohneErfundeneBewertungen([
    { typ: 'hero', titel: 'H' },
    { typ: 'testimonials', eyebrow: 'Stimmen', titel: 'Kunden sagen', stimmen: [{ text: 'Toll', name: 'Zufriedener Kunde', rolle: 'Beispiel-Bewertung' }] },
    { typ: 'bewertungen', titel: 'Noch mal' },
    { typ: 'kontakt', titel: 'K' },
  ]);
  assert.deepEqual(aus, [
    { typ: 'hero', titel: 'H' },
    { typ: 'bewertungen', eyebrow: 'Stimmen', titel: 'Kunden sagen' },
    { typ: 'kontakt', titel: 'K' },
  ]);
});

test('Verdrahtung: KI-Route und Seite', () => {
  const r = lies('app/api/webseite-ki/route.ts');
  assert.doesNotMatch(r, /'testimonials'/, 'KI erzeugt keine Kundenstimmen mehr');
  assert.match(r, /ohneErfundeneBewertungen\(normalisiere\(/);
  assert.match(r, /wissensAuszug\(treffer\.filter/);
  assert.match(r, /from\('leistungskatalog'\)\.select\('bezeichnung, kategorie'\)\.eq\('owner_user_id', user\.id\)/);
  assert.match(r, /from\('documents'\)\.select\('id, file_name'\)\.eq\('user_id', user\.id\)/, 'nur eigene Dokumente');
  assert.match(r, /NIE Kunden- oder Mitarbeiternamen/);
  const seite = lies('app/dashboard/webseiten/page.tsx');
  assert.match(seite, /JSON\.stringify\(\{ zweck, story, wissen \}\)/);
});
