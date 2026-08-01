import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { encKeyBereit } from '@/lib/crypto';
import { ANSCHLUESSE } from '@/lib/anschluesse';

// ============================================================================
// ARGONAUT OS · Anschlüsse-Cockpit · app/api/anschluesse/uebersicht/route.ts
// Zählt je externem Anschluss die verschlüsselten Zugänge des Betriebs und gibt
// eine normierte Übersicht zurück. Jede Tabelle einzeln abgesichert: fehlt eine
// (SQL noch nicht ausgeführt) oder gibt es einen Fehler, wird sie als „offen"
// (0) gewertet — das Cockpit stürzt nie ab.
//   GET -> { ok, anzahl: {mail:2, banking:1, ...}, encKeyBereit }
// Es werden NUR Zeilenzahlen zurückgegeben — nie Zugangsdaten oder Tokens.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id ?? null;
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const anzahl: Record<string, number> = {};

  for (const a of ANSCHLUESSE) {
    try {
      const { count, error } = await admin
        .from(a.tabelle)
        .select('owner_user_id', { count: 'exact', head: true })
        .eq('owner_user_id', uid)
        .eq('verbunden', true);
      anzahl[a.key] = !error && typeof count === 'number' ? count : 0;
    } catch {
      anzahl[a.key] = 0;
    }
  }

  return NextResponse.json({ ok: true, anzahl, encKeyBereit: encKeyBereit() });
}
