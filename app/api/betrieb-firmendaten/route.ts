// ============================================================
// ARGONAUT OS · app/api/betrieb-firmendaten/route.ts — „Darf abrechnen" (27.09.2026)
//
// Rechnungs- und Mahnseite lasen den Absender (Firmenname, Anschrift, Steuer-
// nummer, Bank, Registerdaten) aus dem Profil der ANGEMELDETEN Person. Beim
// Mitarbeiter ist das leer — seine Rechnung hätte keinen Absender, kein IBAN,
// keine Pflichtangaben (§ 14 UStG). Das Profil des Chefs darf er per RLS nicht
// lesen.
//
// Diese Route liefert GENAU die Felder, die ohnehin auf jeder Rechnung stehen —
// und nur an Mitarbeiter, die Rechnungen oder Mahnungen sehen dürfen oder das
// Recht „Darf abrechnen" haben. Der Chef bekommt sein eigenes Profil.
// Nur lesen, nie schreiben.
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { ladeBetriebProfil } from '@/lib/betriebProfil';
import { istMitarbeiterKennung } from '@/lib/nurGeschaeftsleitung';

export const runtime = 'nodejs';

/** Nur was auf einer Rechnung/Mahnung steht — nichts sonst aus dem Profil. */
const RECHNUNGS_FELDER = [
  'firma_name', 'firma_strasse', 'firma_plz', 'firma_ort', 'firma_telefon', 'firma_email',
  'firma_ust_id', 'firma_steuernummer', 'firma_iban', 'firma_bank', 'firma_bic',
  'firma_rechtsform', 'firma_geschaeftsfuehrer', 'firma_registergericht', 'firma_hrb',
  'kleinunternehmer',
] as const;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }

    if (istMitarbeiterKennung(chef)) {
      const pruef = async (fn: string, arg?: Record<string, unknown>) => {
        try {
          const r = arg ? await supabase.rpc(fn, arg) : await supabase.rpc(fn);
          return r.data === true;
        } catch { return false; }
      };
      const darf = (await pruef('darf_ich_abrechnen'))
        || (await pruef('darf_ich_modul_sehen', { p_modul: 'rechnungen' }))
        || (await pruef('darf_ich_modul_sehen', { p_modul: 'mahnwesen' }));
      if (!darf) return NextResponse.json({ error: 'Keine Freigabe für Rechnungen.' }, { status: 403 });
    }

    const p = await ladeBetriebProfil(supabase, user.id);
    const aus: Record<string, unknown> = {};
    for (const k of RECHNUNGS_FELDER) aus[k] = p[k] ?? null;
    return NextResponse.json({ firma: aus });
  } catch (e: unknown) {
    console.error('betrieb-firmendaten Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Firmendaten konnten nicht geladen werden.' }, { status: 500 });
  }
}
