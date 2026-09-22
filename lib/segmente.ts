import { leseZahl } from './zahlen';
// ============================================================================
// ARGONAUT OS · lib/segmente.ts — Empfängergruppen bilden (3.15 Teil 1)
//
// Bisher geht eine Mail an ALLE oder an niemanden. Eine Gruppe wie „Kunden aus
// dem Handwerk im Umkreis 70xxx, die seit 90 Tagen nichts gekauft haben" ließ
// sich nicht bilden — und genau daran hängt, ob Werbepost als hilfreich oder
// als Belästigung ankommt.
//
// ▄▄▄ SEGMENTIERT WIRD NUR NACH STAMMDATEN UND ERKLÄRTEN HANDLUNGEN ▄▄▄
// Erlaubt sind Merkmale, die der Betrieb ohnehin führt (Branche, Ort, Kunde
// seit, Umsatz) und Dinge, die der Mensch SELBST getan hat: etwas angefordert,
// gekauft, sich angemeldet.
//
// NICHT erlaubt ist beobachtetes Verhalten — wer welche Mail geöffnet oder
// angeklickt hat. Das wäre Profilbildung und nach DSGVO eigenständig
// einwilligungsbedürftig. lib/mailMessung.ts hält aus genau diesem Grund nur
// Summen je Versand fest und kennt keine Person; die Sperrliste unten hält
// diese Entscheidung auch dann durch, wenn jemand später eine Spalte anlegt.
//
// Ein Merkmal, das nicht im Katalog steht, wird nicht ausgewertet — die Regel
// fällt dann durch, statt still etwas anderes zu treffen.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — pure, node-testbar.
// ============================================================================

/** Merkmale, nach denen NIE segmentiert wird. Profilbildung, siehe Kopf. */
export const GESPERRTE_MERKMALE: string[] = [
  'geoeffnet', 'geoeffnet_am', 'geklickt', 'geklickt_am', 'oeffnungen', 'klicks',
  'ip', 'ip_adresse', 'geraet', 'browser', 'standort_gps', 'verweildauer',
];

export type MerkmalTyp = 'text' | 'zahl' | 'datum' | 'ja_nein';

/** Woher die Empfänger kommen. Jede Quelle hat ihre eigenen Spalten. */
export type Quelle = 'kontakte' | 'newsletter';

export const QUELLEN: { schluessel: Quelle; label: string; hilfe: string }[] = [
  { schluessel: 'kontakte', label: 'Kunden & Kontakte', hilfe: 'alles aus dem CRM' },
  { schluessel: 'newsletter', label: 'Newsletter-Anmeldungen', hilfe: 'wer sich selbst eingetragen hat' },
];

export type Merkmal = {
  schluessel: string;
  label: string;
  typ: MerkmalTyp;
  /** Kurze Erklärung für die Oberfläche — in Martins Sprache, nicht in Fachsprache. */
  hilfe: string;
  /** In welchen Quellen es diese Spalte WIRKLICH gibt. */
  quellen: Quelle[];
};

/**
 * Der Katalog der erlaubten Merkmale.
 *
 * Jeder Eintrag entspricht einer Spalte, die am 13.09.2026 in der Datenbank
 * nachgesehen wurde — nicht einer, die es geben könnte. Ein Merkmal ohne
 * Spalte wäre eine leere Liste im Browser bei grünem Build.
 *
 * NICHT dabei und bewusst offen (Andockpunkte): Branche (steht am BETRIEB in
 * profiles.kategorie, nicht am Kontakt), Umsatz gesamt (müsste aus den
 * Rechnungen gerechnet werden), angefordertes Freebie (liegt in freebie_lead),
 * eigenes Merkmal (kommt aus den eigenen Feldern je Betrieb).
 */
export const MERKMALE: Merkmal[] = [
  { schluessel: 'firma', label: 'Firma', typ: 'text', hilfe: 'Firmenname des Kontakts', quellen: ['kontakte'] },
  { schluessel: 'ort', label: 'Ort', typ: 'text', hilfe: 'Ort aus der Anschrift', quellen: ['kontakte'] },
  { schluessel: 'plz', label: 'Postleitzahl', typ: 'text', hilfe: 'auch der Anfang genügt — „70" trifft ganz Stuttgart', quellen: ['kontakte'] },
  { schluessel: 'land', label: 'Land', typ: 'text', hilfe: 'für Versand außerhalb Deutschlands', quellen: ['kontakte'] },
  { schluessel: 'position', label: 'Position', typ: 'text', hilfe: 'Geschäftsführung, Einkauf, Technik …', quellen: ['kontakte'] },
  { schluessel: 'status', label: 'Status', typ: 'text', hilfe: 'wie der Kontakt im CRM geführt wird', quellen: ['kontakte', 'newsletter'] },
  { schluessel: 'quelle', label: 'Woher gekommen', typ: 'text', hilfe: 'Website, Empfehlung, Messe …', quellen: ['kontakte', 'newsletter'] },
  { schluessel: 'kunde_seit', label: 'Kunde seit', typ: 'datum', hilfe: 'ab wann jemand Kunde ist — leer heißt: noch keiner', quellen: ['kontakte'] },
  { schluessel: 'letzter_kontakt_am', label: 'Letzter Kontakt', typ: 'datum', hilfe: 'für Rückhol-Aktionen: „länger her als 90 Tage"', quellen: ['kontakte'] },
  { schluessel: 'werbe_einwilligung', label: 'Werbe-Einwilligung', typ: 'ja_nein', hilfe: 'hat ausdrücklich zugestimmt', quellen: ['kontakte'] },
  { schluessel: 'betreuungs_intervall_tage', label: 'Betreuungs-Intervall (Tage)', typ: 'zahl', hilfe: 'wie oft dieser Kontakt gehört werden soll', quellen: ['kontakte'] },
  { schluessel: 'name', label: 'Name', typ: 'text', hilfe: 'wie bei der Anmeldung angegeben', quellen: ['newsletter'] },
  { schluessel: 'angemeldet_am', label: 'Angemeldet am', typ: 'datum', hilfe: 'Tag der Eintragung', quellen: ['newsletter'] },
  { schluessel: 'bestaetigt_am', label: 'Bestätigt am', typ: 'datum', hilfe: 'leer heißt: hat den Link nie angeklickt', quellen: ['newsletter'] },
  { schluessel: 'variante', label: 'Variante', typ: 'text', hilfe: 'über welche Fassung der Seite jemand kam', quellen: ['newsletter'] },
];

export function merkmal(schluessel: unknown): Merkmal | null {
  const s = String(schluessel ?? '').trim();
  return MERKMALE.find((m) => m.schluessel === s) ?? null;
}

/** Nur die Merkmale, die es in dieser Quelle wirklich als Spalte gibt. */
export function merkmaleFuer(quelle: unknown): Merkmal[] {
  const q = String(quelle ?? 'kontakte').trim() as Quelle;
  return MERKMALE.filter((m) => m.quellen.includes(q));
}

/** Ein Merkmal ist nur erlaubt, wenn es im Katalog steht UND nicht gesperrt ist. */
export function istErlaubt(schluessel: unknown): boolean {
  const s = String(schluessel ?? '').trim().toLowerCase();
  if (!s) return false;
  if (GESPERRTE_MERKMALE.includes(s)) return false;
  return MERKMALE.some((m) => m.schluessel === s);
}

// ---------------------------------------------------------------- Operatoren

export type Operator =
  | 'ist' | 'ist_nicht' | 'enthaelt' | 'beginnt_mit'
  | 'groesser' | 'kleiner'
  | 'vor' | 'nach' | 'aelter_als_tage' | 'juenger_als_tage'
  | 'leer' | 'nicht_leer';

export const OPERATOREN: { schluessel: Operator; label: string; typen: MerkmalTyp[]; ohneWert?: boolean }[] = [
  { schluessel: 'ist', label: 'ist', typen: ['text', 'zahl', 'datum', 'ja_nein'] },
  { schluessel: 'ist_nicht', label: 'ist nicht', typen: ['text', 'zahl', 'datum', 'ja_nein'] },
  { schluessel: 'enthaelt', label: 'enthält', typen: ['text'] },
  { schluessel: 'beginnt_mit', label: 'beginnt mit', typen: ['text'] },
  { schluessel: 'groesser', label: 'ist größer als', typen: ['zahl'] },
  { schluessel: 'kleiner', label: 'ist kleiner als', typen: ['zahl'] },
  { schluessel: 'vor', label: 'liegt vor dem', typen: ['datum'] },
  { schluessel: 'nach', label: 'liegt nach dem', typen: ['datum'] },
  { schluessel: 'aelter_als_tage', label: 'ist länger her als (Tage)', typen: ['datum'] },
  { schluessel: 'juenger_als_tage', label: 'ist höchstens her (Tage)', typen: ['datum'] },
  { schluessel: 'leer', label: 'ist nicht ausgefüllt', typen: ['text', 'zahl', 'datum'], ohneWert: true },
  { schluessel: 'nicht_leer', label: 'ist ausgefüllt', typen: ['text', 'zahl', 'datum'], ohneWert: true },
];

export function operatorenFuer(typ: MerkmalTyp): typeof OPERATOREN {
  return OPERATOREN.filter((o) => o.typen.includes(typ));
}

// ------------------------------------------------------------------- Regeln

export type Regel = { merkmal?: unknown; operator?: unknown; wert?: unknown };

export type Segment = {
  name?: unknown;
  /** „und" = alle Regeln müssen passen, „oder" = eine genügt. */
  verknuepfung?: unknown;
  regeln?: Regel[] | null;
};

export type Empfaenger = Record<string, unknown>;

function text(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}
/**
 * Punkt 12 (22.09.2026): Auch hier flogen alle Punkte raus. Ein Filter auf
 * "Umsatz groesser 7.5" verglich gegen 75, ein Prozentwert "7.5" wurde 75.
 * Jetzt liest lib/zahlen.ts. null bleibt null — ein Filter ohne lesbaren Wert
 * darf nicht stillschweigend gegen 0 vergleichen.
 */
function zahlWert(v: unknown): number | null {
  if (v == null || v === '') return null;
  return leseZahl(v);
}
function tagWert(v: unknown): string | null {
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
 * Trifft EINE Regel auf EINEN Empfänger zu?
 *
 * Grundsatz: im Zweifel NEIN. Ein unbekanntes Merkmal, ein unbekannter
 * Operator oder ein unbrauchbarer Wert lassen die Regel durchfallen — lieber
 * jemanden nicht anschreiben als den Falschen.
 *
 * `heute` wird immer hereingereicht, nie hier gebildet (sonst nicht testbar).
 */
export function trifftRegel(zeile: Empfaenger | null | undefined, regel: Regel | null | undefined, heute: string): boolean {
  if (!zeile || !regel) return false;
  if (!istErlaubt(regel.merkmal)) return false;

  const m = merkmal(regel.merkmal);
  if (!m) return false;

  const op = String(regel.operator ?? '').trim() as Operator;
  const definition = OPERATOREN.find((o) => o.schluessel === op);
  if (!definition) return false;
  if (!definition.typen.includes(m.typ)) return false;

  const roh = zeile[m.schluessel];
  const vorhanden = roh != null && String(roh).trim() !== '';

  if (op === 'leer') return !vorhanden;
  if (op === 'nicht_leer') return vorhanden;
  if (!vorhanden) return false;

  if (m.typ === 'zahl') {
    const a = zahlWert(roh);
    const b = zahlWert(regel.wert);
    if (a == null || b == null) return false;
    if (op === 'ist') return a === b;
    if (op === 'ist_nicht') return a !== b;
    if (op === 'groesser') return a > b;
    if (op === 'kleiner') return a < b;
    return false;
  }

  if (m.typ === 'datum') {
    const a = tagWert(roh);
    if (a == null) return false;
    if (op === 'vor' || op === 'nach' || op === 'ist' || op === 'ist_nicht') {
      const b = tagWert(regel.wert);
      if (b == null) return false;
      if (op === 'vor') return a < b;
      if (op === 'nach') return a > b;
      if (op === 'ist') return a === b;
      return a !== b;
    }
    const tage = zahlWert(regel.wert);
    const heuteTag = tagWert(heute);
    if (tage == null || tage < 0 || heuteTag == null) return false;
    const her = tageZwischen(a, heuteTag);
    if (her == null) return false;
    if (op === 'aelter_als_tage') return her > tage;
    if (op === 'juenger_als_tage') return her <= tage;
    return false;
  }

  // Text und Ja/Nein
  const a = text(roh);
  const b = text(regel.wert);
  if (op === 'ist') return a === b;
  if (op === 'ist_nicht') return a !== b;
  if (b === '') return false;
  if (op === 'enthaelt') return a.includes(b);
  if (op === 'beginnt_mit') return a.startsWith(b);
  return false;
}

/** Gehört ein Empfänger ins Segment? Ohne Regeln: niemand. */
export function passt(zeile: Empfaenger | null | undefined, segment: Segment | null | undefined, heute: string): boolean {
  const regeln = (segment?.regeln ?? []).filter(Boolean);
  if (regeln.length === 0) return false;
  const oder = String(segment?.verknuepfung ?? 'und').trim() === 'oder';
  return oder
    ? regeln.some((r) => trifftRegel(zeile, r, heute))
    : regeln.every((r) => trifftRegel(zeile, r, heute));
}

/** Alle passenden Empfänger. */
export function filtere(zeilen: Empfaenger[] | null | undefined, segment: Segment | null | undefined, heute: string): Empfaenger[] {
  return (zeilen ?? []).filter((z) => passt(z, segment, heute));
}

/**
 * Wieviele passen — und wieviele davon haben überhaupt eine Adresse?
 * Die zweite Zahl ist die ehrlichere: ein Segment mit 200 Treffern, von denen
 * 40 keine E-Mail haben, erreicht 160.
 */
export function zaehle(
  zeilen: Empfaenger[] | null | undefined,
  segment: Segment | null | undefined,
  heute: string,
  quelle: unknown = 'kontakte',
  emailFeld = 'email',
): { gesamt: number; treffer: number; erreichbar: number; gesperrt: number; ohneEinwilligung: number; ohneAdresse: number } {
  const alle = zeilen ?? [];
  const treffer = filtere(alle, segment, heute);

  let erreichbar = 0, gesperrt = 0, ohneEinwilligung = 0, ohneAdresse = 0;
  for (const z of treffer) {
    if (!String(z[emailFeld] ?? '').includes('@')) { ohneAdresse += 1; continue; }
    const st = werbeStatus(z, quelle);
    if (st === 'erlaubt') erreichbar += 1;
    else if (st === 'ohne_einwilligung') ohneEinwilligung += 1;
    else gesperrt += 1;
  }
  return { gesamt: alle.length, treffer: treffer.length, erreichbar, gesperrt, ohneEinwilligung, ohneAdresse };
}

/**
 * Das Segment als deutscher Satz — damit vor dem Versand jemand LESEN kann,
 * wen er da anschreibt. Eine Regelliste in Kästchen liest niemand.
 */
export function beschreibe(segment: Segment | null | undefined): string {
  const regeln = (segment?.regeln ?? []).filter(Boolean);
  if (regeln.length === 0) return 'Noch keine Regel — es würde niemand angeschrieben.';
  const oder = String(segment?.verknuepfung ?? 'und').trim() === 'oder';

  const teile = regeln.map((r) => {
    const m = merkmal(r.merkmal);
    const o = OPERATOREN.find((x) => x.schluessel === String(r.operator ?? '').trim());
    if (!m || !o) return 'eine unbekannte Regel';
    if (o.ohneWert) return `„${m.label}" ${o.label}`;
    return `„${m.label}" ${o.label} ${String(r.wert ?? '').trim() || '—'}`;
  });

  const verbunden = teile.length === 1
    ? teile[0]
    : teile.slice(0, -1).join(', ') + (oder ? ' oder ' : ' und ') + teile[teile.length - 1];
  return 'Alle, bei denen ' + verbunden + '.';
}

/**
 * Was einem Segment zum Speichern fehlt. Leere Liste heißt: es kann los.
 */
export function fehltZumSpeichern(segment: Segment | null | undefined): string[] {
  const fehlt: string[] = [];
  if (String(segment?.name ?? '').trim().length < 2) fehlt.push('ein Name');
  const regeln = (segment?.regeln ?? []).filter(Boolean);
  if (regeln.length === 0) fehlt.push('mindestens eine Regel');
  for (const r of regeln) {
    if (!istErlaubt(r.merkmal)) { fehlt.push('ein gültiges Merkmal in jeder Regel'); break; }
  }
  for (const r of regeln) {
    const o = OPERATOREN.find((x) => x.schluessel === String(r.operator ?? '').trim());
    if (!o) { fehlt.push('einen gültigen Vergleich in jeder Regel'); break; }
    if (!o.ohneWert && String(r.wert ?? '').trim() === '') { fehlt.push('einen Wert in jeder Regel'); break; }
  }
  return fehlt;
}


// ------------------------------------------------- Darf der überhaupt Post?

/**
 * Die Frage VOR jeder Regel — und der Grund, warum sie hier steht und nicht
 * in der Oberfläche: ein Segment ist eine Empfängerliste, und eine
 * Empfängerliste ohne Einwilligungsprüfung ist ein Abmahnrisiko.
 *
 * Die Spalten dafür gibt es seit jeher, sie wurden nur nie zusammen gelesen:
 * kontakte.werbe_widerspruch_am, kontakte.werbe_einwilligung,
 * newsletter_abonnenten.abgemeldet_am und .bestaetigt_am.
 */
export type WerbeStatus = 'erlaubt' | 'widersprochen' | 'abgemeldet' | 'nicht_bestaetigt' | 'ohne_einwilligung';

export const WERBE_STATUS_TEXT: Record<WerbeStatus, string> = {
  erlaubt: 'darf angeschrieben werden',
  widersprochen: 'hat der Werbung widersprochen',
  abgemeldet: 'hat sich abgemeldet',
  nicht_bestaetigt: 'hat die Anmeldung nie bestätigt',
  ohne_einwilligung: 'keine ausdrückliche Einwilligung hinterlegt',
};

function gefuellt(v: unknown): boolean {
  return v != null && String(v).trim() !== '';
}

/**
 * Ein Widerspruch schlägt ALLES. Danach kommt die fehlende Bestätigung, dann
 * die fehlende Einwilligung — in dieser Reihenfolge, weil ein Widerspruch die
 * härteste Aussage des Menschen ist.
 *
 * „ohne_einwilligung" ist bewusst KEIN klares Nein: § 7 Abs. 3 UWG lässt
 * Werbung an Bestandskunden für ähnliche Leistungen unter Auflagen auch ohne
 * ausdrückliche Einwilligung zu. Ob das im Einzelfall trägt, entscheidet kein
 * Programm — deshalb wird gezählt und angezeigt, nicht stillschweigend
 * versendet. Gehört auf die Anwaltsliste.
 */
export function werbeStatus(zeile: Empfaenger | null | undefined, quelle: unknown = 'kontakte'): WerbeStatus {
  if (!zeile) return 'ohne_einwilligung';
  const q = String(quelle ?? 'kontakte').trim();
  const status = String(zeile.status ?? '').trim().toLowerCase();

  if (gefuellt(zeile.werbe_widerspruch_am)) return 'widersprochen';
  if (status === 'widersprochen') return 'widersprochen';

  if (q === 'newsletter') {
    if (gefuellt(zeile.abgemeldet_am) || status === 'abgemeldet') return 'abgemeldet';
    if (!gefuellt(zeile.bestaetigt_am)) return 'nicht_bestaetigt';
    return 'erlaubt';
  }

  if (status === 'abgemeldet') return 'abgemeldet';
  if (zeile.werbe_einwilligung === true) return 'erlaubt';
  return 'ohne_einwilligung';
}

/** Nur wer hier true ist, darf in einen Werbeversand. */
export function darfWerbung(zeile: Empfaenger | null | undefined, quelle: unknown = 'kontakte'): boolean {
  return werbeStatus(zeile, quelle) === 'erlaubt';
}
