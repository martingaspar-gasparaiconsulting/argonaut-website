// ============================================================================
// ARGONAUT OS · lib/kontaktZuordnung.ts — Termin am Kunden festmachen (C2)
//
// Termine hingen bisher nur an einer E-Mail-Adresse. Schreibt der Kunde von
// einer anderen Adresse — vom Handy, aus der Buchhaltung, ueber den Partner —
// reisst der Faden zur Kunden-Akte, und der Termin taucht dort nie auf.
//
// Mit termine.kontakt_id haengt der Termin am Kunden selbst. Die E-Mail bleibt
// als zweiter Weg bestehen: Altdaten und Online-Buchungen ohne Treffer sollen
// nicht aus der Akte fallen. Deshalb zeigt die Akte BEIDE Wege vereint.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — pure, node-testbar.
// ============================================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nur eine echte UUID darf in eine Abfrage — schuetzt vor Filter-Injektion. */
export function istUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID.test(v.trim());
}

/** E-Mail vergleichbar machen: getrimmt und klein. Unsinn wird zu ''. */
export function normalisiereEmail(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  return s.includes('@') ? s : '';
}

export type KontaktRoh = { id?: unknown; email?: unknown };

/**
 * Den Kontakt zu einer E-Mail finden. Kein Treffer heisst null — es wird
 * NICHT der naechstbeste genommen. Ein falsch zugeordneter Termin waere
 * schlimmer als gar keine Zuordnung.
 */
export function kontaktIdPerEmail(kontakte: KontaktRoh[] | null | undefined, email: unknown): string | null {
  const gesucht = normalisiereEmail(email);
  if (!gesucht) return null;
  for (const k of kontakte || []) {
    if (normalisiereEmail(k?.email) === gesucht && istUuid(k?.id)) {
      return String(k.id).trim();
    }
  }
  return null;
}

export type TerminRoh = {
  id?: unknown;
  titel?: unknown;
  beginn_am?: unknown;
  status?: unknown;
  kunde_email?: unknown;
  kontakt_id?: unknown;
};

function zeit(v: unknown): number {
  const t = new Date(String(v ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Die Termine aus beiden Wegen (ueber den Kunden und ueber seine E-Mail) zu
 * EINER Liste vereinen: doppelte Eintraege fallen weg, neueste zuerst.
 * Zeilen ohne id koennen nicht entdoppelt werden — sie bleiben trotzdem
 * drin, damit nichts verschwindet.
 */
export function vereineTermine(
  ueberKontakt: TerminRoh[] | null | undefined,
  ueberEmail: TerminRoh[] | null | undefined,
): TerminRoh[] {
  const raus: TerminRoh[] = [];
  const gesehen = new Set<string>();
  for (const t of [...(ueberKontakt || []), ...(ueberEmail || [])]) {
    const id = typeof t?.id === 'string' ? t.id : '';
    if (id) {
      if (gesehen.has(id)) continue;
      gesehen.add(id);
    }
    raus.push(t);
  }
  return raus.sort((a, b) => zeit(b?.beginn_am) - zeit(a?.beginn_am));
}

/** Der naechste Termin in der Zukunft — oder null. */
export function naechsterTermin(termine: TerminRoh[] | null | undefined, jetztIso: string): TerminRoh | null {
  const jetzt = zeit(jetztIso) || Date.now();
  const kommend = (termine || [])
    .filter((t) => zeit(t?.beginn_am) >= jetzt)
    .sort((a, b) => zeit(a?.beginn_am) - zeit(b?.beginn_am));
  return kommend[0] ?? null;
}

/**
 * Woran haengt dieser Termin? Fuer die Anzeige in der Akte — damit sichtbar
 * ist, welche Termine fest am Kunden haengen und welche nur ueber die
 * E-Mail gefunden wurden.
 */
export function zuordnungsWeg(termin: TerminRoh): 'kunde' | 'email' {
  return istUuid(termin?.kontakt_id) ? 'kunde' : 'email';
}
