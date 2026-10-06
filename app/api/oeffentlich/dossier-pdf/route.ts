import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dossierHtml, dossierKey, brancheAufloesen } from '../../../vorschau/_lib/dossierHtml';
import { dossierPdf } from '@/lib/dossierPdf';
import { dossierDateiPfad } from '@/lib/dossierDatei';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { baueDossier, dossierFertig, FACH_TEXTE, FACHDOSSIER_VERSION } from '@/lib/fachdossier';
import { fachdossierHtml } from '@/lib/fachdossierHtml';
import { dossierRecht, IN_VORBEREITUNG_TEXT } from '@/lib/dossierFreigabe';
import { fachdossierCacheName, vorbereitungsSeite } from '@/lib/dossierAuslieferung';

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
  // Paket 221: Welche Fassung bekommt der Besucher?
  //  · Branche „in rechtlicher Vorbereitung" -> kurze Hinweisseite, kein PDF.
  //  · Branche mit geprüftem Fachdossier-Text -> das neue Fachdossier.
  //  · sonst wie bisher das E-Book-Dossier.
  const b = brancheAufloesen(branche);
  if (b) {
    const recht = dossierRecht(b);
    if (!recht.frei) {
      return new NextResponse(vorbereitungsSeite(b.name, recht.grund, IN_VORBEREITUNG_TEXT), {
        status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  }
  const fach = b && dossierFertig({ slug: b.slug, name: b.name, kategorie: b.kategorie }) ? b : null;
  const pfad = fach
    ? fachdossierCacheName(fach.slug, FACHDOSSIER_VERSION, JSON.stringify(FACH_TEXTE[fach.slug]))
    : dossierDateiPfad(dossierKey(branche));

  try {
    const db = admin();
    // S1: Mengen-Deckel je Absender (lib/drossel.ts) — jeder Aufruf liest Speicher/Datenbank.
    const zuViel = await drossel(db, 'oeffentlich/dossier-pdf', { ip: drosselIp(req.headers) });
    if (zuViel) return new NextResponse(drosselText(zuViel), { status: 429, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

    // Cache-Check: liegt das PDF (neue Version) schon im Bucket?
    const { data: liste } = await db.storage.from('dossiers').list('', { limit: 1, search: pfad });
    const existiert = Array.isArray(liste) && liste.some((f) => f.name === pfad);
    if (existiert) {
      const { data: blob } = await db.storage.from('dossiers').download(pfad);
      if (blob) return ausliefern(Buffer.from(await blob.arrayBuffer()), branche);
    }

    // Einmalig generieren, cachen und streamen.
    const html = fach
      ? await fachdossierHtml(baueDossier({ slug: fach.slug, name: fach.name, kategorie: fach.kategorie }))
      : dossierHtml(branche);
    const pdf = await dossierPdf(html);
    if (!pdf) return NextResponse.redirect(`${BASIS_URL}/vorschau`);
    await db.storage.from('dossiers').upload(pfad, pdf, { contentType: 'application/pdf', upsert: true });
    return ausliefern(pdf, branche);
  } catch {
    return NextResponse.redirect(`${BASIS_URL}/vorschau`);
  }
}
