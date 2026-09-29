// ============================================================================
// ARGONAUT OS · lib/churnSperre.ts — die Kuendigungs-Sperre als reine Regel
//
// ▄▄▄ WARUM ES DAS BRAUCHT (Punkt 11, 17.09.2026) ▄▄▄
// Die Sperre fuer gekuendigte Kunden sass NUR in app/auth/callback. Den
// Callback durchlaeuft aber nur, wer ueber einen Magic-Link oder eine
// Einladung kommt. Die normale Anmeldung mit Passwort ruft ihn nie auf —
// ein gekuendigter Kunde kam also mit seinem Passwort einfach durch.
//
// Ab jetzt prueft zusaetzlich app/dashboard/layout.tsx, die Stelle, die jeder
// Anmeldeweg beim ersten Laden des Dashboards passiert. Beide Stellen nutzen
// diese eine Regel, damit sie nie auseinanderlaufen.
//
// ▄▄▄ WAS DIE DATENBANK TUT ▄▄▄
// Die Liste wird NICHT hier gefiltert, sondern von der Regel
// churned_eigene_email_lesen (lower(email) = lower(auth.jwt() ->> 'email')).
// Jeder sieht hoechstens seine eigene Zeile. Kommt eine Zeile zurueck, ist
// genau diese Person gesperrt.
//
// ▄▄▄ BEWUSST OFFEN BEI FEHLERN ▄▄▄
// Scheitert die Abfrage (Datenbank kurz weg, Regel geaendert), wird NICHT
// gesperrt, sondern laut protokolliert. Eine Stoerung soll nie alle zahlenden
// Kunden gleichzeitig aussperren. Das war auch vorher im Callback so.
//
// Keine Supabase-Aufrufe, keine Hooks — node-testbar.
// ============================================================================

/** Wohin ein gesperrter Nutzer geschickt wird. Die Seite meldet ihn dort ab. */
export const CHURN_ZIEL = '/auth/gesperrt'

export type ChurnEntscheidung = {
  /** true = diese Person darf nicht ins Dashboard. */
  gesperrt: boolean
  /** Zeile fuers Server-Protokoll, wenn die Pruefung selbst gescheitert ist. */
  protokoll: string | null
}

/**
 * Entscheidet aus dem Ergebnis von
 *   supabase.from('churned_customers').select('id').limit(1)
 * ob gesperrt wird.
 */
export function churnEntscheidung(
  zeilen: unknown,
  fehler: { message?: string } | null | undefined,
): ChurnEntscheidung {
  if (fehler) {
    return {
      gesperrt: false,
      protokoll: '[churn-lock] Pruefung fehlgeschlagen: ' + (fehler.message || 'unbekannter Fehler'),
    }
  }
  // .limit(1) statt .single(): .single() wirft bei null UND bei mehr als einer
  // Zeile — ein Doppeleintrag haette die Sperre still ausgehebelt.
  const gesperrt = Array.isArray(zeilen) && zeilen.length > 0
  return { gesperrt, protokoll: null }
}

// ---------------------------------------------------------------------------
// Paket 177 (29.09.2026): Sperre je BETRIEB statt je E-Mail
//
// Befund: churned_customers wurde nie befuellt (es gibt keinen Weg, der dort
// eintraegt), und selbst wenn — die Pruefung lief ueber die E-Mail der
// angemeldeten Person. Mitarbeiter eines gekuendigten Betriebs standen nie
// in der Liste und arbeiteten weiter.
//
// Jetzt: Der Betreiber sperrt im Command Center den BETRIEB (Tabelle
// betrieb_sperre, SQL p177). Die Datenbank-Funktion betrieb_gesperrt() prueft
// den Betrieb der angemeldeten Person (Chef oder Mitarbeiter) und — fuer alte
// Eintraege — weiter churned_customers. Zusaetzlich werden alle Konten des
// Betriebs beim Anmelde-Dienst gesperrt: dann laufen auch Schnittstellen und
// die Datenbank-Zugaenge spaetestens mit dem Ablauf der Sitzung aus.
// ---------------------------------------------------------------------------

/** Ergebnis von rpc('betrieb_gesperrt'). Fehler -> null (dann alte Pruefung / offen). */
export function sperrAusRpc(daten: unknown, fehler: { message?: string } | null | undefined): boolean | null {
  if (fehler) return null
  return daten === true
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Welche Anmelde-Konten gehoeren zum Betrieb? Der Betrieb selbst (Chef) und
 * jede mitarbeiter.auth_user_id dieses Betriebs (seit p169 nur vom Server
 * gesetzt, also verlaesslich). NIE der Betreiber — auch wenn er aus Versehen
 * als Betrieb gewaehlt wurde oder als Mitarbeiter eingetragen ist.
 */
export function kontenDesBetriebs(
  betrieb: unknown,
  mitarbeiter: { auth_user_id?: unknown; owner_user_id?: unknown }[] | null | undefined,
  betreiberId: unknown,
): string[] {
  const b = String(betrieb ?? '').trim().toLowerCase()
  const op = String(betreiberId ?? '').trim().toLowerCase()
  if (!UUID.test(b)) return []
  const ids = new Set<string>([b])
  for (const m of mitarbeiter ?? []) {
    if (String(m?.owner_user_id ?? '').trim().toLowerCase() !== b) continue
    const a = String(m?.auth_user_id ?? '').trim().toLowerCase()
    if (UUID.test(a)) ids.add(a)
  }
  if (op) ids.delete(op)
  return [...ids]
}

/** Darf dieser Betrieb gesperrt werden? Nie der Betreiber selbst, nie ohne Grund. */
export function sperrenErlaubt(betrieb: unknown, betreiberId: unknown, grund: unknown): { ok: true } | { ok: false; fehler: string } {
  const b = String(betrieb ?? '').trim().toLowerCase()
  if (!UUID.test(b)) return { ok: false, fehler: 'Kein gültiger Betrieb gewählt.' }
  if (b === String(betreiberId ?? '').trim().toLowerCase()) return { ok: false, fehler: 'Das eigene Betreiber-Konto kann nicht gesperrt werden.' }
  const g = String(grund ?? '').trim()
  if (g.length < 5) return { ok: false, fehler: 'Bitte einen Grund angeben (z. B. „Kündigung zum 31.10.2026").' }
  return { ok: true }
}
