// ============================================================================
// ARGONAUT OS · lib/rechnungAusAuftrag.ts — HW-7 (15.10.2026)
//
// Auftragspositionen -> Rechnungspositionen und Kopfsummen.
//
// Befund HW-7 (rechnung-aus-auftrag):
//   - Summen kamen ungeprueft aus dem Auftragskopf. Der Auftrag rechnete die
//     Steuer ueber ALLE Zeilen ungerundet und rundete erst am Ende — nicht je
//     Steuersatz (§ 14 Abs. 4 Nr. 8 UStG). Kopf und Positionen der Rechnung
//     konnten so um Cents auseinanderliegen.
//   - Leerer Steuersatz wurde 19, 0 % blieb 0 (ok) — jetzt einheitlich ueber
//     lib/steuersatz.ts.
// Regel: Zeilen-Netto = gespeichertes gesamt_netto, sonst Menge x Preis,
// je Zeile auf Cent gerundet; Summen ueber kopfSummen (je Steuersatz).
//
// Reine Logik, node-testbar.
// ============================================================================

import { leseZahl, leseZahlOder, centRunden } from './zahlen';
import { steuersatz } from './steuersatz';
import { kopfSummen, type KopfSummen } from './rechnungKopf';

export interface AuftragPosition {
  position?: unknown;
  bezeichnung?: string | null;
  beschreibung?: string | null;
  menge?: unknown;
  einheit?: string | null;
  einzelpreis?: unknown;
  mwst_satz?: unknown;
  gesamt_netto?: unknown;
}

export interface RechnungsPosten {
  position: number;
  bezeichnung: string;
  beschreibung: string | null;
  menge: number;
  einheit: string;
  einzelpreis: number;
  mwst_satz: number;
  gesamt_netto: number;
}

export function zeilenNetto(p: AuftragPosition): number {
  const gespeichert = leseZahl(p?.gesamt_netto);
  if (gespeichert !== null) return centRunden(gespeichert);
  return centRunden(leseZahlOder(p?.menge, 0) * leseZahlOder(p?.einzelpreis, 0));
}

export function auftragZuRechnung(
  positionen: readonly AuftragPosition[],
  opt: { kleinunternehmer?: boolean } = {},
): { posten: RechnungsPosten[]; summen: KopfSummen } {
  const posten = (Array.isArray(positionen) ? positionen : []).map((p, i) => {
    const pos = leseZahl(p?.position);
    return {
      position: pos !== null && pos > 0 ? Math.trunc(pos) : i + 1,
      bezeichnung: (p?.bezeichnung || '').trim() || '(ohne Bezeichnung)',
      beschreibung: p?.beschreibung ?? null,
      menge: leseZahlOder(p?.menge, 1),
      einheit: (p?.einheit || '').trim() || 'Stk',
      einzelpreis: leseZahlOder(p?.einzelpreis, 0),
      mwst_satz: opt.kleinunternehmer ? 0 : steuersatz(p?.mwst_satz),
      gesamt_netto: zeilenNetto(p),
    };
  });
  const summen = kopfSummen(
    posten.map((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })),
    { kleinunternehmer: opt.kleinunternehmer },
  );
  return { posten, summen };
}

// ── HW-9 (15.10.2026): Abschlag und Schlussrechnung am Auftrag ──────────────

export type AuftragRechnungsart = 'normal' | 'abschlag' | 'schluss';

export function rechnungsartLesen(v: unknown): AuftragRechnungsart {
  return v === 'abschlag' || v === 'schluss' ? v : 'normal';
}

/** Leistungsstand in Prozent (0 < p <= 100), sonst null. Deutsches Komma erlaubt. */
export function leistungsstandLesen(v: unknown): number | null {
  const p = leseZahl(v);
  if (p === null || !(p > 0) || p > 100) return null;
  return Math.round(p * 100) / 100;
}

/**
 * Abschlagsrechnung nach Leistungsstand: JEDE Auftragsposition erscheint mit
 * ihrem Anteil (§ 632a Abs. 1 Satz 2 BGB verlangt eine Aufstellung der
 * erbrachten Leistung — eine Zeile „Abschlag" genuegt nicht). Steuersatz je
 * Position bleibt, Summen ueber kopfSummen.
 */
export function abschlagAusAuftrag(
  positionen: readonly AuftragPosition[],
  prozent: number,
): { posten: RechnungsPosten[]; summen: KopfSummen; auftragNetto: number } {
  const voll = auftragZuRechnung(positionen);
  const posten = voll.posten.map((p, i) => {
    const netto = centRunden(p.gesamt_netto * prozent / 100);
    const pz = String(prozent).replace('.', ',');
    return {
      position: i + 1,
      bezeichnung: `Pos. ${p.position} ${p.bezeichnung} – Leistungsstand ${pz} %`,
      beschreibung: `Auftragswert der Position ${p.gesamt_netto.toFixed(2).replace('.', ',')} € netto`,
      menge: 1,
      einheit: 'Psch',
      einzelpreis: netto,
      mwst_satz: p.mwst_satz,
      gesamt_netto: netto,
    };
  });
  const summen = kopfSummen(posten.map((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })), {});
  return { posten, summen, auftragNetto: voll.summen.netto };
}

export interface AbschlagRechnungZeile {
  id: string;
  rechnungsnummer?: string | null;
  rechnungsdatum?: string | null;
  rechnungsart?: string | null;
  zahlungsstatus?: string | null;
  netto_summe?: unknown;
  mwst_summe?: unknown;
}

/** Nicht stornierte Abschlagsrechnungen eines Auftrags. */
export function gueltigeAbschlaege(rows: readonly AbschlagRechnungZeile[] | null | undefined): AbschlagRechnungZeile[] {
  return (Array.isArray(rows) ? rows : []).filter(
    (r) => r?.rechnungsart === 'abschlag' && String(r?.zahlungsstatus ?? '') !== 'storniert',
  );
}

/** Summe der bisherigen Abschlaege, netto. */
export function abschlaegeNetto(rows: readonly AbschlagRechnungZeile[] | null | undefined): number {
  return centRunden(gueltigeAbschlaege(rows).reduce((s, r) => s + leseZahlOder(r?.netto_summe, 0), 0));
}
