// ============================================================================
// ARGONAUT OS · lib/leadNachfass.ts — "keine Reaktion ist kein Nein"
// (Vertrieb · C4)
//
// Die getaktete Nachfass-Kette zu einer Anfrage: Tag 2, Tag 7, Tag 21.
// Der Autopilot erkennt alte offene Anfragen schon und schlaegt vor — hier
// kommt die Taktung dazu, damit niemand mehr von Hand nachhaken muss.
//
// DREI SCHUTZGELAENDER, die in der Logik stecken:
//   1. Die Kette laeuft NUR, solange die Anfrage keine Reaktion hatte. Sobald
//      ein Termin gebucht ist (oder die Anfrage verloren/Kunde ist), stoppt
//      sie automatisch — sonst schreibt das System jemandem hinterher, mit dem
//      der Betrieb laengst spricht. Das waere peinlich und schaedlich.
//   2. Nach dem dritten Schritt ist Schluss. Es gibt keine vierte Mail.
//   3. Jede Mail sagt, warum sie kommt, und wie man sie abstellt.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — pure, node-testbare
// Funktionen. Der Versand liegt im Cron.
// ============================================================================

const TAG_MS = 86_400_000;

export type NachfassSchritt = {
  /** 1, 2, 3 — die Nummer, die in der Datenbank steht. */
  nummer: number;
  /** Tage nach Eingang der Anfrage. */
  tage: number;
  betreff: string;
  /** Absaetze; Platzhalter {name}, {leistung}, {firma}. */
  absaetze: string[];
};

/**
 * Die Texte. Bewusst kurz, in „Sie", ohne Druck und ohne Werbeversprechen —
 * es ist eine Rueckfrage zu einer Anfrage, die der Interessent selbst gestellt
 * hat, kein Werbebrief. Der dritte Schritt sagt ausdruecklich, dass er der
 * letzte ist.
 */
export const NACHFASS_SCHRITTE: NachfassSchritt[] = [
  {
    nummer: 1,
    tage: 2,
    betreff: 'Ihre Anfrage — kurze Rückfrage',
    absaetze: [
      'vor zwei Tagen haben Sie uns wegen {leistung} angeschrieben.',
      'Ich wollte kurz nachfragen, ob unsere Antwort bei Ihnen angekommen ist — manchmal landet sie im Spam-Ordner.',
      'Falls noch etwas fehlt, antworten Sie einfach auf diese Mail.',
    ],
  },
  {
    nummer: 2,
    tage: 7,
    betreff: 'Passt es gerade zeitlich nicht?',
    absaetze: [
      'vor einer Woche ist Ihre Anfrage zu {leistung} bei uns eingegangen.',
      'Kein Problem, wenn es im Moment nicht passt. Sagen Sie mir gerne kurz, wann ich mich wieder melden soll — dann kommen wir zum richtigen Zeitpunkt zusammen.',
    ],
  },
  {
    nummer: 3,
    tage: 21,
    betreff: 'Letzte Nachricht zu Ihrer Anfrage',
    absaetze: [
      'das ist meine letzte Nachricht zu Ihrer Anfrage — ich möchte nicht lästig werden.',
      'Ihre Angaben liegen bei uns bereit. Wenn das Thema wieder aktuell wird, genügt eine kurze Mail, und wir machen dort weiter, wo wir aufgehört haben.',
      'Bis dahin alles Gute für Sie.',
    ],
  },
];

/** Der Satz am Fuss jeder Nachfass-Mail. Steht bewusst in JEDER. */
export const FUSSZEILE =
  'Sie erhalten diese Nachricht, weil Sie uns eine Anfrage geschickt haben. '
  + 'Eine kurze Antwort genügt, dann hören Sie nichts weiter von uns.';

export function schrittMitNummer(nummer: unknown): NachfassSchritt | null {
  const n = Math.floor(Number(nummer));
  if (!Number.isFinite(n)) return null;
  return NACHFASS_SCHRITTE.find((s) => s.nummer === n) ?? null;
}

/** Der naechste Schritt nach diesem — null heisst: die Kette ist zu Ende. */
export function naechsterSchritt(nummer: unknown): NachfassSchritt | null {
  const n = Math.floor(Number(nummer));
  const i = NACHFASS_SCHRITTE.findIndex((s) => s.nummer === n);
  if (i < 0) return NACHFASS_SCHRITTE[0] ?? null;
  return NACHFASS_SCHRITTE[i + 1] ?? null;
}

function alsZeit(iso: unknown): number {
  const t = new Date(String(iso ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Faelligkeit eines Schritts: Eingang der Anfrage plus seine Tage. */
export function faelligAm(eingangIso: unknown, tage: number): string | null {
  const basis = alsZeit(eingangIso);
  if (basis <= 0) return null;
  return new Date(basis + Math.max(0, tage) * TAG_MS).toISOString();
}

/**
 * Stufen, bei denen die Kette NICHT laufen darf. Sobald ein Termin gebucht
 * ist, redet der Betrieb mit dem Menschen — dann schreibt kein Automat mehr
 * hinterher.
 */
export const STOPP_STUFEN = ['termin_gebucht', 'termin_gehalten', 'kunde', 'verloren'];

export function sollStoppen(stufe: unknown): boolean {
  return STOPP_STUFEN.includes(String(stufe ?? '').trim());
}

export type Felder = Record<string, string | number | null>;

/** Die Kette fuer eine Anfrage starten (Schritt 1 wird faellig). */
export function startWerte(eingangIso: unknown): Felder | null {
  const erster = NACHFASS_SCHRITTE[0];
  const faellig = faelligAm(eingangIso, erster.tage);
  if (!faellig) return null;
  return {
    nachfass_status: 'aktiv',
    nachfass_schritt: 0,
    nachfass_faellig_am: faellig,
  };
}

/** Nach dem Versand: entweder auf den naechsten Schritt stellen oder fertig. */
export function weiterWerte(gesendeterSchritt: number, eingangIso: unknown, jetztIso: string): Felder {
  const naechster = naechsterSchritt(gesendeterSchritt);
  if (!naechster) {
    return {
      nachfass_status: 'fertig',
      nachfass_schritt: gesendeterSchritt,
      nachfass_faellig_am: null,
      nachfass_zuletzt_am: jetztIso,
    };
  }
  return {
    nachfass_status: 'aktiv',
    nachfass_schritt: gesendeterSchritt,
    nachfass_faellig_am: faelligAm(eingangIso, naechster.tage) ?? jetztIso,
    nachfass_zuletzt_am: jetztIso,
  };
}

/** Anhalten — vom Chef oder automatisch, wenn die Stufe weiterging. */
export function stoppWerte(grund: 'pausiert' | 'gestoppt' = 'gestoppt'): Felder {
  return { nachfass_status: grund, nachfass_faellig_am: null };
}

export type Platzhalter = { name?: unknown; leistung?: unknown; firma?: unknown };

/** Platzhalter fuellen. Fehlt etwas, wird es NICHT erfunden, sondern umschrieben. */
export function fuelleText(text: string, p: Platzhalter): string {
  const leistung = String(p.leistung ?? '').trim();
  return String(text ?? '')
    .replace(/\{name\}/g, String(p.name ?? '').trim())
    .replace(/\{firma\}/g, String(p.firma ?? '').trim())
    .replace(/\{leistung\}/g, leistung || 'Ihr Anliegen');
}

export type FertigeMail = { betreff: string; anrede: string; absaetze: string[]; fuss: string };

/** Der fertige Text eines Schritts — ohne HTML, das macht der Cron. */
export function mailFuerSchritt(nummer: number, p: Platzhalter): FertigeMail | null {
  const s = schrittMitNummer(nummer);
  if (!s) return null;
  const name = String(p.name ?? '').trim();
  return {
    betreff: fuelleText(s.betreff, p),
    anrede: name ? `Guten Tag ${name},` : 'Guten Tag,',
    absaetze: s.absaetze.map((a) => fuelleText(a, p)),
    fuss: FUSSZEILE,
  };
}

export type LeadRoh = {
  stufe?: unknown;
  nachfass_status?: unknown;
  nachfass_schritt?: unknown;
  nachfass_faellig_am?: unknown;
  email?: unknown;
};

/**
 * Die Entscheidung fuer EINE Anfrage im Cron-Lauf. Absichtlich hier und nicht
 * in der Route: so ist sie testbar, ohne eine einzige Mail zu verschicken.
 */
export type Entscheidung =
  | { tun: 'senden'; schritt: number }
  | { tun: 'stoppen'; grund: string }
  | { tun: 'nichts'; grund: string };

export function entscheide(lead: LeadRoh, jetztIso: string): Entscheidung {
  if (String(lead?.nachfass_status ?? '') !== 'aktiv') return { tun: 'nichts', grund: 'nicht aktiv' };
  if (sollStoppen(lead?.stufe)) return { tun: 'stoppen', grund: 'Stufe weitergegangen' };

  const email = String(lead?.email ?? '').trim();
  if (!email || !email.includes('@')) return { tun: 'stoppen', grund: 'keine E-Mail' };

  const faellig = alsZeit(lead?.nachfass_faellig_am);
  const jetzt = alsZeit(jetztIso) || Date.now();
  if (faellig <= 0) return { tun: 'stoppen', grund: 'kein Fälligkeitsdatum' };
  if (faellig > jetzt) return { tun: 'nichts', grund: 'noch nicht fällig' };

  const naechster = naechsterSchritt(lead?.nachfass_schritt ?? 0);
  if (!naechster) return { tun: 'stoppen', grund: 'Kette zu Ende' };
  return { tun: 'senden', schritt: naechster.nummer };
}
