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
// ============================================================================

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

function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function ibanClean(s: string): string { return (s ?? '').replace(/\s+/g, '').toUpperCase(); }
function betragStr(n: number): string { return (Number.isFinite(n) ? n : 0).toFixed(2); }
function sepaText(s: string, max: number): string {
  return (s ?? '')
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9 /?:().,'+\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function agent(bic: string | undefined): string {
  const b = (bic || '').replace(/\s+/g, '').toUpperCase();
  return b ? `<FinInstnId><BIC>${esc(b)}</BIC></FinInstnId>` : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
}

/**
 * Prüft eine IBAN über die ISO-Prüfsumme (Modulo 97). Verhindert Zahlendreher
 * und falsche IBANs in der Lastschrift-Datei.
 */
export function ibanGueltig(ibanRaw: string): boolean {
  const iban = ibanClean(ibanRaw);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  const zahl = umgestellt.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (let i = 0; i < zahl.length; i += 7) {
    rest = Number(String(rest) + zahl.slice(i, i + 7)) % 97;
  }
  return rest === 1;
}

function txBlock(p: SepaLastschrift, msgId: string, i: number): string {
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
}

function pmtInfBlock(cr: SepaCreditor, gruppe: SepaLastschrift[], seq: SepaSeq, ausfuehrungsdatum: string, msgId: string): string {
  const summe = gruppe.reduce((s, p) => s + (Number.isFinite(p.betrag) ? p.betrag : 0), 0);
  const txs = gruppe.map((p, i) => txBlock(p, `${msgId}-${seq}`, i)).join('\n');
  return `    <PmtInf>
      <PmtInfId>${esc(msgId)}-${seq}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${gruppe.length}</NbOfTxs>
      <CtrlSum>${betragStr(summe)}</CtrlSum>
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
 */
export function baueSepaXml(
  cr: SepaCreditor,
  posten: SepaLastschrift[],
  ausfuehrungsdatum: string,
  msgId: string,
  creDtTm: string,
): string {
  const nGesamt = posten.length;
  const summeGesamt = posten.reduce((s, p) => s + (Number.isFinite(p.betrag) ? p.betrag : 0), 0);

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
      <CtrlSum>${betragStr(summeGesamt)}</CtrlSum>
      <InitgPty><Nm>${esc(sepaText(cr.name, 70))}</Nm></InitgPty>
    </GrpHdr>
${bloecke}
  </CstmrDrctDbtInitn>
</Document>`;
}
