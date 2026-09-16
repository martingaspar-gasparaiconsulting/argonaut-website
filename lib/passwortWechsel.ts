// ============================================================================
// ARGONAUT OS · lib/passwortWechsel.ts — Regeln fürs Ändern des Passworts
//
// Anlass (Prüfbefund 15.09.2026): app/dashboard/einstellungen/PasswortAendern
// verlangte das ALTE Passwort nicht. Wer ein unbeaufsichtigtes, angemeldetes
// Gerät erwischt, übernimmt das Konto in zwei Feldern — ohne etwas zu wissen.
// Es ging auch keine Benachrichtigung raus, und andere Sitzungen liefen weiter.
//
// Diese Datei enthält nur die REGELN, damit sie node-getestet werden können.
// Das Prüfen des alten Passworts selbst passiert in der Komponente über
// supabase.auth.signInWithPassword — eine Sitzung kann das nicht lokal.
//
// Rein und node-testbar. Keine Hooks, kein Netz.
// ============================================================================

/**
 * Mindestlänge im Browser. Das ist eine Freundlichkeit, keine Sicherung: die
 * verbindliche Untergrenze steht in den Supabase-Projekteinstellungen, weil der
 * Aufruf von dort aus direkt an Supabase geht und jede Prüfung im Browser mit
 * einem Klick zu umgehen ist.
 */
export const MIN_LAENGE = 8;

export type WechselEingabe = { alt: string; neu: string; wdh: string };
export type Pruefung = { ok: boolean; fehler: string | null };

/**
 * Prüft die drei Felder, bevor irgendetwas an Supabase geht.
 * Es wird immer nur EIN Fehler gemeldet — der erste, der auffällt. Eine Liste
 * aus vier Meldungen unter einem Passwortfeld liest niemand.
 */
export function pruefeEingabe(e: WechselEingabe): Pruefung {
  const alt = String(e?.alt ?? '');
  const neu = String(e?.neu ?? '');
  const wdh = String(e?.wdh ?? '');

  if (alt === '') {
    return { ok: false, fehler: 'Bitte geben Sie Ihr aktuelles Passwort ein.' };
  }
  if (neu.length < MIN_LAENGE) {
    return { ok: false, fehler: `Das neue Passwort muss mindestens ${MIN_LAENGE} Zeichen haben.` };
  }
  if (neu !== wdh) {
    return { ok: false, fehler: 'Die beiden neuen Passwörter stimmen nicht überein.' };
  }
  if (neu === alt) {
    return { ok: false, fehler: 'Das neue Passwort muss sich vom bisherigen unterscheiden.' };
  }
  return { ok: true, fehler: null };
}

/**
 * Was der Nutzer liest, wenn das alte Passwort nicht stimmt.
 *
 * WICHTIG — der zweite Satz ist kein Beiwerk: Wer sein Konto über eine
 * Einladung oder einen Magic Link bekommen und nie ein Passwort vergeben hat,
 * kommt hier nicht weiter. Für den ist "Passwort vergessen" der Weg, und der
 * muss in derselben Meldung stehen, sonst sitzt er fest.
 */
export const FEHLER_ALTES_PASSWORT =
  'Das aktuelle Passwort stimmt nicht. Falls Sie noch nie eines vergeben haben — etwa weil Sie über eine Einladung gekommen sind —, nutzen Sie bitte "Passwort vergessen".';

/** Bestätigung nach erfolgreichem Wechsel. Nennt auch die Nebenwirkung. */
export const ERFOLG_TEXT =
  'Passwort geändert. Es gilt ab sofort. Alle anderen Geräte, auf denen Sie angemeldet waren, wurden abgemeldet.';
