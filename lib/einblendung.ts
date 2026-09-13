// ============================================================================
// ARGONAUT OS · lib/einblendung.ts — Anmelde-Einblendung (3.15 Paket 4)
//
// Der Baustein „Einblendung" auf einer veröffentlichten Kundenseite: nach
// einer Weile erscheint eine Einladung zum Newsletter. Angemeldet wird über
// denselben Weg wie im normalen Newsletter-Baustein (/api/oeffentlich/
// web-newsletter, Double-Opt-in) — hier geht es nur um die Frage, WANN und
// WIE OFT jemand gefragt wird.
//
// ▄▄▄ WARUM DIESE DATEI SO VIELE GRENZEN ZIEHT ▄▄▄
// Eine Einblendung ist der Baustein, der einer Website am meisten schaden
// kann. Deshalb sind vier Dinge nicht einstellbar:
//
// 1. NIE SOFORT. Unter MIN_SEKUNDEN erscheint nichts. Wer im Moment des
//    Ladens gefragt wird, ist noch kein Besucher, sondern ein Ankömmling.
// 2. NIE ZWEIMAL. Wer weggeklickt hat, hat geantwortet. Die Antwort hält
//    mindestens MIN_SPERRE_TAGE.
// 3. NIE WIEDER NACH ANMELDUNG. Wer sich eingetragen hat, wird nicht erneut
//    gefragt — das ist der häufigste Fehler fremder Popup-Werkzeuge.
// 4. AUF DEM HANDY KEIN VOLLBILD. Google wertet aufdringliche
//    Vollbild-Einblendungen auf Mobilgeräten seit 2017 ab; dort erscheint
//    ein schmaler Balken unten statt einer Wand vor dem Inhalt.
//
// Der Zustand liegt im Browser des Besuchers (localStorage), nicht bei uns:
// „schon gefragt" ist keine Information, für die wir ein Profil anlegen.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — pure, node-testbar.
// ============================================================================

/** Frühestens nach so vielen Sekunden. Nicht unterschreitbar. */
export const MIN_SEKUNDEN = 8;

/** Später als das wirkt die Einblendung wie ein Nachtrag. */
export const MAX_SEKUNDEN = 180;

/** Voreinstellung: lange genug, um etwas gelesen zu haben. */
export const STANDARD_SEKUNDEN = 25;

/** Eine Absage gilt mindestens so lange. */
export const MIN_SPERRE_TAGE = 7;

export const MAX_SPERRE_TAGE = 365;

/** Voreinstellung: einen Monat Ruhe nach dem Wegklicken. */
export const STANDARD_SPERRE_TAGE = 30;

/** Unter dieser Breite gilt ein Gerät als Handy — dort nur ein Balken. */
export const HANDY_BREITE = 640;

export type Einblendung = {
  titel?: unknown;
  text?: unknown;
  knopf?: unknown;
  /** Nach wie vielen Sekunden auf der Seite. */
  nach_sekunden?: unknown;
  /** Zusätzlich zeigen, wenn der Zeiger zum Schließen-Knopf wandert. */
  bei_verlassen?: unknown;
  /** Wie lange nach einer Absage Ruhe ist. */
  sperre_tage?: unknown;
};

function ganzeZahl(v: unknown, standard: number): number {
  // Leer ist NICHT null: Number('') ergibt 0, und eine fehlende Angabe waere
  // damit stillschweigend eine Null geworden — bei „nach wie vielen Tagen"
  // ist das der Unterschied zwischen „nicht ausgefuellt" und „sofort".
  if (v === null || v === undefined) return standard;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : standard;
  const s = String(v).trim();
  if (s === '') return standard;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : standard;
}

/** Sekunden auf den erlaubten Bereich bringen. */
export function sekunden(roh: unknown): number {
  const n = ganzeZahl(roh, STANDARD_SEKUNDEN);
  if (n < MIN_SEKUNDEN) return MIN_SEKUNDEN;
  if (n > MAX_SEKUNDEN) return MAX_SEKUNDEN;
  return n;
}

/** Sperrfrist auf den erlaubten Bereich bringen. */
export function sperreTage(roh: unknown): number {
  const n = ganzeZahl(roh, STANDARD_SPERRE_TAGE);
  if (n < MIN_SPERRE_TAGE) return MIN_SPERRE_TAGE;
  if (n > MAX_SPERRE_TAGE) return MAX_SPERRE_TAGE;
  return n;
}

/** Alle Werte gebändigt — genau das, was in die Seite eingebettet wird. */
export function einstellung(b: Einblendung | null | undefined): {
  titel: string; text: string; knopf: string;
  nachSekunden: number; beiVerlassen: boolean; sperreTage: number;
} {
  return {
    titel: String(b?.titel ?? '').trim(),
    text: String(b?.text ?? '').trim(),
    knopf: String(b?.knopf ?? '').trim() || 'Anmelden',
    nachSekunden: sekunden(b?.nach_sekunden),
    beiVerlassen: b?.bei_verlassen === true,
    sperreTage: sperreTage(b?.sperre_tage),
  };
}

/**
 * Was der Einblendung fehlt. Leere Liste heißt: sie kann auf die Seite.
 * Die Meldungen sind für den Betrieb geschrieben, nicht für Entwickler.
 */
export function fehltZurEinblendung(b: Einblendung | null | undefined): string[] {
  const fehlt: string[] = [];
  const e = einstellung(b);
  if (e.titel.length < 3) fehlt.push('eine Überschrift');
  if (e.text.length < 10) fehlt.push('ein Satz, warum sich das Eintragen lohnt');
  if (e.knopf.length < 2) fehlt.push('eine Beschriftung für den Knopf');
  return fehlt;
}

// ------------------------------------------------------- Zeigen oder nicht?

export type Besucherzustand = {
  /** ISO-Tag der letzten Absage. */
  zuletztGezeigt?: unknown;
  /** Hat sich über diese Einblendung schon eingetragen. */
  angemeldet?: unknown;
};

export type ZeigeErgebnis = { zeigen: boolean; grund: string };

function tag(v: unknown): string | null {
  const s = String(v ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function tageZwischen(vonIso: string, bisIso: string): number | null {
  const a = new Date(vonIso + 'T00:00:00Z').getTime();
  const b = new Date(bisIso + 'T00:00:00Z').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86400000);
}

/**
 * Darf die Einblendung diesem Besucher heute gezeigt werden?
 *
 * Im Zweifel JA — anders als sonst in ARGONAUT. Begründung: der Zustand liegt
 * im Browser des Besuchers und kann fehlen, gelöscht oder unbrauchbar sein.
 * Ein unlesbarer Zustand darf die Einblendung nicht dauerhaft abschalten;
 * die Absage selbst wird dagegen streng gelesen.
 */
export function sollZeigen(
  zustand: Besucherzustand | null | undefined,
  heute: string,
  rohSperreTage?: unknown,
): ZeigeErgebnis {
  if (zustand?.angemeldet === true) {
    return { zeigen: false, grund: 'hat sich bereits eingetragen' };
  }

  const zuletzt = tag(zustand?.zuletztGezeigt);
  if (!zuletzt) return { zeigen: true, grund: 'noch nie gezeigt' };

  const heuteTag = tag(heute);
  if (!heuteTag) return { zeigen: true, grund: 'heutiges Datum unbrauchbar' };

  const her = tageZwischen(zuletzt, heuteTag);
  if (her == null) return { zeigen: true, grund: 'Datum unbrauchbar' };
  if (her < 0) return { zeigen: false, grund: 'zuletzt gezeigt liegt in der Zukunft' };

  const sperre = sperreTage(rohSperreTage);
  if (her < sperre) {
    return { zeigen: false, grund: `noch ${sperre - her} von ${sperre} Tagen Ruhe` };
  }
  return { zeigen: true, grund: `${her} Tage her, Ruhefrist vorbei` };
}

/** Wie die Einblendung auf diesem Gerät erscheint. */
export function darstellung(breite: unknown): 'balken' | 'overlay' {
  const n = typeof breite === 'number' ? breite : Number(String(breite ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return 'balken';
  return n < HANDY_BREITE ? 'balken' : 'overlay';
}

/** Ein Satz für die Vorschau im Editor. */
export function beschreibe(b: Einblendung | null | undefined): string {
  const e = einstellung(b);
  const teile = [`erscheint nach ${e.nachSekunden} Sekunden`];
  if (e.beiVerlassen) teile.push('und wenn der Zeiger die Seite verlässt');
  teile.push(`nach dem Wegklicken ${e.sperreTage} Tage Ruhe`);
  return (
    'Die Einladung ' + teile.join(', ') + '. ' +
    'Auf dem Handy erscheint ein Balken unten statt einer Einblendung vor dem Inhalt — ' +
    'Suchmaschinen werten das Zweite ab. Wer sich eingetragen hat, wird nie wieder gefragt.'
  );
}

/**
 * Vorschlag für eine neue Einblendung im Editor.
 *
 * Bewusst konkret typisiert und NICHT von `Einblendung` abgeleitet: dort sind
 * die Felder `unknown`, weil sie aus der Datenbank kommen und alles sein
 * können. Eine Vorlage ist das Gegenteil davon — sie ist von uns geschrieben.
 */
export type EinblendungVorlage = {
  titel: string; text: string; knopf: string;
  nach_sekunden: number; bei_verlassen: boolean; sperre_tage: number;
};

export const VORLAGE: EinblendungVorlage = {
  titel: 'Nichts mehr verpassen',
  text: 'Einmal im Monat schreiben wir, woran wir gerade arbeiten und was sich für Sie lohnt. Kein Werbebrief, keine Weitergabe Ihrer Adresse.',
  knopf: 'Eintragen',
  nach_sekunden: STANDARD_SEKUNDEN,
  bei_verlassen: false,
  sperre_tage: STANDARD_SPERRE_TAGE,
};
