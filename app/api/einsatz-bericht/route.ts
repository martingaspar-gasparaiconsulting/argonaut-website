import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '../../../lib/supabase-server';

// ============================================================
// ARGONAUT OS · Field Service · P29 — Einsatzbericht-PDF
// Einsatzdaten (vom Client) -> HTML -> Gotenberg -> PDF.
// Muster 1:1 wie rechnung-pdf: stateless, Navy/Gold-Briefkopf.
// Bilder (Fotos + Unterschrift) kommen als signierte Links -> Gotenberg
// lädt sie beim Rendern (waitDelay). Kein Base64 -> auch große Handy-Fotos ok.
// Firmenkopf + Berechtigung liefert der Client via geschützter RPC.
// Pfad: app/api/einsatz-bericht/route.ts
//
// 15.07.26 — ZWEI KORREKTUREN:
//  (1) Diese Datei lag seit dem Bau NUR lokal und war nie committed. Auf Vercel
//      existierte die Route damit nicht: /dashboard/meine-einsaetze ruft sie auf,
//      der Monteur bekam beim Klick auf "Bericht" live eine 404. Jetzt im Repo.
//  (2) LOGIN-PFLICHT ergänzt (Muster wie SICHERHEIT S4 / termin-zu-einsatz).
//      Vorher konnte JEDER die Route anschießen. Kein Datenleck — die Daten kommen
//      vom Client, die Route rendert nur — aber ein Fremder hätte den Gotenberg-
//      Server als kostenlosen PDF-Dienst missbrauchen können. Ohne gültige
//      Session gibt es jetzt 401.
// ============================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function geld(n: unknown): string {
  const wert = Number(n) || 0;
  try { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(wert); }
  catch { return wert.toFixed(2) + ' €'; }
}
function zahl(n: unknown): string {
  const wert = Number(n) || 0;
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(wert);
}
function datumDe(d: unknown): string {
  if (!d) return '—';
  try { return new Date(d as string).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return String(d); }
}
function uhrzeit(d: unknown): string {
  if (!d) return '';
  try { return new Date(d as string).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
function datumZeit(d: unknown): string {
  if (!d) return '—';
  const dt = datumDe(d); const t = uhrzeit(d);
  return t ? `${dt}, ${t} Uhr` : dt;
}
function pflicht(wert: unknown, hinweis: string): string {
  const s = String(wert ?? '').trim();
  return s ? esc(s) : `<span class="warn">⚠ ${esc(hinweis)}</span>`;
}

type Position = { bezeichnung?: string; menge?: number; einheit?: string; einzelpreis_netto?: number; mwst_satz?: number };

function baueHtml(body: {
  einsatz?: Record<string, unknown>;
  aussteller?: Record<string, unknown>;
  positionen?: Position[];
  fotoUrls?: string[];
  unterschriftUrl?: string | null;
  unterschriftName?: string | null;
  unterschriftAm?: string | null;
}): string {
  const e = body.einsatz ?? {};
  const a = body.aussteller ?? {};
  const positionen = Array.isArray(body.positionen) ? body.positionen : [];
  const fotoUrls = Array.isArray(body.fotoUrls) ? body.fotoUrls : [];
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

  // Firmen-Anschrift zusammenbauen
  const anschriftTeile: string[] = [];
  if (a.firma_strasse) anschriftTeile.push(esc(a.firma_strasse));
  const plzOrt = [a.firma_plz, a.firma_ort].filter(Boolean).map(esc).join(' ');
  if (plzOrt) anschriftTeile.push(plzOrt);
  const anschrift = anschriftTeile.join('<br>');

  const kontakt: string[] = [];
  if (a.firma_telefon) kontakt.push(esc(a.firma_telefon));
  if (a.firma_email) kontakt.push(esc(a.firma_email));

  // Leistungen
  const zeilen = positionen.map((p, i) => {
    const netto = (Number(p.menge) || 0) * (Number(p.einzelpreis_netto) || 0);
    return `<tr>
      <td class="nr">${i + 1}</td>
      <td>${esc(p.bezeichnung) || '&mdash;'}</td>
      <td class="r">${zahl(p.menge)}</td>
      <td class="c">${esc(p.einheit) || 'Stk'}</td>
      <td class="r">${geld(p.einzelpreis_netto)}</td>
      <td class="r">${zahl(p.mwst_satz)} %</td>
      <td class="r stark">${geld(netto)}</td>
    </tr>`;
  }).join('');

  const netto = positionen.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis_netto) || 0), 0);
  const mwst = positionen.reduce((s, p) => s + (Number(p.menge) || 0) * (Number(p.einzelpreis_netto) || 0) * ((Number(p.mwst_satz) || 0) / 100), 0);
  const brutto = netto + mwst;

  const fotosHtml = fotoUrls.length
    ? `<div class="fotos">${fotoUrls.map((u) => `<div class="foto"><img src="${esc(u)}" alt="Foto"></div>`).join('')}</div>`
    : '';

  const sigHtml = body.unterschriftUrl
    ? `<div class="sig-box">
         <div class="sig-titel">Unterschrift Kunde</div>
         <img class="sig-img" src="${esc(body.unterschriftUrl)}" alt="Unterschrift">
         <div class="sig-meta">${esc(body.unterschriftName || '')}${body.unterschriftAm ? ` &middot; ${datumZeit(body.unterschriftAm)}` : ''}</div>
       </div>`
    : `<div class="sig-box leer"><div class="sig-titel">Unterschrift Kunde</div><div class="sig-linie"></div><div class="sig-meta dim">— nicht unterschrieben —</div></div>`;

  // Zeiten (tatsächlich)
  const zeitenRows: string[] = [];
  if (e.unterwegs_am) zeitenRows.push(`<div><span class="zlabel">Losgefahren</span><span>${datumZeit(e.unterwegs_am)}</span></div>`);
  if (e.vor_ort_am) zeitenRows.push(`<div><span class="zlabel">Vor Ort</span><span>${datumZeit(e.vor_ort_am)}</span></div>`);
  if (e.erledigt_am) zeitenRows.push(`<div><span class="zlabel">Fertig</span><span>${datumZeit(e.erledigt_am)}</span></div>`);
  const zeitenHtml = zeitenRows.length ? `<div class="zeiten">${zeitenRows.join('')}</div>` : '';

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #0A1628; margin: 0; padding: 44px 52px; font-size: 12.5px; line-height: 1.55; }
  .warn { color: #b8860b; font-weight: bold; }
  .dim { color: #8a99ad; }

  .absender-mini { font-size: 10px; color: #5b6b80; border-bottom: 1px solid #e1e6ee; padding-bottom: 6px; margin-bottom: 20px; }
  .kopf { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .marke { color: #C9A84C; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold; }
  .aussteller .name { font-weight: bold; font-size: 13px; }
  h1 { font-size: 24px; margin: 4px 0 2px; color: #0A1628; }
  .datum { color: #5b6b80; font-size: 12px; }

  .zwei { display: flex; justify-content: space-between; gap: 24px; border-top: 3px solid #C9A84C; padding-top: 20px; margin: 12px 0 24px; }
  .block { flex: 1; }
  .block .titel { font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase; color: #8a99ad; font-weight: bold; margin-bottom: 6px; }
  .block .inhalt { border: 1px solid #e1e6ee; border-radius: 8px; padding: 12px 14px; min-height: 74px; }

  .zeiten { display: flex; gap: 20px; flex-wrap: wrap; background: #f4f6fa; border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; font-size: 12px; }
  .zeiten > div { display: flex; flex-direction: column; }
  .zlabel { font-size: 9.5px; letter-spacing: 0.6px; text-transform: uppercase; color: #8a99ad; font-weight: bold; }

  .abschnitt-titel { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #8a99ad; font-weight: bold; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  thead th { background: #0A1628; color: #fff; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; padding: 9px 10px; text-align: left; }
  thead th.r { text-align: right; } thead th.c { text-align: center; }
  tbody td { padding: 9px 10px; border-bottom: 1px solid #e8ecf3; vertical-align: top; }
  tbody td.r { text-align: right; } tbody td.c { text-align: center; } tbody td.nr { color: #8a99ad; width: 30px; }
  tbody td.stark { font-weight: bold; }

  .summen { margin-left: auto; width: 320px; margin-top: 10px; }
  .summen .zeile { display: flex; justify-content: space-between; padding: 6px 4px; font-size: 13px; }
  .summen .zeile.brutto { border-top: 2px solid #C9A84C; margin-top: 4px; padding-top: 10px; font-size: 16px; font-weight: bold; }
  .summen .label { color: #5b6b80; }

  .fotos { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
  .foto { width: 150px; height: 150px; border: 1px solid #e1e6ee; border-radius: 8px; overflow: hidden; }
  .foto img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .sig-box { margin-top: 24px; width: 280px; }
  .sig-titel { font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase; color: #8a99ad; font-weight: bold; margin-bottom: 6px; }
  .sig-img { width: 100%; max-width: 280px; border: 1px solid #e1e6ee; border-radius: 8px; background: #fff; display: block; }
  .sig-linie { border-bottom: 1px solid #0A1628; height: 46px; }
  .sig-meta { font-size: 11px; color: #5b6b80; margin-top: 5px; }

  .beschreibung { background: #f4f6fa; border-left: 4px solid #C9A84C; padding: 10px 14px; border-radius: 6px; font-size: 12px; margin-bottom: 14px; }
  .fuss { margin-top: 40px; border-top: 1px solid #e1e6ee; padding-top: 12px; color: #8a99ad; font-size: 10.5px; text-align: center; }
</style></head><body>

  <div class="absender-mini">
    ${pflicht(a.firma_name, 'Firmenname ergänzen')}${anschrift ? ' &middot; ' + anschrift.replace(/<br>/g, ', ') : ''}
  </div>

  <div class="kopf">
    <div class="aussteller">
      <div class="marke">Einsatzbericht</div>
      <div class="name">${pflicht(a.firma_name, 'Firmenname ergänzen')}</div>
      <div class="dim">${anschrift || '<span class="warn">⚠ Anschrift ergänzen</span>'}</div>
      ${kontakt.length ? `<div class="dim">${kontakt.join(' &middot; ')}</div>` : ''}
      ${a.firma_ust_id ? `<div class="dim">USt-IdNr.: ${esc(a.firma_ust_id)}</div>` : (a.firma_steuernummer ? `<div class="dim">Steuernummer: ${esc(a.firma_steuernummer)}</div>` : '')}
    </div>
    <div style="text-align:right;">
      <h1>Einsatzbericht</h1>
      <div class="datum">${heute}</div>
    </div>
  </div>

  <div class="zwei">
    <div class="block">
      <div class="titel">Kunde</div>
      <div class="inhalt">
        <div><strong>${esc(e.kunde_name) || '&mdash;'}</strong></div>
        ${e.einsatzort ? `<div>${esc(e.einsatzort)}</div>` : ''}
        ${e.kunde_telefon ? `<div>${esc(e.kunde_telefon)}</div>` : ''}
        ${e.kunde_email ? `<div>${esc(e.kunde_email)}</div>` : ''}
      </div>
    </div>
    <div class="block">
      <div class="titel">Einsatz</div>
      <div class="inhalt">
        <div><strong>${esc(e.titel) || 'Einsatz'}</strong></div>
        <div>Datum: ${datumDe(e.beginn_am)}</div>
        ${e.beginn_am ? `<div>Geplant: ${uhrzeit(e.beginn_am)}${e.ende_am ? '–' + uhrzeit(e.ende_am) : ''} Uhr</div>` : ''}
        <div>Status: ${esc(e.status) || 'geplant'}</div>
      </div>
    </div>
  </div>

  ${zeitenHtml}

  ${e.beschreibung ? `<div class="beschreibung">${esc(e.beschreibung)}</div>` : ''}

  <div class="abschnitt-titel">Erbrachte Leistungen</div>
  <table>
    <thead><tr>
      <th class="c">#</th><th>Bezeichnung</th><th class="r">Menge</th>
      <th class="c">Einheit</th><th class="r">Einzelpreis</th><th class="r">MwSt</th><th class="r">Netto</th>
    </tr></thead>
    <tbody>${zeilen || `<tr><td colspan="7" class="dim" style="padding:16px;text-align:center;">Keine Leistungen erfasst.</td></tr>`}</tbody>
  </table>

  <div class="summen">
    <div class="zeile"><span class="label">Zwischensumme (netto)</span><span>${geld(netto)}</span></div>
    <div class="zeile"><span class="label">zzgl. Umsatzsteuer</span><span>${geld(mwst)}</span></div>
    <div class="zeile brutto"><span>Gesamtbetrag</span><span>${geld(brutto)}</span></div>
  </div>

  ${fotoUrls.length ? `<div class="abschnitt-titel">Fotodokumentation</div>${fotosHtml}` : ''}

  ${sigHtml}

  <div class="fuss">Erstellt mit ARGONAUT OS &middot; ${heute}</div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  // --- Login-Pflicht: ohne gültige Session kein PDF -------------------------
  // Die Route holt selbst KEINE Daten aus der DB (der Client liefert alles per
  // geschützter RPC an). Trotzdem: ohne diesen Riegel könnte jeder Fremde den
  // Gotenberg-Server als kostenlosen PDF-Dienst missbrauchen.
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'nicht angemeldet' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const html = baueHtml(body);

    const gotenbergUrl = process.env.GOTENBERG_URL;
    const gUser = process.env.GOTENBERG_USER;
    const gPass = process.env.GOTENBERG_PASSWORD;
    if (!gotenbergUrl) return NextResponse.json({ error: 'PDF-Dienst nicht konfiguriert.' }, { status: 500 });

    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('marginTop', '0.5');
    form.append('marginBottom', '0.5');
    // Bilder aus signierten Links laden lassen, bevor gerendert wird
    const hatBilder = (Array.isArray(body?.fotoUrls) && body.fotoUrls.length > 0) || !!body?.unterschriftUrl;
    if (hatBilder) form.append('waitDelay', '2s');

    const authHeader = (gUser && gPass) ? 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64') : '';
    const pdfResp = await fetch(`${gotenbergUrl.replace(/\/$/, '')}/forms/chromium/convert/html`, {
      method: 'POST',
      headers: authHeader ? { Authorization: authHeader } : undefined,
      body: form,
    });
    if (!pdfResp.ok) {
      const t = await pdfResp.text();
      console.error('Einsatzbericht Gotenberg Fehler:', pdfResp.status, t.slice(0, 200));
      return NextResponse.json({ error: 'PDF-Erstellung fehlgeschlagen.' }, { status: 502 });
    }

    const pdfBuffer = await pdfResp.arrayBuffer();
    const titel = String(body?.einsatz?.titel || 'Einsatz')
      .replace(/[^a-zA-Z0-9äöüÄÖÜ -]/g, '').replace(/\s+/g, '_').slice(0, 50);
    const dateiName = `Einsatzbericht_${titel}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${dateiName}"`,
      },
    });
  } catch (e: unknown) {
    console.error('Einsatzbericht-PDF Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
