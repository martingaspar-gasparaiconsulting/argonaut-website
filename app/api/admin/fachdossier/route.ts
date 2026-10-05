import { NextResponse } from 'next/server';
import { betreiberPruefung } from '@/lib/betreiberGuard';
import { websiteBranchen, websiteBrancheBySlug } from '@/app/vorschau/_lib/branchen-web';
import { baueDossier, dossierStand, FACH_TEXTE } from '@/lib/fachdossier';
import { fachdossierHtml, mitWasserzeichen } from '@/lib/fachdossierHtml';
import { dossierPdf } from '@/lib/dossierPdf';

// ============================================================================
// ARGONAUT OS · /api/admin/fachdossier   (Paket 214, 05.10.2026 · B11a)
//
// Fachdossier-Generator nach dem Elektro-Richtwert — NUR für den Betreiber.
//   GET                         -> Übersicht: 698 Branchen, fertig/Entwurf je Kategorie
//   GET ?slug=elektriker        -> Dossier als HTML (Vorschau im Command Center)
//   GET ?slug=…&format=pdf      -> Dossier als PDF (Gotenberg)
// Vor der Abnahme durch den Anwalt trägt jedes Dossier „ENTWURF – nicht zur
// Weitergabe" (lib/fachdossierHtml FREIGABE_ERTEILT). Es wird nichts
// gespeichert und nichts verschickt.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const { absage } = await betreiberPruefung();
  if (absage) return absage;
  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();

  if (!slug) {
    const alle = websiteBranchen().map((b) => ({ slug: b.slug, name: b.name, kategorie: b.kategorie }));
    const stand = dossierStand(alle);
    return NextResponse.json({
      ok: true, stand,
      branchen: alle.map((b) => ({ ...b, fertig: !!FACH_TEXTE[b.slug] })),
    });
  }

  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return NextResponse.json({ ok: false, error: 'Ungültige Branche.' }, { status: 400 });
  const b = websiteBrancheBySlug(slug);
  if (!b) return NextResponse.json({ ok: false, error: 'Diese Branche gibt es nicht.' }, { status: 404 });
  const d = baueDossier({ slug: b.slug, name: b.name, kategorie: b.kategorie });
  const html = await fachdossierHtml(d);

  if (url.searchParams.get('format') === 'pdf') {
    const pdf = await dossierPdf(html);
    if (!pdf) return NextResponse.json({ ok: false, error: 'Der PDF-Dienst ist gerade nicht erreichbar.' }, { status: 503 });
    const name = `ARGONAUT-Fachdossier-${b.slug}${mitWasserzeichen(d) ? '-ENTWURF' : ''}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN' },
  });
}
