// ============================================================================
// ARGONAUT OS · lib/zweiFaktor.ts — Zwei-Faktor-Anmeldung, die Regeln (Paket 164)
//
// Martin 27.09.2026: Zwei-Faktor wird Pflicht für JEDE Anmeldung (Chef,
// Mitarbeiter, Betreiber). Wegen des Aussperr-Risikos in Stufen:
//   Stufe 1 (dieses Paket): Einrichten möglich. Wer einen zweiten Faktor HAT,
//            muss ihn bei jeder Anmeldung eingeben. Wer keinen hat, merkt nichts.
//   Stufe 2 (eigenes Paket, eigener Schalter): Pflicht — ohne Faktor geht es
//            nur noch zur Einrichtungs-Seite.
//   Stufe 3 (später, gemeinsam): Datenbank-Regeln verlangen aal2 direkt.
//
// Rein, ohne Importe (Pfoertner, Seiten und Tests nutzen dieselben Regeln).
//
// WICHTIG — woher die Angaben kommen (lib/zweiFaktorServer.ts):
//   · aktuell  = „aal" über getClaims() (geprüftes Token), nie getSession()
//   · hatFaktor = user.factors aus getUser() (vom Anmelde-Dienst, nicht aus
//                dem Cookie). Die Cookie-Kopie des Nutzers ist NICHT signiert —
//                wer dort die Faktoren löscht, darf nicht vorbeikommen.
// ============================================================================

export type Aal = 'aal1' | 'aal2';
export type ZweiFaktorWeg = 'weiter' | 'pruefen' | 'einrichten';

export const PRUEF_PFAD = '/auth/zwei-faktor';
export const EINRICHT_PFAD = '/auth/zwei-faktor/einrichten';

/** Hat der Nutzer (laut Anmelde-Dienst) einen bestätigten zweiten Faktor? */
export function hatVerifiziertenFaktor(user: { factors?: Array<{ status?: string | null }> | null } | null | undefined): boolean {
  return !!user?.factors?.some((f) => f?.status === 'verified');
}

/**
 * Die Weiche. Stufe 1: pflicht = false.
 *   Faktor vorhanden, Sitzung nur aal1  -> „pruefen" (Code eingeben)
 *   kein Faktor, Pflicht an             -> „einrichten"
 *   sonst                               -> „weiter"
 */
export function zweiFaktorWeg(o: { aktuell: Aal; hatFaktor: boolean; pflicht: boolean }): ZweiFaktorWeg {
  if (o.hatFaktor) return o.aktuell === 'aal2' ? 'weiter' : 'pruefen';
  return o.pflicht ? 'einrichten' : 'weiter';
}

/**
 * Stufe 2: Pflicht per Schalter (Umgebungsvariable ZWEI_FAKTOR_PFLICHT=an).
 * In Stufe 1 wird die Funktion im Pfoertner noch NICHT benutzt.
 */
export function pflichtAn(env: Record<string, string | undefined>): boolean {
  return String(env.ZWEI_FAKTOR_PFLICHT ?? '').trim().toLowerCase() === 'an';
}

/**
 * Rücksprung nach der Code-Eingabe: nur eigene Pfade (kein //fremd.de,
 * kein https://…, kein Backslash) — sonst Dashboard.
 */
export function sichererWeiter(roh: unknown): string {
  const s = String(roh ?? '');
  if (!s.startsWith('/') || s.includes('\\') || /[\u0000-\u001f]/.test(s)) return '/dashboard';
  if (!(s.startsWith('/dashboard') || s.startsWith('/admin'))) return '/dashboard';
  return s.slice(0, 500);
}

/** Sechs Ziffern (Leerzeichen erlaubt). */
export function codeFormat(roh: unknown): string | null {
  const s = String(roh ?? '').replace(/\s+/g, '');
  return /^\d{6}$/.test(s) ? s : null;
}
