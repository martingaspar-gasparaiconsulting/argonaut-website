// ============================================================================
// ARGONAUT OS · lib/tenantModule.ts — Buchungs-Gate (P48/P49)
//
// Dritte, AEUSSERSTE Rechte-Ebene, ueber sichtbare_module (Chef blendet aus)
// und mitarbeiter_rechte (Mitarbeiter darf sehen):
//
//   1. tenant_module    -> hat der BETREIBER das Modul gebucht?   (NEU, aussen)
//   2. sichtbare_module -> hat der Chef es ausgeblendet?          (bestehend)
//   3. mitarbeiter_rechte -> darf der Mitarbeiter es sehen?       (bestehend, innen)
//
// FAIL-OPEN-VERTRAG (safety-first, rueckwaertskompatibel):
//   Solange ein Tenant KEINE einzige tenant_module-Zeile hat, gilt ALLES als
//   gebucht — nichts wird ausgeblendet, kein Kunde sperrt sich versehentlich aus.
//   Erst ab der ersten Zeile greift die strikte Sicht: nur aktiv gebuchte
//   Module zaehlen; ein deaktiviertes (aktiv=false) oder gar nicht gebuchtes
//   Modul verschwindet.
//
// Diese Datei enthaelt — wie lib/rechte.ts — KEINE Supabase-Aufrufe und KEINE
// React-Hooks. Der eigentliche DB-Read passiert beim Aufrufer (DashboardNav im
// Browser, proxy.ts in Node). Nur so bleibt sie in beiden Laufzeiten nutzbar.
// ============================================================================

import type { NavLink } from './rechte'

/** Eine Zeile aus public.tenant_module (nur die fuers Gate noetigen Spalten). */
export type TenantModulRow = { modul_key: string; aktiv: boolean }

/**
 * Aktive Buchungen als Set — oder null (fail-open).
 *
 * @returns null  wenn der Tenant NOCH KEINE tenant_module-Zeile hat
 *                (nie konfiguriert)  => alles gilt als gebucht.
 * @returns Set   der aktiv gebuchten modul_key ab der ersten vorhandenen Zeile.
 */
export function gebuchteModulKeys(
  rows: TenantModulRow[] | null | undefined,
): Set<string> | null {
  if (!rows || rows.length === 0) return null
  return new Set(rows.filter((r) => r.aktiv).map((r) => r.modul_key))
}

/**
 * Ist dieses Modul fuer den Tenant freigeschaltet?
 * Infrastruktur-Links ohne `modul` (Uebersicht, Mein Bereich, Einstellungen,
 * Rechte) sind nie buchbar und immer erlaubt.
 */
export function istModulGebucht(
  modulKey: string | undefined,
  gebucht: Set<string> | null,
): boolean {
  if (!modulKey) return true      // Infra-Link, nicht buchbar
  if (gebucht === null) return true // fail-open: nie konfiguriert
  return gebucht.has(modulKey)
}

/**
 * Filtert eine bereits (rechte-)gefilterte Nav-Liste zusaetzlich auf die vom
 * Betreiber gebuchten Module. Bei fail-open (null) unveraendert durchgereicht.
 */
export function nurGebuchteLinks(
  links: NavLink[],
  gebucht: Set<string> | null,
): NavLink[] {
  if (gebucht === null) return links
  return links.filter((l) => istModulGebucht(l.modul, gebucht))
}
