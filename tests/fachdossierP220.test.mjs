// Paket 220 (06.10.2026): Handwerk-Dossiers Welle 4 und 5 — Handwerk komplett
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const WELLE45 = ['strassen-tiefbau', 'waermedaemmung-isoliertechnik', 'ofen-luftheizungsbau', 'steinmetz-steinbildhauer',
  'aufzugsbau-wartung', 'blitzschutz-erdungsanlagen', 'bautrocknung-leckortung', 'bauwerksabdichtung-fugentechnik',
  'betonsanierung-instandsetzung', 'holzschutz-bautenschutz', 'abbruch-rueckbau', 'brunnenbau-bohrtechnik', 'fertighaus-modulbau',
  'stahl-hallenbau', 'schweisserei', 'bewehrung-eisenflechterei', 'feinwerkmechanik', 'schwimmbadtechnik', 'architekten', 'ingenieurbueros'];
// Bewusst zurückgestellt (Gesundheitsdaten / Krankenkassen-Abrechnung)
const ZURUECK = ['zahntechniker', 'orthopaedie-schuhmacher'];

test('Welle 4 und 5: zwanzig Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE45) {
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    assert.equal(baueDossier({ slug, name: slug, kategorie: 'Handwerk & Bau' }).entwurf, false, slug);
  }
});

test('Handwerk komplett: 50 Branchen mit Text, die zwei Gesundheits-Gewerke bewusst nicht', () => {
  assert.equal(Object.keys(FACH_TEXTE).length, 50);
  for (const s of ZURUECK) assert.equal(FACH_TEXTE[s], undefined, s);
});

test('Titel passen auf die Titelseite (höchstens 36 Zeichen vor „Ein System.")', () => {
  for (const [slug, t] of Object.entries(FACH_TEXTE)) {
    const kopf = t.titel.replace(/\s*Ein System\.$/, '');
    assert.ok(kopf.length <= 36, slug + ': ' + kopf);
  }
});
