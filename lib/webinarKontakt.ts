// ============================================================================
// ARGONAUT OS · lib/webinarKontakt.ts
// Webinar-Anmeldung -> CRM-Kontakt: reine Abbildung auf ein kontakte-Insert.
// Genau nach dem Muster von lib/leadKontakt.ts (Lead -> Kontakt).
//
// ▄▄▄ DIE EINE REGEL, DIE HIER ALLES ENTSCHEIDET ▄▄▄
// Die Übernahme setzt KEINE Werbe-Einwilligung. Wer sich für ein Webinar
// angemeldet hat, hat in genau DAS eingewilligt — in die Zugangsdaten, die
// Erinnerungen und die Unterlagen danach. Nicht in den Newsletter, nicht in
// Angebotspost, nicht in eine Rückhol-Strecke.
//
// Wer beim Übernehmen werbe_einwilligung auf true setzt, verwandelt eine enge
// Einwilligung still in eine weite. Das ist genau der Fall, den § 7 UWG meint,
// und es wäre in lib/segmente.ts hinterher nicht mehr zu erkennen: dort stünde
// „erlaubt", und niemand wüsste, woher. Deshalb bleiben die vier Werbe-Spalten
// hier unangetastet — der Betrieb muss die Einwilligung getrennt einholen.
// (lib/leadKontakt.ts macht es genauso; ein Test hält beide Dateien daran fest.)
//
// KEINE Supabase-Aufrufe, KEINE React-Hooks. Node-getestet.
// ============================================================================

import { nameSplit, type KontaktInsert } from './leadKontakt';
import { TEILNAHME_TEILGENOMMEN, TEILNAHME_GEFEHLT } from './webinar';

export interface AnmeldungFuerKontakt {
  email?: string | null;
  name?: string | null;
  firma?: string | null;
  teilnahme?: string | null;
}

export interface WebinarFuerKontakt {
  titel?: string | null;
  /** Der Termin, zu dem die Person angemeldet war — schon lesbar formatiert. */
  terminText?: string | null;
}

/**
 * Baut das kontakte-Insert aus einer Webinar-Anmeldung.
 * owner_user_id wird per DB-Vorgabe gesetzt, genau wie bei der Lead-Übernahme.
 *
 * Die Notiz hält fest, WOHER der Kontakt kommt und ob die Person wirklich da
 * war. Das ist der Unterschied zwischen „hat sich mal eingetragen" und „hat
 * 45 Minuten zugehört" — und damit der halbe Wert des ganzen Moduls.
 */
export function kontaktAusAnmeldung(
  anmeldung: AnmeldungFuerKontakt,
  webinar: WebinarFuerKontakt = {},
): KontaktInsert {
  const { vorname, nachname } = nameSplit(anmeldung.name);
  const titel = String(webinar.titel ?? '').trim();
  const termin = String(webinar.terminText ?? '').trim();

  const zeilen: string[] = ['Aus Webinar-Anmeldung übernommen.'];
  if (titel) zeilen.push('Webinar: ' + titel);
  if (termin) zeilen.push('Termin: ' + termin);

  const t = String(anmeldung.teilnahme ?? '');
  if (t === TEILNAHME_TEILGENOMMEN) zeilen.push('Hat teilgenommen.');
  else if (t === TEILNAHME_GEFEHLT) zeilen.push('War angemeldet, hat gefehlt.');
  else zeilen.push('Teilnahme nicht erfasst.');

  zeilen.push('Hinweis: Es liegt KEINE Einwilligung für Werbepost vor — die Anmeldung galt nur diesem Webinar.');

  return {
    vorname,
    nachname,
    email: (anmeldung.email && anmeldung.email.trim()) || null,
    telefon: null,
    position: null,
    firma: (anmeldung.firma && anmeldung.firma.trim()) || null,
    status: 'interessent',
    quelle: titel ? `Webinar: ${titel}`.slice(0, 120) : 'Webinar',
    betreuungs_intervall_tage: 30,
    notizen: zeilen.join('\n'),
  };
}

/**
 * Welche Anmeldungen lassen sich übernehmen?
 *
 * Abgemeldete sind ausgeschlossen: Wer sich abgemeldet hat, wandert nicht
 * durch die Hintertür ins CRM. Unbestätigte ebenso — ohne den Klick im
 * Double-Opt-in ist nicht einmal sicher, dass die Adresse der Person gehört.
 * Und wer schon als Kontakt existiert, wird nicht doppelt angelegt.
 */
export function uebernehmbar<T extends { email?: string | null; status?: string | null }>(
  anmeldungen: T[] | null | undefined,
  vorhandeneMails: Iterable<string> | null | undefined,
  aktivStatus = 'aktiv',
): T[] {
  const schon = new Set<string>();
  for (const m of vorhandeneMails || []) schon.add(String(m ?? '').trim().toLowerCase());

  const gesehen = new Set<string>();
  const aus: T[] = [];
  for (const a of anmeldungen || []) {
    if (!a) continue;
    if (String(a.status ?? '') !== aktivStatus) continue;
    const mail = String(a.email ?? '').trim().toLowerCase();
    if (!mail) continue;
    if (schon.has(mail)) continue;
    // Dieselbe Person kann zu zwei Terminen angemeldet sein — nur EINMAL anlegen.
    if (gesehen.has(mail)) continue;
    gesehen.add(mail);
    aus.push(a);
  }
  return aus;
}
