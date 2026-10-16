// ============================================================================
// ARGONAUT OS · lib/mengenAbrechnung.ts — MO4 Mengen-Abrechnung (16.10.2026)
//
// Leistungen nach Menge erfassen (Stunde, km, Hektar, Tag, m³ …) mit Tarif
// und Zuschlag, später als EINE Sammelrechnung je Kunde über die normale
// Rechnungsstrecke (Route /api/rechnung-aus-mengen, Nummer per DB-Trigger).
//
// GELD-REGELN (Kern-Geld, GEMEINSAM-Regel):
//   - Zahlen nur über lib/zahlen.ts (leseZahl, centRunden, rundeStellen)
//   - Steuersatz nur über lib/steuersatz.ts (0 bleibt 0, leer = 19)
//   - Einzelpreis inkl. Zuschlag auf 4 Stellen, Positionsnetto in Cent
//   - Summen der Rechnung über lib/rechnungKopf.ts kopfSummen (Kleinunternehmer)
//   - Gleiche Leistung + gleicher Preis + gleicher Zuschlag + gleicher Satz
//     werden zu EINER Position zusammengefasst (Menge addiert)
//
// Rein, getestet in tests/mengenAbrechnungMO4.test.mjs.
// SQL: supabase-sql/p396-mengen-leistung.sql.
// ============================================================================

import { leseZahl, centRunden, rundeStellen } from './zahlen';
import { steuersatz } from './steuersatz';
import { istIsoDatum, datumDe } from './nachweisMotor';

export const EINHEITEN = ['Std', 'km', 'ha', 'Tag', 'm³', 'm²', 'm', 't', 'Stk', 'Psch'] as const;
export const MAX_MENGE = 100_000;

/** Takt für Stunden: Menge wird auf den nächsten Takt AUFGERUNDET (z. B. 15 Minuten). */
export const TAKTE: { minuten: number; label: string }[] = [
  { minuten: 0, label: 'genau' }, { minuten: 15, label: 'je angefangene 15 Min.' },
  { minuten: 30, label: 'je angefangene 30 Min.' }, { minuten: 60, label: 'je angefangene Stunde' },
];

export function taktRunden(menge: number, einheit: string, taktMinuten: number): number {
  if (einheit !== 'Std' || !taktMinuten || taktMinuten <= 0) return menge;
  const min = rundeStellen(menge * 60, 3); // Gleitkomma-Rest weg
  return rundeStellen(Math.ceil(min / taktMinuten - 1e-9) * taktMinuten / 60, 4);
}

export type Leistung = {
  id?: string; datum: string; kontakt_id?: string | null; empfaenger_name?: string | null;
  bezeichnung: string; menge: number | string; einheit: string; einzelpreis: number | string;
  zuschlag_prozent?: number | string | null; mwst_satz?: number | string | null;
  abgerechnet?: boolean | null; rechnung_id?: string | null;
};

/**
 * Einzelpreis mit Zuschlag, auf Cent — rechnung_positionen.einzelpreis und
 * menge sind numeric(12,2), deshalb rechnet alles mit genau diesen Werten.
 */
export function effektiverPreis(preis: unknown, zuschlag: unknown): number {
  const p = leseZahl(preis) ?? 0;
  const z = leseZahl(zuschlag) ?? 0;
  return centRunden(p * (1 + z / 100));
}

export function zeileNetto(l: Pick<Leistung, 'menge' | 'einzelpreis' | 'zuschlag_prozent'>): number {
  return centRunden(rundeStellen(leseZahl(l.menge) ?? 0, 2) * effektiverPreis(l.einzelpreis, l.zuschlag_prozent));
}

export type Eingabe = { datum?: string; kontakt_id?: string; empfaenger_name?: string; bezeichnung?: string; menge?: string; einheit?: string; einzelpreis?: string; zuschlag_prozent?: string; mwst_satz?: string; takt?: number };

export function pruefeLeistung(e: Eingabe, heute: string): { zeile: Omit<Leistung, 'id'> | null; fehler: string | null } {
  if (!istIsoDatum(e.datum)) return { zeile: null, fehler: 'Bitte das Datum der Leistung eintragen.' };
  if ((e.datum as string) > heute) return { zeile: null, fehler: 'Leistungen werden erst nach Erbringung erfasst (Datum liegt in der Zukunft).' };
  const kontakt = String(e.kontakt_id ?? '').trim();
  const name = String(e.empfaenger_name ?? '').trim();
  if (!kontakt && !name) return { zeile: null, fehler: 'Bitte einen Kunden wählen oder einen Namen eintragen.' };
  const bez = String(e.bezeichnung ?? '').trim();
  if (bez.length < 2) return { zeile: null, fehler: 'Bitte die Leistung benennen.' };
  const einheit = String(e.einheit ?? '').trim();
  if (!(EINHEITEN as readonly string[]).includes(einheit)) return { zeile: null, fehler: 'Bitte eine Einheit wählen.' };
  const roh = leseZahl(e.menge);
  if (roh == null || roh <= 0 || roh > MAX_MENGE) return { zeile: null, fehler: 'Bitte eine Menge größer 0 eintragen.' };
  const menge = taktRunden(rundeStellen(roh, 3), einheit, Number(e.takt) || 0);
  const preis = leseZahl(e.einzelpreis);
  if (preis == null || preis < 0) return { zeile: null, fehler: 'Bitte den Preis je Einheit (netto) eintragen — 0 ist erlaubt.' };
  const zRoh = String(e.zuschlag_prozent ?? '').trim();
  const zuschlag = zRoh ? leseZahl(zRoh) : 0;
  if (zuschlag == null || zuschlag < 0 || zuschlag > 300) return { zeile: null, fehler: 'Zuschlag zwischen 0 und 300 % oder leer lassen.' };
  return {
    zeile: {
      datum: e.datum as string, kontakt_id: kontakt || null, empfaenger_name: name || null, bezeichnung: bez.slice(0, 300),
      menge, einheit, einzelpreis: rundeStellen(preis, 4), zuschlag_prozent: rundeStellen(zuschlag, 2), mwst_satz: steuersatz(e.mwst_satz),
    },
    fehler: null,
  };
}

/** Tarif-Vorschlag aus dem Leistungskatalog (Einheitspreis vor Stundensatz vor Festpreis). */
export function tarifAusKatalog(k: { bezeichnung?: string | null; einheit?: string | null; einheitspreis_netto?: unknown; stundensatz_netto?: unknown; festpreis_netto?: unknown; mwst_satz?: unknown }): { bezeichnung: string; einheit: string; einzelpreis: string; mwst_satz: string } {
  const ep = leseZahl(k.einheitspreis_netto), st = leseZahl(k.stundensatz_netto), fp = leseZahl(k.festpreis_netto);
  const einheitRoh = String(k.einheit ?? '').trim();
  let einheit = (EINHEITEN as readonly string[]).includes(einheitRoh) ? einheitRoh : '';
  let preis: number | null = null;
  if (ep != null && ep > 0) preis = ep;
  else if (st != null && st > 0) { preis = st; einheit = 'Std'; }
  else if (fp != null && fp > 0) { preis = fp; einheit = 'Psch'; }
  const s = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
  return { bezeichnung: String(k.bezeichnung ?? '').trim(), einheit: einheit || 'Stk', einzelpreis: s(preis), mwst_satz: String(steuersatz(k.mwst_satz)) };
}

export function kundeSchluessel(l: Pick<Leistung, 'kontakt_id' | 'empfaenger_name'>): string {
  return l.kontakt_id ? `k:${l.kontakt_id}` : `n:${String(l.empfaenger_name ?? '').trim().toLowerCase()}`;
}

/** Offene (nicht abgerechnete) Leistungen je Kunde. */
export function offeneJeKunde(rows: Leistung[]): { schluessel: string; kontakt_id: string | null; empfaenger_name: string | null; anzahl: number; netto: number; von: string; bis: string; ids: string[] }[] {
  const m = new Map<string, { schluessel: string; kontakt_id: string | null; empfaenger_name: string | null; anzahl: number; netto: number; von: string; bis: string; ids: string[] }>();
  for (const r of rows ?? []) {
    if (r.abgerechnet || r.rechnung_id || !r.id) continue;
    const k = kundeSchluessel(r);
    const g = m.get(k) ?? { schluessel: k, kontakt_id: r.kontakt_id ?? null, empfaenger_name: r.empfaenger_name ?? null, anzahl: 0, netto: 0, von: r.datum, bis: r.datum, ids: [] };
    g.anzahl++; g.netto = centRunden(g.netto + zeileNetto(r)); g.ids.push(r.id);
    if (r.datum < g.von) g.von = r.datum;
    if (r.datum > g.bis) g.bis = r.datum;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.netto - a.netto);
}

export type Posten = { bezeichnung: string; menge: number; einheit: string; einzelpreis: number; mwst_satz: number; gesamt_netto: number };

/**
 * Sammelpositionen: gleiche Leistung/Einheit/Preis/Zuschlag/Satz zusammen,
 * Zeitraum und Anzahl im Text. Reihenfolge nach erstem Datum.
 */
export function sammelPosten(rows: Leistung[], kleinunternehmer = false): Posten[] {
  const m = new Map<string, { bez: string; einheit: string; preis: number; zuschlag: number; satz: number; menge: number; von: string; bis: string; n: number }>();
  for (const r of rows ?? []) {
    const preis = effektiverPreis(r.einzelpreis, r.zuschlag_prozent);
    const zuschlag = leseZahl(r.zuschlag_prozent) ?? 0;
    const satz = kleinunternehmer ? 0 : steuersatz(r.mwst_satz);
    const k = [r.bezeichnung.trim().toLowerCase(), r.einheit, preis, zuschlag, satz].join('|');
    const g = m.get(k) ?? { bez: r.bezeichnung.trim(), einheit: r.einheit, preis, zuschlag, satz, menge: 0, von: r.datum, bis: r.datum, n: 0 };
    g.menge = rundeStellen(g.menge + (leseZahl(r.menge) ?? 0), 4); g.n++;
    if (r.datum < g.von) g.von = r.datum;
    if (r.datum > g.bis) g.bis = r.datum;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => a.von.localeCompare(b.von) || a.bez.localeCompare(b.bez, 'de')).map((g) => {
    const zeitraum = g.von === g.bis ? datumDe(g.von) : `${datumDe(g.von)}–${datumDe(g.bis)}`;
    const zusatz = [zeitraum, g.n > 1 ? `${g.n} Einsätze` : '', g.zuschlag ? `inkl. ${String(g.zuschlag).replace('.', ',')} % Zuschlag` : ''].filter(Boolean).join(', ');
    return {
      bezeichnung: `${g.bez} (${zusatz})`.slice(0, 500), menge: rundeStellen(g.menge, 2), einheit: g.einheit,
      einzelpreis: g.preis, mwst_satz: g.satz, gesamt_netto: centRunden(rundeStellen(g.menge, 2) * g.preis),
    };
  });
}
