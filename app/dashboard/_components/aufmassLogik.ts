// ============================================================================
// ARGONAUT OS · Phase 2 · Modul E · Baustein "Aufmaß-Logik"
// Reine Logik — KEINE UI, KEINE externen Abhängigkeiten.
// Rechnet Positions- und Gesamtsummen eines Aufmaßes, formatiert Mengen sauber
// und liefert die zentralen Einheiten + Status-Definitionen.
// Generisch: Bau, GaLaBau, Maler, Forst.
// ============================================================================

// --- Einheiten (zentrale Liste) ---------------------------------------------
export const EINHEITEN = ['m²', 'lfm', 'Stück', 'm³', 'ha', 'fm', 'Std', 'kg', 't', 'pauschal'] as const;
export type Einheit = typeof EINHEITEN[number];

// --- Status -----------------------------------------------------------------
export type AufmassStatus = 'entwurf' | 'fertig' | 'abgerechnet';

export interface StatusDef {
  wert: AufmassStatus;
  label: string;
  farbe: string;
}
export const STATUS_LISTE: StatusDef[] = [
  { wert: 'entwurf',     label: 'Entwurf',     farbe: '#8FA3BE' },
  { wert: 'fertig',      label: 'Fertig',      farbe: '#4CAF7D' },
  { wert: 'abgerechnet', label: 'Abgerechnet', farbe: '#C9A84C' },
];
export function statusDef(status: string | null | undefined): StatusDef {
  return STATUS_LISTE.find((s) => s.wert === status) ?? STATUS_LISTE[0];
}

// --- Datentyp: schlank, passt auf DB-Zeilen ---------------------------------
export interface PositionBasis {
  bezeichnung?: string | null;
  menge?: number | null;
  einheit?: string | null;
  einzelpreis_netto?: number | null;
}

// --- Zahlen-/Mengen-Formatierung --------------------------------------------

/** Menge sauber: 12,5 statt 12.500; bis 3 Nachkommastellen, ohne Nullen. */
export function mengeText(menge: number | null | undefined, einheit?: string | null): string {
  const m = typeof menge === 'number' && Number.isFinite(menge) ? menge : 0;
  const txt = m.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return einheit ? `${txt} ${einheit}` : txt;
}

/** Euro-Format. */
export function eur(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// --- Betrag je Position -----------------------------------------------------

/** Menge × Einzelpreis (netto), oder null wenn kein Preis gesetzt. */
export function positionsBetrag(p: PositionBasis): number | null {
  const preis = p.einzelpreis_netto;
  if (preis == null || preis < 0) return null;
  const menge = typeof p.menge === 'number' && p.menge >= 0 ? p.menge : 0;
  return Math.round(menge * preis * 100) / 100;
}

// --- Gesamtsumme ------------------------------------------------------------

export interface MengeJeEinheit {
  einheit: string;
  menge: number;
  anzahl: number;   // wie viele Positionen dieser Einheit
}

export interface AufmassSumme {
  gesamtBetrag: number | null;      // null wenn mind. eine Position ohne Preis
  betragUnvollstaendig: boolean;
  anzahlPositionen: number;
  mengenJeEinheit: MengeJeEinheit[]; // z.B. [{einheit:'m²', menge:45.5}, {einheit:'lfm', menge:12}]
}

/** Summiert alle Positionen: Gesamtbetrag + Mengen je Einheit. */
export function aufmassSumme(positionen: PositionBasis[]): AufmassSumme {
  const s: AufmassSumme = {
    gesamtBetrag: 0, betragUnvollstaendig: false,
    anzahlPositionen: positionen.length, mengenJeEinheit: [],
  };
  const jeEinheit = new Map<string, { menge: number; anzahl: number }>();

  for (const p of positionen) {
    // Mengen je Einheit sammeln
    const einheit = (p.einheit || '—').trim() || '—';
    const menge = typeof p.menge === 'number' && p.menge >= 0 ? p.menge : 0;
    const vorhanden = jeEinheit.get(einheit) ?? { menge: 0, anzahl: 0 };
    vorhanden.menge += menge;
    vorhanden.anzahl += 1;
    jeEinheit.set(einheit, vorhanden);

    // Betrag
    const b = positionsBetrag(p);
    if (b == null) s.betragUnvollstaendig = true;
    else if (s.gesamtBetrag != null) s.gesamtBetrag += b;
  }

  if (s.betragUnvollstaendig) s.gesamtBetrag = null;
  else if (s.gesamtBetrag != null) s.gesamtBetrag = Math.round(s.gesamtBetrag * 100) / 100;

  s.mengenJeEinheit = Array.from(jeEinheit.entries())
    .map(([einheit, v]) => ({ einheit, menge: Math.round(v.menge * 1000) / 1000, anzahl: v.anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl);

  return s;
}

/** MwSt-Aufschlag (19%) auf einen Netto-Betrag. */
export function mitMwSt(netto: number | null): { netto: number; mwst: number; brutto: number } | null {
  if (netto == null) return null;
  const mwst = Math.round(netto * 0.19 * 100) / 100;
  return { netto, mwst, brutto: Math.round((netto + mwst) * 100) / 100 };
}
