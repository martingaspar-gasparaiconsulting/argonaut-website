import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { telefonNormalisieren, istTelefonPlausibel } from '@/lib/whatsapp';
import { bestaetigungNochGueltig, manuellerNachweis } from '@/lib/whatsappBestaetigung';

// ============================================================================
// ARGONAUT OS · app/api/marketing/whatsapp-kontakte/route.ts  (WhatsApp P2)
//
// Empfänger-Verwaltung durch den Betrieb selbst.
//   GET            -> { liste }
//   POST {..}      -> manuell hinzufügen (Betrieb verantwortet die Einwilligung;
//                     Paket 183: nur mit Häkchen + Angabe, wo sie vorliegt)
//   DELETE ?id=..  -> löschen
// Alles hart auf owner_user_id = Betrieb (beim Mitarbeiter der Chef) beschränkt.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function besitzerId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: chef } = await supabase.rpc('mein_chef_id');
  // B1: owner_user_id ist der Betrieb (beim Mitarbeiter der Chef), nicht die angemeldete Person.
  const besitzer = typeof chef === 'string' && chef ? chef : user.id;
  return besitzer;
}

export async function GET() {
  const besitzer = await besitzerId();
  if (!besitzer) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: liste } = await admin
    .from('whatsapp_kontakt')
    .select('id, telefon, name, status, quelle, einwilligung_am, created_at, bestaetigungs_code, bestaetigung_angefragt_am, bestaetigt_am')
    .eq('owner_user_id', besitzer)
    .order('created_at', { ascending: false });

  // Paket 183: Der Code selbst geht nie an den Browser — nur „wartet ja/nein".
  type Zeile = Record<string, unknown> & { status?: string; bestaetigungs_code?: string | null; bestaetigung_angefragt_am?: string | null };
  const aufbereitet = ((liste ?? []) as Zeile[]).map((z) => {
    const rest: Record<string, unknown> = { ...z };
    delete rest.bestaetigungs_code;
    return {
      ...rest,
      wartet: z.status !== 'aktiv' && !!z.bestaetigungs_code && bestaetigungNochGueltig(z.bestaetigung_angefragt_am ?? null),
    };
  });
  return NextResponse.json({ ok: true, liste: aufbereitet });
}

export async function POST(req: Request) {
  const besitzer = await besitzerId();
  if (!besitzer) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const telefon = telefonNormalisieren((body.telefon || '').toString());
  const name = (body.name || '').toString().trim() || null;
  if (!istTelefonPlausibel(telefon)) return NextResponse.json({ ok: false, error: 'Bitte eine gültige Handynummer eingeben (z. B. +49 170 1234567).' }, { status: 400 });
  const nachweis = manuellerNachweis(body.einwilligungBestaetigt, body.einwilligungNachweis);
  if (!nachweis.ok) return NextResponse.json({ ok: false, error: nachweis.fehler }, { status: 400 });

  const admin = createAdminClient();
  const { data: vorhanden } = await admin
    .from('whatsapp_kontakt')
    .select('id')
    .eq('owner_user_id', besitzer)
    .eq('telefon', telefon)
    .maybeSingle();
  if (vorhanden) return NextResponse.json({ ok: false, error: 'Diese Nummer ist bereits in Ihrer Liste.' }, { status: 409 });

  const { error } = await admin.from('whatsapp_kontakt').insert({
    owner_user_id: besitzer,
    telefon,
    name,
    status: 'aktiv',
    quelle: 'manuell',
    einwilligung_am: new Date().toISOString(),
    einwilligung_text: nachweis.text,
    abmelde_token: randomUUID(),
  });
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const besitzer = await besitzerId();
  if (!besitzer) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const id = (new URL(req.url).searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Keine ID.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('whatsapp_kontakt').delete().eq('id', id).eq('owner_user_id', besitzer);
  if (error) return NextResponse.json({ ok: false, error: 'Löschen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
