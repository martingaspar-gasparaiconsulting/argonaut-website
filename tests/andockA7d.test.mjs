// ARGONAUT OS · tests/andockA7d.test.mjs — A7 Paket 5 (22.09.2026)
// extfHinweise ist angeschlossen: die DATEV-Seite prueft den Buchungsstapel,
// BEVOR er beim Steuerberater landet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueExtf, extfHinweise, extfDefaults } from '../out/datevExtf.js';

const STD = extfDefaults('03');

function eingabe(ueberschreiben = {}) {
  return {
    rechnungen: [{
      rechnungsnummer: '2026-001', rechnungsdatum: '2026-09-01', empfaenger_name: 'Kunde',
      netto_summe: 1000, mwst_summe: 190, brutto_summe: 1190, zahlungsstatus: 'offen',
    }],
    belege: [],
    konfig: {
      beraterNr: '12345', mandantNr: '67890', wjBeginn: '20260101', sachkontenlaenge: 4, skr: '03',
      erloeskonto19: STD.erloeskonto19, erloeskonto7: STD.erloeskonto7,
      debitorSammel: STD.debitorSammel, kreditorSammel: STD.kreditorSammel,
      bezeichnung: 'Test',
    },
    aufwandFallback: '4980',
    datumVon: '20260901', datumBis: '20260930', erzeugtAm: '20260922120000000',
    ...ueberschreiben,
  };
}

test('DER WICHTIGSTE FALL: fehlende Beraternummer wird VORHER gemeldet', () => {
  const e = eingabe();
  e.konfig = { ...e.konfig, beraterNr: '' };
  const h = extfHinweise(e);
  assert.ok(h.length > 0, 'ohne Beraternummer MUSS gewarnt werden');
  assert.ok(
    h.some((x) => /Beraternummer|Mandantennummer/i.test(x)),
    'der Hinweis muss sagen, WAS fehlt',
  );
  assert.ok(h.some((x) => /DATEV/i.test(x)), 'und dass DATEV den Import ablehnt');
});

test('mit vollstaendiger Konfiguration gibt es keinen Alarm dieser Art', () => {
  const h = extfHinweise(eingabe());
  assert.ok(!h.some((x) => /Beraternummer oder Mandantennummer fehlt/i.test(x)));
});

test('die Pruefung veraendert die Datei NICHT — sie liest nur', () => {
  // Der Pruefmodus der Route ruft extfHinweise auf und danach nichts weiter.
  // Wenn extfHinweise die Eingabe veraendern wuerde, kaeme aus demselben
  // Objekt hinterher eine andere Datei heraus.
  const e = eingabe();
  const vorher = baueExtf(eingabe());
  extfHinweise(e);
  const nachher = baueExtf(e);
  assert.equal(nachher, vorher, 'die Pruefung darf den Stapel nicht anfassen');
});

test('leere Zeitraeume stuerzen nicht ab', () => {
  const h = extfHinweise(eingabe({ rechnungen: [], belege: [] }));
  assert.equal(Array.isArray(h), true);
});
