// ============================================================================
// ARGONAUT OS · lib/mrr.ts  (Paket 187)
//
// Claude-Befund (Rundumschlag 29.09.): Die MRR-Kacheln im Command Center
// rechneten mit einer festen Liste ALTER Paketpreise (SOLO 1.799, START 3.000,
// PRO 4.000 …) aus customers.paket. Diese Pakete gibt es im Preismodell
// (lib/tarif.ts: Stufen + Sitze + Laufzeit-Rabatt) nicht mehr — die Zahl war
// also geraten, nicht gemessen.
//
// Jetzt zählt, was wirklich vereinbart ist: der Netto-Monatspreis jedes
// AKTIVEN ARGONAUT-Abos (Tabelle kunden_abo, status 'aktiv', vom Betreiber
// freigegeben). Aktive Kunden ohne aktives Abo werden getrennt gezählt, damit
// sichtbar ist, wo noch kein Vertrag hinterlegt ist.
//
// Rein, ohne Supabase — node-getestet in tests/sammelpaketP187.test.mjs.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

export type AboFuerMrr = { status?: string | null; monatspreis_netto?: number | string | null };

/** Netto-MRR aus den ARGONAUT-Abos: nur status 'aktiv', Beträge auf Cent. */
export function mrrAusAbos(abos: AboFuerMrr[] | null | undefined): number {
  let summe = 0;
  for (const a of abos ?? []) {
    if (String(a?.status ?? '').trim().toLowerCase() !== 'aktiv') continue;
    const n = typeof a.monatspreis_netto === 'number' ? a.monatspreis_netto : leseZahlOder(String(a.monatspreis_netto ?? ''), 0);
    if (Number.isFinite(n) && n > 0) summe += n;
  }
  return centRunden(summe);
}

/** Anzahl aktiver Abos. */
export function aktiveAbos(abos: AboFuerMrr[] | null | undefined): number {
  return (abos ?? []).filter((a) => String(a?.status ?? '').trim().toLowerCase() === 'aktiv').length;
}

/** Untertitel der Kachel: woher die Zahl kommt und was fehlt. */
export function mrrHinweis(anzahlAbos: number, aktiveKunden: number): string {
  const basis = anzahlAbos === 1 ? 'aus 1 aktiven Abo (netto)' : `aus ${anzahlAbos} aktiven Abos (netto)`;
  const ohne = Math.max(0, aktiveKunden - anzahlAbos);
  return ohne > 0 ? `${basis} · ${ohne} aktive Kunden ohne Abo` : basis;
}
