// ============================================================================
// tests/geldRechnerP30.test.mjs
//
// PUNKT 30 — Paket 2, Gruppe 2: die RECHNENDEN Bausteine an lib/zahlen.ts
// angeschlossen.
//
//   lib/controlling.ts · lib/einkauf.ts · lib/ertraege.ts · lib/event.ts
//   lib/expose.ts · lib/gutachten.ts · lib/gutscheine.ts · lib/hilfsmittel.ts
//   lib/schlagkartei.ts · lib/spenden.ts · lib/etiketten.ts
//   app/dashboard/_components/anfahrtLogik.ts
//
// ▄▄▄ DIE LEHRE AUS DIESEM PAKET ▄▄▄
// Der erste Anlauf tauschte nur die Cent-Rundung aus: r2() las danach ueber
// leseZahlOder und rundete symmetrisch. Die Messung zeigte: das Ergebnis
// blieb falsch. Der Grund ist einfach und wichtig —
//
//     DIE RECHNUNG PASSIERT VOR DEM RUNDEN.
//
// Steht der Umsatz als "10.000" in der Zeile, macht JavaScript schon bei
// i.umsatz - i.wareneinsatz stillschweigend die Zahl 10 daraus. Was das
// Runden danach sieht, ist bereits der falsche Wert. Deshalb wird in diesem
// Paket ZUERST GELESEN und DANN GERECHNET — an 115 Stellen in zwoelf Dateien.
//
// Alle "vorher"-Werte in dieser Datei sind an der alten Fassung GEMESSEN,
// nicht geschaetzt.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ergebnis, liquiditaet, breakEven, stundensatz, pct, r2 } from '../out/controlling.js';
import { positionNetto, bruttoAusNetto, kalkuliereVk } from '../out/einkauf.js';
import { betrag as eventBetrag, einnahmen, auslastung, istAusverkauft } from '../out/event.js';
import { preisProM2, provision, energieKlasse, fehlendePflichtangaben } from '../out/expose.js';
import { honorar, summePositionen } from '../out/gutachten.js';
import { restwert, nettoAusBrutto, pruefeEinloesungBetrag } from '../out/gutscheine.js';
import { kvSumme, gesamtSumme } from '../out/hilfsmittel.js';
import { nSaldo, mengeGesamt, flaecheSumme } from '../out/schlagkartei.js';
import { euroInWorten, zahlInWorten, kleinbetrag } from '../out/spenden.js';
import { spezifischerErtrag, erloes } from '../out/ertraege.js';
import { kjAusKcal, kcalAusKj } from '../out/etiketten.js';
import { cent } from '../out/anfahrtLogik.js';

// ===========================================================================
// TEIL 1 — DER BEFUND: ZUERST RECHNEN, DANN LESEN GEHT SCHIEF
// ===========================================================================

test('BEFUND: eine Umsatzrendite von 20 % stand als -79.900 % da', () => {
  // GEMESSEN an der alten Fassung. Derselbe Betrieb, einmal als Zahl und
  // einmal so, wie Supabase eine numeric-Spalte oft liefert: als Text.
  const alsZahl = ergebnis({ umsatz: 10000, wareneinsatz: 3000, personalkosten: 4000, sonstigeKosten: 1000 });
  const alsText = ergebnis({ umsatz: '10.000', wareneinsatz: 3000, personalkosten: 4000, sonstigeKosten: 1000 });

  assert.deepEqual(alsText, alsZahl, 'Text und Zahl muessen dasselbe ergeben');
  assert.equal(alsZahl.rohertrag, 7000);
  assert.equal(alsZahl.umsatzrendite, 20, 'vorher -79900');
  assert.equal(alsZahl.personalkostenquote, 40, 'vorher 40000');
});

test('BEFUND: der Break-even lag bei 250 Euro statt bei 250.000 Euro', () => {
  const b = breakEven('100.000', '40', '250.000');
  assert.equal(b.breakEvenUmsatz, 250000, 'vorher 250');
  assert.equal(b.sicherheitsabstand, 0);
});

test('die Kennzahlen bleiben in sich stimmig', () => {
  // Ohne Personal- und sonstige Kosten MUSS der Rohertrag gleich dem
  // Betriebsergebnis sein. Die alte Rundung brach das: bei Umsatz 29,481
  // und Wareneinsatz 747,316 stand einmal -717,83 und einmal -717,84.
  const e = ergebnis({ umsatz: 29.481, wareneinsatz: 747.316, personalkosten: 0, sonstigeKosten: 0 });
  assert.equal(e.rohertrag, e.betriebsergebnis,
    'Rohertrag und Betriebsergebnis muessen hier dieselbe Zahl sein');
  assert.equal(e.rohertragsquote, e.umsatzrendite);
});

test('Liquiditaet und Stundensatz lesen ihre Eingaben', () => {
  assert.deepEqual(
    liquiditaet({ liquide: '12.500', forderungen: '5.000', vorraete: 0, kurzVerb: '25.000' }),
    liquiditaet({ liquide: 12500, forderungen: 5000, vorraete: 0, kurzVerb: 25000 }),
  );
  assert.deepEqual(stundensatz('120.000', '1.600', '20'), { kostenSatz: 75, mitGewinn: 90 });
});

// ===========================================================================
// TEIL 2 — WO ES UM GELD GEGENUEBER DEM KUNDEN GING
// ===========================================================================

test('BEFUND: ein Gutschein ueber 1.000 Euro zeigte 1,00 Euro Restwert', () => {
  // Das ist der Fall, der beim Kunden am Tresen auffaellt: er will 200 Euro
  // einloesen und bekommt zu hoeren, es seien nur noch 1,00 Euro uebrig.
  const g = { wert: '1.000', eingeloest: 0, status: 'aktiv', gueltig_bis: null };
  const p = pruefeEinloesungBetrag(g, 200);
  assert.equal(p.ok, true, 'vorher: abgelehnt mit "Nur noch 1.00 € Restwert verfuegbar."');
  assert.equal(p.neuerRest, 800);

  assert.equal(restwert('1.000', '250,50'), 749.5, 'vorher 1');
});

test('BEFUND: eine Einkaufsposition ueber 12.500 Euro summierte sich zu 0', () => {
  assert.equal(positionNetto({ menge: '1.000', ek_preis: '12,50' }), 12500, 'vorher 0');
  assert.deepEqual(
    bruttoAusNetto('1.234,56', 19),
    { netto: 1234.56, mwst: 234.57, brutto: 1469.13, mwstSatz: 19 },
    'vorher alles 0',
  );
});

test('BEFUND: eine Courtage von 16.065 Euro wurde zu 0,00 Euro', () => {
  const p = provision('450.000', '3,57');
  assert.equal(p.basis, 450000, 'vorher 450');
  assert.equal(p.prozent, 3.57, 'vorher 0');
  assert.equal(p.netto, 16065, 'vorher 0');
  assert.equal(p.brutto, 19117.35);
  assert.equal(preisProM2('450.000', '120,5'), 3734.44, 'vorher 0');
});

test('BEFUND: Teilnehmerbeitraege lagen um Faktor 1000 daneben', () => {
  assert.equal(eventBetrag('1.250', '2'), 2500, 'vorher 2,5');
  assert.deepEqual(
    einnahmen([{ status: 'angemeldet', betrag: '1.250', bezahlt: true }]),
    { erwartet: 1250, bezahlt: 1250, offen: 0 },
    'vorher 1,25',
  );
});

test('BEFUND: eine ausverkaufte Veranstaltung galt als zu 0,4 % ausgelastet', () => {
  assert.equal(auslastung('1.000', '250'), 1, 'vorher 0,004');
  assert.equal(istAusverkauft('1.000', '250'), true, 'vorher false — es wurde weiter verkauft');
});

test('BEFUND: ein Gutachten-Honorar wurde zu 0 Euro', () => {
  assert.equal(honorar('M2', '7,5'), 735, 'vorher 0');
  assert.equal(summePositionen([{ betrag: '12.500,50' }]), 12500.5, 'vorher 0');
});

test('BEFUND: ein Kostenvoranschlag summierte sich zu 0 Euro', () => {
  assert.equal(kvSumme([{ menge: '2', einzelpreis: '1.250,00' }]), 2500, 'vorher 0');
  assert.equal(gesamtSumme([{ menge: '2', einzelpreis: '1.250,00', mehrkosten: '100,00' }]), 2700);
});

test('die Anfahrt liest ihren Stufenbetrag jetzt auch als Text', () => {
  // cent() las vorher gar nicht: ein Stufenbetrag als "12,50" ergab NaN und
  // damit einen Gedankenstrich statt eines Betrages.
  assert.equal(cent('12,50'), 12.5, 'vorher NaN');
  assert.equal(cent('1.234,56'), 1234.56);
  assert.equal(cent(-2.675), -2.68, 'vorher -2,67');
  assert.equal(cent(null), 0);
  assert.ok(Number.isFinite(cent('Unsinn')), 'nie NaN');
});

// ===========================================================================
// TEIL 3 — WO ES UM PAPIERE GEHT, DIE EIN AMT LIEST
// ===========================================================================

test('BEFUND: die Zuwendungsbestaetigung schrieb "Null Euro" in Worten', () => {
  // § 50 EStDV verlangt den Betrag in Worten. Eine Spende ueber 1.234,56 Euro
  // stand als "Null Euro" auf der Bestaetigung.
  assert.equal(euroInWorten('1.234,56'), 'Eintausendzweihundertvierunddreißig Euro und 56 Cent',
    'vorher "Null Euro"');
  assert.equal(zahlInWorten('1.234'), 'eintausendzweihundertvierunddreißig', 'vorher "eins"');
  assert.equal(euroInWorten(1234.56), euroInWorten('1.234,56'), 'Zahl und Text gleich');
});

test('BEFUND: eine Spende ueber 1.000 Euro galt als Kleinbetragsspende', () => {
  // Die Grenze des vereinfachten Nachweises liegt bei 300 Euro
  // (§ 50 Abs. 4 EStDV). Ein Text-Betrag wurde zu 0 und lag damit immer
  // darunter — der Nachweis waere nicht ausreichend gewesen.
  assert.equal(kleinbetrag('1.000'), false, 'vorher true');
  assert.equal(kleinbetrag('500,00'), false, 'vorher true');
  assert.equal(kleinbetrag('250,00'), true, 'darunter bleibt es dabei');
  assert.equal(kleinbetrag(1000), false, 'bei Zahlen war es immer richtig');
});

test('BEFUND: das Expose meldete einen vorhandenen Energiekennwert als fehlend', () => {
  // GEG § 87: die Pflichtangaben. Ein Kennwert "150,5" war vorhanden, wurde
  // aber nicht gelesen — das Expose galt als unvollstaendig und bekam keine
  // Effizienzklasse.
  const e = {
    objekt_art: 'wohnung', energie_typ: 'bedarf',
    energiekennwert: '150,5', energietraeger: 'Gas', baujahr: '1985',
  };
  assert.deepEqual(fehlendePflichtangaben(e), [], 'vorher ["Energiekennwert"]');
  assert.equal(energieKlasse('150,5'), 'E', 'vorher null');
  assert.equal(energieKlasse('150,5'), energieKlasse(150.5));
});

test('BEFUND: der Stickstoff-Saldo hatte das falsche Vorzeichen', () => {
  // Duengebedarfsermittlung nach DueV. Aus einem Ueberschuss von 920 kg N
  // wurde ein Fehlbetrag von +178,9 — genau die falsche Richtung.
  assert.equal(nSaldo('180', '1.100'), -920, 'vorher 178,9');
  assert.equal(mengeGesamt('180', '12,5'), 2250, 'vorher 0');
  assert.equal(flaecheSumme([{ status: 'aktiv', flaeche_ha: '12,5' }]), 12.5);
});

test('BEFUND: das Lebensmittel-Etikett zeigte 5,23 kJ statt 5.230 kJ', () => {
  // LMIV Anhang XV: die Naehrwertangabe je 100 g.
  assert.equal(kjAusKcal('1.250'), 5230, 'vorher 5,23');
  assert.equal(kcalAusKj('5.230'), 1250);
});

test('BEFUND: der spezifische Ertrag einer PV-Anlage war 0', () => {
  assert.equal(spezifischerErtrag('9.500', '10,5'), 904.76, 'vorher 0');
  assert.equal(erloes('4.000', '8,2', '3.000', '32,5'), 1303, 'vorher 0');
});

// ===========================================================================
// TEIL 4 — WAS SICH NICHT AENDERN DARF
//
// Der ganze Sinn von Punkt 30: wo bisher schon Zahlen ankamen, bleibt jede
// Anzeige exakt so, wie sie war. Nur Text wird jetzt gelesen — und negative
// Betraege runden wie positive.
// ===========================================================================

test('WAECHTER: mit Zahlen rechnet alles wie vorher', () => {
  // Diese Werte sind an der ALTEN Fassung gemessen. Weicht hier etwas ab,
  // hat sich eine Anzeige veraendert, die sich nicht veraendern durfte.
  assert.deepEqual(
    ergebnis({ umsatz: 10000, wareneinsatz: 3000, personalkosten: 4000, sonstigeKosten: 1000 }),
    { rohertrag: 7000, rohertragsquote: 70, gesamtkosten: 8000, betriebsergebnis: 2000, umsatzrendite: 20, personalkostenquote: 40 },
  );
  assert.deepEqual(kalkuliereVk(100, 25, 20), {
    ekNetto: 100, selbstkosten: 125, vkNetto: 150, rohertrag: 50, aufschlagProz: 50, handelsspanneProz: 33.33,
  });
  assert.deepEqual(nettoAusBrutto(1000, 19), { brutto: 1000, netto: 840.34, mwstSatz: 19, mwst: 159.66 });
  assert.equal(preisProM2(450000, 120.5), 3734.44);
  assert.equal(pct(25, 200), 12.5);
});

test('ein fehlender Nenner ergibt weiter 0 und keinen Absturz', () => {
  assert.equal(pct(100, 0), 0);
  assert.equal(preisProM2(450000, 0), 0);
  assert.deepEqual(breakEven(100000, 0), { breakEvenUmsatz: null, sicherheitsabstand: null });
  assert.deepEqual(stundensatz(120000, 0, 20), { kostenSatz: null, mitGewinn: null });
});

test('nichts ergibt NaN, auch bei voelligem Unsinn', () => {
  const unsinn = ['abc', {}, [], null, undefined, Number.NaN, Infinity];
  for (const u of unsinn) {
    assert.ok(Number.isFinite(r2(u)), 'r2 bei ' + JSON.stringify(u));
    assert.ok(Number.isFinite(pct(u, 100)), 'pct bei ' + JSON.stringify(u));
    assert.ok(Number.isFinite(cent(u)), 'cent bei ' + JSON.stringify(u));
    assert.ok(Number.isFinite(positionNetto({ menge: u, ek_preis: u })), 'positionNetto bei ' + JSON.stringify(u));
    const e = ergebnis({ umsatz: u, wareneinsatz: u, personalkosten: u, sonstigeKosten: u });
    for (const [k, v] of Object.entries(e)) assert.ok(Number.isFinite(v), k + ' bei ' + JSON.stringify(u));
  }
});

test('die Rundung ist jetzt ueberall symmetrisch um Null', () => {
  // Eine Gutschrift muss runden wie eine Rechnung. Vorher kippte ein
  // negativer halber Cent nach oben statt weg von der Null.
  for (const [wert, soll] of [[-2.675, -2.68], [-0.125, -0.13], [-8.615, -8.62], [1.005, 1.01]]) {
    assert.equal(r2(wert), soll, 'r2(' + wert + ')');
    assert.equal(cent(wert), soll, 'cent(' + wert + ')');
  }
});

test('WAECHTER: Text und Zahl ergeben ueberall dasselbe', () => {
  // Die eigentliche Zusage dieses Pakets, quer ueber alle zwoelf Dateien.
  const paare = [
    ['positionNetto', () => positionNetto({ menge: '2', ek_preis: '1.250,50' }), () => positionNetto({ menge: 2, ek_preis: 1250.5 })],
    ['eventBetrag', () => eventBetrag('1.250', '2'), () => eventBetrag(1250, 2)],
    ['restwert', () => restwert('1.000', '250,50'), () => restwert(1000, 250.5)],
    ['kvSumme', () => kvSumme([{ menge: '2', einzelpreis: '1.250,00' }]), () => kvSumme([{ menge: 2, einzelpreis: 1250 }])],
    ['nSaldo', () => nSaldo('180', '1.100'), () => nSaldo(180, 1100)],
    ['honorar', () => honorar('M2', '7,5'), () => honorar('M2', 7.5)],
    ['kjAusKcal', () => kjAusKcal('1.250'), () => kjAusKcal(1250)],
    ['spezifischerErtrag', () => spezifischerErtrag('9.500', '10,5'), () => spezifischerErtrag(9500, 10.5)],
    ['preisProM2', () => preisProM2('450.000', '120,5'), () => preisProM2(450000, 120.5)],
    ['cent', () => cent('1.234,56'), () => cent(1234.56)],
  ];
  for (const [name, alsText, alsZahl] of paare) {
    assert.equal(alsText(), alsZahl(), name + ': Text und Zahl weichen ab');
  }
});
