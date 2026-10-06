// Paket 250 (07.10.2026): Fachdossiers Marketing, Medien & Kreativ Welle 3
// Weiter zurückgestellt: Influencer-Agentur, Modelagentur (P230), Promotion/Dialogmarketing, Marktforschung, Casting (P246),
// dazu Verlage und Musikbranche (Rechteverwertung), Content-Creator (Werbekennzeichnung), Spieleentwicklung (Jugendschutz),
// Künstler-Booking (Vermittlung). Noch frei: kuenstler, messe-ausstellungen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Marketing, Medien & Kreativ';
const WELLE = ['film-tv', 'musikproduktion', 'tonstudio', 'synchron-sprecherstudio', 'lektorat-korrektorat',
  'illustration-illustrationsstudio', 'redaktionsbuero-freie-journalisten', 'verpackungsdesign', 'employer-branding-agentur', 'ladenbau'];
// Vorsicht Kreativ (wie P230/P246) + keine Rechte-, Förder-, Presse- oder Bewerberaussagen
const VORSICHT = [/Nutzungsrecht/i, /Urheber/i, /Lizenz/i, /automatisch veröffentlich/i, /direkt posten/i, /Reichweite/i,
  /mehr Follower/i, /Influencer/i, /Klicks? steigern/i, /Platz eins|erste Seite|Top-Platz/i, /mehr Umsatz/i, /ROAS|Conversion/i,
  /Google|Meta|Facebook|Instagram|TikTok|LinkedIn|Spotify|Apple|YouTube/, /garantiert/i, /Garantie/i, /Haftung/i,
  /GEMA|GVL|VG Wort|Künstlersozial|KSK/, /Förder/i, /Presserecht/i, /Bewerber/i, /Verpackungsgesetz|Kennzeichnungspflicht/i,
  /Brandschutz|DIN/, /Jugendschutz|FSK|USK/];
// Nur Paket-Module der Kreativ-Gruppe bzw. Kern
const NICHT = [/Kasse/i, /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /Kalkulator/i, /Aufmaß/i, /Wartung/i,
  /Gutscheine/i, /Restwert/i, /Räume und Ressourcen/i, /Belegung/i];

test('Kreativ Welle 3: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE) {
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.ok(t.titel.length <= 36, slug + ': Titel zu lang');
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    const d = baueDossier({ slug, name: slug, kategorie: KAT });
    assert.equal(d.entwurf, false, slug);
    assert.equal(d.gesperrt, null, slug);
  }
});

test('Kreativ-Vorsicht W3: keine Rechte-, Reichweiten- oder Förderaussagen, nur vorhandene Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['influencer-marketing-agentur', 'modelagentur', 'castingagentur', 'marktforschungsinstitut', 'promotion-dialogmarketing',
    'verlage', 'musikbranche', 'content-creator-influencer', 'spieleentwicklung', 'kuenstler-bookingagentur'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 327);
});
