import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { fasseCockpit } from '@/lib/marketingCockpit';
import { lagebericht, lageAmpel, type LageInput } from '@/lib/marketingLagebericht';
import { sendeMail, kundenMailLayout } from '@/lib/mail';
import {
  gruppiereNachOwner, istBerichtenswert, berichtBetreff, berichtInhaltHtml,
  type KpiZeile, type BefundKurz,
} from '@/lib/autoLagebericht';

// ============================================================================
// ARGONAUT OS · app/api/cron/marketing-lagebericht/route.ts
// (Marketing-Ausbau · Punkt 8 — wöchentlicher Auto-Lagebericht)
//
// Läuft wöchentlich (Vercel-Cron, montags). Baut je AKTIVEM Betrieb aus den
// eigenen Daten den Marketing-Lagebericht (fasseCockpit + lagebericht,
// MECHANISCH/0 € KI) und schickt ihn dem Betrieb kundengebrandet per Mail.
// Nur mit CRON_SECRET (oder eingeloggtem Admin). Kein SQL.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function service() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
type ServiceClient = ReturnType<typeof service>;
type Row = Record<string, unknown>;

/** Cron-Secret ODER eingeloggter Admin. Ohne beides: 403. */
async function erlaubt(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    const url = new URL(req.url);
    if (auth === `Bearer ${secret}` || url.searchParams.get('secret') === secret) return true;
  }
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return (p as { role?: string } | null)?.role === 'admin';
}

async function hole(admin: ServiceClient, tabelle: string, spalten: string): Promise<Row[]> {
  try {
    const { data, error } = await admin.from(tabelle).select(spalten).limit(20000);
    if (error) return [];
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

const TAG = 86_400_000;

async function lauf(req: Request) {
  if (!(await erlaubt(req))) return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });

  try {
    const admin = service();

    // Alle Rohdaten einmal holen, dann je Betrieb gruppieren (effizient).
    const [
      profileRoh, leadsRoh, nlAbos, nlVersand, socialBeitraege, socialKanaele,
      waKontakte, waVersand, adsKampagnen, adsErgebnisse,
    ] = await Promise.all([
      hole(admin, 'profiles', 'id, firma_name, firma_email, firma_akzentfarbe, email'),
      hole(admin, 'leads', 'owner_user_id, status, kampagne_id, quelle, created_at'),
      hole(admin, 'newsletter_abonnenten', 'owner_user_id, status'),
      hole(admin, 'newsletter_versand', 'owner_user_id, erfolg_anzahl'),
      hole(admin, 'social_beitrag', 'owner_user_id, status'),
      hole(admin, 'social_kanal', 'owner_user_id, verbunden'),
      hole(admin, 'whatsapp_kontakt', 'owner_user_id, status'),
      hole(admin, 'whatsapp_versand', 'owner_user_id, status'),
      hole(admin, 'ads_kampagne', 'owner_user_id, status, tagesbudget'),
      hole(admin, 'ads_ergebnis', 'owner_user_id, ausgaben, umsatz, klicks, conversions'),
    ]);

    const gLeads = gruppiereNachOwner(leadsRoh);
    const gNlAbos = gruppiereNachOwner(nlAbos);
    const gNlVersand = gruppiereNachOwner(nlVersand);
    const gSocialB = gruppiereNachOwner(socialBeitraege);
    const gSocialK = gruppiereNachOwner(socialKanaele);
    const gWaK = gruppiereNachOwner(waKontakte);
    const gWaV = gruppiereNachOwner(waVersand);
    const gAdsK = gruppiereNachOwner(adsKampagnen);
    const gAdsE = gruppiereNachOwner(adsErgebnisse);

    // Nur Betriebe mit irgendwelchen Daten betrachten.
    const ownerIds = new Set<string>();
    for (const m of [gLeads, gNlAbos, gSocialB, gWaK, gAdsK]) for (const k of m.keys()) ownerIds.add(k);

    const profilVon = new Map<string, Row>();
    for (const p of profileRoh) profilVon.set(String(p.id), p);

    const jetzt = Date.now();
    const woche = 7 * TAG;
    const zeit = (v: unknown) => { const t = new Date(String(v ?? '')).getTime(); return Number.isFinite(t) ? t : 0; };
    const schwereRang: Record<string, number> = { warnung: 0, hinweis: 1, gut: 2 };

    let gesendet = 0, uebersprungenInaktiv = 0, ohneEmail = 0, fehler = 0;

    const aufgaben = [...ownerIds].slice(0, 500).map(async (owner) => {
      const leadsO = gLeads.get(owner) || [];

      const cockpit = fasseCockpit({
        newsletterAbos: gNlAbos.get(owner) || [],
        newsletterVersand: gNlVersand.get(owner) || [],
        socialBeitraege: gSocialB.get(owner) || [],
        socialKanaele: gSocialK.get(owner) || [],
        whatsappKontakte: gWaK.get(owner) || [],
        whatsappVersand: gWaV.get(owner) || [],
        adsKampagnen: gAdsK.get(owner) || [],
        adsErgebnisse: gAdsE.get(owner) || [],
        leads: leadsO,
      });

      // Nur berichten, wenn überhaupt Aktivität da ist.
      if (!istBerichtenswert({
        leads: cockpit.leads.gesamt, adsKampagnen: cockpit.ads.kampagnen,
        newsletterAbos: cockpit.newsletter.abonnenten, socialBeitraege: cockpit.social.beitraege,
        whatsappKontakte: cockpit.whatsapp.kontakte,
      })) { uebersprungenInaktiv++; return; }

      const profil = profilVon.get(owner) || {};
      const email = (typeof profil.firma_email === 'string' && profil.firma_email.trim())
        || (typeof profil.email === 'string' && profil.email.trim()) || '';
      if (!email) { ohneEmail++; return; }
      const firma = (typeof profil.firma_name === 'string' && profil.firma_name.trim()) || 'Ihr Betrieb';
      const akzent = typeof profil.firma_akzentfarbe === 'string' ? profil.firma_akzentfarbe : null;

      // Lead-Details für den Bericht.
      const dieseWoche = leadsO.filter((l) => { const t = zeit(l.created_at); return t > jetzt - woche && t <= jetzt; }).length;
      const vorWoche = leadsO.filter((l) => { const t = zeit(l.created_at); return t > jetzt - 2 * woche && t <= jetzt - woche; }).length;
      const jeQuelle: Record<string, number> = {};
      for (const l of leadsO) {
        const q = (typeof l.quelle === 'string' && l.quelle.trim()) ? l.quelle.trim() : 'Direkt/Unbekannt';
        jeQuelle[q] = (jeQuelle[q] || 0) + 1;
      }

      const input: LageInput = {
        ads: cockpit.ads,
        leads: {
          gesamt: cockpit.leads.gesamt, neu: cockpit.leads.neu, ausKampagne: cockpit.leads.ausKampagne,
          dieseWoche, vorWoche, jeQuelle,
        },
        kanaele: {
          newsletterAbos: cockpit.newsletter.abonnenten,
          socialAktiv: cockpit.social.gesendet > 0 || cockpit.social.kanaele_verbunden > 0,
          whatsappKontakte: cockpit.whatsapp.kontakte,
          adsAktiv: cockpit.ads.aktiv > 0 || cockpit.ads.kampagnen > 0,
        },
        lp: null, web: null,
      };

      const befunde = lagebericht(input);
      const schwere = lageAmpel(befunde);
      const ampelKey = schwere === 'warnung' ? 'rot' : schwere === 'hinweis' ? 'gelb' : 'gruen';

      const kpis: KpiZeile[] = [
        { label: 'Leads gesamt', wert: String(cockpit.leads.gesamt) },
        { label: 'Diese Woche', wert: String(dieseWoche) },
        { label: 'Aktive Kanäle', wert: `${cockpit.gesamt.aktive_kanaele}/4` },
      ];
      if (cockpit.ads.ausgaben > 0) {
        kpis.push({ label: 'Werbe-ROAS', wert: cockpit.ads.roas != null ? `${cockpit.ads.roas.toLocaleString('de-DE')}×` : '—' });
      }

      const befundeKurz: BefundKurz[] = [...befunde]
        .sort((a, b) => (schwereRang[a.schwere] ?? 9) - (schwereRang[b.schwere] ?? 9))
        .slice(0, 4)
        .map((b) => ({ titel: b.kennzahl ? `${b.titel} (${b.kennzahl})` : b.titel, text: b.text }));

      const inhalt = berichtInhaltHtml({ ampel: ampelKey, kpis, befunde: befundeKurz });
      const html = kundenMailLayout(firma, akzent, 'Marketing-Wochenbericht', inhalt);

      const r = await sendeMail({
        an: email,
        betreff: berichtBetreff(firma),
        html,
        absenderName: firma,
        antwortAn: (typeof profil.firma_email === 'string' && profil.firma_email.trim()) || undefined,
      });
      if (r.ok) gesendet++; else fehler++;
    });

    await Promise.all(aufgaben);

    return NextResponse.json({
      ok: true, betriebeMitDaten: ownerIds.size, gesendet, uebersprungenInaktiv, ohneEmail, fehler,
    });
  } catch (e) {
    console.error('[marketing-lagebericht] fehlgeschlagen:', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Fehler' }, { status: 500 });
  }
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
