import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BELASTBAR_AB, zahl, werte, summiere, kette, zeit, beurteileZeit,
  hebelRangliste, bedarfFuerKunden, montagVon, wochenLabel, kanalLabel,
  ausAktivitaeten, wochenZeitraum,
} from '../out/vertriebsKette.js';

// ============================================================================
// Diese Tests halten fest, was lib/vertriebsKette.ts leisten muss — und vor
// allem, was sie NICHT tun darf: aus wenigen Ereignissen eine Quote machen,
// auf die jemand eine Entscheidung baut. Der Dateikopf nennt drei Regeln;
// jede davon hat hier ihren Test.
// ============================================================================

const WOCHE = {
  woche: '2026-09-07', kanal: 'social',
  beitraege: 20, ansprachen: 30,      // 50 hinaus
  reaktionen: 25, antworten: 12, gespraeche: 10,
  eintragungen: 8, termine_gebucht: 4, termine_gehalten: 3, kunden: 1,
  umsatz: 3000,
  min_inhalte: 240, min_ansprache: 180, min_gespraeche: 300, min_termine: 270,
};

test('zahl: Komma, Punkt, Unsinn und negative Werte', () => {
  assert.equal(zahl(12), 12);
  assert.equal(zahl('12,5'), 12.5);
  assert.equal(zahl('1.200'), 1200);
  assert.equal(zahl('abc'), 0);
  assert.equal(zahl(-5), 0);
  assert.equal(zahl(null), 0);
  assert.equal(zahl(undefined), 0);
});

test('werte: leere Zeile ergibt lauter Nullen, nie undefined', () => {
  const w = werte(null);
  Object.values(w).forEach((v) => assert.equal(v, 0));
});

test('kette: sieben Stufen, erste ohne Quote', () => {
  const k = kette(werte(WOCHE));
  assert.equal(k.length, 7);
  assert.equal(k[0].anzahl, 50);        // 20 Beitraege + 30 Ansprachen
  assert.equal(k[0].quote, null);       // keine Vorstufe
  assert.equal(k[0].vorher, null);
});

test('kette: Quoten rechnen gegen die jeweilige Vorstufe', () => {
  const k = kette(werte(WOCHE));
  const q = (s) => k.find((x) => x.schluessel === s);
  assert.equal(q('reaktionen').quote, 50);      // 25 von 50
  assert.equal(q('gespraeche').quote, 40);      // 10 von 25
  assert.equal(q('eintragungen').quote, 80);    // 8 von 10
  assert.equal(q('gebucht').quote, 50);         // 4 von 8
  assert.equal(q('gehalten').quote, 75);        // 3 von 4
  assert.equal(q('kunden').quote, 33.3);        // 1 von 3
});

test('REGEL 1: ohne Vorstufe gibt es keine Quote — null, nicht 0 Prozent', () => {
  const k = kette(werte({ beitraege: 0, ansprachen: 0, reaktionen: 0 }));
  assert.equal(k[1].quote, null);
  assert.notEqual(k[1].quote, 0);
});

test('Vorstufe da, Stufe null: das ist eine echte 0 und keine Luecke', () => {
  const k = kette(werte({ beitraege: 40, reaktionen: 0 }));
  assert.equal(k[1].quote, 0);
  assert.equal(k[1].verloren, 40);
});

test('REGEL 2: kleine Mengen sind nicht belastbar', () => {
  const k = kette(werte(WOCHE));
  assert.equal(k.find((s) => s.schluessel === 'reaktionen').belastbar, true);   // 50 davor
  assert.equal(k.find((s) => s.schluessel === 'kunden').belastbar, false);      // nur 3 davor
  assert.equal(BELASTBAR_AB, 10);
});

test('summiere: mehrere Wochen addieren sich, Quoten werden dadurch belastbar', () => {
  const vier = summiere([WOCHE, WOCHE, WOCHE, WOCHE]);
  assert.equal(vier.kunden, 4);
  assert.equal(vier.umsatz, 12000);
  const k = kette(vier);
  assert.equal(k.find((s) => s.schluessel === 'kunden').belastbar, true);       // jetzt 12 davor
  assert.equal(k.find((s) => s.schluessel === 'kunden').quote, 33.3);           // Quote bleibt gleich
});

test('summiere: leere Liste und Unsinn ergeben eine Nullzeile', () => {
  assert.equal(summiere([]).kunden, 0);
  assert.equal(summiere(null).beitraege, 0);
  assert.equal(summiere([null, undefined]).umsatz, 0);
});

test('zeit: Minuten, Stunden und die Zahl je Kunde', () => {
  const z = zeit(werte(WOCHE));
  assert.equal(z.minutenGesamt, 990);            // 240+180+300+270
  assert.equal(z.stundenGesamt, 16.5);
  assert.equal(z.minJeGespraech, 30);            // 300 / 10
  assert.equal(z.minJeGehaltenemTermin, 90);     // 270 / 3
  assert.equal(z.stundenJeKunde, 16.5);          // ein Kunde in dieser Woche
});

test('zeit: Stundensatz ist Umsatz je eingesetzter Stunde', () => {
  const z = zeit(werte(WOCHE));
  assert.equal(z.stundensatz, 181.82);           // 3000 / 16,5
});

test('REGEL 3: ohne Zeit oder ohne Kunden wird nichts geschaetzt', () => {
  const ohneZeit = zeit(werte({ kunden: 2, umsatz: 5000 }));
  assert.equal(ohneZeit.stundensatz, null);
  assert.equal(ohneZeit.minJeKunde, null);

  const ohneKunden = zeit(werte({ min_gespraeche: 600, umsatz: 0 }));
  assert.equal(ohneKunden.stundenJeKunde, null);
  assert.equal(ohneKunden.stundensatz, null);
  assert.equal(ohneKunden.stundenGesamt, 10);    // die Zeit selbst steht trotzdem
});

test('beurteileZeit: ohne Vergleichswert bleibt das Urteil offen', () => {
  assert.equal(beurteileZeit(180, 0).urteil, 'offen');
  assert.equal(beurteileZeit(null, 90).urteil, 'offen');
  assert.equal(beurteileZeit(180, null).faktor, null);
});

test('beurteileZeit: doppelter Vergleichswert lohnt, darunter wird es eng', () => {
  assert.equal(beurteileZeit(200, 90).urteil, 'lohnt');        // Faktor 2,2
  assert.equal(beurteileZeit(120, 90).urteil, 'grenzwertig');  // Faktor 1,3
  assert.equal(beurteileZeit(60, 90).urteil, 'abgeben');       // Faktor 0,67
  assert.equal(beurteileZeit(60, 90).faktor, 0.67);
});

test('hebelRangliste: sortiert nach dem groessten Zuwachs an Kunden', () => {
  const liste = hebelRangliste(werte(WOCHE), 5);
  assert.equal(liste.length, 6);
  for (let i = 1; i < liste.length; i++) {
    assert.ok(liste[i - 1].gewinn >= liste[i].gewinn, 'Rangliste muss absteigend sein');
  }
  assert.ok(liste[0].gewinn > 0);
});

test('hebelRangliste: die schwaechste Quote hat den groessten Hebel', () => {
  // Abschlussquote 33,3 % ist die niedrigste der Kette — fuenf Punkte mehr
  // wirken dort relativ am staerksten.
  const liste = hebelRangliste(werte(WOCHE), 5);
  assert.equal(liste[0].schluessel, 'kunden');
  assert.equal(liste[0].belastbar, false, 'und wird ehrlich als noch nicht belastbar markiert');
});

test('hebelRangliste: ohne Einsatz gibt es keine Rangliste', () => {
  assert.deepEqual(hebelRangliste(werte({})), []);
});

test('bedarfFuerKunden: rechnet mit den eigenen Quoten rueckwaerts', () => {
  const b = bedarfFuerKunden(3, werte(WOCHE));
  assert.equal(b.kunden, 3);
  assert.equal(b.gehalten, 10);        // 3 / 33,3 %  -> aufgerundet
  assert.equal(b.gebucht, 14);         // 10 / 75 %
  assert.equal(b.eintragungen, 28);    // 14 / 50 %
  assert.equal(b.gespraeche, 35);      // 28 / 80 %
  assert.equal(b.reaktionen, 88);      // 35 / 40 %
  assert.equal(b.hinaus, 176);         // 88 / 50 %
});

test('bedarfFuerKunden: Stundenbedarf folgt dem gemessenen Zeitverbrauch', () => {
  const b = bedarfFuerKunden(3, werte(WOCHE));
  assert.equal(b.stunden, 49.5);       // 3 x 16,5 Stunden
});

test('bedarfFuerKunden: faellt eine Quote aus, bricht die Kette ehrlich ab', () => {
  // Keine Reaktionen erfasst -> ab dort kann nichts mehr gerechnet werden.
  const w = werte({ ...WOCHE, reaktionen: 0 });
  const b = bedarfFuerKunden(3, w);
  assert.equal(b.gehalten, 10);
  assert.equal(b.reaktionen, null);
  assert.equal(b.hinaus, null);
});

test('bedarfFuerKunden: ohne Ziel kommt nichts zurueck', () => {
  const b = bedarfFuerKunden(0, werte(WOCHE));
  assert.equal(b.gehalten, null);
  assert.equal(b.hinaus, null);
});

test('montagVon: jeder Wochentag landet auf demselben Montag', () => {
  assert.equal(montagVon('2026-09-07'), '2026-09-07');   // Montag
  assert.equal(montagVon('2026-09-10'), '2026-09-07');   // Donnerstag
  assert.equal(montagVon('2026-09-13'), '2026-09-07');   // Sonntag
  assert.equal(montagVon('2026-09-14'), '2026-09-14');   // naechster Montag
});

test('montagVon: Unsinn ergibt leer statt eines erfundenen Datums', () => {
  assert.equal(montagVon('heute'), '');
  assert.equal(montagVon(''), '');
  assert.equal(montagVon(null), '');
});

test('wochenLabel und kanalLabel bleiben auch bei Unsinn lesbar', () => {
  assert.match(wochenLabel('2026-09-07'), /^KW \d+ · 07\.09\.$/);
  assert.equal(wochenLabel('quatsch'), '—');
  assert.equal(kanalLabel('social'), 'Social Media');
  assert.equal(kanalLabel(''), 'Gesamt');
  assert.equal(kanalLabel('unbekannt'), 'unbekannt');
});

// ---------------------------------------------------------------------------
// Brücke zum Akquise-Cockpit (ergänzt am 13.09.2026)
// ---------------------------------------------------------------------------

test('ausAktivitaeten: jede Aktivitaet ist eine Ansprache', () => {
  const a = ausAktivitaeten([
    { art: 'anruf', ergebnis: 'kein_kontakt' },
    { art: 'anruf', ergebnis: 'gesprochen' },
    { art: 'mail', ergebnis: 'termin' },
  ]);
  assert.equal(a.ansprachen, 3);
});

test('ausAktivitaeten: „niemand erreicht" ist keine Reaktion', () => {
  const a = ausAktivitaeten([
    { ergebnis: 'kein_kontakt' }, { ergebnis: 'kein_kontakt' }, { ergebnis: 'gesprochen' },
  ]);
  assert.equal(a.ansprachen, 3);
  assert.equal(a.reaktionen, 1);
});

test('ausAktivitaeten: eine Absage IST eine Reaktion, aber kein Gespraech', () => {
  const a = ausAktivitaeten([{ ergebnis: 'absage' }]);
  assert.equal(a.reaktionen, 1);
  assert.equal(a.gespraeche, 0);
  assert.equal(a.termineGebucht, 0);
});

test('ausAktivitaeten: ein Termin zaehlt auch als Gespraech', () => {
  const a = ausAktivitaeten([{ ergebnis: 'termin' }]);
  assert.equal(a.termineGebucht, 1);
  assert.equal(a.gespraeche, 1, 'wer einen Termin bekommt, hat gesprochen');
  assert.equal(a.reaktionen, 1);
});

test('ausAktivitaeten: unbekannte Ergebnisse werden gezaehlt, nicht geraten', () => {
  const a = ausAktivitaeten([{ ergebnis: 'irgendwas' }, { ergebnis: null }, {}]);
  assert.equal(a.ansprachen, 3);
  assert.equal(a.reaktionen, 0, 'nichts wird unterstellt');
  assert.equal(a.ohneErgebnis, 3);
});

test('ausAktivitaeten: leere und kaputte Eingaben ergeben lauter Nullen', () => {
  assert.equal(ausAktivitaeten([]).ansprachen, 0);
  assert.equal(ausAktivitaeten(null).ansprachen, 0);
  assert.equal(ausAktivitaeten([null, undefined]).ansprachen, 0);
});

test('ausAktivitaeten: eine volle Woche rechnet sich schluessig durch', () => {
  const woche = [
    ...Array(12).fill({ ergebnis: 'kein_kontakt' }),
    ...Array(6).fill({ ergebnis: 'gesprochen' }),
    ...Array(3).fill({ ergebnis: 'absage' }),
    ...Array(2).fill({ ergebnis: 'termin' }),
  ];
  const a = ausAktivitaeten(woche);
  assert.equal(a.ansprachen, 23);
  assert.equal(a.reaktionen, 11);   // 6 + 3 + 2
  assert.equal(a.gespraeche, 8);    // 6 + 2
  assert.equal(a.termineGebucht, 2);
  assert.equal(a.ohneErgebnis, 0);
});

test('wochenZeitraum: sieben Tage ab Montag, Ende ist ausschliesslich', () => {
  const [von, bis] = wochenZeitraum('2026-09-07');
  assert.ok(von && bis);
  const tage = (new Date(bis).getTime() - new Date(von).getTime()) / 86400000;
  assert.equal(tage, 7);
});

test('wochenZeitraum: Unsinn ergibt leer statt eines erfundenen Zeitraums', () => {
  assert.deepEqual(wochenZeitraum('letzte Woche'), ['', '']);
  assert.deepEqual(wochenZeitraum(null), ['', '']);
  assert.deepEqual(wochenZeitraum('2026-13-45'), ['', '']);
});
