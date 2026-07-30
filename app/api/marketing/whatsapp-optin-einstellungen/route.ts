import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

// ============================================================================
// ARGONAUT OS · app/api/marketing/whatsapp-optin-einstellungen/route.ts (WA P2)
//
// Konfiguration des öffentlichen WhatsApp-Anmeldeformulars durch den Betrieb.
//   GET  -> { whatsapp_optin_slug, whatsapp_optin_aktiv, whatsapp_optin_titel, whatsapp_optin_text }
//   POST -> speichern (Slug normalisiert; Doppel-Slug -> 409)
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
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('whatsapp_optin_slug, whatsapp_optin_aktiv, whatsapp_optin_titel, whatsapp_optin_text')
    .eq('id', user.id)
    .maybeSingle();
  const p = (data ?? {}) as {
    whatsapp_optin_slug?: string | null;
    whatsapp_optin_aktiv?: boolean | null;
    whatsapp_optin_titel?: string | null;
    whatsapp_optin_text?: string | null;
  };
  return NextResponse.json({
    ok: true,
    whatsapp_optin_slug: p.whatsapp_optin_slug ?? '',
    whatsapp_optin_aktiv: !!p.whatsapp_optin_aktiv,
    whatsapp_optin_titel: p.whatsapp_optin_titel ?? '',
    whatsapp_optin_text: p.whatsapp_optin_text ?? '',
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Anfragedaten.' }, { status: 400 });

  const slug = slugNormalisieren((body.whatsapp_optin_slug || '').toString());
  const aktiv = body.whatsapp_optin_aktiv === true || body.whatsapp_optin_aktiv === 'true';
  const titel = (body.whatsapp_optin_titel || '').toString().trim().slice(0, 120) || null;
  const text = (body.whatsapp_optin_text || '').toString().trim().slice(0, 600) || null;

  if (aktiv && slug.length < 3) {
    return NextResponse.json({ ok: false, error: 'Bitte einen Link-Namen mit mindestens 3 Zeichen vergeben, um das Formular zu aktivieren.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({
      whatsapp_optin_slug: slug || null,
      whatsapp_optin_aktiv: aktiv,
      whatsapp_optin_titel: titel,
      whatsapp_optin_text: text,
    })
    .eq('id', user.id);

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: false, error: 'Dieser Link-Name ist schon vergeben. Bitte einen anderen wählen.' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, whatsapp_optin_slug: slug, whatsapp_optin_aktiv: aktiv });
}
