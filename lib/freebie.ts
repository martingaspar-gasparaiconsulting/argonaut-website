// ============================================================================
// ARGONAUT OS · lib/freebie.ts — der Freebie-Baukasten (D3)
//
// Ein Betrieb legt ein Thema an, laedt eine Datei hoch — und bekommt eine
// oeffentliche Seite, eine bestaetigte Anmeldung, die Auslieferung und eine
// fuenfteilige Mailstrecke. Bisher gab es das nur EINMAL fuer den eigenen
// ARGONAUT-Trichter (lib/dossierFunnel, feste Texte, keine Betriebs-Zuordnung).
//
// WARUM DOUBLE-OPT-IN OHNE AUSNAHME:
// § 7 UWG verlangt fuer Werbemails eine nachweisbare Einwilligung. Der Weg
// hier ist deshalb immer derselbe: eintragen -> bestaetigen -> erst DANN
// Datei und Strecke. Ohne Bestaetigung geht ausser der Bestaetigungsanfrage
// keine einzige Mail raus. Und jede Mail traegt einen Abmeldelink.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — pure, node-testbar.
// ============================================================================

import { emailNormalisieren, istEmailGueltig } from './newsletter';

export const STATUS_UNBESTAETIGT = 'unbestaetigt';
export const STATUS_AKTIV = 'aktiv';
export const STATUS_ABGEMELDET = 'abgemeldet';

/** Nach so vielen Tagen ohne Bestaetigung ist die Anmeldung verfallen. */
export const BESTAETIGUNG_GUELTIG_TAGE = 14;

const TAG_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Die Datei
// ---------------------------------------------------------------------------

/** 25 MB. Groesser verschickt kein Postfach gern, und niemand liest es. */
export const DATEI_MAX_BYTES = 25 * 1024 * 1024;

export function endungVon(dateiname: unknown): string {
  const n = String(dateiname ?? '');
  const i = n.lastIndexOf('.');
  return i > 0 ? n.slice(i + 1).toLowerCase() : '';
}

/**
 * Nur PDF. Bewusst eng: Ein Word-Dokument sieht auf jedem Rechner anders aus,
 * laesst sich veraendern und oeffnet auf dem Telefon oft gar nicht. Ein
 * Ratgeber, den der Empfaenger nicht aufbekommt, ist kein Ratgeber.
 */
export function pruefeDatei(
  dateiname: unknown, typ: unknown, bytes: unknown,
): { ok: true } | { ok: false; fehler: string } {
  const endung = endungVon(dateiname);
  const mime = String(typ ?? '').toLowerCase();
  const b = Number(bytes);

  if (endung !== 'pdf' && mime !== 'application/pdf') {
    return { ok: false, fehler: 'Bitte laden Sie ein PDF hoch. Andere Formate öffnen sich nicht auf jedem Gerät zuverlässig.' };
  }
  if (!Number.isFinite(b) || b <= 0) {
    return { ok: false, fehler: 'Die Datei ist leer.' };
  }
  if (b > DATEI_MAX_BYTES) {
    return { ok: false, fehler: 'Die Datei ist größer als 25 MB. Bitte verkleinern Sie das PDF.' };
  }
  return { ok: true };
}

/** Dateiname entschaerfen: keine Pfadtrenner, keine Umlaute im Speicher. */
export function sichererName(roh: unknown): string {
  const n = String(roh ?? '').trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
  return n && n !== '.pdf' && !n.startsWith('.') ? n : 'ratgeber.pdf';
}

/** Speicherpfad — IMMER im eigenen Ordner, sonst greift die Eimer-Regel nicht. */
export function pfadFuer(ownerId: unknown, freebieId: unknown, dateiname: unknown, jetzt = Date.now()): string | null {
  const o = String(ownerId ?? '').trim();
  const f = String(freebieId ?? '').trim();
  if (!o || !f) return null;
  return `${o}/${f}/${jetzt}_${sichererName(dateiname)}`;
}

// ---------------------------------------------------------------------------
// Die oeffentlichen Adressen
// ---------------------------------------------------------------------------

function basis(origin: unknown): string {
  return String(origin ?? '').replace(/\/+$/, '');
}

/** Die Seite, die der Interessent sieht. */
export function seitenUrl(origin: unknown, key: unknown): string {
  return `${basis(origin)}/f/${encodeURIComponent(String(key ?? ''))}`;
}
/** Der Link in der Bestaetigungsmail. */
export function bestaetigenUrl(origin: unknown, token: unknown): string {
  return `${basis(origin)}/api/oeffentlich/freebie-bestaetigen?token=${encodeURIComponent(String(token ?? ''))}`;
}
/** Der Abmeldelink — gehoert in JEDE Mail der Strecke. */
export function abmeldenUrl(origin: unknown, token: unknown): string {
  return `${basis(origin)}/api/oeffentlich/freebie-abmelden?token=${encodeURIComponent(String(token ?? ''))}`;
}

// ---------------------------------------------------------------------------
// Die Strecke
// ---------------------------------------------------------------------------

export type StreckenSchritt = {
  schritt: number;
  tag: number;
  betreff: string;
  text: string;
};

/**
 * Der Vorschlag, mit dem jedes neue Freebie startet. Bewusst branchenneutral
 * und ohne Verkaufsdruck: Der Betrieb schreibt seine eigenen Worte hinein,
 * aber er startet nicht vor einer leeren Seite.
 *
 * Platzhalter: {{firma}} {{name}} {{titel}}
 */
export const STANDARD_STRECKE: StreckenSchritt[] = [
  {
    schritt: 1, tag: 2,
    betreff: 'Kurz nachgefragt: Konnten Sie schon hineinschauen?',
    text:
      'haben Sie „{{titel}}" schon geöffnet?\n\n'
      + 'Falls nicht: Die ersten beiden Seiten reichen für den Anfang — der Rest ist zum Nachschlagen gedacht.\n\n'
      + 'Wenn beim Lesen eine Frage auftaucht, antworten Sie einfach auf diese E-Mail. Ich lese hier selbst mit.',
  },
  {
    schritt: 2, tag: 5,
    betreff: 'Der Fehler, den wir am häufigsten sehen',
    text:
      'in unserer täglichen Arbeit begegnet uns ein Punkt immer wieder — und er kostet am meisten Geld, wenn er zu spät auffällt.\n\n'
      + 'Deshalb steht er auch im Ratgeber. Falls Sie ihn überlesen haben: Es lohnt sich, dort noch einmal hinzuschauen.\n\n'
      + 'Wie ist das bei Ihnen gelöst?',
  },
  {
    schritt: 3, tag: 9,
    betreff: 'Ein Beispiel aus der Praxis',
    text:
      'Theorie ist das eine. Deshalb hier ein Fall aus unserer Arbeit — ohne Namen, aber mit echten Zahlen.\n\n'
      + 'Was dabei den Ausschlag gab, war nicht die Technik, sondern die Reihenfolge der Schritte.\n\n'
      + 'Wenn Sie mögen, schaue ich mir Ihre Situation einmal an. Unverbindlich und in 20 Minuten erledigt.',
  },
  {
    schritt: 4, tag: 14,
    betreff: 'Häufige Fragen — kurz beantwortet',
    text:
      'drei Fragen kommen fast immer:\n\n'
      + '1. Was kostet das ungefähr? — Das hängt vom Umfang ab; eine Spanne kann ich Ihnen in fünf Minuten nennen.\n'
      + '2. Wie lange dauert es? — Meist kürzer als befürchtet.\n'
      + '3. Was muss ich selbst tun? — Weniger, als Sie denken.\n\n'
      + 'Fehlt Ihre Frage? Schreiben Sie mir.',
  },
  {
    schritt: 5, tag: 21,
    betreff: 'Zum Schluss',
    text:
      'das war die letzte E-Mail zu „{{titel}}" — ich möchte Ihr Postfach nicht dauerhaft belegen.\n\n'
      + 'Der Ratgeber bleibt Ihnen. Und wenn das Thema später wieder aufkommt, melden Sie sich einfach.\n\n'
      + 'Danke fürs Lesen.',
  },
];

/** Neue Strecke fuer ein frisch angelegtes Freebie. */
export function standardStreckeFuer(freebieId: string, ownerUserId: string): {
  owner_user_id: string; freebie_id: string; schritt: number; tag: number;
  betreff: string; text: string; aktiv: boolean;
}[] {
  return STANDARD_STRECKE.map((s) => ({
    owner_user_id: ownerUserId,
    freebie_id: freebieId,
    schritt: s.schritt,
    tag: s.tag,
    betreff: s.betreff,
    text: s.text,
    aktiv: true,
  }));
}

/** Platzhalter ersetzen. Fehlt ein Wert, bleibt die Stelle leer statt „undefined". */
export function setzePlatzhalter(
  text: unknown,
  werte: { firma?: string | null; name?: string | null; titel?: string | null },
): string {
  return String(text ?? '')
    .replace(/\{\{\s*firma\s*\}\}/gi, (werte.firma || '').trim())
    .replace(/\{\{\s*name\s*\}\}/gi, (werte.name || '').trim())
    .replace(/\{\{\s*titel\s*\}\}/gi, (werte.titel || '').trim());
}

/** Anrede — mit Namen, wenn einer da ist. Immer „Sie". */
export function anrede(name: unknown): string {
  const n = String(name ?? '').trim();
  return n ? `Guten Tag ${n},` : 'Guten Tag,';
}

// ---------------------------------------------------------------------------
// Wann geht was raus?
// ---------------------------------------------------------------------------

export type LeadRoh = {
  status?: unknown;
  schritt?: unknown;
  faellig_am?: unknown;
  bestaetigt_am?: unknown;
  email?: unknown;
};

export type Entscheidung =
  | { tun: 'senden'; schritt: number; tag: number }
  | { tun: 'fertig' }
  | { tun: 'nichts'; grund: string };

function zeit(v: unknown): number {
  const t = new Date(String(v ?? '')).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** Faelligkeit eines Schritts: Bestaetigung plus `tag` Tage. */
export function faelligAm(bestaetigtAm: unknown, tag: unknown): string | null {
  const b = zeit(bestaetigtAm);
  const t = Math.max(0, Math.floor(Number(tag)) || 0);
  if (!Number.isFinite(b)) return null;
  return new Date(b + t * TAG_MS).toISOString();
}

/**
 * Was ist mit diesem Empfaenger zu tun?
 *
 * Die Reihenfolge der Pruefungen ist Absicht: Abgemeldet und unbestaetigt
 * schlagen ALLES andere. Lieber eine Mail zu wenig als eine zu viel — eine
 * Mail an einen Abgemeldeten ist ein Rechtsverstoss, keine Panne.
 */
export function entscheide(
  lead: LeadRoh | null | undefined,
  strecke: StreckenSchritt[] | null | undefined,
  jetztIso: string,
): Entscheidung {
  const l = lead || {};
  const status = String(l.status ?? '');
  if (status === STATUS_ABGEMELDET) return { tun: 'nichts', grund: 'abgemeldet' };
  if (status !== STATUS_AKTIV) return { tun: 'nichts', grund: 'nicht bestätigt' };
  if (!istEmailGueltig(String(l.email ?? ''))) return { tun: 'nichts', grund: 'keine gültige Adresse' };

  const schritte = (strecke || []).filter((s) => s && Number.isFinite(Number(s.schritt)))
    .slice().sort((a, b) => a.schritt - b.schritt);
  if (schritte.length === 0) return { tun: 'nichts', grund: 'keine Strecke hinterlegt' };

  const erledigt = Math.max(0, Math.floor(Number(l.schritt)) || 0);
  const naechster = schritte.find((s) => s.schritt > erledigt);
  if (!naechster) return { tun: 'fertig' };

  const jetzt = zeit(jetztIso);
  const faellig = zeit(l.faellig_am);
  // Kein Faelligkeitsdatum = noch nicht dran. Nie „dann eben sofort" —
  // sonst laufen bei einem Datenfehler alle fuenf Mails auf einmal raus.
  if (!Number.isFinite(faellig)) return { tun: 'nichts', grund: 'kein Termin gesetzt' };
  if (!Number.isFinite(jetzt) || jetzt < faellig) return { tun: 'nichts', grund: 'noch nicht fällig' };

  return { tun: 'senden', schritt: naechster.schritt, tag: naechster.tag };
}

/** Was nach einem erfolgreichen Versand in die Zeile geschrieben wird. */
export function nachVersandWerte(
  geschickterSchritt: number,
  strecke: StreckenSchritt[] | null | undefined,
  bestaetigtAm: unknown,
): { schritt: number; faellig_am: string | null } {
  const schritte = (strecke || []).slice().sort((a, b) => a.schritt - b.schritt);
  const naechster = schritte.find((s) => s.schritt > geschickterSchritt);
  return {
    schritt: geschickterSchritt,
    faellig_am: naechster ? faelligAm(bestaetigtAm, naechster.tag) : null,
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

export type FreebieRoh = {
  titel?: unknown;
  beschreibung?: unknown;
  datei_pfad?: unknown;
};

/**
 * Was fehlt, bevor das Freebie oeffentlich gehen darf? Gibt Klartext zurueck,
 * keine Feldnamen — der Betrieb soll wissen, was er tun muss.
 *
 * Das Impressum ist KEINE Formalie: Eine oeffentliche Seite ohne Anbieter-
 * angaben ist abmahnfaehig. Deshalb steht es in derselben Liste.
 */
export function fehltZumStart(
  freebie: FreebieRoh | null | undefined,
  strecke: { aktiv?: unknown }[] | null | undefined,
  impressumFehlend: string[] | null | undefined,
): string[] {
  const f = freebie || {};
  const fehlt: string[] = [];
  if (!String(f.titel ?? '').trim()) fehlt.push('Ein Titel');
  if (!String(f.beschreibung ?? '').trim()) fehlt.push('Eine kurze Beschreibung, was drinsteht');
  if (!String(f.datei_pfad ?? '').trim()) fehlt.push('Das PDF');
  if (!(strecke || []).some((s) => s?.aktiv)) fehlt.push('Mindestens eine aktive E-Mail in der Strecke');
  for (const i of impressumFehlend || []) fehlt.push(`Impressum: ${i}`);
  return fehlt;
}

// ---------------------------------------------------------------------------
// Zahlen fuer die Uebersicht
// ---------------------------------------------------------------------------

export type LeadZahlen = {
  gesamt: number;
  unbestaetigt: number;
  aktiv: number;
  abgemeldet: number;
  /** Von allen Eintragungen: wie viele haben bestätigt? (%) — null ohne Grundlage. */
  bestaetigungsquote: number | null;
};

export function zaehleLeads(liste: { status?: unknown }[] | null | undefined): LeadZahlen {
  const rows = liste || [];
  let unbestaetigt = 0, aktiv = 0, abgemeldet = 0;
  for (const r of rows) {
    const s = String(r?.status ?? '');
    if (s === STATUS_AKTIV) aktiv++;
    else if (s === STATUS_ABGEMELDET) abgemeldet++;
    else unbestaetigt++;
  }
  // Wer sich abgemeldet hat, HAT vorher bestaetigt — sonst haette er nie
  // eine Mail bekommen. Er zaehlt deshalb in den Zaehler.
  const bestaetigt = aktiv + abgemeldet;
  return {
    gesamt: rows.length,
    unbestaetigt, aktiv, abgemeldet,
    bestaetigungsquote: rows.length > 0 ? Math.round((bestaetigt / rows.length) * 1000) / 10 : null,
  };
}

/** Adresse pruefen und vereinheitlichen — ein Durchgang fuer die Routen. */
export function pruefeAnmeldung(emailRoh: unknown, nameRoh: unknown): { ok: true; email: string; name: string | null } | { ok: false; fehler: string } {
  const email = emailNormalisieren(typeof emailRoh === 'string' ? emailRoh : '');
  if (!istEmailGueltig(email)) {
    return { ok: false, fehler: 'Bitte prüfen Sie die E-Mail-Adresse.' };
  }
  const name = String(nameRoh ?? '').trim().slice(0, 80) || null;
  return { ok: true, email, name };
}
