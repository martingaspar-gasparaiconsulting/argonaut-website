// ============================================================================
// ARGONAUT OS · Modul D+ · Baustein "Leistungs-Logik"
// Reine Logik — KEINE UI, KEINE externen Abhängigkeiten.
// Das Rechenwerk fürs Werkstatt-Uhrwerk: Zeit-Umrechnung Minuten<->Stunden<->AW
// (mit werkstatt-eigenem AW-Faktor), Positions- und Auftragssummen, FIN-Prüfung,
// und die Übernahme einer Katalog-Leistung in eine (überschreibbare) Position.
// ============================================================================

export type Erfassungsart = 'minuten' | 'stunden' | 'aw' | 'stueck';

// --- Datentypen: schlank, passen auf Zeilen der DB ---------------------------
export interface KatalogEintrag {
  id?: string;
  bezeichnung?: string | null;
  kuerzel?: string | null;
  kategorie?: string | null;
  erfassungsart?: string | null;      // minuten | stunden | aw
  standard_wert?: number | null;      // z.B. 1 (Std) / 12 (AW) / 20 (Min)
  aw_minuten?: number | null;         // 1 AW = wieviele Minuten
  stundensatz_netto?: number | null;
  festpreis_netto?: number | null;
}

export interface PositionBasis {
  art?: string | null;                // leistung | material | fremdleistung
  bezeichnung?: string | null;
  erfassungsart?: string | null;      // minuten | stunden | aw | stueck
  menge?: number | null;
  aw_minuten?: number | null;         // Snapshot des Faktors (falls aw)
  einzelpreis_netto?: number | null;  // Snapshot Preis (überschreibbar)
  extern?: boolean | null;
}

// --- Zeit-Umrechnung (Herzstück) ---------------------------------------------

const STD_AW_MIN_DEFAULT = 6; // Fallback: 1 AW = 6 Minuten (branchenüblich ~ 5–6)

/**
 * Wandelt eine erfasste Menge in MINUTEN um — je nach Erfassungsart.
 *  - 'minuten' -> Menge selbst
 *  - 'stunden' -> Menge * 60
 *  - 'aw'      -> Menge * awMinuten (werkstatt-eigener Faktor)
 *  - 'stueck'  -> 0 (Stück ist keine Zeit)
 */
export function nachMinuten(
  menge: number | null | undefined,
  art: string | null | undefined,
  awMinuten?: number | null,
): number {
  const m = !menge || menge < 0 ? 0 : menge;
  const faktor = awMinuten && awMinuten > 0 ? awMinuten : STD_AW_MIN_DEFAULT;
  switch (art) {
    case 'minuten': return m;
    case 'stunden': return m * 60;
    case 'aw':      return m * faktor;
    case 'stueck':  return 0;
    default:        return m * 60; // Default wie 'stunden'
  }
}

/** Minuten als Zeit-Text: "1 Std 30 Min", "45 Min", "2 Std". */
export function zeitText(minuten: number | null | undefined): string {
  let m = !minuten || minuten < 0 ? 0 : Math.round(minuten);
  const std = Math.floor(m / 60); m -= std * 60;
  const teile: string[] = [];
  if (std > 0) teile.push(`${std} Std`);
  if (m > 0) teile.push(`${m} Min`);
  return teile.length > 0 ? teile.join(' ') : '0 Min';
}

/** Minuten in Dezimalstunden (für Preisberechnung). */
export function minutenZuStunden(minuten: number | null | undefined): number {
  if (!minuten || minuten < 0) return 0;
  return minuten / 60;
}

// --- Preis je Position -------------------------------------------------------

/**
 * Betrag einer Position (netto), oder null wenn nicht kalkulierbar.
 * Regel:
 *  - Material/Stück: menge * einzelpreis
 *  - Zeit-Leistung:  wenn einzelpreis gesetzt = Stundensatz -> Stunden * Satz
 *                    (bei 'aw' zählt die umgerechnete Zeit)
 *  - Fehlt der Preis -> null (ehrlich "nicht kalkulierbar")
 */
export function positionsBetrag(p: PositionBasis): number | null {
  const preis = p.einzelpreis_netto;
  if (preis == null || preis < 0) return null;

  if (p.art === 'material' || p.erfassungsart === 'stueck') {
    const menge = !p.menge || p.menge < 0 ? 0 : p.menge;
    return Math.round(menge * preis * 100) / 100;
  }

  // Zeit-basiert: einzelpreis gilt als Stundensatz
  const min = nachMinuten(p.menge, p.erfassungsart, p.aw_minuten);
  const stunden = minutenZuStunden(min);
  return Math.round(stunden * preis * 100) / 100;
}

/** Minuten einer Position (0 bei Material/Stück). */
export function positionsMinuten(p: PositionBasis): number {
  if (p.art === 'material' || p.erfassungsart === 'stueck') return 0;
  return nachMinuten(p.menge, p.erfassungsart, p.aw_minuten);
}

// --- Auftragssumme -----------------------------------------------------------

export interface AuftragsSumme {
  gesamtMinuten: number;
  gesamtBetrag: number | null;   // null wenn mind. eine Position ohne Preis
  betragUnvollstaendig: boolean;
  anzahlPositionen: number;
  anzahlExtern: number;
}

/** Summiert alle Positionen eines Auftrags: Zeit + Betrag. */
export function auftragsSumme(positionen: PositionBasis[]): AuftragsSumme {
  const s: AuftragsSumme = {
    gesamtMinuten: 0, gesamtBetrag: 0, betragUnvollstaendig: false,
    anzahlPositionen: positionen.length, anzahlExtern: 0,
  };
  for (const p of positionen) {
    s.gesamtMinuten += positionsMinuten(p);
    if (p.extern) s.anzahlExtern++;
    const b = positionsBetrag(p);
    if (b == null) {
      // Nur Zeit-/Material-Positionen ohne Preis machen die Summe unvollständig;
      // reine Info-Positionen (art=fremdleistung ohne Preis) zählen auch als offen.
      s.betragUnvollstaendig = true;
    } else if (s.gesamtBetrag != null) {
      s.gesamtBetrag += b;
    }
  }
  if (s.betragUnvollstaendig) s.gesamtBetrag = null;
  else if (s.gesamtBetrag != null) s.gesamtBetrag = Math.round(s.gesamtBetrag * 100) / 100;
  return s;
}

// --- Katalog -> Position (das "übernehmen") ----------------------------------

/**
 * Macht aus einer Katalog-Leistung eine übernehmbare Position.
 * Werte werden als Snapshot kopiert (aw_minuten, Preis) — damit spätere
 * Katalog-Änderungen alte Aufträge NICHT rückwirkend verändern.
 * Alles bleibt danach frei überschreibbar.
 */
export function katalogNachPosition(k: KatalogEintrag): PositionBasis {
  const art = (k.erfassungsart as Erfassungsart) || 'stunden';
  // Preis-Snapshot: Zeit -> Stundensatz; Festpreis -> als einzelpreis (bei 1 Menge)
  let einzelpreis: number | null = null;
  if (k.stundensatz_netto != null) einzelpreis = k.stundensatz_netto;
  else if (k.festpreis_netto != null) einzelpreis = k.festpreis_netto;

  return {
    art: 'leistung',
    bezeichnung: k.bezeichnung ?? '',
    erfassungsart: art,
    menge: k.standard_wert ?? 1,
    aw_minuten: art === 'aw' ? (k.aw_minuten ?? STD_AW_MIN_DEFAULT) : null,
    einzelpreis_netto: einzelpreis,
    extern: false,
  };
}

// --- FIN / VIN-Prüfung -------------------------------------------------------

/**
 * Prüft, ob eine FIN/VIN formal gültig aussieht.
 * Regeln: genau 17 Zeichen, nur A–Z/0–9, KEIN I, O, Q (Norm ISO 3779).
 * (Keine Prüfziffern-Validierung — die ist bei EU-Fahrzeugen optional.)
 */
export function finGueltig(fin: string | null | undefined): boolean {
  if (!fin) return false;
  const f = fin.trim().toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(f);
}

/** Normalisiert eine FIN (Großbuchstaben, ohne Leerzeichen). */
export function finNormalisieren(fin: string | null | undefined): string {
  return (fin ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

// --- Euro-Helper -------------------------------------------------------------
export function eur(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
