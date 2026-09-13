// ============================================================================
// ARGONAUT OS · lib/rueckholung.ts — Rückhol-Strecke (3.15 Paket 3)
//
// Kunden, die lange nichts mehr gekauft haben, bekommen eine kurze Folge von
// Nachrichten. Die Bausteine dafür gab es schon einzeln:
//   · lib/segmente.ts  — wer darf überhaupt Post bekommen (werbeStatus)
//   · lib/automation.ts + /api/cron/automationen — ein Auslöser, EINE Aktion
//   · lib/freebie.ts   — eine mehrstufige Strecke, aber nur für Interessenten
// Was fehlte, ist genau dazwischen: eine STRECKE für Bestandskunden.
//
// ▄▄▄ DREI ENTSCHEIDUNGEN, DIE HIER FEST EINGEBAUT SIND ▄▄▄
//
// 1. „Nichts gekauft" ist nicht dasselbe wie „nichts gehört".
//    Der Automations-Auslöser „kontakt_lange_still" geht auf
//    kontakte.letzter_kontakt_am — das ändert sich schon, wenn jemand anruft.
//    Hier zählt der letzte KAUF aus den Rechnungen; der letzte Kontakt ist nur
//    der Rückfall, wenn es nie eine Rechnung gab.
//
// 2. Wer reagiert, fällt sofort raus.
//    Sobald jemand kauft oder sich meldet, wird die Strecke gestoppt — nicht
//    erst beim nächsten Schritt. Eine Rückhol-Mail an jemanden, der gestern
//    bestellt hat, ist schlimmer als gar keine.
//
// 3. Eine Strecke läuft je Kunde nur EINMAL pro Sperrfrist.
//    Ohne SPERRE_TAGE würde derselbe Kunde alle paar Monate wieder
//    angeschrieben, weil sein letzter Kauf ja weiterhin lange her ist. Das ist
//    keine Rückholung mehr, das ist Dauerbeschallung.
//
// Die Einwilligungsprüfung kommt aus lib/segmente.ts und wird hier NICHT
// nachgebaut — eine zweite Fassung derselben Regel wäre die, die irgendwann
// abweicht.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — pure, node-testbar.
// „heute"/„jetzt" wird immer hereingereicht, nie hier gebildet.
// ============================================================================

import { werbeStatus, type WerbeStatus } from './segmente';

// ---------------------------------------------------------------- Grenzwerte

/**
 * Unter dieser Ruhezeit gilt niemand als ruhend. Ein Betrieb, der die Grenze
 * auf 14 Tage stellt, schreibt seine Stammkunden an — das ist kein Rückholen,
 * das ist Drängeln.
 */
export const MIN_RUHE_TAGE = 30;

/** Obergrenze gegen Vertipper (10 Jahre). */
export const MAX_RUHE_TAGE = 3650;

/** Mehr als fünf Nachrichten sind keine Strecke mehr, sondern eine Belagerung. */
export const MAX_SCHRITTE = 5;

/** Mindestabstand zwischen zwei Schritten, in Tagen. */
export const MIND_ABSTAND_TAGE = 3;

/**
 * Wer eine Strecke durchlaufen hat, kommt so lange nicht wieder hinein.
 * Ein halbes Jahr — danach ist eine erneute Ansprache eine neue Gelegenheit
 * und keine Wiederholung.
 */
export const SPERRE_TAGE = 180;

// ---------------------------------------------------------------------- Typen

export type Schritt = {
  /** 1, 2, 3 … in dieser Reihenfolge wird gesendet. */
  schritt: number;
  /** Tage nach dem START der Strecke (nicht nach dem vorigen Schritt). */
  nach_tagen: number;
  betreff: string;
  text: string;
  aktiv?: boolean;
};

export type Strecke = {
  id?: unknown;
  name?: unknown;
  aktiv?: unknown;
  /** Ab wie vielen Tagen ohne Kauf jemand als ruhend gilt. */
  ruhe_tage?: unknown;
  schritte?: Schritt[] | null;
};

export type Kontakt = Record<string, unknown>;

export type Lauf = {
  id?: unknown;
  kontakt_id?: unknown;
  email?: unknown;
  /** ISO-Zeitpunkt, an dem der Kontakt in die Strecke kam. */
  gestartet_am?: unknown;
  /** Zuletzt GESENDETER Schritt. 0 oder leer = noch keiner. */
  schritt?: unknown;
  status?: unknown;
  beendet_am?: unknown;
};

export type StoppGrund =
  | 'gekauft'
  | 'gemeldet'
  | 'widersprochen'
  | 'abgemeldet'
  | 'keine_adresse'
  | 'strecke_leer';

export const STOPP_TEXT: Record<StoppGrund, string> = {
  gekauft: 'hat inzwischen wieder gekauft',
  gemeldet: 'hat sich inzwischen selbst gemeldet',
  widersprochen: 'hat der Werbung widersprochen',
  abgemeldet: 'hat sich abgemeldet',
  keine_adresse: 'keine E-Mail-Adresse hinterlegt',
  strecke_leer: 'die Strecke hat keinen aktiven Schritt mehr',
};

// -------------------------------------------------------------- kleine Helfer

function tag(v: unknown): string | null {
  const s = String(v ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function ganzeZahl(v: unknown, standard = 0): number {
  // Leer ist NICHT null: Number('') ergibt 0. Ohne diese Pruefung waere eine
  // fehlende Wartezeit stillschweigend „sofort" statt ein Fehler — und
  // fehltZumStarten() haette sie nie gemeldet. Gefunden 13.09. beim Bau der
  // Einblendung, dort steckte derselbe Fehler.
  if (v === null || v === undefined) return standard;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : standard;
  const s = String(v).trim();
  if (s === '') return standard;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : standard;
}

/** Ganze Tage von a nach b. Negativ, wenn b vor a liegt. */
export function tageZwischen(vonIso: unknown, bisIso: unknown): number | null {
  const a = tag(vonIso);
  const b = tag(bisIso);
  if (!a || !b) return null;
  const ms = new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 86400000);
}

/** Das spätere von zwei Daten; null-sicher. */
export function spaeter(a: unknown, b: unknown): string | null {
  const x = tag(a);
  const y = tag(b);
  if (!x) return y;
  if (!y) return x;
  return x > y ? x : y;
}

/** ISO-Tag, der `tage` nach `vonIso` liegt. */
export function plusTage(vonIso: unknown, tage: unknown): string | null {
  const a = tag(vonIso);
  if (!a) return null;
  const n = ganzeZahl(tage, 0);
  const d = new Date(a + 'T00:00:00Z').getTime() + n * 86400000;
  if (Number.isNaN(d)) return null;
  return new Date(d).toISOString().slice(0, 10);
}

// ------------------------------------------------- Wann war der letzte Kauf?

export type Rechnungszeile = {
  kontakt_id?: unknown;
  /** Rechnungs- oder Zahldatum — was der Aufrufer für maßgeblich hält. */
  datum?: unknown;
};

/**
 * Je Kontakt das jüngste Rechnungsdatum.
 *
 * Bewusst nimmt diese Funktion eine fertige Liste entgegen und fragt nichts
 * selbst ab — welche Rechnungen zählen (bezahlt? storniert?), entscheidet die
 * Route, nicht die Rechenregel.
 */
export function letzterKaufJeKontakt(zeilen: Rechnungszeile[] | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const z of zeilen ?? []) {
    const id = String(z?.kontakt_id ?? '').trim();
    const d = tag(z?.datum);
    if (!id || !d) continue;
    const alt = map.get(id);
    if (!alt || d > alt) map.set(id, d);
  }
  return map;
}

/**
 * Der maßgebliche „letzte Berührung"-Tag eines Kontakts.
 *
 * Erst der letzte Kauf. Gibt es keinen, der letzte Kontakt. Gibt es auch den
 * nicht, das Datum, an dem er Kunde wurde. Findet sich gar nichts, ist das
 * Ergebnis null — und null bedeutet weiter unten „nicht anschreiben", nie
 * „schon ewig her".
 */
export function letzteBeruehrung(kontakt: Kontakt | null | undefined, letzterKauf: string | null | undefined): string | null {
  if (!kontakt) return null;
  const kauf = tag(letzterKauf);
  if (kauf) return kauf;
  const kontaktTag = tag(kontakt.letzter_kontakt_am);
  if (kontaktTag) return kontaktTag;
  return tag(kontakt.kunde_seit);
}

/** Die eingestellte Ruhezeit auf einen vernünftigen Bereich bringen. */
export function ruheTage(roh: unknown): number {
  const n = ganzeZahl(roh, MIN_RUHE_TAGE);
  if (n < MIN_RUHE_TAGE) return MIN_RUHE_TAGE;
  if (n > MAX_RUHE_TAGE) return MAX_RUHE_TAGE;
  return n;
}

export type RuhendErgebnis = {
  ruhend: boolean;
  /** Wie viele Tage seit der letzten Berührung. null = unbekannt. */
  tageStill: number | null;
  grund: string;
};

/**
 * Ist dieser Kontakt ruhend — also ein Fall für die Rückholung?
 *
 * Im Zweifel NEIN: kein Datum, keine Adresse, keine Einwilligung → kein
 * Kandidat. Lieber jemanden nicht zurückholen als den Falschen anschreiben.
 */
export function istRuhend(
  kontakt: Kontakt | null | undefined,
  letzterKauf: string | null | undefined,
  heute: string,
  roheRuheTage: unknown,
): RuhendErgebnis {
  if (!kontakt) return { ruhend: false, tageStill: null, grund: 'kein Kontakt' };

  if (!String(kontakt.email ?? '').includes('@')) {
    return { ruhend: false, tageStill: null, grund: STOPP_TEXT.keine_adresse };
  }

  const status: WerbeStatus = werbeStatus(kontakt, 'kontakte');
  if (status !== 'erlaubt') {
    return { ruhend: false, tageStill: null, grund: `darf keine Werbung bekommen (${status})` };
  }

  const letzte = letzteBeruehrung(kontakt, letzterKauf);
  if (!letzte) {
    return { ruhend: false, tageStill: null, grund: 'kein Datum für den letzten Kauf oder Kontakt' };
  }

  const her = tageZwischen(letzte, heute);
  if (her == null) return { ruhend: false, tageStill: null, grund: 'Datum unbrauchbar' };
  if (her < 0) return { ruhend: false, tageStill: her, grund: 'letzte Berührung liegt in der Zukunft' };

  const grenze = ruheTage(roheRuheTage);
  if (her < grenze) {
    return { ruhend: false, tageStill: her, grund: `erst ${her} von ${grenze} Tagen still` };
  }
  return { ruhend: true, tageStill: her, grund: `seit ${her} Tagen kein Kauf` };
}

/**
 * Ist dieser Kontakt wegen eines früheren Durchlaufs noch gesperrt?
 * `letzterLaufBeendet` ist das Ende des letzten Durchlaufs (ISO-Tag).
 */
export function nochGesperrt(letzterLaufBeendet: unknown, heute: string, sperreTage: number = SPERRE_TAGE): boolean {
  const ende = tag(letzterLaufBeendet);
  if (!ende) return false;
  const her = tageZwischen(ende, heute);
  if (her == null) return false;
  return her < Math.max(0, Math.trunc(sperreTage));
}

// --------------------------------------------------------- Strecke einrichten

/** Nur aktive Schritte, aufsteigend sortiert. */
export function aktiveSchritte(strecke: Strecke | null | undefined): Schritt[] {
  return (strecke?.schritte ?? [])
    .filter((s): s is Schritt => !!s && s.aktiv !== false)
    .slice()
    .sort((a, b) => ganzeZahl(a.schritt) - ganzeZahl(b.schritt));
}

/**
 * Was der Strecke zum Scharfschalten fehlt. Leere Liste heißt: sie kann los.
 * Die Meldungen sind für den Betrieb geschrieben, nicht für Entwickler.
 */
export function fehltZumStarten(strecke: Strecke | null | undefined): string[] {
  const fehlt: string[] = [];
  if (String(strecke?.name ?? '').trim().length < 2) fehlt.push('ein Name für die Strecke');

  const schritte = aktiveSchritte(strecke);
  if (schritte.length === 0) {
    fehlt.push('mindestens eine Nachricht');
    return fehlt;
  }
  if (schritte.length > MAX_SCHRITTE) {
    fehlt.push(`höchstens ${MAX_SCHRITTE} Nachrichten — mehr wird als Belästigung empfunden`);
  }

  let vorigeTage: number | null = null;
  for (const s of schritte) {
    const nr = ganzeZahl(s.schritt);
    if (!String(s.betreff ?? '').trim()) fehlt.push(`ein Betreff bei Nachricht ${nr}`);
    if (!String(s.text ?? '').trim()) fehlt.push(`ein Text bei Nachricht ${nr}`);

    const t = ganzeZahl(s.nach_tagen, -1);
    if (t < 0) {
      fehlt.push(`eine gültige Wartezeit bei Nachricht ${nr}`);
      continue;
    }
    if (vorigeTage !== null && t - vorigeTage < MIND_ABSTAND_TAGE) {
      fehlt.push(`mindestens ${MIND_ABSTAND_TAGE} Tage Abstand vor Nachricht ${nr}`);
    }
    vorigeTage = t;
  }

  const nummern = schritte.map((s) => ganzeZahl(s.schritt));
  if (new Set(nummern).size !== nummern.length) fehlt.push('jede Nachricht braucht eine eigene Nummer');

  return fehlt;
}

/** Die Strecke als deutscher Satz — zum Lesen vor dem Scharfschalten. */
export function beschreibe(strecke: Strecke | null | undefined): string {
  const schritte = aktiveSchritte(strecke);
  if (schritte.length === 0) return 'Noch keine Nachricht — es würde niemand angeschrieben.';
  const grenze = ruheTage(strecke?.ruhe_tage);
  const tage = schritte.map((s) => ganzeZahl(s.nach_tagen));
  const folge = tage.map((t) => (t === 0 ? 'sofort' : `nach ${t} Tagen`)).join(', ');
  return (
    `Wer seit ${grenze} Tagen nichts gekauft hat, bekommt ${schritte.length} ` +
    `${schritte.length === 1 ? 'Nachricht' : 'Nachrichten'} (${folge}). ` +
    `Wer zwischendurch kauft oder sich meldet, fällt sofort heraus. ` +
    `Danach ${SPERRE_TAGE} Tage Ruhe.`
  );
}

// ------------------------------------------------------ Abbruch während des Laufs

/**
 * Muss dieser Lauf gestoppt werden?
 *
 * Geprüft wird gegen den START der Strecke: alles, was DANACH passiert ist,
 * ist eine Reaktion. Ein Kauf von vor der Strecke war ja gerade der Anlass.
 */
export function stoppGrund(
  kontakt: Kontakt | null | undefined,
  letzterKauf: string | null | undefined,
  gestartetAm: unknown,
): StoppGrund | null {
  if (!kontakt) return 'keine_adresse';

  const status = werbeStatus(kontakt, 'kontakte');
  if (status === 'widersprochen') return 'widersprochen';
  if (status === 'abgemeldet') return 'abgemeldet';

  if (!String(kontakt.email ?? '').includes('@')) return 'keine_adresse';

  const start = tag(gestartetAm);
  if (!start) return null;

  const kauf = tag(letzterKauf);
  if (kauf && kauf >= start) return 'gekauft';

  const kontaktTag = tag(kontakt.letzter_kontakt_am);
  if (kontaktTag && kontaktTag > start) return 'gemeldet';

  return null;
}

// ------------------------------------------------------------ Was ist fällig?

export type Entscheidung =
  | { tun: 'senden'; schritt: number; betreff: string; text: string; grund: string }
  | { tun: 'warten'; schritt: number; faelligAm: string | null; grund: string }
  | { tun: 'fertig'; grund: string }
  | { tun: 'stopp'; stopp: StoppGrund; grund: string };

/**
 * Der Kern: was passiert mit diesem Lauf heute?
 *
 * Reihenfolge — und die ist wichtig: erst Abbruch prüfen, dann Fertigsein,
 * dann Fälligkeit. Wer gekauft hat, bekommt auch dann nichts mehr, wenn
 * seine nächste Nachricht heute dran wäre.
 */
export function entscheide(
  lauf: Lauf | null | undefined,
  strecke: Strecke | null | undefined,
  kontakt: Kontakt | null | undefined,
  letzterKauf: string | null | undefined,
  heute: string,
): Entscheidung {
  const stopp = stoppGrund(kontakt, letzterKauf, lauf?.gestartet_am);
  if (stopp) return { tun: 'stopp', stopp, grund: STOPP_TEXT[stopp] };

  const schritte = aktiveSchritte(strecke);
  if (schritte.length === 0) {
    return { tun: 'stopp', stopp: 'strecke_leer', grund: STOPP_TEXT.strecke_leer };
  }

  const gesendet = Math.max(0, ganzeZahl(lauf?.schritt, 0));
  const offen = schritte.filter((s) => ganzeZahl(s.schritt) > gesendet);
  if (offen.length === 0) return { tun: 'fertig', grund: 'alle Nachrichten verschickt' };

  const naechster = offen[0];
  const faelligAm = plusTage(lauf?.gestartet_am, ganzeZahl(naechster.nach_tagen));
  if (!faelligAm) return { tun: 'fertig', grund: 'Startdatum des Laufs unbrauchbar' };

  const restTage = tageZwischen(heute, faelligAm);
  if (restTage != null && restTage > 0) {
    return {
      tun: 'warten',
      schritt: ganzeZahl(naechster.schritt),
      faelligAm,
      grund: `Nachricht ${ganzeZahl(naechster.schritt)} ist erst in ${restTage} ${restTage === 1 ? 'Tag' : 'Tagen'} dran`,
    };
  }

  return {
    tun: 'senden',
    schritt: ganzeZahl(naechster.schritt),
    betreff: String(naechster.betreff ?? ''),
    text: String(naechster.text ?? ''),
    grund: `Nachricht ${ganzeZahl(naechster.schritt)} ist fällig`,
  };
}

/** Was nach einem erfolgreichen Versand in die Lauf-Zeile geschrieben wird. */
export function nachVersand(
  schritt: number,
  strecke: Strecke | null | undefined,
  gestartetAm: unknown,
  heute: string,
): { schritt: number; faellig_am: string | null; status: string; beendet_am: string | null } {
  const schritte = aktiveSchritte(strecke);
  const offen = schritte.filter((s) => ganzeZahl(s.schritt) > schritt);
  if (offen.length === 0) {
    return { schritt, faellig_am: null, status: 'fertig', beendet_am: heute };
  }
  return {
    schritt,
    faellig_am: plusTage(gestartetAm, ganzeZahl(offen[0].nach_tagen)),
    status: 'aktiv',
    beendet_am: null,
  };
}

// --------------------------------------------------------------- Platzhalter

export type PlatzhalterWerte = {
  name?: unknown;
  firma?: unknown;
  betrieb?: unknown;
  tage?: unknown;
  letzter_kauf?: unknown;
};

/** Datum als 13.09.2026; leer bei unbrauchbarer Eingabe. */
export function datumDeutsch(wert: unknown): string {
  const t = tag(wert);
  if (!t) return '';
  return `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;
}

/**
 * {{name}}, {{firma}}, {{betrieb}}, {{tage}}, {{letzter_kauf}} ersetzen.
 * Unbekannte Platzhalter werden GELEERT statt stehen gelassen — „{{vorname}}"
 * mitten in einer Kundenmail ist peinlicher als eine Lücke.
 */
export function setzePlatzhalter(text: unknown, werte: PlatzhalterWerte | null | undefined): string {
  const w = werte ?? {};
  const tabelle: Record<string, string> = {
    name: String(w.name ?? '').trim(),
    firma: String(w.firma ?? '').trim(),
    betrieb: String(w.betrieb ?? '').trim(),
    tage: String(w.tage ?? '').trim(),
    letzter_kauf: datumDeutsch(w.letzter_kauf),
  };
  return String(text ?? '').replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_t, key: string) => tabelle[key] ?? '');
}

/** Anrede aus einem Kontakt — ohne Namen bewusst allgemein und gesiezt. */
export function anrede(kontakt: Kontakt | null | undefined): string {
  const nach = String(kontakt?.nachname ?? '').trim();
  if (nach) return `Guten Tag ${nach},`;
  const vor = String(kontakt?.vorname ?? '').trim();
  if (vor) return `Guten Tag ${vor},`;
  const firma = String(kontakt?.firma ?? '').trim();
  if (firma) return `Guten Tag,`;
  return 'Guten Tag,';
}

/** Name für {{name}} — Nachname bevorzugt, sonst Vorname, sonst Firma. */
export function nameFuer(kontakt: Kontakt | null | undefined): string {
  const nach = String(kontakt?.nachname ?? '').trim();
  const vor = String(kontakt?.vorname ?? '').trim();
  const firma = String(kontakt?.firma ?? '').trim();
  if (nach) return [vor, nach].filter(Boolean).join(' ');
  if (vor) return vor;
  return firma;
}

// ------------------------------------------------------------- Vorlage

/**
 * Eine fertige Strecke zum Anklicken. Drei Nachrichten, höflich, ohne Druck —
 * und die letzte macht ausdrücklich Schluss, statt eine vierte anzukündigen.
 */
export const VORLAGE: { name: string; ruhe_tage: number; schritte: Schritt[] } = {
  name: 'Wir würden uns freuen, wieder von Ihnen zu hören',
  ruhe_tage: 180,
  schritte: [
    {
      schritt: 1,
      nach_tagen: 0,
      betreff: 'Lange nichts voneinander gehört',
      text:
        'wir haben gemerkt, dass wir länger nicht voneinander gehört haben — der letzte Auftrag ist inzwischen eine Weile her.\n\n' +
        'Falls etwas offen geblieben ist oder Sie mit etwas nicht zufrieden waren: Wir hören das gern, auch wenn es unangenehm ist.\n\n' +
        'Und falls es einfach der Alltag war — melden Sie sich, wann immer es passt.',
    },
    {
      schritt: 2,
      nach_tagen: 10,
      betreff: 'Kurze Nachfrage',
      text:
        'wir wollten nur kurz nachfragen, ob unsere letzte Nachricht angekommen ist.\n\n' +
        'Wenn sich bei Ihnen etwas geändert hat oder wir gerade nicht der richtige Partner sind, ist das völlig in Ordnung — ' +
        'eine kurze Rückmeldung genügt, dann halten wir uns zurück.',
    },
    {
      schritt: 3,
      nach_tagen: 24,
      betreff: 'Wir melden uns nicht wieder',
      text:
        'das ist unsere letzte Nachricht zu diesem Thema — wir möchten Sie nicht behelligen.\n\n' +
        'Die Tür bleibt offen: Wenn Sie uns brauchen, sind wir da. Bis dahin wünschen wir Ihnen alles Gute.',
    },
  ],
};
