// ============================================================================
// ARGONAUT OS · app/api/whatsapp/webhook  (G2 · WhatsApp hört zu — Push 1)
//
// ÖFFENTLICH und login-frei: Meta ruft diese Adresse auf, wenn ein Kunde dem
// Betrieb schreibt. Bis heute gab es diesen Eingang nicht — der Versand stand,
// die Antwort des Kunden kam nirgends an.
//
//   GET   → der Einrichtungs-Handschlag (hub.challenge zurückgeben)
//   POST  → eingehende Nachrichten prüfen, zuordnen, speichern
//
// EINE Adresse für alle Betriebe. Die Zuordnung läuft über die
// `phone_number_id` aus der Nutzlast, nicht über die URL — Meta erlaubt je App
// nur EINE Webhook-Adresse, und 360dialog-Kunden tragen dieselbe ein.
//
// Drei Dinge, die hier nicht verhandelbar sind:
//   1. Die Signatur wird gegen den ROHEN Body geprüft. Wer erst parst und
//      wieder serialisiert, zerstört sie.
//   2. Wir antworten IMMER mit 200 — auch wenn wir nichts tun konnten. Ein
//      Fehlercode lässt Meta dieselbe Nachricht stunden lang erneut zustellen.
//   3. Doppelte werden über die Meta-Kennung abgefangen. Mehrfachzustellung
//      ist bei Webhooks der Normalfall, nicht die Ausnahme.
//
// Prüfbar OHNE Meta: ein nachgestellter Aufruf mit selbst gerechneter Signatur
// genügt (siehe tests/whatsappEingang.test.mjs für die Signaturbildung).
// ============================================================================

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele } from '@/lib/crypto';
import { signaturGueltig, pruefeEinrichtung, leseEingang } from '@/lib/whatsappEingang';
import { telefonNormalisieren } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Meta akzeptiert nur 200. Alles andere heisst „nochmal schicken". */
function still(): Response {
  return new Response('OK', { status: 200 });
}

// ---------------------------------------------------------------------------
// GET · Einrichtung
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const token = (p.get('hub.verify_token') || '').trim();
  if (!token) return new Response('Fehlender Token.', { status: 403 });

  try {
    const db = createAdminClient();
    // Welcher Betrieb hat genau diesen Token hinterlegt?
    const { data } = await db
      .from('whatsapp_zugang')
      .select('owner_user_id, webhook_token')
      .eq('webhook_token', token)
      .maybeSingle();
    const z = data as { owner_user_id?: string; webhook_token?: string } | null;
    if (!z?.webhook_token) return new Response('Unbekannter Token.', { status: 403 });

    const antwort = pruefeEinrichtung(
      { mode: p.get('hub.mode'), token, challenge: p.get('hub.challenge') },
      z.webhook_token,
    );
    if (antwort === null) return new Response('Abgelehnt.', { status: 403 });

    // Meta erwartet die challenge als reinen Text, ohne Anführungszeichen.
    return new Response(antwort, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  } catch (e) {
    console.error('whatsapp/webhook GET:', e instanceof Error ? e.message : e);
    return new Response('Fehler.', { status: 403 });
  }
}

// ---------------------------------------------------------------------------
// POST · eingehende Nachrichten
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // Der rohe Text — exakt so, wie er ankam. Danach erst parsen.
  let roh = '';
  try {
    roh = await req.text();
  } catch {
    return still();
  }
  if (!roh) return still();

  let nutzlast: unknown = null;
  try {
    nutzlast = JSON.parse(roh);
  } catch {
    return still();
  }

  const nachrichten = leseEingang(nutzlast);
  if (nachrichten.length === 0) return still();   // Statusmeldung o. Ä.

  const phoneNumberId = nachrichten[0]?.phoneNumberId ?? '';
  if (!phoneNumberId) return still();

  try {
    const db = createAdminClient();

    // Zu welchem Betrieb gehört diese Nummer?
    const { data: zug } = await db
      .from('whatsapp_zugang')
      .select('owner_user_id, app_secret_verschluesselt')
      .eq('meta_phone_number_id', phoneNumberId)
      .maybeSingle();
    const z = zug as { owner_user_id?: string; app_secret_verschluesselt?: string | null } | null;
    if (!z?.owner_user_id) {
      console.warn('whatsapp/webhook: unbekannte phone_number_id', phoneNumberId);
      return still();
    }
    const ownerId = z.owner_user_id;

    // Signatur. Ohne hinterlegtes App-Secret wird NICHTS gespeichert — sonst
    // könnte jeder, der die Adresse kennt, Nachrichten in fremde Postfächer
    // schreiben. Lieber ein leerer Posteingang als ein untergeschobener.
    let appSecret = '';
    try {
      appSecret = entschluessele(z.app_secret_verschluesselt);
    } catch {
      appSecret = '';
    }
    if (!appSecret) {
      console.warn('whatsapp/webhook: kein App-Secret hinterlegt für', ownerId);
      return still();
    }
    if (!signaturGueltig(roh, req.headers.get('x-hub-signature-256'), appSecret)) {
      console.warn('whatsapp/webhook: Signatur passt nicht für', ownerId);
      return still();
    }

    for (const n of nachrichten) {
      const telefon = telefonNormalisieren(n.von);
      if (!telefon) continue;

      // Kontakt suchen oder anlegen. Wer schreibt, ist ein Kontakt — die
      // Marketing-Einwilligung ist davon unberührt und bleibt bei 'unbekannt'.
      let kontaktId: string | null = null;
      const { data: vorhanden } = await db
        .from('whatsapp_kontakt')
        .select('id, name')
        .eq('owner_user_id', ownerId)
        .eq('telefon', telefon)
        .maybeSingle();
      const k = vorhanden as { id?: string; name?: string | null } | null;

      if (k?.id) {
        kontaktId = k.id;
        // Namen nachtragen, wenn wir bisher keinen hatten.
        if (n.name && !(k.name || '').trim()) {
          await db.from('whatsapp_kontakt').update({ name: n.name }).eq('id', k.id);
        }
      } else {
        const { data: neu } = await db
          .from('whatsapp_kontakt')
          .insert({
            owner_user_id: ownerId,
            telefon,
            name: n.name || null,
            status: 'unbekannt',
            quelle: 'eingehend',
          })
          .select('id')
          .maybeSingle();
        kontaktId = (neu as { id?: string } | null)?.id ?? null;
      }

      // Speichern. Der eindeutige Index auf provider_id fängt Doppelte ab —
      // Meta stellt bei Zweifeln mehrfach zu, und das ist normal.
      const { error } = await db.from('whatsapp_nachricht').insert({
        owner_user_id: ownerId,
        kontakt_id: kontaktId,
        telefon,
        richtung: 'ein',
        art: n.art,
        text: n.text,
        provider_id: n.providerId,
        empfangen_am: n.zeitpunktIso,
      });
      if (error && error.code !== '23505') {
        console.error('whatsapp/webhook Speichern:', error.message);
      }
    }
  } catch (e) {
    console.error('whatsapp/webhook POST:', e instanceof Error ? e.message : e);
  }

  return still();
}

/** Kein Preflight nötig — Meta ruft serverseitig auf. Nur der Vollständigkeit. */
export async function OPTIONS() {
  return NextResponse.json({ ok: true });
}
