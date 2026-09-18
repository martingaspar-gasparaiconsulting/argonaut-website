// ARGONAUT OS · tests/datevExtf.test.mjs — Punkt 15 (18.09.2026)
//
// lib/datevExtf.ts hatte keinen Test. Was hier falsch rechnet, landet beim
// Finanzamt — hoechste Schadenswirkung pro Fehler im ganzen System.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buchungAusRechnung,
  buchungAusBeleg,
  buchungZeile,
  extfBelegdatum,
  extfBetrag,
  satzAus,
  extfDefaults,
  erloeskontoSteuerfrei,
  extfHinweise,
  baueExtf,
  EXTF_SPALTEN,
} from '../out/datevExtf.js';

function konfig(felder = {}) {
  const skr = felder.skr ?? '03';
  return {
    beraterNr: '1234567', mandantNr: '56789', wjBeginn: '20260101',
    sachkontenlaenge: 4, skr,
    ...extfDefaults(skr),
    debitorSammel: '10000', kreditorSammel: '70000',
    bezeichnung: 'Testmonat',
    ...felder,
  };
}

// ===========================================================================
// BEFUND 1 — erfundene Umsatzsteuer aus steuerfreien Lieferungen
// ===========================================================================

test('DER WICHTIGSTE TEST: steuerfrei landet NICHT auf dem 19-Prozent-Automatikkonto', () => {
  // Vorher: Gegenkonto 8400 (SKR03) mit leerem BU. 8400 ist ein
  // Automatikkonto — DATEV rechnet dort selbst 19 % heraus. Aus 5.000 EUR
  // steuerfrei wurden 798,32 EUR Umsatzsteuer aus dem Nichts.
  const b = buchungAusRechnung(
    { netto_summe: 5000, mwst_summe: 0, brutto_summe: 5000, rechnungsdatum: '2026-03-15' },
    konfig({ skr: '03' }),
  );
  assert.notEqual(b.gegenkonto, '8400');
  assert.equal(b.gegenkonto, '8200');
  assert.equal(b.bu, '');
});

test('auch in SKR04 geht steuerfrei nicht auf das Automatikkonto', () => {
  const b = buchungAusRechnung(
    { netto_summe: 5000, mwst_summe: 0, brutto_summe: 5000, rechnungsdatum: '2026-03-15' },
    konfig({ skr: '04' }),
  );
  assert.notEqual(b.gegenkonto, '4400');
  assert.equal(b.gegenkonto, '4200');
});

test('ein eigenes steuerfreies Konto aus der Konfig schlaegt den Standard', () => {
  const b = buchungAusRechnung(
    { netto_summe: 5000, mwst_summe: 0, brutto_summe: 5000, rechnungsdatum: '2026-03-15' },
    konfig({ skr: '03', erloeskonto0: '8125' }),
  );
  assert.equal(b.gegenkonto, '8125');
  // Leer oder nur Leerzeichen faellt auf den Standard zurueck, nie auf 8400.
  assert.equal(erloeskontoSteuerfrei(konfig({ erloeskonto0: '   ' })), '8200');
  assert.equal(erloeskontoSteuerfrei(konfig({ erloeskonto0: undefined })), '8200');
});

test('19 und 7 Prozent buchen unveraendert wie vorher', () => {
  const k = konfig({ skr: '03' });
  const b19 = buchungAusRechnung({ netto_summe: 1000, mwst_summe: 190, brutto_summe: 1190 }, k);
  assert.equal(b19.gegenkonto, '8400');
  assert.equal(b19.bu, '3');
  const b7 = buchungAusRechnung({ netto_summe: 1000, mwst_summe: 70, brutto_summe: 1070 }, k);
  assert.equal(b7.gegenkonto, '8300');
  assert.equal(b7.bu, '2');
});

// ===========================================================================
// BEFUND 2 — Gutschriften wurden zu Erloesen
// ===========================================================================

test('DER WICHTIGSTE TEST: eine Gutschrift wird im Haben gebucht, nicht im Soll', () => {
  // Vorher: sh stand fest auf 'S' und extfBetrag nahm den Absolutbetrag —
  // aus einer Gutschrift ueber 1.190 EUR wurde eine Rechnung ueber 1.190 EUR.
  // Abweichung 2.380 EUR.
  const b = buchungAusRechnung(
    { netto_summe: -1000, mwst_summe: -190, brutto_summe: -1190, rechnungsdatum: '2026-03-15' },
    konfig(),
  );
  assert.equal(b.sh, 'H');
  assert.equal(b.umsatz, -1190);
});

test('NEU GEFUNDEN: eine Gutschrift gilt nicht als steuerfrei', () => {
  // satzAus() gab bei negativen Betraegen 0 zurueck — die Gutschrift lief
  // damit zusaetzlich in den Automatikkonto-Fehler von Befund 1 hinein.
  assert.equal(satzAus(-1000, -190), 19);
  assert.equal(satzAus(-1000, -70), 7);
  const b = buchungAusRechnung(
    { netto_summe: -1000, mwst_summe: -190, brutto_summe: -1190 },
    konfig({ skr: '03' }),
  );
  assert.equal(b.gegenkonto, '8400');
  assert.equal(b.bu, '3');
});

test('eine Lieferantengutschrift erhoeht den Aufwand nicht noch einmal', () => {
  const b = buchungAusBeleg(
    { netto: -500, ust_betrag: -95, brutto: -595, belegdatum: '2026-03-15' },
    konfig(),
    '4980',
  );
  assert.equal(b.sh, 'H');
  assert.equal(b.bu, '9');
});

test('der Betrag in der Zeile bleibt ohne Vorzeichen — DATEV liest Soll/Haben', () => {
  // extfBetrag MUSS den Absolutbetrag liefern, das ist DATEV-konform.
  // Die Richtung steckt im Soll/Haben-Kennzeichen, nicht im Vorzeichen.
  assert.equal(extfBetrag(-1190), '1190,00');
  assert.equal(extfBetrag(1190), '1190,00');
  const zeile = buchungZeile(
    buchungAusRechnung({ netto_summe: -1000, mwst_summe: -190, brutto_summe: -1190 }, konfig()),
  );
  assert.ok(zeile.startsWith('1190,00;"H";'), `Zeile war: ${zeile}`);
});

test('eine normale Rechnung bleibt im Soll', () => {
  const b = buchungAusRechnung({ netto_summe: 1000, mwst_summe: 190, brutto_summe: 1190 }, konfig());
  assert.equal(b.sh, 'S');
});

// ===========================================================================
// BEFUND 3 — Belegdatum rutschte in den Vormonat
// ===========================================================================

test('DER WICHTIGSTE TEST: ein Datum mit Zeitzone rutscht nicht ins Vorjahr', () => {
  // Vorher: new Date(...) plus getUTC* machte aus dem 01.01. den 31.12. —
  // ausserhalb des Wirtschaftsjahres im Stapelkopf.
  assert.equal(extfBelegdatum('2026-01-01T00:00:00+01:00'), '0101');
  assert.equal(extfBelegdatum('2026-03-01T00:00:00+02:00'), '0103');
  assert.equal(extfBelegdatum('2026-03-01T23:59:59+02:00'), '0103');
});

test('das normale Datum aus der Datenbank bleibt richtig', () => {
  assert.equal(extfBelegdatum('2026-03-15'), '1503');
  assert.equal(extfBelegdatum('2026-12-31'), '3112');
  assert.equal(extfBelegdatum('2026-01-01'), '0101');
  assert.equal(extfBelegdatum('2026-03-15T14:30:00Z'), '1503');
});

test('unbrauchbare Datumsangaben ergeben leer, nicht irgendwas', () => {
  assert.equal(extfBelegdatum(''), '');
  assert.equal(extfBelegdatum(null), '');
  assert.equal(extfBelegdatum(undefined), '');
  assert.equal(extfBelegdatum('kein Datum'), '');
  assert.equal(extfBelegdatum('2026-13-01'), '');
  assert.equal(extfBelegdatum('2026-00-05'), '');
});

// ===========================================================================
// Zahlen-Leser (Punkt 24 zieht hier mit ein)
// ===========================================================================

test('deutsche Betraege werden richtig gelesen', () => {
  // Der alte Leser entfernte ALLE Punkte: 1234.56 wurde 123456.
  assert.equal(extfBetrag('1.234,56'), '1234,56');
  assert.equal(extfBetrag('1234.56'), '1234,56');
  assert.equal(extfBetrag('-1.234,56'), '1234,56');
  const b = buchungAusRechnung(
    { netto_summe: '1.000,00', mwst_summe: '190,00', brutto_summe: '1.190,00' },
    konfig(),
  );
  assert.equal(b.umsatz, 1190);
  assert.equal(b.bu, '3');
});

// ===========================================================================
// Hinweise — der Stapel geht nicht mehr stumm raus
// ===========================================================================

test('extfHinweise meldet steuerfreie Buchungen, Gutschriften und den Kontenrahmen', () => {
  const h = extfHinweise({
    rechnungen: [
      { netto_summe: 5000, mwst_summe: 0, brutto_summe: 5000, rechnungsdatum: '2026-03-01' },
      { netto_summe: -1000, mwst_summe: -190, brutto_summe: -1190, rechnungsdatum: '2026-03-02' },
    ],
    belege: [],
    konfig: konfig(),
    aufwandFallback: '4980',
    datumVon: '20260301', datumBis: '20260331', erzeugtAm: '20260401120000000',
  });
  const text = h.join(' | ');
  assert.match(text, /ohne Umsatzsteuer/);
  assert.match(text, /8200/);
  assert.match(text, /Gutschrift/);
  assert.match(text, /Kontenrahmen/);
});

test('extfHinweise meldet fehlende Berater- oder Mandantennummer', () => {
  const h = extfHinweise({
    rechnungen: [], belege: [],
    konfig: konfig({ beraterNr: '' }),
    aufwandFallback: '4980',
    datumVon: '20260301', datumBis: '20260331', erzeugtAm: '20260401120000000',
  });
  assert.match(h.join(' '), /Beraternummer oder Mandantennummer fehlt/);
});

test('extfHinweise meldet Buchungen ohne lesbares Datum', () => {
  const h = extfHinweise({
    rechnungen: [{ netto_summe: 100, mwst_summe: 19, brutto_summe: 119, rechnungsdatum: 'kaputt' }],
    belege: [],
    konfig: konfig(),
    aufwandFallback: '4980',
    datumVon: '20260301', datumBis: '20260331', erzeugtAm: '20260401120000000',
  });
  assert.match(h.join(' '), /kein lesbares Belegdatum/);
});

// ===========================================================================
// Der Stapel als Ganzes bleibt formgleich
// ===========================================================================

test('Aufbau der Datei ist unveraendert: BOM, Kopf, Spalten, CRLF', () => {
  const datei = baueExtf({
    rechnungen: [{ netto_summe: 1000, mwst_summe: 190, brutto_summe: 1190, rechnungsdatum: '2026-03-15', rechnungsnummer: 'RE-1', empfaenger_name: 'Kunde' }],
    belege: [],
    konfig: konfig(),
    aufwandFallback: '4980',
    datumVon: '20260301', datumBis: '20260331', erzeugtAm: '20260401120000000',
  });
  assert.ok(datei.startsWith('﻿'), 'UTF-8-BOM fehlt');
  const zeilen = datei.split('\r\n');
  assert.ok(zeilen[0].startsWith('﻿"EXTF";700;21;"Buchungsstapel";13;'));
  assert.equal(zeilen[1], EXTF_SPALTEN.join(';'));
  assert.equal(zeilen[2].split(';').length, 14);
  assert.equal(datei.endsWith('\r\n'), true);
});

/** CSV-Split, der Semikolons INNERHALB von Anfuehrungszeichen stehen laesst. */
function spalten(zeile) {
  const raus = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') {
      if (inQ && zeile[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ';' && !inQ) { raus.push(cur); cur = ''; }
    else cur += c;
  }
  raus.push(cur);
  return raus;
}

test('NEU GEFUNDEN: ein Semikolon in der Kontonummer verschiebt die Zeile nicht mehr', () => {
  // datev_konto ist in der Datenbank ein freies Textfeld und ging ungeprueft
  // und ungequotet in die Zeile. Ein Semikolon darin haette den ganzen
  // Stapel unbrauchbar gemacht.
  const b = buchungAusBeleg(
    { netto: 100, ust_betrag: 19, brutto: 119, belegdatum: '2026-03-18', datev_konto: '4980;99' },
    konfig(),
    '4980',
  );
  assert.equal(b.konto, '498099');
  assert.equal(spalten(buchungZeile(b)).length, 14);
});

test('auch buchungZeile selbst laesst kein Semikolon im Konto durch', () => {
  // buchungZeile ist exportiert und koennte mit einer von Hand gebauten
  // Buchung aufgerufen werden — die Absicherung darf nicht nur in
  // buchungAusBeleg sitzen. Zwei Riegel, nicht einer.
  const roh = {
    umsatz: 119, sh: 'S', konto: '4980;99', gegenkonto: '70000;1', bu: '9',
    belegdatum: '1803', belegfeld1: '', belegfeld2: '', buchungstext: 'Test',
  };
  const z = buchungZeile(roh);
  assert.equal(spalten(z).length, 14, `Zeile war: ${z}`);
  assert.equal(spalten(z)[6], '498099');
  assert.equal(spalten(z)[7], '700001');
});

test('ein unbrauchbares Konto faellt auf den Ersatzwert zurueck', () => {
  const b = buchungAusBeleg(
    { netto: 100, ust_betrag: 19, brutto: 119, belegdatum: '2026-03-18', datev_konto: 'Bitte pruefen' },
    konfig(),
    '4980',
  );
  assert.equal(b.konto, '4980');
});

test('ein Semikolon im Buchungstext bleibt gequotet und bricht nichts', () => {
  const b = buchungAusBeleg(
    { netto: 100, ust_betrag: 19, brutto: 119, belegdatum: '2026-03-18', lieferant: 'Meier; Sohn "GmbH"' },
    konfig(),
    '4980',
  );
  const z = buchungZeile(b);
  assert.equal(spalten(z).length, 14);
  assert.equal(spalten(z)[13], 'ER Meier; Sohn "GmbH"');
});

test('jede Buchungszeile hat genau 14 Spalten', () => {
  const datei = baueExtf({
    rechnungen: [
      { netto_summe: 1000, mwst_summe: 190, brutto_summe: 1190, rechnungsdatum: '2026-03-15' },
      { netto_summe: -1000, mwst_summe: -190, brutto_summe: -1190, rechnungsdatum: '2026-03-16' },
      { netto_summe: 5000, mwst_summe: 0, brutto_summe: 5000, rechnungsdatum: '2026-03-17' },
    ],
    belege: [{ netto: 100, ust_betrag: 19, brutto: 119, belegdatum: '2026-03-18', lieferant: 'Lieferant; mit "Zeichen"' }],
    konfig: konfig(),
    aufwandFallback: '4980',
    datumVon: '20260301', datumBis: '20260331', erzeugtAm: '20260401120000000',
  });
  const zeilen = datei.replace(/﻿/, '').trim().split('\r\n').slice(2);
  assert.equal(zeilen.length, 4);
  for (const z of zeilen) {
    assert.equal(spalten(z).length, 14, `Zeile hat falsche Spaltenzahl: ${z}`);
  }
});
