// ============================================================================
// ARGONAUT OS · lib/newsletter.ts — reine Helfer für den Newsletter (Punkt 29)
//
// KEINE Supabase-Aufrufe, KEINE React-Hooks — nur pure Funktionen, damit sie
// node-testbar sind und in Client + Server gleich genutzt werden können.
// ============================================================================

export type AbonnentLite = {
  status?: string | null;
};

/** E-Mail vereinheitlichen: Leerzeichen weg, klein schreiben. */
export function emailNormalisieren(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

/** Einfache, robuste E-Mail-Prüfung (kein Overkill, fängt Tippfehler). */
export function istEmailGueltig(email: string | null | undefined): boolean {
  const e = emailNormalisieren(email);
  // genau ein @, davor/danach etwas, ein Punkt in der Domain, keine Leerzeichen
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Abonnenten zählen: gesamt / aktiv / abgemeldet. */
export function zaehleAbonnenten(liste: AbonnentLite[]): {
  gesamt: number;
  aktiv: number;
  abgemeldet: number;
} {
  const l = liste || [];
  let aktiv = 0;
  let abgemeldet = 0;
  for (const a of l) {
    if ((a?.status ?? 'aktiv') === 'abgemeldet') abgemeldet++;
    else aktiv++;
  }
  return { gesamt: l.length, aktiv, abgemeldet };
}
