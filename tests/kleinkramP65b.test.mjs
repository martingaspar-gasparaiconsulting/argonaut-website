// ============================================================================
// tests/kleinkramP65b.test.mjs
//
// PUNKT 65 / R12, PAKET 2 (21.09.2026) — vier Geld-Themen, alle ADDITIV
//   Teil 1  Betriebskosten: Zwoelfmonatsfrist § 556 Abs. 3 BGB + Kabelanschluss
//   Teil 2  Gutscheine: ist die Einstufung als Einzweck ueberhaupt zulaessig?
//   Teil 3  Cashflow: USt-Vorauszahlung, Lohnsteuer, Sozialversicherung
//   Teil 4  Beleg-Check: die mitwachsende Toleranz
//
// Die Bestandstests aus P29 und P30 laufen unveraendert mit — besonders
// wichtig bei Teil 4, wo eine bestehende Pruefung SCHAERFER wird.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  abrechnungsfrist, ergebnisNachFrist, pruefeKostenart,
  ABRECHNUNGSFRIST_MONATE, KABEL_PRIVILEG_ENDE, BETRKV_NR_ANTENNE,
  BETRKV_KATALOG, anteilKostenart,
} from '../out/betriebskosten.js';

import { pruefeGutscheinTyp, steuerZeitpunkt, nettoAusBrutto } from '../out/gutscheine.js';

import {
  vorschauMitTerminen, terminFuer, drittletzterBankarbeitstag,
  liquiditaetsVorschau, TERMIN_ARTEN,
} from '../out/cashflow.js';

import {
  pruefeKonsistenz, toleranzFuer, istDublette,
  TOLERANZ_MIN, TOLERANZ_MAX, TOLERANZ_PROZENT, UEBLICHE_SAETZE,
} from '../out/belegCheck.js';

// ===========================================================================
// TEIL 1 — DIE ZWOELFMONATSFRIST
// ===========================================================================

test('die Frist endet zwoelf Monate nach dem Abrechnungszeitraum', () => {
  assert.equal(ABRECHNUNGSFRIST_MONATE, 12);
  const f = abrechnungsfrist('2025-12-31', '2026-09-15');
  assert.equal(f.fristEnde, '2026-12-31');
  assert.equal(f.abgelaufen, false);
  assert.equal(f.tageBis, 107);
});

test('nach Fristablauf ist die NACHFORDERUNG ausgeschlossen', () => {
  const f = abrechnungsfrist('2024-12-31', '2026-09-15');
  assert.equal(f.abgelaufen, true);
  assert.equal(f.nachforderungMoeglich, false);
  assert.match(f.hinweis, /§ 556 Abs. 3 Satz 3/);
  assert.match(f.hinweis, /von selbst/, 'eine Ausschlussfrist wirkt ohne Zutun des Mieters');
});

test('DAS GUTHABEN MUSS TROTZDEM AUSGEZAHLT WERDEN', () => {
  const f = abrechnungsfrist('2024-12-31', '2026-09-15');
  assert.equal(f.guthabenAuszahlen, true, 'die Frist ist einseitig');

  const nach = ergebnisNachFrist(840, f);
  assert.equal(nach.art, 'nachforderung_verfallen');
  assert.equal(nach.betrag, 0, '840 EUR Nachforderung sind weg');

  const gut = ergebnisNachFrist(-320, f);
  assert.equal(gut.art, 'guthaben');
  assert.equal(gut.betrag, -320, '320 EUR Guthaben bleiben');
  assert.match(gut.hinweis, /trotz abgelaufener Frist/);
});

test('innerhalb der Frist bleibt die Nachforderung bestehen', () => {
  const f = abrechnungsfrist('2025-12-31', '2026-09-15');
  const nach = ergebnisNachFrist(840, f);
  assert.equal(nach.art, 'nachforderung');
  assert.equal(nach.betrag, 840);
});

test('die Ausnahme des § 556 Abs. 3 Satz 3 ist eine EINGABE, kein Standardwert', () => {
  const ohne = abrechnungsfrist('2024-12-31', '2026-09-15');
  assert.equal(ohne.nachforderungMoeglich, false, 'ohne Angabe gilt: zu vertreten');

  const mit = abrechnungsfrist('2024-12-31', '2026-09-15', true);
  assert.equal(mit.nachforderungMoeglich, true);
  assert.match(mit.hinweis, /belegen können/);
});

test('kurz vor Fristende wird gedraengt', () => {
  const f = abrechnungsfrist('2025-12-31', '2026-11-15');
  assert.ok(f.tageBis <= 60);
  assert.match(f.hinweis, /Noch \d+ Tage/);
});

test('eine ausgeglichene Abrechnung ist keins von beidem', () => {
  const f = abrechnungsfrist('2024-12-31', '2026-09-15');
  assert.equal(ergebnisNachFrist(0, f).art, 'ausgeglichen');
});

test('ein ungueltiges Datum sperrt nichts', () => {
  const f = abrechnungsfrist('unsinn', '2026-09-15');
  assert.equal(f.nachforderungMoeglich, true);
  assert.match(f.hinweis, /kein gültiges Datum/);
});

// ===========================================================================
// TEIL 1b — DER KABELANSCHLUSS
// ===========================================================================

test('Nr. 15 bleibt im Katalog — sie ist nicht pauschal weg', () => {
  const nr15 = BETRKV_KATALOG.find((k) => k.nr === BETRKV_NR_ANTENNE);
  assert.ok(nr15, 'die Position wurde nicht gestrichen');
  assert.match(nr15.bezeichnung, /Antenne|Breitband/);
});

test('fuer Zeitraeume vor dem 1. Juli 2024 war das Grundentgelt umlagefaehig', () => {
  assert.equal(KABEL_PRIVILEG_ENDE, '2024-07-01');
  const alt = pruefeKostenart(15, '2023-12-31');
  assert.equal(alt.umlagefaehig, true);
  assert.equal(alt.teilweise, false);
});

test('ab dem 1. Juli 2024 ist die Position nur noch TEILWEISE umlagefaehig', () => {
  const neu = pruefeKostenart(15, '2026-12-31');
  assert.equal(neu.umlagefaehig, true, 'nicht pauschal gestrichen — sonst nimmt man dem Vermieter etwas');
  assert.equal(neu.teilweise, true);
  assert.match(neu.hinweis, /GRUNDENTGELT/);
  assert.match(neu.hinweis, /Betriebsstrom/, 'was BLEIBT, muss auch dastehen');
  assert.match(neu.hinweis, /§ 72 Abs. 1 TKG/, 'Glasfaser-Bereitstellungsentgelt kam neu dazu');
});

test('alle anderen Kostenarten sind unberuehrt', () => {
  for (const nr of [1, 2, 10, 14, 16, 17]) {
    const p = pruefeKostenart(nr, '2026-12-31');
    assert.equal(p.teilweise, false, 'Nr. ' + nr);
    assert.equal(p.hinweis, null, 'Nr. ' + nr);
  }
});

test('ALTBESTAND: die Verteilung rechnet unveraendert', () => {
  const einheiten = [{ wohnflaeche: 60 }, { wohnflaeche: 40 }];
  const anteil = anteilKostenart({ betrag_gesamt: 1000, verteiler: 'wohnflaeche' }, einheiten[0], einheiten);
  assert.equal(Math.round(anteil * 100) / 100, 600);
});

// ===========================================================================
// TEIL 2 — DER GUTSCHEIN
// ===========================================================================

test('ein Gastwirt mit 7 und 19 Prozent kann KEINEN Einzweckgutschein ausgeben', () => {
  const p = pruefeGutscheinTyp({
    gewaehlt: 'einzweck',
    moeglicheSteuersaetze: [7, 19],
    leistungsortFest: true,
    leistungKonkret: false,
  });
  assert.equal(p.einzweckZulaessig, false);
  assert.equal(p.empfehlung, 'mehrzweck');
  assert.equal(p.stimmtMitWahl, false);
  assert.match(p.hinweis, /ACHTUNG/);
  assert.match(p.hinweis, /zu früh gemeldet/);
});

test('ein Friseur mit nur einem Steuersatz kann es', () => {
  const p = pruefeGutscheinTyp({
    gewaehlt: 'einzweck',
    moeglicheSteuersaetze: [19],
    leistungsortFest: true,
    leistungKonkret: true,
  });
  assert.equal(p.einzweckZulaessig, true);
  assert.equal(p.empfehlung, 'einzweck');
  assert.equal(p.stimmtMitWahl, true);
});

test('ein offener Leistungsort schliesst den Einzweckgutschein aus', () => {
  const p = pruefeGutscheinTyp({ moeglicheSteuersaetze: [19], leistungsortFest: false });
  assert.equal(p.einzweckZulaessig, false);
  assert.ok(p.gruende.some((g) => /Leistungsort/.test(g)));
});

test('IM ZWEIFEL MEHRZWECK — fehlende Angaben fuehren nicht zu Einzweck', () => {
  const p = pruefeGutscheinTyp({});
  assert.equal(p.einzweckZulaessig, false);
  assert.equal(p.empfehlung, 'mehrzweck');
  assert.ok(p.gruende.length >= 2, 'und es wird gesagt, was fehlt');
});

test('Mehrzweck trotz zulaessigem Einzweck wird angesprochen, nicht verboten', () => {
  const p = pruefeGutscheinTyp({
    gewaehlt: 'mehrzweck', moeglicheSteuersaetze: [19], leistungsortFest: true,
  });
  assert.equal(p.stimmtMitWahl, true, 'die vorsichtige Einstufung ist kein Fehler');
  assert.match(p.hinweis, /verschiebt die Steuer/);
});

test('WANN die Steuer entsteht — Einzweckgutschein', () => {
  assert.equal(steuerZeitpunkt('einzweck', 'ausgabe', 119, 19).ereignis, 'ausgabe');
  assert.equal(steuerZeitpunkt('einzweck', 'ausgabe', 119, 19).steuer, 19);
  assert.equal(steuerZeitpunkt('einzweck', 'einloesung', 119, 19).ereignis, 'keine');
  assert.equal(steuerZeitpunkt('einzweck', 'einloesung', 119, 19).steuer, 0, 'nicht doppelt');
});

test('WANN die Steuer entsteht — Mehrzweckgutschein', () => {
  assert.equal(steuerZeitpunkt('mehrzweck', 'ausgabe', 119, 19).ereignis, 'keine');
  assert.equal(steuerZeitpunkt('mehrzweck', 'einloesung', 119, 19).ereignis, 'einloesung');
  assert.equal(steuerZeitpunkt('mehrzweck', 'einloesung', 119, 19).steuer, 19);
});

test('DER FALL, DEN FAST NIEMAND AUF DEM SCHIRM HAT: der Verfall', () => {
  const ez = steuerZeitpunkt('einzweck', 'verfall', 119, 19);
  assert.equal(ez.steuer, 0);
  assert.match(ez.hinweis, /BLEIBT/, 'die bei der Ausgabe gezahlte Steuer ist weg');

  const mz = steuerZeitpunkt('mehrzweck', 'verfall', 119, 19);
  assert.equal(mz.steuer, 0);
  assert.match(mz.hinweis, /steuerfreier Ertrag/);
  assert.match(mz.hinweis, /den es nie gegeben hat/);
});

test('ALTBESTAND: nettoAusBrutto rechnet unveraendert', () => {
  const a = nettoAusBrutto(119, 19);
  assert.equal(a.netto, 100);
  assert.equal(a.mwst, 19);
});

// ===========================================================================
// TEIL 3 — DIE TERMINZAHLUNGEN
// ===========================================================================

test('die drei Termine und ihre Regeln sind benannt', () => {
  const arten = TERMIN_ARTEN.map((a) => a.key);
  for (const k of ['ustva', 'lohnsteuer', 'sozialversicherung']) assert.ok(arten.includes(k), k);
  for (const a of TERMIN_ARTEN) assert.ok(a.regel.length > 10, a.key);
});

test('Umsatzsteuer und Lohnsteuer am 10. des Folgemonats', () => {
  assert.equal(terminFuer('ustva', '2026-09-15'), '2026-10-10');
  assert.equal(terminFuer('lohnsteuer', '2026-09-15'), '2026-10-10');
});

test('FEHLER 3 — die Dauerfristverlaengerung verschiebt um einen Monat', () => {
  assert.equal(terminFuer('ustva', '2026-09-15', { dauerfristverlaengerung: true }), '2026-11-10');
  assert.equal(terminFuer('lohnsteuer', '2026-09-15', { dauerfristverlaengerung: true }), '2026-10-10',
    'die Lohnsteuer kennt keine Dauerfristverlaengerung');
});

test('ueber den Jahreswechsel', () => {
  assert.equal(terminFuer('ustva', '2026-12-05'), '2027-01-10');
  assert.equal(terminFuer('ustva', '2026-12-05', { dauerfristverlaengerung: true }), '2027-02-10');
});

test('FEHLER 2 — die Sozialversicherung am DRITTLETZTEN BANKARBEITSTAG', () => {
  // September 2026 endet am Mittwoch, dem 30. Die drei letzten
  // Bankarbeitstage sind der 30., 29. und 28.
  const sep = drittletzterBankarbeitstag(2026, 9);
  assert.equal(sep.datum, '2026-09-28');
  assert.equal(sep.nurWochenenden, true, 'Feiertage sind ehrlich NICHT eingerechnet');

  // Dezember 2026 endet an einem Donnerstag.
  assert.equal(drittletzterBankarbeitstag(2026, 12).datum, '2026-12-29');
  assert.equal(terminFuer('sozialversicherung', '2026-09-15'), '2026-09-28');
});

test('BANKARBEITSTAGE, NICHT KALENDERTAGE — an einem Monat, wo es auseinandergeht', () => {
  // Der September 2026 taugt dafuer NICHT: er endet an einem Mittwoch, da sind
  // die drei letzten Kalendertage zugleich die drei letzten Bankarbeitstage.
  // Genau daran blieb die Gegenprobe zuerst gruen — Lehre 8, zum dritten Mal.
  //
  // Mai 2026 endet an einem SONNTAG. Drei Kalendertage rueckwaerts waeren der
  // 29.05., drei BANKARBEITSTAGE der 27.05. — zwei Tage Unterschied, und der
  // SV-Beitrag geht damit zwei Tage frueher ab, als eine Kalenderrechnung sagt.
  assert.equal(drittletzterBankarbeitstag(2026, 5).datum, '2026-05-27');
  assert.notEqual(drittletzterBankarbeitstag(2026, 5).datum, '2026-05-29');

  // Weitere Monate, an denen es auseinandergeht — alle per Skript gesucht:
  assert.equal(drittletzterBankarbeitstag(2026, 8).datum, '2026-08-27');   // endet Montag
  assert.equal(drittletzterBankarbeitstag(2026, 10).datum, '2026-10-28');  // endet Samstag
  assert.equal(drittletzterBankarbeitstag(2026, 11).datum, '2026-11-26');  // endet Montag
  assert.equal(drittletzterBankarbeitstag(2026, 2).datum, '2026-02-25');   // endet Samstag

  for (const m of [2, 5, 8, 10, 11]) {
    const d = new Date(drittletzterBankarbeitstag(2026, m).datum + 'T00:00:00Z').getUTCDay();
    assert.ok(d >= 1 && d <= 5, 'Monat ' + m + ' liegt nicht auf einem Werktag');
  }
});

test('FEHLER 1 — die Termine landen in IHRER Woche, nicht verteilt', () => {
  const e = {
    startSaldo: 15000,
    offene: [{ rest: 8000, faelligkeitsdatum: '2026-10-15' }],
    fixkostenProMonat: 12000,
    jetztIso: '2026-09-21T00:00:00Z',
    wochen: 8,
  };
  const mit = vorschauMitTerminen(e, [
    { art: 'ustva', betrag: 6200 },
    { art: 'lohnsteuer', betrag: 3100 },
    { art: 'sozialversicherung', betrag: 9800 },
  ]);

  assert.equal(mit.summeTermine, 19100);
  assert.equal(mit.termine.length, 2, 'zwei Wochen sind betroffen, nicht acht');
  const sv = mit.termine.find((t) => t.arten.includes('sozialversicherung'));
  assert.equal(sv.betrag, 9800, 'der SV-Beitrag geht an EINEM Tag ab');
  const steuern = mit.termine.find((t) => t.arten.includes('ustva'));
  assert.equal(steuern.betrag, 9300, 'USt und Lohnsteuer fallen auf denselben Tag');
});

test('DER EIGENTLICHE PUNKT: welche Woche erst durch die Termine ins Minus rutscht', () => {
  const e = {
    startSaldo: 15000,
    offene: [{ rest: 8000, faelligkeitsdatum: '2026-10-15' }],
    fixkostenProMonat: 12000,
    jetztIso: '2026-09-21T00:00:00Z',
    wochen: 8,
  };
  const ohne = liquiditaetsVorschau(e);
  const mit = vorschauMitTerminen(e, [
    { art: 'ustva', betrag: 6200 },
    { art: 'lohnsteuer', betrag: 3100 },
    { art: 'sozialversicherung', betrag: 9800 },
  ]);

  assert.ok(mit.endSaldo < ohne.endSaldo - 19000, 'die Termine schlagen voll durch');
  assert.ok(mit.nurWegenTerminen.length > 0, 'mindestens eine Woche kippt erst dadurch');
  assert.ok(mit.hinweise.some((h) => /ins Minus/.test(h)));
});

test('Termine ausserhalb des Zeitraums werden gemeldet, nicht verschluckt', () => {
  const mit = vorschauMitTerminen(
    { startSaldo: 5000, offene: [], fixkostenProMonat: 0, jetztIso: '2026-09-21T00:00:00Z', wochen: 2 },
    [{ art: 'sonstige', betrag: 4000, faelligISO: '2027-03-01' }],
  );
  assert.equal(mit.ausserhalb, 4000);
  assert.equal(mit.summeTermine, 0);
  assert.ok(mit.hinweise.some((h) => /außerhalb des Vorschauzeitraums/.test(h)));
});

test('EHRLICH: der SV-Termin ist ohne Feiertage gerechnet, und das steht da', () => {
  const mit = vorschauMitTerminen(
    { startSaldo: 5000, offene: [], fixkostenProMonat: 0, jetztIso: '2026-09-21T00:00:00Z', wochen: 4 },
    [{ art: 'sozialversicherung', betrag: 1000 }],
  );
  assert.ok(mit.hinweise.some((h) => /ohne Feiertage/.test(h)));
});

test('ALTBESTAND: die Vorschau ohne Termine rechnet unveraendert', () => {
  const e = { startSaldo: 10000, offene: [], fixkostenProMonat: 5200, jetztIso: '2026-09-21T00:00:00Z', wochen: 4 };
  const alt = liquiditaetsVorschau(e);
  const neu = vorschauMitTerminen(e, []);
  assert.equal(neu.endSaldo, alt.endSaldo);
  assert.equal(neu.summeAbfluss, alt.summeAbfluss);
  assert.deepEqual(neu.punkte.map((p) => p.saldo), alt.punkte.map((p) => p.saldo));
});

// ===========================================================================
// TEIL 4 — DIE MITWACHSENDE TOLERANZ
// ===========================================================================

test('GEMESSEN: wie weit die Toleranz mitwuchs', () => {
  assert.equal(TOLERANZ_MIN, 0.02);
  assert.equal(TOLERANZ_PROZENT, 0.5);
  assert.equal(TOLERANZ_MAX, 1.00);

  // Bei kleinen Betraegen aendert sich nichts.
  assert.equal(toleranzFuer(50), 0.25);
  assert.equal(toleranzFuer(200), 1.00);
  // Darueber greift die Obergrenze. Alt waeren es 50,00 bzw. 500,00 EUR.
  assert.equal(toleranzFuer(10000), 1.00);
  assert.equal(toleranzFuer(100000), 1.00);
});

test('DER FALL, DER DURCHRUTSCHTE: 30 EUR Fehler bei einer 11.870-EUR-Rechnung', () => {
  const k = pruefeKonsistenz(10000, 1900, 11870);
  // Netto + USt sind 11.900, auf dem Beleg stehen 11.870.
  assert.equal(k.bruttoSoll, 11900);
  assert.equal(k.differenz, -30);
  // Alte Toleranz waere 0,5 % von 11.870 = 59,35 EUR gewesen — der Fehler
  // waere als "stimmt" durchgegangen.
  assert.ok(11870 * 0.005 > 30, 'die alte Toleranz war groesser als der Fehler');
  assert.equal(k.stimmt, false, 'jetzt wird er gemeldet');
  assert.match(k.hinweis, /30,00 EUR Abweichung/);
});

test('echte Rundungsunschaerfen gehen weiter durch', () => {
  assert.equal(pruefeKonsistenz(100, 19, 119.01).stimmt, true, 'ein Cent');
  assert.equal(pruefeKonsistenz(1000, 190, 1190.5).stimmt, true, 'fuenfzig Cent bei OCR');
  assert.equal(pruefeKonsistenz(1000, 190, 1191.5).stimmt, false, 'anderthalb Euro nicht mehr');
});

test('die angewandte Toleranz steht im Ergebnis', () => {
  const k = pruefeKonsistenz(10000, 1900, 11900);
  assert.equal(k.toleranz, 1.00, 'nachvollziehbar, warum etwas durchging');
});

test('ZWEITER BEFUND: ein unmoeglicher Steuersatz wird erkannt', () => {
  // In sich stimmig — 100 + 50 = 150 — aber 50 Prozent Umsatzsteuer gibt es nicht.
  const k = pruefeKonsistenz(100, 50, 150);
  assert.equal(k.stimmt, true, 'die Summe geht auf');
  assert.equal(k.satzGerechnet, 50);
  assert.equal(k.satzUnueblich, true);
  assert.match(k.hinweis, /passt zu keinem deutschen/);
});

test('die ueblichen Saetze loesen keinen Hinweis aus', () => {
  for (const satz of UEBLICHE_SAETZE) {
    const netto = 1000;
    const ust = Math.round(netto * satz) / 100;
    const k = pruefeKonsistenz(netto, ust, netto + ust);
    assert.equal(k.satzUnueblich, false, satz + ' %');
  }
});

test('ohne Umsatzsteuer gibt es keinen Satz zu pruefen', () => {
  const k = pruefeKonsistenz(100, 0, 100);
  assert.equal(k.satzUnueblich, false, 'ein Kleinunternehmer weist keine USt aus');
  assert.equal(k.hinweis, null);
});

test('fehlende Werte werden weiter gar nicht geprueft', () => {
  const k = pruefeKonsistenz(null, 19, 119);
  assert.equal(k.geprueft, false);
  assert.equal(k.stimmt, true, 'keine Warnung bei fehlender Angabe');
});

test('ALTBESTAND: die Dublettenerkennung ist unveraendert', () => {
  const liste = [{ id: 'a', belegnummer: 'RE-100', lieferant: 'Müller GmbH' }];
  assert.equal(istDublette({ belegnummer: 're 100', lieferant: 'müller gmbh' }, liste), true);
  assert.equal(istDublette({ belegnummer: 'RE-101', lieferant: 'Müller GmbH' }, liste), false);
  assert.equal(istDublette({ belegnummer: '', lieferant: 'Müller GmbH' }, liste), false);
});
