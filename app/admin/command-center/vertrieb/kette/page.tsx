import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import KetteClient from './KetteClient';

// ============================================================================
// ARGONAUT OS · Command Center · vertrieb/kette/page.tsx
//
// Die eigene Vertriebs-Kette: was ging raus, was kam zurueck, was hat es an
// Zeit gekostet. Betreiber-Sicht mit voller Tiefe — die schlanke Kundenfassung
// bleibt der Termin-Wert-Rechner unter /dashboard/marketing/termin-wert.
//
// Dieser Server-Wrapper macht nur die Tuerkontrolle (gleiches Muster wie die
// Vertriebs-Uebersicht daneben). Alles Weitere im Browser, weil die Seite ein
// Eingabeformular ist und die Zeilen ohnehin ueber RLS nur die eigenen sind.
// ============================================================================

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function KettePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin-login');
  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (betreiber && user.id !== betreiber) redirect('/admin');

  return <KetteClient />;
}
