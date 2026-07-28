// lib/betriebskosten.ts
// B-IV Teil 2 · Betriebskostenabrechnung — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Recht (verifiziert 07/2026):
//   §2 BetrKV — 17 umlagefähige Kostenarten (Katalog unten).
//   §556a BGB — ohne Vereinbarung wird nach Wohnfläche umgelegt.
//   §7 HeizkostenV — Heiz-/Warmwasserkosten: mind. 50 %, höchstens 70 % nach
//   erfasstem Verbrauch; der Rest (Grundkosten) nach Wohn-/Nutzfläche.
// Node-getestet (betriebskosten.test.ts).

export type Verteiler = 'wohnflaeche' | 'personen' | 'einheiten' | 'verbrauch';

export const VERTEILER: { key: Verteiler; label: string }[] = [
  { key: 'wohnflaeche', label: 'Wohnfläche (m²)' },
  { key: 'personen', label: 'Personen' },
  { key: 'einheiten', label: 'Einheiten (gleich)' },
  { key: 'verbrauch', label: 'Verbrauch' },
];

// §2 BetrKV — Katalog mit üblichem Standard-Verteiler.
export interface BetrKvArt { nr: number; bezeichnung: string; verteiler: Verteiler; heiz?: boolean; }
export const BETRKV_KATALOG: BetrKvArt[] = [
  { nr: 1, bezeichnung: 'Grundsteuer', verteiler: 'wohnflaeche' },
  { nr: 2, bezeichnung: 'Wasserversorgung', verteiler: 'verbrauch' },
  { nr: 3, bezeichnung: 'Entwässerung', verteiler: 'wohnflaeche' },
  { nr: 4, bezeichnung: 'Heizung', verteiler: 'verbrauch', heiz: true },
  { nr: 5, bezeichnung: 'Warmwasser', verteiler: 'verbrauch', heiz: true },
  { nr: 6, bezeichnung: 'Verbundene Heizung/Warmwasser', verteiler: 'verbrauch', heiz: true },
  { nr: 7, bezeichnung: 'Aufzug', verteiler: 'einheiten' },
  { nr: 8, bezeichnung: 'Straßenreinigung & Müllbeseitigung', verteiler: 'wohnflaeche' },
  { nr: 9, bezeichnung: 'Gebäudereinigung & Ungezieferbekämpfung', verteiler: 'wohnflaeche' },
  { nr: 10, bezeichnung: 'Gartenpflege', verteiler: 'wohnflaeche' },
  { nr: 11, bezeichnung: 'Beleuchtung', verteiler: 'wohnflaeche' },
  { nr: 12, bezeichnung: 'Schornsteinreinigung', verteiler: 'einheiten' },
  { nr: 13, bezeichnung: 'Sach- & Haftpflichtversicherung', verteiler: 'wohnflaeche' },
  { nr: 14, bezeichnung: 'Hauswart/Hausmeister', verteiler: 'wohnflaeche' },
  { nr: 15, bezeichnung: 'Gemeinschaftsantenne/Breitband', verteiler: 'einheiten' },
  { nr: 16, bezeichnung: 'Wascheinrichtungen', verteiler: 'einheiten' },
  { nr: 17, bezeichnung: 'Sonstige Betriebskosten', verteiler: 'wohnflaeche' },
];

export const HEIZ_VERBRAUCH_MIN = 50;
export const HEIZ_VERBRAUCH_MAX = 70;
export const HEIZ_VERBRAUCH_STD = 70;

function r2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }

/** Verbrauchsanteil auf den zulässigen Bereich 50–70 % begrenzen. */
export function heizVerbrauchAnteil(prozent: number | null | undefined): number {
  if (prozent == null) return HEIZ_VERBRAUCH_STD;
  const p = Number(prozent);
  if (!Number.isFinite(p)) return HEIZ_VERBRAUCH_STD;
  return Math.min(Math.max(p, HEIZ_VERBRAUCH_MIN), HEIZ_VERBRAUCH_MAX);
}
export function heizAnteilGueltig(prozent: number): boolean {
  return Number(prozent) >= HEIZ_VERBRAUCH_MIN && Number(prozent) <= HEIZ_VERBRAUCH_MAX;
}

// ---------------------------------------------------------------------------
// Einheiten & Kostenarten
// ---------------------------------------------------------------------------
export interface EinheitLite {
  id?: string;
  wohnflaeche?: number;
  personen?: number;
  verbrauch?: number;
  vorauszahlung?: number;
}
export interface KostenartLite {
  id?: string;
  bezeichnung?: string;
  betrag_gesamt?: number;
  verteiler?: Verteiler;
  ist_heizkosten?: boolean;
  verbrauch_anteil_prozent?: number | null;
}

/** Basiswert einer Einheit für einen Verteilerschlüssel. */
export function basisWert(e: EinheitLite, v: Verteiler): number {
  if (v === 'wohnflaeche') return Number(e.wohnflaeche) || 0;
  if (v === 'personen') return Number(e.personen) || 0;
  if (v === 'verbrauch') return Number(e.verbrauch) || 0;
  return 1; // einheiten: jede Einheit gleich
}

export function summeBasis(einheiten: EinheitLite[], v: Verteiler): number {
  return einheiten.reduce((s, e) => s + basisWert(e, v), 0);
}

/** Anteil einer Einheit an EINER Kostenart (inkl. Heizkosten-Split nach HeizkostenV). */
export function anteilKostenart(k: KostenartLite, e: EinheitLite, einheiten: EinheitLite[]): number {
  const betrag = Number(k.betrag_gesamt) || 0;
  if (betrag === 0) return 0;
  const teile = (b: number, basisE: number, basisS: number) => (basisS > 0 ? b * (basisE / basisS) : 0);

  if (k.ist_heizkosten) {
    const vProz = heizVerbrauchAnteil(k.verbrauch_anteil_prozent);
    const verbrauchBetrag = betrag * vProz / 100;
    const grundBetrag = betrag - verbrauchBetrag;
    const anteilV = teile(verbrauchBetrag, basisWert(e, 'verbrauch'), summeBasis(einheiten, 'verbrauch'));
    const anteilG = teile(grundBetrag, basisWert(e, 'wohnflaeche'), summeBasis(einheiten, 'wohnflaeche'));
    return r2(anteilV + anteilG);
  }
  const v = k.verteiler ?? 'wohnflaeche';
  return r2(teile(betrag, basisWert(e, v), summeBasis(einheiten, v)));
}

export interface AbrechnungsPosition { bezeichnung: string; anteil: number; }
export interface EinheitAbrechnung {
  positionen: AbrechnungsPosition[];
  summeKosten: number;
  vorauszahlung: number;
  saldo: number; // > 0 = Nachzahlung, < 0 = Guthaben
}

/** Komplette Abrechnung für EINE Einheit über alle Kostenarten. */
export function abrechnungFuerEinheit(e: EinheitLite, kostenarten: KostenartLite[], einheiten: EinheitLite[]): EinheitAbrechnung {
  const positionen = kostenarten.map((k) => ({ bezeichnung: k.bezeichnung || 'Kostenart', anteil: anteilKostenart(k, e, einheiten) }));
  const summeKosten = r2(positionen.reduce((s, p) => s + p.anteil, 0));
  const vorauszahlung = r2(Number(e.vorauszahlung) || 0);
  return { positionen, summeKosten, vorauszahlung, saldo: r2(summeKosten - vorauszahlung) };
}

/** Kontrollsumme: verteilte Kosten über alle Einheiten je Kostenart = Gesamtbetrag? */
export function verteilteSumme(kostenarten: KostenartLite[], einheiten: EinheitLite[]): number {
  let s = 0;
  for (const k of kostenarten) for (const e of einheiten) s += anteilKostenart(k, e, einheiten);
  return r2(s);
}
export function gesamtKosten(kostenarten: KostenartLite[]): number {
  return r2(kostenarten.reduce((s, k) => s + (Number(k.betrag_gesamt) || 0), 0));
}

// ---------------------------------------------------------------------------
// KPI-Zähler
// ---------------------------------------------------------------------------
export interface BkKennzahlen {
  einheiten: number;
  kostenGesamt: number;
  vorauszahlungGesamt: number;
  saldoGesamt: number;      // Summe aller Salden (Nachzahlung − Guthaben)
  nachzahler: number;
  heizLuecken: number;      // Heizkosten-Positionen mit Verbrauchsanteil außerhalb 50–70 %
}

export function zaehleBk(einheiten: EinheitLite[], kostenarten: KostenartLite[]): BkKennzahlen {
  const kostenGesamt = gesamtKosten(kostenarten);
  const vorauszahlungGesamt = r2(einheiten.reduce((s, e) => s + (Number(e.vorauszahlung) || 0), 0));
  let saldoGesamt = 0, nachzahler = 0;
  for (const e of einheiten) {
    const a = abrechnungFuerEinheit(e, kostenarten, einheiten);
    saldoGesamt += a.saldo;
    if (a.saldo > 0) nachzahler++;
  }
  const heizLuecken = kostenarten.filter((k) => k.ist_heizkosten && k.verbrauch_anteil_prozent != null && !heizAnteilGueltig(Number(k.verbrauch_anteil_prozent))).length;
  return {
    einheiten: einheiten.length,
    kostenGesamt,
    vorauszahlungGesamt,
    saldoGesamt: r2(saldoGesamt),
    nachzahler,
    heizLuecken,
  };
}
