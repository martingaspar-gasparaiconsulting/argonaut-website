// lib/lagerAbzug.ts
// Shop-Verzahnung: ordnet Bestell-Positionen den Lager-Artikeln zu und plant den
// Bestandsabzug. Zuordnung ZUERST per Artikelnummer (SKU, exakt/normalisiert),
// sonst per Artikelname. KEINE Supabase-Aufrufe, KEINE React-Hooks. Node-getestet.

export interface PosLite { bezeichnung?: string | null; menge?: number | null; artikelnummer?: string | null; }
export interface ArtikelLite { id: string; bezeichnung?: string | null; artikelnummer?: string | null; }
export interface Abzug { artikel_id: string; menge: number; }
export interface LagerPlan { abzuege: Abzug[]; zugeordnet: number; offen: number; perNummer: number; perName: number; }

/** Normalisiert einen Namen/eine Nummer für den Vergleich (trim, klein, Mehrfach-Leerzeichen zu einem). */
function norm(s?: string | null): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Plant den Lagerabzug für eine Bestellung.
 * - Position wird ZUERST per Artikelnummer (falls vorhanden) einem Artikel zugeordnet,
 *   sonst per exaktem (normalisiertem) Namen.
 * - Mehrere Positionen auf denselben Artikel werden zur Summe zusammengefasst.
 * - Positionen ohne Treffer (oder Menge <= 0) zählen als "offen" (nicht zugeordnet).
 */
export function planeLagerabzug(positionen: PosLite[], artikel: ArtikelLite[]): LagerPlan {
  const byNummer = new Map<string, string>(); // normNr   -> artikel_id (erster Treffer gewinnt)
  const byName = new Map<string, string>();    // normName -> artikel_id (erster Treffer gewinnt)
  for (const a of artikel || []) {
    const nr = norm(a.artikelnummer);
    if (nr && !byNummer.has(nr)) byNummer.set(nr, a.id);
    const n = norm(a.bezeichnung);
    if (n && !byName.has(n)) byName.set(n, a.id);
  }
  const map = new Map<string, number>(); // artikel_id -> Gesamtmenge
  let zugeordnet = 0;
  let offen = 0;
  let perNummer = 0;
  let perName = 0;
  for (const p of positionen || []) {
    const menge = Number(p?.menge) || 0;
    const nr = norm(p?.artikelnummer);
    const trefferNr = nr ? byNummer.get(nr) : undefined;
    const id = trefferNr ?? byName.get(norm(p?.bezeichnung));
    if (id && menge > 0) {
      map.set(id, (map.get(id) || 0) + menge);
      zugeordnet++;
      if (trefferNr) perNummer++; else perName++;
    } else {
      offen++;
    }
  }
  return {
    abzuege: Array.from(map, ([artikel_id, menge]) => ({ artikel_id, menge })),
    zugeordnet,
    offen,
    perNummer,
    perName,
  };
}
