import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase-server';
import { zweiFaktorStand } from '../../lib/zweiFaktorServer';
import { pflichtAn } from '../../lib/zweiFaktor';

// ============================================================================
// ARGONAUT OS · app/admin/layout.tsx
//
// SERVER-SEITIGES SCHLOSS fuer ALLE /admin/* Seiten (14.07.26).
// Nur eingeloggte Nutzer mit profiles.role === 'admin' kommen durch,
// alle anderen -> /admin-login (liegt bewusst ausserhalb von /admin).
//
// WICHTIG (Haertung 14.07.26 nach Live-Gegentest):
//   force-dynamic + revalidate=0 erzwingen, dass dieses Layout bei JEDER
//   Anfrage serverseitig laeuft. Ohne das hat Next.js die Command-Center-
//   Seite (eine Client-Komponente) als statisches HTML vorgebacken und am
//   Tuersteher vorbei aus dem Cache ausgeliefert — die leere Huelle war so
//   ohne Login erreichbar. Mit force-dynamic wird die Auth-Pruefung pro
//   Request ausgefuehrt, ein Direkt-URL-Aufruf ohne Admin-Session landet
//   sofort auf /admin-login.
// ============================================================================

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/admin-login');

  // Paket 164: mit eingerichtetem zweiten Faktor nur nach Code-Eingabe (aal2); bei Pflicht (Stufe 2) ohne Faktor zur Einrichtung.
  {
    const { weg } = await zweiFaktorStand(supabase, user, pflichtAn(process.env));
    if (weg === 'pruefen') redirect('/auth/zwei-faktor?weiter=/admin/command-center');
    if (weg === 'einrichten') redirect('/auth/zwei-faktor/einrichten?weiter=/admin/command-center');
  }

  const { data: profil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profil || profil.role !== 'admin') redirect('/admin-login');

  return <>{children}</>;
}
