import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

// ============================================================================
// ARGONAUT OS · Welle 4 · app/api/admin/verbrauch/route.ts
// Aggregierter Betreiber-Rundumblick: KI-Kosten (ki_nutzung) + Speicher je
// Kunde (Storage-Buckets). Nur für Admins. Nutzt die Auswertungs-Funktionen
// aus welle4-ki-verbrauch.sql und welle4-speicher-verbrauch.sql (Service-Role).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GB = 1024 ** 3;
// Standard-Speicherlimit je Kunde in GB. Hier zentral anpassbar bzw. später
// je Paket aus lib/pakete.ts ableitbar.
const LIMIT_GB_DEFAULT = 25;

type KundeRow = { user_id: string | null; anzahl: number; tok_rein: number; tok_raus: number; kosten_usd: number };
type RouteRow = { route: string; anzahl: number; kosten_usd: number };
type SpeicherRow = { owner_key: string; bytes: number; dateien: number };

async function adminGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'nicht angemeldet' }, { status: 401 });
  const { data: profil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profil || profil.role !== 'admin') return NextResponse.json({ error: 'kein Zugriff' }, { status: 403 });
  return null;
}

const istUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function GET() {
  const gesperrt = await adminGuard();
  if (gesperrt) return gesperrt;

  const admin = createAdminClient();
  const jetzt = new Date();
  const monatStart = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), 1)).toISOString();
  const epoch = '1970-01-01T00:00:00Z';

  const [rk, rr, rkAll] = await Promise.all([
    admin.rpc('ki_verbrauch_pro_kunde', { seit: monatStart }),
    admin.rpc('ki_verbrauch_pro_route', { seit: monatStart }),
    admin.rpc('ki_verbrauch_pro_kunde', { seit: epoch }),
  ]);

  if (rk.error || rr.error || rkAll.error) {
    return NextResponse.json({ error: 'KI-Verbrauchs-Daten nicht verfügbar (SQL eingespielt?).', detail: rk.error?.message || rr.error?.message || rkAll.error?.message }, { status: 200 });
  }

  const kundeM = (rk.data ?? []) as KundeRow[];
  const kundeAll = (rkAll.data ?? []) as KundeRow[];
  const routeM = (rr.data ?? []) as RouteRow[];

  // Speicher (best effort — RPC evtl. noch nicht eingespielt).
  let speicherRows: SpeicherRow[] = [];
  let speicherTotal = 0;
  let speicherOk = false;
  try {
    const [sp, sg] = await Promise.all([admin.rpc('speicher_pro_kunde'), admin.rpc('speicher_gesamt')]);
    if (!sp.error && Array.isArray(sp.data)) { speicherRows = sp.data as SpeicherRow[]; speicherOk = true; }
    if (!sg.error && sg.data != null) speicherTotal = Number(sg.data) || 0;
  } catch { /* Speicher optional */ }

  // Namen für alle beteiligten IDs (KI + Speicher) einmalig laden.
  const idSet = new Set<string>();
  [...kundeM, ...kundeAll].forEach((r) => { if (r.user_id) idSet.add(r.user_id); });
  speicherRows.forEach((r) => { if (istUuid(r.owner_key)) idSet.add(r.owner_key); });
  const ids = [...idSet];
  const namen: Record<string, string> = {};
  if (ids.length) {
    const { data: profs } = await admin.from('profiles').select('id, firma_name, full_name').in('id', ids);
    ((profs ?? []) as Array<Record<string, unknown>>).forEach((p) => {
      namen[String(p.id)] = (typeof p.firma_name === 'string' && p.firma_name) || (typeof p.full_name === 'string' && p.full_name) || '';
    });
  }
  const nameFuer = (id: string | null) => (id ? (namen[id] || 'Kunde') : 'Öffentlich / ohne Login');

  const summe = (arr: KundeRow[]) => arr.reduce((s, r) => s + Number(r.kosten_usd || 0), 0);
  const calls = (arr: KundeRow[]) => arr.reduce((s, r) => s + Number(r.anzahl || 0), 0);

  return NextResponse.json({
    monat: {
      kostenUsd: summe(kundeM),
      calls: calls(kundeM),
      proKunde: kundeM.map((r) => ({
        name: nameFuer(r.user_id), anzahl: Number(r.anzahl || 0), tokRein: Number(r.tok_rein || 0), tokRaus: Number(r.tok_raus || 0), kostenUsd: Number(r.kosten_usd || 0),
      })),
      proRoute: routeM.map((r) => ({ route: r.route, anzahl: Number(r.anzahl || 0), kostenUsd: Number(r.kosten_usd || 0) })),
    },
    gesamt: { kostenUsd: summe(kundeAll), calls: calls(kundeAll) },
    speicher: {
      ok: speicherOk,
      totalBytes: speicherTotal,
      limitGbDefault: LIMIT_GB_DEFAULT,
      proKunde: speicherRows.map((r) => {
        const bytes = Number(r.bytes) || 0;
        const limitBytes = LIMIT_GB_DEFAULT * GB;
        return {
          name: istUuid(r.owner_key) ? (namen[r.owner_key] || 'Kunde') : r.owner_key,
          bytes, dateien: Number(r.dateien) || 0, limitBytes,
          prozent: Math.min(100, Math.round((bytes / limitBytes) * 1000) / 10),
          voll: bytes >= 0.8 * limitBytes,
        };
      }),
    },
  });
}
