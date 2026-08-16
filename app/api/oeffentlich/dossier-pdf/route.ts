import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dossierHtml, dossierKey, brancheAufloesen } from '../../../vorschau/_lib/dossierHtml';
import { dossierPdf } from '@/lib/dossierPdf';
import { dossierDateiPfad } from '@/lib/dossierDatei';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/dossier-pdf  (I5)
// ÖFFENTLICH. GET ?branche=.. -> liefert das Branchen-Dossier als PDF-DOWNLOAD.
// Die Datei wird IMMER von argonaut-os.com selbst ausgeliefert (Stream), NIE per
// Weiterleitung auf die Supabase-Adresse — der Kunde sieht nur unsere Domain.
// Cache-first: liegt das PDF schon im Bucket 'dossiers', wird es von dort geladen
// und gestreamt; sonst einmalig via Gotenberg (printBackground=true) erzeugt,
// gecacht und gestreamt. Ohne Gotenberg: Fallback auf die Vorschau.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

function admin() {
  return createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  });
}

/** Sauberer Download-Dateiname, z. B. ARGONAUT-Dossier-Immobilienentwicklung.pdf */
function dateiName(branche: string): string {
  const b = brancheAufloesen(branche);
  const roh = b ? b.name : 'Allgemein';
  const sauber = roh
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9 -]/g, '').trim().replace(/\s+/g, '-');
  return `ARGONAUT-Dossier-${sauber || 'Allgemein'}.pdf`;
}

function ausliefern(pdf: Buffer, branche: string): NextResponse {
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${dateiName(branche)}"`,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

export async function GET(req: Request) {
  const branche = (new URL(req.url).searchParams.get('branche') || '').trim();
  // Das Versions-Suffix liegt jetzt in lib/dossierDatei.ts — dieselbe Quelle,
  // die der Control-Room beim Vorab-Erzeugen benutzt. Zwei getrennte Suffixe
  // waeren frueher oder spaeter auseinandergelaufen: der Control-Room haette
  // Dateien erzeugt, die diese Route nie findet.
  const pfad = dossierDateiPfad(dossierKey(branche));

  try {
    const db = admin();

    // Cache-Check: liegt das PDF (neue Version) schon im Bucket?
    const { data: liste } = await db.storage.from('dossiers').list('', { limit: 1, search: pfad });
    const existiert = Array.isArray(liste) && liste.some((f) => f.name === pfad);
    if (existiert) {
      const { data: blob } = await db.storage.from('dossiers').download(pfad);
      if (blob) return ausliefern(Buffer.from(await blob.arrayBuffer()), branche);
    }

    // Einmalig generieren, cachen und streamen.
    const pdf = await dossierPdf(dossierHtml(branche));
    if (!pdf) return NextResponse.redirect(`${BASIS_URL}/vorschau`);
    await db.storage.from('dossiers').upload(pfad, pdf, { contentType: 'application/pdf', upsert: true });
    return ausliefern(pdf, branche);
  } catch {
    return NextResponse.redirect(`${BASIS_URL}/vorschau`);
  }
}
