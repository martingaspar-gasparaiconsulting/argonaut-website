// ============================================================================
// ARGONAUT OS · lib/beispielModule.ts — Modulgruppen-Builder der Übungswelt
//
// Punkt 25a: Modulgruppe „Objekte + Wartung" (verzahnt) — für jede Branche
// (objekte ist Kern-Modul). Legt Beispiel-Objekte (assets) an und verknüpft
// das erste mit einem Wartungsvertrag, sodass Objekt-Register, Wartung und das
// Wiederkehr-Cockpit gemeinsam lebendig werden.
//
// Reine Builder — kein Supabase, keine Hooks. Node-testbar. Inserts/IDs/Register
// erledigt die Route. Entfernen laeuft ueber das Register (LOESCH_ORDER: assets
// vor wartungsvertraege, beide vor kontakte).
// ============================================================================

const HINWEIS = 'Beispiel-Objekt der Uebungswelt — jederzeit ueber den Schalter im Onboarding entfernbar.';

export type SeedZeile = Record<string, unknown>;

/** ISO-Datum (YYYY-MM-DD) um n Monate verschieben. */
export function addMonate(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

type AssetVorlage = {
  typ: string;
  bezeichnung: string;
  standort: string;
  hersteller: string;
  kennung: string;
  zustand: 'gut' | 'beobachten' | 'kritisch';
  intervall: number;
  anschaffungswert: number;
};

const ASSET_VORLAGEN: AssetVorlage[] = [
  { typ: 'Fahrzeug', bezeichnung: 'Firmenfahrzeug (Beispiel)', standort: 'Fuhrpark', hersteller: 'Beispiel', kennung: 'B-SP 1000', zustand: 'gut', intervall: 12, anschaffungswert: 18000 },
  { typ: 'Maschine', bezeichnung: 'Beispiel-Maschine', standort: 'Halle A', hersteller: 'Beispiel', kennung: 'M-2000', zustand: 'beobachten', intervall: 6, anschaffungswert: 9500 },
];

/** Beispiel-Objekt-Zeilen fuer die assets-Tabelle (naechste_kontrolle berechnet). */
export function baueAssets(ownerId: string, heute: string): SeedZeile[] {
  return ASSET_VORLAGEN.map((a) => ({
    owner_user_id: ownerId,
    gruppe_id: null,
    typ: a.typ,
    bezeichnung: a.bezeichnung,
    standort: a.standort,
    hersteller: a.hersteller,
    kennung: a.kennung,
    zustand: a.zustand,
    kontrollintervall_monate: a.intervall,
    letzte_kontrolle: heute,
    naechste_kontrolle: addMonate(heute, a.intervall),
    anschaffungsdatum: heute,
    anschaffungswert: a.anschaffungswert,
    notiz: HINWEIS,
  }));
}

/** Wartungsvertrag-Zeile aus einem Asset (Andock an Baustein 1 / Wiederkehr-Cockpit). */
export function baueWartungAusAsset(asset: SeedZeile, ownerId: string): SeedZeile {
  return {
    owner_user_id: ownerId,
    titel: asset.bezeichnung,
    kunde_name: null,
    kontakt_id: null,
    status: 'aktiv',
    beginn_am: asset.letzte_kontrolle ?? null,
    intervall_monate: asset.kontrollintervall_monate ?? 12,
    letzte_wartung_am: asset.letzte_kontrolle ?? null,
    naechste_faelligkeit_am: asset.naechste_kontrolle ?? null,
    erinnerung_tage_vorher: 30,
  };
}

// ---- Punkt 25b: branchenspezifische Modul-Seeder (unabhaengige Zeilen) ----

const HINWEIS_ALLG = 'Beispiel-Datensatz der Uebungswelt — jederzeit ueber den Schalter im Onboarding entfernbar.';

/** Beispiel-Mietgegenstaende fuer verleih_artikel (Modul-Gate 'verleih'). */
export function baueVerleihArtikel(_kategorie: string | null | undefined, ownerId: string): SeedZeile[] {
  const V = [
    { bezeichnung: 'Beispiel-Bohrhammer', kategorie: 'Werkzeug', tagessatz: 19.9, wochensatz: 89, kaution: 100, anzahl: 3 },
    { bezeichnung: 'Beispiel-Anhaenger', kategorie: 'Fahrzeug', tagessatz: 29, wochensatz: 149, kaution: 200, anzahl: 2 },
  ];
  return V.map((a) => ({
    owner_user_id: ownerId,
    bezeichnung: a.bezeichnung,
    kategorie: a.kategorie,
    tagessatz: a.tagessatz,
    wochensatz: a.wochensatz,
    kaution: a.kaution,
    anzahl: a.anzahl,
    status: 'aktiv',
  }));
}

/** Beispiel-Projekt fuer projekte (Modul-Gate 'projekte'). */
export function baueProjekte(_kategorie: string | null | undefined, ownerId: string, heute: string): SeedZeile[] {
  return [{
    owner_user_id: ownerId,
    name: 'Beispiel-Projekt (Uebungswelt)',
    beschreibung: HINWEIS_ALLG,
    status: 'aktiv',
    prioritaet: 'normal',
    start_datum: heute,
    end_datum: addMonate(heute, 2),
    budget: 5000,
    verantwortlich: 'Team',
    farbe: '#C9A84C',
  }];
}

/** Beispiel-Mitglieder fuer mitglieder (Modul-Gate 'mitglieder'). */
export function baueMitglieder(_kategorie: string | null | undefined, ownerId: string, heute: string): SeedZeile[] {
  const M = [
    { name: 'Beispiel-Mitglied (Monatsbeitrag)', betrag: 29 },
    { name: 'Beispiel-Mitglied (Foerderer)', betrag: 10 },
  ];
  return M.map((m) => ({
    owner_user_id: ownerId,
    name: m.name,
    email: null,
    telefon: null,
    betrag: m.betrag,
    intervall: 'monat',
    status: 'aktiv',
    beginn_am: heute,
    notiz: HINWEIS_ALLG,
  }));
}
