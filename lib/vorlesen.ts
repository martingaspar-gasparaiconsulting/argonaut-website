// ============================================================================
// ARGONAUT OS · lib/vorlesen.ts  (Avatar Stufe 3 · Stimme)
//
// ▄▄▄ WARUM DER BROWSER UND NICHT ELEVENLABS ▄▄▄
// Jeder Browser bringt eine Sprachausgabe mit (speechSynthesis). Sie klingt
// nicht wie ein Studio, aber sie kostet NICHTS, braucht KEIN Konto und — das
// ist bei einem DSGVO-Produkt kein Nebenaspekt — sie schickt den Text NICHT an
// einen fremden Dienst. Die Stimme entsteht auf dem Geraet des Nutzers.
//
// Eine gekaufte Stimme (ElevenLabs & Co.) laesst sich spaeter danebenlegen:
// dieselbe Funktion, andere Quelle. Bis dahin hat der Guide eine Stimme statt
// keiner.
//
// AUFBAU: Alles Rechnende ist rein und node-testbar. Nur die drei Funktionen
// ganz unten fassen den Browser an — sie pruefen vorher, ob es ihn gibt.
// ============================================================================

/** So viel wie vom Browser gebraucht wird — mehr nicht, damit rein testbar. */
export type Stimme = { name: string; lang: string; default?: boolean };

/**
 * Die beste deutsche Stimme aus dem waehlen, was der Browser anbietet.
 *
 * Reihenfolge: genau de-DE → irgendein Deutsch (de-AT, de-CH) → nichts.
 * Bewusst KEIN Rueckfall auf Englisch: eine englische Stimme, die deutschen
 * Text vorliest, klingt schlimmer als gar keine Ansage.
 */
export function waehleDeutscheStimme<T extends Stimme>(stimmen: T[] | null | undefined): T | null {
  const liste = Array.isArray(stimmen) ? stimmen.filter((s) => s && typeof s.lang === 'string') : [];
  if (liste.length === 0) return null;
  const genau = liste.filter((s) => s.lang.toLowerCase().replace('_', '-') === 'de-de');
  if (genau.length > 0) return genau.find((s) => s.default) ?? genau[0];
  const irgendein = liste.filter((s) => s.lang.toLowerCase().startsWith('de'));
  if (irgendein.length > 0) return irgendein.find((s) => s.default) ?? irgendein[0];
  return null;
}

/** Ordnungswoerter fuer die Schritte — „erstens" liest sich besser als „1.". */
export const ORDNUNGSWORTE = [
  'Erstens', 'Zweitens', 'Drittens', 'Viertens', 'Fünftens',
  'Sechstens', 'Siebtens', 'Achtens', 'Neuntens', 'Zehntens',
];

export function ordnungswort(index: number): string {
  return ORDNUNGSWORTE[index] ?? `Schritt ${index + 1}`;
}

/**
 * Aus dem, was in der Sprechblase steht, einen zusammenhaengenden Text bauen.
 *
 * Wichtig ist die Zeichensetzung: Die Sprachausgabe macht an Punkt und Komma
 * eine Pause. Ohne die Punkte hinter den Schritten rasselt sie alles in einem
 * Atemzug herunter.
 */
export function baueVorleseText(o: {
  begruessung?: string | null;
  nachricht?: string | null;
  schritte?: string[] | null;
}): string {
  const teile: string[] = [];
  const gruss = String(o?.begruessung ?? '').trim();
  const nachricht = String(o?.nachricht ?? '').trim();
  if (gruss) teile.push(satzEnde(gruss));
  if (nachricht) teile.push(satzEnde(nachricht));

  const schritte = (Array.isArray(o?.schritte) ? o.schritte : [])
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);
  schritte.forEach((s, i) => teile.push(`${ordnungswort(i)}: ${satzEnde(s)}`));

  return teile.join(' ').trim();
}

/** Einen Punkt anhaengen, wenn der Satz keinen hat — sonst fehlt die Pause. */
function satzEnde(text: string): string {
  return /[.!?:]$/.test(text) ? text : `${text}.`;
}

/**
 * Zu lange Texte kappen. Manche Browser brechen jenseits einiger hundert
 * Zeichen mitten im Wort ab; besser ein sauberes Ende an einer Satzgrenze.
 */
export function kuerzeFuerStimme(text: string | null | undefined, max = 600): string {
  const t = String(text ?? '').trim();
  if (max <= 0) return '';
  if (t.length <= max) return t;
  const roh = t.slice(0, max);
  const grenze = Math.max(roh.lastIndexOf('. '), roh.lastIndexOf('! '), roh.lastIndexOf('? '));
  return (grenze > max * 0.5 ? roh.slice(0, grenze + 1) : roh.trimEnd()).trim();
}

// ---------------------------------------------------------------------------
// Ab hier wird der Browser angefasst. Alles darunter ist NICHT node-testbar.
// ---------------------------------------------------------------------------

type SprachAusgabe = {
  speak: (a: unknown) => void;
  cancel: () => void;
  getVoices: () => Stimme[];
  speaking?: boolean;
};

function ausgabe(): SprachAusgabe | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { speechSynthesis?: SprachAusgabe };
  return w.speechSynthesis ?? null;
}

/** Kann dieser Browser ueberhaupt vorlesen? */
export function istVorlesenMoeglich(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { speechSynthesis?: unknown; SpeechSynthesisUtterance?: unknown };
  return !!w.speechSynthesis && !!w.SpeechSynthesisUtterance;
}

/**
 * Vorlesen. Gibt false zurueck, wenn der Browser nicht kann oder nichts da ist —
 * die Oberflaeche zeigt den Knopf dann gar nicht erst an.
 */
export function sprich(text: string | null | undefined): boolean {
  const syn = ausgabe();
  if (!syn || !istVorlesenMoeglich()) return false;
  const inhalt = kuerzeFuerStimme(text);
  if (!inhalt) return false;

  // Laeuft noch etwas, wird es abgebrochen — sonst reihen sich die Ansagen und
  // der Nutzer hoert minutenlang Altes.
  syn.cancel();

  const W = (window as unknown as { SpeechSynthesisUtterance: new (t: string) => Record<string, unknown> });
  const spruch = new W.SpeechSynthesisUtterance(inhalt);
  spruch.lang = 'de-DE';
  spruch.rate = 0.95;   // eine Spur langsamer als Vorgabe — verstaendlicher
  spruch.pitch = 1;

  const stimme = waehleDeutscheStimme(syn.getVoices());
  if (stimme) spruch.voice = stimme;

  syn.speak(spruch);
  return true;
}

/** Vorlesen abbrechen (z. B. beim Verlassen der Seite). */
export function stoppeVorlesen(): void {
  ausgabe()?.cancel();
}
