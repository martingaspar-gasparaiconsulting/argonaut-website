// ============================================================================
// tests/steuerRechnerP29.test.mjs
//
// PUNKT 29b (R2b) — Tests fuer die Branchen-Rechner, Gruppe 2:
//   lib/betriebskosten.ts  (BetrKV, HeizkostenV)
//   lib/afa.ts             (GWG, lineare Abschreibung)
//   lib/reisekosten.ts     (Verpflegungspauschale, Fahrtkosten)
//
// betriebskosten.ts behauptete im Dateikopf "Node-getestet
// (betriebskosten.test.ts)". Diese Testdatei gab es im Repo NICHT — die
// VIERTE falsche Zusage nach bankAbgleich.ts, fristen.ts und provision.ts.
//
// Vier Befunde am 20.09.2026 am echten Code GEMESSEN.
//
// ABGRENZUNG: Was hier fehlt und NICHT gebaut wird, gehoert zu Punkt 65
// (Kleinkram gebuendelt): Reisekosten-Dreimonatsfrist, AfA-Sammelposten
// nach § 6 Abs. 2a EStG, Betriebskosten-Zwoelfmonatsfrist und der seit
// 30.06.2024 nicht mehr umlagefaehige Kabelanschluss. Punkt 29 ist Testen,
// nicht Ausbauen. Die Tests halten fest, was HEUTE passiert.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heizVerbrauchAnteil, heizAnteilGueltig, basisWert, summeBasis,
  anteilKostenart, abrechnungFuerEinheit, verteilteSumme, gesamtKosten,
  zaehleBk, bkHinweise,
  HEIZ_VERBRAUCH_MIN, HEIZ_VERBRAUCH_MAX, HEIZ_VERBRAUCH_STD,
  BETRKV_KATALOG, VERTEILER,
} from '../out/betriebskosten.js';
import { afaPlan, GWG_GRENZE } from '../out/afa.js';
import {
  verpflegung, fahrtkosten, round2,
  VP_VOLL, VP_TEIL, KUERZUNG, KM_SATZ,
} from '../out/reisekosten.js';

// ===========================================================================
// TEIL 1 — betriebskosten: DER SCHWERSTE BEFUND
// ===========================================================================

test('BEFUND: ohne erfassten Verbrauch verschwanden 70 % der Heizkosten', () => {
  // GEMESSEN: zwei Einheiten ohne Verbrauchswerte, 1.000 EUR Heizkosten
  // -> verteilt wurden 300 EUR. Die 700 EUR Verbrauchsanteil fielen weg,
  // ohne jede Meldung.
  const einheiten = [{ wohnflaeche: 50 }, { wohnflaeche: 50 }];
  const heiz = [{ bezeichnung: 'Heizung', betrag_gesamt: 1000, ist_heizkosten: true }];

  assert.equal(gesamtKosten(heiz), 1000);
  assert.equal(verteilteSumme(heiz, einheiten), 300, 'die Verteilung selbst bleibt unveraendert');

  const h = bkHinweise(einheiten, heiz);
  assert.ok(h.some((x) => /kein.*Verbrauch erfasst/i.test(x)), 'die Luecke MUSS gemeldet werden');
  assert.ok(h.some((x) => /700,00 €/.test(x)), 'und zwar mit dem Betrag');
  assert.ok(h.some((x) => /9a HeizkostenV/.test(x)), 'samt Rechtsgrundlage fuer die Schaetzung');
  assert.ok(h.some((x) => /bewusst nicht/.test(x)), 'und der Ansage, dass nicht geraten wird');
});

test('mit erfasstem Verbrauch geht die Heizkostenabrechnung auf', () => {
  const einheiten = [{ wohnflaeche: 50, verbrauch: 600 }, { wohnflaeche: 50, verbrauch: 400 }];
  const heiz = [{ bezeichnung: 'Heizung', betrag_gesamt: 1000, ist_heizkosten: true }];
  // 70 % nach Verbrauch (700), 30 % nach Flaeche (300)
  assert.equal(anteilKostenart(heiz[0], einheiten[0], einheiten), 570, '700x0,6 + 300x0,5');
  assert.equal(anteilKostenart(heiz[0], einheiten[1], einheiten), 430);
  assert.equal(verteilteSumme(heiz, einheiten), 1000);
  assert.deepEqual(bkHinweise(einheiten, heiz), []);
});

test('BEFUND: auch ein gewoehnlicher Verteiler ohne Basis wird gemeldet', () => {
  const einheiten = [{ wohnflaeche: 50 }, { wohnflaeche: 50 }];
  const k = [{ bezeichnung: 'Aufzug', betrag_gesamt: 240, verteiler: 'personen' }];
  assert.equal(verteilteSumme(k, einheiten), 0);
  const h = bkHinweise(einheiten, k);
  assert.ok(h.some((x) => /Personen/.test(x)));
  assert.ok(h.some((x) => /240,00 €/.test(x)));
});

test('BEFUND: die Centrundung der Verteilung wird benannt', () => {
  const drei = [{ wohnflaeche: 1 }, { wohnflaeche: 1 }, { wohnflaeche: 1 }];
  const k = [{ bezeichnung: 'Grundsteuer', betrag_gesamt: 100, verteiler: 'wohnflaeche' }];
  assert.equal(verteilteSumme(k, drei), 99.99, '100 EUR auf drei ergibt 3 x 33,33');
  const h = bkHinweise(drei, k);
  assert.ok(h.some((x) => /Differenz 0,01 €/.test(x)));
  assert.ok(h.some((x) => /kein Rechenfehler/.test(x)));
});

test('eine aufgehende Abrechnung meldet gar nichts', () => {
  const zwei = [{ wohnflaeche: 50 }, { wohnflaeche: 50 }];
  const k = [{ bezeichnung: 'Grundsteuer', betrag_gesamt: 100, verteiler: 'wohnflaeche' }];
  assert.equal(verteilteSumme(k, zwei), 100);
  assert.deepEqual(bkHinweise(zwei, k), []);
});

// --- Zahlen und Rundung ----------------------------------------------------

test('BEFUND: ein Betrag als deutscher Text wird gelesen, nicht zu 0', () => {
  assert.equal(gesamtKosten([{ betrag_gesamt: '1.234,56' }]), 1234.56, 'vorher 0,00 EUR');
  assert.equal(basisWert({ wohnflaeche: '72,50' }, 'wohnflaeche'), 72.5);
});

test('BEFUND: die Rundung trifft auch an der halben Cent-Grenze', () => {
  // ACHTUNG, hier lag ich beim ersten Entwurf falsch: 2,345 rundet in der
  // ALTEN und der neuen Fassung gleich (2,35), weil 2.345 x 100 in
  // Gleitkomma schon unter 234,5 liegt. Die Gegenprobe faerbte deshalb
  // NULL Tests rot — der Test war wertlos.
  //
  // Die Werte unten sind durch Absuchen GEMESSEN und unterscheiden sich
  // wirklich: alt 97,32 / richtig 97,33 und alt 1,00 / richtig 1,01.
  const a = abrechnungFuerEinheit(
    { wohnflaeche: 1, vorauszahlung: 100 },
    [{ bezeichnung: 'X', betrag_gesamt: 97.325, verteiler: 'wohnflaeche' }],
    [{ wohnflaeche: 1 }],
  );
  assert.equal(a.summeKosten, 97.33, 'vorher 97,32');
  assert.equal(a.saldo, -2.67, 'und damit auch das Guthaben um einen Cent daneben');

  const b = abrechnungFuerEinheit(
    { wohnflaeche: 1, vorauszahlung: 1.005 },
    [{ bezeichnung: 'X', betrag_gesamt: 0, verteiler: 'wohnflaeche' }],
    [{ wohnflaeche: 1 }],
  );
  assert.equal(b.vorauszahlung, 1.01, 'vorher 1,00 — ein Cent verschluckt');
  assert.equal(b.saldo, -1.01);
});

test('BEFUND: ein GUTHABEN rundet nicht anders als eine Nachzahlung', () => {
  // Symmetrie um Null, direkt an der Kostenart gemessen.
  const einheiten = [{ wohnflaeche: 1 }];
  const hin = anteilKostenart({ betrag_gesamt: 2.675, verteiler: 'wohnflaeche' }, einheiten[0], einheiten);
  const zurueck = anteilKostenart({ betrag_gesamt: -2.675, verteiler: 'wohnflaeche' }, einheiten[0], einheiten);
  assert.equal(hin, 2.68);
  assert.equal(zurueck, -2.68, 'vorher -2,67: eine Rueckbuchung rundete anders');
});

// --- HeizkostenV § 7 -------------------------------------------------------

test('der Verbrauchsanteil bleibt im Bereich 50 bis 70 Prozent', () => {
  assert.equal(HEIZ_VERBRAUCH_MIN, 50);
  assert.equal(HEIZ_VERBRAUCH_MAX, 70);
  assert.equal(HEIZ_VERBRAUCH_STD, 70);
  assert.equal(heizVerbrauchAnteil(null), 70, 'ohne Angabe der Standard');
  assert.equal(heizVerbrauchAnteil(undefined), 70);
  assert.equal(heizVerbrauchAnteil(60), 60);
  assert.equal(heizVerbrauchAnteil(30), 50, 'nach unten begrenzt');
  assert.equal(heizVerbrauchAnteil(90), 70, 'nach oben begrenzt');
  assert.equal(heizVerbrauchAnteil(Number.NaN), 70);
});

test('ein unzulaessiger Verbrauchsanteil wird gezaehlt UND benannt', () => {
  const einheiten = [{ wohnflaeche: 50, verbrauch: 1 }, { wohnflaeche: 50, verbrauch: 1 }];
  const k = [{ bezeichnung: 'Heizung', betrag_gesamt: 1000, ist_heizkosten: true, verbrauch_anteil_prozent: 90 }];
  assert.equal(heizAnteilGueltig(90), false);
  assert.equal(heizAnteilGueltig(70), true, 'genau 70 ist noch erlaubt');
  assert.equal(heizAnteilGueltig(50), true, 'genau 50 auch');
  assert.equal(zaehleBk(einheiten, k).heizLuecken, 1);
  const h = bkHinweise(einheiten, k);
  assert.ok(h.some((x) => /7 HeizkostenV/.test(x) && /90/.test(x)));
});

test('der BetrKV-Katalog hat alle 17 Kostenarten', () => {
  assert.equal(BETRKV_KATALOG.length, 17);
  assert.deepEqual(BETRKV_KATALOG.map((k) => k.nr), Array.from({ length: 17 }, (_, i) => i + 1));
  assert.equal(BETRKV_KATALOG.filter((k) => k.heiz).length, 3, 'Heizung, Warmwasser, verbunden');
  assert.equal(VERTEILER.length, 4);
});

test('die Kennzahlen zaehlen Nachzahler und Salden richtig', () => {
  const einheiten = [
    { wohnflaeche: 50, vorauszahlung: 40 },   // Anteil 50 -> Nachzahlung
    { wohnflaeche: 50, vorauszahlung: 80 },   // Anteil 50 -> Guthaben
  ];
  const k = [{ bezeichnung: 'Grundsteuer', betrag_gesamt: 100, verteiler: 'wohnflaeche' }];
  const z = zaehleBk(einheiten, k);
  assert.equal(z.einheiten, 2);
  assert.equal(z.kostenGesamt, 100);
  assert.equal(z.vorauszahlungGesamt, 120);
  assert.equal(z.saldoGesamt, -20);
  assert.equal(z.nachzahler, 1);
});

test('der Verteiler "einheiten" gibt jeder Einheit gleich viel', () => {
  const vier = [{}, {}, {}, {}];
  const k = [{ bezeichnung: 'Aufzug', betrag_gesamt: 400, verteiler: 'einheiten' }];
  assert.equal(summeBasis(vier, 'einheiten'), 4);
  assert.equal(anteilKostenart(k[0], vier[0], vier), 100);
  assert.equal(verteilteSumme(k, vier), 400);
});

test('eine Kostenart ueber 0,00 EUR erzeugt keinen Anteil', () => {
  const zwei = [{ wohnflaeche: 50 }, { wohnflaeche: 50 }];
  assert.equal(anteilKostenart({ betrag_gesamt: 0, verteiler: 'wohnflaeche' }, zwei[0], zwei), 0);
});

// ===========================================================================
// TEIL 2 — afa
// ===========================================================================

test('BEFUND: Anschaffungskosten als Text werden gelesen', () => {
  // Vorher: "1.234,56" -> Number() -> NaN -> 0. Ein Wirtschaftsgut mit
  // 0 EUR faellt durch den GWG-Zweig (k > 0) in die lineare AfA und
  // schreibt jahrelang 0,00 EUR ab.
  const p = afaPlan('1.234,56', 5, '2026-01-15', 2026);
  assert.equal(p.methode, 'linear');
  assert.equal(p.jahresAfa, 246.91, 'vorher 0,00 EUR');
  const g = afaPlan('750,00', 5, '2026-01-15', 2026);
  assert.equal(g.methode, 'gwg', 'vorher fiel das GWG in die lineare AfA');
  assert.equal(g.afaStichjahr, 750);
});

test('die GWG-Grenze liegt bei 800 EUR netto, einschliesslich', () => {
  assert.equal(GWG_GRENZE, 800);
  assert.equal(afaPlan(800, 5, '2026-06-01', 2026).methode, 'gwg', 'genau 800 ist noch GWG');
  assert.equal(afaPlan(800.01, 5, '2026-06-01', 2026).methode, 'linear');
  const g = afaPlan(800, 5, '2026-06-01', 2026);
  assert.equal(g.afaStichjahr, 800, 'voll im Anschaffungsjahr, auch bei Anschaffung im Juni');
  assert.equal(g.restbuchwertHeute, 0);
  assert.match(g.hinweis, /Sofortabschreibung/);
});

test('lineare AfA rechnet im ersten Jahr monatsgenau', () => {
  // 12.000 EUR, 10 Jahre, Anschaffung im Oktober -> 3 von 12 Monaten
  const p = afaPlan(12000, 10, '2026-10-15', 2026);
  assert.equal(p.jahresAfa, 1200);
  assert.equal(p.afaStichjahr, 300, '1.200 x 3/12');
  assert.equal(p.restbuchwertHeute, 11700);
  assert.match(p.hinweis, /monatsgenau ab 10\/2026/);
});

test('Anschaffung im Januar schreibt das volle erste Jahr ab', () => {
  const p = afaPlan(12000, 10, '2026-01-01', 2026);
  assert.equal(p.afaStichjahr, 1200);
});

test('Anschaffung im Dezember schreibt ein Zwoelftel ab', () => {
  const p = afaPlan(12000, 10, '2026-12-31', 2026);
  assert.equal(p.afaStichjahr, 100);
});

test('DIE INVARIANTE: der Plan schreibt genau die Anschaffungskosten ab', () => {
  for (const kosten of [12000, 5000, 1234.56, 999.99, 30000]) {
    for (const nd of [3, 5, 8, 10, 13]) {
      for (const monat of ['01', '04', '07', '12']) {
        const p = afaPlan(kosten, nd, `2026-${monat}-15`, 2026);
        const summe = Math.round(p.plan.reduce((s, j) => s + j.afa, 0) * 100) / 100;
        assert.equal(summe, Math.round(kosten * 100) / 100,
          `${kosten} EUR / ${nd} Jahre / ab ${monat}: Plan summiert ${summe}`);
        assert.equal(p.plan[p.plan.length - 1].restbuchwert, 0, 'am Ende muss 0 stehen');
      }
    }
  }
});

test('eine Nutzungsdauer von einem Jahr schreibt sofort voll ab', () => {
  const p = afaPlan(5000, 1, '2026-09-01', 2026);
  assert.equal(p.afaStichjahr, 5000);
  assert.equal(p.restbuchwertHeute, 0);
  assert.match(p.hinweis, /voller Abzug/);
});

test('ein Stichjahr vor der Anschaffung zeigt den vollen Buchwert', () => {
  const p = afaPlan(12000, 10, '2026-05-01', 2025);
  assert.equal(p.afaStichjahr, 0);
  assert.equal(p.restbuchwertHeute, 12000);
});

test('ein Stichjahr nach dem Planende zeigt 0', () => {
  const p = afaPlan(12000, 5, '2026-01-01', 2040);
  assert.equal(p.afaStichjahr, 0);
  assert.equal(p.restbuchwertHeute, 0);
});

test('ohne Anschaffungsdatum wird nichts gerechnet, sondern gesagt', () => {
  assert.match(afaPlan(12000, 10, null).hinweis, /Anschaffungsdatum angeben/);
  assert.match(afaPlan(12000, 10, '2026').hinweis, /Anschaffungsdatum angeben/);
  assert.equal(afaPlan(12000, 10, null).restbuchwertHeute, 12000, 'der Buchwert bleibt stehen');
});

test('ein unmoeglicher Monat wird auf Dezember begrenzt — festgehalten', () => {
  // Der Code klemmt den Monat auf 1..12. Das ist keine Panne, aber es
  // ueberrascht: "2026-13-01" rechnet wie Dezember, nicht wie ein Fehler.
  const p = afaPlan(12000, 10, '2026-13-01', 2026);
  assert.equal(p.afaStichjahr, 100, 'wie Dezember: ein Zwoelftel');
});

// ===========================================================================
// TEIL 3 — reisekosten
// ===========================================================================

test('BEFUND: zwei Stunden ueber Mitternacht ergeben nicht 28 EUR', () => {
  // GEMESSEN vorher: Abreise 23:00, Rueckkehr 01:00 -> brutto 28 EUR,
  // weil nur die Kalendertage gezaehlt wurden. Wer zwei Stunden unterwegs
  // ist, hat nicht uebernachtet.
  const v = verpflegung('2026-03-15T23:00:00', '2026-03-16T01:00:00');
  assert.equal(v.brutto, 0, 'vorher 28,00 EUR');
  assert.equal(v.netto, 0);
  assert.equal(v.teilTage, 0);
  assert.match(v.hinweis, /ohne Übernachtung/);
  assert.match(v.hinweis, /unter 8 Std/);
});

test('BEFUND: ueber Mitternacht und laenger als 8 Std. bleibt, wird aber benannt', () => {
  // Hier kann der Code NICHT wissen, ob uebernachtet wurde. Also rechnen
  // wie bisher und den Vorbehalt sagen — nicht raten.
  const v = verpflegung('2026-03-15T18:00:00', '2026-03-16T08:00:00');
  assert.equal(v.brutto, 28, '14 Std., An- und Abreisetag');
  assert.match(v.hinweis, /9 Abs\. 4a EStG/);
  assert.match(v.hinweis, /NICHT übernachtet/);
});

test('die Verpflegungssaetze stehen fest', () => {
  assert.equal(VP_VOLL, 28);
  assert.equal(VP_TEIL, 14);
  assert.equal(KUERZUNG.fruehstueck, 5.6, '20 % von 28');
  assert.equal(KUERZUNG.mittag, 11.2, '40 % von 28');
  assert.equal(KUERZUNG.abend, 11.2);
  assert.equal(KM_SATZ.pkw, 0.3);
  assert.equal(KM_SATZ.motorrad, 0.2);
});

test('die Eintagesregel greift genau bei mehr als 8 Stunden', () => {
  assert.equal(verpflegung('2026-03-15T08:00:00', '2026-03-15T16:00:00').brutto, 0, 'genau 8 Std. reicht nicht');
  assert.equal(verpflegung('2026-03-15T08:00:00', '2026-03-15T16:01:00').brutto, 14, 'eine Minute mehr genuegt');
});

test('eine mehrtaegige Reise zaehlt An- und Abreisetag plus volle Tage', () => {
  const v = verpflegung('2026-03-15T08:00:00', '2026-03-18T18:00:00');
  assert.equal(v.teilTage, 2);
  assert.equal(v.volleTage, 2, 'der 16. und der 17.');
  assert.equal(v.brutto, 2 * 14 + 2 * 28);
  assert.match(v.hinweis, /4 Reisetage/);
});

test('gestellte Mahlzeiten kuerzen die Pauschale', () => {
  const v = verpflegung('2026-03-15T08:00:00', '2026-03-17T18:00:00', { fruehstueck: 2, mittag: 1, abend: 1 });
  assert.equal(v.brutto, 56, '2 x 14 + 1 x 28');
  assert.equal(v.kuerzung, round2(2 * 5.6 + 11.2 + 11.2));
  assert.equal(v.netto, round2(56 - v.kuerzung));
});

test('die Kuerzung macht die Pauschale nie negativ', () => {
  const v = verpflegung('2026-03-15T08:00:00', '2026-03-15T18:00:00', { fruehstueck: 5, mittag: 5, abend: 5 });
  assert.equal(v.brutto, 14);
  assert.equal(v.netto, 0, 'nicht -126,00 EUR');
});

test('unbrauchbare Zeitangaben rechnen nichts, sondern sagen es', () => {
  assert.match(verpflegung(null, '2026-03-15').hinweis, /angeben/);
  assert.match(verpflegung('2026-03-15T10:00:00', '2026-03-15T08:00:00').hinweis, /nach der Abreise/);
  assert.match(verpflegung('Unsinn', 'Quatsch').hinweis, /nach der Abreise/);
  assert.equal(verpflegung(null, null).brutto, 0);
});

test('BEFUND: Kilometer als deutscher Text ergeben nicht 0,00 EUR', () => {
  assert.equal(fahrtkosten('1.234', 'pkw'), 370.2, 'vorher 0,00 EUR');
  assert.equal(fahrtkosten('120,5', 'pkw'), 36.15);
});

test('Fahrtkosten rechnen je Fahrzeug, Unbekanntes wie PKW', () => {
  assert.equal(fahrtkosten(100, 'pkw'), 30);
  assert.equal(fahrtkosten(100, 'motorrad'), 20);
  assert.equal(fahrtkosten(100, 'fahrrad'), 30, 'kein Satz hinterlegt -> PKW');
  assert.equal(fahrtkosten(null), 0);
  assert.equal(fahrtkosten(0), 0);
});

test('round2 rundet symmetrisch und liest deutsche Zahlen', () => {
  // -2,345 waere hier KEIN tragender Test: dort runden alte und neue
  // Fassung gleich. Diese Werte unterscheiden sich wirklich.
  assert.equal(round2(2.675), 2.68);
  assert.equal(round2(-2.675), -2.68, 'vorher -2,67');
  assert.equal(round2(1.005), 1.01, 'vorher 1,00');
  assert.equal(round2(-0.125), -0.13, 'vorher -0,12');
  assert.equal(round2('1.234,56'), 1234.56, 'vorher 0,00');
  assert.equal(round2('Unsinn'), 0);
});
