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
//   Es wird NUR dann eingeschraenkt, wenn es mindestens EINE AKTIVE Buchung
//   gibt. Kein Kunde kann sich versehentlich das ganze Menue ausblenden.
//   Zwei fail-open-Faelle gelten als "nie scharf konfiguriert":
//     (a) der Tenant hat gar keine tenant_module-Zeile, ODER
//     (b) es gibt zwar Zeilen, aber keine davon ist aktiv (nur Karteileichen /
//         deaktivierte Eintraege) — Haertung 14.07.26 nach Live-Fund:
//         eine einzelne aktiv=false-Zeile hatte sonst das gesamte Menue gekillt.
//   Erst ab der ersten AKTIVEN Zeile greift die strikte Whitelist: nur aktiv
//   gebuchte Module bleiben sichtbar; alles andere verschwindet.
//   (Einen Kunden komplett stilllegen laeuft ueber den Account-Status, nicht
//    ueber das Leerraeumen/Deaktivieren von tenant_module.)
//
// Diese Datei enthaelt — wie lib/rechte.ts — KEINE Supabase-Aufrufe und KEINE
// React-Hooks. Der eigentliche DB-Read passiert beim Aufrufer (DashboardNav im
// Browser, proxy.ts in Node). Nur so bleibt sie in beiden Laufzeiten nutzbar.
// ============================================================================
import { NAV_LINKS, pfadPasst, type NavLink } from './rechte'
/** Eine Zeile aus public.tenant_module (nur die fuers Gate noetigen Spalten). */
export type TenantModulRow = { modul_key: string; aktiv: boolean }
/**
 * Aktive Buchungen als Set — oder null (fail-open).
 *
 * @returns null  wenn (a) der Tenant KEINE tenant_module-Zeile hat ODER
 *                (b) es Zeilen gibt, aber KEINE davon aktiv ist.
 *                In beiden Faellen gilt: nicht scharf konfiguriert => alles
 *                bleibt sichtbar (Sicherheitsnetz, siehe FAIL-OPEN-VERTRAG).
 * @returns Set   der aktiv gebuchten modul_key — erst ab der ersten AKTIVEN Zeile.
 */
export function gebuchteModulKeys(
  rows: TenantModulRow[] | null | undefined,
): Set<string> | null {
  if (!rows || rows.length === 0) return null
  const aktive = rows.filter((r) => r.aktiv).map((r) => r.modul_key)
  // Haertung: Zeilen vorhanden, aber keine aktiv -> fail-open statt "alles weg".
  if (aktive.length === 0) return null
  return new Set(aktive)
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
  if (gebucht === null) return true // fail-open: nicht scharf konfiguriert
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
// ---------------------------------------------------------------------------
// P49 Teil 2 · Pfad -> Modul. Fuer den URL-Riegel im proxy.
// Pure (nutzt NAV_LINKS + pfadPasst aus rechte.ts), damit in Node lauffaehig.
// ---------------------------------------------------------------------------
/**
 * Welchen Modul-Schluessel bedient dieser Pfad?
 * undefined = Infra-/kein Modul (Uebersicht, Mein Bereich, Einstellungen,
 * Rechte, /dashboard/upgrade …) -> vom Buchungs-Gate immer erlaubt.
 *
 * NAV_LINKS-Reihenfolge genuegt: Modul-Pfade ueberlappen sich nicht (jedes
 * Modul hat seinen eigenen Slug), und pfadPasst ist slash-sicher — '/dashboard/holz'
 * matcht NICHT '/dashboard/holzhandel'.
 */
export function modulKeyFuerPfad(pfad: string): string | undefined {
  const treffer = NAV_LINKS.find((l) => l.modul && pfadPasst(pfad, l.href))
  return treffer?.modul
}
/**
 * Darf dieser Pfad laut Buchungslage geoeffnet werden?
 * Infra-Pfade und fail-open -> true.
 */
export function pfadGebucht(pfad: string, gebucht: Set<string> | null): boolean {
  return istModulGebucht(modulKeyFuerPfad(pfad), gebucht)
}
