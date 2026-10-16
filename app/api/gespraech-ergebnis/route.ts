import { NextResponse } from 'next/server';
import { nurAngemeldet } from '@/lib/nurAngemeldet';
import { createClient } from '@/lib/supabase-server';
import { ergebnisPruefen, neueLeadStufe } from '@/lib/gespraechErgebnis';
import { feldwerteFuerStufe } from '@/lib/leadStufen';
import { stoppWerte } from '@/lib/leadNachfass';

// ============================================================================
// ARGONAUT OS · /api/gespraech-ergebnis — Paket VK6 Teil 1 (16.10.2026)
// Speichert das Ergebnis eines Verkaufsgespraechs am Lead (Tabelle vk_gespraech,
// SQL p414) — komplett mit der Anmeldung des Nutzers (RLS + Waechter-Trigger).
// Danach, als Zugabe: Lead-Stufe nachziehen (nie zurueck), bei „Kein Abschluss"
// das Nachfassen stoppen, am verknuepften Termin „erschienen" setzen (p411).
// Body: { lead_id, termin_id?, eingabe: { ergebnis, angeboten, vereinbart, anzahlung,
//         einwand, einwand_text, naechster_schritt, folgetermin_am, notiz } }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const absage = await nurAngemeldet();
  if (absage) return absage;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const leadId = typeof body.lead_id === 'string' ? body.lead_id : '';
    const terminId = typeof body.termin_id === 'string' && UUID.test(body.termin_id) ? body.termin_id : null;
    if (!UUID.test(leadId)) return NextResponse.json({ error: 'Ungültige Angabe.' }, { status: 400 });
    const jetzt = new Date();
    const pr = ergebnisPruefen((body.eingabe ?? {}) as Record<string, unknown>, jetzt);
    if (!pr.ok) return NextResponse.json({ error: pr.fehler.join(' ') }, { status: 400 });

    const sb = await createClient();
    const { data: l } = await sb.from('leads')
      .select('id, stufe, termin_gebucht_am, termin_gehalten_am, kunde_seit, nachfass_status').eq('id', leadId).maybeSingle();
    const lead = l as { id: string; stufe: string | null; termin_gebucht_am: string | null; termin_gehalten_am: string | null; kunde_seit: string | null; nachfass_status: string | null } | null;
    if (!lead) return NextResponse.json({ error: 'Lead nicht gefunden.' }, { status: 404 });

    if (terminId) {
      const { data: t } = await sb.from('termine').select('id').eq('id', terminId).maybeSingle();
      if (!t) return NextResponse.json({ error: 'Termin nicht gefunden.' }, { status: 404 });
    }

    const { data: neu, error } = await sb.from('vk_gespraech')
      .insert({ lead_id: leadId, termin_id: terminId, ...pr.wert })
      .select('id').single();
    if (error || !neu) {
      const fehlt = /vk_gespraech/.test(error?.message || '') && /exist|schema cache|relation/i.test(error?.message || '');
      return NextResponse.json({ error: fehlt ? 'Die Datenbank-Erweiterung p414 fehlt noch.' : (error?.message || 'Speichern fehlgeschlagen.') }, { status: fehlt ? 409 : 400 });
    }

    // Zugaben — ein Fehler hier macht das gespeicherte Ergebnis nicht ungueltig.
    let stufe: string | null = null;
    try {
      const ziel = neueLeadStufe(lead.stufe, pr.wert.ergebnis);
      if (ziel) {
        const felder: Record<string, string | number | null> = {
          ...feldwerteFuerStufe(ziel, jetzt.toISOString(), lead),
          ...(ziel === 'verloren' && lead.nachfass_status === 'aktiv' ? stoppWerte('gestoppt') : {}),
        };
        const { data: u } = await sb.from('leads').update(felder).eq('id', leadId).select('id');
        if (u && u.length) stufe = ziel;
      }
    } catch { /* Stufe ist Zugabe */ }
    if (terminId) {
      try {
        await sb.from('termine')
          .update({ erschienen: pr.wert.ergebnis !== 'nicht_erschienen', erschienen_am: jetzt.toISOString() })
          .eq('id', terminId);
      } catch { /* Spalte erst mit p411 */ }
    }
    return NextResponse.json({ ok: true, id: (neu as { id: string }).id, stufe });
  } catch {
    return NextResponse.json({ error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
}
