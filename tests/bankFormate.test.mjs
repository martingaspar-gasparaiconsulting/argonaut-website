import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUmsaetzeCamt, parseUmsaetzeMt940, parse86, parseUmsaetze,
  erkenneFormat, isoZuDeutsch, mt940Datum, FORMAT_NAMEN,
} from '../out/bankFormate.js';

// ── Datumsumwandlung ────────────────────────────────────────────────────────

test('ISO-Datum wird deutsch, Uhrzeit stoert nicht', () => {
  assert.equal(isoZuDeutsch('2026-07-20'), '20.07.2026');
  assert.equal(isoZuDeutsch('2026-07-20T14:31:00+02:00'), '20.07.2026');
});

test('Ein kaputtes Datum wird LEER, nie geraten', () => {
  // Ein falsches Datum in einer Geldzeile ist schlimmer als gar keins.
  assert.equal(isoZuDeutsch('20.07.2026'), '');
  assert.equal(isoZuDeutsch('2026-13-01'), '');
  assert.equal(isoZuDeutsch('2026-00-10'), '');
  assert.equal(isoZuDeutsch('2026-07-45'), '');
  assert.equal(isoZuDeutsch(''), '');
  assert.equal(isoZuDeutsch(null), '');
  assert.equal(isoZuDeutsch(undefined), '');
});

test('MT940-Datum JJMMTT wird deutsch, Unsinn wird leer', () => {
  assert.equal(mt940Datum('260720'), '20.07.2026');
  assert.equal(mt940Datum('260101'), '01.01.2026');
  assert.equal(mt940Datum('261320'), '');
  assert.equal(mt940Datum('26072'), '');
  assert.equal(mt940Datum('abcdef'), '');
});

// ── CAMT.053 ────────────────────────────────────────────────────────────────

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <BkToCstmrStmt>
  <Stmt>
   <Ntry>
    <Amt Ccy="EUR">1926.00</Amt>
    <CdtDbtInd>CRDT</CdtDbtInd>
    <Sts>BOOK</Sts>
    <BookgDt><Dt>2026-07-20</Dt></BookgDt>
    <ValDt><Dt>2026-07-21</Dt></ValDt>
    <NtryDtls><TxDtls>
      <RltdPties>
        <Dbtr><Nm>Stadtwerke B&#246;blingen</Nm></Dbtr>
        <Cdtr><Nm>Gaspar AI Consulting</Nm></Cdtr>
      </RltdPties>
      <RmtInf><Ustrd>Rechnung RE-2026-0001</Ustrd><Ustrd>Danke &amp; Gruesse</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>
   <Ntry>
    <Amt Ccy="EUR">89.90</Amt>
    <CdtDbtInd>DBIT</CdtDbtInd>
    <Sts>BOOK</Sts>
    <BookgDt><Dt>2026-07-22</Dt></BookgDt>
    <NtryDtls><TxDtls>
      <RltdPties><Cdtr><Nm>Hostinger</Nm></Cdtr></RltdPties>
      <RmtInf><Ustrd>VPS Juli</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>
   <Ntry>
    <Amt Ccy="EUR">500.00</Amt>
    <CdtDbtInd>CRDT</CdtDbtInd>
    <Sts>PDNG</Sts>
    <BookgDt><Dt>2026-07-23</Dt></BookgDt>
    <NtryDtls><TxDtls><RmtInf><Ustrd>Noch nicht gebucht</Ustrd></RmtInf></TxDtls></NtryDtls>
   </Ntry>
  </Stmt>
 </BkToCstmrStmt>
</Document>`;

test('CAMT: Gutschrift wird positiv, Lastschrift negativ', () => {
  const t = parseUmsaetzeCamt(CAMT);
  assert.equal(t.length, 2);                  // die vorgemerkte faellt raus
  assert.equal(t[0].betrag, 1926);
  assert.equal(t[1].betrag, -89.9);
});

test('CAMT: VORGEMERKTE Buchungen werden uebersprungen', () => {
  // Eine Vormerkung kann sich noch aendern. Eine Rechnung darauf als bezahlt
  // zu markieren waere falsch.
  const t = parseUmsaetzeCamt(CAMT);
  assert.ok(!t.some((x) => x.verwendungszweck.includes('Noch nicht gebucht')));
});

test('CAMT: Fehlt <Sts> ganz, gilt die Zeile als gebucht', () => {
  const ohne = `<Document><Ntry><Amt Ccy="EUR">10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
    <BookgDt><Dt>2026-01-02</Dt></BookgDt><RmtInf><Ustrd>Test</Ustrd></RmtInf></Ntry></Document>`;
  assert.equal(parseUmsaetzeCamt(ohne).length, 1);
});

test('CAMT: <Sts><Cd>BOOK</Cd></Sts> der neueren Fassung wird auch verstanden', () => {
  const neu = `<Document><Ntry><Amt Ccy="EUR">10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
    <Sts><Cd>BOOK</Cd></Sts><BookgDt><Dt>2026-01-02</Dt></BookgDt>
    <RmtInf><Ustrd>Test</Ustrd></RmtInf></Ntry></Document>`;
  assert.equal(parseUmsaetzeCamt(neu).length, 1);
  const vorgemerkt = neu.replace('<Cd>BOOK</Cd>', '<Cd>PDNG</Cd>');
  assert.equal(parseUmsaetzeCamt(vorgemerkt).length, 0);
});

test('CAMT: mehrere <Ustrd> ergeben EINEN Verwendungszweck', () => {
  const t = parseUmsaetzeCamt(CAMT);
  assert.equal(t[0].verwendungszweck, 'Rechnung RE-2026-0001 Danke & Gruesse');
});

test('CAMT: XML-Entities werden aufgeloest', () => {
  const t = parseUmsaetzeCamt(CAMT);
  assert.equal(t[0].name, 'Stadtwerke Böblingen');
  assert.ok(t[0].verwendungszweck.includes('&'), 'aus &amp; muss & werden');
});

test('CAMT: beim Eingang zaehlt der Zahler, beim Ausgang der Empfaenger', () => {
  const t = parseUmsaetzeCamt(CAMT);
  assert.equal(t[0].name, 'Stadtwerke Böblingen');   // CRDT -> Dbtr
  assert.equal(t[1].name, 'Hostinger');              // DBIT -> Cdtr
});

test('CAMT: Buchungstag schlaegt Wertstellung', () => {
  const t = parseUmsaetzeCamt(CAMT);
  assert.equal(t[0].datum, '20.07.2026');            // nicht der 21.
});

test('CAMT: ohne BookgDt wird die Wertstellung genommen', () => {
  const nurVal = `<Document><Ntry><Amt Ccy="EUR">5.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
    <ValDt><Dt>2026-03-04</Dt></ValDt><RmtInf><Ustrd>X</Ustrd></RmtInf></Ntry></Document>`;
  assert.equal(parseUmsaetzeCamt(nurVal)[0].datum, '04.03.2026');
});

test('CAMT: Namensraum-Praefixe stoeren nicht', () => {
  const mitNs = CAMT
    .replace(/<Ntry>/g, '<camt:Ntry>').replace(/<\/Ntry>/g, '</camt:Ntry>')
    .replace(/<Amt /g, '<camt:Amt ').replace(/<\/Amt>/g, '</camt:Amt>')
    .replace(/<CdtDbtInd>/g, '<camt:CdtDbtInd>').replace(/<\/CdtDbtInd>/g, '</camt:CdtDbtInd>');
  const t = parseUmsaetzeCamt(mitNs);
  assert.equal(t.length, 2);
  assert.equal(t[0].betrag, 1926);
});

test('CAMT: ohne <Amt> oder mit Betrag 0 entsteht KEINE Zeile', () => {
  const kaputt = `<Document><Ntry><CdtDbtInd>CRDT</CdtDbtInd><RmtInf><Ustrd>X</Ustrd></RmtInf></Ntry>
    <Ntry><Amt Ccy="EUR">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Ntry></Document>`;
  assert.deepEqual(parseUmsaetzeCamt(kaputt), []);
});

test('CAMT: ohne Ustrd faellt der Zweck auf AddtlNtryInf zurueck', () => {
  const alt = `<Document><Ntry><Amt Ccy="EUR">12.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
    <BookgDt><Dt>2026-05-05</Dt></BookgDt><AddtlNtryInf>DAUERAUFTRAG Miete</AddtlNtryInf></Ntry></Document>`;
  assert.equal(parseUmsaetzeCamt(alt)[0].verwendungszweck, 'DAUERAUFTRAG Miete');
});

test('CAMT: leere Eingabe gibt eine leere Liste, keinen Fehler', () => {
  assert.deepEqual(parseUmsaetzeCamt(''), []);
  assert.deepEqual(parseUmsaetzeCamt('kein xml'), []);
});

// ── MT940 ───────────────────────────────────────────────────────────────────

const MT940 = `:20:STARTUMS
:25:60050101/1234567
:28C:00015/001
:60F:C260701EUR4200,00
:61:2607200720C1926,00NTRFNONREF//POS 1
:86:166?00GUTSCHRIFT?20Rechnung RE-2026-?210001?32Stadtwerke Boeblingen
:61:2607220722D89,90NDDTNONREF//POS 2
:86:005?00LASTSCHRIFT?20VPS Juli?32Hostinger
:61:2607230723RC150,00NTRFNONREF//POS 3
:86:169?00STORNO?20Ruecklastschrift?32Muster GmbH
:62F:C260731EUR5886,10`;

test('MT940: C ist ein Eingang, D ein Ausgang', () => {
  const t = parseUmsaetzeMt940(MT940);
  assert.equal(t.length, 3);
  assert.equal(t[0].betrag, 1926);
  assert.equal(t[1].betrag, -89.9);
});

test('MT940: RC (Storno einer Gutschrift) ist NEGATIV', () => {
  // Sonst wuerde eine zurueckgebuchte Zahlung als Zahlungseingang gelten und
  // eine offene Rechnung faelschlich auf bezahlt setzen.
  const t = parseUmsaetzeMt940(MT940);
  assert.equal(t[2].betrag, -150);
});

test('MT940: RD (Storno einer Lastschrift) ist POSITIV', () => {
  const rd = ':20:X\n:61:2607230723RD150,00NTRFNONREF\n:86:169?00STORNO?20Test\n:62F:C260731EUR0,00';
  assert.equal(parseUmsaetzeMt940(rd)[0].betrag, 150);
});

test('MT940: Unterfelder des Verwendungszwecks werden ZEICHENWEISE fortgesetzt', () => {
  // ?20"Rechnung RE-2026-" + ?21"0001" muss "Rechnung RE-2026-0001" ergeben,
  // nicht "Rechnung RE-2026- 0001" — sonst findet das Matching die Nummer nicht.
  const t = parseUmsaetzeMt940(MT940);
  assert.equal(t[0].verwendungszweck, 'Rechnung RE-2026-0001');
});

test('MT940: ?32 wird zum Namen der Gegenseite', () => {
  const t = parseUmsaetzeMt940(MT940);
  assert.equal(t[0].name, 'Stadtwerke Boeblingen');
  assert.equal(t[1].name, 'Hostinger');
});

test('MT940: Datum kommt aus den ersten sechs Ziffern', () => {
  const t = parseUmsaetzeMt940(MT940);
  assert.equal(t[0].datum, '20.07.2026');
  assert.equal(t[1].datum, '22.07.2026');
});

test('MT940: Salden (:60F:/:62F:) sind keine Umsaetze', () => {
  const t = parseUmsaetzeMt940(MT940);
  assert.ok(!t.some((x) => x.betrag === 4200 || x.betrag === 5886.1));
});

test('MT940: mehrzeiliges :86: gehoert zur davorstehenden :61:', () => {
  const lang = ':20:X\n:61:2607200720C100,00NTRFNONREF\n:86:166?00GUTSCHRIFT?20Teil eins\n?21Teil zwei?32Firma\n:62F:C260731EUR0,00';
  const t = parseUmsaetzeMt940(lang);
  assert.equal(t.length, 1);
  assert.equal(t[0].verwendungszweck, 'Teil einsTeil zwei');
  assert.equal(t[0].name, 'Firma');
});

test('MT940: unstrukturiertes :86: wird als freier Text uebernommen', () => {
  const frei = ':20:X\n:61:2607200720C100,00NTRFNONREF\n:86:UEBERWEISUNG Rechnung 4711\n:62F:C260731EUR0,00';
  const t = parseUmsaetzeMt940(frei);
  assert.equal(t[0].verwendungszweck, 'UEBERWEISUNG Rechnung 4711');
  assert.equal(t[0].name, '');
});

test('MT940: optionale Waehrungskennung nach C/D stoert nicht', () => {
  const mitKennung = ':20:X\n:61:2607200720CF1926,00NTRFNONREF\n:86:?20Test\n:62F:C260731EUR0,00';
  assert.equal(parseUmsaetzeMt940(mitKennung)[0].betrag, 1926);
});

test('MT940: eine :61:-Zeile ohne :86: geht trotzdem durch', () => {
  const ohne = ':20:X\n:61:2607200720C100,00NTRFNONREF\n:62F:C260731EUR0,00';
  const t = parseUmsaetzeMt940(ohne);
  assert.equal(t.length, 1);
  assert.equal(t[0].verwendungszweck, '');
});

test('MT940: eine kaputte :61:-Zeile wird uebersprungen, nicht geraten', () => {
  const kaputt = ':20:X\n:61:MUELL\n:86:?20Test\n:61:2607200720C100,00NTRFNONREF\n:86:?20Gut\n:62F:C260731EUR0,00';
  const t = parseUmsaetzeMt940(kaputt);
  assert.equal(t.length, 1);
  assert.equal(t[0].verwendungszweck, 'Gut');
});

test('MT940: Windows-Zeilenumbrueche funktionieren genauso', () => {
  assert.equal(parseUmsaetzeMt940(MT940.replace(/\n/g, '\r\n')).length, 3);
});

test('MT940: leere Eingabe gibt eine leere Liste', () => {
  assert.deepEqual(parseUmsaetzeMt940(''), []);
  assert.deepEqual(parseUmsaetzeMt940('irgendwas'), []);
});

test('parse86 laesst leere Unterfelder weg', () => {
  const d = parse86('?00GUTSCHRIFT?20?21Nur das hier?32');
  assert.equal(d.verwendungszweck, 'Nur das hier');
  assert.equal(d.name, '');
});

// ── Formaterkennung ─────────────────────────────────────────────────────────

test('Das Format wird am INHALT erkannt, nicht an der Dateiendung', () => {
  assert.equal(erkenneFormat(CAMT), 'camt');
  assert.equal(erkenneFormat(MT940), 'mt940');
  assert.equal(erkenneFormat('Buchungstag;Name;Verwendungszweck;Betrag\n20.07.2026;X;Y;10,00'), 'csv');
});

test('CAMT wird auch ohne XML-Kopfzeile erkannt', () => {
  assert.equal(erkenneFormat('<Document><BkToCstmrStmt></BkToCstmrStmt></Document>'), 'camt');
  assert.equal(erkenneFormat('<camt:Document></camt:Document>'), 'camt');
});

test('Leer bleibt leer', () => {
  assert.equal(erkenneFormat(''), 'leer');
  assert.equal(erkenneFormat('   \n  '), 'leer');
  assert.equal(erkenneFormat(null), 'leer');
  assert.equal(erkenneFormat(undefined), 'leer');
});

test('Jedes Format hat einen lesbaren Namen fuer die Oberflaeche', () => {
  for (const f of ['camt', 'mt940', 'csv', 'leer']) {
    assert.equal(typeof FORMAT_NAMEN[f], 'string');
    assert.ok(FORMAT_NAMEN[f].length > 0);
  }
});

// ── Die eine Tuer ───────────────────────────────────────────────────────────

test('parseUmsaetze bedient alle drei Formate mit derselben Ausgabe', () => {
  const ausCamt = parseUmsaetze(CAMT);
  const ausMt = parseUmsaetze(MT940);
  const ausCsv = parseUmsaetze('Buchungstag;Name;Verwendungszweck;Betrag\n20.07.2026;Stadtwerke;Rechnung RE-2026-0001;1926,00');

  for (const liste of [ausCamt, ausMt, ausCsv]) {
    assert.ok(Array.isArray(liste) && liste.length > 0);
    for (const t of liste) {
      assert.equal(typeof t.datum, 'string');
      assert.equal(typeof t.betrag, 'number');
      assert.equal(typeof t.verwendungszweck, 'string');
      assert.equal(typeof t.name, 'string');
    }
  }
  // Dieselbe Buchung, drei Formate, derselbe Betrag und dasselbe Datum
  assert.equal(ausCamt[0].betrag, 1926);
  assert.equal(ausMt[0].betrag, 1926);
  assert.equal(ausCsv[0].betrag, 1926);
  assert.equal(ausCamt[0].datum, '20.07.2026');
  assert.equal(ausMt[0].datum, '20.07.2026');
});

test('parseUmsaetze gibt bei Unsinn eine leere Liste statt zu werfen', () => {
  assert.deepEqual(parseUmsaetze(''), []);
  assert.deepEqual(parseUmsaetze(null), []);
  assert.deepEqual(parseUmsaetze(undefined), []);
});
