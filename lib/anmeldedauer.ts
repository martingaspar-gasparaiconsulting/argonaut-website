// ============================================================================
// ARGONAUT OS · lib/anmeldedauer.ts — „Angemeldet bleiben" (B9)
//
// ▄▄▄ WAS HIER WIRKLICH DAS PROBLEM WAR ▄▄▄
// Auf der Liste stand „Haekchen einbauen". Beim Nachschauen am 08.09.26 kam
// heraus: @supabase/ssr setzt das Anmelde-Cookie mit einer Vorgabe von
// 400 * 24 * 60 * 60 Sekunden — 400 TAGEN. Es blieb also ohnehin schon jeder
// angemeldet, auf jedem Geraet. Wer sich am Werkstattrechner anmeldet und den
// Browser schliesst, ist ein Jahr spaeter noch drin.
//
// Das Haekchen ist deshalb keine Erweiterung, sondern ein AUSSCHALTER — und
// die eigentliche Verbesserung ist, dass „angemeldet bleiben" jetzt 30 Tage
// bedeutet statt 400.
//
// ▄▄▄ WARUM DIE ENTSCHEIDUNG IN EINEM EIGENEN COOKIE LIEGT ▄▄▄
// `proxy.ts` schreibt bei JEDER Sitzungsauffrischung die Cookies neu. Wer die
// Dauer nur beim Anmelden setzt, bekommt beim ersten Seitenwechsel wieder die
// Vorgabe zurueck — das Haekchen taete dann nichts, was schlimmer waere als
// gar keines. Deshalb steht die Wahl in einem eigenen, harmlosen Cookie, das
// Anmeldeseite UND Proxy lesen.
//
// Das Merk-Cookie enthaelt KEIN Geheimnis: nur '1' oder '0'. Wer es faelscht,
// verlaengert hoechstens seine eigene Sitzung — die Gueltigkeit des Zugangs
// selbst haengt weiter am signierten Token von Supabase.
//
// KEINE Netzwerk-/Browser-Aufrufe — pure, node-testbar.
// ============================================================================

/** Name des Merk-Cookies. Bewusst sprechend, damit er im Browser erklaerbar ist. */
export const MERK_COOKIE = 'argonaut_angemeldet_bleiben';

/**
 * „Angemeldet bleiben": 30 Tage.
 *
 * Entschieden am 08.09.26. Vorher galten 400 Tage — die Vorgabe der
 * Bibliothek, nie bewusst gewaehlt. 30 Tage ist der uebliche Schnitt fuer ein
 * System mit Geld- und Personaldaten: Wer taeglich arbeitet, merkt nichts;
 * ein vergessenes Geraet ist nach einem Monat zu statt nach ueber einem Jahr.
 */
export const BLEIBEN_SEKUNDEN = 30 * 24 * 60 * 60;

/** Wie lange das Merk-Cookie selbst gilt — etwas laenger, damit es nicht vor der Sitzung verfaellt. */
export const MERK_SEKUNDEN = BLEIBEN_SEKUNDEN + 7 * 24 * 60 * 60;

/**
 * Ohne Haken: ein reines Sitzungs-Cookie. Es verschwindet, wenn der Browser
 * geschlossen wird — genau das, was jemand an einem fremden Rechner erwartet.
 *
 * Technisch heisst das: KEIN maxAge und KEIN expires. Ein maxAge von 0 waere
 * falsch — das loescht das Cookie sofort und meldet den Menschen im selben
 * Moment wieder ab.
 */
export type CookieDauer = { maxAge?: number };

export function dauerFuer(bleibenGewuenscht: boolean): CookieDauer {
  return bleibenGewuenscht ? { maxAge: BLEIBEN_SEKUNDEN } : {};
}

/**
 * Steht im Cookie-Text ein Wunsch? Fehlt das Cookie ganz, gilt TRUE —
 * angemeldet bleiben.
 *
 * Das ist Absicht: Wer heute angemeldet ist, hat nie eine Wahl getroffen.
 * Ihn beim naechsten Seitenaufruf hinauszuwerfen, waere eine Verschlechterung
 * ohne Ansage. Nur wer den Haken bewusst WEGNIMMT, bekommt die kurze Sitzung.
 */
export function leseWunsch(cookieText: unknown): boolean {
  const t = String(cookieText ?? '');
  if (!t) return true;
  const treffer = t.match(new RegExp(`(?:^|;\\s*)${MERK_COOKIE}=([^;]*)`));
  if (!treffer) return true;
  return treffer[1].trim() !== '0';
}

/** Dasselbe fuer eine fertig ausgelesene Cookie-Sammlung (Proxy, Server). */
export function wunschAusWert(wert: unknown): boolean {
  const w = String(wert ?? '').trim();
  if (!w) return true;
  return w !== '0';
}

/** Der Cookie-Text, den die Anmeldeseite setzt. */
export function merkCookieText(bleibenGewuenscht: boolean): string {
  const wert = bleibenGewuenscht ? '1' : '0';
  // Auch das Merk-Cookie selbst wird ohne Haken zum Sitzungs-Cookie —
  // sonst bliebe die Entscheidung laenger stehen als die Sitzung, fuer die
  // sie galt.
  const dauer = bleibenGewuenscht ? `; Max-Age=${MERK_SEKUNDEN}` : '';
  return `${MERK_COOKIE}=${wert}; Path=/; SameSite=Lax${dauer}`;
}

/** Fuer die Anzeige: „30 Tage" bzw. „nur diese Sitzung". */
export function dauerText(bleibenGewuenscht: boolean): string {
  if (!bleibenGewuenscht) return 'Sie werden abgemeldet, sobald Sie den Browser schließen.';
  const tage = Math.round(BLEIBEN_SEKUNDEN / 86400);
  return `Sie bleiben ${tage} Tage angemeldet, auch nach dem Schließen des Browsers.`;
}

/** Der Hinweis unter dem Häkchen. Nennt den Grund, nicht nur die Regel. */
export const HAEKCHEN_HINWEIS =
  'Nehmen Sie den Haken weg, wenn Sie an einem fremden oder gemeinsam genutzten Rechner sitzen — '
  + 'dann endet die Anmeldung mit dem Schließen des Browsers.';
