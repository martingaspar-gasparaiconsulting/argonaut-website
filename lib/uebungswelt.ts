// ============================================================================
// ARGONAUT OS · lib/uebungswelt.ts — Motor der „Übungswelt" (Demo-/Beispieldaten)
//
// Registriert je Modul einen „Seeder": eine reine Funktion, die fertige DB-Zeilen
// baut. Die API-Route /api/uebungswelt geht diese Liste der Reihe nach durch,
// legt die Zeilen an und schreibt jede neue ID ins Register `beispiel_datensatz`.
// „Entfernen" löscht exakt über das Register — in UMGEKEHRTER Reihenfolge, damit
// abhängige Datensätze (z. B. Rechnungen vor Kontakten) sauber zuerst fallen.
//
// Erweiterung (Schichten 23–25): weitere Seeder einfach hinten an SEEDER anhängen.
// Reihenfolge = Anlege-Reihenfolge (Stammdaten zuerst, Belege/abhängige später).
//
// Keine Hooks, kein Supabase — reine Logik, node-testbar, von Client + Server nutzbar.
// ============================================================================

import { beispielZeilen } from './beispielKatalog';

/** Name der Register-Tabelle (Sicherheitsnetz für sauberes Entfernen). */
export const REGISTER_TABELLE = 'beispiel_datensatz';

export type SeedZeile = Record<string, unknown>;

export type Seeder = {
  /** Eindeutiger Schluessel (nur zur Übersicht/Debug). */
  key: string;
  /** Zieltabelle in Supabase. */
  tabelle: string;
  /** Baut die anzulegenden Zeilen (leer = fuer diese Branche nichts anzulegen). */
  baue: (kategorie: string | null | undefined, ownerId: string) => SeedZeile[];
};

// Reihenfolge = Anlege-Reihenfolge. Stammdaten zuerst; abhaengige Schichten spaeter.
// Schicht 1 (Punkt 22): Kontakte. Weitere Schichten kommen in 23–25 dazu.
export const SEEDER: Seeder[] = [
  { key: 'kontakte', tabelle: 'kontakte', baue: (kat, uid) => beispielZeilen(kat, uid) },
];

/** Kopie der Seeder-Liste (Aufrufer mutieren nicht die Konstante). */
export function seederListe(): Seeder[] {
  return [...SEEDER];
}

/** Loesch-Reihenfolge der Tabellen = umgekehrte Anlege-Reihenfolge (dedupliziert). */
export function loeschReihenfolge(): string[] {
  const tabellen = seederListe().map((s) => s.tabelle).reverse();
  return [...new Set(tabellen)];
}

/** Register-Zeilen aus frisch eingefuegten IDs bauen. */
export function registerZeilen(tabelle: string, ids: string[], ownerId: string): SeedZeile[] {
  return ids.map((id) => ({ owner_user_id: ownerId, tabelle, datensatz_id: id }));
}
