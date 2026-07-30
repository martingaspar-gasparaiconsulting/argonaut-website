import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

// ============================================================================
// ARGONAUT OS · app/api/marketing/optin-einstellungen/route.ts  (Paket 2b)
//
// Konfiguration des oeffentlichen Double-Opt-In-Anmeldeformulars durch den
// Betrieb selbst.
//   GET  -> aktuelle Einstellungen des eingeloggten Kontos
//   POST { optin_slug, optin_aktiv, optin_titel, optin_text } -> speichern
//
// Schreibt gezielt nur die eigene profiles-Zeile (id = user.id) ueber den
// Admin-Client (wie /api/profil). Slug wird normalisiert; Doppel-Slug -> 409.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugNormalisieren(roh: string): string {
  return (roh || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('optin_slug, optin_aktiv, optin_titel, optin_text, optin_sequenz_id')
    .eq('id', user.id)
    .maybeSingle();

  const p = (data ?? {}) as {
    optin_slug?: string | null;
    optin_aktiv?: boolean | null;
    optin_titel?: string | null;
    optin_text?: string | null;
    optin_sequenz_id?: string | null;
  };
  return NextResponse.json({
    ok: true,
    optin_slug: p.optin_slug ?? '',
    optin_aktiv: !!p.optin_aktiv,
    optin_titel: p.optin_titel ?? '',
    optin_text: p.optin_text ?? '',
    optin_sequenz_id: p.optin_sequenz_id ?? '',
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Ungültige Anfragedaten.' }, { status: 400 });
  }

  const slug = slugNormalisieren((body.optin_slug || '').toString());
  const aktiv = body.optin_aktiv === true || body.optin_aktiv === 'true';
  const titel = (body.optin_titel || '').toString().trim().slice(0, 120) || null;
  const text = (body.optin_text || '').toString().trim().slice(0, 600) || null;
  const sequenzId = (body.optin_sequenz_id || '').toString().trim() || null;

  if (aktiv && slug.length < 3) {
    return NextResponse.json(
      { ok: false, error: 'Bitte einen Link-Namen mit mindestens 3 Zeichen (nur Buchstaben, Zahlen, Bindestrich) vergeben, um das Formular zu aktivieren.' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({
      optin_slug: slug || null,
      optin_aktiv: aktiv,
      optin_titel: titel,
      optin_text: text,
      optin_sequenz_id: sequenzId,
    })
    .eq('id', user.id);

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: false, error: 'Dieser Link-Name ist schon vergeben. Bitte einen anderen wählen.' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, optin_slug: slug, optin_aktiv: aktiv, optin_titel: titel ?? '', optin_text: text ?? '', optin_sequenz_id: sequenzId ?? '' });
}
