// ============================================================================
// ARGONAUT OS · lib/erfasser.ts — Paket 200 (Entscheidung E8, 04.10.2026)
// „Angelegt von" am einzelnen Datensatz zeigen
//
// Seit Paket 162 speichert die Datenbank bei Kontakten, Angeboten, Rechnungen,
// Aufträgen u. a., WER einen Eintrag angelegt hat (erstellt_von_name, ein
// Schnappschuss des Namens) und wann er zuletzt geändert wurde. Sichtbar war
// das bisher nur bei Abläufen. Jetzt steht es auch auf Kontakt, Angebot,
// Rechnung und Auftrag.
//
// HARTE REGEL (Martin 22.09.): nur am einzelnen Datensatz — nie in einer
// Auswertung, Rangliste oder Kennzahl (tests/nachweisS2 wacht darüber).
//
// Reine Funktion → node --test.
// ============================================================================

export type ErfasserZeile = {
  erstellt_von_name?: unknown;
  erstellt_am?: unknown;
  created_at?: unknown;
  geaendert_am?: unknown;
};

function text(v: unknown): string {
  return (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim();
}

/** 04.10.2026 in Berliner Zeit, '' wenn kein gültiges Datum. */
export function tagDe(v: unknown): string {
  const t = Date.parse(text(v));
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(t));
}

/** Nur der Name (für vorhandene Anzeigen), null wenn unbekannt. */
export function erfasserName(z: ErfasserZeile | null | undefined): string | null {
  const n = text(z?.erstellt_von_name).slice(0, 80);
  return n || null;
}

/**
 * „Angelegt von Maria Muster am 04.10.2026 · zuletzt geändert am 05.10.2026"
 * null, wenn der Eintrag älter als Paket 162 ist (kein Name gespeichert).
 */
export function erfasserText(z: ErfasserZeile | null | undefined): string | null {
  const name = erfasserName(z);
  if (!name) return null;
  const angelegt = tagDe(z?.erstellt_am ?? z?.created_at);
  const geaendert = tagDe(z?.geaendert_am);
  let s = `Angelegt von ${name}${angelegt ? ` am ${angelegt}` : ''}`;
  if (geaendert) s += ` · zuletzt geändert am ${geaendert}`;
  return s;
}
