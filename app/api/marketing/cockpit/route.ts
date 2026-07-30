import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { fasseCockpit } from '@/lib/marketingCockpit';

// ============================================================================
// ARGONAUT OS · app/api/marketing/cockpit/route.ts  (Marketing-Cockpit)
//
// GET -> kanalübergreifende Kennzahlen (Newsletter, Social, WhatsApp, Ads, Leads)
// in EINER Antwort. Liest je Kanal die Roh-Zeilen über den RLS-Client (der
// Betrieb sieht automatisch nur die eigenen bzw. die des Chefs) und fasst sie
// mit fasseCockpit() zusammen. Jede Abfrage ist defensiv: fehlt eine Tabelle/
// Spalte in einem Konto, zeigt der Kanal 0 statt die ganze Seite zu brechen.
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
  ]);

  const daten = fasseCockpit({
    newsletterAbos, newsletterVersand,
    socialBeitraege, socialKanaele,
    whatsappKontakte, whatsappVersand,
    adsKampagnen, adsErgebnisse,
    leads,
  });

  return NextResponse.json({ ok: true, daten });
}
