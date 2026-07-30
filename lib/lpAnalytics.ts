// ============================================================================
// ARGONAUT OS · lib/lpAnalytics.ts — reine Helfer fuer Landingpage-Funnel
// (Marketing-Autopilot · Funnel-Analytics Paket 1)
//
// KEINE Supabase-Aufrufe, KEINE React-Hooks — nur pure Funktionen (node-testbar).
// Rechnet rohe Ereignis-Zeilen (typ: aufruf|anmeldung|bestaetigung) je Landingpage
// zu einem Funnel + Quoten zusammen.
// ============================================================================

export type LpEreignisTyp = 'aufruf' | 'anmeldung' | 'bestaetigung';

export type LpEreignis = {
  landingpage_id: string | null;
  typ: string | null;
};

export type LpFunnel = {
  landingpage_id: string;
  aufrufe: number;
  anmeldungen: number;
  bestaetigungen: number;
  quoteAnmeldung: number;    // Anmeldungen / Aufrufe (in %)
  quoteBestaetigung: number; // Bestaetigungen / Anmeldungen (in %)
};

export type LpFunnelGesamt = {
  aufrufe: number;
  anmeldungen: number;
  bestaetigungen: number;
  quoteAnmeldung: number;
  quoteBestaetigung: number;
};

/** Prozent mit einer Nachkommastelle; Nenner <= 0 -> 0. */
export function prozent(zaehler: number, nenner: number): number {
  if (!nenner || nenner <= 0) return 0;
  return Math.round((zaehler / nenner) * 1000) / 10;
}

/**
 * Zaehlt Ereignisse je Landingpage zusammen.
 * @param ereignisse rohe Zeilen aus lp_ereignisse
 * @param landingpageIds alle IDs des Betriebs (auch ohne Ereignisse -> erscheinen mit 0)
 * Reihenfolge folgt landingpageIds. Ereignisse zu unbekannten IDs werden ignoriert.
 */
export function funnelJeLandingpage(
  ereignisse: LpEreignis[],
  landingpageIds: string[],
): LpFunnel[] {
  const zaehler = new Map<string, { aufrufe: number; anmeldungen: number; bestaetigungen: number }>();
  for (const id of landingpageIds) {
    zaehler.set(id, { aufrufe: 0, anmeldungen: 0, bestaetigungen: 0 });
  }
  for (const e of ereignisse || []) {
    const id = e?.landingpage_id;
    if (!id) continue;
    const eintrag = zaehler.get(id);
    if (!eintrag) continue;
    if (e.typ === 'aufruf') eintrag.aufrufe++;
    else if (e.typ === 'anmeldung') eintrag.anmeldungen++;
    else if (e.typ === 'bestaetigung') eintrag.bestaetigungen++;
  }
  return landingpageIds.map((id) => {
    const z = zaehler.get(id) as { aufrufe: number; anmeldungen: number; bestaetigungen: number };
    return {
      landingpage_id: id,
      aufrufe: z.aufrufe,
      anmeldungen: z.anmeldungen,
      bestaetigungen: z.bestaetigungen,
      quoteAnmeldung: prozent(z.anmeldungen, z.aufrufe),
      quoteBestaetigung: prozent(z.bestaetigungen, z.anmeldungen),
    };
  });
}

/** Summiert mehrere Funnel zu einer Gesamt-Uebersicht. */
export function funnelGesamt(funnels: LpFunnel[]): LpFunnelGesamt {
  const s = { aufrufe: 0, anmeldungen: 0, bestaetigungen: 0 };
  for (const f of funnels || []) {
    s.aufrufe += f.aufrufe;
    s.anmeldungen += f.anmeldungen;
    s.bestaetigungen += f.bestaetigungen;
  }
  return {
    aufrufe: s.aufrufe,
    anmeldungen: s.anmeldungen,
    bestaetigungen: s.bestaetigungen,
    quoteAnmeldung: prozent(s.anmeldungen, s.aufrufe),
    quoteBestaetigung: prozent(s.bestaetigungen, s.anmeldungen),
  };
}
