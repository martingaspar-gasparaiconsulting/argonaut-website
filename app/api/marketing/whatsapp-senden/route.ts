import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele, encKeyBereit } from '@/lib/crypto';
import { anbieterFuer } from '@/lib/whatsapp';
import { verschickeKampagne, type WaAnbieter, type SendeKontakt } from '@/lib/whatsappVersand';

// ============================================================================
// ARGONAUT OS · app/api/marketing/whatsapp-senden/route.ts  (WhatsApp P3b)
//
// POST { vorlage_id } -> verschickt die Vorlage an alle AKTIVEN Empfänger des
// Betriebs über den hinterlegten Zugang (Meta/360dialog) und protokolliert.
//
// Voraussetzungen: Zugang verbunden, Vorlage vorhanden, kein Demo-Konto.
// Der Token wird serverseitig entschlüsselt; er verlässt den Server nie.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAP = 500;

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const vorlageId = (body?.vorlage_id || '').toString().trim();
  if (!vorlageId) return NextResponse.json({ ok: false, error: 'Keine Vorlage angegeben.' }, { status: 400 });

  const admin = createAdminClient();

  // Konto-Kontext: Anbieter + Demo-Status.
  const { data: prof } = await admin.from('profiles').select('whatsapp_anbieter, demo').eq('id', uid).maybeSingle();
  const p = (prof ?? {}) as { whatsapp_anbieter?: string | null; demo?: boolean | null };
  if (p.demo) return NextResponse.json({ ok: false, error: 'Im Demo-Konto ist der WhatsApp-Versand deaktiviert.' }, { status: 400 });
  const anbieter = anbieterFuer(p.whatsapp_anbieter);
  if (!anbieter) return NextResponse.json({ ok: false, error: 'Bitte zuerst einen Anbieter wählen.' }, { status: 400 });

  // Vorlage laden (owner-geschützt).
  const { data: vor } = await admin
    .from('whatsapp_vorlage')
    .select('id, name, sprache, inhalt')
    .eq('id', vorlageId)
    .eq('owner_user_id', uid)
    .maybeSingle();
  const vorlage = vor as { id: string; name: string; sprache: string | null; inhalt: string } | null;
  if (!vorlage) return NextResponse.json({ ok: false, error: 'Vorlage nicht gefunden.' }, { status: 404 });

  // Zugang laden + Token entschlüsseln.
  const { data: zug } = await admin
    .from('whatsapp_zugang')
    .select('meta_phone_number_id, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid)
    .maybeSingle();
  const z = zug as { meta_phone_number_id: string | null; token_verschluesselt: string | null; verbunden: boolean | null } | null;
  if (!z || z.verbunden !== true || !z.token_verschluesselt) {
    return NextResponse.json({ ok: false, error: 'Kein verbundener WhatsApp-Zugang. Bitte zuerst verbinden.' }, { status: 400 });
  }
  if (!encKeyBereit()) return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt.' }, { status: 400 });

  let token: string;
  try { token = entschluessele(z.token_verschluesselt); }
  catch { return NextResponse.json({ ok: false, error: 'Zugang konnte nicht entschlüsselt werden. Bitte neu verbinden.' }, { status: 500 }); }
  if (!token) return NextResponse.json({ ok: false, error: 'Kein Zugangs-Token hinterlegt. Bitte neu verbinden.' }, { status: 400 });

  // Aktive Empfänger.
  const { data: kData } = await admin
    .from('whatsapp_kontakt')
    .select('id, telefon, name')
    .eq('owner_user_id', uid)
    .eq('status', 'aktiv');
  const kontakte = (kData ?? []) as SendeKontakt[];
  if (kontakte.length === 0) return NextResponse.json({ ok: false, error: 'Keine aktiven Empfänger vorhanden.' }, { status: 400 });

  const ergebnis = await verschickeKampagne(admin, {
    ownerId: uid,
    anbieter: anbieter.id as WaAnbieter,
    phoneNumberId: z.meta_phone_number_id,
    token,
    vorlage,
    kontakte,
    cap: CAP,
  });

  return NextResponse.json({ ok: true, ...ergebnis, empfaenger: kontakte.length });
}
