// ============================================================================
// ARGONAUT OS · lib/chatEinbetten.ts — G1: der Berater auf fremden Websites
//
// Bis 09.09.2026 lief der KI-Verkaufsberater NUR auf Seiten, die in ARGONAUT
// gebaut sind: das Widget rief `/api/oeffentlich/chat` mit relativem Pfad auf,
// und ohne CORS scheitert derselbe Aufruf von einer fremden Domain.
//
// Damit er auf der WordPress-, Wix- oder Jimdo-Seite eines Kunden laufen kann,
// braucht es dreierlei:
//   1. eine Liste erlaubter Domains je Seite  (sonst laesst jede fremde Seite
//      den Bot auf unsere Kosten laufen — das ist der eigentliche Grund fuer
//      die Pruefung, nicht der Browser)
//   2. eine exakte Herkunftspruefung          (diese Datei)
//   3. einen Einbett-Schnipsel zum Kopieren   (diese Datei)
//
// Keine Imports, keine Hooks — von Client- UND Server-Code nutzbar und mit
// `node --test` pruefbar. Das ist Absicht: die Herkunftspruefung ist die
// einzige Kostenbremse, sie gehoert getestet.
// ============================================================================

/** Wie viele Domains eine Seite hoechstens freischalten darf. */
export const MAX_DOMAINS = 10;

/**
 * Bringt eine vom Kunden getippte Domain auf die Form, in der wir vergleichen:
 * ohne Protokoll, ohne Pfad, ohne Port, ohne fuehrendes „www.“, klein.
 *
 *   "https://WWW.Muster-Bau.de/kontakt?x=1"  →  "muster-bau.de"
 *   "  Shop.Muster-Bau.DE  "                 →  "shop.muster-bau.de"
 *
 * Gibt '' zurueck, wenn nichts Brauchbares uebrig bleibt.
 */
export function normalisiereDomain(roh: unknown): string {
  let s = String(roh ?? '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // Protokoll
  s = s.replace(/^[^/@]*@/, '');                // Benutzer:Passwort@
  s = s.split('/')[0] ?? '';                    // Pfad
  s = s.split('?')[0] ?? '';
  s = s.split('#')[0] ?? '';
  s = s.replace(/:\d+$/, '');                   // Port
  s = s.replace(/^www\./, '');                  // www ist dieselbe Seite
  s = s.replace(/\.$/, '');                     // absoluter DNS-Punkt
  if (!s) return '';
  // Muss wie ein Hostname aussehen: mindestens ein Punkt, keine Leerzeichen,
  // nur erlaubte Zeichen. Sonst lieber nichts als etwas Falsches.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return '';
  return s;
}

/**
 * Wandelt die Eingabe aus dem Dashboard (eine Domain je Zeile oder per Komma)
 * in eine saubere, doppelfreie Liste. Unbrauchbare Zeilen fallen still weg —
 * die Anzeige im Dashboard zeigt dem Kunden anschliessend, was angekommen ist.
 */
export function leseDomainListe(text: unknown): string[] {
  const teile = String(text ?? '').split(/[\n,;\s]+/);
  const raus: string[] = [];
  for (const t of teile) {
    const d = normalisiereDomain(t);
    if (d && !raus.includes(d)) raus.push(d);
    if (raus.length >= MAX_DOMAINS) break;
  }
  return raus;
}

/**
 * Darf diese Herkunft den Berater dieser Seite benutzen?
 *
 * Bewusst EXAKTER Vergleich nach dem Normalisieren — kein Suffix-Vergleich.
 * `origin.endsWith('muster-bau.de')` waere die naheliegende Zeile und genau
 * die Luecke: „boese-muster-bau.de“ endet ebenfalls darauf. Eine Subdomain,
 * die den Bot einbetten soll, wird einzeln eingetragen.
 *
 * `www.` gilt als dieselbe Seite (beides wird wegnormalisiert) — alles andere
 * waere im Alltag nur eine Fehlerquelle.
 */
export function originErlaubt(origin: unknown, domains: readonly string[] | null | undefined): boolean {
  const herkunft = normalisiereDomain(origin);
  if (!herkunft) return false;
  if (!Array.isArray(domains) || domains.length === 0) return false;
  for (const d of domains) {
    const erlaubt = normalisiereDomain(d);
    if (erlaubt && erlaubt === herkunft) return true;
  }
  return false;
}

/**
 * Der Schnipsel, den der Kunde in seine Website kopiert.
 *
 * Zwei Zeilen, mehr nicht: ein Platzhalter-Element mit der Seiten-Kennung und
 * das Skript von unserer Adresse. Die Adresse muss ABSOLUT sein — auf einer
 * fremden Seite gibt es kein `/chat.js`.
 */
export function baueEinbettSchnipsel(opts: {
  basis: string;
  oeffentlichId: string;
  titel?: string;
  gruss?: string;
  farbe?: string;
}): string {
  const basis = String(opts.basis || '').trim().replace(/\/+$/, '');
  const id = String(opts.oeffentlichId || '').trim();
  if (!basis || !id) return '';

  const attr = (wert: unknown) =>
    String(wert ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const teile = [`<div class="ao-chat" data-seite="${attr(id)}"`];
  if (opts.titel) teile.push(` data-titel="${attr(opts.titel)}"`);
  if (opts.gruss) teile.push(` data-gruss="${attr(opts.gruss)}"`);
  if (opts.farbe) teile.push(` data-farbe="${attr(opts.farbe)}"`);
  teile.push('></div>\n');
  teile.push(`<script src="${attr(basis)}/chat.js" defer></script>`);
  return teile.join('');
}

/**
 * Die Basis-Adresse aus der Adresse des eingebundenen Skripts.
 * Aus "https://argonaut-os.com/chat.js" wird "https://argonaut-os.com".
 * Wird im Browser gebraucht, damit chat.js seine eigene Herkunft kennt und
 * nicht die des Kunden anspricht.
 */
export function basisAusSkriptAdresse(skriptSrc: unknown): string {
  const s = String(skriptSrc ?? '').trim();
  if (!s) return '';
  const treffer = s.match(/^([a-z][a-z0-9+.-]*:\/\/[^/]+)\//i);
  return treffer?.[1] ?? '';
}
