import { NextRequest, NextResponse } from 'next/server';
import { baueZugferdXml, type ZugferdPartei, type ZugferdProfil } from '../../../lib/zugferd';

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · P32 — E-RECHNUNG (XML)
// ------------------------------------------------------------
// Nimmt DIESELBEN Daten wie /api/rechnung-pdf (rechnung, positionen,
// aussteller) PLUS ein optionales "empfaenger"-Objekt mit der
// strukturierten Käufer-Adresse. Erzeugt daraus über baueZugferdXml()
// ein EN-16931-konformes XML:
//   · profil "xrechnung" -> reines XRechnung-XML (B2G/Behörden)
//   · profil "zugferd"   -> CII-XML fürs PDF-Huckepack (P35)
//
// Gibt das XML als Download zurück. Fehlende Pflichtfelder werden
// NICHT verschwiegen: sie kommen als "x-argonaut-warnungen"-Header
// mit, damit der Client sie anzeigen kann.
//
// ADDITIV: ersetzt nichts. Die rechnung-pdf-Route bleibt unberührt.
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const rechnung = body?.rechnung;
    const positionen: any[] = Array.isArray(body?.positionen) ? body.positionen : [];
    const aussteller: ZugferdPartei = body?.aussteller || {};
    const empfaenger: ZugferdPartei = body?.empfaenger || {};
    const profil: ZugferdProfil = body?.profil === 'xrechnung' ? 'xrechnung' : 'zugferd';
    const leitweg_id: string | undefined = body?.leitweg_id || undefined;

    if (!rechnung?.rechnungsnummer && !rechnung?.brutto_summe) {
      return NextResponse.json({ error: 'Rechnungsdaten fehlen.' }, { status: 400 });
    }

    const ergebnis = baueZugferdXml({
      rechnung,
      positionen,
      aussteller,
      empfaenger,
      profil,
      leitweg_id,
    });

    // Warnungen in einen Header packen (URL-encoded, damit Umlaute passen).
    const warnHeader = ergebnis.warnungen.length
      ? encodeURIComponent(ergebnis.warnungen.join(' | '))
      : '';

    return new NextResponse(ergebnis.xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${ergebnis.dateiname}"`,
        'x-argonaut-warnungen': warnHeader,
      },
    });
  } catch (e: any) {
    console.error('Rechnung-E (XML) Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler bei der E-Rechnung.' }, { status: 500 });
  }
}
