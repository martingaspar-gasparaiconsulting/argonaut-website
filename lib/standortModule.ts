// ============================================================================
// ARGONAUT OS · lib/standortModule.ts — Modul-Freischaltung je Filiale (G2b)
//
// Eine Ebene UNTER dem tenant_module-Buchungs-Gate: der Betreiber bucht ein
// Modul fuer den Tenant (tenant_module); hier legt der Chef fest, an WELCHEM
// Standort es aktiv ist. Gleicher FAIL-OPEN-Vertrag wie tenant_module:
//   - keine Zeile fuer den Standort            -> alles aktiv (nicht scharf)
//   - Zeilen vorhanden, aber keine aktiv        -> alles aktiv (Sicherheitsnetz)
//   - ab der ersten AKTIVEN Zeile               -> strikte Whitelist je Standort
//
// KEINE Supabase-Aufrufe, KEINE Hooks — in Browser UND Node nutzbar. Die
// eigentliche Gate-Wirkung wird erst mit dem Filial-Umschalter (G3) verdrahtet.
// ============================================================================

/** Eine Zeile aus public.standort_module (nur die fuers Gate noetigen Spalten). */
export type StandortModulRow = { modul_key: string; aktiv: boolean };

/**
 * Aktive Module eines Standorts als Set — oder null (fail-open).
 * @returns null  wenn keine Zeile existiert ODER keine Zeile aktiv ist.
 * @returns Set   der aktiv gesetzten modul_key ab der ersten aktiven Zeile.
 */
export function aktiveModuleAmStandort(
  rows: StandortModulRow[] | null | undefined,
): Set<string> | null {
  if (!rows || rows.length === 0) return null;
  const aktive = rows.filter((r) => r.aktiv).map((r) => r.modul_key);
  if (aktive.length === 0) return null;
  return new Set(aktive);
}

/**
 * Ist dieses Modul am Standort aktiv? Infrastruktur-Links ohne Schluessel und
 * fail-open (null) sind immer aktiv.
 */
export function istModulAmStandortAktiv(
  modulKey: string | undefined,
  aktive: Set<string> | null,
): boolean {
  if (!modulKey) return true;      // Infra-Link, nicht buchbar
  if (aktive === null) return true; // fail-open: nicht scharf konfiguriert
  return aktive.has(modulKey);
}
