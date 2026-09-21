import { NextRequest, NextResponse } from 'next/server';
import { baueZugferdXml, type ZugferdPartei, type ZugferdProfil } from '../../../lib/zugferd';
import { createClient } from '@/lib/supabase-server';

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

    // ─── PUNKT 54 (21.09.2026): Abschlaege und Skonto ───
    // Beides wird SERVERSEITIG geholt, nicht vom Client geglaubt: die
    // abgesetzten Abschlaege entscheiden ueber DuePayableAmount, und das
    // ist die Zahl, nach der die Buchhaltung des Kunden ueberweist.
    let vorausgezahlt = 0;
    const extraWarnungen: string[] = [];
    const istSchluss = String(rechnung?.rechnungsart || '') === 'schluss';

    if (istSchluss && rechnung?.id) {
      try {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from('rechnung_abschlaege')
          .select('netto, steuer')
          .eq('schlussrechnung_id', rechnung.id);
        if (error) throw new Error(error.message);
        const zeilen: any[] = Array.isArray(data) ? data : [];
        for (const z of zeilen) {
          vorausgezahlt += (Number(z?.netto) || 0) + (Number(z?.steuer) || 0);
        }
        if (zeilen.length === 0) {
          // NICHT stillschweigend 0 annehmen. Eine Schlussrechnung ohne
          // abgesetzte Abschlaege ist der Fall, in dem die Umsatzsteuer ein
          // zweites Mal geschuldet wird (§ 14c Abs. 1 UStG).
          extraWarnungen.push(
            'Schlussrechnung ohne abgesetzte Abschlagszahlungen. Sind wirklich keine gestellt worden? Sonst wird die Umsatzsteuer ein zweites Mal ausgewiesen (§ 14c Abs. 1 UStG).',
          );
        }
      } catch (e: any) {
        // Lieber gar keine Vorauszahlung ausweisen UND es laut sagen, als
        // eine falsche Zahl in ein Dokument schreiben, nach dem gezahlt wird.
        vorausgezahlt = 0;
        extraWarnungen.push(
          'Die abgesetzten Abschlagszahlungen konnten nicht geladen werden (' +
          (e?.message || 'unbekannt') +
          '). Im XML steht deshalb KEINE Vorauszahlung — der Zahlbetrag ist zu hoch.',
        );
      }
    }

    const ergebnis = baueZugferdXml({
      rechnung,
      positionen,
      aussteller,
      empfaenger,
      profil,
      leitweg_id,
      vorausgezahlt,
      skonto: { prozent: rechnung?.skonto_prozent, tage: rechnung?.skonto_tage },
    });
    ergebnis.warnungen.push(...extraWarnungen);

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
