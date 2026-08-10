import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sendeMail, mailLayout } from '@/lib/mail';
import { dossierAusliefernHtml } from '@/lib/dossierMail';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/dossier-bestaetigen  (I4 · DOI-Bestätigung)
// ÖFFENTLICH. GET ?token=.. -> Lead auf 'aktiv' setzen, Dossier senden, Betreiber
// benachrichtigen, dann zur Dankeseite. Bei quelle='test' zusätzlich die
// 7-Tage-Test-Nachfass-Strecke starten (seq_* Felder). Service-Role umgeht RLS.
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
    const { data } = await db.from('dossier_leads').select('id, email, name, branche, status, quelle').eq('token', token).maybeSingle();
    const l = data as { id: string; email: string; name: string | null; branche: string | null; status: string; quelle: string | null } | null;
    if (!l) return NextResponse.redirect(`${BASIS_URL}/dossier?fehler=1`);

    if (l.status !== 'aktiv') {
      // Basis: Lead aktiv setzen.
      const update: Record<string, unknown> = { status: 'aktiv', bestaetigt_am: new Date().toISOString() };

      // Test-Lead -> 7-Tage-Nachfass-Strecke starten (Tag 0 fällig ab jetzt).
      if (l.quelle === 'test') {
        update.seq_quelle = 'test';
        update.seq_status = 'aktiv';
        update.seq_schritt = 0;
        update.seq_naechster_am = new Date().toISOString();
        update.abmelde_token = randomUUID();
      }

      await db.from('dossier_leads').update(update).eq('id', l.id);

      // Dossier an den Interessenten
      try { await sendeMail({ an: l.email, betreff: 'Ihr ARGONAUT-Dossier', html: dossierAusliefernHtml(l.name, l.branche) }); } catch {}
      // Betreiber-Benachrichtigung
      try {
        await sendeMail({
          an: OPERATOR_MAIL,
          betreff: `Neuer Dossier-Lead: ${l.email}`,
          html: mailLayout('Neuer Dossier-Lead', `<p><b>${l.email}</b>${l.name ? ' · ' + l.name : ''}${l.branche ? ' · ' + l.branche : ''}${l.quelle ? ' · Quelle: ' + l.quelle : ''} hat bestätigt.</p>`),
        });
      } catch {}
    }

    return NextResponse.redirect(`${BASIS_URL}/dossier?bestaetigt=1`);
  } catch {
    return NextResponse.redirect(`${BASIS_URL}/dossier?fehler=1`);
  }
}
