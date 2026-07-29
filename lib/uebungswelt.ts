// ============================================================================
// ARGONAUT OS · lib/uebungswelt.ts — Motor der „Übungswelt" (Demo-/Beispieldaten)
//
// Registriert je Modul einen „Seeder": eine reine Funktion, die fertige DB-Zeilen
// baut. Die API-Route /api/uebungswelt geht die aktiven Seeder der Reihe nach
// durch, legt die Zeilen an und schreibt jede neue ID ins Register
// `beispiel_datensatz`. „Entfernen" löscht exakt über das Register — in
// UMGEKEHRTER Reihenfolge, damit abhängige Datensätze zuerst fallen.
//
// Modul-Gate: Ein Seeder mit `modul` läuft nur, wenn die Branche dieses Modul
// hat (kategorieModule aus branchenkatalog). Ohne `modul` läuft er immer.
//
// Erweiterung (Schichten 24–25): weitere Seeder einfach an SEEDER anhängen.
// Reihenfolge = Anlege-Reihenfolge (Stammdaten zuerst, Belege/abhängige später).
//
// Keine Hooks, kein Supabase — reine Logik, node-testbar.
// ============================================================================

import { beispielZeilen } from './beispielKatalog';
import { beispielArtikelZeilen, beispielLieferantenZeilen } from './beispielStammdaten';
import { kategorieModule } from './branchenkatalog';

/** Name der Register-Tabelle (Sicherheitsnetz für sauberes Entfernen). */
export const REGISTER_TABELLE = 'beispiel_datensatz';

export type SeedZeile = Record<string, unknown>;

export type Seeder = {
  /** Eindeutiger Schluessel (nur zur Übersicht/Debug). */
  key: string;
  /** Zieltabelle in Supabase. */
  tabelle: string;
  /** Optionales Modul-Gate (tenant_module-Key): laeuft nur, wenn die Branche es hat. */
  modul?: string;
  /** Baut die anzulegenden Zeilen (leer = fuer diese Branche nichts anzulegen). */
  baue: (kategorie: string | null | undefined, ownerId: string) => SeedZeile[];
};

// Reihenfolge = Anlege-Reihenfolge. Stammdaten zuerst; abhaengige Schichten spaeter.
// Schicht 1 (Punkt 22): Kontakte. Schicht Stammdaten (Punkt 23): Lieferanten, Artikel.
export const SEEDER: Seeder[] = [
  { key: 'kontakte', tabelle: 'kontakte', baue: (kat, uid) => beispielZeilen(kat, uid) },
  { key: 'lieferanten', tabelle: 'lieferanten', modul: 'erp', baue: (kat, uid) => beispielLieferantenZeilen(kat, uid) },
  { key: 'artikel', tabelle: 'artikel', modul: 'erp', baue: (kat, uid) => beispielArtikelZeilen(kat, uid) },
];

/** Kopie der Seeder-Liste (Aufrufer mutieren nicht die Konstante). */
export function seederListe(): Seeder[] {
  return [...SEEDER];
}

/** Nur die Seeder, die zur Branche passen (Modul-Gate). Ohne Branche: nur ungegatete. */
export function aktiveSeeder(kategorie: string | null | undefined): Seeder[] {
  const module = new Set<string>(kategorie ? kategorieModule(kategorie) : []);
  return seederListe().filter((s) => !s.modul || module.has(s.modul));
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
