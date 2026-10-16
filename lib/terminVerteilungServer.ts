// ============================================================================
// ARGONAUT OS · lib/terminVerteilungServer.ts — Paket VK3 (16.10.2026)
// Online gebuchte Verkaufsgespräche automatisch einem freien Closer zuteilen.
// Läuft mit der Dienst-Rolle in /api/oeffentlich/buchung: JEDE Abfrage hart auf
// den Betrieb gefiltert. Jeder Fehler (SQL p409 fehlt, Netz …) = keine Zuteilung,
// die Buchung läuft unverändert weiter. Nie im Browser importieren.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { istModus, istFrei, belegung, waehleCloser, letzteZuteilung, regelnBereinigen, type Closer, type Termin, type Abwesenheit } from './terminVerteilung';

export type Zuteilung = { mitarbeiter_id: string; user_id: string; name: string; grund: string };

const AUS = ['ausgeschieden', 'inaktiv', 'gekuendigt', 'gekündigt'];

export async function closerFuerOnlineTermin(db: SupabaseClient, ownerId: string, artId: string, beginn: Date, ende: Date): Promise<Zuteilung | null> {
  try {
    const { data: v, error } = await db.from('vk_verteilung').select('modus, termin_art_ids, regeln').eq('owner_user_id', ownerId).maybeSingle();
    if (error || !v) return null;
    const cfg = v as { modus: string; termin_art_ids: string[] | null; regeln: unknown };
    if (!istModus(cfg.modus) || cfg.modus === 'aus' || !(cfg.termin_art_ids ?? []).includes(artId)) return null;

    const [f, m] = await Promise.all([
      db.from('vk_funktion').select('user_id').eq('owner_user_id', ownerId).eq('funktion', 'closer').eq('aktiv', true).limit(500),
      db.from('mitarbeiter').select('id, auth_user_id, vorname, nachname, status').eq('owner_user_id', ownerId).limit(2000),
    ]);
    const closerIds = new Set(((f.data as { user_id: string }[] | null) ?? []).map((x) => x.user_id));
    const closer: Closer[] = ((m.data as { id: string; auth_user_id: string | null; vorname: string | null; nachname: string | null; status: string | null }[] | null) ?? [])
      .filter((x) => x.auth_user_id && closerIds.has(x.auth_user_id) && !AUS.includes(String(x.status ?? '').toLowerCase()))
      .map((x) => ({ user_id: x.auth_user_id as string, mitarbeiter_id: x.id, name: [x.vorname, x.nachname].filter(Boolean).join(' ') || 'Closer' }));
    if (closer.length === 0) return null;

    const jetzt = new Date();
    const bis14 = new Date(jetzt.getTime() + 14 * 86400000);
    const fensterBis = new Date(Math.max(bis14.getTime(), ende.getTime()));
    const seit90 = new Date(jetzt.getTime() - 90 * 86400000).toISOString();
    const maIds = closer.map((c) => c.mitarbeiter_id as string);
    const [t, a, u, tv] = await Promise.all([
      db.from('termine').select('mitarbeiter_id, beginn_am, ende_am, status').eq('owner_user_id', ownerId).in('mitarbeiter_id', maIds)
        .lte('beginn_am', fensterBis.toISOString()).gte('ende_am', jetzt.toISOString()).limit(5000),
      db.from('hr_abwesenheiten').select('mitarbeiter_id, von, bis, status').eq('owner_user_id', ownerId).in('mitarbeiter_id', maIds).limit(2000),
      db.from('vk_uebergabe').select('an_user_id, erstellt_am').eq('owner_user_id', ownerId).gte('erstellt_am', seit90).limit(5000),
      db.from('termine').select('mitarbeiter_id, beginn_am').eq('owner_user_id', ownerId).in('mitarbeiter_id', maIds).not('verteilt_grund', 'is', null).gte('beginn_am', seit90).limit(5000),
    ]);
    const termine = (t.data as Termin[] | null) ?? [];
    const abw = (a.data as Abwesenheit[] | null) ?? [];
    const frei = new Set(closer.filter((c) => istFrei(c.mitarbeiter_id, beginn, ende, termine, abw)).map((c) => c.user_id));
    const maZuUser = new Map(closer.map((c) => [c.mitarbeiter_id as string, c.user_id]));
    const zuletzt = letzteZuteilung([
      ...(((u.data as { an_user_id: string; erstellt_am: string }[] | null) ?? []).map((x) => ({ user_id: x.an_user_id, am: x.erstellt_am }))),
      ...(((tv.data as { mitarbeiter_id: string; beginn_am: string }[] | null) ?? []).map((x) => ({ user_id: maZuUser.get(x.mitarbeiter_id) ?? null, am: x.beginn_am }))),
    ]);
    const wahl = waehleCloser({
      modus: cfg.modus, closer, frei, zuletzt, minuten: belegung(termine, jetzt, bis14),
      regeln: regelnBereinigen(cfg.regeln, closer.map((c) => c.user_id)), antworten: {},
    });
    if (!wahl) return null;
    const c = closer.find((x) => x.user_id === wahl.user_id);
    return c && c.mitarbeiter_id ? { mitarbeiter_id: c.mitarbeiter_id, user_id: c.user_id, name: c.name, grund: 'Online-Buchung · ' + wahl.grund } : null;
  } catch {
    return null;
  }
}

/** Glocke beim zugeteilten Closer (Fehler werden geschluckt). */
export async function glockeNeuerTermin(db: SupabaseClient, userId: string, titel: string, text: string): Promise<void> {
  try {
    await db.rpc('benachrichtigung_erstellen', {
      p_owner: userId, p_typ: 'verkauf', p_titel: titel.slice(0, 200), p_nachricht: text.slice(0, 300), p_link: '/dashboard/termine',
      p_ref_tabelle: 'termine', p_ref_id: null, p_dedup_stunden: 0,
    });
  } catch { /* Glocke ist Komfort */ }
}
