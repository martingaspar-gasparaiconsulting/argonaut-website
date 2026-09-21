// ============================================================================
// tests/ustIdNrP58.test.mjs
//
// PUNKT 58 / R8 — USt-IdNr. und Bestaetigungsabfrage, Paket 1 (21.09.2026)
//
// ▄▄▄ DER BEFUND ▄▄▄
// Die USt-IdNr. wird im Haus an SECHZEHN Stellen verwendet — PDF-Fusszeilen,
// ZUGFeRD-XML (schemeID="VA"), Auslesen fremder E-Rechnungen — und an KEINER
// geprueft. Der Validator verlangt zwar eine (BR-CO-26), nimmt aber jede
// Zeichenfolge: "folgt noch" haette ihn zufriedengestellt.
//
// ▄▄▄ DREI FEHLER, DIE DIESE DATEI VERHINDERN SOLL ▄▄▄
//  1. Ein fehlendes Laenderkennzeichen stillschweigend mit "DE" ergaenzen.
//     Eine neunstellige Zahl kann auch estnisch, griechisch oder
//     portugiesisch sein — ein geratenes Land macht aus einer gueltigen
//     Nummer eine falsche.
//  2. Die einfache Bestaetigungsabfrage fuer den Nachweis halten. Sie sagt
//     nur, DASS die Nummer existiert, nicht WEM sie gehoert. Eine
//     steuerfreie innergemeinschaftliche Lieferung traegt sie nicht.
//  3. Beim BZSt nur auf den Code 200 schauen. Der heisst allein, dass die
//     NUMMER gueltig ist. Kommt gleichzeitig ein "B" beim Namen, gehoert
//     die gueltige Nummer einem ANDEREN — und genau dieser Fall sieht fuer
//     jeden, der nur den Code liest, wie ein bestandener Test aus.
//
// Der Pruefziffern-Algorithmus (ISO 7064 MOD 11,10) wurde am echten
// Verfahren gegengeprueft, bevor er eingebaut wurde.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  pruefeUstIdNr, pruefzifferDe, normalisiere, baueAbfrage, werteAbfrageAus,
  pruefeVorLieferung, EU_LAENDER, MIT_PRUEFZIFFER,
} from '../out/ustIdNr.js';

// ===========================================================================
// TEIL 1 — DIE PRUEFZIFFER
// ===========================================================================

test('vier echte deutsche Nummern bestehen die Pruefziffer', () => {
  for (const n of ['136695976', '811907980', '129274202', '813501887']) {
    assert.equal(pruefzifferDe(n), true, 'sollte gueltig sein: DE' + n);
  }
});

test('der Zahlendreher wird gefunden — genau dafuer ist die Pruefziffer da', () => {
  assert.equal(pruefzifferDe('136695967'), false, 'letzte zwei Ziffern getauscht');
  assert.equal(pruefzifferDe('811907908'), false);
  assert.equal(pruefzifferDe('136659976'), false, 'Dreher in der Mitte');
});

test('die Pruefziffer verlangt genau neun Ziffern', () => {
  assert.equal(pruefzifferDe('13669597'), false, 'zu kurz');
  assert.equal(pruefzifferDe('1366959761'), false, 'zu lang');
  assert.equal(pruefzifferDe('13669597X'), false, 'Buchstabe');
  assert.equal(pruefzifferDe(''), false);
});

// ===========================================================================
// TEIL 2 — FORMAT UND LAENDERKENNZEICHEN
// ===========================================================================

test('Leerzeichen, Punkte und Bindestriche stoeren nicht', () => {
  assert.equal(normalisiere(' de 136.695-976 '), 'DE136695976');
  assert.equal(pruefeUstIdNr('DE 136 695 976').formatOk, true);
  assert.equal(pruefeUstIdNr('de136695976').normalisiert, 'DE136695976');
});

test('DER WICHTIGSTE FALL: ohne Laenderkennzeichen wird NICHTS ergaenzt', () => {
  const r = pruefeUstIdNr('136695976');
  assert.equal(r.formatOk, false);
  assert.equal(r.grund, 'kein-laenderkennzeichen');
  assert.ok(r.klartext.includes('anderen Land'), 'und der Grund steht dabei');
  // Die Ziffernfolge waere als DE gueltig — genau deshalb darf nicht
  // geraten werden. Sie passt formal auch zu EE, EL und PT.
  assert.equal(pruefeUstIdNr('DE136695976').formatOk, true);
  assert.equal(pruefeUstIdNr('EE136695976').formatOk, true);
});

test('GRIECHENLAND heisst EL, nicht GR — und das wird gesagt', () => {
  const gr = pruefeUstIdNr('GR123456789');
  assert.equal(gr.formatOk, false);
  assert.equal(gr.grund, 'land-nicht-eu');
  assert.ok(gr.klartext.includes('EL'), 'der haeufigste Irrtum, deshalb im Klartext');
  assert.equal(pruefeUstIdNr('EL123456789').formatOk, true);
});

test('die Muster der anderen Laender stimmen', () => {
  for (const gut of ['ATU12345678', 'NL123456789B01', 'FRXX123456789', 'IT12345678901', 'BE0123456789', 'SE123456789012', 'PL1234567890', 'CY12345678L']) {
    assert.equal(pruefeUstIdNr(gut).formatOk, true, 'sollte passen: ' + gut);
  }
  for (const schlecht of ['AT12345678', 'NL123456789', 'IT1234567890', 'SE12345678901', 'CY123456789']) {
    assert.equal(pruefeUstIdNr(schlecht).formatOk, false, 'sollte durchfallen: ' + schlecht);
  }
});

test('Nordirland (XI) ist dabei, das Vereinigte Koenigreich nicht', () => {
  assert.ok(EU_LAENDER.includes('XI'), 'Warenlieferungen nach dem Nordirland-Protokoll');
  assert.equal(EU_LAENDER.includes('GB'), false);
  assert.equal(pruefeUstIdNr('XI123456789').formatOk, true);
  assert.equal(pruefeUstIdNr('GB123456789').grund, 'land-nicht-eu');
});

test('eine leere Nummer ist ein eigener Grund, kein Formatfehler', () => {
  assert.equal(pruefeUstIdNr('').grund, 'leer');
  assert.equal(pruefeUstIdNr(null).grund, 'leer');
  assert.equal(pruefeUstIdNr('   ').grund, 'leer');
});

test('EHRLICH: nur fuer DE wird die Pruefziffer wirklich gerechnet', () => {
  assert.deepEqual(MIT_PRUEFZIFFER, ['DE']);
  const de = pruefeUstIdNr('DE136695976');
  assert.equal(de.pruefzifferGerechnet, true);
  const at = pruefeUstIdNr('ATU12345678');
  assert.equal(at.pruefzifferGerechnet, false);
  assert.ok(at.klartext.includes('nicht gerechnet'), 'und der Text sagt es');
});

test('KEIN GRUENER HAKEN OHNE VORBEHALT: das Format ist kein Nachweis', () => {
  // Der wichtigste Satz der ganzen Datei. Wer hier "gueltig" liest und
  // steuerfrei liefert, hat keinen Nachweis.
  for (const n of ['DE136695976', 'ATU12345678']) {
    assert.ok(pruefeUstIdNr(n).klartext.includes('BZSt'), 'Vorbehalt fehlt bei ' + n);
  }
});

// ===========================================================================
// TEIL 3 — WELCHE ABFRAGE GEBRAUCHT WIRD
// ===========================================================================

test('fuer eine steuerfreie Lieferung wird die QUALIFIZIERTE Abfrage gebaut', () => {
  const a = baueAbfrage('DE136695976', 'ATU12345678', true, {
    firmenname: 'Muster GmbH', ort: 'Wien', plz: '1010', strasse: 'Ringstr. 1',
  });
  assert.equal(a.art, 'qualifiziert');
  assert.equal(a.eigeneUstIdNr, 'DE136695976');
  assert.equal(a.fremdeUstIdNr, 'ATU12345678');
  assert.equal(a.firmenname, 'Muster GmbH');
  assert.equal(a.ort, 'Wien');
});

test('sonst genuegt die einfache — und sie traegt die Angaben gar nicht erst mit', () => {
  const a = baueAbfrage('DE136695976', 'ATU12345678', false, { firmenname: 'Muster GmbH' });
  assert.equal(a.art, 'einfach');
  assert.equal(a.firmenname, undefined);
});

test('mit einer formal falschen Nummer wird gar nicht erst abgefragt', () => {
  // Das BZSt wuerde sie ohnehin ablehnen, und ein Fehlversuch sieht im
  // Protokoll aus wie eine gescheiterte Pruefung.
  assert.equal(baueAbfrage('DE136695967', 'ATU12345678', true), null, 'eigene Pruefziffer falsch');
  assert.equal(baueAbfrage('DE136695976', '136695976', true), null, 'fremde ohne Laenderkennzeichen');
  assert.equal(baueAbfrage('', 'ATU12345678', true), null);
});

// ===========================================================================
// TEIL 4 — DIE ANTWORT DES BZSt
// ===========================================================================

test('DER FALLSTRICK: Code 200 mit "B" beim Namen ist KEIN bestandener Test', () => {
  // Die Nummer ist gueltig — sie gehoert nur jemand anderem. Wer nur auf
  // den Code schaut, liefert steuerfrei und hat keinen Nachweis.
  const b = werteAbfrageAus({ code: '200', name: 'B', ort: 'A', plz: 'A', strasse: 'A' }, 'qualifiziert');
  assert.equal(b.nummerGueltig, true);
  assert.equal(b.angabenBestaetigt, false);
  assert.equal(b.alsNachweisGeeignet, false, 'der entscheidende Wert');
  assert.deepEqual(b.abweichungen, ['Firmenname: stimmt NICHT ueberein']);
  assert.ok(b.klartext.includes('NICHT'));
});

test('alles "A" ist der Nachweis — mit dem Hinweis, ihn aufzubewahren', () => {
  const g = werteAbfrageAus({ code: '200', name: 'A', ort: 'A', plz: 'A', strasse: 'A' }, 'qualifiziert');
  assert.equal(g.alsNachweisGeeignet, true);
  assert.deepEqual(g.abweichungen, []);
  assert.ok(g.klartext.includes('aufbewahren'));
});

test('"C" und "D" heissen NICHT GEPRUEFT und zaehlen nicht als bestaetigt', () => {
  const c = werteAbfrageAus({ code: '200', name: 'A', ort: 'C', plz: 'D', strasse: 'A' }, 'qualifiziert');
  assert.equal(c.alsNachweisGeeignet, false);
  assert.equal(c.abweichungen.length, 2);
  assert.ok(c.abweichungen[0].includes('nicht geprueft'));
});

test('die EINFACHE Abfrage taugt nie als Nachweis — auch bei Code 200 nicht', () => {
  const e = werteAbfrageAus({ code: '200' }, 'einfach');
  assert.equal(e.nummerGueltig, true);
  assert.equal(e.alsNachweisGeeignet, false);
  assert.ok(e.klartext.includes('EINFACHE'));
});

test('ein anderer Code heisst: nicht gueltig, nicht steuerfrei liefern', () => {
  const n = werteAbfrageAus({ code: '201' }, 'qualifiziert');
  assert.equal(n.nummerGueltig, false);
  assert.equal(n.alsNachweisGeeignet, false);
  assert.ok(n.klartext.includes('nicht als steuerfrei'));
  assert.equal(werteAbfrageAus({}, 'qualifiziert').nummerGueltig, false);
});

// ===========================================================================
// TEIL 5 — WAS VOR DER LIEFERUNG VORLIEGEN MUSS
// ===========================================================================

test('ohne qualifizierte Abfrage kommt der Hinweis', () => {
  const h = pruefeVorLieferung('ATU12345678', 'DE136695976');
  assert.equal(h.length, 1);
  assert.equal(h[0].feld, 'abfrage');
  assert.ok(h[0].text.includes('18e'));
});

test('eine nicht bestaetigte Abfrage wird als Nachweislücke benannt', () => {
  const h = pruefeVorLieferung('ATU12345678', 'DE136695976', { am: '2026-09-21', bestaetigt: false });
  assert.ok(h.some((x) => x.feld === 'nachweis'));
});

test('mit bestaetigter Abfrage und guten Nummern gibt es nichts zu meckern', () => {
  assert.deepEqual(pruefeVorLieferung('ATU12345678', 'DE136695976', { am: '2026-09-21', bestaetigt: true }), []);
});

test('eine fehlende eigene Nummer wird eigens genannt', () => {
  const h = pruefeVorLieferung('ATU12345678', '', { am: '2026-09-21', bestaetigt: true });
  assert.ok(h.some((x) => x.feld === 'nummer' && x.text.includes('Eigene')));
  assert.ok(h[0].text.includes('BZSt'), 'ohne sie nimmt das BZSt keine Abfrage an');
});
