// ============================================================================
// ARGONAUT OS · lib/ablaufWebhookPruefung.ts — Prüfungen für „Webhook senden" (Paket 167)
//
// Browsertauglich (keine node-Module) — der Editor und lib/ablauf.ts prüfen
// damit schon beim Speichern. Unterschrift und Nutzlast: lib/ablaufWebhook.ts.
// ============================================================================

import { pruefeAusgehendeUrl, normalisiereHost, type UrlPruefung } from './adressPruefung';

/**
 * Eigene Systeme: nie Ziel eines Webhooks. Sonst könnte ein Ablauf die eigene
 * Anwendung, die Datenbank oder den PDF-Dienst von innen heraus anrufen.
 */
export const EIGENE_HOSTS: readonly string[] = [
  'argonaut-os.com',
  'supabase.co',
  'supabase.in',
  'supabase.com',
  'vercel.app',
  'vercel.com',
  'srv1133627.hstgr.cloud',
];

export function istEigenerHost(host: string): boolean {
  const h = normalisiereHost(host);
  return EIGENE_HOSTS.some((e) => h === e || h.endsWith('.' + e));
}

/** Darf ein Ablauf diese Adresse anrufen? Nur https, nur Internet, nie eigene Systeme. */
export function pruefeWebhookUrl(roh: unknown): UrlPruefung {
  const p = pruefeAusgehendeUrl(roh, { erlaubeLokalesNetz: false, erlaubeHttp: false });
  if (!p.erlaubt) return p;
  if (istEigenerHost(p.host)) {
    return {
      ...p, erlaubt: false, grund: 'internes_netz',
      hinweis: 'Diese Adresse gehört zu ARGONAUT selbst oder zu seinen Diensten. Webhooks gehen nur an fremde Programme (z. B. n8n).',
    };
  }
  return p;
}

/** Felder, die NIE nach außen gehen — auch nicht, wenn sie ausgewählt werden. */
const GESPERRT = /(iban|bic|konto|kontonummer|blz|sv_nummer|sozialvers|steuer_id|steuernummer|ust_?id|passwort|password|token|secret|geheim|schluessel|verschluessel|pin\b|kv_nummer|krankenkasse|diagnose|gesundheit|versicherten|owner_user_id|erstellt_von|geaendert_von|entschieden_von|auth_user_id)/i;

export function gesperrtesFeld(feld: string): boolean {
  return GESPERRT.test(String(feld ?? ''));
}

/** „email, telefon" -> ['email','telefon'] (leer, doppelt und über 20 Felder raus). */
export function felderListe(roh: unknown): string[] {
  const teile = String(roh ?? '').split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
  return [...new Set(teile)].slice(0, 20);
}

