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
import { baueVerleihArtikel, baueProjekte, baueMitglieder } from './beispielModule';
import { kategorieModule } from './branchenkatalog';
import {
  baueAngebote, baueRechnungen, baueDeals, baueSendungen, baueBelege,
  baueMailZugang, baueMarktplatzZugang, baueVersandZugang, baueBankZugang, baueElsterZugang, baueAdsZugang,
} from './beispielKern';

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
  /**
   * Anschluss-Tabelle: wird NICHT ueber das Register verwaltet.
   *
   * Grund (geprueft gegen information_schema am 03.08.2026): mail_zugang,
   * marktplatz_zugang, versand_zugang, elster_zugang und ads_zugang haben gar
   * keine Spalte `id` — ein .select('id') beim Anlegen scheitert dort hart und
   * hat bisher alle sechs Anschluesse gekippt. Damit alle sechs gleich
   * behandelt werden (auch bank_zugang, das ein `id` hat), gilt fuer sie:
   * anlegen ohne .select('id'), kein Register-Eintrag, entfernt wird ueber die
   * Beispiel-Markierung DEMO_TOKEN. Echte Zugaenge eines Betriebs tragen einen
   * echten Token und bleiben dadurch unangetastet.
   */
  zugang?: boolean;
  /** Baut die anzulegenden Zeilen (leer = fuer diese Branche nichts anzulegen). heute = ISO-Datum. */
  baue: (kategorie: string | null | undefined, ownerId: string, heute: string) => SeedZeile[];
};

// Reihenfolge = Anlege-Reihenfolge. Stammdaten zuerst; abhaengige Schichten spaeter.
// Schicht 1 (Punkt 22): Kontakte. Stammdaten (23): Lieferanten, Artikel.
// Modulgruppen (25b): Verleih, Projekte, Mitglieder — je Modul-Gate.
export const SEEDER: Seeder[] = [
  { key: 'kontakte', tabelle: 'kontakte', baue: (kat, uid) => beispielZeilen(kat, uid) },
  { key: 'lieferanten', tabelle: 'lieferanten', modul: 'erp', baue: (kat, uid) => beispielLieferantenZeilen(kat, uid) },
  { key: 'artikel', tabelle: 'artikel', modul: 'erp', baue: (kat, uid) => beispielArtikelZeilen(kat, uid) },
  { key: 'verleih', tabelle: 'verleih_artikel', modul: 'verleih', baue: (kat, uid) => baueVerleihArtikel(kat, uid) },
  { key: 'projekte', tabelle: 'projekte', modul: 'projekte', baue: (kat, uid, heute) => baueProjekte(kat, uid, heute) },
  { key: 'mitglieder', tabelle: 'mitglieder', modul: 'mitglieder', baue: (kat, uid, heute) => baueMitglieder(kat, uid, heute) },
  // Kern-Ketten (ungegatet, für jede Branche + Demo): Angebote, Rechnungen, Pipeline, Versand.
  { key: 'angebote', tabelle: 'angebote', baue: (kat, uid, heute) => baueAngebote(kat, uid, heute) },
  { key: 'rechnungen', tabelle: 'rechnungen', baue: (kat, uid, heute) => baueRechnungen(kat, uid, heute) },
  { key: 'deals', tabelle: 'crm_deal', baue: (kat, uid, heute) => baueDeals(kat, uid, heute) },
  { key: 'sendungen', tabelle: 'versand_sendung', baue: (kat, uid, heute) => baueSendungen(kat, uid, heute) },
  { key: 'belege', tabelle: 'eingangsbelege', baue: (kat, uid, heute) => baueBelege(kat, uid, heute) },
  // Anschluesse als „verbunden" (klar erkennbare Beispiel-Konten). Die Bauteile
  // lagen fertig in beispielKern, waren aber nie verdrahtet — dadurch stand das
  // Anschluesse-Cockpit in jeder Demo auf 0 von 6, obwohl alles vorbereitet war.
  { key: 'zugang_mail', tabelle: 'mail_zugang', zugang: true, baue: (kat, uid, heute) => baueMailZugang(kat, uid, heute) },
  { key: 'zugang_marktplatz', tabelle: 'marktplatz_zugang', zugang: true, baue: (kat, uid, heute) => baueMarktplatzZugang(kat, uid, heute) },
  { key: 'zugang_versand', tabelle: 'versand_zugang', zugang: true, baue: (kat, uid, heute) => baueVersandZugang(kat, uid, heute) },
  { key: 'zugang_bank', tabelle: 'bank_zugang', zugang: true, baue: (kat, uid, heute) => baueBankZugang(kat, uid, heute) },
  { key: 'zugang_elster', tabelle: 'elster_zugang', zugang: true, baue: (kat, uid, heute) => baueElsterZugang(kat, uid, heute) },
  { key: 'zugang_ads', tabelle: 'ads_zugang', zugang: true, baue: (kat, uid, heute) => baueAdsZugang(kat, uid, heute) },
];

/**
 * Die sechs Anschluss-Tabellen. Sie stehen nicht im Register, deshalb braucht
 * das Entfernen sie als eigene Liste — geloescht wird ueber owner_user_id PLUS
 * die Beispiel-Markierung, damit echte Zugaenge eines Betriebs nie mitgehen.
 */
export const ZUGANG_TABELLEN: string[] = SEEDER.filter((s) => s.zugang).map((s) => s.tabelle);

/** Nur die Anschluss-Seeder (zum Nachziehen ohne die uebrige Uebungswelt). */
export function zugangSeeder(kategorie: string | null | undefined): Seeder[] {
  return aktiveSeeder(kategorie).filter((s) => s.zugang);
}

/** Kopie der Seeder-Liste (Aufrufer mutieren nicht die Konstante). */
export function seederListe(): Seeder[] {
  return [...SEEDER];
}

/** Nur die Seeder, die zur Branche passen (Modul-Gate). Ohne Branche: nur ungegatete. */
export function aktiveSeeder(kategorie: string | null | undefined): Seeder[] {
  const module = new Set<string>(kategorie ? kategorieModule(kategorie) : []);
  return seederListe().filter((s) => !s.modul || module.has(s.modul));
}

// Explizite Loesch-Reihenfolge: abhaengige Belege (Kinder) zuerst, Kontakte
// zuletzt. Register-Tabellen, die hier fehlen, haengt die Route hinten an.
export const LOESCH_ORDER: string[] = [
  // Die sechs *_zugang-Tabellen stehen hier bewusst NICHT mehr: sie laufen
  // nicht ueber das Register, sondern werden ueber DEMO_TOKEN entfernt.
  'eingangsbelege',
  'versand_sendung',
  'crm_deal',
  'rechnungen',
  'zahlungen',
  'angebot_positionen',
  'angebote',
  'assets',
  'wartungsvertraege',
  'verleih_artikel',
  'projekte',
  'mitglieder',
  'artikel',
  'lieferanten',
  'kontakte',
];

/** Loesch-Reihenfolge der Tabellen (Kinder vor Eltern). */
export function loeschReihenfolge(): string[] {
  return [...LOESCH_ORDER];
}

/** Register-Zeilen aus frisch eingefuegten IDs bauen. */
export function registerZeilen(tabelle: string, ids: string[], ownerId: string): SeedZeile[] {
  return ids.map((id) => ({ owner_user_id: ownerId, tabelle, datensatz_id: id }));
}

// ---------------------------------------------------------------------------
// WO LIEGT WAS? — Tabelle → lesbarer Bereich + Ziel im Dashboard.
//
// Bisher stand nach dem Laden genau ein Knopf da: „Im CRM ansehen". Dadurch
// dachte jeder, die Übungswelt sei eine CRM-Sache — dabei füllt sie ein Dutzend
// Bereiche. Diese Zuordnung macht sichtbar, was tatsächlich angelegt wurde, und
// verlinkt jeden Bereich direkt.
// ---------------------------------------------------------------------------

export type BereichsInfo = { label: string; href: string; sammel?: string };

export const BEREICH_JE_TABELLE: Record<string, BereichsInfo> = {
  kontakte:            { label: '🤝 Kontakte im CRM',      href: '/dashboard/crm' },
  lieferanten:         { label: '🚚 Lieferanten',          href: '/dashboard/erp' },
  artikel:             { label: '📦 Artikel im Lager',     href: '/dashboard/erp' },
  verleih_artikel:     { label: '🔑 Mietgegenstände',      href: '/dashboard/verleih' },
  projekte:            { label: '📁 Projekte',             href: '/dashboard/projekte' },
  mitglieder:          { label: '👥 Mitglieder',           href: '/dashboard/mitglieder' },
  angebote:            { label: '📝 Angebote',             href: '/dashboard/angebote' },
  rechnungen:          { label: '🧾 Rechnungen',           href: '/dashboard/rechnungen' },
  zahlungen:           { label: '💶 Zahlungseingänge',     href: '/dashboard/finanzen' },
  crm_deal:            { label: '📊 Chancen in der Pipeline', href: '/dashboard/pipeline' },
  versand_sendung:     { label: '📮 Sendungen',            href: '/dashboard/versand' },
  eingangsbelege:      { label: '📥 Eingangsbelege',       href: '/dashboard/eingangsbelege' },
  assets:              { label: '🏛 Objekte',              href: '/dashboard/objekte' },
  wartungsvertraege:   { label: '🔧 Wartungsverträge',     href: '/dashboard/wartung' },
  // Die sechs Zugänge werden zu EINER Zeile zusammengefasst — sonst stünde
  // sechsmal fast dasselbe da.
  mail_zugang:         { label: '🔌 Anschlüsse verbunden', href: '/dashboard/anschluesse', sammel: 'anschluesse' },
  marktplatz_zugang:   { label: '🔌 Anschlüsse verbunden', href: '/dashboard/anschluesse', sammel: 'anschluesse' },
  versand_zugang:      { label: '🔌 Anschlüsse verbunden', href: '/dashboard/anschluesse', sammel: 'anschluesse' },
  bank_zugang:         { label: '🔌 Anschlüsse verbunden', href: '/dashboard/anschluesse', sammel: 'anschluesse' },
  elster_zugang:       { label: '🔌 Anschlüsse verbunden', href: '/dashboard/anschluesse', sammel: 'anschluesse' },
  ads_zugang:          { label: '🔌 Anschlüsse verbunden', href: '/dashboard/anschluesse', sammel: 'anschluesse' },
};

/**
 * Aus den gezählten Tabellen eine anzeigefertige Liste bauen: zusammengefasst,
 * ohne Hilfstabellen (Angebotspositionen zählen zum Angebot) und in einer
 * Reihenfolge, die dem Arbeitsalltag folgt.
 */
export function bereicheAusZaehlung(zaehlung: Record<string, number>): { label: string; href: string; anzahl: number }[] {
  const zusammen = new Map<string, { label: string; href: string; anzahl: number }>();
  for (const [tabelle, anzahl] of Object.entries(zaehlung)) {
    const info = BEREICH_JE_TABELLE[tabelle];
    if (!info || !anzahl) continue;                 // unbekannt oder leer -> nicht anzeigen
    const schluessel = info.sammel ?? tabelle;
    const da = zusammen.get(schluessel);
    if (da) da.anzahl += anzahl;
    else zusammen.set(schluessel, { label: info.label, href: info.href, anzahl });
  }
  const reihenfolge = Object.keys(BEREICH_JE_TABELLE);
  return [...zusammen.entries()]
    .sort((a, b) => reihenfolge.indexOf(a[0]) - reihenfolge.indexOf(b[0]))
    .map(([, v]) => v);
}
