import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele, encKeyBereit } from '@/lib/crypto';
import { VERBINDBARE_ADS } from '@/lib/ads';
import {
  holeMetaInsights, holeGoogleInsights, holeTiktokInsights, holeLinkedinInsights,
  summeKennzahlen, KENNZAHLEN_LEER, type Kennzahlen,
} from '@/lib/adsInsights';

// ============================================================================
// ARGONAUT OS · app/api/marketing/ads-insights/route.ts  (Ads · Insights-Autofüllen)
//
// POST -> holt für alle geschalteten Kampagnen die aktuellen Ist-Kennzahlen aus
// den Reporting-APIs (Meta/Google/LinkedIn/TikTok), summiert sie je ARGONAUT-
// Kampagne (falls auf mehreren Kanälen) und schreibt sie in ads_ergebnis.
//
// Demo-Konten aktualisieren NICHT. Token serverseitig entschlüsselt. Liefert
// eine Plattform keine Daten (nicht verbunden / API-Fehler), wird sie einfach
// übersprungen — kein Abbruch. Gegen Live-APIs erst mit verbundenen Konten.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Zugang = { kontoId: string; token: string };

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();

  const { data: prof } = await admin.from('profiles').select('demo').eq('id', uid).maybeSingle();
  if ((prof as { demo?: boolean | null } | null)?.demo) return NextResponse.json({ ok: false, error: 'Im Demo-Konto ist das Aktualisieren deaktiviert.' }, { status: 400 });
  if (!encKeyBereit()) return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt.' }, { status: 400 });

  // Zugänge je Plattform (entschlüsselt).
  const zg: Record<string, Zugang> = {};
  const { data: zData } = await admin
    .from('ads_zugang').select('plattform, konto_id, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid).in('plattform', VERBINDBARE_ADS);
  for (const r of (zData ?? []) as { plattform: string; konto_id: string | null; token_verschluesselt: string | null; verbunden: boolean | null }[]) {
    if (r.verbunden !== true || !r.konto_id || !r.token_verschluesselt) continue;
    try { const t = entschluessele(r.token_verschluesselt); if (t) zg[r.plattform] = { kontoId: r.konto_id, token: t }; } catch { /* skip */ }
  }

  // Geschaltete Kampagnen (mit externer Kampagnen-ID).
  const { data: sData } = await admin
    .from('ads_schaltung').select('kampagne_id, plattform, extern_campaign_id')
    .eq('owner_user_id', uid).not('extern_campaign_id', 'is', null);
  const schaltungen = (sData ?? []) as { kampagne_id: string; plattform: string; extern_campaign_id: string }[];

  const entwicklerToken = (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim();
  const proKampagne: Record<string, Kennzahlen> = {};

  for (const s of schaltungen) {
    const z = zg[s.plattform];
    if (!z) continue;
    let k: Kennzahlen | null = null;
    if (s.plattform === 'meta') k = await holeMetaInsights(s.extern_campaign_id, z.token);
    else if (s.plattform === 'google') k = entwicklerToken ? await holeGoogleInsights(z.kontoId, s.extern_campaign_id, z.token, entwicklerToken) : null;
    else if (s.plattform === 'tiktok') k = await holeTiktokInsights(z.kontoId, s.extern_campaign_id, z.token);
    else if (s.plattform === 'linkedin') k = await holeLinkedinInsights(s.extern_campaign_id, z.token);
    if (!k) continue;
    proKampagne[s.kampagne_id] = summeKennzahlen(proKampagne[s.kampagne_id] || { ...KENNZAHLEN_LEER }, k);
  }

  let aktualisiert = 0;
  for (const [kampagneId, k] of Object.entries(proKampagne)) {
    const { error } = await admin.from('ads_ergebnis').upsert({
      owner_user_id: uid, kampagne_id: kampagneId,
      ausgaben: k.ausgaben, impressionen: k.impressionen, klicks: k.klicks, conversions: k.conversions, umsatz: k.umsatz,
      aktualisiert_am: new Date().toISOString(),
    }, { onConflict: 'owner_user_id,kampagne_id' });
    if (!error) aktualisiert++;
  }

  return NextResponse.json({
    ok: true,
    aktualisiert,
    geschaltet: schaltungen.length,
    hinweis: schaltungen.length === 0 ? 'Noch keine geschaltete Kampagne — erst schalten, dann liefern die Werbekonten Insights.' : null,
  });
}
