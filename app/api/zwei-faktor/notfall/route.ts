import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { hatVerifiziertenFaktor } from '@/lib/zweiFaktor';
import { codeHash, normalisiereCode, codeGeheimnis, MAX_FEHLVERSUCHE_STUNDE } from '@/lib/zweiFaktorCodes';

// ============================================================================
// ARGONAUT OS · /api/zwei-faktor/notfall — Handy verloren (Paket 164)
//
// Angemeldet mit Passwort (aal1) + ein gültiger Notfall-Code:
//   -> der Code wird verbraucht, der zweite Faktor dieses Nutzers entfernt,
//      danach wird sofort neu eingerichtet.
// Höchstens MAX_FEHLVERSUCHE_STUNDE Fehlversuche je Stunde und Nutzer.
// Nur der eigene Zugang — die Kennung kommt aus getUser(), nie vom Browser.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  if (!hatVerifiziertenFaktor(user)) return NextResponse.json({ ok: false, error: 'Für diesen Zugang ist keine Zwei-Faktor-Anmeldung eingerichtet.' }, { status: 400 });
  if (!codeGeheimnis()) return NextResponse.json({ ok: false, error: 'Notfall-Codes sind gerade nicht verfügbar.' }, { status: 503 });

  const admin = createAdminClient();
  const seit = new Date(Date.now() - 3600000).toISOString();
  const { count } = await admin.from('zwei_faktor_ereignisse').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('art', 'fehlversuch').gte('zeit', seit);
  if ((count ?? 0) >= MAX_FEHLVERSUCHE_STUNDE) {
    return NextResponse.json({ ok: false, error: 'Zu viele Fehlversuche. Bitte in einer Stunde erneut versuchen.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({})) as { code?: string };
  const code = normalisiereCode(body.code);
  const hash = code ? codeHash(user.id, code) : '';
  // Verbrauchen in EINEM Schritt: nur ein unbenutzter Code des Nutzers wird markiert.
  const { data: treffer } = hash
    ? await admin.from('zwei_faktor_notfall').update({ benutzt_am: new Date().toISOString() })
      .eq('user_id', user.id).eq('code_hash', hash).is('benutzt_am', null).select('id')
    : { data: [] };
  if (!treffer || treffer.length === 0) {
    await admin.from('zwei_faktor_ereignisse').insert({ user_id: user.id, art: 'fehlversuch' });
    return NextResponse.json({ ok: false, error: 'Dieser Notfall-Code passt nicht oder wurde schon benutzt.' }, { status: 400 });
  }

  const { data: faktoren, error: listFehler } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  if (listFehler) return NextResponse.json({ ok: false, error: 'Der zweite Faktor ließ sich gerade nicht entfernen. Bitte erneut versuchen.' }, { status: 502 });
  for (const f of faktoren?.factors ?? []) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
    if (error) return NextResponse.json({ ok: false, error: 'Der zweite Faktor ließ sich gerade nicht entfernen. Bitte erneut versuchen.' }, { status: 502 });
  }
  await admin.from('zwei_faktor_notfall').delete().eq('user_id', user.id);
  await admin.from('zwei_faktor_ereignisse').insert({ user_id: user.id, art: 'notfall_benutzt' });
  return NextResponse.json({ ok: true });
}
