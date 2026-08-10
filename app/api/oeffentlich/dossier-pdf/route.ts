import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dossierHtml, dossierKey } from '../../../vorschau/_lib/dossierHtml';
import { aboRechnungPdf } from '@/lib/aboRechnungPdf';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/dossier-pdf  (I5)
// ÖFFENTLICH. GET ?branche=.. -> liefert das Branchen-Dossier als PDF.
// Cache-first: liegt es schon im Storage-Bucket 'dossiers', wird direkt dorthin
// weitergeleitet; sonst wird es einmalig generiert (Gotenberg), hochgeladen und
// dann ausgeliefert. Ohne Gotenberg: Fallback auf die Vorschau.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

function admin() {
  return createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  const branche = (new URL(req.url).searchParams.get('branche') || '').trim();
  // Versions-Suffix (eb1 = E-Book-Design): entwertet alte gecachte PDFs, sobald
  // das Dossier-Layout aktualisiert wird. Bei Layout-Änderung Suffix hochzählen.
  const pfad = `${dossierKey(branche)}-eb1.pdf`;
  const publicUrl = `${SUPA_URL}/storage/v1/object/public/dossiers/${pfad}`;

  try {
    const db = admin();

    // Cache-Check: liegt das Dossier schon im Bucket?
    const { data: liste } = await db.storage.from('dossiers').list('', { limit: 1, search: pfad });
    const existiert = Array.isArray(liste) && liste.some((f) => f.name === pfad);
    if (existiert) return NextResponse.redirect(publicUrl);

    // Einmalig generieren + hochladen.
    const pdf = await aboRechnungPdf(dossierHtml(branche));
    if (!pdf) return NextResponse.redirect(`${BASIS_URL}/vorschau`);
    await db.storage.from('dossiers').upload(pfad, pdf, { contentType: 'application/pdf', upsert: true });

    return NextResponse.redirect(publicUrl);
  } catch {
    return NextResponse.redirect(`${BASIS_URL}/vorschau`);
  }
}
