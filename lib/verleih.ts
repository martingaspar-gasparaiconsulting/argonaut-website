// ============================================================================
// ARGONAUT OS · lib/verleih.ts — Verleih-/Vermietungs-Formeln (A1)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks. Miettage,
// Preis mit Wochenstaffel, Verfügbarkeit (Überschneidungs-Check über die
// vorhandenen Exemplare) und Überfälligkeit.
// ============================================================================

export interface VorgangBasis {
  von?: string | null;
  bis?: string | null;
  status?: string | null; // reserviert | ausgegeben | zurueck | storniert
}

/** Tage-Differenz bis − von (kann 0 sein). */
export function diffTage(von?: string | null, bis?: string | null): number | null {
  if (!von || !bis) return null;
  const a = new Date(von.slice(0, 10) + 'T00:00:00').getTime();
  const b = new Date(bis.slice(0, 10) + 'T00:00:00').getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** Miettage inklusiv: von=bis -> 1 Tag; jeder angefangene Tag zählt. Min. 1. */
export function mietTage(von?: string | null, bis?: string | null): number {
  const d = diffTage(von, bis);
  if (d == null) return 1;
  return Math.max(1, d + 1);
}

/**
 * Mietpreis mit optionaler Wochenstaffel.
 * Ist ein Wochensatz gesetzt und die Dauer >= 7 Tage, werden volle Wochen zum
 * Wochensatz + Resttage zum Tagessatz gerechnet; sonst Tage × Tagessatz.
 */
export function mietPreis(tage: number, tagessatz: number, wochensatz?: number | null): number {
  const t = Math.max(0, Math.round(Number(tage) || 0));
  const ts = Number(tagessatz) || 0;
  const ws = Number(wochensatz) || 0;
  if (ws > 0 && t >= 7) {
    const wochen = Math.floor(t / 7);
    const rest = t % 7;
    return Math.round((wochen * ws + rest * ts) * 100) / 100;
  }
  return Math.round(t * ts * 100) / 100;
}

/** Überschneiden sich zwei Zeitbereiche [aVon,aBis] und [bVon,bBis]? */
export function bereichUeberschneidet(aVon: string, aBis: string, bVon: string, bBis: string): boolean {
  const a1 = aVon.slice(0, 10), a2 = aBis.slice(0, 10), b1 = bVon.slice(0, 10), b2 = bBis.slice(0, 10);
  return a1 <= b2 && b1 <= a2;
}

/** Ein Vorgang blockiert ein Exemplar, solange er nicht zurück/storniert ist. */
export function blockiert(v: VorgangBasis): boolean {
  return v.status === 'reserviert' || v.status === 'ausgegeben';
}

/**
 * Wie viele Exemplare sind im Zeitraum [von,bis] belegt?
 * Zählt alle blockierenden Vorgänge, deren Zeitraum sich überschneidet.
 * `exclId` schließt den eigenen Vorgang aus (beim Bearbeiten).
 */
export function belegteAnzahl(
  vorgaenge: (VorgangBasis & { id?: string })[],
  von: string,
  bis: string,
  exclId?: string,
): number {
  let n = 0;
  for (const v of vorgaenge) {
    if (exclId && v.id === exclId) continue;
    if (!blockiert(v) || !v.von || !v.bis) continue;
    if (bereichUeberschneidet(von, bis, v.von, v.bis)) n++;
  }
  return n;
}

/** Ist im Zeitraum noch mindestens ein Exemplar frei? */
export function verfuegbar(
  anzahl: number,
  vorgaenge: (VorgangBasis & { id?: string })[],
  von: string,
  bis: string,
  exclId?: string,
): boolean {
  return (Number(anzahl) || 0) - belegteAnzahl(vorgaenge, von, bis, exclId) > 0;
}

/** Freie Exemplare im Zeitraum (nie negativ). */
export function freieAnzahl(
  anzahl: number,
  vorgaenge: (VorgangBasis & { id?: string })[],
  von: string,
  bis: string,
  exclId?: string,
): number {
  return Math.max(0, (Number(anzahl) || 0) - belegteAnzahl(vorgaenge, von, bis, exclId));
}

/** Überfällig = ausgegeben und Rückgabedatum liegt vor heute. */
export function istUeberfaellig(v: VorgangBasis, heuteIso: string): boolean {
  return v.status === 'ausgegeben' && !!v.bis && v.bis.slice(0, 10) < heuteIso.slice(0, 10);
}

/** Kennzahlen über die Vorgänge (fürs Cockpit/Auge). */
export function zaehleVerleih(vorgaenge: VorgangBasis[], heuteIso: string): { ausgegeben: number; reserviert: number; ueberfaellig: number } {
  let ausgegeben = 0, reserviert = 0, ueberfaellig = 0;
  for (const v of vorgaenge) {
    if (v.status === 'ausgegeben') ausgegeben++;
    else if (v.status === 'reserviert') reserviert++;
    if (istUeberfaellig(v, heuteIso)) ueberfaellig++;
  }
  return { ausgegeben, reserviert, ueberfaellig };
}
