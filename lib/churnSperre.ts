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
