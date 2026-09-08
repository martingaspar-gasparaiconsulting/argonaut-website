// ============================================================================
// ARGONAUT OS · lib/zielgruppe.ts — Zielgruppen aus dem CRM (D5 Teil 1)
//
// Empfänger werden heute von Hand in den Verteiler getippt. Die echten
// Kontakte liegen daneben im CRM und werden nicht genutzt.
//
// ▄▄▄ WARUM DAS NICHT NUR EIN FILTER IST ▄▄▄
// Ein Kontakt im CRM hat NICHT in Werbung eingewilligt. Wer alle Kontakte in
// einen Verteiler schiebt, verschickt unzulaessige Werbung — je Empfaenger
// abmahnfaehig. Diese Datei trennt deshalb zwei Fragen, die man leicht
// verwechselt:
//   1. PASST der Kontakt zur Zielgruppe?  (Marketing)
//   2. DARF man ihm ueberhaupt schreiben?  (Recht)
// Nur wer beides erfuellt, landet in der Versandliste. Und der Grund steht
// je Kontakt dabei — nicht als Zahl am Ende, sondern nachvollziehbar.
//
// Grundlage ist § 7 UWG:
//   · Abs. 2 Nr. 2 — ausdrueckliche Einwilligung, nachweisbar.
//   · Abs. 3       — Bestandskunden-Ausnahme: eigene aehnliche Leistungen,
//                    Adresse beim Verkauf erhoben, Hinweis auf Widerspruch
//                    bei Erhebung UND in jeder Mail.
//   · Ein Widerspruch schlaegt beides, sofort und dauerhaft.
//
// Das ist die Umsetzung des Gesetzestextes, KEIN Rechtsrat — die Punkte
// H1-H5 im Anwaltspaket pruefen genau das.
//
// KEINE Netzwerk-/Supabase-Aufrufe — pure, node-testbar.
// ============================================================================

const TAG_MS = 86_400_000;

/**
 * Wie lange nach dem Kauf die Bestandskunden-Ausnahme genutzt wird.
 *
 * Das Gesetz nennt keine Frist. Die Rechtsprechung sieht sie mit dem Abstand
 * zum Kauf schwinden; zwei Jahre sind der in der Praxis uebliche, vorsichtige
 * Schnitt. Bewusst hier als eine Zahl, damit der Anwalt sie an EINER Stelle
 * aendern kann.
 */
export const BESTANDSKUNDE_MONATE = 24;

export type Rechtsgrund =
  | 'einwilligung'   // ausdrueckliche Einwilligung
  | 'bestandskunde'  // § 7 Abs. 3 UWG
  | 'widerspruch'    // hat widersprochen — nie schreiben
  | 'keine_adresse'  // ohne E-Mail geht gar nichts
  | 'keine';         // keine Grundlage

export type KontaktRoh = {
  id?: unknown;
  vorname?: unknown;
  nachname?: unknown;
  firma?: unknown;
  email?: unknown;
  status?: unknown;
  quelle?: unknown;
  letzter_kontakt_am?: unknown;
  werbe_einwilligung?: unknown;
  werbe_einwilligung_am?: unknown;
  werbe_widerspruch_am?: unknown;
  kunde_seit?: unknown;
};

function zeit(v: unknown): number {
  const t = new Date(String(v ?? '')).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function hatText(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Grobe Adressprüfung — dieselbe Regel wie im Newsletter. */
export function istEmail(v: unknown): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? '').trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Die Rechtsfrage
// ---------------------------------------------------------------------------

/**
 * Auf welcher Grundlage darf dieser Kontakt Werbepost bekommen?
 *
 * Die Reihenfolge ist Absicht: Der Widerspruch wird ZUERST geprueft. Ein
 * Widerspruch, den eine spaetere Einwilligungs-Prüfung überstimmt, waere der
 * teuerste Fehler, den dieses Modul machen koennte.
 */
export function rechtsgrundFuer(kontakt: KontaktRoh | null | undefined, jetztIso: string): Rechtsgrund {
  const k = kontakt || {};

  if (Number.isFinite(zeit(k.werbe_widerspruch_am))) return 'widerspruch';
  if (!istEmail(k.email)) return 'keine_adresse';
  if (k.werbe_einwilligung === true) return 'einwilligung';

  const kauf = zeit(k.kunde_seit);
  if (Number.isFinite(kauf)) {
    const jetzt = zeit(jetztIso);
    if (!Number.isFinite(jetzt)) return 'keine';
    const alter = jetzt - kauf;
    if (alter >= 0 && alter <= BESTANDSKUNDE_MONATE * 30.44 * TAG_MS) return 'bestandskunde';
  }
  return 'keine';
}

/** Darf an diesen Kontakt Werbepost gehen? */
export function darfWerbung(kontakt: KontaktRoh | null | undefined, jetztIso: string): boolean {
  const g = rechtsgrundFuer(kontakt, jetztIso);
  return g === 'einwilligung' || g === 'bestandskunde';
}

/** Klartext statt Paragraf — was der Betrieb im Bildschirm liest. */
export function grundText(g: Rechtsgrund): { kurz: string; lang: string; farbe: 'gruen' | 'gelb' | 'rot' | 'grau' } {
  switch (g) {
    case 'einwilligung':
      return {
        kurz: 'Einwilligung liegt vor',
        lang: 'Dieser Kontakt hat ausdrücklich zugestimmt. Werbepost ist zulässig, solange er nicht widerspricht.',
        farbe: 'gruen',
      };
    case 'bestandskunde':
      return {
        kurz: 'Bestandskunde',
        lang: `Gekauft vor weniger als ${BESTANDSKUNDE_MONATE} Monaten. Erlaubt sind nur eigene, ähnliche Leistungen — `
          + 'und in jeder Mail muss der Hinweis auf den Widerspruch stehen. Für etwas ganz anderes brauchen Sie eine Einwilligung.',
        farbe: 'gelb',
      };
    case 'widerspruch':
      return {
        kurz: 'Hat widersprochen',
        lang: 'Dieser Kontakt hat Werbung widersprochen. Er bekommt keine Werbepost mehr — dauerhaft.',
        farbe: 'rot',
      };
    case 'keine_adresse':
      return {
        kurz: 'Keine E-Mail-Adresse',
        lang: 'Ohne gültige Adresse gibt es nichts zu senden. Rufen Sie an oder schreiben Sie per Post.',
        farbe: 'grau',
      };
    default:
      return {
        kurz: 'Keine Grundlage',
        lang: 'Weder eine Einwilligung noch ein Kauf in den letzten Monaten. Werbepost wäre unzulässig — '
          + 'holen Sie zuerst die Einwilligung ein, zum Beispiel über ein Freebie.',
        farbe: 'grau',
      };
  }
}

// ---------------------------------------------------------------------------
// Die Marketing-Frage
// ---------------------------------------------------------------------------

export type Regeln = {
  /** Freitext über Name, Firma, E-Mail. */
  suche?: string | null;
  /** CRM-Status, leer = alle. */
  status?: string[] | null;
  /** Herkunft, leer = alle. */
  quelle?: string[] | null;
  /** Nur Kontakte, die seit mindestens so vielen Tagen keinen Kontakt hatten. */
  stillSeitTagen?: number | null;
  /** Nur Kunden (kunde_seit gesetzt). */
  nurKunden?: boolean | null;
  /** Nur solche mit ausdrücklicher Einwilligung. */
  nurEinwilligung?: boolean | null;
};

function alsListe(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? '').trim().toLowerCase()).filter(Boolean);
}

/** Tage seit dem letzten Kontakt — null, wenn es nie einen gab. */
export function tageSeitKontakt(kontakt: KontaktRoh | null | undefined, jetztIso: string): number | null {
  const l = zeit((kontakt || {}).letzter_kontakt_am);
  const j = zeit(jetztIso);
  if (!Number.isFinite(l) || !Number.isFinite(j)) return null;
  return Math.floor((j - l) / TAG_MS);
}

/**
 * Passt der Kontakt auf die Regeln? Leere Regeln lassen ALLES durch — die
 * Rechtsprüfung ist der Filter, der nie leer ist.
 */
export function passt(kontakt: KontaktRoh | null | undefined, regeln: Regeln | null | undefined, jetztIso: string): boolean {
  const k = kontakt || {};
  const r = regeln || {};

  const suche = String(r.suche ?? '').trim().toLowerCase();
  if (suche) {
    const heuhaufen = [k.vorname, k.nachname, k.firma, k.email]
      .map((x) => String(x ?? '').toLowerCase()).join(' ');
    if (!heuhaufen.includes(suche)) return false;
  }

  const status = alsListe(r.status);
  if (status.length > 0 && !status.includes(String(k.status ?? '').toLowerCase())) return false;

  const quelle = alsListe(r.quelle);
  if (quelle.length > 0 && !quelle.includes(String(k.quelle ?? '').toLowerCase())) return false;

  if (r.nurKunden === true && !Number.isFinite(zeit(k.kunde_seit))) return false;
  if (r.nurEinwilligung === true && k.werbe_einwilligung !== true) return false;

  const still = Number(r.stillSeitTagen);
  if (Number.isFinite(still) && still > 0) {
    const tage = tageSeitKontakt(k, jetztIso);
    // Wer NIE Kontakt hatte, ist erst recht still — er faellt nicht raus.
    if (tage != null && tage < still) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Beides zusammen
// ---------------------------------------------------------------------------

export type Aufteilung<T> = {
  /** Passt UND darf. Nur diese werden angeschrieben. */
  erlaubt: T[];
  /** Passt, darf aber nicht — mit Grund. */
  gesperrt: { kontakt: T; grund: Rechtsgrund }[];
  /** Passt gar nicht auf die Regeln. */
  ausserhalb: number;
  /** Wie viele je Grund gesperrt sind — für die Anzeige. */
  gruende: Record<Rechtsgrund, number>;
};

const LEERE_GRUENDE = (): Record<Rechtsgrund, number> => ({
  einwilligung: 0, bestandskunde: 0, widerspruch: 0, keine_adresse: 0, keine: 0,
});

/**
 * Die eine Funktion, die der Bildschirm braucht: Wer bekommt die Mail, wer
 * nicht, und warum nicht.
 */
export function teileAuf<T extends KontaktRoh>(
  kontakte: T[] | null | undefined,
  regeln: Regeln | null | undefined,
  jetztIso: string,
): Aufteilung<T> {
  const erlaubt: T[] = [];
  const gesperrt: { kontakt: T; grund: Rechtsgrund }[] = [];
  const gruende = LEERE_GRUENDE();
  let ausserhalb = 0;

  for (const k of kontakte || []) {
    if (!passt(k, regeln, jetztIso)) { ausserhalb++; continue; }
    const grund = rechtsgrundFuer(k, jetztIso);
    gruende[grund] = (gruende[grund] ?? 0) + 1;
    if (grund === 'einwilligung' || grund === 'bestandskunde') erlaubt.push(k);
    else gesperrt.push({ kontakt: k, grund });
  }

  return { erlaubt, gesperrt, ausserhalb, gruende };
}

/** Adressen der Erlaubten — vereinheitlicht und ohne Doppelte. */
export function adressenVon(kontakte: KontaktRoh[] | null | undefined): string[] {
  const gesehen = new Set<string>();
  for (const k of kontakte || []) {
    const e = String((k || {}).email ?? '').trim().toLowerCase();
    if (istEmail(e)) gesehen.add(e);
  }
  return Array.from(gesehen);
}

/**
 * Ein Satz über der Versandliste. Nennt beide Zahlen — wer nur die grosse
 * sieht, wundert sich hinterher, warum weniger ankamen.
 */
export function versandSatz(a: Aufteilung<KontaktRoh>): string {
  const n = a.erlaubt.length;
  const weg = a.gesperrt.length;
  if (n === 0 && weg === 0) return 'Keine Kontakte in dieser Zielgruppe.';
  if (n === 0) return `Kein Empfänger zulässig — bei allen ${weg} fehlt die Rechtsgrundlage.`;
  const teil = weg > 0 ? ` ${weg} bleiben außen vor, weil die Grundlage fehlt.` : '';
  return `${n} ${n === 1 ? 'Empfänger darf' : 'Empfänger dürfen'} angeschrieben werden.${teil}`;
}

/**
 * Der Pflichthinweis, der bei der Bestandskunden-Ausnahme in JEDE Mail
 * gehoert. Ohne ihn faellt die Ausnahme weg.
 */
export function bestandskundenHinweis(firma: unknown): string {
  const f = String(firma ?? '').trim() || 'Wir';
  return `${f} schreibt Ihnen, weil Sie hier Kunde sind. Sie können der Werbung jederzeit `
    + 'widersprechen — mit dem Abmeldelink unten oder formlos per Antwort. Es entstehen Ihnen dabei keine Kosten.';
}
