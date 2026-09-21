// ============================================================================
// tests/stundensatzP61.test.mjs
//
// PUNKT 61 / R11 — Der Stundensatz wird HERGELEITET, Paket 1 (21.09.2026)
// Die Datei ruft noch NIEMAND auf.
//
// ▄▄▄ DER BEFUND, am echten Code ▄▄▄
// lib/kalkulator.ts Z.51-62: Der Stundensatz ist ein Posten mit
// art: 'zeit' und preis_je_einheit — eine eingetippte Zahl. Es gibt im
// ganzen Haus keine Stelle, die ihn herleitet. lib/nachkalkulation.ts
// rechnet mit `stundensatz` aus projektleistungen, also wieder mit einer
// eingetippten Zahl.
//
// ▄▄▄ DIE FEHLER, DIE DIESE TESTS FESTNAGELN ▄▄▄
//  1. Durch die ANWESENHEITSSTUNDEN teilen statt durch die PRODUKTIVEN.
//     GEMESSEN: 11,19 EUR je Stunde, 13.965,12 EUR im Jahr. Je Mitarbeiter.
//  2. Die Beitragsbemessungsgrenze uebersehen.
//  3. Die Saetze ohne Stand-Jahr in den Code schreiben (Basiszins-Fehler).
//  4. Den Zusatzbeitrag der Krankenkasse fuer eine feste Zahl halten.
//  5. Berufsgenossenschaft und Umlagen vergessen — oder schlimmer: raten.
//  6. Den Unternehmerlohn weglassen.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  stundensatz, produktiveStunden, personalKosten, arbeitgeberAnteil,
  vergleicheSatz, pruefeStand, rechenweg,
  SV_SAETZE_2026, ZEIT_STANDARD, ZUSCHLAG_STANDARD,
} from '../out/stundensatz.js';

// Ein Geselle, wie er in einem Handwerksbetrieb wirklich steht.
const ZEIT = {
  feiertage: 10, urlaubstage: 30, krankheitstage: 10, weiterbildungstage: 3,
  tagesstunden: 8, unproduktivProzent: 25,
};
const LOHN = { monatsbrutto: 3400, sonderzahlungenMonate: 1, sonstigeKostenJahr: 0, unternehmerlohnJahr: 0 };
const AG = { berufsgenossenschaftProzent: 3, u1Prozent: 1.6, u2Prozent: 0.5 };
const HEUTE = new Date('2026-09-21T00:00:00Z');

function satz(lohn = LOHN, zeit = ZEIT, zu = {}, ag = AG) {
  return stundensatz(lohn, zeit, zu, ag, SV_SAETZE_2026, HEUTE);
}

// ===========================================================================
// TEIL 1 — DIE PRODUKTIVEN STUNDEN
// ===========================================================================

test('die Herleitung der produktiven Stunden, Schritt fuer Schritt', () => {
  const z = produktiveStunden(ZEIT);
  assert.equal(z.kalendertage, 365);
  assert.equal(z.arbeitstageBrutto, 261, '365 minus 104 Wochenendtage');
  assert.equal(z.anwesenheitstage, 208, '261 minus 10 Feiertage, 30 Urlaub, 10 krank, 3 Weiterbildung');
  assert.equal(z.anwesenheitsstunden, 1664, '208 mal 8');
  assert.equal(z.unproduktiveStunden, 416, '25 Prozent von 1664');
  assert.equal(z.produktiveStunden, 1248);
});

test('fehlende Angaben werden GEMELDET, nicht stillschweigend gesetzt', () => {
  const z = produktiveStunden({});
  assert.ok(z.hinweise.some((h) => /Feiertage/.test(h)));
  assert.ok(z.hinweise.some((h) => /Urlaubstage/.test(h)));
  assert.ok(z.hinweise.some((h) => /Krankheitstage/.test(h)));
  assert.ok(z.hinweise.some((h) => /Unproduktiver Anteil/.test(h)));
});

test('ohne Angaben wird mit den Standardwerten weitergerechnet, nicht mit null', () => {
  const z = produktiveStunden({});
  assert.equal(z.tagesstunden, ZEIT_STANDARD.tagesstunden);
  assert.equal(z.unproduktivProzent, ZEIT_STANDARD.unproduktivProzent);
  assert.equal(z.anwesenheitstage, 261, 'ohne Urlaub und Feiertage bleiben alle Arbeitstage');
  assert.equal(z.produktiveStunden, 1566, '261 mal 8 minus 25 Prozent');
});

test('unsinnige Angaben ergeben keine negativen Stunden', () => {
  const z = produktiveStunden({ urlaubstage: 400, feiertage: 100 });
  assert.equal(z.anwesenheitstage, 0);
  assert.equal(z.produktiveStunden, 0);
  assert.ok(z.hinweise.some((h) => /keine produktiven Stunden/.test(h)));
});

test('ein unproduktiver Anteil von 100 Prozent wird gedeckelt', () => {
  const z = produktiveStunden({ ...ZEIT, unproduktivProzent: 150 });
  assert.equal(z.unproduktivProzent, 99);
  assert.ok(z.produktiveStunden > 0, 'es bleibt immer ein Rest, sonst teilt man durch null');
});

// ===========================================================================
// TEIL 2 — FEHLER 1: DER TEURE TEILER
// ===========================================================================

test('FEHLER 1 — der Stundensatz teilt durch die PRODUKTIVEN Stunden', () => {
  const e = satz();
  assert.equal(e.kosten.gesamtJahr, 55868.8);
  assert.equal(e.zeit.produktiveStunden, 1248);
  assert.equal(e.selbstkostenJeStunde, 44.77, '55.868,80 geteilt durch 1.248');
});

test('GEMESSEN: was der falsche Teiler kostet', () => {
  const e = satz();
  assert.equal(e.selbstkostenJeAnwesenheitsstunde, 33.58, '55.868,80 geteilt durch 1.664');
  assert.equal(e.fehlbetragJeStunde, 11.19);
  assert.equal(e.fehlbetragJahr, 13965.12, 'je Mitarbeiter und Jahr');
});

test('der Aufschlagweg: Selbstkosten, Verrechnungssatz, Angebotspreis', () => {
  const e = satz();
  assert.equal(e.gemeinkostenProzent, ZUSCHLAG_STANDARD.gemeinkostenProzent);
  assert.equal(e.verrechnungssatz, 51.49, '44,77 plus 15 Prozent');
  assert.equal(e.angebotsStundensatz, 56.64, '51,49 plus 10 Prozent');
});

test('die Zuschlaege sind Eingaben, keine Naturgesetze', () => {
  const e = satz(LOHN, ZEIT, { gemeinkostenProzent: 25, wagnisGewinnProzent: 5 });
  assert.equal(e.verrechnungssatz, 55.96);
  assert.equal(e.angebotsStundensatz, 58.76);
});

test('ohne produktive Stunden wird nicht durch null geteilt', () => {
  const e = satz(LOHN, { urlaubstage: 400 });
  assert.equal(e.selbstkostenJeStunde, 0);
  assert.equal(e.angebotsStundensatz, 0);
});

// ===========================================================================
// TEIL 3 — FEHLER 2: DIE BEITRAGSBEMESSUNGSGRENZE
// ===========================================================================

test('unter der Grenze gilt der volle Satz', () => {
  const a = arbeitgeberAnteil(44200, AG, SV_SAETZE_2026);
  assert.equal(a.gedeckelt, false);
  // 7,30 + 1,45 KV, 1,80 PV, 9,30 RV, 1,30 AV, 0,15 Insolvenz = 21,30
  // plus 3,00 BG, 1,60 U1, 0,50 U2 = 26,40 Prozent
  assert.equal(a.effektivProzent, 26.4);
  assert.equal(a.summe, 11668.8);
});

test('FEHLER 2 — ueber der Grenze steigt der Anteil nicht weiter', () => {
  const anDerGrenze = arbeitgeberAnteil(SV_SAETZE_2026.bbgKvPv, AG, SV_SAETZE_2026);
  const darueber = arbeitgeberAnteil(84500, AG, SV_SAETZE_2026);
  assert.equal(darueber.gedeckelt, true);
  assert.equal(darueber.kv, anDerGrenze.kv, 'die Krankenversicherung ist gedeckelt');
  assert.equal(darueber.pv, anDerGrenze.pv, 'die Pflegeversicherung auch');
  assert.ok(darueber.rv > anDerGrenze.rv, 'die Rentenversicherung laeuft weiter — andere Grenze');
});

test('die beiden Grenzen sind verschieden hoch', () => {
  assert.equal(SV_SAETZE_2026.bbgKvPv, 69750);
  assert.equal(SV_SAETZE_2026.bbgRvAv, 101400);
  const sehrHoch = arbeitgeberAnteil(150000, AG, SV_SAETZE_2026);
  const anRvGrenze = arbeitgeberAnteil(SV_SAETZE_2026.bbgRvAv, AG, SV_SAETZE_2026);
  assert.equal(sehrHoch.rv, anRvGrenze.rv, 'auch die Rente ist irgendwann gedeckelt');
});

test('eine Pauschale auf das volle Brutto waere zu hoch', () => {
  const echt = arbeitgeberAnteil(84500, AG, SV_SAETZE_2026);
  const pauschal = 84500 * 0.264;
  assert.ok(echt.summe < pauschal, `gedeckelt ${echt.summe} gegen pauschal ${pauschal}`);
  assert.ok(pauschal - echt.summe > 1500, 'der Unterschied ist vierstellig, kein Rundungsfehler');
});

// ===========================================================================
// TEIL 4 — FEHLER 3: DAS STAND-JAHR
// ===========================================================================

test('FEHLER 3 — die Saetze tragen ihr Jahr und melden sich, wenn es nicht mehr passt', () => {
  assert.equal(SV_SAETZE_2026.jahr, 2026);
  assert.equal(pruefeStand(new Date('2026-12-31T00:00:00Z')).aktuell, true);

  const naechstesJahr = pruefeStand(new Date('2027-01-01T00:00:00Z'));
  assert.equal(naechstesJahr.aktuell, false, 'am 1. Januar ist der Satz von gestern');
  assert.match(naechstesJahr.hinweis, /1\. Januar/);
  assert.match(naechstesJahr.hinweis, /2026/);
  assert.match(naechstesJahr.hinweis, /2027/);
});

test('der Hinweis landet auch im Ergebnis, nicht nur in der Pruefung', () => {
  const alt = stundensatz(LOHN, ZEIT, {}, AG, SV_SAETZE_2026, new Date('2027-03-01T00:00:00Z'));
  assert.ok(alt.hinweise.some((h) => /Beitragssätze/.test(h)));
});

test('jeder Satz traegt eine Quelle', () => {
  assert.ok(SV_SAETZE_2026.quelle.length > 20);
  assert.match(SV_SAETZE_2026.quelle, /2026/);
});

// ===========================================================================
// TEIL 5 — FEHLER 4 und 5: KASSE, BERUFSGENOSSENSCHAFT, UMLAGEN
// ===========================================================================

test('FEHLER 4 — der Zusatzbeitrag ist eine Eingabe, keine feste Zahl', () => {
  const mitDurchschnitt = arbeitgeberAnteil(44200, AG, SV_SAETZE_2026);
  const mitEigenem = arbeitgeberAnteil(44200, { ...AG, kvZusatzProzent: 2.69 }, SV_SAETZE_2026);
  assert.ok(mitEigenem.kv < mitDurchschnitt.kv, 'eine guenstigere Kasse schlaegt durch');
  assert.equal(SV_SAETZE_2026.kvZusatzDurchschnitt, 2.9);
});

test('der Arbeitgeber traegt nur die HAELFTE des Zusatzbeitrags', () => {
  const a = arbeitgeberAnteil(10000, { kvZusatzProzent: 2.0, berufsgenossenschaftProzent: 0, u1Prozent: 0, u2Prozent: 0 }, SV_SAETZE_2026);
  // 14,6 / 2 = 7,30 plus 2,0 / 2 = 1,00  ->  8,30 Prozent von 10.000
  assert.equal(a.kv, 830);
});

test('FEHLER 5 — fehlende BG und Umlagen werden BENANNT, nicht geraten', () => {
  const ohne = arbeitgeberAnteil(44200, {}, SV_SAETZE_2026);
  assert.equal(ohne.berufsgenossenschaft, 0, 'lieber null als eine erfundene Zahl');
  assert.equal(ohne.u1, 0);
  assert.equal(ohne.u2, 0);
  assert.equal(ohne.fehlt.length, 3);
  assert.ok(ohne.fehlt.some((f) => /Berufsgenossenschaft/.test(f)));
  assert.ok(ohne.fehlt.some((f) => /U1/.test(f)));
  assert.ok(ohne.fehlt.some((f) => /U2/.test(f)));
});

test('die fehlenden Angaben stehen auch in den Hinweisen des Stundensatzes', () => {
  const e = satz(LOHN, ZEIT, {}, {});
  assert.ok(e.hinweise.some((h) => /Berufsgenossenschaft/.test(h)));
});

test('GEMESSEN: was die Berufsgenossenschaft am Bau ausmacht', () => {
  const ohne = satz(LOHN, ZEIT, {}, { u1Prozent: 1.6, u2Prozent: 0.5 });
  const mit = satz();
  assert.ok(mit.selbstkostenJeStunde > ohne.selbstkostenJeStunde);
  // 3 Prozent von 44.200 EUR sind 1.326 EUR Beitrag im Jahr.
  assert.equal(mit.kosten.arbeitgeberAnteil.berufsgenossenschaft, 1326);
  // Auf 1.248 produktive Stunden sind das 1,0625 EUR je Stunde. Die Differenz
  // der beiden GERUNDETEN Saetze ist 1,07 und nicht 1,06 — weil jeder Satz
  // fuer sich auf Cent gerundet wird. Dasselbe Thema wie im Kalkulator, wo
  // sich einzeln gerundete Kostenarten nicht auf die Summe addierten.
  // Der Test haelt beide Zahlen nebeneinander, damit es niemand fuer einen
  // Fehler haelt.
  assert.equal(Math.round((1326 / 1248) * 10000) / 10000, 1.0625);
  assert.equal(Math.round((mit.selbstkostenJeStunde - ohne.selbstkostenJeStunde) * 100) / 100, 1.07);
});

test('die Sachsen-Sonderregel bei der Pflegeversicherung', () => {
  const normal = arbeitgeberAnteil(44200, AG, SV_SAETZE_2026);
  const sachsen = arbeitgeberAnteil(44200, { ...AG, sachsen: true }, SV_SAETZE_2026);
  assert.ok(sachsen.pv < normal.pv, 'in Sachsen traegt der Arbeitgeber 1,30 statt 1,80 Prozent');
  assert.equal(sachsen.pv, Math.round(44200 * 0.013 * 100) / 100);
});

// ===========================================================================
// TEIL 6 — FEHLER 6: DER UNTERNEHMERLOHN
// ===========================================================================

test('FEHLER 6 — ein fehlender Unternehmerlohn wird angesprochen', () => {
  const e = satz();
  assert.equal(e.kosten.unternehmerlohn, 0);
  assert.ok(e.hinweise.some((h) => /Unternehmerlohn/.test(h)));
});

test('mit Unternehmerlohn verschwindet der Hinweis und der Satz steigt', () => {
  const e = satz({ ...LOHN, unternehmerlohnJahr: 24000 });
  assert.equal(e.kosten.unternehmerlohn, 24000);
  assert.ok(!e.hinweise.some((h) => /Unternehmerlohn/.test(h)));
  assert.ok(e.selbstkostenJeStunde > 60, 'der Satz steigt deutlich: ' + e.selbstkostenJeStunde);
});

test('Sonderzahlungen zaehlen zur Bemessungsgrundlage', () => {
  const ohne = personalKosten({ monatsbrutto: 3400 }, AG, SV_SAETZE_2026);
  const mit = personalKosten({ monatsbrutto: 3400, sonderzahlungenMonate: 1 }, AG, SV_SAETZE_2026);
  assert.equal(ohne.bruttoGesamt, 40800);
  assert.equal(mit.bruttoGesamt, 44200);
  assert.ok(mit.arbeitgeberAnteil.summe > ohne.arbeitgeberAnteil.summe,
    'auf das Weihnachtsgeld fallen auch Beitraege an');
});

test('Sonderzahlungen gehen auch als fester Betrag', () => {
  const a = personalKosten({ monatsbrutto: 3400, sonderzahlungenMonate: 1 }, AG, SV_SAETZE_2026);
  const b = personalKosten({ monatsbrutto: 3400, sonderzahlungenBetrag: 3400 }, AG, SV_SAETZE_2026);
  assert.equal(a.bruttoGesamt, b.bruttoGesamt);
});

test('ein Jahresbrutto schlaegt das Monatsbrutto', () => {
  const p = personalKosten({ monatsbrutto: 3400, jahresbrutto: 50000 }, AG, SV_SAETZE_2026);
  assert.equal(p.jahresbrutto, 50000);
});

test('sonstige Kosten je Mitarbeiter werden angemahnt, wenn sie fehlen', () => {
  const p = personalKosten({ monatsbrutto: 3400 }, AG, SV_SAETZE_2026);
  assert.ok(p.hinweise.some((h) => /Berufskleidung/.test(h)));
  const q = personalKosten({ monatsbrutto: 3400, sonstigeKostenJahr: 1200 }, AG, SV_SAETZE_2026);
  assert.ok(!q.hinweise.some((h) => /Berufskleidung/.test(h)));
  assert.equal(q.sonstigeKosten, 1200);
});

// ===========================================================================
// TEIL 7 — DER VERGLEICH MIT DEM EINGETIPPTEN SATZ
// ===========================================================================

test('ein zu niedriger Satz wird beziffert', () => {
  const v = vergleicheSatz(45, satz());
  assert.equal(v.hergeleitet, 56.64);
  assert.equal(v.differenz, 11.64);
  assert.equal(v.unterSelbstkosten, false);
  assert.match(v.text, /zu wenig/);
});

test('DER WICHTIGSTE FALL: ein Satz UNTER den Selbstkosten', () => {
  const v = vergleicheSatz(38, satz());
  assert.equal(v.unterSelbstkosten, true, '38 EUR liegen unter 44,77 EUR Selbstkosten');
  assert.match(v.text, /UNTER den reinen Selbstkosten/);
  assert.match(v.text, /je mehr Aufträge, desto größer der Verlust/);
});

test('ein passender Satz bekommt kein Drama', () => {
  const e = satz();
  const v = vergleicheSatz(e.angebotsStundensatz, e);
  assert.equal(v.differenz, 0);
  assert.match(v.text, /passt zur Herleitung/);
});

test('ein zu hoher Satz wird genauso benannt', () => {
  const v = vergleicheSatz(80, satz());
  assert.ok(v.differenz < 0);
  assert.match(v.text, /mehr, als die Rechnung hergibt/);
});

test('kein hinterlegter Satz ist ein eigener Fall, keine Null-Differenz', () => {
  const v = vergleicheSatz(0, satz());
  assert.match(v.text, /Kein Stundensatz hinterlegt/);
  assert.equal(v.unterSelbstkosten, false, 'ohne Satz gibt es keinen Verlust zu melden');
});

test('ein deutscher Zahltext als hinterlegter Satz wird gelesen', () => {
  const v = vergleicheSatz('45,00', satz());
  assert.equal(v.hinterlegt, 45, 'der gemeinsame Zahlen-Leser aus lib/zahlen.ts greift');
});

// ===========================================================================
// TEIL 8 — DER RECHENWEG UND DAS RUNDEN
// ===========================================================================

test('der Rechenweg ist vollstaendig und traegt keine leeren Zeilen', () => {
  const w = rechenweg(satz());
  assert.ok(w.length >= 13);
  for (const z of w) {
    assert.ok(z.zeile && z.zeile.length > 3, JSON.stringify(z));
    assert.ok(z.wert && z.wert.length > 0, JSON.stringify(z));
  }
  assert.ok(w.some((z) => /produktive Stunden/.test(z.wert)));
  assert.ok(w.some((z) => /Selbstkosten je Stunde/.test(z.wert)));
});

test('der Klartext nennt die drei Zahlen, auf die es ankommt', () => {
  const t = satz().klartext;
  assert.match(t, /55\.868,80 EUR/);
  assert.match(t, /1\.248/);
  assert.match(t, /44,77 EUR/);
  assert.match(t, /56,64 EUR/);
});

test('gerundet wird symmetrisch um Null — ueber den gemeinsamen Runder', () => {
  // Ein negativer Stundensatz kommt in der Praxis nicht vor, eine negative
  // DIFFERENZ im Vergleich sehr wohl. centRunden aus lib/zahlen.ts ist
  // symmetrisch; der Test haelt fest, dass hier nichts Eigenes gebaut wurde.
  const v = vergleicheSatz(100, satz());
  assert.equal(v.differenz, -43.36);
  assert.equal(Math.abs(v.differenz), 43.36, 'kein Vorzeichenverlust beim Runden');
});

test('unbrauchbare Eingaben ergeben keine NaN-Saetze', () => {
  const e = satz({ monatsbrutto: NaN, sonderzahlungenMonate: null });
  assert.ok(Number.isFinite(e.selbstkostenJeStunde));
  assert.equal(e.kosten.jahresbrutto, 0);
  const f = satz({ monatsbrutto: -5000 });
  assert.ok(f.selbstkostenJeStunde >= 0, 'ein negatives Gehalt ergibt keinen negativen Satz');
});
