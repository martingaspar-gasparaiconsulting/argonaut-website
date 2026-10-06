// Paket 216 (06.10.2026): Start-Schalter + Widerrufsbutton nach § 356a BGB
import test from 'node:test';
import assert from 'node:assert/strict';
import { START_FREIGABE, startFrei, startSperrGrund, istFremdeHerkunft } from '../out/startSperre.js';
import { seiteHtml, widerrufSektion, widerrufSkript, webDiensteDerSeite } from '../out/webBloecke.js';
import { fussHtml } from '../out/webRecht.js';
import { eingangZeitBerlin } from '../out/shopWiderrufe.js';

const CI = { firma: 'Muster GmbH' };
const PRODUKTE = { typ: 'produkte', titel: 'Unser Shop' };

test('alle Start-Bereiche sind zum Verkaufsstart gesperrt', () => {
  for (const b of ['shop', 'kiBeraterFremd', 'fernhilfe', 'whatsappWerbung']) {
    assert.equal(START_FREIGABE[b], false, b);
    assert.equal(startFrei(b), false, b);
    assert.ok(startSperrGrund(b), b);
  }
});

test('Freigabe wirkt, unbekannte Bereiche bleiben gesperrt', () => {
  const frei = { shop: true, kiBeraterFremd: false, fernhilfe: false, whatsappWerbung: false };
  assert.equal(startFrei('shop', frei), true);
  assert.equal(startSperrGrund('shop', frei), null);
  assert.equal(startFrei('tippfehler', { tippfehler: true }), false);
  assert.ok(startSperrGrund(''));
  assert.ok(startSperrGrund(null));
});

test('fremde Herkunft wird erkannt, eigene nicht', () => {
  assert.equal(istFremdeHerkunft('', 'https://argonaut-os.com/api/x'), false);
  assert.equal(istFremdeHerkunft(null, 'https://argonaut-os.com/api/x'), false);
  assert.equal(istFremdeHerkunft('https://argonaut-os.com', 'https://argonaut-os.com/api/x'), false);
  assert.equal(istFremdeHerkunft('https://www.firma.de', 'https://argonaut-os.com/api/x'), true);
  assert.equal(istFremdeHerkunft('kaputt', 'https://argonaut-os.com/api/x'), true);
});

test('gesperrter Shop: Live-Seite ohne Warenkorb, ohne shop.js, ohne Widerrufsformular', () => {
  const html = seiteHtml({ titel: 'T', bloecke: [PRODUKTE] }, CI, 2026, { oeffentlichId: 'abc123' });
  assert.ok(!/\/shop\.js/.test(html), 'kein Warenkorb-Skript');
  assert.ok(!/class="ao-wk-bar"/.test(html), "kein Warenkorb");
  assert.ok(!/id="widerruf"/.test(html), 'kein Widerrufsformular ohne Bestellungen');
  assert.match(html, /Bestellungen nehmen wir bis dahin gern per Telefon oder E-Mail entgegen/);
});

test('gesperrter Shop: Datenschutz nennt keinen Shop', () => {
  assert.equal(webDiensteDerSeite([PRODUKTE]).shop, false);
});

test('Editor-Vorschau sagt, dass der Shop live geschlossen ist', () => {
  const html = seiteHtml({ titel: 'T', bloecke: [PRODUKTE] }, CI, 2026, { editor: true });
  assert.match(html, /bis zur rechtlichen Freigabe geschlossen/);
});

test('Widerruf § 356a: zwei Schritte mit den gesetzlichen Aufschriften', () => {
  const html = widerrufSektion('abc123');
  assert.match(html, />Vertrag widerrufen</);
  assert.match(html, /Widerruf best&auml;tigen/);
  assert.ok(html.indexOf('Vertrag widerrufen</button>') < html.indexOf('Widerruf best&auml;tigen'), 'erst „Vertrag widerrufen", dann bestätigen');
  assert.match(html, /<form[^>]*hidden/);
});

test('Widerruf: nur Name, Vertrag, E-Mail sind Pflicht — kein Häkchen davor', () => {
  const html = widerrufSektion('abc123');
  assert.ok(!/name="privacy"/.test(html), 'kein Pflicht-Häkchen');
  const pflicht = [...html.matchAll(/name="(\w+)"[^>]*required/g)].map((m) => m[1]).sort();
  assert.deepEqual(pflicht, ['email', 'name', 'ware']);
  const skript = widerrufSkript();
  assert.ok(!/privacy/.test(skript), 'Skript prüft kein Häkchen');
  assert.match(skript, /ao-widerruf-start/);
});

test('Fuß: Link heißt „Vertrag widerrufen"', () => {
  assert.match(fussHtml(CI, 2026, { widerruf: true }), /Vertrag widerrufen/);
  assert.ok(!/Vertrag widerrufen/.test(fussHtml(CI, 2026, {})));
});

test('Eingangsbestätigung: Datum und Uhrzeit in deutscher Zeit', () => {
  assert.equal(eingangZeitBerlin('2026-10-06T07:14:00Z'), '06.10.2026, 09:14 Uhr');
  assert.equal(eingangZeitBerlin('2026-01-15T23:30:00Z'), '16.01.2026, 00:30 Uhr');
  assert.equal(eingangZeitBerlin('quatsch'), '');
});
