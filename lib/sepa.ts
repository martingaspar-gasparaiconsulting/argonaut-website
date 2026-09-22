// ============================================================================
// ARGONAUT OS · lib/sepa.ts — SEPA-Lastschrift (Basis-Lastschrift / CORE)
//
// Erzeugt eine SEPA-Sammellastschrift im Standardformat pain.008.001.02, das
// jedes Bank-/Zahlungsprogramm einliest. REINE Logik (Werte rein, XML raus) —
// die Datumswerte kommen vom Aufrufer, damit die Datei deterministisch bleibt.
//
// ARGONAUT erzeugt die DATEI; die Einreichung macht der Betrieb selbst über
// sein Online-Banking / Banking-Programm (Datei-Upload). Keine Direktübertragung.
//
// KORREKTE SEQUENZ: Erst-Einzug eines Mandats = 'FRST', Folge-Einzüge = 'RCUR'.
// Beide werden – falls gemischt – in GETRENNTE <PmtInf>-Blöcke gruppiert
// (eine SeqTp je Block, so verlangt es der Standard).
//
// 22.09.2026 (Punkt 64): Die gemeinsamen Bausteine liegen jetzt in
// lib/sepaGemeinsam.ts — dort steht auch, warum ein unbrauchbarer Betrag
// einen Fehler wirft statt still 0,00 in die Bankdatei zu schreiben.
// ============================================================================

import { esc, ibanClean, sepaText, agent, betragStr, sepaSumme } from './sepaGemeinsam';

// Weiterhin von hier beziehbar, damit bestehende Aufrufer unveraendert laufen.
export { ibanGueltig, SepaBetragFehler, istSepaBetragFehler } from './sepaGemeinsam';

export type SepaSeq = 'FRST' | 'RCUR' | 'OOFF';

export interface SepaCreditor {
  name: string;
  iban: string;
  bic?: string;
  glaeubigerId: string;
}

export interface SepaLastschrift {
  name: string;
  iban: string;
  bic?: string;
  betrag: number;
  mandatsreferenz: string;
  mandatDatum: string;       // 'YYYY-MM-DD'
  verwendungszweck: string;
  seqTp?: SepaSeq;           // Default 'RCUR'
  endToEndId?: string;
}

function txBlock(p: SepaLastschrift, msgId: string, i: number): string {
  const e2e = sepaText(p.endToEndId || `${msgId}-${i + 1}`, 35) || 'NOTPROVIDED';
  return `        <DrctDbtTxInf>
          <PmtId><EndToEndId>${esc(e2e)}</EndToEndId></PmtId>
          <InstdAmt Ccy="EUR">${betragStr(p.betrag, `Lastschrift ${p.name || e2e}`)}</InstdAmt>
          <DrctDbtTx><MndtRltdInf><MndtId>${esc(sepaText(p.mandatsreferenz, 35))}</MndtId><DtOfSgntr>${esc(p.mandatDatum)}</DtOfSgntr></MndtRltdInf></DrctDbtTx>
          <DbtrAgt>${agent(p.bic)}</DbtrAgt>
          <Dbtr><Nm>${esc(sepaText(p.name, 70))}</Nm></Dbtr>
          <DbtrAcct><Id><IBAN>${esc(ibanClean(p.iban))}</IBAN></Id></DbtrAcct>
          <RmtInf><Ustrd>${esc(sepaText(p.verwendungszweck, 140))}</Ustrd></RmtInf>
        </DrctDbtTxInf>`;
}

function pmtInfBlock(cr: SepaCreditor, gruppe: SepaLastschrift[], seq: SepaSeq, ausfuehrungsdatum: string, msgId: string): string {
  // Kontrollsumme aus den GERUNDETEN Einzelposten — genau die Betraege, die
  // unten in den InstdAmt-Feldern stehen.
  const summe = sepaSumme(gruppe.map((p) => ({ betrag: p.betrag, wofuer: `Lastschrift ${p.name || 'ohne Namen'}` })));
  const txs = gruppe.map((p, i) => txBlock(p, `${msgId}-${seq}`, i)).join('\n');
  return `    <PmtInf>
      <PmtInfId>${esc(msgId)}-${seq}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${gruppe.length}</NbOfTxs>
      <CtrlSum>${summe.toFixed(2)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>CORE</Cd></LclInstrm>
        <SeqTp>${seq}</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${esc(ausfuehrungsdatum)}</ReqdColltnDt>
      <Cdtr><Nm>${esc(sepaText(cr.name, 70))}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${esc(ibanClean(cr.iban))}</IBAN></Id></CdtrAcct>
      <CdtrAgt>${agent(cr.bic)}</CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr><Id>${esc(sepaText(cr.glaeubigerId, 35))}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
${txs}
    </PmtInf>`;
}

/**
 * Baut die SEPA-Basislastschrift (pain.008.001.02). Gruppiert automatisch nach
 * Sequenz (FRST/RCUR/OOFF) in getrennte Zahlungsblöcke.
 *
 * Wirft SepaBetragFehler, wenn ein Posten keinen brauchbaren Betrag hat. Der
 * Aufrufer faengt das ab und zeigt es dem Betrieb — es entsteht dann KEINE
 * Datei, statt einer Datei mit 0,00 Euro darin.
 */
export function baueSepaXml(
  cr: SepaCreditor,
  posten: SepaLastschrift[],
  ausfuehrungsdatum: string,
  msgId: string,
  creDtTm: string,
): string {
  const nGesamt = posten.length;
  const summeGesamt = sepaSumme(posten.map((p) => ({ betrag: p.betrag, wofuer: `Lastschrift ${p.name || 'ohne Namen'}` })));

  // Nach Sequenz gruppieren (Reihenfolge FRST, RCUR, OOFF).
  const reihenfolge: SepaSeq[] = ['FRST', 'RCUR', 'OOFF'];
  const bloecke = reihenfolge
    .map((seq) => ({ seq, gruppe: posten.filter((p) => (p.seqTp || 'RCUR') === seq) }))
    .filter((b) => b.gruppe.length > 0)
    .map((b) => pmtInfBlock(cr, b.gruppe, b.seq, ausfuehrungsdatum, msgId))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${esc(creDtTm)}</CreDtTm>
      <NbOfTxs>${nGesamt}</NbOfTxs>
      <CtrlSum>${summeGesamt.toFixed(2)}</CtrlSum>
      <InitgPty><Nm>${esc(sepaText(cr.name, 70))}</Nm></InitgPty>
    </GrpHdr>
${bloecke}
  </CstmrDrctDbtInitn>
</Document>`;
}
