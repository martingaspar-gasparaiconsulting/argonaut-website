// lib/lagerAbzug.ts
// Shop-Verzahnung Stufe 3: ordnet Bestell-Positionen per Namen den Lager-Artikeln
// zu und plant den Bestandsabzug. KEINE Supabase-Aufrufe, KEINE React-Hooks.
// Node-getestet.

export interface PosLite { bezeichnung?: string | null; menge?: number | null; }
export interface ArtikelLite { id: string; bezeichnung?: string | null; }
export interface Abzug { artikel_id: string; menge: number; }
export interface LagerPlan { abzuege: Abzug[]; zugeordnet: number; offen: number; }

/** Normalisiert einen Namen für den Vergleich (trim, klein, Mehrfach-Leerzeichen zu einem). */
function norm(s?: string | null): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Plant den Lagerabzug für eine Bestellung.
 * - Position wird per exaktem (normalisiertem) Namen einem Artikel zugeordnet.
 * - Mehrere Positionen auf denselben Artikel werden zur Summe zusammengefasst.
 * - Positionen ohne Treffer (oder Menge <= 0) zählen als "offen" (nicht zugeordnet).
 */
export function planeLagerabzug(positionen: PosLite[], artikel: ArtikelLite[]): LagerPlan {
  const byName = new Map<string, string>(); // normName -> artikel_id (erster Treffer gewinnt)
  for (const a of artikel || []) {
    const n = norm(a.bezeichnung);
    if (n && !byName.has(n)) byName.set(n, a.id);
  }
  const map = new Map<string, number>(); // artikel_id -> Gesamtmenge
  let zugeordnet = 0;
  let offen = 0;
  for (const p of positionen || []) {
    const id = byName.get(norm(p?.bezeichnung));
    const menge = Number(p?.menge) || 0;
    if (id && menge > 0) {
      map.set(id, (map.get(id) || 0) + menge);
      zugeordnet++;
    } else {
      offen++;
    }
  }
  return {
    abzuege: Array.from(map, ([artikel_id, menge]) => ({ artikel_id, menge })),
    zugeordnet,
    offen,
  };
}
