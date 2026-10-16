// ============================================================================
// ARGONAUT OS · lib/projektKlammer.ts — HW-16 Projekt als Klammer (16.10.2026)
//
// ▄▄▄ DIE LÜCKE (Claude-Befund aus dem Handwerk-Durchgang) ▄▄▄
//  Auftrag, Einsatz und Aufmaß kannten kein Projekt (Aufmaß nur als Freitext),
//  die Dispo legte Einsätze ohne Auftrag an, und die Projektseite zeigte nur
//  Aufgaben. Vorgänge einer Baustelle standen verstreut nebeneinander.
//
// ▄▄▄ DIE LÖSUNG ▄▄▄
//  · SQL p383: projekt_id an auftraege, einsaetze, aufmasse (additiv).
//  · Formulare schicken projekt_id nur mit, wenn die Spalte schon da ist bzw.
//    ein Projekt gewählt wurde — läuft also auch vor dem SQL.
//  · projektZuName(): Freitext-Projekt im Aufmaß → Projekt, nur bei genau
//    einem Treffer (sonst bleibt es Freitext).
//  · einsatzAusAuftrag(): Dispo übernimmt Titel, Kunde und Projekt vom Auftrag.
//  · vorgaengeZaehlen(): Übersicht je Projekt für die Projektseite.
//
// Reine Funktionen. Node-getestet: tests/projektKlammerHW16.test.mjs
// ============================================================================

export type ProjektKurz = { id: string; name: string | null };

/** Freitext → Projekt-ID, nur bei genau einem Namens-Treffer (Groß/klein egal). */
export function projektZuName(name: unknown, projekte: readonly ProjektKurz[] | null | undefined): string | null {
  const n = String(name ?? '').trim().toLowerCase();
  if (!n) return null;
  const treffer = (Array.isArray(projekte) ? projekte : []).filter((p) => String(p.name ?? '').trim().toLowerCase() === n);
  return treffer.length === 1 ? treffer[0].id : null;
}

/**
 * projekt_id nur mitschicken, wenn die Spalte schon da ist (sonst {} — läuft vor dem SQL).
 */
export function projektFeld(gewaehlt: string | null | undefined, spalteDa: boolean): { projekt_id?: string | null } {
  if (!spalteDa) return {};
  const id = String(gewaehlt ?? '').trim();
  return { projekt_id: id || null };
}

/** Ist die Spalte projekt_id schon da? (Datensätze aus select('*') tragen dann den Schlüssel.) */
export function hatProjektSpalte(rows: readonly object[] | null | undefined): boolean {
  return Array.isArray(rows) && rows.length > 0 && Object.prototype.hasOwnProperty.call(rows[0], 'projekt_id');
}

export type AuftragKurz = {
  id: string; titel: string | null; projekt_id?: string | null;
  kunde_name?: string | null; kontakt_id?: string | null;
};

/** Dispo: Auftrag gewählt → Felder des Einsatzes vorbelegen (eigene Eingaben bleiben). */
export function einsatzAusAuftrag(
  a: AuftragKurz | null | undefined,
  bisher: { titel: string; kunde_name: string },
): { auftrag_id: string; projekt_id: string; titel: string; kunde_name: string } {
  if (!a) return { auftrag_id: '', projekt_id: '', titel: bisher.titel, kunde_name: bisher.kunde_name };
  return {
    auftrag_id: a.id,
    projekt_id: String(a.projekt_id ?? ''),
    titel: bisher.titel.trim() ? bisher.titel : String(a.titel ?? '').slice(0, 200),
    kunde_name: bisher.kunde_name.trim() ? bisher.kunde_name : String(a.kunde_name ?? ''),
  };
}

export type Vorgaenge = {
  auftraege: number; einsaetze: number; aufmasse: number; lvs: number;
  abnahmen: number; tagebuch: number; maengelOffen: number;
};

/** Zählt die Vorgänge eines Projekts; fehlende Listen (Spalte noch nicht da) = 0. */
export function vorgaengeZaehlen(l: {
  auftraege?: readonly unknown[] | null; einsaetze?: readonly unknown[] | null; aufmasse?: readonly unknown[] | null;
  lvs?: readonly unknown[] | null; abnahmen?: readonly unknown[] | null; tagebuch?: readonly unknown[] | null;
  maengel?: readonly { status?: string | null }[] | null;
}): Vorgaenge {
  const n = (x: readonly unknown[] | null | undefined) => (Array.isArray(x) ? x.length : 0);
  return {
    auftraege: n(l.auftraege), einsaetze: n(l.einsaetze), aufmasse: n(l.aufmasse), lvs: n(l.lvs),
    abnahmen: n(l.abnahmen), tagebuch: n(l.tagebuch),
    maengelOffen: (l.maengel ?? []).filter((m) => m.status !== 'behoben' && m.status !== 'abgenommen').length,
  };
}
