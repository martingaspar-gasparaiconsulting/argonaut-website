// ============================================================================
// ARGONAUT OS · app/api/marketing/whatsapp-posteingang  (G2 · Push 2)
//
//   GET  → die Gespräche: je Kontakt die letzte Nachricht, ungelesene Anzahl
//          und der Stand des 24-Stunden-Fensters
//   GET  ?kontakt=<id> → der Verlauf eines Gesprächs (und markiert ihn gelesen)
//   POST → eine Freitext-Antwort senden
//
// Die Antwort geht NUR raus, wenn das Fenster offen ist. WhatsApp nimmt
// Freitext ausschliesslich innerhalb von 24 Stunden nach der letzten
// Kundennachricht an — danach braucht es eine freigegebene Vorlage. Wir
// prüfen das VOR dem Senden und sagen es im Klartext, statt den Betrieb in
// einen Fehler von Meta laufen zu lassen.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele } from '@/lib/crypto';
import { fensterStand } from '@/lib/whatsappEingang';
import { versandEndpoint, versandHeaders, baueTextPayload, sendeEineNachricht, type WaAnbieter } from '@/lib/whatsappVersand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ANTWORT = 4096;

async function userId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

type NachrichtRow = {
  id: string;
  kontakt_id: string | null;
  telefon: string;
  richtung: string;
  art: string;
  text: string | null;
  status: string;
  empfangen_am: string;
};

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const kontaktId = (new URL(req.url).searchParams.get('kontakt') || '').trim();
  const admin = createAdminClient();

  // --- ein einzelnes Gespräch ---------------------------------------------
  if (kontaktId) {
    const { data } = await admin
      .from('whatsapp_nachricht')
      .select('id, kontakt_id, telefon, richtung, art, text, status, empfangen_am')
      .eq('owner_user_id', uid)
      .eq('kontakt_id', kontaktId)
      .order('empfangen_am', { ascending: true })
      .limit(200);
    const verlauf = (data as NachrichtRow[]) ?? [];

    // Beim Öffnen gilt das Gespräch als gelesen.
    await admin
      .from('whatsapp_nachricht')
      .update({ status: 'gelesen', gelesen_am: new Date().toISOString() })
      .eq('owner_user_id', uid)
      .eq('kontakt_id', kontaktId)
      .eq('richtung', 'ein')
      .eq('status', 'neu');

    const letzteEin = [...verlauf].reverse().find((n) => n.richtung === 'ein');
    const { data: kd } = await admin
      .from('whatsapp_kontakt')
      .select('id, name, telefon, status')
      .eq('owner_user_id', uid)
      .eq('id', kontaktId)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      kontakt: kd ?? null,
      verlauf,
      fenster: fensterStand(letzteEin?.empfangen_am ?? null),
    });
  }

  // --- die Übersicht -------------------------------------------------------
  const { data } = await admin
    .from('whatsapp_nachricht')
    .select('id, kontakt_id, telefon, richtung, art, text, status, empfangen_am')
    .eq('owner_user_id', uid)
    .order('empfangen_am', { ascending: false })
    .limit(500);
  const alle = (data as NachrichtRow[]) ?? [];

  // Je Kontakt: die neueste Nachricht gewinnt (die Liste kommt absteigend).
  type Gespraech = {
    kontaktId: string | null;
    telefon: string;
    name: string;
    letzterText: string;
    letzteRichtung: string;
    letzteZeit: string;
    ungelesen: number;
    letzteKundennachricht: string | null;
  };
  const nachSchluessel = new Map<string, Gespraech>();

  for (const n of alle) {
    const schluessel = n.kontakt_id || n.telefon;
    let g = nachSchluessel.get(schluessel);
    if (!g) {
      g = {
        kontaktId: n.kontakt_id,
        telefon: n.telefon,
        name: '',
        letzterText: n.text || `[${n.art}]`,
        letzteRichtung: n.richtung,
        letzteZeit: n.empfangen_am,
        ungelesen: 0,
        letzteKundennachricht: null,
      };
      nachSchluessel.set(schluessel, g);
    }
    if (n.richtung === 'ein') {
      if (n.status === 'neu') g.ungelesen++;
      if (!g.letzteKundennachricht) g.letzteKundennachricht = n.empfangen_am;
    }
  }

  // Namen in EINER Abfrage nachziehen, statt je Gespräch einzeln.
  const ids = [...nachSchluessel.values()].map((g) => g.kontaktId).filter((x): x is string => !!x);
  if (ids.length) {
    const { data: kd } = await admin
      .from('whatsapp_kontakt')
      .select('id, name')
      .eq('owner_user_id', uid)
      .in('id', ids);
    const namen = new Map((((kd as { id: string; name: string | null }[]) ?? [])).map((k) => [k.id, k.name || '']));
    for (const g of nachSchluessel.values()) {
      if (g.kontaktId) g.name = namen.get(g.kontaktId) || '';
    }
  }

  const gespraeche = [...nachSchluessel.values()].map((g) => ({
    ...g,
    fenster: fensterStand(g.letzteKundennachricht),
  }));

  return NextResponse.json({
    ok: true,
    gespraeche,
    ungelesenGesamt: gespraeche.reduce((s, g) => s + g.ungelesen, 0),
  });
}

// ---------------------------------------------------------------------------
// POST · antworten
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const kontaktId = (body?.kontaktId || '').toString().trim();
  const text = (body?.text || '').toString().trim().slice(0, MAX_ANTWORT);
  if (!kontaktId || !text) {
    return NextResponse.json({ ok: false, error: 'Bitte einen Text eingeben.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Gehört der Kontakt wirklich zu diesem Betrieb?
  const { data: kd } = await admin
    .from('whatsapp_kontakt')
    .select('id, telefon, name')
    .eq('owner_user_id', uid)
    .eq('id', kontaktId)
    .maybeSingle();
  const kontakt = kd as { id: string; telefon: string; name: string | null } | null;
  if (!kontakt?.telefon) {
    return NextResponse.json({ ok: false, error: 'Empfänger nicht gefunden.' }, { status: 404 });
  }

  // Das Fenster. Ohne offene Tür geht kein Freitext hinaus — das sagen wir
  // vorher, statt Meta einen Fehler schicken zu lassen.
  const { data: letzte } = await admin
    .from('whatsapp_nachricht')
    .select('empfangen_am')
    .eq('owner_user_id', uid)
    .eq('kontakt_id', kontaktId)
    .eq('richtung', 'ein')
    .order('empfangen_am', { ascending: false })
    .limit(1)
    .maybeSingle();
  const fenster = fensterStand((letzte as { empfangen_am?: string } | null)?.empfangen_am ?? null);
  if (!fenster.offen) {
    return NextResponse.json({
      ok: false,
      fenster,
      error: 'Das 24-Stunden-Fenster ist geschlossen. Eine freie Antwort lässt WhatsApp jetzt nicht mehr zu — hier hilft nur noch eine freigegebene Vorlage.',
    }, { status: 409 });
  }

  // Zugang holen und Token entschlüsseln.
  const { data: prof } = await admin.from('profiles').select('whatsapp_anbieter').eq('id', uid).maybeSingle();
  const anbieter = ((prof as { whatsapp_anbieter?: string } | null)?.whatsapp_anbieter || 'meta') as WaAnbieter;

  const { data: zug } = await admin
    .from('whatsapp_zugang')
    .select('meta_phone_number_id, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid)
    .maybeSingle();
  const z = zug as { meta_phone_number_id?: string | null; token_verschluesselt?: string | null; verbunden?: boolean } | null;
  if (!z?.verbunden || !z.token_verschluesselt) {
    return NextResponse.json({ ok: false, error: 'Der WhatsApp-Zugang ist nicht verbunden.' }, { status: 400 });
  }

  let token = '';
  try {
    token = entschluessele(z.token_verschluesselt);
  } catch {
    return NextResponse.json({ ok: false, error: 'Der hinterlegte Zugang lässt sich nicht lesen. Bitte neu verbinden.' }, { status: 500 });
  }
  if (!token) return NextResponse.json({ ok: false, error: 'Kein Zugangs-Token hinterlegt.' }, { status: 400 });

  const r = await sendeEineNachricht(
    anbieter,
    versandEndpoint(anbieter, z.meta_phone_number_id),
    versandHeaders(anbieter, token),
    baueTextPayload(kontakt.telefon, text),
  );

  // Auch die eigene Antwort gehört ins Gespräch — sonst steht dort nur
  // die halbe Unterhaltung.
  await admin.from('whatsapp_nachricht').insert({
    owner_user_id: uid,
    kontakt_id: kontaktId,
    telefon: kontakt.telefon,
    richtung: 'aus',
    art: 'text',
    text,
    provider_id: r.id,
    status: r.ok ? 'gesendet' : 'fehler',
    empfangen_am: new Date().toISOString(),
  });

  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.fehler || 'Senden fehlgeschlagen.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, fenster });
}
