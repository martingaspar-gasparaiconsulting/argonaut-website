// ============================================================================
// ARGONAUT OS · lib/adsAnalytics.ts — reine Kennzahlen für die Ads-Auswertung
// (Ads Paket 4 · Auswertung/Analytics-Cockpit)
//
// KEINE Netzwerk-/Supabase-Aufrufe — nur pure, node-testbare Formeln. In P4
// trägt der Betrieb die Ist-Kennzahlen je Kampagne selbst ein (Ausgaben,
// Impressionen, Klicks, Conversions, Umsatz); sobald die Werbekonten Insights
// liefern (Folgepaket), füllt ARGONAUT diese Werte automatisch.
// ============================================================================

export type AdsErgebnis = {
  ausgaben?: number | null;
  impressionen?: number | null;
  klicks?: number | null;
  conversions?: number | null;
  umsatz?: number | null;
};

/** Nicht-negative Zahl aus beliebiger Eingabe (Komma/Punkt), sonst 0. */
export function zuZahl(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const s = String(v ?? '').trim().replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Zahl-Eingabe: akzeptiert Zahl ODER String (zuZahl parst beides). */
export type Zahlwert = number | string | null | undefined;

/** ROAS = Umsatz / Ausgaben (Return on Ad Spend). Ohne Ausgaben -> null. */
export function roas(umsatz: Zahlwert, ausgaben: Zahlwert): number | null {
  const a = zuZahl(ausgaben);
  if (a <= 0) return null;
  return Math.round((zuZahl(umsatz) / a) * 100) / 100;
}

/** Kosten pro Klick = Ausgaben / Klicks. */
export function cpc(ausgaben: Zahlwert, klicks: Zahlwert): number | null {
  const k = zuZahl(klicks);
  if (k <= 0) return null;
  return Math.round((zuZahl(ausgaben) / k) * 100) / 100;
}

/** Tausend-Kontakt-Preis = Ausgaben / Impressionen × 1000. */
export function cpm(ausgaben: Zahlwert, impressionen: Zahlwert): number | null {
  const i = zuZahl(impressionen);
  if (i <= 0) return null;
  return Math.round((zuZahl(ausgaben) / i) * 1000 * 100) / 100;
}

/** Klickrate = Klicks / Impressionen (als Anteil 0..1). */
export function ctr(klicks: Zahlwert, impressionen: Zahlwert): number | null {
  const i = zuZahl(impressionen);
  if (i <= 0) return null;
  return zuZahl(klicks) / i;
}

/** Kosten pro Conversion/Lead = Ausgaben / Conversions. */
export function cpa(ausgaben: Zahlwert, conversions: Zahlwert): number | null {
  const c = zuZahl(conversions);
  if (c <= 0) return null;
  return Math.round((zuZahl(ausgaben) / c) * 100) / 100;
}

/** Summiert eine Liste von Ergebnis-Zeilen zu einem Gesamt-Ergebnis. */
export function aggregiere(liste: AdsErgebnis[] | null | undefined): Required<AdsErgebnis> {
  const out = { ausgaben: 0, impressionen: 0, klicks: 0, conversions: 0, umsatz: 0 };
  for (const e of liste || []) {
    out.ausgaben += zuZahl(e?.ausgaben);
    out.impressionen += zuZahl(e?.impressionen);
    out.klicks += zuZahl(e?.klicks);
    out.conversions += zuZahl(e?.conversions);
    out.umsatz += zuZahl(e?.umsatz);
  }
  out.ausgaben = Math.round(out.ausgaben * 100) / 100;
  out.umsatz = Math.round(out.umsatz * 100) / 100;
  return out;
}

/** Monats-Hochrechnung eines Tagesbudgets (Ø 30,4 Tage/Monat). */
export function monatsHochrechnung(tagesbudget: number | null | undefined): number {
  return Math.round(zuZahl(tagesbudget) * 30.4 * 100) / 100;
}

/** Summe der Tagesbudgets über Kampagnen mit einem der angegebenen Status. */
export function summeTagesbudget(
  kampagnen: { tagesbudget?: number | null; status?: string | null }[] | null | undefined,
  statusFilter: string[],
): number {
  let s = 0;
  for (const k of kampagnen || []) {
    if (statusFilter.includes((k?.status || '') as string)) s += zuZahl(k?.tagesbudget);
  }
  return Math.round(s * 100) / 100;
}

/** Euro-Format (de-DE). null-sicher. */
export function formatEuro(n: number | null | undefined): string {
  const w = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return w.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/** Ganze Zahl mit Tausenderpunkten (de-DE). */
export function formatZahl(n: number | null | undefined): string {
  const w = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0;
  return w.toLocaleString('de-DE');
}

/** Prozent aus Anteil (0..1), z. B. 0,0234 -> „2,34 %". null -> „—". */
export function formatProzent(anteil: number | null | undefined): string {
  if (anteil == null || !Number.isFinite(anteil)) return '—';
  return `${(anteil * 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

/** ROAS-Bewertung -> Ampel-Farbschlüssel ('gut'|'mittel'|'schwach'|'neutral'). */
export function roasAmpel(r: number | null | undefined): 'gut' | 'mittel' | 'schwach' | 'neutral' {
  if (r == null) return 'neutral';
  if (r >= 3) return 'gut';
  if (r >= 1) return 'mittel';
  return 'schwach';
}
