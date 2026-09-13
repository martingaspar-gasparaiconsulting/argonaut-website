import test from 'node:test';
import assert from 'node:assert/strict';
import { seiteHtml, BAUSTEIN_KATALOG } from '../out/webBloecke.js';

// ============================================================================
// Prüft die AUSGABE des Bausteins „Anmelde-Einblendung" — nicht nur die Regeln
// darunter. Ein Baustein, der im Editor gut aussieht und auf der Live-Seite
// nichts ausliefert, wäre bei grünen Logik-Tests nie aufgefallen.
// ============================================================================

const BLOCK = {
  typ: 'einblendung',
  titel: 'Nichts mehr verpassen',
  text: 'Einmal im Monat ein kurzer Brief.',
  knopf: 'Eintragen',
  nach_sekunden: 30,
  bei_verlassen: true,
  sperre_tage: 45,
};

const CI = { firma: 'Muster GmbH' };

function live(bloecke = [BLOCK]) {
  return seiteHtml({ titel: 'Test', bloecke }, CI, 2026, { oeffentlichId: 'abc123' });
}

test('der Baustein steht im Katalog für den Editor', () => {
  const e = BAUSTEIN_KATALOG.find((x) => x.typ === 'einblendung');
  assert.ok(e, 'Katalog-Eintrag fehlt — der Baustein wäre unauffindbar');
  assert.match(e.beschreibung, /Handy/);
});

test('auf der Live-Seite steht das Overlay versteckt im HTML', () => {
  const html = live();
  assert.match(html, /id="ao-pop"/);
  assert.match(html, /hidden/);
  assert.match(html, /data-sek="30"/);
  assert.match(html, /data-sperre="45"/);
  assert.match(html, /data-verlassen="1"/);
});

test('die Seiten-Kennung wird ins Formular gereicht', () => {
  assert.match(live(), /name="seite" value="abc123"/);
});

test('das Anzeige-Skript kommt nur mit dem Baustein', () => {
  assert.match(live(), /ao_einblendung_/);
  const ohne = seiteHtml({ titel: 'T', bloecke: [{ typ: 'cta', titel: 'X', knopf: 'Y' }] }, CI, 2026, { oeffentlichId: 'abc123' });
  assert.ok(!/ao_einblendung_/.test(ohne), 'ohne Baustein darf kein Skript in der Seite stehen');
});

test('im Editor erscheint eine normale Sektion statt eines Overlays', () => {
  const html = seiteHtml({ titel: 'T', bloecke: [BLOCK] }, CI, 2026, { editor: true });
  assert.ok(!/id="ao-pop"/.test(html), 'im Editor darf kein Overlay die Bearbeitung verdecken');
  assert.match(html, /ao-pop-hinweis/);
  assert.match(html, /30 Sekunden/);
});

test('das Skript läuft nicht im Editor', () => {
  const html = seiteHtml({ titel: 'T', bloecke: [BLOCK] }, CI, 2026, { editor: true });
  assert.ok(!/ao_einblendung_/.test(html));
});

test('die Anmeldung geht an dieselbe Route wie der Newsletter-Baustein', () => {
  assert.match(live(), /\/api\/oeffentlich\/web-newsletter/);
});

test('Titel und Text landen escaped in der Seite', () => {
  const html = live([{ ...BLOCK, titel: '<script>böse</script>' }]);
  assert.ok(!/<script>böse/.test(html), 'Titel muss escaped werden');
  assert.match(html, /&lt;script&gt;/);
});

test('die Einwilligung zur Datenschutzerklärung ist Pflicht im Formular', () => {
  const html = live();
  assert.match(html, /name="privacy"/);
  assert.match(html, /Datenschutzerkl/);
});

test('es gibt einen Schließen-Knopf und eine Spam-Falle', () => {
  const html = live();
  assert.match(html, /ao-pop-zu/);
  assert.match(html, /name="firma_hp"/);
});

test('auf schmalen Geräten wird die Einblendung zum Balken', () => {
  assert.match(live(), /@media\(max-width:639px\)/);
});

test('das Overlay kollidiert nicht mit dem normalen Newsletter-Baustein', () => {
  const html = live([
    { typ: 'newsletter', titel: 'Newsletter', text: 'Text', knopf: 'Anmelden' },
    BLOCK,
  ]);
  const news = (html.match(/id="ao-newsletter"/g) || []).length;
  const pop = (html.match(/id="ao-pop-form"/g) || []).length;
  assert.equal(news, 1, 'das Sektions-Formular bleibt einmalig');
  assert.equal(pop, 1, 'das Einblendungs-Formular hat eine eigene Kennung');
});
