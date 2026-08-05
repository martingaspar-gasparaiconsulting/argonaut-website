import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, mailLayout } from '@/lib/mail';
import { dossierAusliefernHtml } from '@/lib/dossierMail';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/dossier-bestaetigen  (I4 · DOI-Bestätigung)
// ÖFFENTLICH. GET ?token=.. -> Lead auf 'aktiv' setzen, Dossier an den
// Interessenten senden, Betreiber benachrichtigen, dann zur Dankeseite
// weiterleiten. Service-Role umgeht RLS.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';
const OPERATOR_MAIL = 'info@argonaut-os.com';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: Request) {
  const token = (new URL(req.url).searchParams.get('token') || '').trim();
  if (!token) return NextResponse.redirect(`${BASIS_URL}/dossier?fehler=1`);

  try {
    const db = admin();
    const { data } = await db.from('dossier_leads').select('id, email, name, branche, status').eq('token', token).maybeSingle();
    const l = data as { id: string; email: string; name: string | null; branche: string | null; status: string } | null;
    if (!l) return NextResponse.redirect(`${BASIS_URL}/dossier?fehler=1`);

    if (l.status !== 'aktiv') {
      await db.from('dossier_leads').update({ status: 'aktiv', bestaetigt_am: new Date().toISOString() }).eq('id', l.id);
      // Dossier an den Interessenten
      try { await sendeMail({ an: l.email, betreff: 'Ihr ARGONAUT-Dossier', html: dossierAusliefernHtml(l.name, l.branche) }); } catch {}
      // Betreiber-Benachrichtigung
      try {
        await sendeMail({
          an: OPERATOR_MAIL,
          betreff: `Neuer Dossier-Lead: ${l.email}`,
          html: mailLayout('Neuer Dossier-Lead', `<p><b>${l.email}</b>${l.name ? ' · ' + l.name : ''}${l.branche ? ' · ' + l.branche : ''} hat bestätigt.</p>`),
        });
      } catch {}
    }

    return NextResponse.redirect(`${BASIS_URL}/dossier?bestaetigt=1`);
  } catch {
    return NextResponse.redirect(`${BASIS_URL}/dossier?fehler=1`);
  }
}
