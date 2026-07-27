// ============================================================================
// ARGONAUT OS · lib/aufwand.ts — Aufwand-Cockpit-Formeln (Baustein 3)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks. Bringt die zwei
// abrechenbaren Aufwand-Quellen — Projekt-Leistungen (projektleistungen) und
// abrechenbare Objektzeiten (objekt_zeiten) — auf einen gemeinsamen Nenner:
// offen vs. abgerechnet, Stunden + Betrag, gruppiert je Projekt/Objekt.
// Die HR-Stempeluhr bleibt bewusst außen vor (gesetzliche Arbeitszeit ≠ Umsatz).
// ============================================================================

export type AufwandQuelle = 'projekt' | 'objekt';

export interface AufwandEintrag {
  quelle: AufwandQuelle;
  gruppeId: string;   // projekt_id bzw. objekt_id
  gruppeName: string;
  stunden: number;
  betrag: number;     // netto
  offen: boolean;     // noch nicht abgerechnet
}

export interface AufwandGruppe {
  quelle: AufwandQuelle;
  gruppeId: string;
  gruppeName: string;
  stundenOffen: number;
  betragOffen: number;
  anzahlOffen: number;
  betragAbg: number;
  anzahlAbg: number;
}

// --- Normalisierer je Quelle ------------------------------------------------

export function ausProjektleistung(
  l: { projekt_id?: string | null; stunden?: number | null; stundensatz?: number | null; abgerechnet?: boolean | null },
  name: string,
): AufwandEintrag {
  const stunden = Number(l.stunden) || 0;
  const betrag = stunden * (Number(l.stundensatz) || 0);
  return { quelle: 'projekt', gruppeId: String(l.projekt_id ?? ''), gruppeName: name, stunden, betrag, offen: !l.abgerechnet };
}

/**
 * Objektzeit -> Aufwand. Nur ABRECHENBARE Zeiten zählen (nicht abrechenbare
 * sind interner Aufwand, kein Umsatz). Satz je Zeile, sonst Objekt-Fallback.
 * Gibt null zurück, wenn die Zeit nicht abrechenbar ist.
 */
export function ausObjektzeit(
  z: { objekt_id?: string | null; dauer_minuten?: number | null; stundensatz_netto?: number | null; abrechenbar?: boolean | null; abgerechnet?: boolean | null },
  name: string,
  fallbackSatz = 0,
): AufwandEintrag | null {
  if (z.abrechenbar === false) return null;
  const stunden = (Number(z.dauer_minuten) || 0) / 60;
  const satz = Number(z.stundensatz_netto);
  const betrag = stunden * (Number.isFinite(satz) && satz > 0 ? satz : fallbackSatz);
  return { quelle: 'objekt', gruppeId: String(z.objekt_id ?? ''), gruppeName: name, stunden, betrag, offen: !z.abgerechnet };
}

// --- Aggregation ------------------------------------------------------------

/** Gruppiert Einträge je Quelle+Gruppe; sortiert nach offenem Betrag (desc). */
export function gruppiere(eintraege: AufwandEintrag[]): AufwandGruppe[] {
  const map = new Map<string, AufwandGruppe>();
  for (const e of eintraege) {
    const key = `${e.quelle}:${e.gruppeId}`;
    let g = map.get(key);
    if (!g) {
      g = { quelle: e.quelle, gruppeId: e.gruppeId, gruppeName: e.gruppeName, stundenOffen: 0, betragOffen: 0, anzahlOffen: 0, betragAbg: 0, anzahlAbg: 0 };
      map.set(key, g);
    }
    if (e.offen) { g.stundenOffen += e.stunden; g.betragOffen += e.betrag; g.anzahlOffen++; }
    else { g.betragAbg += e.betrag; g.anzahlAbg++; }
  }
  return [...map.values()].sort((a, b) => b.betragOffen - a.betragOffen);
}

/** Gesamt-Kennzahlen über alle Einträge. */
export function gesamt(eintraege: AufwandEintrag[]): { stundenOffen: number; betragOffen: number; anzahlOffen: number; betragAbg: number } {
  return eintraege.reduce(
    (s, e) => {
      if (e.offen) { s.stundenOffen += e.stunden; s.betragOffen += e.betrag; s.anzahlOffen++; }
      else s.betragAbg += e.betrag;
      return s;
    },
    { stundenOffen: 0, betragOffen: 0, anzahlOffen: 0, betragAbg: 0 },
  );
}
