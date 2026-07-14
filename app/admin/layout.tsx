import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase-server';

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

  const { data: profil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profil || profil.role !== 'admin') redirect('/admin-login');

  return <>{children}</>;
}
