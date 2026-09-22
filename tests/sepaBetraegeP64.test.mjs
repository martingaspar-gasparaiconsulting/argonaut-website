// ARGONAUT OS · tests/sepaBetraegeP64.test.mjs — Punkt 64 (22.09.2026)
// SEPA-Betraege dicht machen: kein stilles 0,00, Kontrollsumme aus den
// GERUNDETEN Einzelposten, Bankarbeitstag als Hinweis (nie als Sperre).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueSepaXml, ibanGueltig } from '../out/sepa.js';
import { bauePain001, ibanGueltig as ibanGueltigU } from '../out/sepaUeberweisung.js';
import { sepaBetrag, betragStr, sepaSumme, istSepaBetragFehler } from '../out/sepaGemeinsam.js';
import { istBankarbeitstag, naechsterBankarbeitstag, bankarbeitstagHinweis, bankfeiertage } from '../out/bankarbeitstag.js';

const GLAEUBIGER = {
  name: 'Musterverein e.V.',
  iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001',
  glaeubigerId: 'DE98ZZZ09999999999',
};

function posten(betrag, name = 'Mitglied') {
  return {
    name,
    iban: 'DE02120300000000202051',
    betrag,
    mandatsreferenz: 'M-1',
    mandatDatum: '2026-01-02',
    verwendungszweck: 'Beitrag',
    seqTp: 'RCUR',
  };
}

/** Alle Einzelbetraege aus dem XML holen — was WIRKLICH in der Datei steht. */
function instdAmts(xml) {
  return [...xml.matchAll(/<InstdAmt Ccy="EUR">([0-9.]+)<\/InstdAmt>/g)].map((m) => m[1]);
}
/** Alle Kontrollsummen aus dem XML holen (Kopf und je Zahlungsblock). */
function ctrlSums(xml) {
  return [...xml.matchAll(/<CtrlSum>([0-9.]+)<\/CtrlSum>/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// 1. KEIN STILLES 0,00
// ---------------------------------------------------------------------------

test('ein unbrauchbarer Betrag wirft — er wird NIE still zu 0,00', () => {
  for (const mist of [NaN, Infinity, -Infinity, undefined, null, '29,90', {}]) {
    assert.throws(() => sepaBetrag(mist), (e) => istSepaBetragFehler(e), `durchgerutscht: ${String(mist)}`);
  }
});

test('die Lastschrift-Datei entsteht GAR NICHT, wenn ein Betrag kaputt ist', () => {
  assert.throws(
    () => baueSepaXml(GLAEUBIGER, [posten(29.9), posten(NaN, 'Kaputt')], '2026-10-01', 'ARGO1', '2026-09-22T12:00:00'),
    (e) => istSepaBetragFehler(e) && /Kaputt/.test(e.message),
  );
});

test('die Ueberweisungs-Datei entsteht GAR NICHT, wenn ein Betrag kaputt ist', () => {
  assert.throws(
    () => bauePain001(
      { name: 'Betrieb', iban: 'DE02120300000000202051' },
      [{ name: 'Lohn', iban: 'DE02120300000000202051', betrag: NaN, verwendungszweck: 'Gehalt' }],
      '2026-10-01', 'ARGO2', '2026-09-22T12:00:00',
    ),
    (e) => istSepaBetragFehler(e),
  );
});

test('die Fehlermeldung nennt den betroffenen Posten im Klartext', () => {
  try {
    baueSepaXml(GLAEUBIGER, [posten(NaN, 'Anna Beispiel')], '2026-10-01', 'ARGO3', '2026-09-22T12:00:00');
    assert.fail('haette werfen muessen');
  } catch (e) {
    assert.match(e.message, /Anna Beispiel/);
    assert.match(e.message, /NICHT erzeugt/);
  }
});

// ---------------------------------------------------------------------------
// 2. AUF DEN CENT — die Werte stammen aus scripts-gesuchten Grenzfaellen
// ---------------------------------------------------------------------------

test('halbe Cent runden kaufmaennisch auf, nicht per toFixed weg', () => {
  // Gemessene Grenzfaelle: toFixed(2) liefert hier die kleinere Zahl.
  assert.equal(betragStr(0.015), '0.02');
  assert.equal((0.015).toFixed(2), '0.01');       // Gegenprobe: so war es vorher
  assert.equal(betragStr(0.045), '0.05');
  assert.equal((0.045).toFixed(2), '0.04');
  assert.equal(betragStr(0.155), '0.16');
  assert.equal((0.155).toFixed(2), '0.15');
});

test('negative Betraege kippen symmetrisch, nicht nach oben', () => {
  assert.equal(betragStr(-0.015), '-0.02');
});

test('der Gleitkomma-Rest steht nicht in der Datei', () => {
  assert.equal(betragStr(0.1 + 0.2), '0.30');
  let s = 0; for (let i = 0; i < 10; i++) s += 0.1;
  assert.equal(betragStr(s), '1.00');
});

// ---------------------------------------------------------------------------
// 3. DIE KONTROLLSUMME ZAEHLT, WAS IN DER DATEI STEHT
// ---------------------------------------------------------------------------

test('CtrlSum ist die Summe der InstdAmt — auch bei halben Cent', () => {
  // Drei Posten zu 0,015: einzeln gerundet 3 x 0,02 = 0,06.
  // Roh summiert waeren es 0,045 -> 0,05 gewesen: ein Cent Unterschied,
  // und die Bank weist die Datei ab.
  const xml = baueSepaXml(GLAEUBIGER, [posten(0.015), posten(0.015), posten(0.015)], '2026-10-01', 'ARGO4', '2026-09-22T12:00:00');
  assert.deepEqual(instdAmts(xml), ['0.02', '0.02', '0.02']);
  for (const cs of ctrlSums(xml)) assert.equal(cs, '0.06');
});

test('CtrlSum stimmt bei gemischten Sequenzen je Block UND im Kopf', () => {
  const p = [
    { ...posten(10.005, 'A'), seqTp: 'FRST' },
    { ...posten(20.005, 'B'), seqTp: 'FRST' },
    { ...posten(5.004, 'C'), seqTp: 'RCUR' },
  ];
  const xml = baueSepaXml(GLAEUBIGER, p, '2026-10-01', 'ARGO5', '2026-09-22T12:00:00');
  const betraege = instdAmts(xml);
  assert.deepEqual(betraege, ['10.01', '20.01', '5.00']);
  const summen = ctrlSums(xml);
  // Kopf, dann FRST-Block (10.01 + 20.01), dann RCUR-Block (5.00)
  assert.equal(summen[0], '35.02');
  assert.equal(summen[1], '30.02');
  assert.equal(summen[2], '5.00');
  // Und die harte Probe: Kopf-Summe == Summe aller Einzelposten in der Datei
  const summeAusDatei = betraege.reduce((s, b) => s + Math.round(Number(b) * 100), 0) / 100;
  assert.equal(summen[0], summeAusDatei.toFixed(2));
});

test('bei der Ueberweisung zaehlt die Kontrollsumme ebenso die Datei-Betraege', () => {
  const xml = bauePain001(
    { name: 'Betrieb', iban: 'DE02120300000000202051' },
    [
      { name: 'A', iban: 'DE02120300000000202051', betrag: 0.015, verwendungszweck: 'Lohn' },
      { name: 'B', iban: 'DE02120300000000202051', betrag: 0.015, verwendungszweck: 'Lohn' },
    ],
    '2026-10-01', 'ARGO6', '2026-09-22T12:00:00',
  );
  assert.deepEqual(instdAmts(xml), ['0.02', '0.02']);
  for (const cs of ctrlSums(xml)) assert.equal(cs, '0.04');
});

test('sepaSumme rundet erst die Posten, dann die Summe', () => {
  assert.equal(sepaSumme([{ betrag: 0.015 }, { betrag: 0.015 }]), 0.04);
  assert.equal(sepaSumme([]), 0);
});

// ---------------------------------------------------------------------------
// 4. DIE IBAN-PRUEFUNG IST AUS BEIDEN DATEIEN WEITER ZU HABEN
// ---------------------------------------------------------------------------

test('ibanGueltig bleibt aus beiden Dateien erreichbar und antwortet gleich', () => {
  const proben = ['DE02120300000000202051', 'DE02120300000000202052', 'DE 02 1203 0000 0000 2020 51', 'Unsinn', ''];
  for (const p of proben) assert.equal(ibanGueltig(p), ibanGueltigU(p), `uneinig bei ${p}`);
  assert.equal(ibanGueltig('DE02120300000000202051'), true);
  assert.equal(ibanGueltig('DE02120300000000202052'), false);
});

// ---------------------------------------------------------------------------
// 5. BANKARBEITSTAG — HINWEIS, NIE SPERRE
// ---------------------------------------------------------------------------

test('Wochenenden und Bankfeiertage sind keine Buchungstage', () => {
  assert.equal(istBankarbeitstag('2026-09-26'), false);   // Samstag
  assert.equal(istBankarbeitstag('2026-09-27'), false);   // Sonntag
  assert.equal(istBankarbeitstag('2027-01-01'), false);   // Neujahr, ein Freitag
  assert.equal(istBankarbeitstag('2026-05-01'), false);   // Tag der Arbeit, ein Freitag
  assert.equal(istBankarbeitstag('2026-12-24'), false);   // Heiligabend, ein Donnerstag
  assert.equal(istBankarbeitstag('2026-12-25'), false);
  assert.equal(istBankarbeitstag('2026-12-31'), false);   // Silvester, ein Donnerstag
  assert.equal(istBankarbeitstag('2026-09-23'), true);    // gewoehnlicher Mittwoch
});

test('Ostern wandert mit — Karfreitag und Ostermontag 2027', () => {
  const f = bankfeiertage(2027);
  assert.ok(f.has('2027-03-26'), 'Karfreitag 2027');
  assert.ok(f.has('2027-03-29'), 'Ostermontag 2027');
  assert.equal(istBankarbeitstag('2027-03-26'), false);
  assert.equal(istBankarbeitstag('2027-03-29'), false);
});

test('der naechste Buchungstag springt ueber die Feiertagskette', () => {
  assert.equal(naechsterBankarbeitstag('2026-12-24'), '2026-12-28'); // Do bis So sind zu
  assert.equal(naechsterBankarbeitstag('2026-09-23'), '2026-09-23'); // schon einer
  assert.equal(naechsterBankarbeitstag('2026-09-26'), '2026-09-28'); // Sa -> Mo
});

test('der Hinweis ist ein Hinweis: Text bei Bedarf, sonst null', () => {
  assert.equal(bankarbeitstagHinweis('2026-09-23'), null);
  const h = bankarbeitstagHinweis('2026-09-26');
  assert.match(h, /Samstag/);
  assert.match(h, /28\.09\.2026/);
  assert.match(h, /können das Datum so lassen/);   // keine Sperre
});

test('unlesbare Datumsangaben loesen keinen Fehlalarm aus', () => {
  assert.equal(bankarbeitstagHinweis(''), null);
  assert.equal(bankarbeitstagHinweis('morgen'), null);
  assert.equal(bankarbeitstagHinweis('2026-02-31'), null);
  assert.equal(istBankarbeitstag('morgen'), true);
});
