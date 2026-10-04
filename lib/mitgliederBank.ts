// ============================================================================
// ARGONAUT OS · lib/mitgliederBank.ts — Paket 201 (Entscheidung E4, 04.10.2026)
// Bankdaten der Mitglieder in eigener Tabelle mitglieder_bank
//
// Bisher standen IBAN, BIC und Mandat in der Mitglieder-Tabelle selbst. Eine
// alte Datenbank-Regel (mgd_select_ma) ließ JEDEN Mitarbeiter alle Mitglieder
// samt Bankdaten lesen. Ab SQL p201 liegen die Bankdaten getrennt; lesen und
// ändern darf sie nur der Chef bzw. wer für Mitglieder Schreibrecht hat.
//
// Übergang: Fehlt die Tabelle noch (SQL p201 nicht gelaufen), arbeitet die
// Seite wie bisher mit den alten Spalten (tabelleFehlt).
// Reine Funktionen → node --test.
// ============================================================================

export const BANK_TABELLE = 'mitglieder_bank';
export const BANK_SPALTEN = 'mitglied_id, iban, bic, mandatsreferenz, mandat_datum';
/** Alter Weg (vor SQL p201): Bankspalten direkt aus mitglieder. */
export const ALT_BANK_SPALTEN = 'id, iban, bic, mandatsreferenz, mandat_datum';

export type BankDaten = { iban: string | null; bic: string | null; mandatsreferenz: string | null; mandat_datum: string | null };
export type BankZeile = BankDaten & { mitglied_id: string };

export const BANK_LEER: BankDaten = { iban: null, bic: null, mandatsreferenz: null, mandat_datum: null };

function t(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/** Formular → gespeicherte Werte (IBAN/BIC ohne Leerzeichen, groß). */
export function bankAusFormular(f: { iban?: unknown; bic?: unknown; mandatsreferenz?: unknown; mandat_datum?: unknown }): BankDaten {
  const kompakt = (v: unknown) => t(v).replace(/\s+/g, '').toUpperCase() || null;
  const datum = t(f.mandat_datum).trim().slice(0, 10);
  return {
    iban: kompakt(f.iban),
    bic: kompakt(f.bic),
    mandatsreferenz: t(f.mandatsreferenz).trim() || null,
    mandat_datum: /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : null,
  };
}

export function bankIstLeer(b: BankDaten): boolean {
  return !b.iban && !b.bic && !b.mandatsreferenz && !b.mandat_datum;
}

/** Bankzeilen an die Mitglieder hängen (nach mitglied_id bzw. id beim alten Weg). */
export function mischeBank<T extends { id: string }>(
  mitglieder: T[], bank: Array<Partial<BankZeile> & { id?: string }> | null | undefined,
): Array<T & BankDaten> {
  const jeId = new Map<string, BankDaten>();
  for (const b of bank ?? []) {
    const id = t(b.mitglied_id ?? b.id);
    if (!id) continue;
    jeId.set(id, { iban: b.iban ?? null, bic: b.bic ?? null, mandatsreferenz: b.mandatsreferenz ?? null, mandat_datum: b.mandat_datum ?? null });
  }
  return (mitglieder ?? []).map((m) => ({ ...m, ...BANK_LEER, ...(jeId.get(m.id) ?? {}) }));
}

/** Fehlt die neue Tabelle noch? (SQL p201 nicht gelaufen) */
export function tabelleFehlt(fehler: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!fehler) return false;
  const code = t(fehler.code);
  const text = t(fehler.message);
  return code === '42P01' || code === 'PGRST205' || /mitglieder_bank/.test(text) && /(does not exist|not find|schema cache)/i.test(text);
}
