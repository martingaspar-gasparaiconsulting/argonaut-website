import { NextResponse } from 'next/server';
import { createClient as createServer } from '@/lib/supabase-server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { dossierHtml, dossierKey } from '../../../vorschau/_lib/dossierHtml';
import { dossierPdf } from '@/lib/dossierPdf';
import { dossierDateiPfad, istAktuelleFassung, keyAusDatei, DOSSIER_VERSION } from '@/lib/dossierDatei';

// ============================================================================
// ARGONAUT OS · /api/admin/dossiers  (Control-Room · Branchen-Dossiers)
//
// GET   -> welche Branchen-PDFs liegen in der aktuellen Fassung im Bucket,
//          plus die Lead-Zahlen aus dossier_leads.
// POST  -> erzeugt PDFs fuer bis zu MAX_JE_LAUF Branchen und legt sie ab.
//
// WARUM VORAB ERZEUGEN, WENN DIE OEFFENTLICHE ROUTE DAS OHNEHIN TUT
// Die tut es beim ERSTEN Abruf — und laesst genau den Besucher warten, der
// gerade seine E-Mail bestaetigt hat. Nach einer Layout-Aenderung trifft das
// jeden der 698 Slugs einmal. Vorab erzeugt wartet niemand.
//
// WARUM IN HAEPPCHEN
// Ein PDF braucht ueber Gotenberg ein bis drei Sekunden. 698 Stueck sind
// zwanzig Minuten — laenger als jede Serverlaufzeit. Deshalb liefert diese
// Route immer nur ein Haeppchen und die Oberflaeche ruft sie wieder auf.
// Ein Aufruf, der ins Zeitlimit laeuft, hinterliesse sonst halbe Arbeit
// ohne Rueckmeldung.
//
// ZUGANG: nur profiles.role === 'admin' — dieselbe Pruefung wie das
// Admin-Layout. Eine Route hinter einer geschuetzten Seite ist NICHT
// automatisch selbst geschuetzt; sie ist per URL direkt erreichbar.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_JE_LAUF = 8;
const BUCKET = 'dossiers';

function adminDb() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

/** Gibt null zurueck, wenn alles in Ordnung ist — sonst die Absage. */
async function pruefeAdmin(): Promise<NextResponse | null> {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });

  const { data: profil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profil || (profil as { role?: string }).role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 });
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET — Bestandsaufnahme
// ---------------------------------------------------------------------------
export async function GET() {
  const absage = await pruefeAdmin();
  if (absage) return absage;

  const db = adminDb();
  const vorhanden: string[] = [];
  const veraltet: string[] = [];

  try {
    // Der Bucket haelt bis zu 698 aktuelle plus alte Fassungen — in Seiten holen.
    let versatz = 0;
    for (let runde = 0; runde < 10; runde++) {
      const { data, error } = await db.storage.from(BUCKET).list('', { limit: 1000, offset: versatz });
      if (error || !Array.isArray(data) || data.length === 0) break;
      for (const f of data) {
        if (!f?.name || !f.name.endsWith('.pdf')) continue;
        if (istAktuelleFassung(f.name)) {
          const key = keyAusDatei(f.name);
          if (key) vorhanden.push(key);
        } else {
          veraltet.push(f.name);
        }
      }
      if (data.length < 1000) break;
      versatz += data.length;
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Der Ablageort ist nicht erreichbar.' }, { status: 502 });
  }

  // Lead-Zahlen — Kopfrechnen spart das Laden aller Zeilen.
  let leadsGesamt = 0, leadsAktiv = 0, leadsOffen = 0;
  try {
    const [a, b, c] = await Promise.all([
      db.from('dossier_leads').select('id', { count: 'exact', head: true }),
      db.from('dossier_leads').select('id', { count: 'exact', head: true }).eq('status', 'aktiv'),
      db.from('dossier_leads').select('id', { count: 'exact', head: true }).eq('status', 'unbestaetigt'),
    ]);
    leadsGesamt = a.count ?? 0;
    leadsAktiv = b.count ?? 0;
    leadsOffen = c.count ?? 0;
  } catch { /* Zahlen sind schmueckendes Beiwerk */ }

  return NextResponse.json({
    ok: true,
    version: DOSSIER_VERSION,
    vorhanden,
    veraltetAnzahl: veraltet.length,
    maxJeLauf: MAX_JE_LAUF,
    leads: { gesamt: leadsGesamt, aktiv: leadsAktiv, offen: leadsOffen },
    gotenberg: Boolean(process.env.GOTENBERG_URL),
  });
}

// ---------------------------------------------------------------------------
// POST — ein Haeppchen erzeugen
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const absage = await pruefeAdmin();
  if (absage) return absage;

  if (!process.env.GOTENBERG_URL) {
    return NextResponse.json({ ok: false, error: 'Der PDF-Dienst ist nicht eingerichtet (GOTENBERG_URL fehlt).' }, { status: 500 });
  }

  let branchen: string[] = [];
  let neuBauen = false;
  try {
    const koerper = await req.json();
    branchen = Array.isArray(koerper?.branchen) ? koerper.branchen.map(String) : [];
    neuBauen = koerper?.neu === true;
  } catch {
    return NextResponse.json({ ok: false, error: 'Die Anfrage war unlesbar.' }, { status: 400 });
  }

  if (branchen.length === 0) {
    return NextResponse.json({ ok: false, error: 'Es wurde keine Branche angegeben.' }, { status: 400 });
  }
  if (branchen.length > MAX_JE_LAUF) {
    return NextResponse.json({
      ok: false,
      error: `Höchstens ${MAX_JE_LAUF} auf einmal — sonst läuft der Aufruf ins Zeitlimit.`,
    }, { status: 400 });
  }

  const db = adminDb();
  const fertig: string[] = [];
  const uebersprungen: string[] = [];
  const fehler: Array<{ branche: string; grund: string }> = [];

  for (const branche of branchen) {
    const key = dossierKey(branche);
    const pfad = dossierDateiPfad(key);
    try {
      if (!neuBauen) {
        const { data: liste } = await db.storage.from(BUCKET).list('', { limit: 1, search: pfad });
        if (Array.isArray(liste) && liste.some((f) => f.name === pfad)) {
          uebersprungen.push(key);
          continue;
        }
      }

      const pdf = await dossierPdf(dossierHtml(branche));
      if (!pdf) { fehler.push({ branche: key, grund: 'PDF-Dienst hat nichts geliefert.' }); continue; }

      const { error } = await db.storage.from(BUCKET)
        .upload(pfad, pdf, { contentType: 'application/pdf', upsert: true });
      if (error) { fehler.push({ branche: key, grund: error.message }); continue; }

      fertig.push(key);
    } catch (e) {
      fehler.push({ branche: key, grund: (e as Error)?.message || 'Unbekannter Fehler.' });
    }
  }

  return NextResponse.json({ ok: fehler.length === 0, fertig, uebersprungen, fehler });
}
