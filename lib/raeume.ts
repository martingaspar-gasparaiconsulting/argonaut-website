// lib/raeume.ts
// L2-5 · Raum-/Ressourcenbelegung (Bildung/VHS/Coworking) — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Räume & Ausstattung als buchbare Ressourcen mit Kapazität; Belegungen mit
// Doppelbuchungs-Prüfung (halb-offenes Intervall [von,bis) — Ende exklusiv, damit
// eine Anschlussbuchung ab genau dem Endzeitpunkt NICHT kollidiert). Der harte
// Riegel liegt in der DB (btree_gist EXCLUDE); konflikte() ist die Client-Vorwarnung.
// Node-getestet (raeume.test.ts).

export const RESSOURCE_TYP = ['raum', 'ausstattung', 'labor', 'werkstatt', 'fahrzeug', 'sonstige'] as const;
export const BELEGUNG_STATUS = ['reserviert', 'bestaetigt', 'abgesagt'] as const;

function ms(iso: string | null | undefined): number { const t = Date.parse(String(iso ?? '')); return isNaN(t) ? NaN : t; }

/** Dauer in Stunden zwischen zwei ISO-Zeitpunkten (0 wenn ungültig/negativ). */
export function dauerStunden(vonISO: string | null | undefined, bisISO: string | null | undefined): number {
  const a = ms(vonISO), b = ms(bisISO);
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  return Math.round(((b - a) / 3600000) * 100) / 100;
}

/** Überlappen sich zwei halb-offene Intervalle [aVon,aBis) und [bVon,bBis)? */
export function ueberlappt(aVon: string, aBis: string, bVon: string, bBis: string): boolean {
  const a1 = ms(aVon), a2 = ms(aBis), b1 = ms(bVon), b2 = ms(bBis);
  if ([a1, a2, b1, b2].some(isNaN)) return false;
  return a1 < b2 && b1 < a2;
}

export interface BelegungLite { id?: string; ressource_id?: string | null; von?: string | null; bis?: string | null; status?: string | null; }

/**
 * Bestehende Belegungen derselben Ressource, die mit [von,bis) kollidieren
 * (abgesagte ignoriert, optional eine ID ausgeschlossen — beim Bearbeiten).
 */
export function konflikte(von: string, bis: string, ressourceId: string, bestehende: BelegungLite[], ignoreId?: string): BelegungLite[] {
  if (ms(bis) <= ms(von)) return []; // ungültiges Intervall → getrennt behandeln
  return (bestehende || []).filter((b) =>
    b.ressource_id === ressourceId &&
    (b.status ?? 'reserviert') !== 'abgesagt' &&
    (!ignoreId || b.id !== ignoreId) &&
    ueberlappt(von, bis, b.von ?? '', b.bis ?? '')
  );
}

/** Gültiges Buchungsintervall? (bis nach von) */
export function intervallGueltig(von: string | null | undefined, bis: string | null | undefined): boolean {
  const a = ms(von), b = ms(bis);
  return !isNaN(a) && !isNaN(b) && b > a;
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------
export interface RessourceLite { buchbar?: boolean | null; }

export interface RaeumeKennzahlen {
  ressourcen: number; buchbar: number;
  belegungenHeute: number; belegungenKommend: number; belegungStundenKommend: number;
  gesamt: number;
}

function tag(iso: string | null | undefined): string { return String(iso ?? '').slice(0, 10); }

export function zaehleRaeume(ressourcen: RessourceLite[], belegungen: BelegungLite[], heuteISO: string): RaeumeKennzahlen {
  const heute = tag(heuteISO);
  let belegungenHeute = 0, belegungenKommend = 0, belegungStundenKommend = 0;
  for (const b of belegungen || []) {
    if ((b.status ?? 'reserviert') === 'abgesagt') continue;
    const d = tag(b.von);
    if (d === heute) belegungenHeute++;
    if (d >= heute) { belegungenKommend++; belegungStundenKommend += dauerStunden(b.von, b.bis); }
  }
  return {
    ressourcen: (ressourcen || []).length,
    buchbar: (ressourcen || []).filter((r) => r.buchbar !== false).length,
    belegungenHeute, belegungenKommend,
    belegungStundenKommend: Math.round(belegungStundenKommend * 100) / 100,
    gesamt: (ressourcen || []).length + (belegungen || []).length,
  };
}
