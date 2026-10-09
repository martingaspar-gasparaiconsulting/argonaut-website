// tests/datevKfzP284.test.mjs — Paket 284 (09.10.2026) · K16b DATEV: § 25a, EU-Lieferung und Ausfuhr
// richtig buchen. Befund vorher: § 25a + Zulassung -> 7-%-Automatikkonto (erfundene Steuer),
// § 25a ohne Zusatz -> steuerfrei auf 8200 (Differenzsteuer fehlte), EU/Ausfuhr ohne eigenes Konto.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buchungAusRechnung, buchungenAusRechnung, baueExtf, extfHinweise, kfzKontenStandard, kfzSonderfall, kfzTeilBekannt, extfBetrag,
} from '../out/datevExtf.js';
import { bereich, anbieterVon } from '../out/konnektoren.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const K3 = { beraterNr: '1001', mandantNr: '20', wjBeginn: '20260101', sachkontenlaenge: 4, skr: '03', erloeskonto19: '8400', erloeskonto7: '8300', debitorSammel: '10000', kreditorSammel: '70000', bezeichnung: 'T' };
const K4 = { ...K3, skr: '04', erloeskonto19: '4400', erloeskonto7: '4300' };
const summeCent = (bs) => bs.reduce((s, b) => s + Math.round(b.umsatz * 100), 0);

// § 25a: Fahrzeug 20.000 (0 %), EK 16.430,00 -> Marge brutto 3.570,00 = 3.000,00 netto + 570,00 Differenzsteuer;
// Zulassung 500,00 netto + 95,00 USt
const D25 = { rechnungsnummer: 'R-25', rechnungsdatum: '2026-10-09', empfaenger_name: 'Anna Kauf', netto_summe: 20500, mwst_summe: 95, brutto_summe: 20595,
  steuer_sonderfall: 'diff25a', diff_bemessung: 3000, diff_steuer: 570, netto0: 20000, fahrzeug_nr: 'F-0007' };

test('Befund bleibt nachvollziehbar: ohne Sonderfall-Kenntnis bucht die alte Einzelzeile 7 %', () => {
  const alt = buchungAusRechnung({ ...D25, steuer_sonderfall: null }, K3);
  assert.equal(alt.gegenkonto, '8300');
  assert.equal(alt.bu, '2');
});

test('§ 25a mit Zulassung: drei Zeilen, Marge 19 % auf 8191, Rest ohne USt auf 8193, Zulassung 8400 — Summe auf den Cent', () => {
  const b = buchungenAusRechnung(D25, K3);
  assert.equal(b.length, 3);
  const [zus, marge, rest] = b;
  assert.deepEqual([zus.gegenkonto, zus.bu, zus.umsatz], ['8400', '3', 595]);
  assert.deepEqual([marge.gegenkonto, marge.bu, marge.umsatz], ['8191', '3', 3570]);
  assert.deepEqual([rest.gegenkonto, rest.bu, rest.umsatz], ['8193', '', 16430]);
  assert.equal(summeCent(b), 2059500);
  for (const x of b) { assert.equal(x.sh, 'S'); assert.equal(x.konto, '10000'); assert.match(x.buchungstext, /^Fzg F-0007 Rechnung Anna Kauf/); assert.equal(x.belegfeld1, 'R-25'); }
  // SKR04
  const v = buchungenAusRechnung(D25, K4).map((x) => x.gegenkonto);
  assert.deepEqual(v, ['4400', '4136', '4138']);
  assert.deepEqual(kfzKontenStandard('03'), { diff19: '8191', diff0: '8193', ausfuhr: '8120', eu: '8125' });
});

test('§ 25a ohne Zusatz: Marge + Rest, keine Zeile steuerfrei auf 8200; ohne Marge (EK fehlte) alles 8193 mit Hinweis', () => {
  const b = buchungenAusRechnung({ ...D25, netto_summe: 20000, mwst_summe: 0, brutto_summe: 20000, netto0: null }, K3);
  assert.deepEqual(b.map((x) => [x.gegenkonto, x.umsatz]), [['8191', 3570], ['8193', 16430]]);
  const ohne = { ...D25, netto_summe: 20000, mwst_summe: 0, brutto_summe: 20000, netto0: 20000, diff_bemessung: null, diff_steuer: null };
  assert.deepEqual(buchungenAusRechnung(ohne, K3).map((x) => [x.gegenkonto, x.umsatz]), [['8193', 20000]]);
  const h = extfHinweise({ rechnungen: [ohne], belege: [], konfig: K3, aufwandFallback: '4980', datumVon: '20261001', datumBis: '20261031', erzeugtAm: '1' });
  assert.ok(h.some((x) => /keine Differenz-Berechnung/.test(x)));
  assert.ok(!h.some((x) => /auf Konto 8200/.test(x)), 'Sonderfall zaehlt nicht als „steuerfrei auf 8200"');
  // Marge groesser als Fahrzeugpreis (Datenfehler) -> gedeckelt, nie negative Zeile
  const zuViel = buchungenAusRechnung({ ...D25, diff_bemessung: 30000, diff_steuer: 5700 }, K3);
  assert.ok(zuViel.every((x) => x.umsatz > 0));
  assert.equal(summeCent(zuViel), 2059500);
});

test('EU-Lieferung und Ausfuhr: eigene Konten, Zusatz mit Steuer bleibt getrennt; eigene Konten aus der Schnittstelle', () => {
  const eu = { rechnungsnummer: 'R-EU', rechnungsdatum: '2026-10-09', empfaenger_name: 'Auto SRL', netto_summe: 18000, mwst_summe: 0, brutto_summe: 18000, steuer_sonderfall: 'eu_ig', netto0: 18000 };
  assert.deepEqual(buchungenAusRechnung(eu, K3).map((x) => [x.gegenkonto, x.bu, x.umsatz]), [['8125', '', 18000]]);
  const au = { ...eu, rechnungsnummer: 'R-AU', steuer_sonderfall: 'ausfuhr', netto_summe: 18300, mwst_summe: 57, brutto_summe: 18357, netto0: 18000 };
  assert.deepEqual(buchungenAusRechnung(au, K4).map((x) => [x.gegenkonto, x.bu, x.umsatz]), [['4400', '3', 357], ['4120', '', 18000]]);
  const eigen = { ...K3, erloeskontoEu: '8126', erloeskontoDiff19: ' ', erloeskontoAusfuhr: '8121' };
  assert.equal(buchungenAusRechnung(eu, eigen)[0].gegenkonto, '8126');
  assert.equal(buchungenAusRechnung(au, eigen)[1].gegenkonto, '8121');
  assert.equal(buchungenAusRechnung(D25, eigen)[1].gegenkonto, '8191', 'leer = Vorbelegung');
  // 0-%-Teil groesser als die Rechnung (Datenfehler) -> gedeckelt, Summe bleibt der Rechnungsbetrag
  const kaputt = buchungenAusRechnung({ ...eu, netto0: 19000 }, K3);
  assert.equal(summeCent(kaputt), 1800000);
});

test('Unbekannter 0-%-Teil mit Steuer: nicht raten, eine Zeile wie bisher und Hinweis mit Rechnungsnummer', () => {
  const r = { ...D25, netto0: null };
  assert.equal(kfzTeilBekannt(r), false);
  assert.equal(buchungenAusRechnung(r, K3).length, 1);
  const h = extfHinweise({ rechnungen: [r], belege: [], konfig: K3, aufwandFallback: '4980', datumVon: '20261001', datumBis: '20261031', erzeugtAm: '1' });
  assert.ok(h.some((x) => /R-25.*nicht aufgeteilt werden, weil die Positionen fehlen/.test(x)));
});

test('Gutschrift (negativer Betrag) wird im Haben aufgeteilt; normale Rechnung unveraendert eine Zeile', () => {
  const g = buchungenAusRechnung({ ...D25, netto_summe: -20500, mwst_summe: -95, brutto_summe: -20595, netto0: -20000, diff_bemessung: -3000, diff_steuer: -570 }, K3);
  assert.equal(g.length, 3);
  assert.ok(g.every((x) => x.sh === 'H' && x.umsatz < 0));
  assert.equal(summeCent(g), -2059500);
  assert.equal(extfBetrag(g[1].umsatz), '3570,00');
  const normal = { rechnungsnummer: 'R-1', rechnungsdatum: '2026-10-01', empfaenger_name: 'X', netto_summe: 100, mwst_summe: 19, brutto_summe: 119 };
  assert.equal(kfzSonderfall(normal), null);
  assert.deepEqual(buchungenAusRechnung(normal, K3), [buchungAusRechnung(normal, K3)]);
  assert.equal(kfzSonderfall({ steuer_sonderfall: 'quatsch' }), null);
});

test('Stapel: Aufteilung landet als eigene Zeilen in der Datei; Hinweise nennen Konten', () => {
  const eu = { rechnungsnummer: 'R-EU', rechnungsdatum: '2026-10-09', empfaenger_name: 'Auto SRL', netto_summe: 18000, mwst_summe: 0, brutto_summe: 18000, steuer_sonderfall: 'eu_ig', netto0: 18000 };
  const e = { rechnungen: [D25, eu], belege: [], konfig: K3, aufwandFallback: '4980', datumVon: '20261001', datumBis: '20261031', erzeugtAm: '20261009100000000' };
  const zeilen = baueExtf(e).replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(zeilen.length, 2 + 4);
  assert.ok(zeilen.some((z) => z.startsWith('3570,00;"S";"EUR";;;;10000;8191;3;0910;"R-25"')));
  assert.ok(zeilen.some((z) => z.startsWith('16430,00;"S";"EUR";;;;10000;8193;;0910;"R-25"')));
  assert.ok(zeilen.some((z) => z.startsWith('18000,00;"S";"EUR";;;;10000;8125;;0910;"R-EU"')));
  const h = extfHinweise(e);
  assert.ok(h.some((x) => /§ 25a.*8191.*8193/.test(x)));
  assert.ok(h.some((x) => /innergemeinschaftliche Lieferung auf 8125/.test(x)));
});

test('Route und Schnittstelle: Sonderfall-Spalten mit Rueckfall, Positionen, Fahrzeugnummer; Konten einstellbar', () => {
  const r = lies('app/api/datev-export/route.ts');
  assert.ok(r.includes('steuer_sonderfall, diff_bemessung, diff_steuer'));
  assert.ok(r.includes('if (rRes.error) rRes = await ladeRechnungen(BASIS)'), 'ohne SQL p268 wie bisher');
  assert.ok(r.includes("from('rechnung_positionen')") && r.includes("from('kfz_verkauf')"));
  assert.ok(r.includes('erloeskontoDiff19: cfg.erloeskonto_diff19'));
  assert.ok(r.includes(".neq('zahlungsstatus', 'storniert')"), 'stornierte bleiben draussen (wie UStVA)');
  assert.ok(bereich('datev'));
  const felder = anbieterVon('datev', 'manuell').felder.map((f) => f.key);
  for (const k of ['erloeskonto_diff19', 'erloeskonto_diff0', 'erloeskonto_eu', 'erloeskonto_ausfuhr']) assert.ok(felder.includes(k), k);
});
