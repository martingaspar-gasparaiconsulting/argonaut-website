// ============================================================================
// ARGONAUT OS · lib/verzugszins.ts — Verzugszinsen nach § 288 BGB
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT (Punkt 42, 22.09.2026) ▄▄▄
// Der Basiszinssatz nach § 247 BGB aendert sich ZWEIMAL IM JAHR, am 1. Januar
// und am 1. Juli. Im Code stand er an zwei Stellen als feste Zahl:
//   app/dashboard/mahnwesen/page.tsx Z.63       -> 1.52 als nackte Zahl
//   app/dashboard/mahnwesen/[id]/page.tsx Z.57  -> BASISZINS_PROZENT = 1.52
// Beim naechsten Halbjahreswechsel haette jemand daran denken muessen — an
// zwei Stellen. Jetzt steht der Satz in EINER Tabelle mit Datum, und ein
// Waechter-Test wird rot, sobald heute hinter dem letzten Eintrag liegt.
//
// ▄▄▄ DREI SACHEN, DIE VORHER FALSCH WAREN ▄▄▄
//  1. JEDER bekam 9 Prozentpunkte. Das ist der Satz fuer Geschaefte zwischen
//     Unternehmen (§ 288 Abs. 2). Ein Verbraucher schuldet 5 (§ 288 Abs. 1).
//     Jeder private Kunde wurde also zu hoch gemahnt.
//  2. Ein Satz ueber den ganzen Verzug. Laeuft der Verzug ueber einen
//     Halbjahreswechsel, gelten ZWEI Saetze — abschnittsweise, nacheinander.
//  3. Die 40-Euro-Pauschale (§ 288 Abs. 5) fehlte ganz. Sie steht dem
//     Glaeubiger im B2B zu, EINMAL je Rechnung, und wird auf eine
//     Mahnkostenpauschale angerechnet.
//
// ▄▄▄ DER MERKSATZ ▄▄▄
// DAS GESETZ RECHNET, DER BETRIEB DARF NUR VERZICHTEN. Es gibt kein freies
// Prozentfeld: der Satz kommt aus dem Gesetz und aus der Tabelle. Verzichten
// kann der Betrieb — auf die Pauschale, auf die Gebuehr, auf die Zinsen.
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln, node-getestet.
// ============================================================================

import { centRunden } from './zahlen';

/** Ein Basiszinssatz und der Tag, ab dem er gilt. */
export interface BasiszinsEintrag {
  /** 'YYYY-MM-DD' — immer ein 1. Januar oder 1. Juli. */
  ab: string;
  /** Prozent, z. B. 1.52 */
  satz: number;
}

/**
 * DIE TABELLE. Quelle: Deutsche Bundesbank, Bekanntgabe des Basiszinssatzes
 * nach § 247 BGB (halbjaehrlich zum 1.1. und 1.7.), gegengeprueft ueber die
 * Uebersicht auf basiszinssatz.de — Stand 22.09.2026.
 *
 * NEUEN HALBJAHRESWERT HIER EINTRAGEN — nirgends sonst. Der Waechter-Test in
 * tests/verzugszinsP42.test.mjs wird rot, sobald das faellig ist.
 */
export const BASISZINS_TABELLE: BasiszinsEintrag[] = [
  { ab: '2016-07-01', satz: -0.88 },
  { ab: '2023-01-01', satz: 1.62 },
  { ab: '2023-07-01', satz: 3.12 },
  { ab: '2024-01-01', satz: 3.62 },
  { ab: '2024-07-01', satz: 3.37 },
  { ab: '2025-01-01', satz: 2.27 },
  { ab: '2025-07-01', satz: 1.27 },
  { ab: '2026-01-01', satz: 1.27 },
  { ab: '2026-07-01', satz: 1.52 },
];

/** § 288 Abs. 1 BGB — Verbrauchergeschaeft. */
export const AUFSCHLAG_VERBRAUCHER = 5;
/** § 288 Abs. 2 BGB — kein Verbraucher beteiligt (B2B). */
export const AUFSCHLAG_UNTERNEHMEN = 9;
/** § 288 Abs. 5 BGB — Pauschale, nur im B2B, einmal je Rechnung. */
export const PAUSCHALE_B2B = 40;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const TAG = 86400000;

function pad(n: number): string { return n < 10 ? '0' + n : String(n); }
function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function zuUTC(datum: string): Date | null {
  const m = ISO.exec((datum ?? '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return iso(d) === m[0] ? d : null;
}
function tageZwischen(von: Date, bis: Date): number {
  return Math.round((bis.getTime() - von.getTime()) / TAG);
}

/** Der Basiszinssatz, der an diesem Tag gilt. null, wenn die Tabelle nicht reicht. */
export function basiszinsAm(datum: string): number | null {
  const d = zuUTC(datum);
  if (!d) return null;
  const tag = iso(d);
  let treffer: number | null = null;
  for (const e of BASISZINS_TABELLE) {
    if (e.ab <= tag) treffer = e.satz; else break;
  }
  return treffer;
}

/**
 * Bis zu welchem Tag die Tabelle traegt. Ein Eintrag vom 1. Juli gilt bis zum
 * 31. Dezember desselben Jahres, einer vom 1. Januar bis zum 30. Juni.
 * DAS IST DER WAECHTER: liegt heute dahinter, fehlt ein Halbjahreswert.
 */
export function tabelleGiltBis(): string {
  const letzter = BASISZINS_TABELLE[BASISZINS_TABELLE.length - 1];
  const jahr = Number(letzter.ab.slice(0, 4));
  const monat = letzter.ab.slice(5, 7);
  return monat === '01' ? `${jahr}-06-30` : `${jahr}-12-31`;
}

/**
 * Der volle Verzugszinssatz: Basiszins plus gesetzlicher Aufschlag.
 *
 * ANDOCKPUNKT (und zwar der einzige): Sollte ein Betrieb je einen abweichenden
 * Satz brauchen — etwa aus einem Vertrag mit hoeherem Verzugszins —, dann
 * geschieht das HIER und nirgends sonst. Es gibt bewusst KEIN freies
 * Prozentfeld im Bildschirm: das Gesetz rechnet, der Betrieb darf nur
 * verzichten. Ein solcher Schalter ist eigens zu besprechen (vertagt am
 * 22.09.2026) und braucht eine juristische Freigabe.
 */
export function verzugssatz(basiszins: number, istVerbraucher: boolean): number {
  return basiszins + (istVerbraucher ? AUFSCHLAG_VERBRAUCHER : AUFSCHLAG_UNTERNEHMEN);
}

/** Ein Zeitabschnitt mit einem einheitlichen Zinssatz. */
export interface ZinsAbschnitt {
  von: string;
  bis: string;
  tage: number;
  basiszins: number;
  satz: number;
  betrag: number;
}

export interface ZinsErgebnis {
  /** Summe aller Abschnitte, auf Cent gerundet. */
  betrag: number;
  abschnitte: ZinsAbschnitt[];
  /** true, wenn der Verzug ueber das Ende der Tabelle hinausreicht. */
  luecke: boolean;
  /** true, wenn von/bis unbrauchbar sind — dann ist betrag 0 und nichts gerechnet. */
  unlesbar: boolean;
}

/**
 * Verzugszinsen ABSCHNITTSWEISE. Jeder Halbjahresabschnitt bekommt seinen
 * eigenen Satz; die Betraege werden addiert und erst am Schluss auf Cent
 * gerundet — ein Satz ueber den ganzen Verzug waere ueber einen
 * Halbjahreswechsel hinweg falsch.
 *
 * Zinsen je Abschnitt = offen x Satz% x Tage / 365 (kein Zinseszins).
 */
export function verzugszinsen(opts: {
  offen: number;
  /** Verzugsbeginn, 'YYYY-MM-DD'. */
  von: string;
  /** Stichtag, 'YYYY-MM-DD' — in der Regel heute. */
  bis: string;
  istVerbraucher: boolean;
}): ZinsErgebnis {
  const leer: ZinsErgebnis = { betrag: 0, abschnitte: [], luecke: false, unlesbar: true };
  const von = zuUTC(opts.von);
  const bis = zuUTC(opts.bis);
  if (!von || !bis) return leer;
  if (!Number.isFinite(opts.offen)) return leer;
  if (tageZwischen(von, bis) <= 0) return { betrag: 0, abschnitte: [], luecke: false, unlesbar: false };

  // Die Grenzen: jeder Tabelleneintrag im Zeitraum teilt ihn.
  const grenzen: string[] = [iso(von)];
  for (const e of BASISZINS_TABELLE) {
    if (e.ab > iso(von) && e.ab < iso(bis)) grenzen.push(e.ab);
  }
  grenzen.push(iso(bis));

  const abschnitte: ZinsAbschnitt[] = [];
  let summe = 0;
  let luecke = false;
  const ende = tabelleGiltBis();

  for (let i = 0; i < grenzen.length - 1; i++) {
    const a = grenzen[i];
    const b = grenzen[i + 1];
    const tage = tageZwischen(zuUTC(a) as Date, zuUTC(b) as Date);
    if (tage <= 0) continue;
    const basis = basiszinsAm(a);
    if (basis === null) continue;            // vor dem ersten Tabelleneintrag
    if (a > ende) luecke = true;             // hinter dem letzten Halbjahreswert
    const satz = verzugssatz(basis, opts.istVerbraucher);
    const betrag = opts.offen * (satz / 100) * (tage / 365);
    summe += betrag;
    abschnitte.push({ von: a, bis: b, tage, basiszins: basis, satz: Math.round(satz * 100) / 100, betrag: centRunden(betrag) });
  }

  return { betrag: centRunden(summe), abschnitte, luecke, unlesbar: false };
}

/**
 * Die 40-Euro-Pauschale nach § 288 Abs. 5 BGB.
 * Nur im B2B, nur ab der 1. Mahnung, EINMAL je Rechnung — und wenn sie
 * anfaellt, entfaellt die eigene Mahngebuehr, weil sie darauf angerechnet
 * wird (§ 288 Abs. 5 Satz 3).
 */
export function pauschale(opts: {
  istVerbraucher: boolean;
  /** 1 = Zahlungserinnerung, ab 2 = 1. Mahnung */
  stufe: number;
  /** Wurde sie bei einer frueheren Mahnung dieser Rechnung schon berechnet? */
  bereitsBerechnet: boolean;
  /** Der Betrieb verzichtet bei dieser Mahnung darauf. */
  verzicht: boolean;
}): number {
  if (opts.istVerbraucher) return 0;
  if (opts.stufe < 2) return 0;
  if (opts.bereitsBerechnet) return 0;
  if (opts.verzicht) return 0;
  return PAUSCHALE_B2B;
}

/**
 * Wer gilt als Verbraucher? IM ZWEIFEL VERBRAUCHER — das ist der niedrigere
 * Satz (5 statt 9 Punkte) und damit die Seite, auf der ein Irrtum nichts
 * kostet. Ein Firmenname am Kontakt ist das Anzeichen fuer das Gegenteil,
 * mehr nicht: der Betrieb kann es am Kontakt jederzeit umstellen.
 */
export function verbraucherVorschlag(kontakt: {
  ist_verbraucher?: boolean | null;
  firmenname?: string | null;
  firma_id?: string | null;
}): boolean {
  if (typeof kontakt?.ist_verbraucher === 'boolean') return kontakt.ist_verbraucher;
  const hatFirma = !!(kontakt?.firmenname && String(kontakt.firmenname).trim()) || !!kontakt?.firma_id;
  return !hatFirma;
}

/** Der Satzteil fuer den Mahntext — ohne Behauptung, die nicht stimmt. */
export function zinsErklaerung(erg: ZinsErgebnis, istVerbraucher: boolean): string {
  if (!erg.abschnitte.length) return '';
  const grund = istVerbraucher
    ? 'Basiszinssatz + 5 Prozentpunkte (§ 288 Abs. 1 BGB)'
    : 'Basiszinssatz + 9 Prozentpunkte (§ 288 Abs. 2 BGB)';
  if (erg.abschnitte.length === 1) {
    const a = erg.abschnitte[0];
    return `${grund}, ${a.satz.toLocaleString('de-DE')} % p. a. für ${a.tage} Tage.`;
  }
  const teile = erg.abschnitte.map(
    (a) => `${a.tage} Tage zu ${a.satz.toLocaleString('de-DE')} %`,
  );
  return `${grund}; der Verzug läuft über einen Halbjahreswechsel, deshalb abschnittsweise: ${teile.join(', ')}.`;
}

// ---------------------------------------------------------------------------
// DIE EINE FORDERUNGSAUFSTELLUNG
//
// Am 22.09. gemessen: Der Bildschirm rechnete die Gesamtforderung selbst, die
// PDF-Route rechnete sie noch einmal — und listete dabei andere Posten auf.
// Eine Pauschale, die nur die eine Seite kennt, steht dann in der Summe, aber
// in keiner Zeile: das Dokument beim Kunden widerspricht sich selbst.
// Deshalb rechnet ab jetzt EINE Funktion, und beide Seiten zeigen genau die
// Posten, die in ihre Summe eingehen.
// ---------------------------------------------------------------------------

export interface ForderungsPosten {
  label: string;
  betrag: number;
}

export interface Forderung {
  posten: ForderungsPosten[];
  gesamt: number;
  /** Gibt es ueberhaupt Zuschlaege? Sonst wird nur die Hauptforderung gezeigt. */
  hatZuschlaege: boolean;
}

export function forderungsAufstellung(opts: {
  offen: number;
  gebuehr?: number;
  pauschale?: number;
  zinsen?: number;
  /** Beschriftung der Zinszeile, z. B. "Verzugszinsen (42 Tage · 10,52 % p.a.)" */
  zinsLabel?: string;
}): Forderung {
  const z = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? centRunden(n) : 0);
  const offen = z(opts.offen);
  const gebuehr = z(opts.gebuehr);
  const pausch = z(opts.pauschale);
  const zinsen = z(opts.zinsen);

  const posten: ForderungsPosten[] = [{ label: 'Offene Hauptforderung', betrag: offen }];
  if (gebuehr > 0) posten.push({ label: 'Mahngebühr', betrag: gebuehr });
  if (pausch > 0) posten.push({ label: 'Pauschale nach § 288 Abs. 5 BGB', betrag: pausch });
  if (zinsen > 0) posten.push({ label: opts.zinsLabel || 'Verzugszinsen', betrag: zinsen });

  // Die Summe entsteht aus GENAU den Zeilen, die oben stehen.
  const gesamt = centRunden(posten.reduce((s, p) => s + p.betrag, 0));
  return { posten, gesamt, hatZuschlaege: gebuehr + pausch + zinsen > 0.005 };
}
