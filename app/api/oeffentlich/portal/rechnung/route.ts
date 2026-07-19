// ============================================================
// ARGONAUT OS · Bündel 11+ · app/api/oeffentlich/portal/rechnung/route.ts
// ÖFFENTLICHER Rechnungs-DOWNLOAD fürs Kunden-Portal — Token-basiert.
//   GET ?token=..&id=..  -> echtes PDF (über Gotenberg), Content-Disposition
//
// SICHERHEIT (fail-closed):
//  · Der Token loest genau EINEN Zugang (portal_zugaenge) auf -> owner + kontakt.
//  · Die Rechnung wird HART geprueft: sie muss demselben Betrieb UND demselben
//    Kontakt gehoeren und darf nicht storniert sein. Sonst 404.
//  · PDF-Erzeugung 1:1 ueber die bestehende Gotenberg-Pipeline
//    (GOTENBERG_URL + Basic-Auth). Faellt Gotenberg aus, wird als Fallback die
//    druckbare HTML-Rechnung geliefert (Kunde kann via Browser "Als PDF speichern").
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { girocodeVonDaten } from '@/lib/girocode';
import { baueBezahllink } from '@/lib/bezahllink';
import type { IntegrationDatensatz } from '@/lib/konnektoren';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function eur(n: unknown): string {
  return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
function datum(iso: unknown): string {
  const s = String(iso || ''); if (!s) return '—';
  const p = s.split('T')[0].split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : s;
}
// Verschiedene moegliche Feldnamen im profiles-Datensatz defensiv abgreifen.
function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) { const v = o?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
  return '';
}

type Pos = { position: number | null; bezeichnung: string | null; menge: number | null;
  einheit: string | null; einzelpreis: number | null; mwst_satz: number | null; gesamt_netto: number | null };

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get('token') || '').trim();
    const id = (url.searchParams.get('id') || '').trim();
    if (!token || !id) return NextResponse.json({ error: 'Ungültiger Aufruf.' }, { status: 400 });

    const db = admin();

    // 1) Token -> Zugang (aktiv)
    const { data: zugang } = await db.from('portal_zugaenge')
      .select('owner_user_id, kontakt_id, aktiv').eq('token', token).maybeSingle();
    if (!zugang || zugang.aktiv !== true) {
      return NextResponse.json({ error: 'Portal-Link ungültig oder deaktiviert.' }, { status: 404 });
    }
    const ownerId = String(zugang.owner_user_id);
    const kontaktId = String(zugang.kontakt_id);

    // 2) Rechnung — hart auf Betrieb + Kontakt, nicht storniert
    const { data: r } = await db.from('rechnungen')
      .select('id, rechnungsnummer, titel, empfaenger_name, rechnungsdatum, leistungsdatum, faelligkeitsdatum, zahlungsziel_tage, netto_summe, mwst_summe, brutto_summe, zahlungsstatus, bezahlt_am, kleinunternehmer, owner_user_id, kontakt_id')
      .eq('id', id).eq('owner_user_id', ownerId).eq('kontakt_id', kontaktId).maybeSingle();
    if (!r || r.zahlungsstatus === 'storniert') {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 });
    }

    // 3) Positionen
    const { data: posRaw } = await db.from('rechnung_positionen')
      .select('position, bezeichnung, menge, einheit, einzelpreis, mwst_satz, gesamt_netto')
      .eq('rechnung_id', r.id).order('position', { ascending: true });
    const positionen = (posRaw || []) as Pos[];

    // 4) Absender (Betrieb) — select('*') vermeidet Fehler bei unbekannten Spalten
    const { data: pRaw } = await db.from('profiles').select('*').eq('id', ownerId).maybeSingle();
    const p = (pRaw || {}) as Record<string, unknown>;
    const firma = pick(p, ['firma_name', 'full_name']) || 'Ihr Betrieb';
    const strasse = pick(p, ['strasse', 'adresse', 'anschrift', 'street']);
    const plzOrt = [pick(p, ['plz', 'postleitzahl', 'zip']), pick(p, ['ort', 'stadt', 'city'])].filter(Boolean).join(' ');
    const ustId = pick(p, ['ust_id', 'ustid', 'umsatzsteuer_id', 'vat_id', 'ust_idnr']);
    const steuernr = pick(p, ['steuernummer', 'steuer_nr', 'tax_number']);
    const mail = pick(p, ['rechnung_email', 'email', 'kontakt_email']);
    const tel = pick(p, ['telefon', 'phone', 'tel']);
    const iban = pick(p, ['iban', 'sepa_iban']);
    const bic = pick(p, ['bic', 'sepa_bic']);

    // GiroCode / EPC-QR — nur bei offener Rechnung mit gültiger IBAN.
    const giroSvg = r.bezahlt_am ? null : girocodeVonDaten({
      empfaenger: firma,
      iban,
      bic: bic || undefined,
      betrag: Number(r.brutto_summe) || 0,
      verwendungszweck: String(r.rechnungsnummer || '').trim(),
    }, { groesse: 128 });

    // Online-Bezahllink (eigener Zahlungsanbieter des Betriebs), nur bei offener Rechnung.
    let bezahllink: { url: string; anbieter: string } | null = null;
    if (!r.bezahlt_am) {
      try {
        const { data: zi } = await db.from('betrieb_integrationen')
          .select('typ, anbieter, config, aktiv').eq('owner_user_id', ownerId).eq('typ', 'zahlung').maybeSingle();
        bezahllink = baueBezahllink(zi as IntegrationDatensatz | null, Number(r.brutto_summe) || 0);
      } catch { /* optional */ }
    }

    // MwSt-Aufschlüsselung je Satz (rein zur Anzeige)
    const proSatz = new Map<number, number>();
    for (const x of positionen) {
      const s = Number(x.mwst_satz) || 0;
      proSatz.set(s, (proSatz.get(s) || 0) + (Number(x.gesamt_netto) || 0));
    }
    const steuerZeilen = [...proSatz.entries()].sort((a, b) => a[0] - b[0])
      .map(([satz, netto]) => `<tr><td colspan="4"></td><td class="r">MwSt ${satz.toLocaleString('de-DE')} %</td><td class="r">${eur(Math.round(netto * satz) / 100)}</td></tr>`)
      .join('');

    const zeilen = positionen.map((x) => `
      <tr>
        <td>${x.position ?? ''}</td>
        <td>${esc(x.bezeichnung || '')}</td>
        <td class="r">${(Number(x.menge) || 0).toLocaleString('de-DE')}</td>
        <td>${esc(x.einheit || '')}</td>
        <td class="r">${eur(x.einzelpreis)}</td>
        <td class="r">${eur(x.gesamt_netto)}</td>
      </tr>`).join('');

    const kleinunternehmer = r.kleinunternehmer === true;

    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #14202e; font-size: 12px; line-height: 1.5; margin: 0; }
  .kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0A1628; padding-bottom: 14px; margin-bottom: 26px; }
  .firma { font-size: 20px; font-weight: 800; color: #0A1628; letter-spacing: .3px; }
  .absender { color: #55606b; font-size: 11px; margin-top: 4px; }
  .meta { text-align: right; font-size: 11px; color: #55606b; }
  .meta b { color: #14202e; }
  h1 { font-size: 22px; margin: 0 0 2px; color: #0A1628; }
  .empf { margin: 8px 0 24px; }
  .empf .label { color: #8a949e; font-size: 10px; text-transform: uppercase; letter-spacing: .12em; }
  table.pos { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.pos th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #8a949e; border-bottom: 1px solid #cdd5dd; padding: 6px 8px; }
  table.pos td { padding: 8px; border-bottom: 1px solid #eceff2; vertical-align: top; }
  table.pos td.r, table.pos th.r { text-align: right; }
  .summe { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .summe td { padding: 4px 8px; }
  .summe td.r { text-align: right; }
  .summe .brutto td { font-size: 15px; font-weight: 800; color: #0A1628; border-top: 2px solid #0A1628; padding-top: 8px; }
  .fuss { margin-top: 34px; padding-top: 14px; border-top: 1px solid #cdd5dd; color: #55606b; font-size: 10.5px; display: flex; justify-content: space-between; gap: 20px; }
  .hinweis { margin-top: 16px; color: #55606b; font-size: 11px; }
  .giro { margin-top: 18px; display: flex; align-items: center; gap: 14px; background: #f7f9fc; border: 1px solid #e3e8ef; border-radius: 10px; padding: 12px 16px; }
  .giro-qr { width: 128px; height: 128px; background: #fff; border: 1px solid #e1e6ee; border-radius: 8px; padding: 5px; flex-shrink: 0; }
  .giro-qr svg { display: block; width: 100%; height: 100%; }
  .giro-cap { font-size: 11.5px; color: #55606b; line-height: 1.45; }
  .giro-cap b { color: #14202e; font-size: 12.5px; }
  .paybox { margin-top: 14px; }
  .paybtn { display: inline-block; background: #0A1628; color: #fff; text-decoration: none; padding: 12px 22px; border-radius: 10px; font-weight: 700; font-size: 13.5px; }
</style></head><body>
  <div class="kopf">
    <div>
      <div class="firma">${esc(firma)}</div>
      <div class="absender">
        ${esc(strasse)}${strasse ? '<br>' : ''}${esc(plzOrt)}
        ${mail ? `<br>${esc(mail)}` : ''}${tel ? ` · ${esc(tel)}` : ''}
      </div>
    </div>
    <div class="meta">
      <div><b>Rechnung ${esc(r.rechnungsnummer || '')}</b></div>
      <div>Datum: ${datum(r.rechnungsdatum)}</div>
      ${r.leistungsdatum ? `<div>Leistungsdatum: ${datum(r.leistungsdatum)}</div>` : ''}
      ${r.faelligkeitsdatum ? `<div>Fällig: ${datum(r.faelligkeitsdatum)}</div>` : ''}
    </div>
  </div>

  <div class="empf">
    <div class="label">Rechnungsempfänger</div>
    <div style="font-size:14px;font-weight:700;">${esc(r.empfaenger_name || '')}</div>
  </div>

  <h1>${esc(r.titel || 'Rechnung')}</h1>

  <table class="pos">
    <thead><tr>
      <th style="width:28px;">#</th><th>Bezeichnung</th><th class="r">Menge</th><th>Einheit</th><th class="r">Einzel</th><th class="r">Netto</th>
    </tr></thead>
    <tbody>${zeilen || '<tr><td colspan="6" style="color:#8a949e;">Keine Positionen.</td></tr>'}</tbody>
  </table>

  <table class="summe">
    <tr><td colspan="4"></td><td class="r">Zwischensumme netto</td><td class="r">${eur(r.netto_summe)}</td></tr>
    ${kleinunternehmer ? '' : steuerZeilen}
    <tr class="brutto"><td colspan="4"></td><td class="r">Gesamtbetrag</td><td class="r">${eur(r.brutto_summe)}</td></tr>
  </table>

  ${kleinunternehmer ? '<div class="hinweis">Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).</div>' : ''}
  ${r.bezahlt_am ? '<div class="hinweis">✓ Diese Rechnung ist bezahlt. Vielen Dank!</div>'
    : `<div class="hinweis">Bitte begleichen Sie den Betrag${r.faelligkeitsdatum ? ` bis zum ${datum(r.faelligkeitsdatum)}` : ''}${iban ? ` auf folgendes Konto: ${esc(iban)}${bic ? ` (${esc(bic)})` : ''}` : ''}.</div>`}
  ${giroSvg ? `<div class="giro"><div class="giro-qr">${giroSvg}</div><div class="giro-cap"><b>GiroCode — bequem zahlen</b><br>Öffnen Sie Ihre Banking-App, scannen Sie den Code — Empfänger, IBAN, Betrag und Verwendungszweck sind bereits ausgefüllt.</div></div>` : ''}
  ${bezahllink ? `<div class="paybox"><a href="${esc(bezahllink.url)}" class="paybtn">💳 Jetzt online bezahlen${bezahllink.anbieter ? ` · ${esc(bezahllink.anbieter)}` : ''}</a></div>` : ''}

  <div class="fuss">
    <div>${esc(firma)}${strasse ? ` · ${esc(strasse)}, ${esc(plzOrt)}` : ''}</div>
    <div>${ustId ? `USt-IdNr.: ${esc(ustId)}` : (steuernr ? `Steuernr.: ${esc(steuernr)}` : '')}</div>
  </div>
</body></html>`;

    const dateiName = `Rechnung-${String(r.rechnungsnummer || 'ARGONAUT').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;

    // 5) PDF über Gotenberg (Chromium, forms/chromium/convert/html)
    const gUrl = (process.env.GOTENBERG_URL || '').replace(/\/+$/, '');
    if (gUrl) {
      try {
        const form = new FormData();
        form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
        form.append('paperWidth', '8.27');   // A4 Zoll
        form.append('paperHeight', '11.69');
        form.append('marginTop', '0'); form.append('marginBottom', '0');
        form.append('marginLeft', '0'); form.append('marginRight', '0');
        form.append('printBackground', 'true');

        const headers: Record<string, string> = {};
        const gUser = process.env.GOTENBERG_USER, gPass = process.env.GOTENBERG_PASSWORD;
        if (gUser && gPass) headers['Authorization'] = 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64');

        const gRes = await fetch(`${gUrl}/forms/chromium/convert/html`, { method: 'POST', headers, body: form });
        if (gRes.ok) {
          const pdf = Buffer.from(await gRes.arrayBuffer());
          return new NextResponse(pdf, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${dateiName}"`,
              'Cache-Control': 'no-store',
            },
          });
        }
        console.error('Gotenberg HTTP', gRes.status);
      } catch (ge) {
        console.error('Gotenberg Fehler:', ge instanceof Error ? ge.message : ge);
      }
    }

    // 6) Fallback: druckbare HTML-Rechnung (Kunde kann im Browser "Als PDF speichern")
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e: unknown) {
    console.error('Portal-Rechnung Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Fehler beim Erzeugen der Rechnung.' }, { status: 500 });
  }
}
