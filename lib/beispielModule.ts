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
