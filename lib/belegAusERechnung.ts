// ============================================================================
// ARGONAUT OS · lib/belegAusERechnung.ts — G6 (26.09.2026)
//
// Eine eingelesene E-Rechnung (XRechnung/ZUGFeRD) wurde bis G6 nur ins GoBD-
// Archiv gelegt — in den Ausgaben/Eingangsbelegen tauchte sie nie auf, also
// auch nicht in EÜR, USt-Voranmeldung oder DATEV. Hier entsteht daraus der
// Eingangsbeleg. Reine Logik, ohne Supabase.
// ============================================================================

export type ERechnungKurz = {
  rechnungsnummer?: string | null; rechnungsdatum?: string | null;
  verkaeufer?: { name?: string | null } | null;
  positionen?: { netto?: number | null; mwst_satz?: number | null }[] | null;
  netto_summe?: number | null; mwst_summe?: number | null; brutto_summe?: number | null;
  kleinunternehmer?: boolean | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Überwiegender Steuersatz (nach Netto gewichtet); 0 bei Kleinunternehmer. */
export function hauptSteuersatz(e: ERechnungKurz): number {
  if (e.kleinunternehmer) return 0;
  const je = new Map<number, number>();
  for (const p of e.positionen ?? []) {
    const s = Number(p?.mwst_satz); if (!Number.isFinite(s)) continue;
    je.set(s, (je.get(s) ?? 0) + Math.abs(Number(p?.netto) || 0));
  }
  let best = 19, max = -1;
  for (const [s, n] of je) if (n > max) { max = n; best = s; }
  return best;
}

/** Datensatz für public.eingangsbelege (ohne owner_user_id). */
export function belegAusERechnung(e: ERechnungKurz) {
  const netto = r2(Number(e.netto_summe) || 0);
  const ust = r2(Number(e.mwst_summe) || 0);
  const brutto = r2(Number(e.brutto_summe) || netto + ust);
  const datum = /^\d{4}-\d{2}-\d{2}/.test(String(e.rechnungsdatum ?? '')) ? String(e.rechnungsdatum).slice(0, 10) : null;
  return {
    lieferant: String(e.verkaeufer?.name ?? '').trim() || null,
    belegnummer: String(e.rechnungsnummer ?? '').trim() || null,
    belegdatum: datum,
    netto, ust_satz: hauptSteuersatz(e), ust_betrag: ust, brutto,
    kategorie: null as string | null,
    notiz: 'Aus E-Rechnung übernommen — bitte Kategorie prüfen. Original im E-Rechnungs-Archiv.',
  };
}

/** Gibt es diesen Beleg schon (gleicher Lieferant + gleiche Belegnummer)? */
export function istDoppelterBeleg(
  neu: { lieferant: string | null; belegnummer: string | null },
  vorhandene: { lieferant?: string | null; belegnummer?: string | null }[],
): boolean {
  const n = (s: unknown) => String(s ?? '').trim().toLowerCase();
  if (!n(neu.belegnummer)) return false;
  return vorhandene.some((v) => n(v.belegnummer) === n(neu.belegnummer) && n(v.lieferant) === n(neu.lieferant));
}
