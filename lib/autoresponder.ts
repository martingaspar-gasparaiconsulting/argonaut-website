// ============================================================================
// ARGONAUT OS · lib/autoresponder.ts — reine Helfer fuer Autoresponder-Sequenzen
// (Marketing-Autopilot Phase 2, Paket 1 · Fundament)
//
// KEINE Supabase-Aufrufe, KEINE React-Hooks — nur pure Funktionen, damit sie
// node-testbar sind und in Client + Server gleich genutzt werden koennen.
//
// Zeit-Modell: verzoegerung_tage = "Tage ab Eintritt" (absolut, nicht relativ
// zum Vorschritt). Schritt 1 ist meist Tag 0 (sofort), Schritt 2 z. B. Tag 2 …
// ============================================================================

export type SchrittLite = {
  position?: number | null;
  verzoegerung_tage?: number | null;
  aktiv?: boolean | null;
};

export type SequenzLite = {
  status?: string | null;
};

/** Schritte in Reihenfolge bringen: erst nach position, dann nach Verzoegerung. */
export function sortiereSchritte<T extends SchrittLite>(schritte: T[]): T[] {
  return [...(schritte || [])].sort((a, b) => {
    const pa = a?.position ?? 0;
    const pb = b?.position ?? 0;
    if (pa !== pb) return pa - pb;
    return (a?.verzoegerung_tage ?? 0) - (b?.verzoegerung_tage ?? 0);
  });
}

/** Sequenzen zaehlen: gesamt / aktiv / entwurf / pausiert. */
export function zaehleSequenzen(liste: SequenzLite[]): {
  gesamt: number;
  aktiv: number;
  entwurf: number;
  pausiert: number;
} {
  const l = liste || [];
  let aktiv = 0;
  let entwurf = 0;
  let pausiert = 0;
  for (const s of l) {
    const st = s?.status ?? 'entwurf';
    if (st === 'aktiv') aktiv++;
    else if (st === 'pausiert') pausiert++;
    else entwurf++;
  }
  return { gesamt: l.length, aktiv, entwurf, pausiert };
}

/** Kompakt-Info zu einer Sequenz: aktive Schrittzahl + Gesamtdauer in Tagen. */
export function sequenzInfo(schritte: SchrittLite[]): { anzahl: number; dauerTage: number } {
  const aktive = (schritte || []).filter((s) => s?.aktiv ?? true);
  const anzahl = aktive.length;
  let dauerTage = 0;
  for (const s of aktive) {
    const t = Math.max(0, Math.round(s?.verzoegerung_tage ?? 0));
    if (t > dauerTage) dauerTage = t;
  }
  return { anzahl, dauerTage };
}

/** Tage auf ein ISO-Datum addieren -> ISO (UTC-sicher; fuer den spaeteren Versand-Motor). */
export function tageAddieren(startISO: string, tage: number): string {
  const d = new Date(startISO);
  if (isNaN(d.getTime())) return startISO;
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(tage || 0)));
  return d.toISOString();
}

/** Naechstes Versand-Datum eines Schritts = Eintrittsdatum + Verzoegerung (Tage ab Eintritt). */
export function naechsterVersandAm(eintrittISO: string, verzoegerungTage: number): string {
  return tageAddieren(eintrittISO, verzoegerungTage);
}

/** Vorschlag fuer die Verzoegerung des naechsten Schritts (letzter + 2 Tage, mind. 0). */
export function naechsteVerzoegerung(schritte: SchrittLite[]): number {
  const sortiert = sortiereSchritte(schritte);
  if (sortiert.length === 0) return 0;
  const letzte = sortiert[sortiert.length - 1]?.verzoegerung_tage ?? 0;
  return Math.max(0, Math.round(letzte)) + 2;
}

/** Naechste freie Position (max+1). */
export function naechstePosition(schritte: SchrittLite[]): number {
  let max = 0;
  for (const s of schritte || []) {
    const p = s?.position ?? 0;
    if (p > max) max = p;
  }
  return max + 1;
}

/** Kurztext fuer die Verzoegerung eines Schritts ("Sofort" / "nach 1 Tag" / "nach n Tagen"). */
export function verzoegerungText(tage: number | null | undefined): string {
  const t = Math.max(0, Math.round(tage ?? 0));
  if (t === 0) return 'Sofort bei Eintritt';
  if (t === 1) return 'nach 1 Tag';
  return `nach ${t} Tagen`;
}

// ---------------------------------------------------------------------------
// Versand-Motor-Helfer (Paket 2) — weiterhin rein & node-testbar.
// ---------------------------------------------------------------------------

export type LaufLite = { status?: string | null };

/** Erster aktiver Schritt (in Reihenfolge) oder null. */
export function ersterAktiverSchritt<T extends SchrittLite>(schritte: T[]): T | null {
  const s = sortiereSchritte(schritte).filter((x) => x?.aktiv ?? true);
  return s.length ? s[0] : null;
}

/**
 * Aktueller faelliger Schritt fuer einen Lauf: der aktive Schritt mit
 * position >= naechstePosition (nimmt den naechsten, falls der urspruengliche
 * inzwischen geloescht/deaktiviert wurde). null = Sequenz durch.
 */
export function faelligerSchritt<T extends SchrittLite>(schritte: T[], naechstePosition: number): T | null {
  const s = sortiereSchritte(schritte).filter(
    (x) => (x?.aktiv ?? true) && (x?.position ?? 0) >= naechstePosition,
  );
  return s.length ? s[0] : null;
}

/** Naechster aktiver Schritt mit position > nachPosition, sonst null. */
export function naechsterAktiverSchrittNachPosition<T extends SchrittLite>(
  schritte: T[],
  nachPosition: number,
): T | null {
  const s = sortiereSchritte(schritte).filter(
    (x) => (x?.aktiv ?? true) && (x?.position ?? 0) > nachPosition,
  );
  return s.length ? s[0] : null;
}

/** Laeufe zaehlen: gesamt / aktiv / fertig / abgemeldet. */
export function zaehleLaeufe(liste: LaufLite[]): {
  gesamt: number;
  aktiv: number;
  fertig: number;
  abgemeldet: number;
} {
  const l = liste || [];
  let aktiv = 0;
  let fertig = 0;
  let abgemeldet = 0;
  for (const x of l) {
    const st = x?.status ?? 'aktiv';
    if (st === 'fertig') fertig++;
    else if (st === 'abgemeldet') abgemeldet++;
    else if (st === 'aktiv') aktiv++;
  }
  return { gesamt: l.length, aktiv, fertig, abgemeldet };
}
