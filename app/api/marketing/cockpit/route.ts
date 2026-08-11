import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { fasseCockpit, wochenReihe, type CockpitVerlauf } from '@/lib/marketingCockpit';

// ============================================================================
// ARGONAUT OS · app/api/marketing/cockpit/route.ts  (Marketing-Cockpit)
//
// GET -> kanalübergreifende Kennzahlen (Newsletter, Social, WhatsApp, Ads, Leads)
// in EINER Antwort + zusätzlich ein 8-Wochen-VERLAUF je Kanal (Sparklines,
// Marketing-Tiefe · Abschnitt 14). Liest je Kanal die Roh-Zeilen über den
// RLS-Client und fasst sie mit fasseCockpit() zusammen. Jede Abfrage ist
// defensiv: fehlt eine Tabelle/Spalte, zeigt der Kanal 0 statt die Seite zu
// brechen. Der Verlauf wird über SEPARATE created_at-Abfragen gebaut — fehlt
// eine created_at-Spalte, bleibt NUR die Sparkline leer, nie die Kennzahl.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

/** Defensive Abfrage: gibt bei Fehler eine leere Liste zurück. */
async function hole(sb: Sb, tabelle: string, spalten: string): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await sb.from(tabelle).select(spalten).limit(5000);
    if (error) return [];
    return (data ?? []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

/** created_at-Werte einer Tabelle (defensiv, nur fürs Sparkline). */
async function holeZeit(sb: Sb, tabelle: string): Promise<unknown[]> {
  const rows = await hole(sb, tabelle, 'created_at');
  return rows.map((r) => r.created_at);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const [
    newsletterAbos, newsletterVersand,
    socialBeitraege, socialKanaele,
    whatsappKontakte, whatsappVersand,
    adsKampagnen, adsErgebnisse,
    leads,
    // --- Zeitreihen (separat, defensiv) ---
    leadsZeit, socialZeit, whatsappZeit, newsletterZeit, adsZeit,
  ] = await Promise.all([
    hole(supabase, 'newsletter_abonnenten', 'status'),
    hole(supabase, 'newsletter_versand', 'erfolg_anzahl'),
    hole(supabase, 'social_beitrag', 'status'),
    hole(supabase, 'social_kanal', 'verbunden'),
    hole(supabase, 'whatsapp_kontakt', 'status'),
    hole(supabase, 'whatsapp_versand', 'status'),
    hole(supabase, 'ads_kampagne', 'status, tagesbudget'),
    hole(supabase, 'ads_ergebnis', 'ausgaben, umsatz, klicks, conversions'),
    hole(supabase, 'leads', 'status, kampagne_id'),
    holeZeit(supabase, 'leads'),
    holeZeit(supabase, 'social_beitrag'),
    holeZeit(supabase, 'whatsapp_versand'),
    holeZeit(supabase, 'newsletter_versand'),
    holeZeit(supabase, 'ads_ergebnis'),
  ]);

  const daten = fasseCockpit({
    newsletterAbos, newsletterVersand,
    socialBeitraege, socialKanaele,
    whatsappKontakte, whatsappVersand,
    adsKampagnen, adsErgebnisse,
    leads,
  });

  const jetztIso = new Date().toISOString();
  const verlauf: Record<string, CockpitVerlauf> = {
    leads: wochenReihe(leadsZeit, jetztIso),
    social: wochenReihe(socialZeit, jetztIso),
    whatsapp: wochenReihe(whatsappZeit, jetztIso),
    newsletter: wochenReihe(newsletterZeit, jetztIso),
    ads: wochenReihe(adsZeit, jetztIso),
  };

  return NextResponse.json({ ok: true, daten, verlauf });
}
