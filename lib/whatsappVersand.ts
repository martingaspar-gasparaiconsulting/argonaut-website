// ============================================================================
// ARGONAUT OS · lib/whatsappVersand.ts  (WhatsApp Paket 3b · Versand)
//
// SERVER-ONLY. Verschickt Vorlagen-Nachrichten über den WhatsApp-Zugang des
// Betriebs — anbieter-neutral (Meta Cloud API ODER 360dialog). Erwartet einen
// Supabase-Client mit Service-Role (Protokoll-Inserts setzen owner explizit).
//
// Payload-Erzeugung ist rein & node-testbar; nur der fetch-Aufruf selbst ist
// gegen die echte API erst testbar, sobald ein Zugang verbunden ist.
//
// WICHTIG (WhatsApp-Realität): Eine Vorlage muss bei Meta unter genau diesem
// `name` freigegeben sein. Der Platzhalter {{1}} wird mit dem Empfänger-Namen
// gefüllt; weitere Platzhalter erhalten „—" (Feinsteuerung später).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { platzhalterFinden } from './whatsapp';

export type WaAnbieter = 'meta' | 'dialog360';

const META_VERSION = 'v21.0';

/** Ziel-Endpunkt je Anbieter. */
export function versandEndpoint(anbieter: WaAnbieter, phoneNumberId: string | null | undefined): string {
  if (anbieter === 'dialog360') return 'https://waba-v2.360dialog.io/messages';
  return `https://graph.facebook.com/${META_VERSION}/${(phoneNumberId || '').trim()}/messages`;
}

/** HTTP-Header je Anbieter (Authentifizierung). */
export function versandHeaders(anbieter: WaAnbieter, token: string): Record<string, string> {
  if (anbieter === 'dialog360') return { 'D360-API-KEY': token, 'Content-Type': 'application/json' };
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** Body-Parameter für die Platzhalter einer Vorlage (aus dem Empfänger). */
export function paramsFuerKontakt(anzahl: number, kontakt: { name?: string | null }): string[] {
  const n = Math.max(0, Math.floor(anzahl));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(i === 0 ? ((kontakt?.name || '').trim() || 'Kunde') : '—');
  }
  return out;
}

/** Baut das Cloud-API-kompatible Template-Nachrichten-Payload (Meta & 360dialog). */
export function baueTemplatePayload(
  to: string,
  vorlagenName: string,
  sprache: string | null | undefined,
  params: string[],
): Record<string, unknown> {
  const components = params.length
    ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: t })) }]
    : [];
  return {
    messaging_product: 'whatsapp',
    to: to.replace(/[^\d+]/g, '').replace(/^\+/, ''),
    type: 'template',
    template: {
      name: vorlagenName,
      language: { code: (sprache || 'de').trim() || 'de' },
      ...(components.length ? { components } : {}),
    },
  };
}

/** Führt EINEN Sende-Aufruf aus (Netzwerk). Wirft nie — gibt {ok, id?, fehler?}. */
export async function sendeEineNachricht(
  anbieter: WaAnbieter,
  endpoint: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id: string | null; fehler: string | null }> {
  try {
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* kein JSON */ }
    if (!res.ok) {
      const fehler =
        (json as { error?: { message?: string } } | null)?.error?.message ||
        text.slice(0, 300) ||
        `HTTP ${res.status}`;
      return { ok: false, id: null, fehler };
    }
    const id = (json as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id ?? null;
    return { ok: true, id, fehler: null };
  } catch (e) {
    return { ok: false, id: null, fehler: e instanceof Error ? e.message : 'Netzwerkfehler.' };
  }
}

export type SendeKontakt = { id: string; telefon: string; name: string | null };

/**
 * Verschickt eine Vorlage an eine Empfängerliste und protokolliert jeden Versand
 * in whatsapp_versand. Wirft nie. Gibt Zähler zurück.
 */
export async function verschickeKampagne(
  admin: SupabaseClient,
  opts: {
    ownerId: string;
    anbieter: WaAnbieter;
    phoneNumberId: string | null;
    token: string;
    vorlage: { id: string; name: string; sprache: string | null; inhalt: string };
    kontakte: SendeKontakt[];
    cap?: number;
  },
): Promise<{ gesendet: number; fehler: number }> {
  const endpoint = versandEndpoint(opts.anbieter, opts.phoneNumberId);
  const headers = versandHeaders(opts.anbieter, opts.token);
  const anzahlPlatzhalter = platzhalterFinden(opts.vorlage.inhalt).length;
  const cap = Math.max(0, opts.cap ?? 500);

  let gesendet = 0;
  let fehler = 0;

  for (const k of opts.kontakte.slice(0, cap)) {
    const params = paramsFuerKontakt(anzahlPlatzhalter, k);
    const payload = baueTemplatePayload(k.telefon, opts.vorlage.name, opts.vorlage.sprache, params);
    const r = await sendeEineNachricht(opts.anbieter, endpoint, headers, payload);
    try {
      await admin.from('whatsapp_versand').insert({
        owner_user_id: opts.ownerId,
        kontakt_id: k.id,
        vorlage_id: opts.vorlage.id,
        telefon: k.telefon,
        status: r.ok ? 'gesendet' : 'fehler',
        provider_id: r.id,
        fehler_text: r.fehler,
      });
    } catch { /* Protokoll darf den Lauf nicht stoppen */ }
    if (r.ok) gesendet++; else fehler++;
  }

  return { gesendet, fehler };
}
