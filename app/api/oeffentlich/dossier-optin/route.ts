import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sendeMail } from '@/lib/mail';
import { emailNormalisieren, istEmailGueltig } from '@/lib/newsletter';
import { dossierBestaetigenHtml, dossierAusliefernHtml } from '@/lib/dossierMail';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/dossier-optin  (I4 · Double-Opt-In)
// ÖFFENTLICH. POST { email, name?, branche? } -> Lead 'unbestaetigt' anlegen +
// Bestätigungsmail. Erst nach Klick (dossier-bestaetigen) wird er 'aktiv' und
// bekommt das Dossier. Service-Role umgeht RLS.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = emailNormalisieren(body?.email);
    const name = (body?.name || '').toString().trim() || null;
    const branche = (body?.branche || '').toString().trim() || null;
    if (!istEmailGueltig(email)) {
      return NextResponse.json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }, { status: 400 });
    }

    const db = admin();
    const { data: vorhanden } = await db.from('dossier_leads').select('id, status').eq('email', email).maybeSingle();
    const v = vorhanden as { id: string; status: string } | null;

    // Schon bestätigt -> Dossier direkt (nochmal) senden, keine neue DOI-Mail.
    if (v && v.status === 'aktiv') {
      await sendeMail({ an: email, betreff: 'Ihr ARGONAUT-Dossier', html: dossierAusliefernHtml(name, branche) });
      return NextResponse.json({ ok: true, status: 'bereits' });
    }

    const token = randomUUID();
    if (v) {
      await db.from('dossier_leads').update({ status: 'unbestaetigt', token, name, branche, bestaetigt_am: null }).eq('id', v.id);
    } else {
      await db.from('dossier_leads').insert({ email, name, branche, status: 'unbestaetigt', token, quelle: 'dossier' });
    }

    const url = `${BASIS_URL}/api/oeffentlich/dossier-bestaetigen?token=${token}`;
    await sendeMail({ an: email, betreff: 'Bitte bestätige deine Anfrage — ARGONAUT OS', html: dossierBestaetigenHtml(name, url) });

    return NextResponse.json({ ok: true, status: 'bestaetigung_gesendet' });
  } catch {
    return NextResponse.json({ ok: false, error: 'Anfrage fehlgeschlagen. Bitte später erneut versuchen.' }, { status: 500 });
  }
}
