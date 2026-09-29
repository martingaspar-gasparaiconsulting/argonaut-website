import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { webhookSchluessel, webhookGrundgeheimnis } from '@/lib/ablaufWebhook';

// ============================================================================
// ARGONAUT OS · /api/ablaeufe/webhook-schluessel — Schlüssel zum Prüfen (Paket 167)
//
// Jeder Webhook eines Ablaufs trägt die Kopfzeile X-Argonaut-Signatur
// (HMAC-SHA256 über „<X-Argonaut-Zeit>.<Inhalt>"). Den Schlüssel dafür trägt
// die Geschäftsleitung beim Empfänger (z. B. n8n) ein. Er wird aus dem
// Server-Geheimnis und der Ablauf-Kennung abgeleitet, steht nirgends in der
// Datenbank und ist nur für den Eigentümer des Ablaufs abrufbar.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: string };
  if (!body.id) return NextResponse.json({ ok: false, error: 'Kein Ablauf gewählt.' }, { status: 400 });
  const { data } = await supabase.from('ablaeufe').select('id, owner_user_id').eq('id', body.id).maybeSingle();
  const a = data as { id: string; owner_user_id: string } | null;
  if (!a) return NextResponse.json({ ok: false, error: 'Ablauf nicht gefunden.' }, { status: 404 });
  if (a.owner_user_id !== user.id) return NextResponse.json({ ok: false, error: 'Nur die Geschäftsleitung.' }, { status: 403 });
  const schluessel = webhookSchluessel(a.id, webhookGrundgeheimnis());
  if (!schluessel) return NextResponse.json({ ok: false, error: 'Auf dem Server fehlt das Geheimnis für Webhooks.' }, { status: 503 });
  return NextResponse.json({ ok: true, schluessel }, { headers: { 'cache-control': 'no-store' } });
}
