// ============================================================================
// ARGONAUT OS · lib/whatsappBestaetigung.ts — Paket 183
// WhatsApp-Anmeldung erst aktiv, wenn die Person selbst per WhatsApp antwortet
//
// BEFUND (Bauliste 183): Wer das öffentliche Anmeldeformular ausfüllte, stand
// sofort als „aktiv" in der Empfängerliste — auch mit einer FREMDEN Nummer.
// Ein Dritter konnte so jede beliebige Nummer in eine Werbeliste eintragen.
//
// LÖSUNG (Bestätigung durch die Person selbst, ohne dass wir vorher schreiben):
//   1. Formular  → Kontakt wartet (status bleibt „unbekannt"), bekommt einen
//                  Bestätigungscode. Es geht KEINE Nachricht an die Nummer —
//                  so kann das Formular auch niemanden belästigen.
//   2. Die Person tippt auf „WhatsApp öffnen" und schickt „ANMELDEN <CODE>"
//      an die Nummer des Betriebs. Meta liefert die Nachricht mit der echten
//      Absendernummer — fälschen lässt sich das nicht.
//   3. Webhook → Code und Absender passen → „aktiv", Nachweis gespeichert
//      (Zeitpunkt + Meta-Nachrichtenkennung).
//   „STOP" (und Verwandte) meldet jederzeit ab — das versprach der
//   Einwilligungstext schon immer, umgesetzt war es bisher nicht.
//
// Reine Funktionen, keine Netz-/Datenbankaufrufe → node --test.
// ============================================================================

/** Ohne 0/O, 1/I/L — der Code wird notfalls abgetippt. */
export const CODE_ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LAENGE = 6;
export const BESTAETIGUNG_GUELTIG_TAGE = 7;
export const ANMELDE_WORT = 'ANMELDEN';

/** Wörter, die als Abmeldung zählen (ganze Nachricht, Groß/Klein egal). */
export const STOP_WOERTER = ['STOP', 'STOPP', 'ABMELDEN', 'ABBESTELLEN', 'AUSTRAGEN', 'UNSUBSCRIBE'];

export function baueBestaetigungsCode(zufall: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LAENGE; i++) {
    const idx = Math.min(CODE_ZEICHEN.length - 1, Math.max(0, Math.floor(zufall() * CODE_ZEICHEN.length)));
    s += CODE_ZEICHEN[idx];
  }
  return s;
}

/** Der Text, den die Person an den Betrieb schickt. */
export function anmeldeNachricht(code: string): string {
  return `${ANMELDE_WORT} ${String(code || '').toUpperCase()}`;
}

/**
 * wa.me-Link zur Nummer des Betriebs mit vorbelegtem Text.
 * wa.me erwartet die Nummer nur aus Ziffern, ohne + und ohne führende 00.
 * Gibt '' zurück, wenn keine brauchbare Nummer da ist.
 */
export function waMeLink(betriebsNummer: string | null | undefined, text: string): string {
  let ziffern = String(betriebsNummer ?? '').replace(/[^\d+]/g, '');
  if (ziffern.startsWith('+')) ziffern = ziffern.slice(1);
  else if (ziffern.startsWith('00')) ziffern = ziffern.slice(2);
  else if (ziffern.startsWith('0')) ziffern = '49' + ziffern.slice(1);
  ziffern = ziffern.replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(ziffern)) return '';
  return `https://wa.me/${ziffern}?text=${encodeURIComponent(text)}`;
}

function aufbereiten(text: string | null | undefined): string {
  return String(text ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[​-‍﻿]/g, '')
    .replace(/[.!,;:"'„“”«»]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type EingangsAbsicht =
  | { art: 'bestaetigung'; code: string }
  | { art: 'stop' }
  | null;

/**
 * Was will die eingehende Nachricht?
 *  · „ANMELDEN AB12CD" (auch „anmelden ab12cd", mit Satzzeichen) → Bestätigung
 *  · genau ein Stop-Wort (auch „Stop.") → Abmeldung
 *  · alles andere → null (normales Gespräch, nichts ändern)
 * Ein Stop-Wort irgendwo MITTEN in einem Satz („ich kann nicht stoppen")
 * zählt bewusst nicht — sonst meldet ein harmloser Satz jemanden ab.
 */
export function eingangAuswerten(text: string | null | undefined): EingangsAbsicht {
  const t = aufbereiten(text);
  if (!t) return null;
  if (STOP_WOERTER.includes(t)) return { art: 'stop' };
  const m = new RegExp(`^${ANMELDE_WORT}\\s*([A-Z0-9]{${CODE_LAENGE}})$`).exec(t);
  if (m) return { art: 'bestaetigung', code: m[1] };
  return null;
}

/** Ist eine offene Anfrage noch gültig? (7 Tage ab Formular) */
export function bestaetigungNochGueltig(angefragtIso: string | null | undefined, jetzt: Date = new Date()): boolean {
  const roh = String(angefragtIso ?? '').trim();
  if (!roh) return false;
  const d = new Date(roh);
  if (isNaN(d.getTime())) return false;
  const alterMs = jetzt.getTime() - d.getTime();
  return alterMs >= -5 * 60 * 1000 && alterMs <= BESTAETIGUNG_GUELTIG_TAGE * 24 * 60 * 60 * 1000;
}

export type WartenderKontakt = {
  status?: string | null;
  bestaetigungs_code?: string | null;
  bestaetigung_angefragt_am?: string | null;
};

/**
 * Darf eine eingehende Bestätigung diesen Kontakt aktivieren?
 * Nur wenn: noch nicht aktiv, Code gesetzt und gleich, Anfrage nicht älter
 * als 7 Tage. Eine früher abgemeldete Nummer darf sich so SELBST wieder
 * anmelden — die Nachricht kommt ja nachweislich von ihr.
 */
export function bestaetigungPasst(
  kontakt: WartenderKontakt | null | undefined,
  code: string | null | undefined,
  jetzt: Date = new Date(),
): boolean {
  if (!kontakt) return false;
  if (kontakt.status === 'aktiv') return false;
  const soll = String(kontakt.bestaetigungs_code ?? '').toUpperCase();
  const ist = String(code ?? '').toUpperCase();
  if (soll.length !== CODE_LAENGE || ist !== soll) return false;
  return bestaetigungNochGueltig(kontakt.bestaetigung_angefragt_am, jetzt);
}

/** Einwilligungstext mit Nachweis-Hinweis (serverseitig, nie vom Browser). */
export function bestaetigterEinwilligungsText(grundtext: string, nachrichtKennung: string): string {
  return `${grundtext} — Bestätigt per WhatsApp-Nachricht „${ANMELDE_WORT} …" von dieser Nummer (Meta-Kennung ${nachrichtKennung || 'unbekannt'}).`;
}

/** Anzeige in der Empfängerliste. */
export function kontaktStatusText(k: { status?: string | null; wartet?: boolean | null }): string {
  if (k?.status === 'aktiv') return 'Aktiv';
  if (k?.wartet) return 'Wartet auf Bestätigung';
  if (k?.status === 'abgemeldet') return 'Abgemeldet';
  return 'Nur Gespräch';
}

/** Manuelles Eintragen: Wo liegt die Einwilligung vor? (Pflichtangabe) */
export const MANUELL_NACHWEIS_MIN = 5;
export function manuellerNachweis(bestaetigt: unknown, nachweis: unknown): { ok: true; text: string } | { ok: false; fehler: string } {
  if (bestaetigt !== true) {
    return { ok: false, fehler: 'Bitte bestätigen Sie, dass Ihnen die Einwilligung dieser Person vorliegt.' };
  }
  const n = String(nachweis ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (n.length < MANUELL_NACHWEIS_MIN) {
    return { ok: false, fehler: 'Bitte angeben, wo die Einwilligung vorliegt (z. B. „Auftragsformular vom 12.09.2026").' };
  }
  return { ok: true, text: `Manuell erfasst — Einwilligung liegt dem Betrieb vor: ${n}` };
}

/**
 * Paket 199 (Entscheidung D3): Antwort direkt nach der Bestätigung.
 * Freier Text ist erlaubt — die Person hat gerade selbst geschrieben, das
 * 24-Stunden-Fenster ist offen. Keine Werbung, nur Bestätigung + Abmeldeweg.
 */
export function dankeNachBestaetigung(firma: string | null | undefined): string {
  const f = String(firma ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const bei = f ? ` bei ${f}` : '';
  return `Danke, Sie sind jetzt angemeldet${bei}. Sie erhalten hier künftig unsere Nachrichten. Abmelden können Sie sich jederzeit, indem Sie STOP schreiben.`;
}
