// lib/einkauf.ts
// B-I · Warenfluss / Beschaffung — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Deckt Einkauf & Lieferanten, Wareneingang, Retouren/Reklamationen und
// Nachkalkulation ab. Alle Beträge netto.
// Handelskalkulation (verifiziert 07/2026):
//   Kalkulationszuschlag/Aufschlag = (VK − EK) / EK × 100  (bezogen auf EK)
//   Handelsspanne/Marge            = (VK − EK) / VK × 100  (bezogen auf VK)
// Node-getestet (einkauf.test.ts).

export type BestellStatus = 'entwurf' | 'bestellt' | 'teilgeliefert' | 'geliefert' | 'storniert';

export const BESTELL_STATUS: Record<BestellStatus, { label: string; farbe: 'gold' | 'cyan' | 'green' | 'textDim' | 'danger' | 'warn' }> = {
  entwurf:       { label: '📝 Entwurf',       farbe: 'textDim' },
  bestellt:      { label: '📦 Bestellt',      farbe: 'cyan' },
  teilgeliefert: { label: '🚚 Teilgeliefert', farbe: 'gold' },
  geliefert:     { label: '✓ Geliefert',      farbe: 'green' },
  storniert:     { label: '✕ Storniert',      farbe: 'textDim' },
};

function r2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }

export interface PositionLite {
  menge?: number;
  menge_erhalten?: number;
  retoure_menge?: number;
  ek_preis?: number;    // netto je Einheit
  mwst_satz?: number;
}

/** Netto-Wert einer Bestellposition (Menge × EK). */
export function positionNetto(p: PositionLite): number {
  return r2((Number(p.menge) || 0) * (Number(p.ek_preis) || 0));
}

/** Noch nicht gelieferte Menge (>= 0). */
export function offeneMenge(p: PositionLite): number {
  return Math.max((Number(p.menge) || 0) - (Number(p.menge_erhalten) || 0), 0);
}

/** Netto-Summe einer Bestellung über alle Positionen. */
export function bestellNetto(positionen: PositionLite[]): number {
  return r2(positionen.reduce((s, p) => s + positionNetto(p), 0));
}

/** Retoure-Menge-Summe über alle Positionen. */
export function retoureSumme(positionen: PositionLite[]): number {
  return positionen.reduce((s, p) => s + (Number(p.retoure_menge) || 0), 0);
}

/** Liefergrad aus den Positionen ableiten (unabhängig vom gespeicherten Status). */
export function lieferStatus(positionen: PositionLite[]): 'offen' | 'teilgeliefert' | 'geliefert' {
  if (positionen.length === 0) return 'offen';
  const gesamt = positionen.reduce((s, p) => s + (Number(p.menge) || 0), 0);
  const erhalten = positionen.reduce((s, p) => s + (Number(p.menge_erhalten) || 0), 0);
  if (erhalten <= 0) return 'offen';
  if (erhalten >= gesamt) return 'geliefert';
  return 'teilgeliefert';
}

// ---------------------------------------------------------------------------
// Kalkulation
// ---------------------------------------------------------------------------
export interface KalkErgebnis {
  ekNetto: number;
  selbstkosten: number;     // EK + Gemeinkosten
  vkNetto: number;
  rohertrag: number;        // VK − EK
  aufschlagProz: number;    // Kalkulationszuschlag (auf EK)
  handelsspanneProz: number; // Marge (auf VK)
}

/** Vorkalkulation: aus EK + Gemeinkosten-% + Gewinn-% den VK bestimmen. */
export function kalkuliereVk(ekNetto: number, gemeinkostenProz: number, gewinnProz: number): KalkErgebnis {
  const ek = r2(ekNetto);
  const selbstkosten = r2(ek * (1 + (Number(gemeinkostenProz) || 0) / 100));
  const vkNetto = r2(selbstkosten * (1 + (Number(gewinnProz) || 0) / 100));
  return baueKalk(ek, selbstkosten, vkNetto);
}

/** Nachkalkulation: aus tatsächlichem EK und erzieltem VK die Kennzahlen. */
export function margenAusVk(ekNetto: number, vkNetto: number, gemeinkostenProz: number = 0): KalkErgebnis {
  const ek = r2(ekNetto);
  const selbstkosten = r2(ek * (1 + (Number(gemeinkostenProz) || 0) / 100));
  return baueKalk(ek, selbstkosten, r2(vkNetto));
}

function baueKalk(ek: number, selbstkosten: number, vkNetto: number): KalkErgebnis {
  const rohertrag = r2(vkNetto - ek);
  const aufschlagProz = ek > 0 ? r2(((vkNetto - ek) / ek) * 100) : 0;
  const handelsspanneProz = vkNetto > 0 ? r2(((vkNetto - ek) / vkNetto) * 100) : 0;
  return { ekNetto: ek, selbstkosten, vkNetto, rohertrag, aufschlagProz, handelsspanneProz };
}

export function bruttoAusNetto(netto: number, mwstSatz: number = 19): { netto: number; mwst: number; brutto: number; mwstSatz: number } {
  const n = r2(netto); const satz = Number(mwstSatz) || 0;
  const mwst = r2(n * satz / 100);
  return { netto: n, mwst, brutto: r2(n + mwst), mwstSatz: satz };
}

// ---------------------------------------------------------------------------
// KPI-Zähler (für die Seite + augeEinkauf).
// ---------------------------------------------------------------------------
export interface BestellungLite {
  status?: string;
  positionen: PositionLite[];
}
export interface EinkaufKennzahlen {
  offeneBestellungen: number;   // bestellt/teilgeliefert
  wareneingangOffen: number;    // offene Bestellungen mit noch offener Menge
  retourenOffen: number;        // Positionen mit Retoure-Menge > 0
  bestellwertOffen: number;     // Netto-Summe offener Bestellungen
  lieferantenAktiv: number;
}

export function zaehleEinkauf(bestellungen: BestellungLite[], lieferanten: { status?: string }[] = []): EinkaufKennzahlen {
  let offeneBestellungen = 0, wareneingangOffen = 0, retourenOffen = 0, bestellwertOffen = 0;
  for (const b of bestellungen) {
    const st = b.status ?? 'entwurf';
    retourenOffen += b.positionen.filter((p) => (Number(p.retoure_menge) || 0) > 0).length;
    if (st === 'bestellt' || st === 'teilgeliefert') {
      offeneBestellungen++;
      bestellwertOffen += bestellNetto(b.positionen);
      if (b.positionen.some((p) => offeneMenge(p) > 0)) wareneingangOffen++;
    }
  }
  return {
    offeneBestellungen,
    wareneingangOffen,
    retourenOffen,
    bestellwertOffen: r2(bestellwertOffen),
    lieferantenAktiv: lieferanten.filter((l) => (l.status ?? 'aktiv') === 'aktiv').length,
  };
}
