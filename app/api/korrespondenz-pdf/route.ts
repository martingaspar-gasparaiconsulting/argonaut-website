import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · BLOCK 12 (Korrespondenz) · K3 — Brief-PDF (DIN 5008)
// Briefdaten (vom Client) -> HTML -> Gotenberg -> PDF.
// Layout nach DIN 5008: Anschriftfeld, Betreffzeile, Fließtext, Grußformel.
// Absenderdaten kommen als "aussteller"-Objekt vom Client (Quelle: profiles,
// dieselbe wie Rechnung/Einstellungen; Platzhalter, solange Felder leer sind).
// ============================================================

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Zeilenumbrüche in <br> (für mehrzeilige Anschrift / Brieftext)
function mehrzeilig(wert: any): string {
  return esc(wert).replace(/\n/g, '<br>');
}

function datumDe(d: any): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

// Platzhalter, wenn ein Absenderfeld noch nicht hinterlegt ist
function pflicht(wert: any, hinweis: string): string {
  const s = String(wert ?? '').trim();
  return s ? esc(s) : `<span class="warn">⚠ ${esc(hinweis)}</span>`;
}

const ART_LABEL: Record<string, string> = {
  anschreiben: 'Anschreiben',
  angebot: 'Angebot',
  mahnung: 'Mahnung',
  kuendigung: 'Kündigung',
  allgemein: 'Geschäftsbrief',
};

function baueHtml(brief: any, aussteller: any): string {
  const heuteOrt = aussteller?.ort ? `${esc(aussteller.ort)}, ` : '';
  const datum = datumDe(new Date());

  // Absender-Zeilen für die Kopfzeile (rechts)
  const absZeilen: string[] = [];
  if (aussteller?.name) absZeilen.push(esc(aussteller.name));
  if (aussteller?.anschrift) {
    esc(aussteller.anschrift)
      .split('\n')
      .forEach((z: string) => absZeilen.push(z));
  }
  if (aussteller?.telefon)
    absZeilen.push(`Tel.: ${esc(aussteller.telefon)}`);
  if (aussteller?.email) absZeilen.push(esc(aussteller.email));
  const absenderHtml = absZeilen.length
    ? absZeilen.map((z) => `<div>${z}</div>`).join('')
    : `<div class="warn">⚠ Absenderdaten in den Einstellungen ergänzen</div>`;

  // Absender-Rücksendezeile (klein, über dem Anschriftfeld — DIN 5008)
  const ruecksende = [
    aussteller?.name,
    (aussteller?.anschrift || '').replace(/\n/g, ', '),
  ]
    .filter((s) => String(s || '').trim())
    .join(' · ');

  // Empfänger-Anschriftfeld
  const empfZeilen: string[] = [];
  if (brief?.empfaenger_name) empfZeilen.push(esc(brief.empfaenger_name));
  if (brief?.empfaenger_anschrift) {
    esc(brief.empfaenger_anschrift)
      .split('\n')
      .forEach((z: string) => empfZeilen.push(z));
  }
  const empfHtml = empfZeilen.length
    ? empfZeilen.map((z) => `<div>${z}</div>`).join('')
    : `<div class="dim">— kein Empfänger angegeben —</div>`;

  const artText = ART_LABEL[brief?.brief_art] || 'Geschäftsbrief';
  const brieftextHtml = brief?.brieftext
    ? mehrzeilig(brief.brieftext)
    : `<span class="dim">— noch kein Brieftext erfasst —</span>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; color: #0A1628; margin: 0;
         padding: 0; font-size: 12.5px; line-height: 1.6; }
  .warn { color: #b8860b; font-weight: bold; }
  .dim { color: #8a99ad; }

  /* DIN-5008-orientiertes Seitenlayout */
  .seite { padding: 30px 52px 40px 60px; position: relative; }

  .marke { color: #C9A84C; font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
           font-weight: bold; margin-bottom: 6px; }

  .kopf { display: flex; justify-content: space-between; align-items: flex-start;
          gap: 30px; margin-bottom: 30px; }
  .absender-kopf { text-align: right; font-size: 11px; color: #0A1628; line-height: 1.5; }
  .absender-kopf .name { font-weight: bold; font-size: 12.5px; }

  /* Anschriftfeld (Empfänger) */
  .anschriftfeld { margin-top: 8px; margin-bottom: 8px; }
  .ruecksende { font-size: 8.5px; color: #8a99ad; border-bottom: 0.5px solid #c9d2df;
                padding-bottom: 2px; margin-bottom: 8px; }
  .empfaenger { font-size: 12.5px; line-height: 1.5; min-height: 80px; }

  /* Datumzeile rechtsbündig */
  .datumzeile { text-align: right; font-size: 12px; margin: 18px 0 24px; }

  /* Betreff */
  .betreff { font-weight: bold; font-size: 13px; margin-bottom: 20px; }

  /* Brieftext */
  .brieftext { font-size: 12.5px; line-height: 1.65; white-space: normal; }

  .fuss { margin-top: 46px; border-top: 1px solid #e1e6ee; padding-top: 12px;
          color: #8a99ad; font-size: 10px; text-align: center; }
</style></head><body>
  <div class="seite">

    <div class="kopf">
      <div>
        <div class="marke">${esc(artText)}</div>
        ${brief?.brief_nummer ? `<div class="dim" style="font-family:'DejaVu Sans Mono',monospace;font-size:11px;">${esc(brief.brief_nummer)}</div>` : ''}
      </div>
      <div class="absender-kopf">
        ${absenderHtml}
      </div>
    </div>

    <div class="anschriftfeld">
      ${ruecksende ? `<div class="ruecksende">${esc(ruecksende)}</div>` : ''}
      <div class="empfaenger">${empfHtml}</div>
    </div>

    <div class="datumzeile">${heuteOrt}${datum}</div>

    <div class="betreff">${pflicht(brief?.betreff, 'Betreff fehlt')}</div>

    <div class="brieftext">${brieftextHtml}</div>

    <div class="fuss">Erstellt mit ARGONAUT OS &middot; ${datum}</div>
  </div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const brief = body?.brief;
    const aussteller: any = body?.aussteller || {};

    if (!brief?.betreff) {
      return NextResponse.json({ error: 'Briefdaten fehlen.' }, { status: 400 });
    }

    const html = baueHtml(brief, aussteller);

    const gotenbergUrl = process.env.GOTENBERG_URL;
    const gUser = process.env.GOTENBERG_USER;
    const gPass = process.env.GOTENBERG_PASSWORD;
    if (!gotenbergUrl)
      return NextResponse.json(
        { error: 'PDF-Dienst nicht konfiguriert.' },
        { status: 500 }
      );

    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('marginTop', '0.4');
    form.append('marginBottom', '0.4');

    const authHeader =
      gUser && gPass
        ? 'Basic ' + Buffer.from(`${gUser}:${gPass}`).toString('base64')
        : '';
    const pdfResp = await fetch(
      `${gotenbergUrl.replace(/\/$/, '')}/forms/chromium/convert/html`,
      {
        method: 'POST',
        headers: authHeader ? { Authorization: authHeader } : undefined,
        body: form,
      }
    );
    if (!pdfResp.ok) {
      const t = await pdfResp.text();
      console.error('Korrespondenz Gotenberg Fehler:', pdfResp.status, t.slice(0, 200));
      return NextResponse.json(
        { error: 'PDF-Erstellung fehlgeschlagen.' },
        { status: 502 }
      );
    }

    const pdfBuffer = await pdfResp.arrayBuffer();
    const basis = String(brief?.brief_nummer || 'Brief')
      .replace(/[^a-zA-Z0-9äöüÄÖÜ -]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 60);
    const dateiName = `Brief_${basis}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${dateiName}"`,
      },
    });
  } catch (e: any) {
    console.error('Korrespondenz-PDF Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
