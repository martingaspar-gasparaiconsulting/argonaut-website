// ============================================================================
// ARGONAUT OS · Modul D+ · Baustein "Leistungs-Logik"
// Reine Logik — KEINE UI, KEINE externen Abhängigkeiten.
// Das Rechenwerk fürs Werkstatt-Uhrwerk: Zeit-Umrechnung Minuten<->Stunden<->AW
// (mit werkstatt-eigenem AW-Faktor), Positions- und Auftragssummen, FIN-Prüfung,
// und die Übernahme einer Katalog-Leistung in eine (überschreibbare) Position.
//
// D1 — Zwei Korrekturen und eine Erweiterung:
//
//   (1) PAUSCHALE ≠ STUNDENSATZ.  Bis hierher wanderte `festpreis_netto` aus dem
//       Katalog in `einzelpreis_netto` der Position — und positionsBetrag() liest
//       den bei jeder Zeit-Leistung als Stundensatz. Aus "HU/AU, 0,5 Std, 130 €
//       Festpreis" wurden dadurch 65 €. Ab jetzt trägt die Position ein eigenes
//       Feld `festpreis_netto`. Ist es gesetzt, gewinnt es.
//
//   (2) PREIS UND ZEIT SIND ZWEI GRÖSSEN.  Eine Pauschale hat trotzdem eine Dauer.
//       `menge` + `erfassungsart` tragen weiterhin die Arbeitszeit, auch wenn der
//       Preis pauschal ist. Der Werkstatt-Durchlauf behält seine Auslastung.
//
//   (3) MENGEN-LEISTUNGEN.  `erfassungsart = 'stueck'` war im Typ vorhanden und in
//       positionsBetrag() korrekt behandelt, aber nirgends auswählbar. Sie trägt
//       jetzt zusätzlich ein Etikett `einheit` (ha | fm | Srm | Stück | lfm | m²).
//       Damit rechnet Forst (Hektar, Festmeter) mit demselben Baustein wie die
//       Werkstatt — ohne neue Erfassungsart und ohne neuen Zweig in nachMinuten().
// ============================================================================

export type Erfassungsart = 'minuten' | 'stunden' | 'aw' | 'stueck';

/** Etiketten für Mengen-Leistungen. Frei erweiterbar — reine Anzeige. */
export const EINHEITEN_MENGE = ['Stück', 'ha', 'fm', 'Srm', 'Rm', 'm³', 'm²', 'lfm', 'kg', 't'] as const;

// --- Datentypen: schlank, passen auf Zeilen der DB ---------------------------
export interface KatalogEintrag {
  id?: string;
  bezeichnung?: string | null;
  kuerzel?: string | null;
  kategorie?: string | null;
  erfassungsart?: string | null;      // minuten | stunden | aw | stueck
  standard_wert?: number | null;      // z.B. 1 (Std) / 12 (AW) / 20 (Min) / 2 (ha)
  aw_minuten?: number | null;         // 1 AW = wieviele Minuten
  stundensatz_netto?: number | null;  // €/h   — bei Zeit-Leistungen
  festpreis_netto?: number | null;    // €     — Pauschale, gewinnt gegen alles
  einheit?: string | null;            // Etikett bei erfassungsart='stueck'
  einheitspreis_netto?: number | null;// €/Einheit — bei erfassungsart='stueck'
  mwst_satz?: number | null;          // Prozent, Default 19
}

export interface PositionBasis {
  art?: string | null;                // leistung | material | fremdleistung
  bezeichnung?: string | null;
  erfassungsart?: string | null;      // minuten | stunden | aw | stueck
  menge?: number | null;
  einheit?: string | null;            // Etikett zur Menge (nur bei 'stueck')
  aw_minuten?: number | null;         // Snapshot des Faktors (falls aw)
  einzelpreis_netto?: number | null;  // Snapshot: Stundensatz ODER Preis je Einheit
  festpreis_netto?: number | null;    // Snapshot: Pauschale. Gewinnt gegen einzelpreis.
  extern?: boolean | null;
}

// --- Zeit-Umrechnung (Herzstück) ---------------------------------------------

const STD_AW_MIN_DEFAULT = 6; // Fallback: 1 AW = 6 Minuten (branchenüblich ~ 5–6)

/** Kaufmännisch auf zwei Nachkommastellen, symmetrisch um die Null. */
function runde(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const vz = n < 0 ? -1 : 1;
  return (vz * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
}

/**
 * Wandelt eine erfasste Menge in MINUTEN um — je nach Erfassungsart.
 *  - 'minuten' -> Menge selbst
 *  - 'stunden' -> Menge * 60
 *  - 'aw'      -> Menge * awMinuten (werkstatt-eigener Faktor)
 *  - 'stueck'  -> 0 (eine Menge ist keine Zeit)
 *
 * Unbekannte/leere Erfassungsart wird wie 'stunden' behandelt — das ist der
 * DB-Default und darf sich nicht ändern, sonst verlieren alte Zeilen ihre Zeit.
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

/** Ist das eine Mengen-Leistung (Hektar, Festmeter, Stück …)? */
export function istMengenLeistung(art: string | null | undefined): boolean {
  return art === 'stueck';
}

/** "2 ha", "8 Srm", "3 Stück" — oder nur die Zahl, wenn kein Etikett da ist. */
export function mengeText(menge: number | null | undefined, einheit?: string | null): string {
  const m = menge ?? 0;
  const zahl = m.toLocaleString('de-DE', { maximumFractionDigits: 3 });
  const e = (einheit ?? '').trim();
  return e ? `${zahl} ${e}` : zahl;
}

// --- Preis je Position -------------------------------------------------------

/**
 * Betrag einer Position (netto), oder null wenn nicht kalkulierbar.
 *
 * Reihenfolge — die erste zutreffende Regel gewinnt:
 *  1. PAUSCHALE: `festpreis_netto` gesetzt -> genau dieser Betrag.
 *     Die `menge` wird NICHT multipliziert; sie trägt bei Zeit-Leistungen die
 *     Dauer (HU: 0,5 Std) und würde die Pauschale sonst halbieren.
 *     Zwei TÜV-Prüfungen sind zwei Positionen.
 *  2. MENGE: Material oder 'stueck' -> menge * einzelpreis (= Preis je Einheit).
 *  3. ZEIT: einzelpreis gilt als Stundensatz -> Stunden * Satz.
 *     Bei 'aw' zählt die umgerechnete Zeit.
 *  Fehlt der Preis -> null ("nicht kalkulierbar", ehrlich statt 0,00 €).
 */
export function positionsBetrag(p: PositionBasis): number | null {
  if (p.festpreis_netto != null && p.festpreis_netto >= 0) {
    return runde(p.festpreis_netto);
  }

  const preis = p.einzelpreis_netto;
  if (preis == null || preis < 0) return null;

  if (p.art === 'material' || istMengenLeistung(p.erfassungsart)) {
    const menge = !p.menge || p.menge < 0 ? 0 : p.menge;
    return runde(menge * preis);
  }

  // Zeit-basiert: einzelpreis gilt als Stundensatz
  const min = nachMinuten(p.menge, p.erfassungsart, p.aw_minuten);
  const stunden = minutenZuStunden(min);
  return runde(stunden * preis);
}

/**
 * Minuten einer Position (0 bei Material/Menge).
 * Unabhängig vom Preis: eine Pauschale kostet trotzdem Zeit.
 */
export function positionsMinuten(p: PositionBasis): number {
  if (p.art === 'material' || istMengenLeistung(p.erfassungsart)) return 0;
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
  else if (s.gesamtBetrag != null) s.gesamtBetrag = runde(s.gesamtBetrag);
  return s;
}

// --- Katalog -> Position (das "übernehmen") ----------------------------------

/**
 * Macht aus einer Katalog-Leistung eine übernehmbare Position.
 * Werte werden als Snapshot kopiert (aw_minuten, Preise, Einheit) — damit spätere
 * Katalog-Änderungen alte Aufträge NICHT rückwirkend verändern.
 * Alles bleibt danach frei überschreibbar.
 *
 * Preis-Snapshot, in dieser Reihenfolge:
 *   festpreis_netto      -> als Pauschale, eigenes Feld
 *   erfassungsart stueck -> einheitspreis_netto als Preis je Einheit
 *   sonst                -> stundensatz_netto als Stundensatz
 */
export function katalogNachPosition(k: KatalogEintrag): PositionBasis {
  const art = (k.erfassungsart as Erfassungsart) || 'stunden';
  const menge = istMengenLeistung(art);
  const pauschale = k.festpreis_netto ?? null;

  let einzelpreis: number | null = null;
  if (pauschale == null) {
    einzelpreis = menge
      ? (k.einheitspreis_netto ?? null)
      : (k.stundensatz_netto ?? null);
  }

  return {
    art: 'leistung',
    bezeichnung: k.bezeichnung ?? '',
    erfassungsart: art,
    menge: k.standard_wert ?? 1,
    einheit: menge ? (k.einheit ?? null) : null,
    aw_minuten: art === 'aw' ? (k.aw_minuten ?? STD_AW_MIN_DEFAULT) : null,
    einzelpreis_netto: einzelpreis,
    festpreis_netto: pauschale,
    extern: false,
  };
}

/** Preisspalte im Katalog: "95,00 €/h", "45,00 €/Stück", "130,00 € pauschal", "—". */
export function preisText(k: KatalogEintrag): string {
  if (k.festpreis_netto != null) return `${eur(k.festpreis_netto)} pauschal`;
  if (istMengenLeistung(k.erfassungsart) && k.einheitspreis_netto != null) {
    return `${eur(k.einheitspreis_netto)}/${(k.einheit ?? 'Einheit').trim()}`;
  }
  if (k.stundensatz_netto != null) return `${eur(k.stundensatz_netto)}/h`;
  return '—';
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
