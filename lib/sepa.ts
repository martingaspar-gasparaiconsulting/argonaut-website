// ============================================================================
// ARGONAUT OS · lib/sepa.ts — SEPA-Lastschrift (Basis-Lastschrift / CORE)
//
// Erzeugt eine SEPA-Sammellastschrift im Standardformat pain.008.001.02, das
// jedes Bank-/Zahlungsprogramm einliest. REINE Logik (Werte rein, XML raus) —
// die Datumswerte kommen vom Aufrufer, damit die Datei deterministisch bleibt.
//
// Hinweis zur Sequenz (SeqTp): hier wird EIN Sammler mit 'RCUR' (wiederkehrend)
// erzeugt — der Alltagsfall bei Mitgliedsbeiträgen/Abos. Manche Banken verlangen
// bei der ALLERERSTEN Einreichung eines Mandats 'FRST'; das kann im nächsten
// Ausbau je Posten gewählt werden.
// ============================================================================

export interface SepaCreditor {
  name: string;        // Kontoinhaber / Zahlungsempfänger
  iban: string;
  bic?: string;
  glaeubigerId: string; // Gläubiger-Identifikationsnummer (Creditor Identifier)
}

export interface SepaLastschrift {
  name: string;             // Name des Zahlungspflichtigen (Mitglied)
  iban: string;
  bic?: string;
  betrag: number;           // Euro, z. B. 12.50
  mandatsreferenz: string;
  mandatDatum: string;      // 'YYYY-MM-DD'
  verwendungszweck: string;
  endToEndId?: string;
}

function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function ibanClean(s: string): string {
  return (s ?? '').replace(/\s+/g, '').toUpperCase();
}
function betragStr(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}
/** SEPA erlaubt in Namen/Zweck nur einen eingeschränkten Zeichensatz. */
function sepaText(s: string, max: number): string {
  return (s ?? '')
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9 /?:().,'+\-]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

function agent(bic: string | undefined): string {
  const b = (bic || '').replace(/\s+/g, '').toUpperCase();
  return b
    ? `<FinInstnId><BIC>${esc(b)}</BIC></FinInstnId>`
    : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
}

/**
 * Baut die SEPA-Basislastschrift (pain.008.001.02).
 * @param msgId              Eindeutige Nachrichten-ID (vom Aufrufer, z. B. Zeit+Zufall).
 * @param creDtTm            Erstellzeit ISO 'YYYY-MM-DDTHH:MM:SS'.
 * @param ausfuehrungsdatum  Fälligkeitstag der Lastschrift 'YYYY-MM-DD'.
 */
export function baueSepaXml(
  cr: SepaCreditor,
  posten: SepaLastschrift[],
  ausfuehrungsdatum: string,
  msgId: string,
  creDtTm: string,
): string {
  const summe = posten.reduce((s, p) => s + (Number.isFinite(p.betrag) ? p.betrag : 0), 0);
  const n = posten.length;

  const txs = posten.map((p, i) => {
    const e2e = sepaText(p.endToEndId || `${msgId}-${i + 1}`, 35) || 'NOTPROVIDED';
    return `        <DrctDbtTxInf>
          <PmtId><EndToEndId>${esc(e2e)}</EndToEndId></PmtId>
          <InstdAmt Ccy="EUR">${betragStr(p.betrag)}</InstdAmt>
          <DrctDbtTx><MndtRltdInf><MndtId>${esc(sepaText(p.mandatsreferenz, 35))}</MndtId><DtOfSgntr>${esc(p.mandatDatum)}</DtOfSgntr></MndtRltdInf></DrctDbtTx>
          <DbtrAgt>${agent(p.bic)}</DbtrAgt>
          <Dbtr><Nm>${esc(sepaText(p.name, 70))}</Nm></Dbtr>
          <DbtrAcct><Id><IBAN>${esc(ibanClean(p.iban))}</IBAN></Id></DbtrAcct>
          <RmtInf><Ustrd>${esc(sepaText(p.verwendungszweck, 140))}</Ustrd></RmtInf>
        </DrctDbtTxInf>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${esc(creDtTm)}</CreDtTm>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${betragStr(summe)}</CtrlSum>
      <InitgPty><Nm>${esc(sepaText(cr.name, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(msgId)}-PMT</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${betragStr(summe)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>CORE</Cd></LclInstrm>
        <SeqTp>RCUR</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${esc(ausfuehrungsdatum)}</ReqdColltnDt>
      <Cdtr><Nm>${esc(sepaText(cr.name, 70))}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${esc(ibanClean(cr.iban))}</IBAN></Id></CdtrAcct>
      <CdtrAgt>${agent(cr.bic)}</CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr><Id>${esc(sepaText(cr.glaeubigerId, 35))}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
${txs}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;
}
