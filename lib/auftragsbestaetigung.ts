// ============================================================================
// ARGONAUT OS · lib/auftragsbestaetigung.ts — HTML für die Auftragsbestätigung
// Reine Funktion (kein Fetch, keine Hooks). Wird über den generischen
// Gotenberg-Renderer aboRechnungPdf(html) zu PDF gemacht. Alle Beträge kommen
// aus der serverseitig gerechneten Angebotssumme (lib/tarif) — inkl. Rabatt.
// ============================================================================

import { euro, type Angebotssumme } from './tarif';

export type AuftragsDaten = {
  firma: string;
  ansprechpartner: string;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  ustId?: string | null;
  stufeName: string;
  laufzeit: number;
  summe: Angebotssumme;
  datum: string;
};

function esc(s: string): string {
  return (s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

export function auftragsbestaetigungHtml(d: AuftragsDaten): string {
  const m = d.summe.monatlich;
  const zeilen = m.positionen
    .map((p) => `<tr><td>${esc(p.label)}</td><td style="text-align:right">${euro(p.betrag)}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#0A1628;padding:36px;font-size:13px;line-height:1.5}
    h1{font-size:22px;margin:0 0 4px} .gold{color:#C9A84C}
    table{width:100%;border-collapse:collapse;margin:10px 0} td{padding:6px 2px;border-bottom:1px solid #eee}
    .box{background:#f5f6f8;border-radius:8px;padding:14px;margin:12px 0}
    .gross{font-size:16px;font-weight:800} .muted{color:#666;font-size:11.5px}
  </style></head><body>
    <h1>Auftragsbestätigung <span class="gold">ARGONAUT OS</span></h1>
    <div class="muted">Vom ${esc(d.datum)}</div>
    <div class="box">
      <b>${esc(d.firma)}</b><br>${esc(d.ansprechpartner)}<br>
      ${esc(d.strasse || '')}<br>${esc(d.plz || '')} ${esc(d.ort || '')}${d.ustId ? `<br>USt-IdNr.: ${esc(d.ustId)}` : ''}
    </div>
    <p><b>Paket:</b> ${esc(d.stufeName)} &nbsp;·&nbsp; <b>Laufzeit:</b> ${d.laufzeit} Monate</p>
    <table><tbody>${zeilen}</tbody></table>
    <p>Monatlich netto: <b>${euro(m.netto)}</b> &nbsp;·&nbsp; zzgl. 19 % USt ${euro(m.mwst)} &nbsp;·&nbsp; <span class="gross">brutto ${euro(m.brutto)}</span></p>
    <div class="box">
      Einmalige Einrichtung: <b>${euro(d.summe.einrichtungNetto)}</b> (netto)<br>
      Erster Monat gesamt: <span class="gross gold">${euro(d.summe.ersterMonatBrutto)}</span> (brutto)
    </div>
    <p class="muted">Alle Preise netto zzgl. 19 % USt. Das SEPA-Lastschriftmandat wurde erteilt; der Einzug erfolgt nach Freigabe. Es gelten unsere AGB und der Auftragsverarbeitungsvertrag.</p>
  </body></html>`;
}
