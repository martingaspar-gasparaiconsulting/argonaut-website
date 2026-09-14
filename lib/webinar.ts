// ============================================================================
// ARGONAUT OS · lib/webinar.ts — der Webinar-Baustein (Punkt 3.13 / Paket 5)
//
// Ein Betrieb legt ein Webinar an, setzt einen oder mehrere Termine — und
// bekommt eine oeffentliche Seite, eine bestaetigte Anmeldung, Erinnerungen
// davor und eine Nachbereitung danach.
//
// ▄▄▄ DREI ENTSCHEIDUNGEN, DIE HIER FEST EINGEBAUT SIND ▄▄▄
//
// 1) ERINNERUNGEN SIND BETRIEBSPOST, DIE NACHBEREITUNG IST WERBUNG.
//    Wer sich fuer einen Termin angemeldet hat, ERWARTET die Erinnerung — sie
//    ist die Lieferung des Bestellten, keine Werbung (wie eine Terminbestaeti-
//    gung). Die Mail NACH dem Webinar mit Aufzeichnung und Angebot ist dagegen
//    Werbung. Das ist dieselbe Trennung wie in lib/automation.ts seit dem
//    13.09.: ein Werbewiderspruch darf eine Mahnung nicht aushebeln — und er
//    darf auch nicht dazu fuehren, dass jemand seinen eigenen Termin verpasst.
//    Folge fuer den Cron: Erinnerungen laufen NICHT gegen den Werbe-Deckel aus
//    lib/mailBudget.ts, die Nachbereitung schon. Ein Webinar findet einmal
//    statt; eine Erinnerung, die wegen eines Deckels einen Tag spaeter kommt,
//    ist wertlos. Eine Nachbereitung kann warten.
//
// 2) EINE UEBERFAELLIGE ERINNERUNG WIRD NICHT NACHGESCHICKT.
//    Wer sich zwei Stunden vor Beginn antraegt, darf nicht drei Erinnerungen
//    auf einmal bekommen ("in 7 Tagen", "morgen", "gleich"). Jede Stufe hat
//    deshalb ein NACHHOLFENSTER; ist es zu, wird die Stufe uebersprungen statt
//    verspaetet verschickt. Gesendet wird immer die NAECHSTGELEGENE Stufe.
//
// 3) DER ZUGANGSLINK STEHT NIE AUF DER OEFFENTLICHEN SEITE.
//    Er geht nur an bestaetigte Angemeldete, und erst mit den Erinnerungen
//    kurz davor. Sonst wird der Link weitergereicht und der Raum ist voll mit
//    Leuten, die nie in der Liste standen.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — pure, node-testbar.
// ============================================================================

import { emailNormalisieren, istEmailGueltig } from './newsletter';

// ---------------------------------------------------------------------------
// Zustaende
// ---------------------------------------------------------------------------

export const STATUS_UNBESTAETIGT = 'unbestaetigt';
export const STATUS_AKTIV = 'aktiv';
export const STATUS_ABGEMELDET = 'abgemeldet';

export const TERMIN_GEPLANT = 'geplant';
export const TERMIN_ABGESAGT = 'abgesagt';

export const TEILNAHME_OFFEN = 'offen';
export const TEILNAHME_TEILGENOMMEN = 'teilgenommen';
export const TEILNAHME_GEFEHLT = 'gefehlt';

/** Nach so vielen Tagen ohne Bestaetigung ist die Anmeldung verfallen. */
export const BESTAETIGUNG_GUELTIG_TAGE = 14;

const MIN_MS = 60_000;
const STD_MS = 3_600_000;
const TAG_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Zeit
// ---------------------------------------------------------------------------

function zeit(v: unknown): number {
  const t = new Date(String(v ?? '')).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** Deutsche Zeitzone, fest. Ein Webinar um 14 Uhr ist 14 Uhr in Deutschland. */
export const ZEITZONE = 'Europe/Berlin';

/**
 * "Dienstag, 22. September 2026 um 14:00 Uhr" — immer in deutscher Ortszeit,
 * auch wenn der Server in einer anderen Zeitzone rechnet. Sommerzeit inklusive.
 * Bei einem kaputten Datum LEER statt „Invalid Date".
 */
export function formatiereTermin(iso: unknown, zeitzone: string = ZEITZONE): string {
  const t = zeit(iso);
  if (!Number.isFinite(t)) return '';
  try {
    const d = new Date(t);
    const datum = new Intl.DateTimeFormat('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: zeitzone,
    }).format(d);
    const uhr = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit', minute: '2-digit', timeZone: zeitzone,
    }).format(d);
    return `${datum} um ${uhr} Uhr`;
  } catch {
    return '';
  }
}

/** "90 Minuten" / "1 Stunde" / "1,5 Stunden" — fuer die Seite und die Mails. */
export function dauerText(minuten: unknown): string {
  const m = Math.floor(Number(minuten));
  if (!Number.isFinite(m) || m <= 0) return '';
  if (m < 60) return `${m} Minuten`;
  const std = m / 60;
  if (Number.isInteger(std)) return std === 1 ? '1 Stunde' : `${std} Stunden`;
  return `${String(std.toFixed(1)).replace('.', ',')} Stunden`;
}

/** Ende eines Termins aus Beginn und Dauer. */
export function endetAm(beginntAm: unknown, dauerMinuten: unknown): string | null {
  const b = zeit(beginntAm);
  const m = Math.max(1, Math.floor(Number(dauerMinuten)) || 60);
  if (!Number.isFinite(b)) return null;
  return new Date(b + m * MIN_MS).toISOString();
}

// ---------------------------------------------------------------------------
// Oeffentliche Adressen
// ---------------------------------------------------------------------------

function basis(origin: unknown): string {
  return String(origin ?? '').replace(/\/+$/, '');
}

/** Die Seite, die der Interessent sieht. */
export function seitenUrl(origin: unknown, key: unknown): string {
  return `${basis(origin)}/w/${encodeURIComponent(String(key ?? ''))}`;
}
/** Der Link in der Bestaetigungsmail (Double-Opt-in). */
export function bestaetigenUrl(origin: unknown, token: unknown): string {
  return `${basis(origin)}/api/oeffentlich/webinar-bestaetigen?token=${encodeURIComponent(String(token ?? ''))}`;
}
/** Der Abmeldelink — gehoert in JEDE Mail. */
export function abmeldenUrl(origin: unknown, token: unknown): string {
  return `${basis(origin)}/api/oeffentlich/webinar-abmelden?token=${encodeURIComponent(String(token ?? ''))}`;
}

// ---------------------------------------------------------------------------
// Plaetze
// ---------------------------------------------------------------------------

export type PlatzZahlen = {
  kapazitaet: number | null;
  belegt: number;
  frei: number | null;
  ausgebucht: boolean;
};

/**
 * Kapazitaet 0, leer oder Unsinn heisst UNBEGRENZT, nicht "kein Platz".
 * Ein vergessenes Feld darf keine Anmeldung verhindern.
 */
export function platzZahlen(kapazitaet: unknown, belegt: unknown): PlatzZahlen {
  const k = Math.floor(Number(kapazitaet));
  const b = Math.max(0, Math.floor(Number(belegt)) || 0);
  if (!Number.isFinite(k) || k <= 0) return { kapazitaet: null, belegt: b, frei: null, ausgebucht: false };
  const frei = Math.max(0, k - b);
  return { kapazitaet: k, belegt: b, frei, ausgebucht: frei === 0 };
}

export type TerminRoh = {
  status?: unknown;
  beginnt_am?: unknown;
  dauer_minuten?: unknown;
  kapazitaet?: unknown;
  zugang_url?: unknown;
};

export type Anmeldbar = { ok: true } | { ok: false; grund: string };

/**
 * Darf sich jemand fuer diesen Termin anmelden?
 * Angemeldet werden kann bis zum Beginn — wer zehn Minuten vorher kommt, ist
 * willkommen. Danach nicht mehr: eine Anmeldung fuer etwas Vergangenes ist
 * fuer beide Seiten wertlos.
 */
export function kannAnmelden(
  termin: TerminRoh | null | undefined,
  belegt: unknown,
  jetztIso: string,
): Anmeldbar {
  const t = termin || {};
  if (String(t.status ?? TERMIN_GEPLANT) === TERMIN_ABGESAGT) {
    return { ok: false, grund: 'Dieser Termin wurde abgesagt.' };
  }
  const beginn = zeit(t.beginnt_am);
  const jetzt = zeit(jetztIso);
  if (!Number.isFinite(beginn)) return { ok: false, grund: 'Für diesen Termin steht noch kein Datum fest.' };
  if (Number.isFinite(jetzt) && jetzt >= beginn) return { ok: false, grund: 'Dieser Termin hat bereits begonnen.' };
  if (platzZahlen(t.kapazitaet, belegt).ausgebucht) {
    return { ok: false, grund: 'Dieser Termin ist ausgebucht.' };
  }
  return { ok: true };
}

/** Der naechste noch offene Termin aus einer Liste. Keiner -> null. */
export function naechsterTermin<T extends TerminRoh>(termine: T[] | null | undefined, jetztIso: string): T | null {
  const jetzt = zeit(jetztIso);
  const offen = (termine || [])
    .filter((t) => t && String(t.status ?? TERMIN_GEPLANT) !== TERMIN_ABGESAGT)
    .filter((t) => {
      const b = zeit(t.beginnt_am);
      return Number.isFinite(b) && (!Number.isFinite(jetzt) || b > jetzt);
    })
    .sort((a, b) => zeit(a.beginnt_am) - zeit(b.beginnt_am));
  return offen[0] ?? null;
}

// ---------------------------------------------------------------------------
// Erinnerungen
// ---------------------------------------------------------------------------

export type ErinnerungsStufe = {
  stufe: number;
  stundenVorher: number;
  betreff: string;
  /** Steht der Zugangslink in dieser Stufe? */
  mitZugang: boolean;
};

/**
 * Drei Erinnerungen. Der Zugangslink erst in den beiden letzten — eine Woche
 * vorher weiss noch niemand, ob er Zeit hat, und ein Link, der sieben Tage
 * herumliegt, wird weitergereicht.
 *
 * Platzhalter: {{titel}} {{firma}} {{termin}} {{dauer}}
 */
export const ERINNERUNGEN: ErinnerungsStufe[] = [
  { stufe: 1, stundenVorher: 168, betreff: 'In einer Woche: {{titel}}', mitZugang: false },
  { stufe: 2, stundenVorher: 24, betreff: 'Morgen: {{titel}}', mitZugang: true },
  { stufe: 3, stundenVorher: 1, betreff: 'Gleich geht es los: {{titel}}', mitZugang: true },
];

/**
 * So lange nach dem eigentlichen Zeitpunkt wird eine Stufe noch verschickt.
 * Danach faellt sie ersatzlos aus — bewusst. Der Cron laeuft alle 15 Minuten,
 * 60 Minuten Fenster sind also reichlich Luft; gleichzeitig verhindert es,
 * dass eine Neuanmeldung kurz vor Beginn die ganze Kette nachgeliefert bekommt.
 */
export const NACHHOLFENSTER_MINUTEN = 60;

export type ErinnerungsEntscheidung =
  | { tun: 'senden'; stufe: number; mitZugang: boolean; betreff: string }
  | { tun: 'nichts'; grund: string };

/**
 * Welche Erinnerung ist fuer diesen Angemeldeten JETZT faellig?
 *
 * Die Reihenfolge der Pruefungen ist Absicht: abgemeldet und unbestaetigt
 * schlagen alles andere. Danach wird von der NAECHSTGELEGENEN Stufe aus
 * gesucht (1 Stunde vor 24 vor 168) — wer spaet dazukommt, bekommt die Mail,
 * die jetzt noch etwas nuetzt, und nicht die von letzter Woche.
 */
export function erinnerungFaellig(
  anmeldung: { status?: unknown; email?: unknown } | null | undefined,
  termin: TerminRoh | null | undefined,
  bereitsGesendet: unknown[] | null | undefined,
  jetztIso: string,
  stufen: ErinnerungsStufe[] = ERINNERUNGEN,
): ErinnerungsEntscheidung {
  const a = anmeldung || {};
  const status = String(a.status ?? '');
  if (status === STATUS_ABGEMELDET) return { tun: 'nichts', grund: 'abgemeldet' };
  if (status !== STATUS_AKTIV) return { tun: 'nichts', grund: 'nicht bestätigt' };
  if (!istEmailGueltig(String(a.email ?? ''))) return { tun: 'nichts', grund: 'keine gültige Adresse' };

  const t = termin || {};
  if (String(t.status ?? TERMIN_GEPLANT) === TERMIN_ABGESAGT) return { tun: 'nichts', grund: 'Termin abgesagt' };

  const beginn = zeit(t.beginnt_am);
  const jetzt = zeit(jetztIso);
  if (!Number.isFinite(beginn)) return { tun: 'nichts', grund: 'kein Termin gesetzt' };
  if (!Number.isFinite(jetzt)) return { tun: 'nichts', grund: 'keine gültige Uhrzeit' };
  if (jetzt >= beginn) return { tun: 'nichts', grund: 'Termin läuft oder ist vorbei' };

  const gesendet = new Set((bereitsGesendet || []).map((s) => Math.floor(Number(s))));
  const fenster = Math.max(1, NACHHOLFENSTER_MINUTEN) * MIN_MS;

  // Nächstgelegene Stufe zuerst.
  const sortiert = (stufen || []).slice().sort((x, y) => x.stundenVorher - y.stundenVorher);
  for (const s of sortiert) {
    if (gesendet.has(Math.floor(Number(s.stufe)))) continue;
    const faellig = beginn - Math.max(0, Number(s.stundenVorher) || 0) * STD_MS;
    if (jetzt < faellig) continue;                 // noch nicht dran
    if (jetzt > faellig + fenster) continue;       // Fenster zu — wird übersprungen, nicht nachgeschickt
    return { tun: 'senden', stufe: s.stufe, mitZugang: !!s.mitZugang, betreff: s.betreff };
  }
  return { tun: 'nichts', grund: 'nichts fällig' };
}

// ---------------------------------------------------------------------------
// Nachbereitung
// ---------------------------------------------------------------------------

/** So lange nach dem Ende geht die Nachbereitung raus. */
export const NACHBEREITUNG_STUNDEN = 2;
/** Danach nicht mehr — eine Aufzeichnung zehn Tage spaeter interessiert niemanden. */
export const NACHBEREITUNG_FENSTER_TAGE = 3;

export type NachEntscheidung =
  | { tun: 'senden'; teilnahme: string; werbung: true }
  | { tun: 'nichts'; grund: string };

/**
 * Ist die Nachbereitung faellig?
 *
 * Sie ist WERBUNG (Aufzeichnung plus Angebot) — deshalb traegt die Antwort das
 * Feld `werbung: true`, damit die Route den Werbe-Deckel und den Werbe-
 * Widerspruch prueft, bevor sie sendet. Die Erinnerungen tun das bewusst nicht.
 */
export function nachbereitungFaellig(
  anmeldung: { status?: unknown; email?: unknown; teilnahme?: unknown; nachbereitung_am?: unknown } | null | undefined,
  termin: TerminRoh | null | undefined,
  jetztIso: string,
): NachEntscheidung {
  const a = anmeldung || {};
  const status = String(a.status ?? '');
  if (status === STATUS_ABGEMELDET) return { tun: 'nichts', grund: 'abgemeldet' };
  if (status !== STATUS_AKTIV) return { tun: 'nichts', grund: 'nicht bestätigt' };
  if (!istEmailGueltig(String(a.email ?? ''))) return { tun: 'nichts', grund: 'keine gültige Adresse' };
  if (String(a.nachbereitung_am ?? '').trim()) return { tun: 'nichts', grund: 'bereits verschickt' };

  const t = termin || {};
  if (String(t.status ?? TERMIN_GEPLANT) === TERMIN_ABGESAGT) return { tun: 'nichts', grund: 'Termin abgesagt' };

  const ende = zeit(endetAm(t.beginnt_am, t.dauer_minuten));
  const jetzt = zeit(jetztIso);
  if (!Number.isFinite(ende) || !Number.isFinite(jetzt)) return { tun: 'nichts', grund: 'kein Termin gesetzt' };

  const ab = ende + NACHBEREITUNG_STUNDEN * STD_MS;
  if (jetzt < ab) return { tun: 'nichts', grund: 'noch nicht fällig' };
  if (jetzt > ab + NACHBEREITUNG_FENSTER_TAGE * TAG_MS) return { tun: 'nichts', grund: 'zu lange her' };

  const teilnahme = String(a.teilnahme ?? TEILNAHME_OFFEN) || TEILNAHME_OFFEN;
  return { tun: 'senden', teilnahme, werbung: true };
}

/**
 * Zwei verschiedene Nachbereitungen. Wer da war, bekommt eine andere Mail als
 * wer gefehlt hat — alles andere liest sich wie ein Serienbrief. Ist die
 * Teilnahme nicht erfasst, gilt der neutrale Text.
 *
 * Platzhalter: {{titel}} {{firma}} {{termin}}
 */
export function nachbereitungFuer(teilnahme: unknown): { betreff: string; text: string } {
  switch (String(teilnahme ?? '')) {
    case TEILNAHME_TEILGENOMMEN:
      return {
        betreff: 'Danke fürs Dabeisein: {{titel}}',
        text:
          'danke, dass Sie sich die Zeit genommen haben.\n\n'
          + 'Die Aufzeichnung und die Unterlagen finden Sie unter dem Link unten — schauen Sie hinein, '
          + 'wann es Ihnen passt.\n\n'
          + 'Wenn während des Webinars eine Frage offen geblieben ist, antworten Sie einfach auf diese E-Mail.',
      };
    case TEILNAHME_GEFEHLT:
      return {
        betreff: 'Sie haben {{titel}} verpasst — hier ist die Aufzeichnung',
        text:
          'schade, dass es gestern nicht geklappt hat. Das kommt vor.\n\n'
          + 'Damit Sie nichts verpassen: Die vollständige Aufzeichnung finden Sie unter dem Link unten.\n\n'
          + 'Falls Sie beim Ansehen eine Frage haben, schreiben Sie mir gern.',
      };
    default:
      return {
        betreff: 'Die Unterlagen zu {{titel}}',
        text:
          'hier sind die Aufzeichnung und die Unterlagen zum Webinar.\n\n'
          + 'Nehmen Sie sich die Zeit, wenn es Ihnen passt — der Link bleibt bestehen.\n\n'
          + 'Bei Fragen antworten Sie einfach auf diese E-Mail.',
      };
  }
}

/**
 * Ist diese Mailart Werbung? Nur die Nachbereitung. Eine unbekannte Art gilt
 * vorsichtshalber ALS Werbung — dieselbe Vorsichtsregel wie in lib/automation.ts.
 */
export function istWerbung(art: unknown): boolean {
  const a = String(art ?? '');
  return !(a === 'bestaetigung' || a === 'erinnerung' || a === 'absage');
}

// ---------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------

/** Platzhalter ersetzen. Fehlt ein Wert, bleibt die Stelle leer statt „undefined". */
export function setzePlatzhalter(
  text: unknown,
  werte: { firma?: string | null; name?: string | null; titel?: string | null; termin?: string | null; dauer?: string | null },
): string {
  return String(text ?? '')
    .replace(/\{\{\s*firma\s*\}\}/gi, (werte.firma || '').trim())
    .replace(/\{\{\s*name\s*\}\}/gi, (werte.name || '').trim())
    .replace(/\{\{\s*titel\s*\}\}/gi, (werte.titel || '').trim())
    .replace(/\{\{\s*termin\s*\}\}/gi, (werte.termin || '').trim())
    .replace(/\{\{\s*dauer\s*\}\}/gi, (werte.dauer || '').trim());
}

/** Anrede — mit Namen, wenn einer da ist. Immer „Sie". */
export function anrede(name: unknown): string {
  const n = String(name ?? '').trim();
  return n ? `Guten Tag ${n},` : 'Guten Tag,';
}

// ---------------------------------------------------------------------------
// Anmeldung pruefen
// ---------------------------------------------------------------------------

/** Adresse pruefen und vereinheitlichen — ein Durchgang fuer die Routen. */
export function pruefeAnmeldung(
  emailRoh: unknown, nameRoh: unknown, firmaRoh?: unknown,
): { ok: true; email: string; name: string | null; firma: string | null } | { ok: false; fehler: string } {
  const email = emailNormalisieren(typeof emailRoh === 'string' ? emailRoh : '');
  if (!istEmailGueltig(email)) {
    return { ok: false, fehler: 'Bitte prüfen Sie die E-Mail-Adresse.' };
  }
  return {
    ok: true,
    email,
    name: String(nameRoh ?? '').trim().slice(0, 80) || null,
    firma: String(firmaRoh ?? '').trim().slice(0, 120) || null,
  };
}

/** Ist die Bestaetigungsanfrage verfallen? */
export function bestaetigungVerfallen(erstelltAm: unknown, jetztIso: string, tage = BESTAETIGUNG_GUELTIG_TAGE): boolean {
  const e = zeit(erstelltAm);
  const j = zeit(jetztIso);
  if (!Number.isFinite(e) || !Number.isFinite(j)) return false;
  return j - e > Math.max(1, tage) * TAG_MS;
}

// ---------------------------------------------------------------------------
// Bereit zum Scharfschalten?
// ---------------------------------------------------------------------------

export type WebinarRoh = {
  titel?: unknown;
  beschreibung?: unknown;
  referent?: unknown;
};

/**
 * Was fehlt, bevor das Webinar oeffentlich gehen darf? Klartext, keine
 * Feldnamen. Das Impressum steht mit in der Liste: eine oeffentliche Seite
 * ohne Anbieterangaben ist abmahnfaehig.
 *
 * Der ZUGANGSLINK ist Pflicht, sobald ein Termin existiert — ein Webinar ohne
 * Raum ist der peinlichste denkbare Fehler, und er faellt erst eine Stunde
 * vorher auf, wenn niemand mehr etwas tun kann.
 */
export function fehltZumStart(
  webinar: WebinarRoh | null | undefined,
  termine: TerminRoh[] | null | undefined,
  impressumFehlend: string[] | null | undefined,
): string[] {
  const w = webinar || {};
  const fehlt: string[] = [];
  if (!String(w.titel ?? '').trim()) fehlt.push('Ein Titel');
  if (!String(w.beschreibung ?? '').trim()) fehlt.push('Eine kurze Beschreibung, worum es geht');
  if (!String(w.referent ?? '').trim()) fehlt.push('Wer das Webinar hält');

  const offene = (termine || []).filter((t) => String(t?.status ?? TERMIN_GEPLANT) !== TERMIN_ABGESAGT);
  if (offene.length === 0) {
    fehlt.push('Mindestens ein Termin');
  } else {
    if (offene.some((t) => !Number.isFinite(zeit(t?.beginnt_am)))) fehlt.push('Ein gültiges Datum bei jedem Termin');
    if (offene.some((t) => !String(t?.zugang_url ?? '').trim())) fehlt.push('Der Zugangslink bei jedem Termin');
  }
  for (const i of impressumFehlend || []) fehlt.push(`Impressum: ${i}`);
  return fehlt;
}

// ---------------------------------------------------------------------------
// Zahlen fuer die Uebersicht
// ---------------------------------------------------------------------------

export type AnmeldeZahlen = {
  gesamt: number;
  unbestaetigt: number;
  aktiv: number;
  abgemeldet: number;
  teilgenommen: number;
  gefehlt: number;
  /** Von allen Eintragungen: wie viele haben bestätigt? (%) — null ohne Grundlage. */
  bestaetigungsquote: number | null;
  /** Von den Bestätigten: wie viele waren da? (%) — null, solange nichts erfasst ist. */
  teilnahmequote: number | null;
};

export function zaehleAnmeldungen(
  liste: { status?: unknown; teilnahme?: unknown }[] | null | undefined,
): AnmeldeZahlen {
  const rows = liste || [];
  let unbestaetigt = 0, aktiv = 0, abgemeldet = 0, teilgenommen = 0, gefehlt = 0;
  for (const r of rows) {
    const s = String(r?.status ?? '');
    if (s === STATUS_AKTIV) aktiv++;
    else if (s === STATUS_ABGEMELDET) abgemeldet++;
    else unbestaetigt++;

    const t = String(r?.teilnahme ?? '');
    if (t === TEILNAHME_TEILGENOMMEN) teilgenommen++;
    else if (t === TEILNAHME_GEFEHLT) gefehlt++;
  }
  // Wer sich abgemeldet hat, HAT vorher bestaetigt — sonst haette er nie eine
  // Mail bekommen. Er zaehlt deshalb in den Zaehler.
  const bestaetigt = aktiv + abgemeldet;
  const erfasst = teilgenommen + gefehlt;
  return {
    gesamt: rows.length,
    unbestaetigt, aktiv, abgemeldet, teilgenommen, gefehlt,
    bestaetigungsquote: rows.length > 0 ? Math.round((bestaetigt / rows.length) * 1000) / 10 : null,
    teilnahmequote: erfasst > 0 ? Math.round((teilgenommen / erfasst) * 1000) / 10 : null,
  };
}
