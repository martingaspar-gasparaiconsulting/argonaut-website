import { createClient } from '@/lib/supabase-server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · Website-Analyse · app/api/analyse-daten/route.ts
// SICHERE, mandantenfähige Datenquelle fürs Analyse-Dashboard. Nur eingeloggt.
// Prüft serverseitig, ob die angefragte Seite dem Nutzer gehört (web_seiten),
// bzw. ob es die Betreiber-Seite 'argonaut-os' ist (nur für ANALYSE_BETREIBER_ID).
// Erst danach werden die Auswertungs-Funktionen über die Service-Role gelesen.
// So sieht jeder ausschließlich seine eigenen Zahlen — der direkte RPC-Zugriff
// aus dem Browser ist per REVOKE gesperrt (siehe Begleit-SQL).
// Body: { action?: 'liste'|'daten', seite?: string, tage?: number }
// ============================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

type Db = ReturnType<typeof admin>;

async function darfSeite(db: Db, userId: string, seite: string): Promise<boolean> {
  if (seite === 'argonaut-os') return !!process.env.ANALYSE_BETREIBER_ID && userId === process.env.ANALYSE_BETREIBER_ID;
  const { data } = await db.from('web_seiten').select('owner_user_id').eq('oeffentlich_id', seite).maybeSingle();
  const row = data as { owner_user_id?: string } | null;
  return !!row && row.owner_user_id === userId;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body?.action === 'liste' ? 'liste' : 'daten';

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const db = admin();

    // --- Liste der Seiten, die dieser Nutzer sehen darf ---
    if (action === 'liste') {
      const seiten: { seite: string; name: string }[] = [];
      if (process.env.ANALYSE_BETREIBER_ID && user.id === process.env.ANALYSE_BETREIBER_ID) {
        seiten.push({ seite: 'argonaut-os', name: 'argonaut-os.com · Ihre Seite' });
      }
      const { data } = await db
        .from('web_seiten')
        .select('oeffentlich_id, slug, domain, status')
        .eq('owner_user_id', user.id);
      for (const r of (data as Array<{ oeffentlich_id?: string; slug?: string; domain?: string; status?: string }>) || []) {
        if (r.oeffentlich_id) {
          seiten.push({ seite: r.oeffentlich_id, name: (r.domain || r.slug || r.oeffentlich_id) + (r.status === 'live' ? '' : ' (offline)') });
        }
      }
      return NextResponse.json({ seiten });
    }

    // --- Kennzahlen einer bestimmten (erlaubten) Seite ---
    const seite = typeof body?.seite === 'string' ? body.seite.slice(0, 100) : '';
    const tage = Math.min(Math.max(parseInt(String(body?.tage ?? 7), 10) || 7, 1), 365);
    if (!seite || !(await darfSeite(db, user.id, seite))) {
      return NextResponse.json({ error: 'Kein Zugriff auf diese Seite.' }, { status: 403 });
    }

    const seit = new Date(Date.now() - tage * 86400000).toISOString();
    const p = { seit, p_seite: seite };
    const rpc = (fn: string) => db.rpc(fn, p);
    const [ov, ex, ts, kn, kp, kl, vs, gg, br, ld, rf, zr] = await Promise.all([
      rpc('web_stats_uebersicht'), rpc('web_stats_erweitert'), rpc('web_top_seiten'),
      rpc('web_nach_kanal'), rpc('web_nach_kampagne'), rpc('web_top_klicks'),
      rpc('web_verweil_je_seite'), rpc('web_nach_geraet'), rpc('web_nach_browser'),
      rpc('web_nach_land'), rpc('web_nach_referrer'), rpc('web_zeitreihe'),
    ]);

    return NextResponse.json({
      ueber: ((ov.data as unknown[]) || [])[0] || { aufrufe: 0, besucher: 0, klicks: 0 },
      erw: ((ex.data as unknown[]) || [])[0] || null,
      topSeiten: ts.data || [], kanaele: kn.data || [], kampagnen: kp.data || [], klicks: kl.data || [],
      verweil: vs.data || [], geraete: gg.data || [], browser: br.data || [], laender: ld.data || [],
      herkunft: rf.data || [], zeitreihe: zr.data || [],
    });
  } catch (e: unknown) {
    console.error('analyse-daten Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
