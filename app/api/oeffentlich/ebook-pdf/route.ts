import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ebookHtml, ebookMoeglich } from '../../../vorschau/_lib/ebookHtml';
import { brancheAufloesen, dossierKey } from '../../../vorschau/_lib/dossierHtml';
import { dossierPdf } from '@/lib/dossierPdf';
import { ebookDateiPfad, inhaltsStempel, downloadName } from '@/lib/ebookDatei';
import type { BausteinZeile } from '@/lib/inhaltBaustein';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/ebook-pdf
//
// ÖFFENTLICH. GET ?branche=… liefert das Branchen-HANDBUCH als PDF-Download.
// Ausgeliefert wird IMMER von argonaut-os.com selbst (Stream), NIE per
// Weiterleitung auf die Supabase-Adresse — der Kunde sieht nur unsere Domain.
// Genau wie bei /api/oeffentlich/dossier-pdf.
//
// CACHE-FIRST, ABER MIT INHALTS-STEMPEL
// Beim Dossier reicht ein Versions-Suffix: es ändert sich nur, wenn sich der
// Code ändert. Das Handbuch ändert sich, sobald Martin ein Kapitel freigibt —
// der Code bleibt derselbe. Deshalb steckt im Dateinamen zusätzlich ein
// Stempel aus Kapitelzahl und jüngster Änderung. Neue Freigabe -> neuer Name
// -> neue Datei. Ohne den läge die alte Fassung für immer im Bucket und
// niemand bekäme die neuen Kapitel je zu sehen.
//
// WENN NOCH NICHTS FREIGEGEBEN IST
// Dann gibt es kein halbes Buch, sondern eine Weiterleitung auf das Dossier.
// Ein Handbuch mit drei Kapiteln und ohne Vorwort wäre schlechter als gar
// keines — und der Interessent hat seine E-Mail-Adresse dafür hergegeben.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'ebooks';
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

function admin() {
  return createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  });
}

type AdminClient = ReturnType<typeof admin>;

/**
 * Alle freigegebenen Bausteine laden.
 *
 * OHNE owner-Filter — und das ist Absicht: die Inhalts-Werkstatt ist ein
 * Betreiber-Werkzeug hinter dem Admin-Schloss, es gibt genau einen Autor.
 * Sollte das je anders werden, ist INHALT_OWNER_ID der Schalter dafür; dann
 * zählt nur noch dieser eine Autor. Der Text selbst wird nie gefiltert
 * ausgeliefert — nur was `freigegeben` trägt, verlässt die Datenbank.
 */
async function ladeFreigegebene(db: AdminClient): Promise<{ zeilen: BausteinZeile[]; juengste: string | null }> {
  const zeilen: BausteinZeile[] = [];
  let juengste: string | null = null;
  const SEITE = 1000;
  const nurOwner = (process.env.INHALT_OWNER_ID || '').trim();

  for (let runde = 0; runde < 5; runde++) {
    let abfrage = db
      .from('inhalt_baustein')
      .select('typ,schluessel,titel,text,freigegeben,aktualisiert_am')
      .eq('freigegeben', true)
      .order('aktualisiert_am', { ascending: false })
      .range(runde * SEITE, runde * SEITE + SEITE - 1);
    if (nurOwner) abfrage = abfrage.eq('owner_user_id', nurOwner);

    const { data, error } = await abfrage;
    if (error || !Array.isArray(data) || data.length === 0) break;

    for (const z of data as Array<BausteinZeile & { aktualisiert_am?: string }>) {
      if (!juengste && z.aktualisiert_am) juengste = z.aktualisiert_am;
      zeilen.push({ typ: z.typ, schluessel: z.schluessel, titel: z.titel, text: z.text, freigegeben: true });
    }
    if (data.length < SEITE) break;
  }

  return { zeilen, juengste };
}

function ausliefern(pdf: Buffer, brancheName: string): NextResponse {
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${downloadName(brancheName)}"`,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

/** Kein Buch möglich? Dann bekommt der Interessent das Dossier — nie eine Fehlerseite. */
function ersatzweg(branche: string): NextResponse {
  return NextResponse.redirect(
    `${BASIS_URL}/api/oeffentlich/dossier-pdf?branche=${encodeURIComponent(branche)}`,
  );
}

export async function GET(req: Request) {
  const branche = (new URL(req.url).searchParams.get('branche') || '').trim();
  const b = brancheAufloesen(branche);
  const name = b ? b.name : 'Allgemein';
  const key = dossierKey(branche);

  try {
    const db = admin();
    const { zeilen, juengste } = await ladeFreigegebene(db);

    // Reicht es für ein vollständiges Buch? Sonst das Dossier.
    if (!ebookMoeglich(branche, zeilen)) return ersatzweg(branche);

    const pfad = ebookDateiPfad(key, inhaltsStempel(zeilen.length, juengste));

    // Cache-Check: liegt genau diese Fassung schon im Bucket?
    const { data: liste } = await db.storage.from(BUCKET).list('', { limit: 1, search: pfad });
    if (Array.isArray(liste) && liste.some((f) => f.name === pfad)) {
      const { data: blob } = await db.storage.from(BUCKET).download(pfad);
      if (blob) return ausliefern(Buffer.from(await blob.arrayBuffer()), name);
    }

    // Einmalig erzeugen, ablegen, ausliefern.
    const pdf = await dossierPdf(ebookHtml(branche, zeilen));
    if (!pdf) return ersatzweg(branche);

    await db.storage.from(BUCKET).upload(pfad, pdf, { contentType: 'application/pdf', upsert: true });
    return ausliefern(pdf, name);
  } catch {
    return ersatzweg(branche);
  }
}
