// ============================================================================
// ARGONAUT OS · app/api/admin/whatsapp-eingang  (G2 · Betreiber-Einrichtung)
//
// BETREIBER-ENDPUNKT. Die technische WhatsApp-Einrichtung ist NICHT Sache des
// Kunden: der bekommt ARGONAUT fertig und muss weder ein Meta-Konto öffnen
// noch ein App-Secret kopieren. Martin richtet je Betrieb ein, der Kunde sieht
// nur seinen Posteingang.
//
//   GET  ?betrieb=<owner_user_id>  → Stand der Einrichtung für DIESEN Betrieb
//   GET  (ohne betrieb)            → Liste aller Betriebe mit Einrichtungsstand
//   POST { betrieb, neuerToken?, app_secret? } → einrichten
//
// SICHERHEIT — zwei Schlösser, beide müssen aufgehen:
//   1. profiles.role === 'admin'   (wie /api/admin/tenants)
//   2. ANALYSE_BETREIBER_ID        (wie /api/beleg-upload)
//
// Beim zweiten Schloss weiche ich bewusst vom Bestand ab: beleg-upload lässt
// durch, wenn die Umgebungsvariable NICHT gesetzt ist (`if (betreiber && …)`).
// Für einen Endpunkt, der in FREMDE Betriebe schreibt, wäre das zu lasch —
// hier gilt: keine Variable gesetzt, kein Zugriff.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { verschluessele, encKeyBereit } from '@/lib/crypto';
import { baueWebhookToken } from '@/lib/whatsappEingang';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

/** Beide Schlösser. null = erlaubt, sonst die fertige Absage. */
async function betreiberGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });

  const { data: profil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profil || (profil as { role?: string }).role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 });
  }

  // Streng: ohne gesetzte Betreiber-Kennung kommt niemand durch.
  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (!betreiber || user.id !== betreiber) {
    return NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 });
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const gesperrt = await betreiberGuard();
  if (gesperrt) return gesperrt;

  const betrieb = (new URL(req.url).searchParams.get('betrieb') || '').trim();
  const db = adminDb();

  if (betrieb) {
    const { data } = await db
      .from('whatsapp_zugang')
      .select('webhook_token, app_secret_verschluesselt, meta_phone_number_id, verbunden')
      .eq('owner_user_id', betrieb)
      .maybeSingle();
    const z = (data ?? {}) as {
      webhook_token?: string | null;
      app_secret_verschluesselt?: string | null;
      meta_phone_number_id?: string | null;
      verbunden?: boolean | null;
    };
    return NextResponse.json({
      ok: true,
      webhook_token: z.webhook_token ?? '',
      hatAppSecret: !!(z.app_secret_verschluesselt && z.app_secret_verschluesselt.length),
      meta_phone_number_id: z.meta_phone_number_id ?? '',
      verbunden: z.verbunden === true,
      encKeyBereit: encKeyBereit(),
    });
  }

  // Übersicht: alle Betriebe mit ihrem Einrichtungsstand.
  const { data: profile } = await db
    .from('profiles')
    .select('id, firma, company_name, email')
    .order('firma', { ascending: true })
    .limit(500);

  const { data: zugaenge } = await db
    .from('whatsapp_zugang')
    .select('owner_user_id, webhook_token, app_secret_verschluesselt, meta_phone_number_id, verbunden');

  type ZugangRow = {
    owner_user_id: string;
    webhook_token: string | null;
    app_secret_verschluesselt: string | null;
    meta_phone_number_id: string | null;
    verbunden: boolean | null;
  };
  const nachOwner = new Map(((zugaenge as ZugangRow[]) ?? []).map((z) => [z.owner_user_id, z]));

  type ProfilRow = { id: string; firma?: string | null; company_name?: string | null; email?: string | null };
  const betriebe = (((profile as ProfilRow[]) ?? [])).map((p) => {
    const z = nachOwner.get(p.id);
    return {
      id: p.id,
      name: (p.firma || p.company_name || p.email || p.id).toString(),
      hatToken: !!z?.webhook_token,
      hatAppSecret: !!(z?.app_secret_verschluesselt && z.app_secret_verschluesselt.length),
      hatNummer: !!z?.meta_phone_number_id,
      verbunden: z?.verbunden === true,
    };
  });

  return NextResponse.json({ ok: true, betriebe, encKeyBereit: encKeyBereit() });
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const gesperrt = await betreiberGuard();
  if (gesperrt) return gesperrt;

  const body = await req.json().catch(() => null);
  const betrieb = (body?.betrieb || '').toString().trim();
  const neuerToken = body?.neuerToken === true;
  const appSecret = (body?.app_secret || '').toString().trim();

  if (!betrieb) return NextResponse.json({ ok: false, error: 'Kein Betrieb gewählt.' }, { status: 400 });
  if (!neuerToken && !appSecret) {
    return NextResponse.json({ ok: false, error: 'Nichts zu speichern.' }, { status: 400 });
  }
  if (appSecret && !encKeyBereit()) {
    return NextResponse.json(
      { ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt in den Umgebungsvariablen.' },
      { status: 400 },
    );
  }

  const db = adminDb();

  // Gibt es den Betrieb überhaupt? Sonst legen wir Zugänge ins Leere an.
  const { data: p } = await db.from('profiles').select('id').eq('id', betrieb).maybeSingle();
  if (!p) return NextResponse.json({ ok: false, error: 'Betrieb nicht gefunden.' }, { status: 404 });

  const felder: Record<string, string> = {};
  if (neuerToken) felder.webhook_token = baueWebhookToken();
  if (appSecret) {
    try {
      felder.app_secret_verschluesselt = verschluessele(appSecret);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : 'Verschlüsselung fehlgeschlagen.' },
        { status: 500 },
      );
    }
  }

  const { data: vorhanden } = await db
    .from('whatsapp_zugang')
    .select('owner_user_id')
    .eq('owner_user_id', betrieb)
    .maybeSingle();

  let error;
  if (vorhanden) {
    ({ error } = await db.from('whatsapp_zugang').update(felder).eq('owner_user_id', betrieb));
  } else {
    ({ error } = await db.from('whatsapp_zugang').insert({ owner_user_id: betrieb, ...felder }));
  }
  if (error) {
    console.error('admin/whatsapp-eingang:', error.message);
    return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }

  const { data: neu } = await db
    .from('whatsapp_zugang')
    .select('webhook_token, app_secret_verschluesselt')
    .eq('owner_user_id', betrieb)
    .maybeSingle();
  const z = (neu ?? {}) as { webhook_token?: string | null; app_secret_verschluesselt?: string | null };

  return NextResponse.json({
    ok: true,
    webhook_token: z.webhook_token ?? '',
    hatAppSecret: !!(z.app_secret_verschluesselt && z.app_secret_verschluesselt.length),
  });
}
