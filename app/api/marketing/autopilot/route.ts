import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { fasseCockpit } from '@/lib/marketingCockpit';
import { autopilotVorschlaege, autopilotZusammenfassung, type AutopilotInput } from '@/lib/marketingAutopilot';
import { funnelJeVariante, abSieger } from '@/lib/lpAnalytics';

// ============================================================================
// ARGONAUT OS · app/api/marketing/autopilot/route.ts
// Marketing-Autopilot (Vorschlag-Variante). Liest die Kanal-Rohdaten RLS-scoped,
// erkennt Lage (offene/alte Leads, defizitäre Ads, LP-Sieger, ungenutzte Kanäle)
// und gibt priorisierte VORSCHLÄGE mit 1-Klick-Ziel zurück. Es handelt nichts
// von selbst. Für Kunde UND Betreiber. GET -> { ok, vorschlaege, dringend, gesamt }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
type Row = Record<string, unknown>;

async function hole(sb: Sb, tabelle: string, spalten: string): Promise<Row[]> {
  try {
    const { data, error } = await sb.from(tabelle).select(spalten).limit(5000);
    if (error) return [];
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const [nlAbos, nlVersand, socialBeitraege, socialKanaele, waKontakte, waVersand, adsKampagnen, adsErgebnisse, leadsRoh] =
    await Promise.all([
      hole(supabase, 'newsletter_abonnenten', 'status'),
      hole(supabase, 'newsletter_versand', 'erfolg_anzahl'),
      hole(supabase, 'social_beitrag', 'status'),
      hole(supabase, 'social_kanal', 'verbunden'),
      hole(supabase, 'whatsapp_kontakt', 'status'),
      hole(supabase, 'whatsapp_versand', 'status'),
      hole(supabase, 'ads_kampagne', 'status, tagesbudget'),
      hole(supabase, 'ads_ergebnis', 'ausgaben, umsatz, klicks, conversions'),
      hole(supabase, 'leads', 'status, kampagne_id, created_at'),
    ]);

  const cockpit = fasseCockpit({
    newsletterAbos: nlAbos, newsletterVersand: nlVersand,
    socialBeitraege, socialKanaele,
    whatsappKontakte: waKontakte, whatsappVersand: waVersand,
    adsKampagnen, adsErgebnisse, leads: leadsRoh,
  });

  // Offene / alte Leads (status neu, älter als 3 Tage).
  const jetzt = Date.now();
  const dreiTage = 3 * 86400000;
  const zeit = (v: unknown) => { const t = new Date(String(v ?? '')).getTime(); return Number.isFinite(t) ? t : 0; };
  const offen = leadsRoh.filter((l) => l.status === 'neu').length;
  const offenAlt = leadsRoh.filter((l) => l.status === 'neu' && zeit(l.created_at) > 0 && jetzt - zeit(l.created_at) > dreiTage).length;

  // Landingpage-A/B-Sieger (erster reifer, defensiv über Service-Role).
  let lp: AutopilotInput['lp'] = null;
  try {
    const admin = createAdminClient();
    const { data: lpData } = await admin.from('landingpages').select('id, titel, ab_aktiv').eq('owner_user_id', user.id);
    const abPages = ((lpData ?? []) as Array<{ id: string; titel: string; ab_aktiv: boolean | null }>).filter((p) => p.ab_aktiv);
    if (abPages.length) {
      const ids = abPages.map((p) => p.id);
      const { data: evData } = await admin.from('lp_ereignisse').select('landingpage_id, typ, variante').in('landingpage_id', ids);
      const ev = (evData ?? []) as Array<{ landingpage_id: string | null; typ: string | null; variante: string | null }>;
      for (const p of abPages) {
        const vf = funnelJeVariante(ev.filter((e) => e.landingpage_id === p.id));
        const s = abSieger(vf.A, vf.B);
        if (s.reif && (s.sieger === 'A' || s.sieger === 'B')) { lp = { titel: p.titel, besser: s.sieger }; break; }
      }
    }
  } catch { /* Landingpages optional */ }

  const input: AutopilotInput = {
    leads: { offen, offenAlt },
    ads: { ausgaben: cockpit.ads.ausgaben, roas: cockpit.ads.roas },
    lp,
    kanaele: {
      newsletterAbos: cockpit.newsletter.abonnenten,
      newsletterVersand: cockpit.newsletter.kampagnen,
      socialAktiv: cockpit.social.gesendet > 0 || cockpit.social.kanaele_verbunden > 0,
      socialGeplant: cockpit.social.geplant,
      whatsappKontakte: cockpit.whatsapp.kontakte,
      adsAktiv: cockpit.ads.aktiv > 0 || cockpit.ads.kampagnen > 0,
    },
  };

  const vorschlaege = autopilotVorschlaege(input);
  const zus = autopilotZusammenfassung(vorschlaege);

  return NextResponse.json({ ok: true, vorschlaege, dringend: zus.dringend, gesamt: zus.gesamt });
}
