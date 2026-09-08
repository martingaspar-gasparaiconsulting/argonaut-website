import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKE_PRIMAER_STANDARD, MARKE_AKZENT_STANDARD, CI_SPALTEN,
  istFarbe, farbeOderStandard, logoOderLeer, lesbarerText, baueMarke,
} from '../out/markeCi.js';

// ============================================================================
// Diese Tests halten fest, was das Rechnungs-PDF ab dem 08.09.26 schützt.
// Vorher ging der Inhalt der CI-Felder ungeprüft in <style> und <img src>.
// ============================================================================

test('nur echte Hex-Farben gelten als Farbe', () => {
  assert.equal(istFarbe('#0A1628'), true);
  assert.equal(istFarbe('#abc'), true);
  assert.equal(istFarbe(' #ABCDEF '), true);
  assert.equal(istFarbe('navy'), false);
  assert.equal(istFarbe('rgb(10,22,40)'), false);
  assert.equal(istFarbe('#12345'), false);
  assert.equal(istFarbe(null), false);
});

test('ein Farbfeld kann das Blatt nicht mehr zerschießen', () => {
  // Genau der Fall, gegen den die Prüfung gebaut wurde.
  const angriff = 'red; } body { display:none } .x {';
  assert.equal(istFarbe(angriff), false);
  assert.equal(farbeOderStandard(angriff, MARKE_PRIMAER_STANDARD), MARKE_PRIMAER_STANDARD);
});

test('farbeOderStandard fällt still zurück, statt leer zu bleiben', () => {
  assert.equal(farbeOderStandard('#1F3A5F', MARKE_PRIMAER_STANDARD), '#1F3A5F');
  assert.equal(farbeOderStandard('', MARKE_AKZENT_STANDARD), MARKE_AKZENT_STANDARD);
  assert.equal(farbeOderStandard(undefined, MARKE_AKZENT_STANDARD), MARKE_AKZENT_STANDARD);
});

test('eine Straßenadresse im Logo-Feld wird zu keinem Bild', () => {
  // Beim Prüfen am 08.09.26 tatsächlich so vorgefunden: Ein Betrieb hatte
  // „Tübinger Straße 50" im Logo-Feld — das erzeugte auf jeder seiner
  // Rechnungen ein kaputtes Bild-Symbol.
  assert.equal(logoOderLeer('Tübinger Straße 50'), '');
  assert.equal(logoOderLeer('logo.png'), '');
  assert.equal(logoOderLeer('javascript:alert(1)'), '');
  assert.equal(logoOderLeer('https://x.de/logo.png'), 'https://x.de/logo.png');
  assert.equal(logoOderLeer('http://x.de/logo.png'), 'http://x.de/logo.png');
  assert.equal(logoOderLeer(null), '');
});

test('lesbarerText wählt die Schriftfarbe passend zum Hintergrund', () => {
  assert.equal(lesbarerText('#0A1628'), '#ffffff', 'dunkler Grund → weiße Schrift');
  assert.equal(lesbarerText('#FFFFFF'), '#0A1628', 'heller Grund → dunkle Schrift');
  assert.equal(lesbarerText('Unsinn'), '#ffffff', 'im Zweifel weiß');
});

test('baueMarke liefert immer ein vollständiges, brauchbares Ergebnis', () => {
  const leer = baueMarke(null, 'Meier Bedachungen');
  assert.equal(leer.primaer, MARKE_PRIMAER_STANDARD);
  assert.equal(leer.akzent, MARKE_AKZENT_STANDARD);
  assert.equal(leer.logo, '');
  assert.equal(leer.name, 'Meier Bedachungen');
  assert.ok(leer.theadText);
});

test('baueMarke: eigenes CI schlägt den Ersatznamen', () => {
  const m = baueMarke(
    { firma: 'GPM-Media', logo_url: 'https://x.de/l.png', farbe_primaer: '#1F3A5F', farbe_akzent: '#4CAF7D' },
    'Ersatz GmbH',
  );
  assert.equal(m.name, 'GPM-Media');
  assert.equal(m.primaer, '#1F3A5F');
  assert.equal(m.akzent, '#4CAF7D');
  assert.equal(m.logo, 'https://x.de/l.png');
});

test('baueMarke rettet den brauchbaren Teil, wenn ein Feld Unsinn enthält', () => {
  const m = baueMarke({ firma: 'GPM-Media', logo_url: 'Tübinger Straße 50', farbe_primaer: '#1F3A5F' }, null);
  assert.equal(m.name, 'GPM-Media', 'Name bleibt');
  assert.equal(m.primaer, '#1F3A5F', 'gute Farbe bleibt');
  assert.equal(m.logo, '', 'nur das kaputte Feld fällt weg');
});

test('die Spaltenliste ist EINE Zeichenkette — siehe selectLiteral-Wächter', () => {
  assert.equal(typeof CI_SPALTEN, 'string');
  assert.match(CI_SPALTEN, /firma/);
  assert.match(CI_SPALTEN, /logo_url/);
  assert.match(CI_SPALTEN, /farbe_primaer/);
  assert.match(CI_SPALTEN, /farbe_akzent/);
});
