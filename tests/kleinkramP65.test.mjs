// ============================================================================
// tests/kleinkramP65.test.mjs
//
// PUNKT 65 / R12, PAKET 1 (21.09.2026) — drei Steuerthemen
//   Teil 1  Bewirtung 70/30           § 4 Abs. 5 Satz 1 Nr. 2 EStG   (neue Datei)
//   Teil 2  AfA-Sammelposten          § 6 Abs. 2a EStG               (additiv)
//   Teil 3  Reisekosten-Dreimonatsfrist § 9 Abs. 4a Satz 6-7 EStG    (additiv)
//
// Die beiden additiven Teile aendern NICHTS an dem, was vorher da war:
// afaPlan, verpflegung und fahrtkosten bleiben Zeichen fuer Zeichen gleich,
// und die Bestandstests aus P29 laufen unveraendert mit.
//
// ▄▄▄ DIE FEHLER, DIE DIESE TESTS FESTNAGELN ▄▄▄
//   Bewirtung:  Vorsteuer mitkuerzen · Arbeitnehmer mit 70 % kuerzen ·
//               30 % vom Brutto · Pflichtangaben nicht pruefen
//   Sammelposten: Wahlrecht je Gut statt je Jahr · Posten beim Abgang
//               mindern · die 250-EUR-Untergrenze uebersehen
//   Dreimonatsfrist: als 90 Tage rechnen · die Wochenfrequenz uebersehen ·
//               auch Fahrt und Uebernachtung streichen · eine kurze
//               Unterbrechung als Neustart werten
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  teileBewirtung, pruefeAngaben, buchungsvorschlag,
  ABZIEHBAR_PROZENT, KONTEN, ANLASS_ZU_ALLGEMEIN, BEWIRTUNGS_ARTEN,
} from '../out/bewirtung.js';

import {
  afaPlan, GWG_GRENZE,
  sammelposten, wegeFuer, pruefeEinheitlich,
  SAMMELPOSTEN_UNTERGRENZE, SAMMELPOSTEN_OBERGRENZE, SAMMELPOSTEN_JAHRE,
} from '../out/afa.js';

import {
  verpflegung, fahrtkosten,
  dreimonatsfrist, fristEnde, einsatzReihe,
  FRIST_MONATE, UNTERBRECHUNG_WOCHEN, MIN_TAGE_JE_WOCHE,
} from '../out/reisekosten.js';

// ===========================================================================
// TEIL 1 — BEWIRTUNG
// ===========================================================================

const VOLLSTAENDIG = {
  ort: 'Gasthaus Adler, Musterstr. 1, 71034 Böblingen',
  tag: '2026-09-15',
  teilnehmer: ['Martin Gaspar', 'Herr Müller (Bauunternehmen Müller)'],
  anlass: 'Vertragsverhandlung Bauvorhaben Musterstraße 12',
  inGaststaette: true,
};

test('GEMESSEN: ein Bewirtungsbeleg ueber 119,00 EUR', () => {
  const b = teileBewirtung({ ...VOLLSTAENDIG, art: 'geschaeftlich', brutto: 119, steuersatz: 19 });
  assert.equal(b.netto, 100);
  assert.equal(b.steuer, 19);
  assert.equal(b.abziehbar, 70, '70 Prozent vom NETTO');
  assert.equal(b.nichtAbziehbar, 30);
  assert.equal(b.gesperrt, false);
});

test('FEHLER 1 — die Vorsteuer bleibt VOLL abziehbar', () => {
  const b = teileBewirtung({ ...VOLLSTAENDIG, art: 'geschaeftlich', brutto: 119, steuersatz: 19 });
  assert.equal(b.vorsteuer, 19, 'volle Umsatzsteuer, § 15 Abs. 1a UStG');
  // Wer sie mitkuerzt, zieht 13,30 statt 19,00 — 5,70 EUR zu wenig, und zwar
  // bei JEDEM Bewirtungsbeleg.
  assert.notEqual(b.vorsteuer, 13.3);
  assert.equal(Math.round((b.vorsteuer - 13.3) * 100) / 100, 5.7);
  assert.match(b.klartext, /VOLL, nicht gekürzt/);
});

test('FEHLER 2 — die Arbeitnehmerbewirtung wird NICHT gekuerzt', () => {
  const an = teileBewirtung({ ...VOLLSTAENDIG, art: 'arbeitnehmer', brutto: 119, steuersatz: 19 });
  assert.equal(an.abziehbarProzent, 100);
  assert.equal(an.abziehbar, 100, 'der volle Nettobetrag');
  assert.equal(an.nichtAbziehbar, 0);
  assert.equal(an.vorsteuer, 19);
});

test('FEHLER 3 — gekuerzt wird das NETTO, nicht das Brutto', () => {
  const b = teileBewirtung({ ...VOLLSTAENDIG, art: 'geschaeftlich', brutto: 119, steuersatz: 19 });
  assert.equal(b.nichtAbziehbar, 30);
  // 30 Prozent vom Brutto waeren 35,70 — 5,70 EUR zu viel gekuerzt.
  // Derselbe Betrag wie in Fehler 1, aus demselben Grund: es sind 30 % der USt.
  assert.notEqual(b.nichtAbziehbar, 35.7);
});

test('FEHLER 4 — ohne Pflichtangaben ist NICHTS abziehbar, auch nicht die 70 Prozent', () => {
  const ohne = teileBewirtung({ ...VOLLSTAENDIG, teilnehmer: [], art: 'geschaeftlich', brutto: 119 });
  assert.equal(ohne.gesperrt, true);
  assert.equal(ohne.abziehbar, 0, 'nicht 70, sondern null');
  assert.equal(ohne.vorsteuer, 0, 'und die Vorsteuer faellt mit');
  assert.equal(ohne.nichtAbziehbar, 100);
  assert.match(ohne.klartext, /NICHTS abziehbar/);
});

test('jede einzelne Pflichtangabe wird geprueft', () => {
  const felder = [
    ['ort', /Ort/],
    ['tag', /Tag/],
    ['anlass', /Anlass/],
  ];
  for (const [feld, muster] of felder) {
    const p = pruefeAngaben({ ...VOLLSTAENDIG, art: 'geschaeftlich', [feld]: '' });
    assert.equal(p.vollstaendig, false, feld + ' fehlt und wird nicht bemerkt');
    assert.ok(p.fehlt.some((f) => muster.test(f)), feld + ': ' + JSON.stringify(p.fehlt));
  }
});

test('ein zu allgemeiner Anlass ist ein HINWEIS, keine Sperre', () => {
  const p = pruefeAngaben({ ...VOLLSTAENDIG, art: 'geschaeftlich', anlass: 'Geschäftsessen' });
  assert.equal(p.vollstaendig, true, 'der Anlass IST angegeben');
  assert.ok(p.hinweise.some((h) => /zu allgemein/.test(h)));
  assert.ok(ANLASS_ZU_ALLGEMEIN.includes('geschäftsessen'));
});

test('bei privater Veranlassung gibt es weder Abzug noch Vorsteuer', () => {
  const p = teileBewirtung({ ...VOLLSTAENDIG, art: 'privat', brutto: 119 });
  assert.equal(p.abziehbar, 0);
  assert.equal(p.vorsteuer, 0);
  assert.equal(p.abziehbarProzent, 0);
});

test('ein ermaessigter Steuersatz wird richtig herausgerechnet', () => {
  const b = teileBewirtung({ ...VOLLSTAENDIG, art: 'geschaeftlich', brutto: 107, steuersatz: 7 });
  assert.equal(b.netto, 100);
  assert.equal(b.steuer, 7);
  assert.equal(b.abziehbar, 70);
  assert.equal(b.vorsteuer, 7);
});

test('Trinkgeld folgt derselben Quote', () => {
  const b = teileBewirtung({ ...VOLLSTAENDIG, art: 'geschaeftlich', brutto: 119, trinkgeld: 10 });
  assert.equal(b.trinkgeld, 10);
  assert.equal(b.trinkgeldAbziehbar, 7);
});

test('die Buchung trennt abziehbar und nicht abziehbar auf zwei Konten', () => {
  const b = teileBewirtung({ ...VOLLSTAENDIG, art: 'geschaeftlich', brutto: 119 });
  const v = buchungsvorschlag(b, 'skr03');
  assert.equal(v.zeilen.length, 2);
  assert.equal(v.zeilen[0].konto, KONTEN.skr03.abziehbar);
  assert.equal(v.zeilen[0].betrag, 70);
  assert.equal(v.zeilen[1].konto, KONTEN.skr03.nichtAbziehbar);
  assert.equal(v.zeilen[1].betrag, 30);
  assert.match(v.hinweis, /Steuerberater bestätigt/);
});

test('SKR04 hat eigene Konten', () => {
  const b = teileBewirtung({ ...VOLLSTAENDIG, art: 'geschaeftlich', brutto: 119 });
  assert.equal(buchungsvorschlag(b, 'skr04').zeilen[0].konto, KONTEN.skr04.abziehbar);
  assert.equal(KONTEN.bestaetigt, false, 'die Nummern sind ein Vorschlag, kein bestaetigter Stand');
});

test('die drei Arten sind benannt und tragen ihren Hinweis', () => {
  assert.equal(BEWIRTUNGS_ARTEN.length, 3);
  assert.equal(ABZIEHBAR_PROZENT, 70);
  for (const a of BEWIRTUNGS_ARTEN) assert.ok(a.hinweis.length > 20, a.key);
});

// ===========================================================================
// TEIL 2 — DER SAMMELPOSTEN
// ===========================================================================

test('die Grenzen stehen als benannte Konstanten', () => {
  assert.equal(SAMMELPOSTEN_UNTERGRENZE, 250);
  assert.equal(SAMMELPOSTEN_OBERGRENZE, 1000);
  assert.equal(SAMMELPOSTEN_JAHRE, 5);
  assert.equal(GWG_GRENZE, 800);
});

test('GEMESSEN: ein Sammelposten aus fuenf Anschaffungen', () => {
  const sp = sammelposten([
    { bezeichnung: 'Bürostuhl', kosten: 640 },
    { bezeichnung: 'Laptop', kosten: 950 },
    { bezeichnung: 'Werkzeugkoffer', kosten: 220 },
    { bezeichnung: 'Vermessungsgerät', kosten: 1400 },
    { bezeichnung: 'Drucker', kosten: 300 },
  ], 2026);
  assert.equal(sp.enthalten.length, 3, 'Stuhl, Laptop, Drucker');
  assert.equal(sp.summe, 1890);
  assert.equal(sp.jahresAufloesung, 378);
  assert.equal(sp.plan.length, 5);
  assert.equal(sp.plan[0].jahr, 2026);
  assert.equal(sp.plan[4].jahr, 2030);
  assert.equal(sp.plan[4].restwert, 0);
});

test('die Summe der Aufloesungen geht exakt auf — auch wenn die Teilung nicht aufgeht', () => {
  // 1.000,01 geteilt durch fuenf sind 200,002 — gerundet 200,00. Fuenfmal
  // 200,00 sind 1.000,00; EIN CENT bliebe liegen und der Sammelposten waere
  // nach fuenf Jahren nicht aufgeloest.
  //
  // Der erste Entwurf dieses Tests nahm 1.333,33. Dort rundet die Teilung
  // nach OBEN (266,666 -> 266,67), und dann faengt das Math.min im letzten
  // Jahr den Rest ohnehin ab — die Gegenprobe blieb gruen, obwohl der Patch
  // griff. Der Fall muss NACH UNTEN runden, sonst beweist er nichts.
  // Lehre 8, zum dritten Mal an diesem Tag.
  const sp = sammelposten([{ kosten: 500 }, { kosten: 500.01 }], 2026);
  assert.equal(sp.summe, 1000.01);
  assert.equal(sp.jahresAufloesung, 200, 'gerundet nach unten');

  const summe = sp.plan.reduce((s, p) => s + p.aufloesung, 0);
  assert.equal(Math.round(summe * 100) / 100, sp.summe, 'kein Cent bleibt liegen');
  assert.equal(sp.plan[4].aufloesung, 200.01, 'das letzte Jahr traegt den Rest');
  assert.equal(sp.plan[4].restwert, 0);
});

test('FEHLER 3 — unter 250 EUR gehoert nichts hinein', () => {
  const sp = sammelposten([{ bezeichnung: 'Werkzeugkoffer', kosten: 220 }], 2026);
  assert.equal(sp.enthalten.length, 0);
  assert.equal(sp.abgelehnt.length, 1);
  assert.match(sp.abgelehnt[0].grund, /sofort abziehbar/);
  assert.match(sp.abgelehnt[0].grund, /ohne Not/);
});

test('genau auf den Grenzen', () => {
  assert.equal(sammelposten([{ kosten: 250 }], 2026).enthalten.length, 0, '250,00 ist noch Sofortabzug');
  assert.equal(sammelposten([{ kosten: 250.01 }], 2026).enthalten.length, 1);
  assert.equal(sammelposten([{ kosten: 1000 }], 2026).enthalten.length, 1, '1.000,00 ist noch drin');
  assert.equal(sammelposten([{ kosten: 1000.01 }], 2026).enthalten.length, 0);
});

test('FEHLER 2 — ein Abgang aendert am Sammelposten NICHTS', () => {
  const ohne = sammelposten([{ kosten: 500 }, { kosten: 500 }], 2026);
  const mit = sammelposten([{ kosten: 500 }, { kosten: 500, abgangJahr: 2028 }], 2026);
  assert.equal(mit.summe, ohne.summe, 'der Posten wird nicht gemindert');
  assert.deepEqual(mit.plan, ohne.plan, 'und der Plan laeuft unveraendert zu Ende');
  assert.ok(mit.hinweise.some((h) => /nicht gemindert/.test(h)));
  assert.ok(mit.hinweise.some((h) => /§ 6 Abs. 2a Satz 3/.test(h)));
});

test('FEHLER 1 — das Wahlrecht gilt fuers ganze Jahr', () => {
  const p = pruefeEinheitlich([
    { bezeichnung: 'Stuhl', kosten: 640, weg: 'gwg_sofort' },
    { bezeichnung: 'Monitor', kosten: 700, weg: 'sammelposten' },
  ]);
  assert.equal(p.einheitlich, false);
  assert.deepEqual(p.sofort, ['Stuhl']);
  assert.deepEqual(p.imSammelposten, ['Monitor']);
  assert.match(p.meldung, /§ 6 Abs. 2a Satz 5/);
});

test('wo es KEIN Wahlrecht gibt, ist auch nichts uneinheitlich', () => {
  const p = pruefeEinheitlich([
    { bezeichnung: 'Maus', kosten: 30, weg: 'sofort_ohne_verzeichnis' },
    { bezeichnung: 'Stuhl', kosten: 640, weg: 'gwg_sofort' },
    { bezeichnung: 'Messgerät', kosten: 1400, weg: 'linear' },
  ]);
  assert.equal(p.einheitlich, true, 'unter 250 und ueber 800 ist der Weg vorgegeben');
  assert.equal(p.meldung, null);
});

test('wegeFuer sagt auch, was NICHT geht und warum', () => {
  const bei640 = wegeFuer(640);
  const moeglich = bei640.filter((w) => w.moeglich).map((w) => w.weg);
  assert.ok(moeglich.includes('gwg_sofort'));
  assert.ok(moeglich.includes('sammelposten'));
  assert.ok(!moeglich.includes('sofort_ohne_verzeichnis'), 'ueber 250 nicht mehr ohne Verzeichnis');

  const bei1400 = wegeFuer(1400);
  assert.deepEqual(bei1400.filter((w) => w.moeglich).map((w) => w.weg), ['linear']);
  for (const w of bei1400) assert.ok(w.grund.length > 20, w.weg + ' ohne Begruendung');
});

test('ALTBESTAND: afaPlan rechnet unveraendert', () => {
  const gwg = afaPlan(500, 3, '2026-03-15', 2026);
  assert.equal(gwg.methode, 'gwg');
  assert.equal(gwg.jahresAfa, 500);

  const linear = afaPlan(12000, 5, '2026-01-01', 2026);
  assert.equal(linear.methode, 'linear');
  assert.equal(linear.jahresAfa, 2400);
});

// ===========================================================================
// TEIL 3 — DIE DREIMONATSFRIST
// ===========================================================================

test('FEHLER 1 — drei KALENDERMONATE, nicht 90 Tage', () => {
  assert.equal(FRIST_MONATE, 3);
  // Der Standardfall aus der Fachliteratur: 15.01. -> 14.04.
  assert.equal(fristEnde('2026-01-15'), '2026-04-14');
  // Das sind 89 Tage. Wer mit 90 rechnet, liegt einen Tag daneben.
  const tage = (Date.UTC(2026, 3, 14) - Date.UTC(2026, 0, 15)) / 86400000 + 1;
  assert.equal(tage, 90, 'zufaellig 90 — aber nur in diesem Monat');
  // Im Februar sieht es anders aus:
  assert.equal(fristEnde('2026-02-01'), '2026-04-30');
  const tage2 = (Date.UTC(2026, 3, 30) - Date.UTC(2026, 1, 1)) / 86400000 + 1;
  assert.equal(tage2, 89, 'hier sind es 89 — eine feste Tageszahl waere falsch');
});

test('ein Monatsende, das es im Zielmonat nicht gibt', () => {
  // 31.01. + 3 Monate waere der 31.04. — den gibt es nicht.
  assert.equal(fristEnde('2026-01-31'), '2026-04-29');
});

test('ueber den Jahreswechsel', () => {
  assert.equal(fristEnde('2026-11-15'), '2027-02-14');
});

test('FEHLER 2 — unter drei Tagen je Woche laeuft die Frist gar nicht', () => {
  assert.equal(MIN_TAGE_JE_WOCHE, 3);
  const f = dreimonatsfrist({ beginnISO: '2026-02-01', tagISO: '2027-06-01', tageJeWoche: 2 });
  assert.equal(f.greift, false);
  assert.equal(f.abgelaufen, false);
  assert.equal(f.verpflegungSteuerfrei, true, 'auch nach ueber einem Jahr');
  assert.match(f.hinweis, /dauerhaft zu/);
});

test('ab drei Tagen je Woche laeuft sie', () => {
  const f = dreimonatsfrist({ beginnISO: '2026-02-01', tagISO: '2026-06-01', tageJeWoche: 3 });
  assert.equal(f.greift, true);
  assert.equal(f.abgelaufen, true);
});

test('innerhalb der Frist steht die Pauschale zu', () => {
  const f = dreimonatsfrist({ beginnISO: '2026-02-01', tagISO: '2026-04-15', tageJeWoche: 5 });
  assert.equal(f.abgelaufen, false);
  assert.equal(f.fristEnde, '2026-04-30');
  assert.equal(f.verpflegungSteuerfrei, true);
});

test('FEHLER 3 — Fahrt und Uebernachtung bleiben unberuehrt', () => {
  const f = dreimonatsfrist({ beginnISO: '2026-02-01', tagISO: '2026-09-01', tageJeWoche: 5 });
  assert.equal(f.abgelaufen, true);
  assert.equal(f.verpflegungSteuerfrei, false);
  assert.equal(f.fahrtUndUebernachtung, 'unbegrenzt abziehbar');
  assert.match(f.hinweis, /Fahrt- und Übernachtungskosten bleiben unbegrenzt/);
});

test('FEHLER 4 — erst vier Wochen Unterbrechung setzen neu an', () => {
  assert.equal(UNTERBRECHUNG_WOCHEN, 4);

  const kurz = dreimonatsfrist({
    beginnISO: '2026-02-01', tagISO: '2026-08-01', tageJeWoche: 5,
    unterbrechungen: [{ vonISO: '2026-05-01', bisISO: '2026-05-14' }],   // zwei Wochen
  });
  assert.deepEqual(kurz.neustarts, [], 'zwei Wochen reichen nicht');
  assert.equal(kurz.abgelaufen, true);

  const lang = dreimonatsfrist({
    beginnISO: '2026-02-01', tagISO: '2026-08-01', tageJeWoche: 5,
    unterbrechungen: [{ vonISO: '2026-05-01', bisISO: '2026-06-05' }],   // fuenf Wochen
  });
  assert.deepEqual(lang.neustarts, ['2026-06-06']);
  assert.equal(lang.fristBeginn, '2026-06-06');
  assert.equal(lang.fristEnde, '2026-09-05');
  assert.equal(lang.abgelaufen, false, 'die Frist laeuft wieder');
});

test('genau 28 Tage Unterbrechung reichen', () => {
  const f = dreimonatsfrist({
    beginnISO: '2026-02-01', tagISO: '2026-08-01', tageJeWoche: 5,
    unterbrechungen: [{ vonISO: '2026-05-01', bisISO: '2026-05-28' }],
  });
  assert.equal(f.neustarts.length, 1, '28 Tage sind vier Wochen');
});

test('eine Unterbrechung NACH dem geprueften Tag zaehlt nicht', () => {
  const f = dreimonatsfrist({
    beginnISO: '2026-02-01', tagISO: '2026-04-15', tageJeWoche: 5,
    unterbrechungen: [{ vonISO: '2026-06-01', bisISO: '2026-07-15' }],
  });
  assert.deepEqual(f.neustarts, []);
  assert.equal(f.fristBeginn, '2026-02-01');
});

test('GEMESSEN: 200 Arbeitstage auf derselben Baustelle', () => {
  const tage = [];
  let d = new Date(Date.UTC(2026, 1, 2));
  while (tage.length < 200) {
    const wt = d.getUTCDay();
    if (wt >= 1 && wt <= 5) tage.push({ tagISO: d.toISOString().slice(0, 10), betrag: 14 });
    d = new Date(d.getTime() + 86400000);
  }
  const r = einsatzReihe(tage, { beginnISO: '2026-02-02', tageJeWoche: 5 });

  assert.equal(r.gesamt, 2800, 'ohne Frist waeren es 200 mal 14 EUR');
  assert.equal(r.steuerfrei, 910, 'nur die ersten drei Kalendermonate');
  assert.equal(r.steuerpflichtig, 1890, 'der Rest ist Arbeitslohn');
  assert.equal(r.tageSteuerfrei, 65);
  assert.equal(r.tagePflichtig, 135);
  assert.match(r.hinweis, /über die Lohnabrechnung/);
});

test('eine kurze Reihe bleibt ganz steuerfrei', () => {
  const r = einsatzReihe(
    [{ tagISO: '2026-02-03', betrag: 14 }, { tagISO: '2026-03-10', betrag: 14 }],
    { beginnISO: '2026-02-02', tageJeWoche: 5 },
  );
  assert.equal(r.steuerpflichtig, 0);
  assert.equal(r.steuerfrei, 28);
  assert.ok(!/Lohnabrechnung/.test(r.hinweis));
});

test('ALTBESTAND: verpflegung und fahrtkosten rechnen unveraendert', () => {
  const v = verpflegung('2026-09-15T08:00:00', '2026-09-15T20:00:00');
  assert.equal(v.brutto, 14, 'eintaegig ueber 8 Stunden');
  const kurz = verpflegung('2026-09-15T23:00:00', '2026-09-16T01:00:00');
  assert.equal(kurz.brutto, 0, 'die Reparatur aus P29b gilt weiter');
  assert.equal(fahrtkosten(100, 'pkw'), 30);
  assert.equal(fahrtkosten(100, 'motorrad'), 20);
});
