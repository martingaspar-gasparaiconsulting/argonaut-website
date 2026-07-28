// lib/proofing.ts
// Teil C · Singleton #3 — Assets & Freigaben / Proofing (Marketing/Agentur).
// Reine Formeln & Logik für den Freigabe-Workflow: Versionsstände + Kunden-
// Freigabe je Asset. KEINE Supabase-Aufrufe, KEINE React-Hooks (Client + Node).
// Node-getestet (proofing.test.ts).

export type VersionStatus = 'entwurf' | 'in_pruefung' | 'aenderung' | 'freigegeben' | 'abgelehnt';
export type FeedbackTyp = 'kommentar' | 'freigabe' | 'aenderung' | 'ablehnung';
export type AssetStatus = 'in_arbeit' | 'in_pruefung' | 'aenderung' | 'freigegeben' | 'abgelehnt';

export interface StatusInfo { key: string; label: string }

export const VERSION_STATUS: { key: VersionStatus; label: string }[] = [
  { key: 'entwurf',     label: 'Entwurf' },
  { key: 'in_pruefung', label: 'in Prüfung' },
  { key: 'aenderung',   label: 'Änderung gewünscht' },
  { key: 'freigegeben', label: 'freigegeben' },
  { key: 'abgelehnt',   label: 'abgelehnt' },
];

export const ASSET_STATUS: { key: AssetStatus; label: string }[] = [
  { key: 'in_arbeit',   label: 'in Arbeit' },
  { key: 'in_pruefung', label: 'in Prüfung' },
  { key: 'aenderung',   label: 'Änderung gewünscht' },
  { key: 'freigegeben', label: 'freigegeben' },
  { key: 'abgelehnt',   label: 'abgelehnt' },
];

export const FEEDBACK_TYPEN: { key: FeedbackTyp; label: string }[] = [
  { key: 'kommentar', label: 'Kommentar' },
  { key: 'freigabe',  label: 'Freigabe' },
  { key: 'aenderung', label: 'Änderung gewünscht' },
  { key: 'ablehnung', label: 'Ablehnung' },
];

export const KATEGORIEN: { key: string; label: string }[] = [
  { key: 'design', label: 'Design / Grafik' },
  { key: 'video',  label: 'Video / Motion' },
  { key: 'text',   label: 'Text / Copy' },
  { key: 'web',    label: 'Web / UI' },
  { key: 'print',  label: 'Print' },
  { key: 'social', label: 'Social Media' },
  { key: 'sonstige', label: 'Sonstige' },
];

export function versionStatusLabel(k: string): string { return VERSION_STATUS.find((s) => s.key === k)?.label ?? k; }
export function assetStatusLabel(k: string): string { return ASSET_STATUS.find((s) => s.key === k)?.label ?? k; }
export function feedbackTypLabel(k: string): string { return FEEDBACK_TYPEN.find((s) => s.key === k)?.label ?? k; }
export function kategorieLabel(k: string): string { return KATEGORIEN.find((s) => s.key === k)?.label ?? k; }

// ---------------------------------------------------------------------------
export interface VersionLite { version_nr?: number; status?: string; eingereicht_am?: string | null }
export interface FeedbackLite { typ?: string }

/** Nächste Versionsnummer = höchste vorhandene + 1 (mind. 1). */
export function naechsteVersion(versionen: VersionLite[]): number {
  let max = 0;
  for (const v of versionen || []) max = Math.max(max, Number(v.version_nr) || 0);
  return max + 1;
}

/** Aktuelle (höchste) Version aus einer Liste. */
export function aktuelleVersion(versionen: VersionLite[]): VersionLite | null {
  let best: VersionLite | null = null;
  for (const v of versionen || []) if (!best || (Number(v.version_nr) || 0) > (Number(best.version_nr) || 0)) best = v;
  return best;
}

export function istEntschieden(status: string): boolean {
  return status === 'freigegeben' || status === 'abgelehnt';
}

/** Asset-Status = Status der aktuellsten Version (Entwurf → „in Arbeit"). */
export function assetStatus(versionen: VersionLite[]): AssetStatus {
  const v = aktuelleVersion(versionen);
  if (!v || !v.status || v.status === 'entwurf') return 'in_arbeit';
  if (v.status === 'in_pruefung') return 'in_pruefung';
  if (v.status === 'aenderung') return 'aenderung';
  if (v.status === 'freigegeben') return 'freigegeben';
  if (v.status === 'abgelehnt') return 'abgelehnt';
  return 'in_arbeit';
}

/** Tage zwischen zwei ISO-Zeitpunkten (b − a), nie negativ; ungültig → 0. */
export function tageZwischen(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const ta = Date.parse(a), tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.max(0, Math.round((tb - ta) / 86400000));
}

/** Wartetage einer eingereichten Version bis Bezugszeitpunkt (heute). */
export function wartetTage(eingereicht_am?: string | null, heute?: string | null): number {
  return tageZwischen(eingereicht_am, heute);
}

// ---------------------------------------------------------------------------
// KPI-Zähler (Tiles + Regel-Auge)
// ---------------------------------------------------------------------------
export interface ProofKpi {
  assets: number;
  inPruefung: number;
  offeneAenderungen: number;
  freigegeben: number;
  abgelehnt: number;
  inArbeit: number;
  freigabeQuote: number;   // freigegeben / entschieden (0..1)
  schnittSchleifen: number; // Ø Versionen je freigegebenem Asset
  versionenGesamt: number;
}

export function zaehleProofing(
  assets: { id?: string }[],
  versionen: (VersionLite & { asset_id?: string })[],
): ProofKpi {
  const vProAsset = new Map<string, VersionLite[]>();
  for (const v of versionen || []) {
    if (!v.asset_id) continue;
    const a = vProAsset.get(v.asset_id) || [];
    a.push(v);
    vProAsset.set(v.asset_id, a);
  }

  let inPruefung = 0, offeneAenderungen = 0, freigegeben = 0, abgelehnt = 0, inArbeit = 0;
  let freigVersionenSumme = 0;
  for (const a of assets || []) {
    const vs = a.id ? (vProAsset.get(a.id) || []) : [];
    const st = assetStatus(vs);
    if (st === 'in_pruefung') inPruefung++;
    else if (st === 'aenderung') offeneAenderungen++;
    else if (st === 'freigegeben') { freigegeben++; freigVersionenSumme += vs.length; }
    else if (st === 'abgelehnt') abgelehnt++;
    else inArbeit++;
  }
  const entschieden = freigegeben + abgelehnt;
  return {
    assets: (assets || []).length,
    inPruefung, offeneAenderungen, freigegeben, abgelehnt, inArbeit,
    freigabeQuote: entschieden > 0 ? freigegeben / entschieden : 0,
    schnittSchleifen: freigegeben > 0 ? Math.round((freigVersionenSumme / freigegeben) * 10) / 10 : 0,
    versionenGesamt: (versionen || []).length,
  };
}
