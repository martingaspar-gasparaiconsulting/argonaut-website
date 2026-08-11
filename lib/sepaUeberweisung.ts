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
// ============================================================================

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

/** IBAN über ISO-Prüfsumme (Modulo 97) prüfen — verhindert Zahlendreher. */
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

function txBlock(p: Ueberweisung, msgId: string, i: number): string {
  const e2e = sepaText(p.endToEndId || `${msgId}-${i + 1}`, 35) || 'NOTPROVIDED';
  return `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${esc(e2e)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${betragStr(p.betrag)}</InstdAmt></Amt>
        <CdtrAgt>${agent(p.bic)}</CdtrAgt>
        <Cdtr><Nm>${esc(sepaText(p.name, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${esc(ibanClean(p.iban))}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${esc(sepaText(p.verwendungszweck, 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`;
}

/**
 * Baut die SEPA-Sammelüberweisung (pain.001.001.03). Ein Zahlungsblock (PmtInf)
 * mit dem Absender als Auftraggeber (Dbtr) und je Empfänger eine CdtTrfTxInf.
 */
export function bauePain001(
  absender: UeberweisungAbsender,
  posten: Ueberweisung[],
  ausfuehrungsdatum: string,   // 'YYYY-MM-DD'
  msgId: string,
  creDtTm: string,             // ISO, z. B. '2026-08-11T12:00:00'
): string {
  const n = posten.length;
  const summe = posten.reduce((s, p) => s + (Number.isFinite(p.betrag) ? p.betrag : 0), 0);
  const txs = posten.map((p, i) => txBlock(p, msgId, i)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(msgId)}</MsgId>
      <CreDtTm>${esc(creDtTm)}</CreDtTm>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${betragStr(summe)}</CtrlSum>
      <InitgPty><Nm>${esc(sepaText(absender.name, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(msgId)}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${n}</NbOfTxs>
      <CtrlSum>${betragStr(summe)}</CtrlSum>
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
