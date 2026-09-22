// ============================================================================
// ARGONAUT OS · lib/sepaUeberweisung.ts — SEPA-Überweisung (Credit Transfer)
//
// Erzeugt eine SEPA-Sammelüberweisung im Standardformat pain.001.001.03, das
// jedes Online-Banking / Banking-Programm einliest — z. B. für Gehälter oder
// Lieferanten in einem Rutsch. REINE Logik (Werte rein, XML raus); Datums-/
// Zeitwerte kommen vom Aufrufer, damit die Datei deterministisch bleibt.
//
// ARGONAUT erzeugt die DATEI; die Einreichung macht der Betrieb selbst per
// Datei-Upload im Online-Banking. Keine Direktübertragung.
// Muster wie lib/sepa.ts (pain.008), hier für Auszahlungen (PmtMtd = TRF).
//
// 22.09.2026 (Punkt 64): Die gemeinsamen Bausteine liegen jetzt in
// lib/sepaGemeinsam.ts — dieselbe Haertung wie bei der Lastschrift, damit
// eine Reparatur nicht an der zweiten Kopie verpufft.
// ============================================================================

import { esc, ibanClean, sepaText, agent, betragStr, sepaSumme } from './sepaGemeinsam';

// Weiterhin von hier beziehbar, damit bestehende Aufrufer unveraendert laufen.
export { ibanGueltig, SepaBetragFehler, istSepaBetragFehler } from './sepaGemeinsam';

export interface UeberweisungAbsender {
  name: string;
  iban: string;
  bic?: string;
}

export interface Ueberweisung {
  name: string;              // Empfänger
  iban: string;
  bic?: string;
  betrag: number;
  verwendungszweck: string;
  endToEndId?: string;
}

function txBlock(p: Ueberweisung, msgId: string, i: number): string {
  const e2e = sepaText(p.endToEndId || `${msgId}-${i + 1}`, 35) || 'NOTPROVIDED';
  return `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${esc(e2e)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${betragStr(p.betrag, `Ueberweisung ${p.name || e2e}`)}</InstdAmt></Amt>
        <CdtrAgt>${agent(p.bic)}</CdtrAgt>
        <Cdtr><Nm>${esc(sepaText(p.name, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${esc(ibanClean(p.iban))}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${esc(sepaText(p.verwendungszweck, 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`;
}

/**
 * Baut die SEPA-Sammelüberweisung (pain.001.001.03). Ein Zahlungsblock (PmtInf)
 * mit dem Absender als Auftraggeber (Dbtr) und je Empfänger eine CdtTrfTxInf.
 *
 * Wirft SepaBetragFehler, wenn ein Posten keinen brauchbaren Betrag hat —
 * es entsteht dann KEINE Datei statt einer Datei mit 0,00 Euro darin.
 */
export function bauePain001(
  absender: UeberweisungAbsender,
  posten: Ueberweisung[],
  ausfuehrungsdatum: string,   // 'YYYY-MM-DD'
  msgId: string,
  creDtTm: string,             // ISO, z. B. '2026-08-11T12:00:00'
): string {
  const n = posten.length;
  // Kontrollsumme aus den GERUNDETEN Einzelposten — genau die Betraege, die
  // unten in den InstdAmt-Feldern stehen.
  const summe = sepaSumme(posten.map((p) => ({ betrag: p.betrag, wofuer: `Ueberweisung ${p.name || 'ohne Namen'}` })));
  const txs = posten.map((p, i) => txBlock(p, msgId, i)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${esc(creDtTm)}</CreDtTm>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${summe.toFixed(2)}</CtrlSum>
      <InitgPty><Nm>${esc(sepaText(absender.name, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(msgId)}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${summe.toFixed(2)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${esc(ausfuehrungsdatum)}</ReqdExctnDt>
      <Dbtr><Nm>${esc(sepaText(absender.name, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${esc(ibanClean(absender.iban))}</IBAN></Id></DbtrAcct>
      <DbtrAgt>${agent(absender.bic)}</DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}
