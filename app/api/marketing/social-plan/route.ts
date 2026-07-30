import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { validierePlanung } from '@/lib/social';
import { istImHorizont, KALENDER_HORIZONT_MONATE } from '@/lib/socialKalender';

// ============================================================================
// ARGONAUT OS · app/api/marketing/social-plan/route.ts  (Social P4)
//
// Schlanke Plan-Route fuer den Kalender: einen Beitrag einplanen ODER verschieben
// ODER zurueck in den Entwurf holen. Aendert nur Status + geplant_am.
//   POST { beitrag_id, geplant_am }         -> status 'geplant' (12-Monats-Horizont)
//   POST { beitrag_id, status: 'entwurf' }  -> zurueck in den Entwurf (geplant_am null)
//
// Owner-hart (Service-Role). Der Inhalt selbst wird im Editor bearbeitet.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const beitragId = (body?.beitrag_id || '').toString().trim();
  if (!beitragId) return NextResponse.json({ ok: false, error: 'Kein Beitrag angegeben.' }, { status: 400 });

  const admin = createAdminClient();
  const jetzt = new Date().toISOString();

  // Zurueck in den Entwurf.
  if (body?.status === 'entwurf') {
    const { error } = await admin
      .from('social_beitrag')
      .update({ status: 'entwurf', geplant_am: null })
      .eq('id', beitragId).eq('owner_user_id', uid);
    if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'entwurf' });
  }

  // Einplanen / Verschieben.
  const geplant_am = body?.geplant_am ? new Date(body.geplant_am).toISOString() : null;
  const plan = validierePlanung('geplant', geplant_am, jetzt);
  if (!plan.ok) return NextResponse.json({ ok: false, error: plan.fehler }, { status: 400 });
  if (!istImHorizont(geplant_am, jetzt)) {
    return NextResponse.json({ ok: false, error: `Bitte einen Zeitpunkt innerhalb der nächsten ${KALENDER_HORIZONT_MONATE} Monate wählen.` }, { status: 400 });
  }

  const { error } = await admin
    .from('social_beitrag')
    .update({ status: 'geplant', geplant_am })
    .eq('id', beitragId).eq('owner_user_id', uid);
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });

  return NextResponse.json({ ok: true, status: 'geplant', geplant_am });
}
