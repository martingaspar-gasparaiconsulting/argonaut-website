// Paket 150 (28.09.2026) — Umzug Schritt 7: BMEcat 1.2 und 2005 -> Artikel-Import ueber den
// normalen Motor. Testdaten selbst gebaut nach der Spezifikation (kein Kundenmaterial).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { istBmecat, leseBmecat, leseXml, ohneHtml, einheitAusCode, entitaeten } from '../out/bmecatLeser.js';
import { pruefeAlles } from '../out/importParser.js';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN } from '../out/importMotor.js';
import { erkenneDatei } from '../out/umzugPlan.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const V12 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE BMECAT SYSTEM "bmecat_new_catalog_1_2.dtd">
<BMECAT version="1.2">
  <HEADER><CATALOG><LANGUAGE>deu</LANGUAGE><CATALOG_ID>K1</CATALOG_ID><CATALOG_VERSION>1.0</CATALOG_VERSION><CURRENCY>EUR</CURRENCY></CATALOG></HEADER>
  <T_NEW_CATALOG>
    <CATALOG_GROUP_SYSTEM>
      <CATALOG_STRUCTURE type="node"><GROUP_ID>10</GROUP_ID><GROUP_NAME>Kabel &amp; Leitungen</GROUP_NAME></CATALOG_STRUCTURE>
    </CATALOG_GROUP_SYSTEM>
    <ARTICLE mode="new">
      <SUPPLIER_AID>NYM-3x15</SUPPLIER_AID>
      <ARTICLE_DETAILS>
        <DESCRIPTION_SHORT>Mantelleitung NYM-J 3x1,5 mm²</DESCRIPTION_SHORT>
        <DESCRIPTION_LONG><![CDATA[Für feste Verlegung.<br/>Ring à 100 m<ul><li>grau</li><li>VDE</li></ul>]]></DESCRIPTION_LONG>
        <EAN>4012345678901</EAN>
        <MANUFACTURER_AID>H-77</MANUFACTURER_AID>
        <MANUFACTURER_NAME>Kabelwerk Muster</MANUFACTURER_NAME>
        <KEYWORD>NYM</KEYWORD><KEYWORD>Installationsleitung</KEYWORD>
      </ARTICLE_DETAILS>
      <ARTICLE_FEATURES>
        <REFERENCE_FEATURE_SYSTEM_NAME>ETIM-8.0</REFERENCE_FEATURE_SYSTEM_NAME>
        <REFERENCE_FEATURE_GROUP_ID>EC000057</REFERENCE_FEATURE_GROUP_ID>
        <FEATURE><FNAME>Aderzahl</FNAME><FVALUE>3</FVALUE></FEATURE>
        <FEATURE><FNAME>Querschnitt</FNAME><FVALUE>1.5</FVALUE><FUNIT>mm²</FUNIT></FEATURE>
      </ARTICLE_FEATURES>
      <ARTICLE_ORDER_DETAILS><ORDER_UNIT>MTR</ORDER_UNIT><PRICE_QUANTITY>100</PRICE_QUANTITY><QUANTITY_MIN>100</QUANTITY_MIN></ARTICLE_ORDER_DETAILS>
      <ARTICLE_PRICE_DETAILS>
        <ARTICLE_PRICE price_type="net_list"><PRICE_AMOUNT>89.00</PRICE_AMOUNT><PRICE_CURRENCY>EUR</PRICE_CURRENCY><TAX>0.19</TAX></ARTICLE_PRICE>
        <ARTICLE_PRICE price_type="net_customer"><PRICE_AMOUNT>89.00</PRICE_AMOUNT><PRICE_FACTOR>0.45</PRICE_FACTOR></ARTICLE_PRICE>
        <ARTICLE_PRICE price_type="net_customer"><PRICE_AMOUNT>36.00</PRICE_AMOUNT><LOWER_BOUND>1000</LOWER_BOUND></ARTICLE_PRICE>
        <ARTICLE_PRICE price_type="nrp"><PRICE_AMOUNT>119.00</PRICE_AMOUNT><TAX>0.19</TAX></ARTICLE_PRICE>
      </ARTICLE_PRICE_DETAILS>
    </ARTICLE>
    <ARTICLE mode="new">
      <SUPPLIER_AID>DOSE-60</SUPPLIER_AID>
      <ARTICLE_DETAILS><DESCRIPTION_SHORT>Schalterdose &quot;tief&quot;</DESCRIPTION_SHORT><DESCRIPTION_LONG>60 mm tief<br/>Größe 1</DESCRIPTION_LONG><EAN>123</EAN></ARTICLE_DETAILS>
      <ARTICLE_ORDER_DETAILS><ORDER_UNIT>XYZ</ORDER_UNIT></ARTICLE_ORDER_DETAILS>
      <ARTICLE_PRICE_DETAILS>
        <ARTICLE_PRICE price_type="gros_list"><PRICE_AMOUNT>1.19</PRICE_AMOUNT><TAX>19</TAX></ARTICLE_PRICE>
      </ARTICLE_PRICE_DETAILS>
    </ARTICLE>
    <ARTICLE mode="new">
      <SUPPLIER_AID>SONDER</SUPPLIER_AID>
      <ARTICLE_DETAILS><DESCRIPTION_SHORT>Sonderanfertigung</DESCRIPTION_SHORT></ARTICLE_DETAILS>
      <ARTICLE_ORDER_DETAILS><ORDER_UNIT>C62</ORDER_UNIT></ARTICLE_ORDER_DETAILS>
      <ARTICLE_PRICE_DETAILS><DAILY_PRICE>true</DAILY_PRICE></ARTICLE_PRICE_DETAILS>
    </ARTICLE>
    <ARTICLE mode="new">
      <SUPPLIER_AID>USA-1</SUPPLIER_AID>
      <ARTICLE_DETAILS><DESCRIPTION_SHORT>Importware</DESCRIPTION_SHORT></ARTICLE_DETAILS>
      <ARTICLE_PRICE_DETAILS><ARTICLE_PRICE price_type="net_list"><PRICE_AMOUNT>10</PRICE_AMOUNT><PRICE_CURRENCY>USD</PRICE_CURRENCY></ARTICLE_PRICE></ARTICLE_PRICE_DETAILS>
    </ARTICLE>
    <ARTICLE mode="delete"><SUPPLIER_AID>ALT-1</SUPPLIER_AID></ARTICLE>
    <ARTICLE_TO_CATALOGGROUP_MAP><ART_ID>NYM-3x15</ART_ID><CATALOG_GROUP_ID>10</CATALOG_GROUP_ID></ARTICLE_TO_CATALOGGROUP_MAP>
  </T_NEW_CATALOG>
</BMECAT>`;

const V2005 = `<?xml version="1.0" encoding="UTF-8"?>
<bmecat:BMECAT version="2005" xmlns:bmecat="http://www.bmecat.org/bmecat/2005">
 <bmecat:HEADER><bmecat:CATALOG><bmecat:LANGUAGE default="true">deu</bmecat:LANGUAGE><bmecat:CURRENCY>EUR</bmecat:CURRENCY></bmecat:CATALOG></bmecat:HEADER>
 <bmecat:T_NEW_CATALOG>
  <bmecat:PRODUCT mode="new">
   <bmecat:SUPPLIER_PID>RM-100</bmecat:SUPPLIER_PID>
   <bmecat:PRODUCT_DETAILS>
    <bmecat:DESCRIPTION_SHORT lang="eng">Smoke detector</bmecat:DESCRIPTION_SHORT>
    <bmecat:DESCRIPTION_SHORT lang="deu">Rauchmelder RM 100</bmecat:DESCRIPTION_SHORT>
    <bmecat:DESCRIPTION_LONG lang="deu">Mit Funkmodul&lt;br&gt;VdS-geprüft</bmecat:DESCRIPTION_LONG>
    <bmecat:INTERNATIONAL_PID type="gtin">04012345678918</bmecat:INTERNATIONAL_PID>
    <bmecat:MANUFACTURER_PID>RM100-W</bmecat:MANUFACTURER_PID>
   </bmecat:PRODUCT_DETAILS>
   <bmecat:PRODUCT_ORDER_DETAILS><bmecat:ORDER_UNIT>C62</bmecat:ORDER_UNIT><bmecat:CONTENT_UNIT>C62</bmecat:CONTENT_UNIT><bmecat:NO_CU_PER_OU>1</bmecat:NO_CU_PER_OU></bmecat:PRODUCT_ORDER_DETAILS>
   <bmecat:PRODUCT_PRICE_DETAILS>
    <bmecat:PRODUCT_PRICE price_type="net_list"><bmecat:PRICE_AMOUNT>24.90</bmecat:PRICE_AMOUNT></bmecat:PRODUCT_PRICE>
   </bmecat:PRODUCT_PRICE_DETAILS>
  </bmecat:PRODUCT>
  <bmecat:PRODUCT mode="new">
   <bmecat:SUPPLIER_PID>RM-10ER</bmecat:SUPPLIER_PID>
   <bmecat:PRODUCT_DETAILS><bmecat:DESCRIPTION_SHORT lang="deu">Rauchmelder 10er</bmecat:DESCRIPTION_SHORT></bmecat:PRODUCT_DETAILS>
   <bmecat:PRODUCT_ORDER_DETAILS><bmecat:ORDER_UNIT>PK</bmecat:ORDER_UNIT><bmecat:CONTENT_UNIT>C62</bmecat:CONTENT_UNIT><bmecat:NO_CU_PER_OU>10</bmecat:NO_CU_PER_OU></bmecat:PRODUCT_ORDER_DETAILS>
   <bmecat:PRODUCT_PRICE_DETAILS><bmecat:PRODUCT_PRICE price_type="nrp"><bmecat:PRICE_AMOUNT>238.00</bmecat:PRICE_AMOUNT></bmecat:PRODUCT_PRICE></bmecat:PRODUCT_PRICE_DETAILS>
  </bmecat:PRODUCT>
  <bmecat:PRODUCT_TO_CATALOGGROUP_MAP><bmecat:PROD_ID>RM-100</bmecat:PROD_ID><bmecat:CATALOG_GROUP_ID>BRA</bmecat:CATALOG_GROUP_ID></bmecat:PRODUCT_TO_CATALOGGROUP_MAP>
 </bmecat:T_NEW_CATALOG>
</bmecat:BMECAT>`;

const zeileVon = (r, nr) => Object.fromEntries(r.kopf.map((k, i) => [k, r.zeilen.find((z) => z[0] === nr)[i]]));

test('Erkennen: BMECAT-Element, egal ob mit Namensraum', () => {
  assert.equal(istBmecat('katalog.xml', V12), true);
  assert.equal(istBmecat('katalog.xml', V2005), true);
  assert.equal(istBmecat('rechnung.xml', '<?xml version="1.0"?><rsm:CrossIndustryInvoice>'), false);
  assert.equal(istBmecat('kunden.csv', 'BMECAT;Name'), false);
});

test('XML-Leser: CDATA, Entitaeten, Namensraum, Attribute mit >', () => {
  const w = leseXml('<a x="1>2"><b:c>A &amp; B &#252;</b:c><![CDATA[<roh>]]></a>');
  assert.equal(w.kinder[0].attr.x, '1>2');
  assert.equal(w.kinder[0].kinder[0].name, 'C');
  assert.equal(w.kinder[0].kinder[0].text, 'A & B ü');
  assert.equal(w.kinder[0].text, '<roh>');
  assert.equal(entitaeten('&euro;&#x41;'), '€A');
  assert.equal(ohneHtml('Eins<br/>Zwei<ul><li>a</li></ul>'), 'Eins\nZwei\n• a');
  assert.equal(einheitAusCode('MTR').einheit, 'm');
  assert.deepEqual(einheitAusCode('XYZ'), { einheit: 'XYZ', bekannt: false });
});

test('BMEcat 1.2: Preise je Preismenge, Faktor, Staffel, Brutto nur mit Steuersatz, Fremdwaehrung, Loeschung', () => {
  const r = leseBmecat(V12);
  assert.equal(r.version, '1.2');
  assert.equal(r.anzahl, 4, 'ALT-1 geloescht');
  const n = zeileVon(r, 'NYM-3x15');
  assert.equal(n.bezeichnung, 'Mantelleitung NYM-J 3x1,5 mm²');
  assert.equal(n.beschreibung, 'Für feste Verlegung.\nRing à 100 m\n• grau\n• VDE');
  assert.equal(n.einheit, 'm');
  assert.equal(n.verkaufspreis, '0,89', '89,00 je 100 m');
  assert.equal(n.einkaufspreis, '0,4005', '89,00 x 0,45 je 100 m');
  assert.equal(n.kategorie, 'Kabel & Leitungen');
  assert.equal(n.ean, '4012345678901');
  assert.equal(n.Hersteller, 'Kabelwerk Muster');
  assert.equal(n['Hersteller-Artikelnummer'], 'H-77');
  assert.equal(n.Mindestbestellmenge, '100');
  assert.equal(n.Staffelpreise, 'Ihr Nettopreis ab 1000: 0,36 EUR');
  assert.equal(n['Weitere Preise laut Katalog'], 'Unverbindl. Preisempfehlung: 1,19 EUR (MwSt 19 %)');
  assert.equal(n['Preisbasis laut Katalog'], 'Preise galten je 100 m');
  assert.equal(n.Merkmale, 'ETIM-8.0 EC000057; Aderzahl: 3; Querschnitt: 1.5 mm²');
  assert.equal(n.Stichworte, 'NYM, Installationsleitung');
  const d = zeileVon(r, 'DOSE-60');
  assert.equal(d.bezeichnung, 'Schalterdose "tief"');
  assert.equal(d.beschreibung, '60 mm tief\nGröße 1', 'HTML ohne CDATA: Reihenfolge bleibt');
  assert.equal(d.verkaufspreis, '1,00', 'gros_list 1,19 mit TAX 19 -> netto');
  assert.equal(d.einheit, 'XYZ');
  assert.equal(d.ean, '');
  assert.equal(d['EAN laut Datei (ungültig)'], '123');
  assert.equal(zeileVon(r, 'SONDER').Preishinweis, 'Preis auf Anfrage');
  assert.equal(zeileVon(r, 'USA-1').verkaufspreis, '', 'USD nie als Euro');
  assert.ok(r.hinweise.some((h) => /1 Artikel sind als gelöscht markiert/.test(h)));
  assert.ok(r.hinweise.some((h) => /1 Artikel mit Preisen in Fremdwährung/.test(h)));
  assert.ok(r.hinweise.some((h) => /1 Artikel nur mit Bruttopreis: mit dem MwSt-Satz/.test(h)));
  assert.ok(r.hinweise.some((h) => /1 Artikel mit unbekanntem Einheiten-Code/.test(h)));
});

test('BMEcat 2005: Namensraum, deutsch bevorzugt, GTIN, maskiertes HTML, Brutto ohne Steuersatz bleibt stehen', () => {
  const r = leseBmecat(V2005);
  assert.equal(r.version, '2005');
  const m = zeileVon(r, 'RM-100');
  assert.equal(m.bezeichnung, 'Rauchmelder RM 100');
  assert.equal(m.beschreibung, 'Mit Funkmodul\nVdS-geprüft');
  assert.equal(m.ean, '04012345678918');
  assert.equal(m.verkaufspreis, '24,90');
  assert.equal(m.kategorie, 'BRA', 'ohne Gruppenname bleibt die Gruppen-Nummer');
  const p = zeileVon(r, 'RM-10ER');
  assert.equal(p.einheit, 'Pak');
  assert.equal(p['Inhalt je Bestelleinheit'], '10 Stk je Pak');
  assert.equal(p.verkaufspreis, '', 'nrp ohne TAX wird nicht geraten');
  assert.equal(p['Weitere Preise laut Katalog'], 'Unverbindl. Preisempfehlung: 238,00 EUR');
  assert.ok(r.hinweise.some((h) => /1 Artikel nur mit Bruttopreis ohne MwSt-Angabe/.test(h)));
});

test('Preis-Update und kaputte Datei: Hinweis statt Absturz', () => {
  const upd = '<BMECAT version="1.2"><T_UPDATE_PRICES><ARTICLE mode="update"><SUPPLIER_AID>A1</SUPPLIER_AID><ARTICLE_PRICE_DETAILS><ARTICLE_PRICE price_type="net_customer"><PRICE_AMOUNT>5</PRICE_AMOUNT></ARTICLE_PRICE></ARTICLE_PRICE_DETAILS></ARTICLE></T_UPDATE_PRICES></BMECAT>';
  const r = leseBmecat(upd);
  assert.equal(r.anzahl, 1);
  assert.ok(r.hinweise.some((h) => /Reine Preisaktualisierung/.test(h)));
  assert.equal(leseBmecat('<rechnung/>').anzahl, 0);
  assert.equal(leseBmecat(V12.slice(0, 2500)).anzahl >= 1, true, 'abgeschnittene Datei liefert, was da ist');
});

test('Durch den Motor: Artikel-Felder erkannt, Zusatzangaben als Eigenes Feld, nichts verschluckt', () => {
  const r = leseBmecat(V12);
  const z = katalogFuerZiel('artikel', null).ziel;
  const map = vorschlagMapping(r.kopf, r.zeilen, z);
  for (const k of ['artikelnummer', 'bezeichnung', 'beschreibung', 'kategorie', 'einheit', 'verkaufspreis', 'einkaufspreis', 'ean']) assert.equal(map[k], k, k);
  for (const k of r.kopf.slice(8)) assert.equal(map[k], EIGEN, `${k} -> Eigenes Feld`);
  assert.equal(spaltenBilanz(r.kopf, r.zeilen, map, z).verschluckt, 0);
  const b = pruefeAlles('artikel', map, r.kopf, r.zeilen, { ziel: z });
  assert.equal(b.gut, 4);
  assert.equal(b.saetze.find((s) => s.artikelnummer === 'NYM-3x15').einkaufspreis, 0.4005);
  assert.equal(erkenneDatei('katalog.xml', r.kopf, r.zeilen).ziel, 'artikel');
});

test('Seiten: Import-Center und Umzugsstapel lesen BMEcat', () => {
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(s.includes('if (istBmecat(f.name, text.slice(0, 5000))) {'));
  const u = lies('app/dashboard/import/UmzugStapel.tsx');
  assert.ok(u.includes('if (istBmecat(f.name, text.slice(0, 5000))) {'));
  assert.ok(s.includes('kein BMEcat-Artikelkatalog'));
});
