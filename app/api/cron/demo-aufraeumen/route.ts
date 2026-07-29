import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../../lib/supabase-server';
import { loeschReihenfolge, REGISTER_TABELLE } from '../../../../lib/uebungswelt';
import { BEISPIEL_QUELLE } from '../../../../lib/beispielKatalog';
import { aufraeumGrenze } from '../../../../lib/demo';

// ============================================================================
// ARGONAUT OS · app/api/cron/demo-aufraeumen/route.ts  (Punkt 27)
//
// Leert die Übungswelt-Daten ABGELAUFENER Demo-Konten — aber erst nach einer
// Kulanzfrist (GRACE_TAGE), damit die Demo davor noch read-only als Verkaufs-
// köder sichtbar bleibt. Geloescht wird EXAKT ueber das Register
// `beispiel_datensatz` (nie echte Daten anderer Konten).
//
// Auslösung:
//   1. Vercel Cron (taeglich) — sendet automatisch `Authorization: Bearer <CRON_SECRET>`,
//      wenn die Env-Variable CRON_SECRET gesetzt ist.
//   2. Manuell durch einen eingeloggten Admin (zum Testen aus dem Control Room).
// Ohne gueltiges Secret UND ohne Admin -> 403 (nie ungeschuetzt).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Nach Ablauf bleibt die Demo so viele Tage read-only sichtbar, DANN wird geleert.
const GRACE_TAGE = 7;

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
type ServiceClient = ReturnType<typeof service>;

async function erlaubt(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    const url = new URL(req.url);
    if (auth === `Bearer ${secret}` || url.searchParams.get('secret') === secret) return true;
  }
  // Fallback: eingeloggter Admin (manuelle Ausloesung)
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return p?.role === 'admin';
}

/** Alle registrierten Übungswelt-Zeilen eines Kontos loeschen (Kinder vor Eltern). */
async function aufraeumenFuer(admin: ServiceClient, ownerId: string): Promise<number> {
  const { data: reg } = await admin.from(REGISTER_TABELLE).select('tabelle, datensatz_id').eq('owner_user_id', ownerId);
  const zeilen = (reg as Array<{ tabelle: string; datensatz_id: string }> | null) || [];

  const proTabelle = new Map<string, string[]>();
  for (const r of zeilen) {
    const arr = proTabelle.get(r.tabelle) || [];
    arr.push(r.datensatz_id);
    proTabelle.set(r.tabelle, arr);
  }

  const reihenfolge = [...new Set([...loeschReihenfolge(), ...proTabelle.keys()])];
  let entfernt = 0;
  for (const tab of reihenfolge) {
    const ids = proTabelle.get(tab);
    if (!ids || !ids.length) continue;
    const { error } = await admin.from(tab).delete().in('id', ids);
    if (!error) entfernt += ids.length;
  }
  await admin.from(REGISTER_TABELLE).delete().eq('owner_user_id', ownerId);
  await admin.from('kontakte').delete().eq('owner_user_id', ownerId).eq('quelle', BEISPIEL_QUELLE);
  return entfernt;
}

async function lauf(req: Request) {
  if (!(await erlaubt(req))) {
    return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  }
  const admin = service();
  const grenze = aufraeumGrenze(new Date().toISOString(), GRACE_TAGE);

  const { data: demos, error } = await admin
    .from('profiles')
    .select('id, demo_ablauf')
    .eq('demo', true)
    .not('demo_ablauf', 'is', null)
    .lt('demo_ablauf', grenze);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const liste = (demos as Array<{ id: string; demo_ablauf: string }> | null) || [];
  let aufgeraeumt = 0;
  let zeilen = 0;
  for (const d of liste) {
    try {
      zeilen += await aufraeumenFuer(admin, d.id);
      aufgeraeumt++;
    } catch (e) {
      console.error('Demo-Aufraeumen fehlgeschlagen fuer', d.id, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true, geprueft: liste.length, aufgeraeumt, zeilen, grenze, graceTage: GRACE_TAGE });
}

export async function GET(req: Request) {
  return lauf(req);
}
export async function POST(req: Request) {
  return lauf(req);
}
