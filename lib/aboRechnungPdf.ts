// ============================================================================
// ARGONAUT OS · lib/aboRechnungPdf.ts
// Erzeugt die Betreiber-Rechnung (ARGONAUT OS → Kunde) für Abo-Abschluss/Upgrade
// als sauberes, §14-UStG-taugliches HTML und rendert sie über Gotenberg zu PDF.
// SERVER-ONLY (Gotenberg-Zugang). Absenderdaten = Gaspar AI Consulting (Impressum).
// ============================================================================

import { escapeHtml } from '@/lib/newsletter'

// --- Fester Absender (Leistender) aus dem Impressum -------------------------
const ABSENDER = {
  firma: 'Gaspar AI Consulting',
  inhaber: 'Martin Gaspar',
  strasse: 'Tübinger Straße 50',
  plzOrt: '71032 Böblingen',
  land: 'Deutschland',
  ustId: 'DE326706056',
  finanzamt: 'Finanzamt Böblingen',
  email: 'info@argonaut-os.com',
  web: 'www.argonaut-os.com',
}

export type AboRechnungDaten = {
  rechnungsnummer: string
  rechnungsdatum: string // ISO (YYYY-MM-DD)
  art: 'neu' | 'upgrade'
  empfaenger: { firma?: string; name?: string; strasse?: string; plzOrt?: string; email?: string }
  positionen: Array<{ label: string; betrag: number }> // netto
  onboardingNetto: number
  netto: number
  mwst: number
  brutto: number
  stufeName: string
  mandatsreferenz?: string
  zeitraum?: string
}

function geld(n: number): string {
  return (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function datumDe(iso: string): string {
  const d = new Date((iso || '').slice(0, 10) + 'T00:00:00')
  if (isNaN(d.getTime())) return escapeHtml(iso || '')
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Baut das Rechnungs-HTML (A4, Inline-CSS, druckfertig für Gotenberg). */
export function aboRechnungHtml(d: AboRechnungDaten): string {
  const e = d.empfaenger
  const empfZeilen = [
    e.firma ? `<strong>${escapeHtml(e.firma)}</strong>` : '',
    e.name ? escapeHtml(e.name) : '',
    e.strasse ? escapeHtml(e.strasse) : '',
    e.plzOrt ? escapeHtml(e.plzOrt) : '',
  ].filter(Boolean).join('<br>')

  const artText = d.art === 'upgrade' ? 'Tarifwechsel / Upgrade' : 'Abo-Abschluss'

  const zeilen = d.positionen.map((p) => `
    <tr>
      <td style="padding:9px 8px;border-bottom:1px solid #eef1f4;">${escapeHtml(p.label)}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #eef1f4;text-align:right;white-space:nowrap;">${geld(p.betrag)}</td>
    </tr>`).join('')

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1a2332; font-size: 12px; margin: 0; padding: 32px 40px; }
  .kopf { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 34px; }
  .marke { font-size: 22px; font-weight: 800; color: #0A1628; letter-spacing: -0.02em; }
  .marke span { color: #C9A84C; }
  .absender-mini { font-size: 9.5px; color: #6b7688; margin-top: 4px; }
  .meta { text-align: right; font-size: 11px; color: #1a2332; }
  .meta b { color: #0A1628; }
  .empf { margin: 6px 0 26px; line-height: 1.5; }
  .empf .klein { font-size: 9px; color: #8a94a6; border-bottom: 1px solid #e5e8ec; padding-bottom: 3px; margin-bottom: 8px; }
  h1 { font-size: 17px; color: #0A1628; margin: 0 0 4px; }
  .intro { color: #4a5568; margin: 0 0 18px; }
  table.pos { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.pos th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #8a94a6; padding: 0 8px 8px; border-bottom: 2px solid #0A1628; }
  table.pos th.r { text-align: right; }
  .summe { width: 300px; margin-left: auto; margin-top: 14px; }
  .summe td { padding: 6px 8px; }
  .summe .lab { color: #4a5568; }
  .summe .val { text-align: right; white-space: nowrap; }
  .summe .ges td { border-top: 2px solid #0A1628; font-weight: 800; font-size: 14px; color: #0A1628; }
  .hinweis { margin-top: 26px; background: #f6f8fa; border: 1px solid #e5e8ec; border-radius: 8px; padding: 12px 14px; color: #33404f; line-height: 1.55; }
  .fuss { margin-top: 30px; border-top: 1px solid #e5e8ec; padding-top: 12px; font-size: 9.5px; color: #8a94a6; line-height: 1.6; }
</style></head>
<body>
  <div class="kopf">
    <div>
      <div class="marke">ARGONAUT<span>&nbsp;OS</span></div>
      <div class="absender-mini">${escapeHtml(ABSENDER.firma)} · ${escapeHtml(ABSENDER.strasse)} · ${escapeHtml(ABSENDER.plzOrt)}</div>
    </div>
    <div class="meta">
      <div><b>Rechnung</b></div>
      <div>Nr. ${escapeHtml(d.rechnungsnummer)}</div>
      <div>Datum: ${datumDe(d.rechnungsdatum)}</div>
      <div>Leistungsdatum: ${datumDe(d.rechnungsdatum)}</div>
      <div>USt-IdNr.: ${escapeHtml(ABSENDER.ustId)}</div>
    </div>
  </div>

  <div class="empf">
    <div class="klein">${escapeHtml(ABSENDER.firma)} · ${escapeHtml(ABSENDER.strasse)} · ${escapeHtml(ABSENDER.plzOrt)}</div>
    ${empfZeilen || '<span style="color:#8a94a6;">Kunde</span>'}
  </div>

  <h1>Rechnung ${escapeHtml(d.rechnungsnummer)}</h1>
  <p class="intro">Vielen Dank für Ihr Vertrauen. Für Ihren ${escapeHtml(artText)} (Tarif ${escapeHtml(d.stufeName)}) berechnen wir:</p>

  <table class="pos">
    <thead><tr><th>Position</th><th class="r">Netto</th></tr></thead>
    <tbody>${zeilen}</tbody>
  </table>

  <table class="summe">
    <tr><td class="lab">Zwischensumme (netto)</td><td class="val">${geld(d.netto)}</td></tr>
    <tr><td class="lab">zzgl. 19 % USt</td><td class="val">${geld(d.mwst)}</td></tr>
    <tr class="ges"><td>Gesamtbetrag</td><td class="val">${geld(d.brutto)}</td></tr>
  </table>

  <div class="hinweis">
    <b>Zahlung per SEPA-Lastschrift.</b> Der Gesamtbetrag von ${geld(d.brutto)} wird von Ihrem hinterlegten Konto eingezogen${d.mandatsreferenz ? ` (Mandatsreferenz ${escapeHtml(d.mandatsreferenz)})` : ''}. Sie müssen nichts weiter veranlassen — eine gesonderte Überweisung ist nicht nötig.
  </div>

  <div class="fuss">
    ${escapeHtml(ABSENDER.firma)} · ${escapeHtml(ABSENDER.inhaber)} (Einzelunternehmer) · ${escapeHtml(ABSENDER.strasse)}, ${escapeHtml(ABSENDER.plzOrt)}, ${escapeHtml(ABSENDER.land)}<br>
    USt-IdNr.: ${escapeHtml(ABSENDER.ustId)} · ${escapeHtml(ABSENDER.finanzamt)} · ${escapeHtml(ABSENDER.email)} · ${escapeHtml(ABSENDER.web)}
  </div>
</body></html>`
}

/** Rendert das HTML über Gotenberg zu PDF. Gibt den Buffer zurück oder null. */
export async function aboRechnungPdf(html: string): Promise<Buffer | null> {
  const gotenbergUrl = process.env.GOTENBERG_URL
  if (!gotenbergUrl) { console.error('GOTENBERG_URL fehlt — kein Rechnungs-PDF.'); return null }
  const gUser = process.env.GOTENBERG_USER
  const gPass = process.env.GOTENBERG_PASSWORD
  try {
    const form = new FormData()
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html')
    form.append('marginTop', '0.5')
    form.append('marginBottom', '0.5')
    const authHeader = (gUser && gPass) ? 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64') : ''
    const resp = await fetch(`${gotenbergUrl.replace(/\/$/, '')}/forms/chromium/convert/html`, {
      method: 'POST',
      headers: authHeader ? { Authorization: authHeader } : undefined,
      body: form,
    })
    if (!resp.ok) {
      const t = await resp.text().catch(() => '')
      console.error('Abo-Rechnung Gotenberg Fehler:', resp.status, t.slice(0, 200))
      return null
    }
    return Buffer.from(await resp.arrayBuffer())
  } catch (e) {
    console.error('Abo-Rechnung Gotenberg nicht erreichbar:', e)
    return null
  }
}
