import { NextResponse } from 'next/server';
import { nurAngemeldet } from '@/lib/nurAngemeldet';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { istFrei, type Termin, type Abwesenheit } from '@/lib/terminVerteilung';
import { glockeNeuerTermin } from '@/lib/terminVerteilungServer';

// ============================================================================
// ARGONAUT OS · /api/termin-uebertragen — Paket VK3 Teil 2 (16.10.2026)
// Termin an einen Kollegen übertragen (z. B. wenn ein Closer ausfällt).
// Lesen und Ändern laufen mit der Anmeldung des Nutzers (RLS = Schreibrecht
// „Termine"); nur die Abwesenheit des Ziels und die Glocke laufen über die
// Dienst-Rolle, hart auf den Betrieb des Termins gefiltert.
// Prüft: Ziel gehört zum Betrieb, ist nicht ausgeschieden, ist zur Zeit frei.
// Body: { termin_id, an_mitarbeiter_id } → { ok, name } | { error }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUS = ['ausgeschieden', 'inaktiv', 'gekuendigt', 'gekündigt'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const absage = await nurAngemeldet();
  if (absage) return absage;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const terminId = typeof body.termin_id === 'string' ? body.termin_id : '';
    const anId = typeof body.an_mitarbeiter_id === 'string' ? body.an_mitarbeiter_id : '';
    if (!UUID.test(terminId) || !UUID.test(anId)) return NextResponse.json({ error: 'Ungültige Angabe.' }, { status: 400 });

    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    const { data: t } = await sb.from('termine').select('id, owner_user_id, beginn_am, ende_am, mitarbeiter_id, titel, kunde_name, status').eq('id', terminId).maybeSingle();
    const termin = t as { id: string; owner_user_id: string; beginn_am: string | null; ende_am: string | null; mitarbeiter_id: string | null; titel: string | null; kunde_name: string | null; status: string | null } | null;
    if (!termin) return NextResponse.json({ error: 'Termin nicht gefunden.' }, { status: 404 });
    if (!termin.beginn_am || !termin.ende_am) return NextResponse.json({ error: 'Der Termin hat keine Uhrzeit.' }, { status: 400 });
    if (termin.mitarbeiter_id === anId) return NextResponse.json({ error: 'Der Termin liegt schon bei dieser Person.' }, { status: 400 });

    const db = createAdminClient();
    const { data: ma } = await db.from('mitarbeiter').select('id, auth_user_id, vorname, nachname, status').eq('owner_user_id', termin.owner_user_id).eq('id', anId).maybeSingle();
    const ziel = ma as { id: string; auth_user_id: string | null; vorname: string | null; nachname: string | null; status: string | null } | null;
    if (!ziel || AUS.includes(String(ziel.status ?? '').toLowerCase())) return NextResponse.json({ error: 'Die Person gehört nicht (mehr) zu Ihrem Betrieb.' }, { status: 400 });
    const name = [ziel.vorname, ziel.nachname].filter(Boolean).join(' ') || 'Kollege';

    const beginn = new Date(termin.beginn_am); const ende = new Date(termin.ende_am);
    const [tz, ab] = await Promise.all([
      db.from('termine').select('mitarbeiter_id, beginn_am, ende_am, status').eq('owner_user_id', termin.owner_user_id).eq('mitarbeiter_id', anId)
        .lt('beginn_am', ende.toISOString()).gt('ende_am', beginn.toISOString()).neq('id', termin.id).limit(50),
      db.from('hr_abwesenheiten').select('mitarbeiter_id, von, bis, status').eq('owner_user_id', termin.owner_user_id).eq('mitarbeiter_id', anId).limit(500),
    ]);
    if (!istFrei(anId, beginn, ende, (tz.data as Termin[] | null) ?? [], (ab.data as Abwesenheit[] | null) ?? [])) {
      return NextResponse.json({ error: `${name} hat zu dieser Zeit schon einen Termin oder ist abwesend.` }, { status: 409 });
    }

    // Ändern mit der Anmeldung des Nutzers — ohne Schreibrecht „Termine" ändert sich nichts.
    const { data: geaendert, error } = await sb.from('termine').update({ mitarbeiter_id: anId }).eq('id', termin.id).select('id');
    if (error || !geaendert || geaendert.length === 0) return NextResponse.json({ error: 'Nicht übertragen — dafür ist das Schreibrecht „Termine" nötig.' }, { status: 403 });
    // Grund mitschreiben (Spalte aus SQL p409; fehlt sie, bleibt es beim Übertragen).
    await sb.from('termine').update({ verteilt_grund: 'Übertragen' }).eq('id', termin.id);

    if (ziel.auth_user_id && ziel.auth_user_id !== user?.id) {
      const wann = `${beginn.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} um ${beginn.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr`;
      await glockeNeuerTermin(db, ziel.auth_user_id, `Termin übernommen: ${termin.kunde_name || termin.titel || 'Termin'}`, `${termin.titel || 'Termin'} am ${wann} wurde an Sie übertragen.`);
    }
    return NextResponse.json({ ok: true, name });
  } catch {
    return NextResponse.json({ error: 'Übertragen fehlgeschlagen.' }, { status: 500 });
  }
}
