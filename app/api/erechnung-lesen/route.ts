import { NextRequest, NextResponse } from 'next/server';
import { leseERechnung, extrahiereXmlAusPdf } from '../../../lib/erechnung-parser';
import { extrahiereXmlAusPdfBytes } from '../../../lib/zugferd-pdf-extract';

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · P35 — E-RECHNUNG LESEN (API)
// ------------------------------------------------------------
// Nimmt eine hochgeladene E-Rechnung (XML oder ZUGFeRD-PDF) entgegen,
// liest sie über den Parser aus und gibt die Daten als JSON zurück.
//
// Eingang: multipart/form-data mit Feld "datei".
// Erkennt XML direkt; bei PDF wird das eingebettete XML extrahiert.
//
// ADDITIV: eigene Route, hängt an keiner bestehenden Tabelle.
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const datei = form.get('datei');

    if (!datei || typeof datei === 'string') {
      return NextResponse.json({ error: 'Keine Datei erhalten.' }, { status: 400 });
    }

    const file = datei as File;
    const name = (file.name || '').toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());

    let xml = '';

    if (name.endsWith('.pdf') || buf.slice(0, 5).toString('latin1') === '%PDF-') {
      // ZUGFeRD-PDF: eingebettetes XML herausziehen.
      // 1. Versuch: sauber dekomprimiert über die PDF-Struktur (pdf-lib) —
      //    funktioniert auch bei FlateDecode-komprimierten Anhängen (Normalfall).
      xml = await extrahiereXmlAusPdfBytes(buf);
      // 2. Fallback: Textsuche für unkomprimiert eingebettete XML.
      if (!xml) {
        const pdfText = buf.toString('latin1');
        xml = extrahiereXmlAusPdf(pdfText);
      }
      if (!xml) {
        return NextResponse.json({
          error: 'PDF enthält keine erkennbare eingebettete E-Rechnung. Ist es ein ZUGFeRD-PDF? Sonst bitte die XML-Datei hochladen.',
        }, { status: 422 });
      }
    } else {
      // XML direkt (UTF-8)
      xml = buf.toString('utf8');
    }

    const ergebnis = leseERechnung(xml);

    if (!ergebnis.erkannt) {
      return NextResponse.json({
        error: 'Datei konnte nicht als E-Rechnung gelesen werden.',
        details: ergebnis.warnungen,
      }, { status: 422 });
    }

    return NextResponse.json({ ok: true, rechnung: ergebnis });
  } catch (e: any) {
    console.error('E-Rechnung-Lesen Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler beim Auslesen.' }, { status: 500 });
  }
}
