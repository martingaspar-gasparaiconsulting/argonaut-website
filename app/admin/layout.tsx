import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase-server';

// ============================================================================
// ARGONAUT OS · app/admin/layout.tsx
//
// SERVER-SEITIGES SCHLOSS fuer ALLE /admin/* Seiten (14.07.26).
//
// Vorher: leeres Passthrough (return <>{children}</>) — der eigentliche Schutz
// haing an einer CLIENT-Pruefung gegen NEXT_PUBLIC_ADMIN_EMAIL, also umgehbar
// und mit oeffentlich sichtbarer Admin-Mail.
//
// Jetzt: Dieses Layout laeuft auf dem SERVER, liest die Session aus dem Cookie
// und laesst nur Nutzer mit profiles.role === 'admin' durch. Alle anderen ->
// /admin-login. Diese Login-Seite liegt BEWUSST ausserhalb von /admin, sonst
// wuerde sie sich selbst aussperren (Redirect-Loop).
//
// Damit ist jede aktuelle UND jede kuenftige /admin-Seite automatisch geschuetzt.
// ============================================================================

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/admin-login');

  // Die eigene profiles-Zeile darf der Nutzer per RLS lesen.
  const { data: profil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profil || profil.role !== 'admin') redirect('/admin-login');

  return <>{children}</>;
}
