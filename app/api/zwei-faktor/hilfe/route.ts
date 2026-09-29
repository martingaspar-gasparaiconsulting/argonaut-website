import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { hatVerifiziertenFaktor } from '@/lib/zweiFaktor';
import { rolleImBetrieb, glockeAnBetrieb } from '@/lib/zweiFaktorTeamServer';

// ============================================================================
// ARGONAUT OS · /api/zwei-faktor/hilfe — „Handy und Codes verloren" (Paket 164 Stufe 2)
//
// Angemeldet mit Passwort (der Code fehlt ja). Legt EINE offene Anfrage an
// (keine Flut) und meldet sie per Glocke an Geschäftsleitung + Vertretung.
// Anfragen der Geschäftsleitung selbst — und alles, was nach 24 Stunden noch
// offen ist — sieht der Betreiber im Command Center.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  if (!hatVerifiziertenFaktor(user)) return NextResponse.json({ ok: false, error: 'Für diesen Zugang ist keine Zwei-Faktor-Anmeldung eingerichtet.' }, { status: 400 });

  const admin = createAdminClient();
  const ich = await rolleImBetrieb(admin, user.id);
  const { data: offen } = await admin.from('zwei_faktor_hilfe').select('id').eq('user_id', user.id).eq('status', 'offen').limit(1);
  if (offen && offen.length > 0) return NextResponse.json({ ok: true, schon: true });

  const vomChef = ich.rolle === 'chef';
  const { data: neu, error } = await admin.from('zwei_faktor_hilfe')
    .insert({ user_id: user.id, owner_user_id: ich.betrieb, name: ich.name, vom_chef: vomChef }).select('id').single();
  if (error || !neu) return NextResponse.json({ ok: false, error: 'Anfrage gerade nicht speicherbar.' }, { status: 500 });
  if (!vomChef) {
    await glockeAnBetrieb(admin, ich.betrieb, 'Zwei-Faktor: Hilfe angefordert',
      `${ich.name} kommt ohne Handy/Notfall-Codes nicht mehr an den Zugang. Zurücksetzen unter Einstellungen → Zwei-Faktor im Team.`,
      String((neu as { id: string }).id));
  }
  return NextResponse.json({ ok: true, anBetreiber: vomChef });
}
