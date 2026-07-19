// ============================================================================
// ARGONAUT OS · Welle 5 · lib/signaturHtml.ts
// Baut das Signatur-Dokument als HTML (Dokumenttext + Unterschriftsblock +
// Prüfprotokoll + Hash). EINE Quelle für beide Zwecke:
//   · beim Signieren -> als "eingefrorenes Original" (archiv_html) gespeichert,
//   · als Fallback in der PDF-Route, falls kein eingefrorenes Original existiert.
// So bleibt das signierte Dokument revisionssicher (kein Layout-Drift).
// Reine Funktion, keine Supabase-Aufrufe.
// ============================================================================

export type SigProt = { ereignis?: string; zeit?: string; ip?: string; ua?: string };
export type SigDaten = {
  titel?: string | null;
  dokument?: string | null;
  firma?: string | null;
  strasse?: string | null;
  plzOrt?: string | null;
  empfaenger_email?: string | null;
  status?: string | null;
  unterzeichner_name?: string | null;
  ort?: string | null;
  signatur_bild?: string | null;
  dokument_hash?: string | null;
  signiert_am?: string | null;
  loeschbar_ab?: string | null;
  aufbewahrung_jahre?: number | null;
  protokoll?: SigProt[];
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function dt(iso: unknown): string {
  const s = String(iso || ''); if (!s) return '—';
  try { return new Date(s).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}
function tag(iso: unknown): string {
  const s = String(iso || ''); if (!s) return '—';
  try { return new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return s; }
}

export function baueSignaturHtml(a: SigDaten): string {
  const signiert = a.status === 'signiert';
  const dokumentHtml = esc(a.dokument || '').replace(/\n/g, '<br>');
  const prot: SigProt[] = Array.isArray(a.protokoll) ? a.protokoll : [];
  const protZeilen = prot.map((e) => `<tr><td>${esc(e.ereignis || '')}</td><td>${dt(e.zeit)}</td><td>${esc(e.ip || '—')}</td><td style="max-width:220px;word-break:break-all;color:#6b7684;">${esc((e.ua || '').slice(0, 120))}</td></tr>`).join('');

  const aufbewahrung = signiert
    ? `<div class="aufb">Aufbewahrung (GoBD): ${a.aufbewahrung_jahre ?? 10} Jahre · löschbar ab ${tag(a.loeschbar_ab)}</div>`
    : '';

  const sigBlock = signiert ? `
    <div class="sig">
      <div class="sigTitel">Elektronisch signiert</div>
      <div class="sigGrid">
        <div>
          ${a.signatur_bild ? `<img class="sigImg" src="${esc(a.signatur_bild)}" alt="Unterschrift">` : ''}
          <div class="sigLine">${esc(a.unterzeichner_name || '')}</div>
          <div class="sigMeta">${a.ort ? esc(a.ort) + ', ' : ''}${dt(a.signiert_am)}</div>
        </div>
        <div class="sigNachweis">
          <div><b>Nachweis:</b></div>
          <div>Unterzeichner: ${esc(a.unterzeichner_name || '—')}</div>
          <div>E-Mail eingeladen: ${esc(a.empfaenger_email || '—')}</div>
          <div>Signiert am: ${dt(a.signiert_am)}</div>
          <div>Dokument-Hash (SHA-256):</div>
          <div class="hash">${esc(a.dokument_hash || '—')}</div>
        </div>
      </div>
      ${aufbewahrung}
    </div>` : `<div class="offen">⏳ Noch nicht signiert — dies ist eine Vorschau.</div>`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 20mm 18mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #14202e; font-size: 12.5px; line-height: 1.6; margin: 0; }
    .kopf { border-bottom: 3px solid #0A1628; padding-bottom: 12px; margin-bottom: 20px; }
    .firma { font-size: 18px; font-weight: 800; color: #0A1628; }
    .absender { color: #55606b; font-size: 11px; margin-top: 3px; }
    h1 { font-size: 20px; margin: 0 0 12px; color: #0A1628; }
    .sig { margin-top: 30px; border: 1px solid #cdd5dd; border-radius: 10px; padding: 16px 18px; page-break-inside: avoid; }
    .sigTitel { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #4CAF7D; font-weight: 800; margin-bottom: 10px; }
    .sigGrid { display: flex; gap: 24px; justify-content: space-between; flex-wrap: wrap; }
    .sigImg { max-width: 220px; max-height: 90px; display: block; }
    .sigLine { border-top: 1px solid #0A1628; margin-top: 4px; padding-top: 4px; font-weight: 700; }
    .sigMeta { color: #55606b; font-size: 11px; }
    .sigNachweis { font-size: 10.5px; color: #33404f; min-width: 240px; }
    .hash { font-family: monospace; font-size: 9px; word-break: break-all; color: #55606b; }
    .aufb { margin-top: 12px; padding-top: 8px; border-top: 1px dashed #cdd5dd; font-size: 10px; color: #55606b; }
    .offen { margin-top: 30px; background: #fff7e6; border: 1px solid #e0a24c; border-radius: 8px; padding: 12px; color: #7a5b00; }
    .protokoll { margin-top: 22px; page-break-inside: avoid; }
    .protokoll h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #8a949e; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eceff2; }
    th { color: #8a949e; text-transform: uppercase; font-size: 9px; }
    .fuss { margin-top: 26px; border-top: 1px solid #cdd5dd; padding-top: 8px; color: #8a949e; font-size: 9.5px; text-align: center; }
  </style></head><body>
    <div class="kopf">
      <div class="firma">${esc(a.firma || 'Absender')}</div>
      <div class="absender">${esc(a.strasse || '')}${a.strasse ? ' · ' : ''}${esc(a.plzOrt || '')}</div>
    </div>
    <h1>${esc(a.titel || 'Dokument zur Unterschrift')}</h1>
    <div class="dok">${dokumentHtml || '<span style="color:#8a949e;">(kein Dokumenttext)</span>'}</div>
    ${sigBlock}
    <div class="protokoll">
      <h2>Prüfprotokoll (Audit-Trail)</h2>
      <table><thead><tr><th>Ereignis</th><th>Zeitpunkt</th><th>IP</th><th>Gerät</th></tr></thead>
      <tbody>${protZeilen || '<tr><td colspan="4" style="color:#8a949e;">Keine Ereignisse.</td></tr>'}</tbody></table>
    </div>
    <div class="fuss">Elektronisch erstellt &amp; signiert mit ARGONAUT OS · einfache/fortgeschrittene elektronische Signatur (eIDAS) · Integrität über SHA-256-Hash gesichert · GoBD-Aufbewahrung</div>
  </body></html>`;
}
