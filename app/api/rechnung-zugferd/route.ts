import { NextRequest, NextResponse } from 'next/server';
import { baueZugferdXml } from '../../../lib/zugferd';
import { baueZugferdPdf } from '../../../lib/zugferd-pdf';

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · KÖNIGSWEG — ECHTES ZUGFeRD
// ------------------------------------------------------------
// Erzeugt eine echte ZUGFeRD-Datei: PDF/A-3 (von Gotenberg) mit
// eingebetteter factur-x.xml + ZUGFeRD-XMP-Metadaten.
//
// Ablauf:
//   1) ruft die bestehende /api/rechnung-pdf MIT pdfa:true auf
//      -> bekommt ein PDF/A-3b (gleiches Layout wie normale Rechnung)
//   2) erzeugt die ZUGFeRD-XML über baueZugferdXml() (ZUGFeRD-Profil)
//   3) bettet XML + XMP in das PDF/A-3 ein -> echtes ZUGFeRD
//   4) gibt die fertige Datei als PDF zurück
//
// ADDITIV: nutzt die bestehende PDF-Route als HTML-Quelle (eine
// einzige Layout-Quelle), erfindet nichts neu.
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const rechnung = body?.rechnung;
    const positionen: any[] = Array.isArray(body?.positionen) ? body.positionen : [];
    const aussteller = body?.aussteller || {};
    const empfaenger = body?.empfaenger || {};
    const kontaktName = body?.kontaktName || '';
    const firmaName = body?.firmaName || '';

    if (!rechnung?.rechnungsnummer && !rechnung?.brutto_summe) {
      return NextResponse.json({ error: 'Rechnungsdaten fehlen.' }, { status: 400 });
    }

    // ── 1) PDF/A-3 von der bestehenden Route holen ──
    // Absolute URL bauen (interne Server-zu-Server-Anfrage).
    const origin = req.nextUrl.origin;
    const pdfResp = await fetch(`${origin}/api/rechnung-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rechnung,
        positionen,
        aussteller,
        kontaktName,
        firmaName,
        pdfa: true, // <- löst PDF/A-3b in der bestehenden Route aus
      }),
    });

    if (!pdfResp.ok) {
      let detail = '';
      try { const j = await pdfResp.json(); detail = j?.error || ''; } catch {}
      return NextResponse.json({ error: 'PDF/A-3 konnte nicht erzeugt werden.' + (detail ? ' ' + detail : '') }, { status: 502 });
    }

    const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());

    // ── 2) ZUGFeRD-XML erzeugen (ZUGFeRD-Profil, nicht XRechnung) ──
    const xmlErg = baueZugferdXml({
      rechnung,
      positionen,
      aussteller,
      empfaenger,
      profil: 'zugferd',
    });

    // ── 3) XML + XMP in PDF/A-3 einbetten -> echtes ZUGFeRD ──
    const zugferdBytes = await baueZugferdPdf(pdfBytes, xmlErg.xml, {
      rechnungsnummer: rechnung?.rechnungsnummer || '',
      titel: 'Rechnung ' + (rechnung?.rechnungsnummer || ''),
      autor: aussteller?.name || firmaName || 'ARGONAUT OS',
      profilLevel: 'EN 16931',
    });

    // ── 4) zurückgeben ──
    const basis = String(rechnung?.rechnungsnummer || 'Rechnung').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 60);
    const dateiName = `ZUGFeRD_${basis}.pdf`;

    const warnHeader = xmlErg.warnungen.length
      ? encodeURIComponent(xmlErg.warnungen.join(' | '))
      : '';

    return new NextResponse(Buffer.from(zugferdBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${dateiName}"`,
        'x-argonaut-warnungen': warnHeader,
      },
    });
  } catch (e: any) {
    console.error('ZUGFeRD-Route Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler beim ZUGFeRD-Erzeugen.' }, { status: 500 });
  }
}
