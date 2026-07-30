import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { vorlagenNameNormalisieren, validiereVorlage } from '@/lib/whatsapp';

// ============================================================================
// ARGONAUT OS · app/api/marketing/whatsapp-vorlagen/route.ts  (WhatsApp P1)
//
// Verwaltung der WhatsApp-Nachrichtenvorlagen durch den Betrieb selbst.
//   GET            -> { liste }
//   POST {..}      -> anlegen/aktualisieren (Status startet als 'entwurf')
//   DELETE ?id=..  -> loeschen
//
// Hinweis: Das Einreichen zur Meta-Freigabe + der Versand kommen in Paket 2,
// sobald der WhatsApp-Zugang (Meta Cloud API / 360dialog) hinterlegt ist.
// Alles hart auf owner_user_id = user.id beschraenkt.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KATEGORIEN = ['marketing', 'utility', 'authentication'];

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: liste } = await admin
    .from('whatsapp_vorlage')
    .select('id, name, kategorie, sprache, inhalt, status, created_at')
    .eq('owner_user_id', uid)
    .order('created_at', { ascending: false });

  return NextResponse.json({ ok: true, liste: liste ?? [] });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const id = (body.id || '').toString().trim() || null;
  const name = vorlagenNameNormalisieren((body.name || '').toString());
  const inhalt = (body.inhalt || '').toString().trim().slice(0, 1024);
  const kategorie = KATEGORIEN.includes((body.kategorie || '').toString()) ? body.kategorie : 'marketing';
  const sprache = (body.sprache || 'de').toString().trim().slice(0, 10) || 'de';

  const pruef = validiereVorlage({ name, inhalt });
  if (!pruef.ok) return NextResponse.json({ ok: false, error: pruef.fehler.join(' ') }, { status: 400 });

  const admin = createAdminClient();
  const felder = { name, inhalt, kategorie, sprache };

  let error;
  let neuId = id;
  if (id) {
    ({ error } = await admin.from('whatsapp_vorlage').update(felder).eq('id', id).eq('owner_user_id', uid));
  } else {
    const { data, error: insErr } = await admin
      .from('whatsapp_vorlage')
      .insert({ ...felder, owner_user_id: uid, status: 'entwurf' })
      .select('id')
      .single();
    error = insErr;
    neuId = (data as { id: string } | null)?.id ?? null;
  }

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: false, error: 'Diesen Vorlagen-Namen gibt es schon. Bitte einen anderen wählen.' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: neuId });
}

export async function DELETE(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const id = (new URL(req.url).searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Keine ID.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('whatsapp_vorlage').delete().eq('id', id).eq('owner_user_id', uid);
  if (error) return NextResponse.json({ ok: false, error: 'Löschen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
