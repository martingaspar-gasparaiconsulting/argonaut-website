// Paket 246 (06.10.2026): Fachdossiers Marketing, Medien & Kreativ Welle 2
// Zurückgestellt (zusätzlich zu P230): Promotion/Dialogmarketing (Werbeanrufe, UWG), Marktforschung (Personendaten),
// Casting (Minderjährige), Künstler-Booking, Musikbranche/Verlage (Rechteverwertung) — später einzeln prüfen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Marketing, Medien & Kreativ';
const WELLE = ['unternehmenskommunikation', 'seo-agentur', 'sea-performance-marketing', 'e-commerce-agentur', 'content-marketing-agentur',
  'podcast-produktion', 'branding-corporate-design', 'ux-ui-design-studio', 'motion-design-animation', '3d-architekturvisualisierung'];
// Vorsicht Kreativ (wie P230) + keine Ranking-/Umsatzversprechen, keine Plattform-Marken
const VORSICHT = [/Nutzungsrecht/i, /Urheber/i, /Lizenzvertrag/i, /automatisch veröffentlich/i, /direkt posten/i, /Reichweite garantiert/i,
  /mehr Follower/i, /Influencer/i, /Klicks? steigern/i, /Platz eins|erste Seite|Top-Platz/i, /mehr Umsatz/i, /ROAS|Conversion/i,
  /Google|Meta|Facebook|Instagram|TikTok|LinkedIn|Spotify|Apple/, /garantiert/i, /Garantie/i, /Haftung/i];
const NICHT = [/Kasse/i, /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /Kalkulator/i, /Veranstaltungs-Modul/i];

test('Kreativ Welle 2: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE) {
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    const d = baueDossier({ slug, name: slug, kategorie: KAT });
    assert.equal(d.entwurf, false, slug);
    assert.equal(d.gesperrt, null, slug);
  }
});

test('Kreativ-Vorsicht: keine Rechte-, Ranking- oder Erfolgsversprechen, keine Plattform-Marken, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['influencer-marketing-agentur', 'modelagentur', 'promotion-dialogmarketing', 'marktforschungsinstitut', 'castingagentur'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 287);
});
