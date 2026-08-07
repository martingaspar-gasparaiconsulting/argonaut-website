// ============================================================================
// ARGONAUT OS · lib/plzBundesland.ts
// Ordnet eine deutsche PLZ einem Bundesland zu — GESCHÄTZT über die ersten zwei
// Ziffern (PLZ-Leitregion). Bewusst näherungsweise: PLZ-Zonen folgen nicht exakt
// den Landesgrenzen (Randgebiete können abweichen). Für regionale Marketing-
// Auswertung völlig ausreichend; im UI immer als „geschätzt" kennzeichnen.
// Reine Funktion, node-testbar, keine Abhängigkeiten.
// ============================================================================

export type PlzRegel = [von: number, bis: number, land: string];

// Leitregionen (erste zwei Ziffern) → dominantes Bundesland. Lücken = keine PLZ.
const REGELN: PlzRegel[] = [
  [0, 2, 'Sachsen'], [3, 3, 'Brandenburg'], [4, 4, 'Sachsen'], [6, 6, 'Sachsen-Anhalt'],
  [7, 7, 'Thüringen'], [8, 9, 'Sachsen'],
  [10, 14, 'Berlin'], [15, 16, 'Brandenburg'], [17, 19, 'Mecklenburg-Vorpommern'],
  [20, 22, 'Hamburg'], [23, 25, 'Schleswig-Holstein'], [26, 27, 'Niedersachsen'],
  [28, 28, 'Bremen'], [29, 29, 'Niedersachsen'],
  [30, 31, 'Niedersachsen'], [32, 33, 'Nordrhein-Westfalen'], [34, 36, 'Hessen'],
  [37, 38, 'Niedersachsen'], [39, 39, 'Sachsen-Anhalt'],
  [40, 48, 'Nordrhein-Westfalen'], [49, 49, 'Niedersachsen'],
  [50, 53, 'Nordrhein-Westfalen'], [54, 56, 'Rheinland-Pfalz'], [57, 59, 'Nordrhein-Westfalen'],
  [60, 65, 'Hessen'], [66, 66, 'Saarland'], [67, 67, 'Rheinland-Pfalz'], [68, 69, 'Baden-Württemberg'],
  [70, 79, 'Baden-Württemberg'],
  [80, 87, 'Bayern'], [88, 89, 'Baden-Württemberg'],
  [90, 97, 'Bayern'], [98, 99, 'Thüringen'],
];

/** Normiert eine PLZ auf 5 Ziffern (führende Nullen bleiben). Leer bei ungültig. */
export function plzNormieren(roh: unknown): string {
  const s = String(roh ?? '').replace(/\D/g, '');
  return s.length === 5 ? s : '';
}

/** Bundesland (geschätzt) für eine PLZ. 'Unbekannt' bei ungültiger/unbelegter PLZ. */
export function plzBundesland(roh: unknown): string {
  const plz = plzNormieren(roh);
  if (!plz) return 'Unbekannt';
  const zwei = parseInt(plz.slice(0, 2), 10);
  for (const [von, bis, land] of REGELN) {
    if (zwei >= von && zwei <= bis) return land;
  }
  return 'Unbekannt';
}

/** Zählt Leads je (geschätztem) Bundesland, größtes zuerst. Ohne PLZ → nicht gezählt. */
export function leadsJeBundesland(leads: Array<{ plz?: unknown }>): Array<{ land: string; anzahl: number }> {
  const map: Record<string, number> = {};
  for (const l of leads || []) {
    const land = plzBundesland(l?.plz);
    if (land === 'Unbekannt') continue;
    map[land] = (map[land] || 0) + 1;
  }
  return Object.entries(map)
    .map(([land, anzahl]) => ({ land, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl);
}
