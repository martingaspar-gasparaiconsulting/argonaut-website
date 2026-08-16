// ============================================================================
// ARGONAUT OS · lib/besucherKennung.ts
//
// Eine anonyme Tageskennung, damit derselbe Besucher nicht fuenfmal gezaehlt
// wird, wenn er die Seite fuenfmal laedt.
//
// WARUM DAS UEBERHAUPT NOETIG IST
// Ohne Entdoppelung zaehlt jeder Reload als neuer Aufruf. Das druckt nicht
// nur die Conversion-Quote — es blaeht die Fallzahl im A-B-Signifikanztest
// auf. Ein z-Test auf aufgeblaehtem n meldet ZU FRUEH "signifikant" und
// fuehrt zur falschen Variante. Eine Statistik auf verzerrten Zaehldaten ist
// schlimmer als gar keine, weil sie Sicherheit vortaeuscht.
//
// WARUM KEIN COOKIE
// Ein Analyse-Cookie ist nicht technisch notwendig und braucht nach
// § 25 TTDSG die Einwilligung des Besuchers. Hier wird nichts auf dem
// Endgeraet abgelegt und nichts von dort gelesen — die Kennung entsteht
// ausschliesslich auf dem Server.
//
// WARUM DAS KEINE PERSONENDATENSPUR IST
//   · Die IP wird NIE gespeichert, nur gehasht.
//   · Der Hash ist einweg (SHA-256) und traegt ein SALZ, das TAEGLICH
//     wechselt. Nach Mitternacht ergibt derselbe Besucher einen anderen
//     Hash — eine Wiedererkennung ueber Tage hinweg ist nicht moeglich.
//   · Ohne Kenntnis des Salzes laesst sich der Hash nicht zurueckrechnen.
//
// WAS ES NICHT KANN — ehrlich benannt:
//   · Mehrere Personen im selben Firmennetz mit demselben Browser gelten
//     als EIN Besucher. Das untererfasst leicht.
//   · Ein Besucher, dessen Mobilfunk-IP unterwegs wechselt, zaehlt zweimal.
// Fuer den eigentlichen Zweck — Reloads und Doppelklicks nicht mitzaehlen —
// reicht das vollauf.
// ============================================================================

import { createHash } from 'node:crypto';

/** Kalendertag in Europe/Berlin (YYYY-MM-DD) — dieselbe Grenze wie die Auswertung. */
export function berlinTag(datum: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(datum);
}

/**
 * Die IP des Anfragenden — hinter Vercel steht die echte Adresse in
 * `x-forwarded-for` (erster Eintrag der Kette).
 */
export function leseIp(kopfzeilen: Headers | null | undefined): string {
  if (!kopfzeilen) return '';
  const kette = kopfzeilen.get('x-forwarded-for') || '';
  const erste = kette.split(',')[0]?.trim();
  if (erste) return erste;
  return (kopfzeilen.get('x-real-ip') || '').trim();
}

/**
 * Baut die Tageskennung. Ohne jede verwertbare Angabe wird `null`
 * zurueckgegeben — dann zaehlt das Ereignis wie bisher einzeln. Lieber eine
 * fehlende Entdoppelung als eine erfundene Kennung, die echte Besucher
 * zusammenwirft.
 */
export function besucherKennung(
  kopfzeilen: Headers | null | undefined,
  salz: string,
  jetzt: Date = new Date(),
): string | null {
  const ip = leseIp(kopfzeilen);
  const browser = (kopfzeilen?.get('user-agent') || '').trim();
  const sprache = (kopfzeilen?.get('accept-language') || '').trim();

  if (!ip && !browser) return null;

  const tag = berlinTag(jetzt);
  const roh = [tag, salz, ip, browser, sprache].join('|');
  return createHash('sha256').update(roh).digest('hex').slice(0, 32);
}

/**
 * Das Salz. Bevorzugt eine eigene Umgebungsvariable; sonst wird der
 * Service-Schluessel als Pfeffer genutzt — er ist serverseitig ohnehin
 * vorhanden und geheim, und aus einem Einweg-Hash laesst er sich nicht
 * zurueckgewinnen. Ohne beides bleibt ein fester Rueckfallwert: die
 * Entdoppelung funktioniert dann trotzdem, nur waere der Hash bei bekanntem
 * Salz theoretisch nachbaubar.
 */
export function salzAusUmgebung(env: Record<string, string | undefined>): string {
  return env.ANALYTICS_SALT
    || env.SUPABASE_SERVICE_ROLE_KEY
    || 'argonaut-os-standardsalz';
}
