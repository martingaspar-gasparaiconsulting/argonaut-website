// ============================================================================
// ARGONAUT OS · lib/standortModule.ts — Modul-Freischaltung je Filiale (G2b)
//
// Eine Ebene UNTER dem tenant_module-Buchungs-Gate: der Betreiber bucht ein
// Modul fuer den Tenant (tenant_module); hier legt der Chef fest, an WELCHEM
// Standort ein Modul ABGESCHALTET ist.
//
// ▄▄▄ F1 (26.09.2026) — SPERRLISTE statt Positivliste ▄▄▄
// Bis F1 las diese Datei die Zeilen als POSITIVLISTE („ab der ersten aktiven
// Zeile sind NUR die aktiven Module erlaubt"), die Seite Filial-Module schreibt
// aber eine SPERRLISTE („Zeile aktiv=false = aus, sonst an"). Folge:
//   - Modul aus- und wieder einschalten -> eine Zeile aktiv=true -> an dem
//     Standort waren ploetzlich ALLE anderen Module weg.
//   - Nur abschalten (alle Zeilen false) -> Sicherheitsnetz -> Abschalten
//     wirkte gar nicht.
// Jetzt gilt EINE Regel fuer Seite, Menue und Proxy:
//   - Zeile mit aktiv = false  -> Modul an diesem Standort aus
//   - Zeile mit aktiv = true   -> an (wie keine Zeile)
//   - keine Zeile              -> an
// Infrastruktur-Links ohne Modul-Schluessel (u. a. Filial-Module selbst,
// Standorte, Einstellungen) sind nie abschaltbar — der Chef kommt immer zurueck.
//
// KEINE Supabase-Aufrufe, KEINE Hooks — in Browser UND Node nutzbar.
// ============================================================================

import type { NavLink } from './rechte';

/** Eine Zeile aus public.standort_module (nur die fuers Gate noetigen Spalten). */
export type StandortModulRow = { modul_key: string; aktiv: boolean };

/**
 * An diesem Standort ABGESCHALTETE Module als Set — oder null (nichts aus).
 */
export function abgeschalteteModuleAmStandort(
  rows: StandortModulRow[] | null | undefined,
): Set<string> | null {
  if (!rows || rows.length === 0) return null;
  const aus = rows.filter((r) => r.aktiv === false).map((r) => r.modul_key);
  if (aus.length === 0) return null;
  return new Set(aus);
}

/**
 * Ist dieses Modul am Standort aktiv? Infrastruktur-Links ohne Schluessel und
 * „nichts abgeschaltet" (null) sind immer aktiv.
 */
export function istModulAmStandortAktiv(
  modulKey: string | undefined,
  aus: Set<string> | null,
): boolean {
  if (!modulKey) return true;   // Infra-Link, nicht abschaltbar
  if (aus === null) return true; // nichts abgeschaltet
  return !aus.has(modulKey);
}

/**
 * Filtert eine bereits (rechte-/buchungs-)gefilterte Nav-Liste zusaetzlich um
 * die am aktiven Standort abgeschalteten Module. Infra-Links bleiben immer.
 */
export function nurStandortAktiveLinks(
  links: NavLink[],
  aus: Set<string> | null,
): NavLink[] {
  if (aus === null) return links;
  return links.filter((l) => istModulAmStandortAktiv(l.modul, aus));
}
