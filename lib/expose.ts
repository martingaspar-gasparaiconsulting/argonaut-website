// lib/expose.ts
// B-IV · Immobilien-Tiefe · Exposé & Vermarktung — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Recht (verifiziert 07/2026):
//   GEG §87 — Pflichtangaben in kommerziellen Immobilienanzeigen (wenn Ausweis
//   vorliegt): Art (Bedarf/Verbrauch), Endenergiewert kWh/(m²·a), wesentlicher
//   Energieträger der Heizung, Baujahr, Energieeffizienzklasse. Gilt auch für Makler.
//   Energieeffizienzklassen (GEG Anlage 10): A+ <30 · A ≤50 · B ≤75 · C ≤100 ·
//   D ≤130 · E ≤160 · F ≤200 · G ≤250 · H >250 kWh/(m²·a).
// Node-getestet (expose.test.ts).

export type ObjektArt = 'wohnung' | 'haus' | 'gewerbe' | 'grundstueck';
export type VermarktungArt = 'kauf' | 'miete';
export type AusweisTyp = 'bedarf' | 'verbrauch';
export type ExposeStatus = 'entwurf' | 'aktiv' | 'reserviert' | 'verkauft' | 'vermietet';

export const OBJEKT_ARTEN: { key: ObjektArt; label: string }[] = [
  { key: 'wohnung', label: 'Wohnung' },
  { key: 'haus', label: 'Haus' },
  { key: 'gewerbe', label: 'Gewerbe' },
  { key: 'grundstueck', label: 'Grundstück' },
];
export const VERMARKTUNG_ARTEN: { key: VermarktungArt; label: string; preisLabel: string }[] = [
  { key: 'kauf', label: 'Kauf', preisLabel: 'Kaufpreis' },
  { key: 'miete', label: 'Miete', preisLabel: 'Kaltmiete/Monat' },
];
export const AUSWEIS_TYPEN: { key: AusweisTyp; label: string }[] = [
  { key: 'verbrauch', label: 'Verbrauchsausweis' },
  { key: 'bedarf', label: 'Bedarfsausweis' },
];

export const STATUS_INFO: Record<ExposeStatus, { label: string; farbe: 'gold' | 'cyan' | 'green' | 'textDim' | 'danger' | 'warn' }> = {
  entwurf:   { label: '📝 Entwurf',   farbe: 'textDim' },
  aktiv:     { label: '📣 Aktiv',     farbe: 'cyan' },
  reserviert:{ label: '🔒 Reserviert', farbe: 'gold' },
  verkauft:  { label: '✓ Verkauft',   farbe: 'green' },
  vermietet: { label: '✓ Vermietet',  farbe: 'green' },
};

function r2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }

// ---------------------------------------------------------------------------
// Energieeffizienzklasse aus Endenergie-Kennwert (kWh/m²a) — GEG Anlage 10.
// ---------------------------------------------------------------------------
export const ENERGIE_KLASSEN: { klasse: string; bis: number }[] = [
  { klasse: 'A+', bis: 30 },   // < 30
  { klasse: 'A', bis: 50 },
  { klasse: 'B', bis: 75 },
  { klasse: 'C', bis: 100 },
  { klasse: 'D', bis: 130 },
  { klasse: 'E', bis: 160 },
  { klasse: 'F', bis: 200 },
  { klasse: 'G', bis: 250 },
];

/** Energieeffizienzklasse aus dem Endenergie-Kennwert. A+ = unter 30, H = über 250. */
export function energieKlasse(kennwert: number | null | undefined): string | null {
  const k = Number(kennwert);
  if (!(k > 0)) return null;
  if (k < 30) return 'A+';
  for (const e of ENERGIE_KLASSEN) {
    if (e.klasse === 'A+') continue;
    if (k <= e.bis) return e.klasse;
  }
  return 'H';
}

// ---------------------------------------------------------------------------
// Preis-Kennzahlen
// ---------------------------------------------------------------------------
/** Preis je m² Wohnfläche (0 wenn Fläche fehlt). */
export function preisProM2(preis: number, wohnflaeche: number): number {
  const f = Number(wohnflaeche) || 0;
  if (f <= 0) return 0;
  return r2((Number(preis) || 0) / f);
}

export interface ProvisionErgebnis { basis: number; prozent: number; netto: number; mwst: number; brutto: number; }
/** Provision/Courtage aus Basis (z.B. Kaufpreis) und Prozentsatz, inkl. 19% USt. */
export function provision(basis: number, prozent: number, mwstSatz: number = 19): ProvisionErgebnis {
  const netto = r2((Number(basis) || 0) * (Number(prozent) || 0) / 100);
  const mwst = r2(netto * (Number(mwstSatz) || 0) / 100);
  return { basis: r2(basis), prozent: Number(prozent) || 0, netto, mwst, brutto: r2(netto + mwst) };
}

// ---------------------------------------------------------------------------
// GEG-Pflichtangaben-Prüfung
// ---------------------------------------------------------------------------
export interface ExposeLite {
  status?: string;
  vermarktung_art?: string;
  objekt_art?: string;
  preis?: number;
  wohnflaeche?: number | null;
  energieausweis_vorhanden?: boolean;
  energie_typ?: string | null;
  energiekennwert?: number | null;
  energietraeger?: string | null;
  baujahr?: number | null;
}

/** Sind die GEG-§87-Pflichtangaben vollständig? (Grundstücke sind ausgenommen.) */
export function pflichtangabenVollstaendig(e: ExposeLite): boolean {
  if (e.objekt_art === 'grundstueck') return true;
  if (e.energieausweis_vorhanden === false) return true; // Ausnahme: Ausweis liegt (noch) nicht vor
  return Boolean(e.energie_typ) && Number(e.energiekennwert) > 0 &&
    Boolean(e.energietraeger) && Number(e.baujahr) > 0;
}

/** Fehlende Pflichtfelder als Liste (für Hinweise). */
export function fehlendePflichtangaben(e: ExposeLite): string[] {
  if (e.objekt_art === 'grundstueck' || e.energieausweis_vorhanden === false) return [];
  const fehlt: string[] = [];
  if (!e.energie_typ) fehlt.push('Ausweis-Art');
  if (!(Number(e.energiekennwert) > 0)) fehlt.push('Energiekennwert');
  if (!e.energietraeger) fehlt.push('Energieträger');
  if (!(Number(e.baujahr) > 0)) fehlt.push('Baujahr');
  return fehlt;
}

// ---------------------------------------------------------------------------
// KPI-Zähler (für die Seite + augeExpose).
// ---------------------------------------------------------------------------
export interface ExposeKennzahlen {
  aktiv: number;
  reserviert: number;
  abgeschlossen: number;      // verkauft + vermietet
  volumenAktiv: number;       // Summe Kaufpreise aktiver Kauf-Objekte
  pflichtLuecken: number;     // aktive Exposés mit unvollständigen GEG-Angaben
}

export function zaehleExpose(exposes: ExposeLite[]): ExposeKennzahlen {
  let aktiv = 0, reserviert = 0, abgeschlossen = 0, volumenAktiv = 0, pflichtLuecken = 0;
  for (const e of exposes) {
    const st = e.status ?? 'entwurf';
    if (st === 'aktiv') {
      aktiv++;
      if (e.vermarktung_art === 'kauf') volumenAktiv += Number(e.preis) || 0;
      if (!pflichtangabenVollstaendig(e)) pflichtLuecken++;
    } else if (st === 'reserviert') {
      reserviert++;
    } else if (st === 'verkauft' || st === 'vermietet') {
      abgeschlossen++;
    }
  }
  return { aktiv, reserviert, abgeschlossen, volumenAktiv: r2(volumenAktiv), pflichtLuecken };
}

// ---------------------------------------------------------------------------
// Interessenten / Leads je Objekt (Andockpunkt B-IV, Mini-Paket 1)
// ---------------------------------------------------------------------------
export type InteressentStatus = 'neu' | 'besichtigung' | 'angebot' | 'zusage' | 'abgesagt';

export const INTERESSENT_STATUS: { key: InteressentStatus; label: string }[] = [
  { key: 'neu',          label: 'Neu' },
  { key: 'besichtigung', label: 'Besichtigung' },
  { key: 'angebot',      label: 'Angebot' },
  { key: 'zusage',       label: 'Zusage' },
  { key: 'abgesagt',     label: 'Abgesagt' },
];
export function interessentStatusLabel(k: string): string {
  return INTERESSENT_STATUS.find((s) => s.key === k)?.label ?? k;
}
/** Offener Lead = noch in Bearbeitung (weder zugesagt noch abgesagt). */
export function istOffenerLead(status: string): boolean {
  return status !== 'abgesagt' && status !== 'zusage';
}

export interface InteressentLite { expose_id?: string; status?: string }
export interface InteressentKennzahlen { gesamt: number; offen: number; besichtigungen: number; angebote: number; zusagen: number; }

export function zaehleInteressenten(list: InteressentLite[]): InteressentKennzahlen {
  let gesamt = 0, offen = 0, besichtigungen = 0, angebote = 0, zusagen = 0;
  for (const i of list || []) {
    gesamt++;
    const s = i.status ?? 'neu';
    if (istOffenerLead(s)) offen++;
    if (s === 'besichtigung') besichtigungen++;
    if (s === 'angebot') angebote++;
    if (s === 'zusage') zusagen++;
  }
  return { gesamt, offen, besichtigungen, angebote, zusagen };
}
