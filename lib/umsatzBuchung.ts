// lib/umsatzBuchung.ts
// Umsatz-Inseln → Finanzen: baut idempotente zahlungen-Payloads aus
// Markt-Verkäufen (Ernte) und bezahlten Event-Anmeldungen (Veranstaltungen).
// KEINE Supabase-Aufrufe, KEINE React-Hooks. Node-getestet.

export type QuelleTyp = 'markt' | 'event';

export interface RohBuchung {
  id: string;
  betrag: number;        // BRUTTO in €
  datum?: string | null; // ISO (YYYY-MM-DD oder länger); Fallback = heute
}

export interface ZahlungPayload {
  rechnung_id: null;
  betrag: number;
  zahlungsdatum: string;
  zahlungsart: string;
  referenz: string;
}

function r2(n: number): number {
  return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
}

/** Eindeutiger Idempotenz-Schlüssel je Quell-Datensatz (landet in zahlungen.referenz). */
export function buchungsReferenz(quelle: QuelleTyp, id: string): string {
  return `${quelle}:${id}`;
}

/**
 * Baut zahlungen-Payloads für alle Quell-Datensätze, die noch NICHT gebucht sind.
 * - betrag <= 0 wird übersprungen (nichts zu buchen)
 * - bereits vorhandene Referenzen werden übersprungen (idempotent, kein Doppel-Buchen)
 * - Duplikate innerhalb der Eingabe werden ebenfalls nur einmal gebucht
 */
export function offeneBuchungen(
  roh: RohBuchung[],
  quelle: QuelleTyp,
  vorhandeneReferenzen: Iterable<string>,
  heute: string,
  zahlungsart: string
): ZahlungPayload[] {
  const gesehen = new Set<string>(vorhandeneReferenzen);
  const out: ZahlungPayload[] = [];
  for (const r of roh || []) {
    if (!r || !r.id) continue;
    const betrag = r2(r.betrag);
    if (betrag <= 0) continue;
    const referenz = buchungsReferenz(quelle, r.id);
    if (gesehen.has(referenz)) continue;
    gesehen.add(referenz);
    const datum = (r.datum && String(r.datum).slice(0, 10)) || heute;
    out.push({ rechnung_id: null, betrag, zahlungsdatum: datum, zahlungsart, referenz });
  }
  return out;
}
