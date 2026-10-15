// ============================================================================
// ARGONAUT OS · lib/doppelabrechnung.ts — HW-8 (15.10.2026)
//
// Befund HW-8: Auftrag und Einsatz konnten denselben Vorgang je einmal
// abrechnen, ohne sich zu sehen. Rechnung aus Einsatz prueft nur
// einsaetze.rechnung_id, Rechnung aus Auftrag nur auftraege.rechnung_id.
// Ergebnis: Kunde bekommt zwei Rechnungen fuer dieselbe Arbeit.
//
// Regel: Vor dem Abrechnen werden alle nicht stornierten Rechnungen zum
// selben Auftrag gesucht (rechnungen.auftrag_id — Rechnung aus Einsatz traegt
// den Auftrag mit). Gibt es welche, antwortet die Route mit 409 und einer
// Warnung; erst ein ausdrueckliches „trotzdem" legt die Rechnung an
// (Teilleistungen sind erlaubt, aber nie aus Versehen).
//
// Reine Logik, node-testbar.
// ============================================================================

export interface VorhandeneRechnung {
  id?: string;
  rechnungsnummer?: string | null;
  rechnungsart?: string | null;
  zahlungsstatus?: string | null;
  brutto_summe?: unknown;
}

const ART_TEXT: Record<string, string> = {
  abschlag: 'Abschlagsrechnung',
  schluss: 'Schlussrechnung',
};

/** Nur Rechnungen, die wirklich zaehlen (nicht storniert). */
export function zaehlendeRechnungen(rows: readonly VorhandeneRechnung[] | null | undefined): VorhandeneRechnung[] {
  return (Array.isArray(rows) ? rows : []).filter((r) => String(r?.zahlungsstatus ?? '') !== 'storniert');
}

/**
 * Warntext oder null, wenn nichts dagegen spricht.
 * HW-9: Fuer eine Abschlags- oder Schlussrechnung sind vorhandene ABSCHLAEGE
 * gewollt (sie werden in der Schlussrechnung abgesetzt) — es zaehlen dann nur
 * normale und Schlussrechnungen.
 */
export function doppelWarnung(
  rows: readonly VorhandeneRechnung[] | null | undefined,
  wofuer: string,
  neueArt: 'normal' | 'abschlag' | 'schluss' = 'normal',
): string | null {
  const z = zaehlendeRechnungen(rows).filter((r) => neueArt === 'normal' || r?.rechnungsart !== 'abschlag');
  if (z.length === 0) return null;
  const liste = z.map((r) => {
    const art = ART_TEXT[String(r?.rechnungsart ?? '')] || 'Rechnung';
    return `${art} ${r?.rechnungsnummer || '(ohne Nummer)'}`;
  });
  const hatAbschlag = z.some((r) => r?.rechnungsart === 'abschlag');
  return `Zu ${wofuer} gibt es schon: ${liste.join(', ')}.`
    + (hatAbschlag ? ' Abschläge gehören in die Schlussrechnung, nicht in eine zweite volle Rechnung.' : '')
    + ' Bitte prüfen, ob dieselbe Leistung sonst doppelt berechnet wird.';
}

/** Ob der Aufrufer ausdruecklich „trotzdem" gesagt hat. */
export function trotzdemGewollt(body: unknown): boolean {
  return !!(body && typeof body === 'object' && (body as { trotzdem?: unknown }).trotzdem === true);
}
