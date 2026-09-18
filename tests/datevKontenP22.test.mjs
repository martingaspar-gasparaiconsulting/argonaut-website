import test from 'node:test';
import assert from 'node:assert/strict';
import {
  datevVorschlag, datevKontenListe, datevHinweise, DATEV_REGELN, DATEV_FALLBACK,
} from '../out/datevKonten.js';

// ===========================================================================
// PUNKT 22 — DATEV-Kontenzuordnung repariert (18.09.2026)
//
// Am echten Code GEMESSEN, bevor etwas geaendert wurde:
//   Metabo Werkzeug GmbH   -> 4600 Werbekosten     ("Meta" in "Metabo")
//   Espressomaschine Jura  -> 4530 Kraftstoff      ("Esso" in "Espresso")
//   Parallelanlagen Bau    -> 4530 Kraftstoff      ("Aral" in "Parallel")
//   Cloud-Backups Hetzner  -> 4910 Porto           ("UPS" in "Backups")
//   Poster Druckerei       -> 4910 Porto           ("Post" in "Poster")
//   Kompostierung Bauer    -> 4910 Porto           ("Post" in "Kompost")
//   Flugblatt Verteilung   -> 4670 Reisekosten     ("Flug" in "Flugblatt")
//   Schreinerwerkstatt     -> 4540 Kfz-Reparaturen ("Werkstatt")
//   Material / Shell       -> 4530 Kraftstoff      (Lieferant schlug Kategorie)
// ===========================================================================

// ── 1) Markennamen stecken nicht mehr in fremden Woertern ──────────────────

test('Markennamen treffen nur als ganzes Wort', () => {
  assert.notEqual(datevVorschlag(null, 'Metabo Werkzeug GmbH').skr03, '4600', 'Metabo ist keine Werbung');
  assert.notEqual(datevVorschlag(null, 'Espressomaschine Jura').skr03, '4530', 'Espresso ist kein Diesel');
  assert.notEqual(datevVorschlag(null, 'Parallelanlagen Bau GmbH').skr03, '4530', 'Parallel ist kein Aral');
  assert.notEqual(datevVorschlag('EDV', 'Cloud-Backups Hetzner').skr03, '4910', 'Backups sind kein Porto');
});

test('Die Marken selbst treffen weiterhin', () => {
  assert.equal(datevVorschlag(null, 'Shell Deutschland').skr03, '4530');
  assert.equal(datevVorschlag(null, 'ARAL Station Boeblingen').skr03, '4530');
  assert.equal(datevVorschlag(null, 'Meta Platforms Ireland').skr03, '4600');
  assert.equal(datevVorschlag(null, 'UPS Paketdienst').skr03, '4910');
  assert.equal(datevVorschlag(null, 'Deutsche Telekom AG').skr03, '4920');
  assert.equal(datevVorschlag(null, 'E.ON Energie').skr03, '4240');
  assert.equal(datevVorschlag(null, '1&1 Telecom').skr03, '4920');
  assert.equal(datevVorschlag(null, 'IHK Region Stuttgart').skr03, '4380');
});

test('Metabo landet dort, wo Werkzeug hingehoert', () => {
  assert.equal(datevVorschlag('Werkzeug', 'Metabo GmbH').skr03, '4985');
});

// ── 2) Sachbegriffe nur am Wortanfang ──────────────────────────────────────

test('Deutsche Komposita treffen weiter, Wortinneres nicht mehr', () => {
  assert.equal(datevVorschlag('Bürobedarf').skr03, '4930', 'Kompositum muss treffen');
  assert.equal(datevVorschlag('Tankstellenrechnung').skr03, '4530');
  assert.equal(datevVorschlag('Postgebuehren').skr03, '4910');
  // und das Wortinnere nicht:
  assert.equal(datevVorschlag('Projektmaterial').skr03, '3400', '"jet" darf in "Projekt" nicht treffen');
  assert.equal(datevVorschlag(null, 'Kompostierung Bauer').treffer, false, '"post" darf in "Kompost" nicht treffen');
  assert.equal(datevVorschlag('Fortbildung', 'Exkursion Stuttgart').skr03, '4945');
  assert.equal(datevVorschlag(null, 'Exkursion Stuttgart').treffer, false, '"kurs" darf in "Exkursion" nicht treffen');
});

test('Ausnahmelisten fangen die bekannten Ausreisser', () => {
  assert.equal(datevVorschlag(null, 'Poster Druckerei').skr03, '4600', 'Poster ist Werbung, nicht Porto');
  assert.equal(datevVorschlag(null, 'Flugblatt Verteilung').skr03, '4600', 'Flugblatt ist Werbung, nicht Reise');
  assert.equal(datevVorschlag(null, 'Gasthaus Krone').skr03, '4650', 'Gasthaus ist Bewirtung, nicht Gas');
  assert.equal(datevVorschlag(null, 'Gaststaette Adler').skr03, '4650');
  assert.equal(datevVorschlag('Mietwagen Firma').skr03, '4670', 'Mietwagen ist Reise, nicht Raummiete');
});

test('Eine Schreinerwerkstatt ist keine Kfz-Werkstatt', () => {
  assert.notEqual(datevVorschlag(null, 'Schreinerwerkstatt Holz').skr03, '4540');
  assert.equal(datevVorschlag('Reparatur', 'Schreinerwerkstatt Holz').skr03, '4805');
  assert.equal(datevVorschlag('KFZ-Werkstatt Mueller').skr03, '4540', 'die echte Kfz-Werkstatt trifft weiter');
});

// ── 3) Kategorie schlaegt Lieferant ────────────────────────────────────────

test('Die Kategorie entscheidet, nicht der Lieferantenname', () => {
  const v = datevVorschlag('Material', 'Shell Deutschland');
  assert.equal(v.skr03, '3400', 'vorher gewann Shell und es wurde Kraftstoff');
  assert.equal(v.quelle, 'kategorie');
  assert.equal(v.stichwort, 'material');
});

test('Ohne brauchbare Kategorie zaehlt der Lieferant', () => {
  const v = datevVorschlag('Sonstiges', 'Shell Deutschland');
  assert.equal(v.skr03, '4530');
  assert.equal(v.quelle, 'lieferant');
  assert.equal(v.stichwort, 'shell');
});

test('Ohne beides kommt das Sammelkonto, ehrlich als Fallback markiert', () => {
  const v = datevVorschlag(null, null);
  assert.equal(v.treffer, false);
  assert.equal(v.quelle, 'fallback');
  assert.equal(v.stichwort, null);
  assert.equal(v.skr03, DATEV_FALLBACK.skr03);
  assert.equal(datevVorschlag('Irgendwas', 'Firma XY').treffer, false);
});

// ── 4) Beide Kontenrahmen ──────────────────────────────────────────────────

test('SKR03 und SKR04 kommen immer als Paar', () => {
  for (const r of DATEV_REGELN) {
    assert.match(r.skr03, /^[0-9]{4}$/, r.bezeichnung);
    assert.match(r.skr04, /^[0-9]{4}$/, r.bezeichnung);
  }
  const v = datevVorschlag('Telefon');
  assert.equal(v.skr03, '4920');
  assert.equal(v.skr04, '6805');
});

test('Die Auswahlliste enthaelt jede Regel plus das Sammelkonto', () => {
  const l3 = datevKontenListe('skr03');
  const l4 = datevKontenListe('skr04');
  assert.equal(l3.length, DATEV_REGELN.length + 1);
  assert.equal(l4.length, DATEV_REGELN.length + 1);
  assert.ok(l3.some((x) => x.konto === DATEV_FALLBACK.skr03));
});

test('Kein Stichwort steht in zwei Regeln — sonst entscheidet still die Reihenfolge', () => {
  const gesehen = new Map();
  const doppelt = [];
  for (const r of DATEV_REGELN) {
    for (const k of [...r.keywords, ...(r.marken ?? [])]) {
      if (gesehen.has(k)) doppelt.push(`"${k}": ${gesehen.get(k)} und ${r.bezeichnung}`);
      else gesehen.set(k, r.bezeichnung);
    }
  }
  assert.deepEqual(doppelt, []);
});

// ── 5) Hinweise ────────────────────────────────────────────────────────────

test('Ein Treffer nur ueber den Lieferanten wird als schwaecher gekennzeichnet', () => {
  const v = datevVorschlag('Sonstiges', 'Shell Deutschland');
  const h = datevHinweise(v, 'Sonstiges', 'Shell Deutschland').join(' | ');
  assert.ok(h.includes('Lieferantennamen'), h);
});

test('Bewirtung bekommt den Steuer-Hinweis, statt die 30 % zu raten', () => {
  const v = datevVorschlag('Bewirtung');
  const h = datevHinweise(v, 'Bewirtung', null).join(' | ');
  assert.ok(h.includes('30 %'), h);
  assert.ok(h.includes('§ 4 Abs. 5 Nr. 2 EStG'), h);
  assert.equal(v.skr03, '4650', 'das Konto selbst bleibt unveraendert');
});

test('Widersprechen sich Kategorie und Lieferant, steht das im Klartext', () => {
  const v = datevVorschlag('Material', 'Shell Deutschland');
  const h = datevHinweise(v, 'Material', 'Shell Deutschland').join(' | ');
  assert.ok(h.includes('verschiedene Konten'), h);
  assert.ok(h.includes('Kraftstoff'), h);
  assert.ok(h.includes('Die Kategorie hat entschieden'), h);
});

test('Das Sammelkonto sagt, dass von Hand kontiert werden muss', () => {
  const v = datevVorschlag('Irgendwas', 'Firma XY');
  const h = datevHinweise(v, 'Irgendwas', 'Firma XY').join(' | ');
  assert.ok(h.includes('Keine Regel hat gegriffen'), h);
});

test('Ein sauberer Kategorie-Treffer ohne Besonderheit erzeugt keine Hinweise', () => {
  const v = datevVorschlag('Telefon', 'Telekom');
  assert.deepEqual(datevHinweise(v, 'Telefon', 'Telekom'), []);
});

// ── 6) Die Kette: alle gemessenen Faelle auf einmal ────────────────────────

test('KETTE: keiner der gemessenen Fehlgriffe kommt zurueck', () => {
  const falsch = [
    ['Material', 'Metabo Werkzeug GmbH', '4600'],
    ['Kaffee', 'Espressomaschine Jura', '4530'],
    ['Material', 'Parallelanlagen Bau GmbH', '4530'],
    ['EDV', 'Cloud-Backups Hetzner', '4910'],
    ['Werbung', 'Poster Druckerei', '4910'],
    ['Gartenbau', 'Kompostierung Bauer', '4910'],
    ['Werbung', 'Flugblatt Verteilung', '4670'],
    ['Reparatur', 'Schreinerwerkstatt Holz', '4540'],
    ['Material', 'Shell Deutschland', '4530'],
  ];
  for (const [k, l, altFalsch] of falsch) {
    assert.notEqual(datevVorschlag(k, l).skr03, altFalsch, `${k} / ${l} darf nicht mehr auf ${altFalsch}`);
  }
});

test('Jede erlaubte Wortendung ist auch ein normales Stichwort der Regel', () => {
  // endungen ist eine Erweiterung bestehender Stichworte, kein Hintertuerchen
  // fuer neue. Sonst waere die Liste eine zweite, unsichtbare Regelmenge.
  for (const r of DATEV_REGELN) {
    for (const e of r.endungen ?? []) {
      assert.ok(r.keywords.includes(e), `"${e}" fehlt in keywords von ${r.bezeichnung}`);
    }
  }
});

test('Komposita mit dem Stichwort hinten treffen, gefaehrliche Kurzwoerter nicht', () => {
  assert.equal(datevVorschlag('Projektmaterial').skr03, '3400');
  assert.equal(datevVorschlag('Anlagenwartung').skr03, '4805');
  assert.equal(datevVorschlag('Mitarbeiterfortbildung').skr03, '4945');
  assert.equal(datevVorschlag('Betriebshaftpflichtversicherung').skr03, '4360');
  assert.equal(datevVorschlag('Untermiete Lager').skr03, '4210');
  // und die Gegenrichtung: kurze oder mehrdeutige Woerter bleiben am Wortanfang
  assert.notEqual(datevVorschlag(null, 'Streifenfundament Bau').skr03, '4540', '"reifen" darf nicht in "Streifen" treffen');
  assert.notEqual(datevVorschlag(null, 'Hardware Shop').skr03, '3400', '"ware" darf nicht in "Hardware" treffen');
  assert.notEqual(datevVorschlag(null, 'Software Lizenz').skr03, '3400');
  assert.equal(datevVorschlag(null, 'Software Lizenz').skr03, '4806');
});

test('Beratungs-Komposita landen wieder dort, wo sie hingehoeren', () => {
  assert.equal(datevVorschlag('Steuerberatung').skr03, '4957');
  assert.equal(datevVorschlag('Rechtsberatung').skr03, '4950');
  assert.equal(datevVorschlag('Unternehmensberatung').skr03, '4950');
  assert.equal(datevVorschlag('Lohnbuchhaltung').skr03, '4957');
});

test('Zu allgemeine Woerter sind keine Marken', () => {
  // "Total Quality GmbH" ist keine Tankstelle, "Signal Elektro" keine Versicherung,
  // und eine Pensionskasse ist Personal, keine Reise.
  assert.notEqual(datevVorschlag(null, 'Total Quality GmbH').skr03, '4530');
  assert.notEqual(datevVorschlag(null, 'Signal Elektro GmbH').skr03, '4360');
  assert.notEqual(datevVorschlag('Pensionskasse').skr03, '4670');
  // die echten Marken bleiben
  assert.equal(datevVorschlag(null, 'AGIP Tankstelle').skr03, '4530');
  assert.equal(datevVorschlag(null, 'HDI Versicherung').skr03, '4360');
});

test('Die Ausnahmeliste entscheidet dort, wo sie steht', () => {
  // Jeder dieser Faelle wurde mit und ohne Ausnahmeliste gemessen und kippt.
  assert.equal(datevVorschlag('Büromiete').skr03, '4210', 'ohne Ausnahme waere es Buerobedarf 4930');
  assert.equal(datevVorschlag('Bürozins').skr03, '4210');
  assert.equal(datevVorschlag('Warenwirtschaft Update').treffer, false, 'ohne Ausnahme waere es Material 3400');
  assert.equal(datevVorschlag('Einkaufsgutschein').treffer, false);
  assert.equal(datevVorschlag('Reifenglaettung').treffer, false, 'ohne Ausnahme waere es Kfz-Reparatur 4540');
  assert.equal(datevVorschlag(null, 'Stromberg Gemeinde').treffer, false, 'ohne Ausnahme waere es Strom 4240');
  // und der echte Bürobedarf trifft weiter
  assert.equal(datevVorschlag('Bürobedarf').skr03, '4930');
  assert.equal(datevVorschlag('Reifen wechseln').skr03, '4540');
  assert.equal(datevVorschlag('Stromrechnung').skr03, '4240');
});

test('Jedes Konto kommt in der Auswahlliste genau einmal vor', () => {
  // Die Seite benutzt das Konto als React-key im Auswahlfeld.
  for (const rahmen of ['skr03', 'skr04']) {
    const konten = datevKontenListe(rahmen).map((x) => x.konto);
    assert.equal(new Set(konten).size, konten.length, `doppeltes Konto in ${rahmen}`);
  }
});
