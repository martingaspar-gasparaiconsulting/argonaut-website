import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { darfWiederholen, sortiereNeuesteZuerst, type ProtokollZeile } from '@/lib/socialProtokoll';

// ============================================================================
// ARGONAUT OS · app/api/marketing/social-protokoll/route.ts  (Social P8)
//
//   GET                  -> die letzten Sendeversuche dieses Betriebs
//   POST { beitrag_id }  -> einen gescheiterten Beitrag erneut einplanen
//
// ▄▄▄ BESITZER-FILTER ▄▄▄
// Gelesen wird mit der Service-Rolle, weil social_versand per RLS nur ihr
// offensteht. Damit umgeht diese Route RLS vollstaendig. JEDE Abfrage hier
// MUSS deshalb .eq('owner_user_id', uid) tragen. Fehlt der Filter, sieht ein
// Betrieb die Sendeprotokolle aller anderen — samt deren externen Beitrags-Ids.
// Die Typpruefung faengt das NICHT: die Supabase-Kette ist zu locker typisiert.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hoechstens so viele Zeilen je Abruf. Reicht fuer die Anzeige weit. */
const MAX_ZEILEN = 300;

async function userId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('social_versand')
    .select('*')
    // ▼ OHNE DIESE ZEILE WAERE DIE ROUTE EINE DATENPANNE ▼
    .eq('owner_user_id', uid)
    .limit(MAX_ZEILEN);

  if (error) return NextResponse.json({ ok: false, error: 'Protokoll konnte nicht geladen werden.' }, { status: 500 });

  // Sortiert wird bewusst hier und nicht in der Abfrage: der Name der
  // Zeitspalte steht nirgends im Code fest, und ein .order() auf eine Spalte,
  // die es nicht gibt, laesst die ganze Abfrage scheitern.
  const zeilen = sortiereNeuesteZuerst((data ?? []) as ProtokollZeile[]);

  return NextResponse.json({ ok: true, zeilen });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const beitragId = (body?.beitrag_id || '').toString().trim();
  if (!beitragId) return NextResponse.json({ ok: false, error: 'Kein Beitrag angegeben.' }, { status: 400 });

  const admin = createAdminClient();

  const { data: bt } = await admin
    .from('social_beitrag')
    .select('id, status')
    .eq('id', beitragId)
    .eq('owner_user_id', uid)
    .maybeSingle();

  const beitrag = bt as { id: string; status: string | null } | null;
  if (!beitrag) return NextResponse.json({ ok: false, error: 'Beitrag nicht gefunden.' }, { status: 404 });

  // Nur gescheiterte Beitraege. Ein gesendeter darf nicht versehentlich ein
  // zweites Mal in die Welt, ein Entwurf gehoert erst eingeplant.
  if (!darfWiederholen(beitrag.status)) {
    return NextResponse.json(
      { ok: false, error: 'Nur ein nicht gesendeter Beitrag lässt sich erneut losschicken.' },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from('social_beitrag')
    .update({ status: 'geplant', geplant_am: new Date().toISOString() })
    .eq('id', beitragId)
    .eq('owner_user_id', uid);

  if (error) return NextResponse.json({ ok: false, error: 'Erneutes Einplanen fehlgeschlagen.' }, { status: 500 });

  return NextResponse.json({
    ok: true,
    hinweis: 'Der Beitrag steht wieder auf „Geplant". Der nächste Durchgang holt ihn in wenigen Minuten ab.',
  });
}
