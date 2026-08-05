// ============================================================
// ARGONAUT OS · G2a · Leitungsrollen-Katalog (Presets)
// Reine Konstante — kein KI-Aufruf, kein Import, von Client- und
// Server-Code nutzbar. Firmen-eigene Titel liegen zusätzlich in der
// Tabelle `leitungsrolle_eigen`; das Dropdown zeigt Presets + eigene.
// ============================================================

export type LeitungsGruppe = 'gebiet' | 'betrieb';

export type LeitungsRolle = {
  /** Angezeigter Titel = gespeicherter Wert in mitarbeiter.leitungsrolle. */
  name: string;
  /** 'gebiet' = deckt mehrere Standorte ab · 'betrieb' = meist ein Standort. */
  gruppe: LeitungsGruppe;
  /** true = typischerweise mehrere Standorte (Gebiets-Rolle). */
  mehrere: boolean;
};

// Presets treffen laut Martin ~95 %. Eigene Titel für Spezialfälle
// (z. B. „Bayern-Leiter") werden firmenweit in leitungsrolle_eigen gespeichert.
export const LEITUNGSROLLEN: LeitungsRolle[] = [
  // Gebiet / Fläche — deckt mehrere Standorte ab
  { name: 'Bereichsleiter', gruppe: 'gebiet', mehrere: true },
  { name: 'Regionalleiter', gruppe: 'gebiet', mehrere: true },
  { name: 'Bezirksleiter', gruppe: 'gebiet', mehrere: true },
  { name: 'Gebietsleiter', gruppe: 'gebiet', mehrere: true },
  // Betrieb / Team / Schicht — meist ein Standort
  { name: 'Filialleiter', gruppe: 'betrieb', mehrere: false },
  { name: 'Standortleiter', gruppe: 'betrieb', mehrere: false },
  { name: 'Abteilungsleiter', gruppe: 'betrieb', mehrere: false },
  { name: 'Teamleiter', gruppe: 'betrieb', mehrere: false },
  { name: 'Schichtleiter', gruppe: 'betrieb', mehrere: false },
  { name: 'Gruppenleiter', gruppe: 'betrieb', mehrere: false },
  { name: 'Vorarbeiter / Polier', gruppe: 'betrieb', mehrere: false },
  { name: 'Objektleiter', gruppe: 'betrieb', mehrere: false },
];

export const LEITUNGSROLLEN_GEBIET = LEITUNGSROLLEN.filter((r) => r.gruppe === 'gebiet');
export const LEITUNGSROLLEN_BETRIEB = LEITUNGSROLLEN.filter((r) => r.gruppe === 'betrieb');

/** Ist der Titel eine Gebiets-Rolle (mehrere Standorte)? Auch eigene Titel = false. */
export function istGebietsrolle(name: string | null | undefined): boolean {
  if (!name) return false;
  return LEITUNGSROLLEN.some((r) => r.name === name && r.gruppe === 'gebiet');
}

/** Ist der Titel ein Preset (kein eigener Titel)? */
export function istPreset(name: string | null | undefined): boolean {
  if (!name) return false;
  return LEITUNGSROLLEN.some((r) => r.name === name);
}
