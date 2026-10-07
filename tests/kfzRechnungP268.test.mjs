// ============================================================================
// tests/kfzRechnungP268.test.mjs — Paket 268 (07.10.2026) · K7 Rechnung Fahrzeugverkauf
// § 25a ohne Steuerausweis, Regelsteuer centgenau, EU-Lieferung / Ausfuhr steuerfrei,
// Inzahlungnahme mindert die Rechnung nicht, PDF- und E-Rechnungs-Hinweise.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  steuerfall, ustIdEuGueltig, neufahrzeugEu, nettoAufteilen, rechnungBauen, startStatus, empfaenger, fahrzeugBezeichnung, lieferungLesen,
} from '../out/kfzRechnung.js';
import { sonderfallLesen, pflichtHinweis, xmlKategorie, zahlNachVorab, spaltenText, gruppenLabel } from '../out/steuerSonderfall.js';
import { anschriftZerlegen } from '../out/rechnungAnschrift.js';
import { baueZugferdXml } from '../out/zugferd.js';
import { steuerGruppen } from '../out/steuerLogik.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = '2026-10-07';

const verkauf = (x = {}) => ({
  nr: 'V-0001', status: 'vertrag', kaeufer_art: 'verbraucher', kaeufer_name: 'Max Muster', kaeufer_firma: null,
  kaeufer_anschrift: 'Teststraße 1\n71032 Böblingen', kaeufer_tel: null, kaeufer_email: null, kaeufer_ustid: null, ausweis_geprueft: true,
  preis_brutto: 20000, zusatz: [], inzahlung_ankauf_id: null, inzahlung_betrag: null, anzahlung: null, anzahlung_am: null, anzahlung_art: null,
  rest_art: 'ueberweisung', gwg_erledigt: false, gewaehr: 'gesetzlich', gewaehr_gesondert: false, angebot_gueltig_bis: null, reserviert_bis: null,
  vertrag_am: '2026-10-05', liefertermin: null, vereinbarungen: null, uebergabe_am: null, km_uebergabe: null, schluessel: null, papiere: [], ...x,
});
const fz = (x = {}) => ({
  interne_nr: 'F-0007', marke: 'Testmarke', modell: 'Kombi', variante: '2.0', fin: 'WVWZZZ1KZAW000001', kennzeichen: 'BB-AB 123',
  erstzulassung: '2019-03-01', km_stand: 85000, leistung_kw: 110, kraftstoff: 'Diesel', farbe: 'Grau', hu_bis: '2027-05-01', vorbesitzer: 2,
  vorschaden: 'keine_bekannt', vorschaden_text: null, besteuerung: '25a', vk_brutto: 20500, ...x,
});
const summe = (posten) => steuerGruppen(posten.map((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

test('Steuerfall: § 25a Inland, Regel Inland, EU nur mit Regelsteuer + Unternehmer + USt-IdNr., Ausfuhr', () => {
  assert.equal(steuerfall('25a', 'inland', verkauf(), null).sonderfall, 'diff25a');
  assert.equal(steuerfall('regel', 'inland', verkauf(), null).sonderfall, null);
  assert.equal(steuerfall('regel', 'inland', verkauf(), null).fehler.length, 0);
  assert.match(steuerfall(null, 'inland', verkauf(), null).fehler[0], /Besteuerung des Fahrzeugs fehlt/);

  const u = verkauf({ kaeufer_art: 'unternehmer', kaeufer_firma: 'Auto GmbH', kaeufer_ustid: 'ATU12345678' });
  const eu = steuerfall('regel', 'eu', u, 'DE123456789', fz(), HEUTE);
  assert.equal(eu.sonderfall, 'eu_ig');
  assert.ok(eu.hinweise.some((h) => /Gelangensbestätigung/.test(h)));
  assert.ok(eu.hinweise.some((h) => /Bundeszentralamt/.test(h)));
  // § 25a Abs. 7 Nr. 3: keine steuerfreie EU-Lieferung bei Differenzbesteuerung
  const eu25 = steuerfall('25a', 'eu', u, 'DE123456789');
  assert.equal(eu25.sonderfall, null);
  assert.ok(eu25.fehler.some((f) => /§ 25a Abs\. 7 Nr\. 3/.test(f)));
  assert.ok(steuerfall('regel', 'eu', verkauf(), 'DE1').fehler.some((f) => /nur an Unternehmer/.test(f)));
  assert.ok(steuerfall('regel', 'eu', { ...u, kaeufer_ustid: 'DE123456789' }, 'DE1').fehler.some((f) => /USt-IdNr\. des Käufers/.test(f)));
  assert.ok(steuerfall('regel', 'eu', u, '').fehler.some((f) => /eigene USt-IdNr/.test(f)));

  const aus = steuerfall('25a', 'ausfuhr', verkauf(), null);
  assert.equal(aus.sonderfall, 'ausfuhr');
  assert.ok(aus.hinweise.some((h) => /Ausfuhrnachweis/.test(h)));
  assert.equal(lieferungLesen('mars'), 'inland');
});

test('USt-IdNr. EU-Form und Neufahrzeug-Hinweis (§ 1b UStG)', () => {
  for (const ok of ['ATU12345678', 'FR12345678901', 'EL123456789', 'NL123456789B01', 'at u 1234 5678']) assert.equal(ustIdEuGueltig(ok), true, ok);
  for (const nein of ['DE123456789', 'CH123456789', 'U12345', '', null, 'XX12']) assert.equal(ustIdEuGueltig(nein), false, String(nein));
  assert.equal(neufahrzeugEu({ km_stand: 5000, erstzulassung: '2020-01-01' }, HEUTE), true);
  assert.equal(neufahrzeugEu({ km_stand: 20000, erstzulassung: '2026-06-01' }, HEUTE), true);
  assert.equal(neufahrzeugEu({ km_stand: 20000, erstzulassung: '2026-03-01' }, HEUTE), false);
  const u = verkauf({ kaeufer_art: 'unternehmer', kaeufer_ustid: 'ATU12345678' });
  assert.ok(steuerfall('regel', 'eu', u, 'DE1', fz({ km_stand: 3000 }), HEUTE).hinweise.some((h) => /§ 1b UStG/.test(h)));
});

test('§ 25a: Fahrzeug ohne Steuerausweis, Zusatzleistungen mit 19 % centgenau, Differenzsteuer nur intern', () => {
  const v = verkauf({ zusatz: [{ text: 'Zulassung', betrag: 149 }, { text: 'Überführung', betrag: 299.99 }] });
  const r = rechnungBauen(v, fz(), 'diff25a', 15000, null);
  assert.deepEqual(r.fehler, []);
  assert.equal(r.posten[0].mwst_satz, 0);
  assert.equal(r.posten[0].gesamt_netto, 20000);
  assert.match(r.posten[0].bezeichnung, /FIN WVWZZZ1KZAW000001/);
  assert.equal(r.posten[1].mwst_satz, 19);
  assert.equal(r.brutto, 20448.99);                  // genau der vereinbarte Gesamtpreis
  assert.equal(summe(r.posten).brutto, r.brutto);
  // Marge 5.000 € -> 19/119 = 798,32 Differenzsteuer, Bemessung 4.201,68
  assert.equal(r.diffSteuer, 798.32);
  assert.equal(r.diffBemessung, 4201.68);
  assert.ok(r.hinweise.some((h) => /Nebenleistung/.test(h)));
  // unter Einkaufspreis: keine Differenzsteuer
  const verlust = rechnungBauen(verkauf(), fz(), 'diff25a', 22000, null);
  assert.equal(verlust.diffSteuer, 0);
  assert.equal(verlust.diffBemessung, 0);
  // ohne Einkaufspreis: offen + Hinweis
  const ohne = rechnungBauen(verkauf(), fz(), 'diff25a', null, null);
  assert.equal(ohne.diffSteuer, null);
  assert.ok(ohne.hinweise.some((h) => /Einkaufspreis fehlt/.test(h)));
});

test('Regelsteuer: Rechnung landet centgenau beim vereinbarten Bruttopreis (Steuer auf die Gruppensumme)', () => {
  let exakt = 0, faelle = 0;
  for (let p = 9990; p <= 10010; p += 0.01) {
    for (const z of [[], [149], [99.99, 250.01]]) {
      const v = verkauf({ preis_brutto: Math.round(p * 100) / 100, zusatz: z.map((b, i) => ({ text: 'Z' + i, betrag: b })) });
      const r = rechnungBauen(v, fz({ besteuerung: 'regel' }), null, null, null);
      const ziel = Math.round((Math.round(p * 100) + z.reduce((a, b) => a + Math.round(b * 100), 0))) / 100;
      faelle++;
      // nie mehr als vereinbart, höchstens 1 Cent weniger
      assert.ok(r.brutto <= ziel && ziel - r.brutto <= 0.011, `${p} ${z}: ${r.brutto} statt ${ziel}`);
      if (r.brutto !== ziel) assert.ok(r.hinweise.some((h) => /Rundung: Die Rechnung weicht um/.test(h)));
      if (r.brutto === ziel) exakt++;
      assert.ok(r.posten.every((x) => x.mwst_satz === 19));
      assert.equal(summe(r.posten).brutto, r.brutto);
    }
  }
  assert.ok(exakt / faelle > 0.8, `nur ${exakt} von ${faelle} exakt`);
  assert.deepEqual(nettoAufteilen([]), { netto: [], abweichung: 0 });
  assert.equal(nettoAufteilen([119]).netto[0], 100);
});

test('EU-Lieferung / Ausfuhr: alle Posten 0 %, Netto aus Brutto; § 25a + Ausfuhr = vereinbarter Preis', () => {
  const v = verkauf({ preis_brutto: 23800, zusatz: [{ text: 'Überführung', betrag: 119 }] });
  const eu = rechnungBauen(v, fz({ besteuerung: 'regel' }), 'eu_ig', null, null);
  assert.ok(eu.posten.every((x) => x.mwst_satz === 0));
  assert.equal(eu.posten[0].gesamt_netto, 20000);
  assert.equal(eu.brutto, 20100);
  assert.equal(eu.steuer, 0);
  const aus25 = rechnungBauen(v, fz(), 'ausfuhr', 15000, null);
  assert.equal(aus25.posten[0].gesamt_netto, 23800);
  assert.equal(aus25.diffSteuer, null);
});

test('Inzahlungnahme und Anzahlung mindern die Rechnung NICHT — vorab verrechnet, Rest, Auszahlung', () => {
  const v = verkauf({ inzahlung_ankauf_id: 'a1', inzahlung_betrag: 5000, anzahlung: 1000, anzahlung_am: '2026-10-01' });
  const r = rechnungBauen(v, fz(), 'diff25a', 15000, 'Altmarke Klein, FIN X');
  assert.equal(r.brutto, 20000);
  assert.equal(r.vorab, 6000);
  assert.equal(r.rest, 14000);
  assert.match(r.zahlungsText, /In Zahlung genommenes Fahrzeug \(Altmarke Klein, FIN X\): 5\.000,00 € angerechnet/);
  assert.match(r.zahlungsText, /Anzahlung erhalten am 01\.10\.2026: 1\.000,00 €/);
  assert.match(r.zahlungsText, /Noch zu zahlen: 14\.000,00 €/);
  assert.equal(startStatus(r.brutto, r.vorab), 'teilbezahlt');
  const viel = rechnungBauen(verkauf({ inzahlung_ankauf_id: 'a1', inzahlung_betrag: 25000 }), fz(), 'diff25a', 15000, null);
  assert.equal(viel.vorab, 20000);
  assert.equal(viel.auszahlung, 5000);
  assert.equal(startStatus(viel.brutto, viel.vorab), 'bezahlt');
  assert.equal(startStatus(100, 0), 'offen');
  // ohne Kaufvertrag keine Rechnung
  assert.ok(rechnungBauen(verkauf({ status: 'reserviert' }), fz(), 'diff25a', 1, null).fehler.length > 0);
  assert.ok(rechnungBauen(verkauf({ preis_brutto: null }), fz(), 'diff25a', 1, null).fehler.some((f) => /Fahrzeugpreis/.test(f)));
  assert.deepEqual(empfaenger(verkauf({ kaeufer_firma: 'Auto GmbH' })), { name: 'Auto GmbH · Max Muster', anschrift: 'Teststraße 1\n71032 Böblingen' });
  assert.ok(fahrzeugBezeichnung(fz(), 86000).includes('86.000 km'));
});

test('Sonderfall-Texte: Pflichthinweise, Spalte, E-Rechnungs-Kategorie, Zahlbetrag', () => {
  assert.equal(sonderfallLesen('diff25a'), 'diff25a');
  assert.equal(sonderfallLesen('irgendwas'), null);
  assert.match(pflichtHinweis('diff25a'), /Gebrauchtgegenstände\/Sonderregelung/);
  assert.match(pflichtHinweis('diff25a'), /§ 14a Abs\. 6 UStG/);
  assert.match(pflichtHinweis('eu_ig', 'DE123', 'ATU1'), /ATU1.*DE123/);
  assert.match(pflichtHinweis('eu_ig', '', ''), /— fehlt —/);
  assert.match(pflichtHinweis('ausfuhr'), /§ 4 Nr\. 1 Buchst\. a/);
  assert.equal(spaltenText('diff25a', 0), '§ 25a');
  assert.equal(spaltenText('diff25a', 19), null);
  assert.equal(spaltenText(null, 0), null);
  assert.match(gruppenLabel('diff25a'), /ohne gesonderten Steuerausweis/);
  assert.deepEqual([xmlKategorie('diff25a').code, xmlKategorie('eu_ig').code, xmlKategorie('ausfuhr').code], ['VATEX-EU-F', 'VATEX-EU-IC', 'VATEX-EU-G']);
  assert.deepEqual(zahlNachVorab(20000, 6000), { vorab: 6000, rest: 14000 });
  assert.deepEqual(zahlNachVorab(20000, '6000.5'), { vorab: 6000.5, rest: 13999.5 });
  assert.deepEqual(zahlNachVorab(100, null), { vorab: 0, rest: 100 });
  assert.deepEqual(zahlNachVorab(100, 500), { vorab: 100, rest: 0 });
  assert.deepEqual(anschriftZerlegen('Teststraße 1\n71032 Böblingen'), { strasse: 'Teststraße 1', plz: '71032', ort: 'Böblingen', land: 'DE' });
  assert.deepEqual(anschriftZerlegen('Ring 2, A-1010 Wien'), { strasse: 'Ring 2', plz: '1010', ort: 'Wien', land: 'AT' });
  assert.equal(anschriftZerlegen('irgendwo').plz, '');
});

test('E-Rechnung: § 25a = E/VATEX-EU-F neben S, EU = K mit Lieferland, ohne Sonderfall unverändert', () => {
  const basis = {
    aussteller: { name: 'Autohaus', adresse: { strasse: 'A 1', plz: '71032', ort: 'Böblingen', land: 'DE' }, ust_idnr: 'DE123456789' },
    empfaenger: { name: 'Max', adresse: { strasse: 'B 2', plz: '1010', ort: 'Wien', land: 'DE' }, ust_idnr: 'ATU12345678' },
  };
  const pos = [
    { bezeichnung: 'Fahrzeug', menge: 1, einheit: 'Stk', einzelpreis: 20000, mwst_satz: 0, gesamt_netto: 20000 },
    { bezeichnung: 'Zulassung', menge: 1, einheit: 'Stk', einzelpreis: 125.21, mwst_satz: 19, gesamt_netto: 125.21 },
  ];
  const r = { rechnungsnummer: 'RE-1', rechnungsdatum: HEUTE, steuer_sonderfall: 'diff25a' };
  const xml = baueZugferdXml({ ...basis, rechnung: r, positionen: pos }).xml;
  assert.match(xml, /<ram:CategoryCode>E<\/ram:CategoryCode>/);
  // Zeile UND Steuergruppe tragen E (Fahrzeug), die Zulassung S — sonst lehnt die Prüfung ab (BR-E-01)
  assert.equal((xml.match(/<ram:CategoryCode>E<\/ram:CategoryCode>/g) || []).length, 2);
  assert.equal((xml.match(/<ram:CategoryCode>S<\/ram:CategoryCode>/g) || []).length, 2);
  assert.match(xml, /<ram:ExemptionReasonCode>VATEX-EU-F<\/ram:ExemptionReasonCode>/);
  assert.match(xml, /<ram:CategoryCode>S<\/ram:CategoryCode>/);
  assert.match(xml, /<ram:GrandTotalAmount>20149\.00<\/ram:GrandTotalAmount>/);
  const eu = baueZugferdXml({ ...basis, rechnung: { ...r, steuer_sonderfall: 'eu_ig' }, positionen: [{ ...pos[0] }] }).xml;
  assert.match(eu, /<ram:CategoryCode>K<\/ram:CategoryCode>/);
  assert.match(eu, /<ram:ShipToTradeParty>\s*<ram:PostalTradeAddress>\s*<ram:CountryID>AT<\/ram:CountryID>/);
  // ohne Sonderfall (und mit unbekanntem Wert) bleibt das XML Zeichen für Zeichen gleich
  const ohne = baueZugferdXml({ ...basis, rechnung: { rechnungsnummer: 'RE-1', rechnungsdatum: HEUTE }, positionen: pos }).xml;
  const quatsch = baueZugferdXml({ ...basis, rechnung: { rechnungsnummer: 'RE-1', rechnungsdatum: HEUTE, steuer_sonderfall: 'xyz' }, positionen: pos }).xml;
  assert.equal(ohne, quatsch);
  assert.doesNotMatch(ohne, /VATEX|ShipToTradeParty/);
  // Kleinunternehmer geht vor
  const klein = baueZugferdXml({ ...basis, rechnung: { ...r, kleinunternehmer: true }, positionen: pos }).xml;
  assert.doesNotMatch(klein, /VATEX-EU-F/);
});

test('Route, PDF, Seite und SQL: Recht vor Anlegen, Doppelschutz, Pflichthinweis, Zahlbetrag, additiv', () => {
  const route = lies('app/api/rechnung-aus-kfz-verkauf/route.ts');
  assert.ok(route.indexOf('const abr = await abrechnungPruefen(supabase, user.id);') < route.indexOf('.from("rechnungen")\n      .insert('));
  assert.ok(route.includes('vorhanden.zahlungsstatus !== "storniert"'));
  assert.ok(route.includes('zahlungsstatus: "storniert", netto_summe: 0'));
  assert.ok(!/preis_brutto|ek_netto/.test(route.split('const { data: fRoh')[0].split('req.json()')[1] ?? ''), 'Preise nie aus dem Browser');
  const pdf = lies('app/api/rechnung-pdf/route.ts');
  assert.ok(pdf.includes('${sonderHinweis}'));
  assert.ok(pdf.includes('zahlNachVorab(Number(zahlBetragGesamt) || 0, rechnung?.vorab_bezahlt)'));
  assert.ok(pdf.includes("rechnung?.ust_id_kunde"));
  const seite = lies('app/dashboard/rechnungen/[id]/page.tsx');
  assert.ok(seite.includes('steuer_sonderfall: rechnung?.steuer_sonderfall ?? null'));
  assert.ok(seite.includes('empfaenger_anschrift: baueEmpfaenger().anschrift'));
  assert.ok(lies('app/api/rechnung-e/route.ts').includes('const vorab = Number(rechnung?.vorab_bezahlt);'));
  const sql = lies('supabase-sql/p268-kfz-rechnung.sql');
  assert.doesNotMatch(sql, /drop table|drop column|delete from|truncate/i);
  assert.equal((sql.match(/add column if not exists/g) || []).length, 7);
  // Stornorechnung (P267) übernimmt vorab_bezahlt nicht: Spaltenname enthält „bezahlt"
  assert.ok(lies('supabase-sql/p267-stornorechnung.sql').includes('bezahlt|gemeldet'));
  assert.match('vorab_bezahlt', /(token|link|_am$|^sepa_|mahn|bezahlt|gemeldet|versend|gesendet|portal|zusage)/);
});
