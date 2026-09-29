import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { zweiFaktorStand } from '@/lib/zweiFaktorServer';
import { erzeugeCodes, codeHash, codeGeheimnis } from '@/lib/zweiFaktorCodes';

// ============================================================================
// ARGONAUT OS · /api/zwei-faktor/notfall-codes — neue Notfall-Codes (Paket 164)
//
// Nur mit BESTÄTIGTER Zwei-Faktor-Sitzung (aal2) — sonst könnte jemand mit
// gestohlenem Passwort sich Codes holen und den Faktor damit abschalten.
// Die alten Codes werden ersetzt (nur die eigenen). Die neuen Codes gehen
// genau EINMAL an den Browser; gespeichert werden nur Prüfsummen.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const stand = await zweiFaktorStand(supabase, user, false);
  if (!stand.hatFaktor || stand.aal !== 'aal2') {
    return NextResponse.json({ ok: false, error: 'Zuerst den Code aus der App bestätigen.' }, { status: 403 });
  }
  if (!codeGeheimnis()) return NextResponse.json({ ok: false, error: 'Auf dem Server fehlt das Geheimnis für Notfall-Codes.' }, { status: 503 });

  const codes = erzeugeCodes();
  const admin = createAdminClient();
  const { error: wegFehler } = await admin.from('zwei_faktor_notfall').delete().eq('user_id', user.id);
  if (wegFehler) return NextResponse.json({ ok: false, error: 'Notfall-Codes gerade nicht speicherbar.' }, { status: 500 });
  const { error } = await admin.from('zwei_faktor_notfall').insert(codes.map((c) => ({ user_id: user.id, code_hash: codeHash(user.id, c) })));
  if (error) return NextResponse.json({ ok: false, error: 'Notfall-Codes gerade nicht speicherbar.' }, { status: 500 });
  await admin.from('zwei_faktor_ereignisse').insert({ user_id: user.id, art: 'codes_erneuert' });
  return NextResponse.json({ ok: true, codes }, { headers: { 'cache-control': 'no-store' } });
}
