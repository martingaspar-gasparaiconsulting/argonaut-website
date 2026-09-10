// ============================================================================
// ARGONAUT OS · lib/mailSmtp.ts — was der MENSCH tippt, geht über SEIN Postfach
//
// ▄▄▄ DIE TRENNLINIE ▄▄▄
// Was die Maschine verschickt, geht über uns (Resend, noreply@argonaut-os.com):
// Rechnungen, Mahnungen, Terminbestätigungen, Newsletter, Nachfass.
// Was der Mensch tippt, geht über sein eigenes Postfach (SMTP):
// die Antwort an einen Kunden, das erste Anschreiben, jede Zeile, die er selbst
// formuliert.
//
// WARUM NICHT ALLES ÜBER DAS KUNDENPOSTFACH
// Postfächer bei IONOS, Strato, GMX und der Telekom haben Tageslimits von
// einigen hundert Mails. Ein Newsletter darüber sperrt das Konto des Kunden —
// nicht unseres. Massenversand bleibt deshalb bei Resend.
//
// WARUM NICHT ALLES ÜBER RESEND
// Eine Antwort, die von noreply@argonaut-os.com kommt, ist keine Antwort des
// Betriebs. Der Kunde drückt „Antworten“ und schreibt ins Leere.
//
// Reine Rechen- und Textlogik: keine Imports, kein Netzwerk, keine Datenbank —
// mit `node --test` prüfbar. Der eigentliche Versand passiert in der Route.
// ============================================================================

/** Standard-Port für den Versand: 587 (STARTTLS). */
export const STANDARD_SMTP_PORT = 587;

/** Port für implizites TLS — hier wird von Anfang an verschlüsselt. */
export const TLS_PORT = 465;

/**
 * Höchstzahl der Empfänger je Nachricht.
 *
 * Das ist kein Komfort-Limit, sondern die Grenze zwischen „E-Mail schreiben“
 * und „Massenversand“. Wer 200 Adressen anschreiben will, nimmt den Newsletter
 * über Resend — sonst sperrt der Anbieter das Postfach des Kunden.
 */
export const MAX_EMPFAENGER = 5;

/** Längenbremse für den Betreff (RFC empfiehlt kurze Kopfzeilen). */
export const MAX_BETREFF = 200;

// ---------------------------------------------------------------------------
// Server und Port
// ---------------------------------------------------------------------------

/**
 * Der Versand-Server, wenn keiner eingetragen ist.
 *
 * Fast alle deutschen Anbieter spiegeln ihre Namen: imap.ionos.de ↔
 * smtp.ionos.de, imap.strato.de ↔ smtp.strato.de, imap.gmail.com ↔
 * smtp.gmail.com. Wo der Name NICHT mit „imap.“ beginnt (z. B. das verbreitete
 * `mail.firma.de`), bleibt er wie er ist — dort läuft meist beides über
 * denselben Rechner.
 *
 * Das ist eine begründete Annahme, keine Gewissheit. Sie erspart dem Kunden
 * eine Eingabe, die er ohnehin nicht sicher beantworten kann; wo sie daneben
 * liegt, trägt der Betreiber den Server von Hand ein.
 */
export function smtpHostAusImap(imapHost: unknown): string {
  const h = String(imapHost ?? '').trim().toLowerCase();
  if (!h) return '';
  if (h.startsWith('imap.')) return 'smtp.' + h.slice(5);
  return h;
}

/** Der Versand-Server: eingetragener Wert, sonst aus dem IMAP-Server abgeleitet. */
export function smtpHost(eingetragen: unknown, imapHost: unknown): string {
  const s = String(eingetragen ?? '').trim().toLowerCase();
  return s || smtpHostAusImap(imapHost);
}

/** SMTP-Port sicher als Zahl (Standard 587). */
export function smtpPort(roh: unknown): number {
  const n = typeof roh === 'number' ? roh : parseInt(String(roh ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : STANDARD_SMTP_PORT;
}

/**
 * Wird von Anfang an verschlüsselt (implizites TLS)?
 *
 * Nur Port 465. Auf 587 und 25 beginnt die Verbindung im Klartext und wird
 * per STARTTLS hochgestuft — dort muss `secure: false` stehen, sonst wartet
 * der Verbindungsaufbau ins Leere, bis der Zeitgeber zuschlägt.
 */
export function istImplizitesTls(port: unknown): boolean {
  return smtpPort(port) === TLS_PORT;
}

// ---------------------------------------------------------------------------
// Adressen und Kopfzeilen
// ---------------------------------------------------------------------------

const ADRESSE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

/** Sieht das wie eine E-Mail-Adresse aus? */
export function gueltigeAdresse(roh: unknown): boolean {
  return ADRESSE.test(String(roh ?? '').trim());
}

/**
 * Alles raus, was eine Kopfzeile sprengen könnte.
 *
 * Zeilenumbrüche in einem Header sind der klassische Weg, einer Nachricht
 * heimlich weitere Empfänger unterzuschieben (Header-Injection). Sie fliegen
 * hier raus, bevor irgendetwas zusammengebaut wird — nicht erst beim Versand.
 */
export function kopfSicher(roh: unknown): string {
  return String(roh ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Baut den Absender: `"Name" <adresse>` — ohne Name nur die Adresse. */
export function baueVon(name: unknown, adresse: unknown): string {
  const a = String(adresse ?? '').trim();
  if (!gueltigeAdresse(a)) return '';
  const n = kopfSicher(name).replace(/["<>]/g, '').trim();
  return n ? `"${n}" <${a}>` : a;
}

/**
 * Empfängerliste säubern und deckeln.
 *
 * Doppelte fallen weg (Groß-/Kleinschreibung zählt nicht), Ungültiges fällt
 * weg, und bei `MAX_EMPFAENGER` ist Schluss. Was zurückkommt, darf verschickt
 * werden — die Route muss nichts mehr prüfen.
 */
export function leseEmpfaenger(roh: unknown, hoechstens: number = MAX_EMPFAENGER): string[] {
  const teile = Array.isArray(roh) ? roh : String(roh ?? '').split(/[,;\s]+/);
  const raus: string[] = [];
  const gesehen = new Set<string>();
  for (const t of teile) {
    const a = String(t ?? '').trim();
    if (!gueltigeAdresse(a)) continue;
    const schluessel = a.toLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    raus.push(a);
    if (raus.length >= Math.max(1, hoechstens)) break;
  }
  return raus;
}

/** Betreff säubern und kürzen. Leer wird zu „(kein Betreff)“. */
export function baueBetreff(roh: unknown): string {
  const b = kopfSicher(roh).slice(0, MAX_BETREFF);
  return b || '(kein Betreff)';
}

/**
 * Betreff einer Antwort — „Re:“ genau einmal.
 *
 * „Re: Re: Re: Angebot“ ist das Kennzeichen eines Systems, das nicht mitdenkt.
 * Erkannt werden auch die Formen anderer Programme (AW:, WG:, Re[2]:).
 */
export function antwortBetreff(roh: unknown): string {
  let b = kopfSicher(roh);
  let vorher = '';
  while (b !== vorher) {
    vorher = b;
    b = b.replace(/^\s*(re|aw|antw|antwort)\s*(\[\d+\])?\s*:\s*/i, '');
  }
  // Bleibt nichts übrig, wäre der Betreff „Re:“ — eine Kopfzeile, die nichts
  // sagt. Dann lieber benennen, dass es keinen Betreff gibt.
  return baueBetreff('Re: ' + (b || baueBetreff('')));
}

// ---------------------------------------------------------------------------
// Der Nachrichtentext
// ---------------------------------------------------------------------------

/**
 * Aus HTML einen lesbaren Textkörper machen.
 *
 * Jede Mail geht mit BEIDEM raus, Text und HTML. Wer einen Textleser benutzt —
 * oder einen Spamfilter fragt — bekommt sonst eine leere Nachricht, und
 * fehlender Textteil ist eines der Merkmale, auf die Filter achten.
 */
export function textAusHtml(html: unknown): string {
  return String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    // Absätze und Überschriften trennt eine Leerzeile, Listenpunkte und
    // Tabellenzeilen nur ein Umbruch — sonst zerfasert jede Aufzählung.
    .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
    .replace(/<\/(li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '· ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Datum für die Zitatzeile — deutsch, ohne Bibliothek. */
function datumDeutsch(iso: unknown): string {
  const d = new Date(String(iso ?? ''));
  if (isNaN(d.getTime())) return '';
  const zwei = (n: number) => String(n).padStart(2, '0');
  return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()} um ${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

/**
 * Den zitierten Ursprungstext für eine Antwort aufbauen.
 *
 * Bewusst schlicht und nach dem Standard: eine Kopfzeile, dann jede Zeile mit
 * „> “. So erkennt jedes Mailprogramm auf der Gegenseite das Zitat und klappt
 * es zusammen.
 */
export function zitiere(text: unknown, absender: unknown, datum?: unknown): string {
  const inhalt = String(text ?? '').replace(/\r\n/g, '\n').trimEnd();
  if (!inhalt) return '';
  const wer = kopfSicher(absender) || 'Unbekannt';
  const wann = datumDeutsch(datum);
  const kopf = wann ? `Am ${wann} schrieb ${wer}:` : `${wer} schrieb:`;
  const zitat = inhalt.split('\n').map((z) => (z ? `> ${z}` : '>')).join('\n');
  return `${kopf}\n${zitat}`;
}

/** Der fertige Textkörper einer Antwort: eigener Text, Leerzeile, Zitat. */
export function baueAntwortText(eigener: unknown, zitat: unknown): string {
  const e = String(eigener ?? '').replace(/\r\n/g, '\n').trimEnd();
  const z = String(zitat ?? '').trim();
  if (!z) return e;
  return `${e}\n\n${z}`;
}

// ---------------------------------------------------------------------------
// Was die Route vor dem Versand prüft
// ---------------------------------------------------------------------------

export type Versand = {
  von: string;
  an: string[];
  betreff: string;
  text: string;
  host: string;
  port: number;
  sicher: boolean;
};

/**
 * Alle harten Fehler auf einmal. Leere Liste heißt: darf raus.
 *
 * Alle auf einmal, nicht einer nach dem anderen: Wer drei Angaben vergessen
 * hat, soll das in einem Durchgang erfahren und nicht dreimal auf „Senden“
 * drücken müssen.
 */
export function pruefeVersand(v: Partial<Versand> | null | undefined): string[] {
  const fehler: string[] = [];
  const s = v ?? {};

  if (!s.von || !String(s.von).trim()) fehler.push('Es ist kein Absender hinterlegt — bitte zuerst das Postfach verbinden.');
  if (!Array.isArray(s.an) || s.an.length === 0) fehler.push('Es fehlt ein gültiger Empfänger.');
  else if (s.an.length > MAX_EMPFAENGER) fehler.push(`Höchstens ${MAX_EMPFAENGER} Empfänger je Nachricht — für mehr ist der Newsletter da.`);
  if (!s.text || !String(s.text).trim()) fehler.push('Die Nachricht ist leer.');
  if (!s.host || !String(s.host).trim()) fehler.push('Für dieses Postfach ist kein Versand-Server hinterlegt.');

  return fehler;
}
