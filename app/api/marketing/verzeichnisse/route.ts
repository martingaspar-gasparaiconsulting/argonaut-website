import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { modulRechtPruefen } from '@/lib/modulRecht';
import { heuteIsoBerlin } from '@/lib/doiNachholen';
import { baueEintrag, leseStand, aendereStand, fortschritt, VERZEICHNISSE, type Firmendaten } from '@/lib/verzeichnisEintrag';

// ============================================================================
// ARGONAUT OS · app/api/marketing/verzeichnisse/route.ts  (Paket 206 · B5)
//
// GET  -> vorbereiteter Verzeichnis-Eintrag aus den Firmendaten (web_ci +
//         Branche aus profiles) + Abhak-Stand je Verzeichnis.
// POST { key, eingetragen, link } -> Stand eines Verzeichnisses speichern
//         (web_ci.verzeichnis_status, SQL p206).
// Modulrecht Marketing (sehen bzw. ändern). web_ci ist nur für den Chef lesbar,
// deshalb liest/schreibt der Server mit dem Server-Schlüssel — hart auf den
// eigenen Betrieb gefiltert.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CI_FELDER = 'firma, slogan, ueber_uns, kernsaetze, telefon, email, web, strasse, plz, ort, oeffnungszeiten, logo_url';

function fehler(text: string, status: number) {
  return NextResponse.json({ ok: false, error: text }, { status });
}

async function ladeCi(db: ReturnType<typeof createAdminClient>, betrieb: string) {
  const mit = await db.from('web_ci').select(CI_FELDER + ', verzeichnis_status').eq('owner_user_id', betrieb).maybeSingle();
  if (!mit.error) return { ci: mit.data as unknown as (Firmendaten & { verzeichnis_status?: unknown }) | null, spalte: true };
  const ohne = await db.from('web_ci').select(CI_FELDER).eq('owner_user_id', betrieb).maybeSingle();
  if (ohne.error) throw new Error(ohne.error.message);
  return { ci: ohne.data as unknown as Firmendaten | null, spalte: false };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const recht = await modulRechtPruefen(supabase, user?.id ?? null, 'marketing', 'sehen');
    if (!recht.ok) return fehler(recht.fehler, recht.status);
    const db = createAdminClient();
    const { ci, spalte } = await ladeCi(db, recht.betrieb);
    const { data: prof } = await db.from('profiles').select('branche').eq('id', recht.betrieb).maybeSingle();
    const branche = (prof as { branche?: string | null } | null)?.branche ?? '';
    const eintrag = baueEintrag(ci, branche, 750);
    const stand = leseStand((ci as { verzeichnis_status?: unknown } | null)?.verzeichnis_status);
    return NextResponse.json({
      ok: true,
      hatFirmendaten: !!ci,
      speicherBereit: spalte,
      darfAendern: !recht.mitarbeiter || (await modulRechtPruefen(supabase, user?.id ?? null, 'marketing', 'aendern')).ok,
      eintrag,
      verzeichnisse: VERZEICHNISSE.map((v) => ({ ...v, beschreibung: baueEintrag(ci, branche, v.maxBeschreibung).felder.find((f) => f.key === 'beschreibung')?.wert ?? '' })),
      stand,
      fortschritt: fortschritt(stand),
    });
  } catch (e) {
    console.error('verzeichnisse GET:', e instanceof Error ? e.message : e);
    return fehler('Die Firmendaten konnten nicht geladen werden.', 500);
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const recht = await modulRechtPruefen(supabase, user?.id ?? null, 'marketing', 'aendern');
    if (!recht.ok) return fehler(recht.fehler, recht.status);
    const body = await req.json().catch(() => null);
    const db = createAdminClient();
    const { ci, spalte } = await ladeCi(db, recht.betrieb);
    if (!spalte) return fehler('Das Abhaken wird gerade eingerichtet (SQL p206 fehlt).', 503);
    if (!ci) return fehler('Bitte zuerst die Firmendaten unter Webauftritt anlegen.', 409);
    const alt = leseStand((ci as { verzeichnis_status?: unknown }).verzeichnis_status);
    const neu = aendereStand(alt, body?.key, body?.eingetragen, body?.link, heuteIsoBerlin());
    if (!neu.ok) return fehler(neu.fehler, 400);
    const { error } = await db.from('web_ci').update({ verzeichnis_status: neu.stand }).eq('owner_user_id', recht.betrieb);
    if (error) {
      console.error('verzeichnisse POST:', error.message);
      return fehler('Speichern fehlgeschlagen.', 500);
    }
    return NextResponse.json({ ok: true, stand: neu.stand, fortschritt: fortschritt(neu.stand) });
  } catch (e) {
    console.error('verzeichnisse POST:', e instanceof Error ? e.message : e);
    return fehler('Interner Fehler.', 500);
  }
}
