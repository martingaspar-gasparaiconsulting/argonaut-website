import { NextResponse } from 'next/server';
import { nurAngemeldet } from '@/lib/nurAngemeldet';
import { createClient } from '@/lib/supabase-server';
import { markierbar } from '@/lib/showUp';
import { feldwerteFuerStufe } from '@/lib/leadStufen';

// ============================================================================
// ARGONAUT OS · /api/termin-erschienen — Paket VK5 Show-up-Maschine (16.10.2026)
// Markiert einen vergangenen Termin als „erschienen", „nicht erschienen" oder
// wieder „offen". Laeuft komplett mit der Anmeldung des Nutzers (RLS = Recht
// auf Termine) — keine Dienst-Rolle.
// Erschienen + Termin haengt an einem Kunden: ein Lead dieses Kunden auf
// „Termin gebucht" rueckt auf „Termin gehalten" (Datum nur, wenn noch leer).
// Body: { termin_id, erschienen: true | false | null } → { ok, lead } | { error }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const absage = await nurAngemeldet();
  if (absage) return absage;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const terminId = typeof body.termin_id === 'string' ? body.termin_id : '';
    const wert = body.erschienen;
    if (!UUID.test(terminId) || !(wert === true || wert === false || wert === null)) {
      return NextResponse.json({ error: 'Ungültige Angabe.' }, { status: 400 });
    }

    const sb = await createClient();
    const { data: t } = await sb.from('termine').select('id, beginn_am, status, kontakt_id').eq('id', terminId).maybeSingle();
    const termin = t as { id: string; beginn_am: string | null; status: string | null; kontakt_id: string | null } | null;
    if (!termin) return NextResponse.json({ error: 'Termin nicht gefunden.' }, { status: 404 });
    const jetzt = new Date();
    if (!markierbar(termin, jetzt)) {
      return NextResponse.json({ error: 'Nur vergangene, nicht abgesagte Termine lassen sich so markieren.' }, { status: 400 });
    }

    const { data: geaendert, error } = await sb.from('termine')
      .update({ erschienen: wert, erschienen_am: wert === null ? null : jetzt.toISOString() })
      .eq('id', terminId).select('id');
    if (error) {
      const fehlt = /erschienen/.test(error.message || '');
      return NextResponse.json({ error: fehlt ? 'Die Datenbank-Erweiterung p411 fehlt noch.' : 'Speichern fehlgeschlagen.' }, { status: fehlt ? 409 : 500 });
    }
    if (!geaendert || geaendert.length === 0) return NextResponse.json({ error: 'Keine Berechtigung, diesen Termin zu ändern.' }, { status: 403 });

    // Lead-Stufe nachziehen — Zugabe, ein Fehler hier macht die Markierung nicht ungueltig.
    let lead = 0;
    if (wert === true && termin.kontakt_id) {
      try {
        const { data: ls } = await sb.from('leads').select('id, termin_gehalten_am')
          .eq('kontakt_id', termin.kontakt_id).eq('stufe', 'termin_gebucht').limit(20);
        for (const l of (ls as { id: string; termin_gehalten_am: string | null }[] | null) ?? []) {
          const felder = feldwerteFuerStufe('termin_gehalten', jetzt.toISOString(), { termin_gehalten_am: l.termin_gehalten_am });
          const { data: u } = await sb.from('leads').update(felder).eq('id', l.id).select('id');
          if (u && u.length) lead++;
        }
      } catch { /* Lead-Stufe ist Zugabe */ }
    }
    return NextResponse.json({ ok: true, lead });
  } catch {
    return NextResponse.json({ error: 'Markieren fehlgeschlagen.' }, { status: 500 });
  }
}
