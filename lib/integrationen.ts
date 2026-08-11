// ============================================================================
// ARGONAUT OS · lib/integrationen.ts — Helfer für die Schnittstellen-Zentrale
//
// Reine, node-testbare Funktionen rund um die verschlüsselte Ablage der
// Zugangsdaten (betrieb_integrationen). KEINE Supabase-/Crypto-Aufrufe hier —
// die Route erledigt Auth + Ver-/Entschlüsselung; hier liegt nur die Logik,
// WELCHE Felder geheim sind und wie die Anzeige maskiert wird.
// ============================================================================

import { anbieterVon, type IntegrationTyp } from './konnektoren';

/** Feld-Keys eines Anbieters, die geheim sind (Passwort-Typ). */
export function geheimeFeldKeys(typ: string, anbieterKey: string): string[] {
  const a = anbieterVon(typ as IntegrationTyp, anbieterKey);
  return (a?.felder || []).filter((f) => f.typ === 'password').map((f) => f.key);
}

/**
 * Fürs Anzeigen: geheime Werte NICHT herausgeben, stattdessen nur melden, WELCHE
 * geheimen Felder gesetzt sind. Nicht-geheime Werte kommen als String zurück.
 */
export function maskiereConfig(
  config: Record<string, unknown> | null | undefined,
  geheim: string[],
): { config: Record<string, string>; gesetzt: string[] } {
  const raus: Record<string, string> = {};
  const gesetzt: string[] = [];
  for (const [k, v] of Object.entries(config || {})) {
    if (geheim.includes(k)) {
      if (v != null && String(v) !== '') gesetzt.push(k);
    } else {
      raus[k] = v == null ? '' : String(v);
    }
  }
  return { config: raus, gesetzt };
}
