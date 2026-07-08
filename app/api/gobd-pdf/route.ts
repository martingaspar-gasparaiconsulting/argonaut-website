// app/api/gobd-pdf/route.ts
// ============================================================
// ARGONAUT OS · Block 1.2c/1.2d · GoBD-Verfahrensdokumentation als PDF
// Laedt den gespeicherten Entwurf (oder eine bestimmte Version) und baut daraus
// deterministisch das fertige Dokument. HTML -> Gotenberg -> PDF. Keine KI.
// Body: { dokuId?: string }  (ohne dokuId -> aktueller Entwurf des Chefs)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function absatz(s: any): string {
  const t = esc(s).trim();
  return t ? t.replace(/\n/g, '<br>') : '<span class="leer">— keine Angabe —</span>';
}

function baueHtml(inhalt: any, version: number, status: string): string {
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  const k = inhalt?.firmenkopf || {};
  const v = inhalt?.verantwortung || {};
  const a = inhalt?.abschnitte || {};
  const statusText = status === 'final' ? `Version ${version}` : `Entwurf (Version ${version})`;

  const kopfZeile = (label: string, wert: any) =>
    `<tr><td class="kl">${esc(label)}</td><td>${wert ? esc(wert) : '<span class="leer">—</span>'}</td></tr>`;

  const abschnitt = (nr: string, titel: string, text: any) =>
    `<div class="abschnitt"><h2>${esc(nr)}. ${esc(titel)}</h2><p>${absatz(text)}</p></div>`;

  const adresse = [k.strasse, [k.plz, k.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #0A1628; margin: 0; padding: 46px 54px; font-size: 12px; line-height: 1.55; }
  .marke { color: #C9A84C; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold; }
  h1 { font-size: 23px; margin: 6px 0 2px; }
  .unter { color: #5b6b80; font-size: 12px; }
  .linie { border-bottom: 3px solid #C9A84C; margin: 14px 0 22px; }
  h2 { font-size: 14px; margin: 22px 0 8px; color: #0A1628; border-bottom: 1px solid #e1e6ee; padding-bottom: 4px; }
  table.kopf { width: 100%; border-collapse: collapse; }
  table.kopf td { padding: 5px 8px; border-bottom: 1px solid #eef1f6; vertical-align: top; font-size: 12px; }
  td.kl { color: #5b6b80; width: 34%; }
  .abschnitt p { margin: 0; text-align: justify; }
  .leer { color: #9aa7b8; font-style: italic; }
  .sig { display: flex; gap: 40px; margin-top: 46px; }
  .sig div { flex: 1; border-top: 1px solid #0A1628; padding-top: 6px; font-size: 11px; color: #5b6b80; }
  .fuss { margin-top: 26px; border-top: 1px solid #e1e6ee; padding-top: 10px; color: #8a99ad; font-size: 10px; line-height: 1.5; }
</style></head><body>
  <div class="marke">GoBD-Verfahrensdokumentation</div>
  <h1>${esc(k.firmenname || 'Verfahrensdokumentation')}</h1>
  <div class="unter">${esc(statusText)} &middot; Stand: ${heute}</div>
  <div class="linie"></div>

  <h2>1. Allgemeine Angaben</h2>
  <table class="kopf">
    ${kopfZeile('Firma', k.firmenname)}
    ${kopfZeile('Rechtsform', k.rechtsform)}
    ${kopfZeile('Anschrift', adresse)}
    ${kopfZeile('Branche', k.branche)}
    ${kopfZeile('Geschäftsführung', k.geschaeftsfuehrer)}
    ${kopfZeile('Registergericht / HRB', [k.registergericht, k.hrb].filter(Boolean).join(' · '))}
    ${kopfZeile('USt-IdNr.', k.ust_id)}
    ${kopfZeile('Steuernummer', k.steuernummer)}
    ${kopfZeile('Bankverbindung', [k.bank, k.iban, k.bic].filter(Boolean).join(' · '))}
  </table>

  <h2>2. Verantwortung &amp; steuerliche Beratung</h2>
  <table class="kopf">
    ${kopfZeile('Verantwortlich für die Buchführung', v.buchfuehrung)}
    ${kopfZeile('Steuerberater / Kanzlei', v.steuerberater)}
    ${kopfZeile('DATEV-Beraternummer', v.datev_nr)}
    ${kopfZeile('Aufbewahrungsort der Unterlagen', v.aufbewahrungsort)}
  </table>

  ${abschnitt('3', 'Eingesetzte Systeme (DV-System)', inhalt?.systeme)}
  ${abschnitt('4', 'Belegerfassung &amp; Archivierung', a.beleg_erfassung)}
  ${abschnitt('5', 'Rechnungsstellung &amp; Buchung', a.buchung_ablauf)}
  ${abschnitt('6', 'Zugriffsrechte &amp; internes Kontrollsystem (IKS)', a.zugriffsrechte)}
  ${abschnitt('7', 'Datensicherung', a.datensicherung)}
  ${abschnitt('8', 'Aufbewahrung &amp; Fristen', a.aufbewahrung)}

  <div class="sig">
    <div>Ort, Datum</div>
    <div>Unterschrift Geschäftsführung</div>
  </div>

  <div class="fuss">
    Diese Verfahrensdokumentation beschreibt die im Betrieb eingesetzten Verfahren zur Verarbeitung und Aufbewahrung
    steuerrelevanter Daten gemäß den Grundsätzen zur ordnungsmäßigen Führung und Aufbewahrung von Büchern, Aufzeichnungen
    und Unterlagen in elektronischer Form sowie zum Datenzugriff (GoBD). Sie ist bei Änderungen der Verfahren fortzuschreiben;
    frühere Fassungen sind aufzubewahren. Erstellt mit ARGONAUT OS &middot; ${heute} &middot; ${esc(statusText)}.
  </div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dokuId = body?.dokuId ? String(body.dokuId) : null;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    let row: any = null;
    if (dokuId) {
      const { data } = await supabase.from('gobd_verfahrensdoku')
        .select('id,version,status,inhalt').eq('id', dokuId).eq('owner_user_id', user.id).maybeSingle();
      row = data;
    } else {
      const { data } = await supabase.from('gobd_verfahrensdoku')
        .select('id,version,status,inhalt').eq('owner_user_id', user.id).eq('status', 'entwurf')
        .order('aktualisiert_am', { ascending: false }).limit(1).maybeSingle();
      row = data;
    }
    if (!row) return NextResponse.json({ error: 'Keine Verfahrensdokumentation gefunden. Bitte zuerst speichern.' }, { status: 404 });

    const html = baueHtml(row.inhalt || {}, row.version || 1, row.status || 'entwurf');

    const gotenbergUrl = process.env.GOTENBERG_URL;
    const gUser = process.env.GOTENBERG_USER;
    const gPass = process.env.GOTENBERG_PASSWORD;
    if (!gotenbergUrl) return NextResponse.json({ error: 'PDF-Dienst nicht konfiguriert.' }, { status: 500 });

    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('marginTop', '0.6');
    form.append('marginBottom', '0.6');

    const authHeader = (gUser && gPass) ? 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64') : '';
    const pdfResp = await fetch(`${gotenbergUrl.replace(/\/$/, '')}/forms/chromium/convert/html`, {
      method: 'POST', headers: authHeader ? { Authorization: authHeader } : undefined, body: form,
    });
    if (!pdfResp.ok) {
      const t = await pdfResp.text();
      console.error('GoBD Gotenberg Fehler:', pdfResp.status, t.slice(0, 200));
      return NextResponse.json({ error: 'PDF-Erstellung fehlgeschlagen.' }, { status: 502 });
    }

    const pdfBuffer = await pdfResp.arrayBuffer();
    const firma = String(row.inhalt?.firmenkopf?.firmenname || 'Betrieb').replace(/[^a-zA-Z0-9äöüÄÖÜ ]/g, '').replace(/\s+/g, '_').slice(0, 50);
    const vTag = row.status === 'final' ? `v${row.version}` : 'Entwurf';
    const dateiName = `GoBD-Verfahrensdokumentation_${firma}_${vTag}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${dateiName}"` },
    });
  } catch (e: any) {
    console.error('GoBD-PDF Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
