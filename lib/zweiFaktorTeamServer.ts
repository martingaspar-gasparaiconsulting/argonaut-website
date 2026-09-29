// ============================================================================
// ARGONAUT OS · lib/zweiFaktorTeamServer.ts — Zwei-Faktor im Team, Server-Teil (Paket 164 Stufe 2)
//
// NUR SERVER (Service-Schlüssel). Jede Abfrage ist auf den Betrieb bzw. die
// Kennung gefiltert; die Regeln, WER was darf, stehen in lib/zweiFaktorTeam.ts.
// ============================================================================

import type { TeamRolle } from './zweiFaktorTeam';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => any;
  auth: { admin: { mfa: { listFactors: (p: { userId: string }) => any; deleteFactor: (p: { id: string; userId: string }) => any } } };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Rolle eines Zugangs im Betrieb. Kein Mitarbeiter-Eintrag = Geschäftsleitung des eigenen Betriebs. */
export async function rolleImBetrieb(admin: Admin, userId: string): Promise<{ betrieb: string; rolle: TeamRolle; mitarbeiterId: string | null; name: string }> {
  const { data } = await admin.from('mitarbeiter').select('id, owner_user_id, vorname, nachname')
    .eq('auth_user_id', userId).maybeSingle();
  const m = data as { id: string; owner_user_id: string; vorname: string | null; nachname: string | null } | null;
  if (!m) return { betrieb: userId, rolle: 'chef', mitarbeiterId: null, name: 'Geschäftsleitung' };
  const { data: h } = await admin.from('zwei_faktor_helfer').select('id')
    .eq('owner_user_id', m.owner_user_id).eq('user_id', userId).maybeSingle();
  return {
    betrieb: m.owner_user_id,
    rolle: h ? 'helfer' : 'mitarbeiter',
    mitarbeiterId: m.id,
    name: [m.vorname, m.nachname].filter(Boolean).join(' ') || 'Mitarbeiter',
  };
}

export async function maxPersonen(admin: Admin, betrieb: string): Promise<number | null> {
  const { data } = await admin.from('zwei_faktor_grenze').select('max_personen').eq('owner_user_id', betrieb).maybeSingle();
  return (data as { max_personen?: number } | null)?.max_personen ?? null;
}

/**
 * Den zweiten Faktor eines Zugangs entfernen (nur der Faktor — Daten, Zugang
 * und Rechte bleiben), Notfall-Codes löschen, offene Hilfe-Anfragen schließen,
 * Nachweis schreiben. Gibt einen Fehlertext zurück oder null.
 */
export async function faktorZuruecksetzen(admin: Admin, o: {
  betrieb: string; zielUserId: string; zielName: string; durchUserId: string; durchRolle: 'chef' | 'helfer' | 'betreiber';
}): Promise<string | null> {
  const { data: faktoren, error } = await admin.auth.admin.mfa.listFactors({ userId: o.zielUserId });
  if (error) return 'Der zweite Faktor ließ sich gerade nicht lesen.';
  for (const f of (faktoren?.factors ?? []) as { id: string }[]) {
    const { error: e } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: o.zielUserId });
    if (e) return 'Der zweite Faktor ließ sich gerade nicht entfernen.';
  }
  await admin.from('zwei_faktor_notfall').delete().eq('user_id', o.zielUserId);
  await admin.from('zwei_faktor_hilfe').update({ status: 'erledigt', erledigt_am: new Date().toISOString(), erledigt_durch: o.durchUserId })
    .eq('user_id', o.zielUserId).eq('status', 'offen');
  await admin.from('zwei_faktor_ruecksetzungen').insert({
    owner_user_id: o.betrieb, ziel_user_id: o.zielUserId, ziel_name: o.zielName.slice(0, 120),
    durch_user_id: o.durchUserId, durch_rolle: o.durchRolle,
  });
  await admin.from('zwei_faktor_ereignisse').insert({ user_id: o.zielUserId, art: 'entfernt' });
  return null;
}

/** Glocke an Geschäftsleitung + Vertretungen eines Betriebs. */
export async function glockeAnBetrieb(admin: Admin, betrieb: string, titel: string, text: string, ref: string): Promise<void> {
  const { data } = await admin.from('zwei_faktor_helfer').select('user_id').eq('owner_user_id', betrieb);
  const ids = [betrieb, ...((data ?? []) as { user_id: string }[]).map((h) => h.user_id)];
  for (const uid of [...new Set(ids)]) {
    await admin.rpc('benachrichtigung_erstellen', {
      p_owner: uid, p_typ: 'zwei_faktor_hilfe', p_titel: titel, p_nachricht: text,
      p_link: '/dashboard/einstellungen', p_ref_tabelle: 'zwei_faktor_hilfe', p_ref_id: ref, p_dedup_stunden: 24,
    });
  }
}
