// ============================================================================
// ARGONAUT OS · lib/reisekosten.ts — Regel-Ebene: Reisekosten rechnen
//
// KEINE KI. Reine Formeln nach den aktuellen deutschen Saetzen (Stand 2026):
//   · Verpflegungspauschale Inland: 28 € voller Tag, 14 € An-/Abreisetag bzw.
//     eintaegig > 8 Std. Abwesenheit.
//   · Kuerzung bei gestellten Mahlzeiten: Fruehstueck 5,60 €, Mittag/Abend je
//     11,20 € (20 % / 40 % / 40 % von 28 €).
//   · Fahrtkosten Dienstreise mit Privatfahrzeug: PKW 0,30 €/km, Motorrad
//     0,20 €/km. (Die 38-Cent-Reform ab 2026 betrifft nur den Arbeitsweg.)
//
// Ergebnis ist rechnerisch eindeutig — richtig, sofort, kostenlos.
// Reine Funktionen, keine Hooks/Supabase — ueberall importierbar.
//
// ▄▄▄ PUNKT 29b (20.09.2026) ▄▄▄
//  1. EINE KURZE FAHRT UEBER MITTERNACHT ERGAB 28 EUR.
//     GEMESSEN: Abreise 23:00, Rueckkehr 01:00 — zwei Stunden unterwegs —
//     ergab An- UND Abreisetag zu je 14 EUR. Der Code zaehlte nur die
//     Kalendertage. Wer zwei Stunden unterwegs ist, hat nicht uebernachtet;
//     dann gilt die Eintagesregel, und unter 8 Stunden gibt es gar nichts.
//     REPARIERT NUR, WO ES EINDEUTIG IST: Dauert die Reise insgesamt
//     hoechstens 8 Stunden, kann keine Uebernachtung stattgefunden haben —
//     dieser Fall rechnet jetzt wie eintaegig. Dauert sie laenger und geht
//     ueber Mitternacht, kann der Code NICHT wissen, ob uebernachtet wurde
//     (§ 9 Abs. 4a EStG: ohne Uebernachtung stehen nur 14 EUR zu, dem Tag
//     mit dem ueberwiegenden Teil zugeordnet). Dort bleibt die Rechnung wie
//     bisher, und der Hinweis sagt es. Nicht geraten.
//  2. round2() las mit Number() und rundete unsymmetrisch — "1.234" km
//     ergaben 0,00 EUR Fahrtkosten. Jetzt ueber lib/zahlen.ts.
// Node-getestet: tests/steuerRechnerP29.test.mjs
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

export const VP_VOLL = 28;   // voller Kalendertag (24 Std. abwesend)
export const VP_TEIL = 14;   // An-/Abreisetag oder eintaegig > 8 Std.
export const KUERZUNG = { fruehstueck: 5.60, mittag: 11.20, abend: 11.20 } as const;
export const KM_SATZ = { pkw: 0.30, motorrad: 0.20 } as const;

export type Fahrzeug = 'pkw' | 'motorrad';
export type Mahlzeiten = { fruehstueck: number; mittag: number; abend: number };
export type VpErgebnis = {
  brutto: number; kuerzung: number; netto: number;
  volleTage: number; teilTage: number; hinweis: string;
};

function ganzerTag(d: Date): number { return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }

/**
 * Verpflegungspauschale fuer eine Reise zwischen zwei Zeitpunkten.
 * Liefert Brutto (vor Kuerzung), Kuerzung durch gestellte Mahlzeiten und Netto.
 */
export function verpflegung(abreiseISO?: string | null, rueckkehrISO?: string | null, m?: Partial<Mahlzeiten>): VpErgebnis {
  const leer: VpErgebnis = { brutto: 0, kuerzung: 0, netto: 0, volleTage: 0, teilTage: 0, hinweis: '' };
  if (!abreiseISO || !rueckkehrISO) return { ...leer, hinweis: 'Abreise und Rückkehr angeben.' };
  const a = new Date(abreiseISO), r = new Date(rueckkehrISO);
  if (isNaN(a.getTime()) || isNaN(r.getTime()) || r.getTime() <= a.getTime()) return { ...leer, hinweis: 'Rückkehr muss nach der Abreise liegen.' };

  const stunden = (r.getTime() - a.getTime()) / 3600000;
  const tageDiff = Math.round((ganzerTag(r) - ganzerTag(a)) / 86400000);

  let brutto = 0, volleTage = 0, teilTage = 0, hinweis = '';

  // Punkt 29b: Eine Reise von hoechstens 8 Stunden kann keine Uebernachtung
  // enthalten — auch dann nicht, wenn sie ueber Mitternacht geht. Sie wird
  // deshalb wie eintaegig behandelt. Vorher ergaben zwei Stunden von 23:00
  // bis 01:00 volle 28 EUR, weil nur die Kalendertage gezaehlt wurden.
  const ueberNachtOhneUebernachtung = tageDiff > 0 && stunden <= 8;

  if (tageDiff === 0 || ueberNachtOhneUebernachtung) {
    if (stunden > 8) { brutto = VP_TEIL; teilTage = 1; hinweis = 'Eintägig, über 8 Std. abwesend → 14 €.'; }
    else if (ueberNachtOhneUebernachtung) {
      hinweis = `Nur ${round2(stunden)} Std. unterwegs, auch wenn die Reise über Mitternacht geht — ` +
        'ohne Übernachtung gilt die Eintagesregel, und unter 8 Std. gibt es keine Verpflegungspauschale.';
    } else { hinweis = 'Eintägig, 8 Std. oder weniger → keine Verpflegungspauschale.'; }
  } else {
    volleTage = Math.max(0, tageDiff - 1);
    teilTage = 2;
    brutto = teilTage * VP_TEIL + volleTage * VP_VOLL;
    hinweis = `${tageDiff + 1} Reisetage: An- + Abreisetag (je 14 €) + ${volleTage} volle(r) Tag(e) (je 28 €).`;
    // Ohne Uebernachtung stehen nach § 9 Abs. 4a EStG nur 14 EUR zu, dem Tag
    // mit dem ueberwiegenden Teil zugeordnet. Ob uebernachtet wurde, weiss
    // diese Funktion nicht — also sagen statt raten.
    if (volleTage === 0) {
      hinweis += ' Falls NICHT übernachtet wurde: dann stehen nach § 9 Abs. 4a EStG nur 14 € zu.';
    }
  }

  const mm = { fruehstueck: Math.max(0, m?.fruehstueck || 0), mittag: Math.max(0, m?.mittag || 0), abend: Math.max(0, m?.abend || 0) };
  const kuerzung = round2(mm.fruehstueck * KUERZUNG.fruehstueck + mm.mittag * KUERZUNG.mittag + mm.abend * KUERZUNG.abend);
  const netto = Math.max(0, round2(brutto - kuerzung));
  return { brutto: round2(brutto), kuerzung, netto, volleTage, teilTage, hinweis };
}

/** Fahrtkosten fuer gefahrene Kilometer mit dem Privatfahrzeug. */
export function fahrtkosten(km?: number | null, fahrzeug: Fahrzeug = 'pkw'): number {
  const satz = KM_SATZ[fahrzeug] ?? KM_SATZ.pkw;
  return round2(leseZahlOder(km, 0) * satz);
}

export function round2(n: number): number { return centRunden(leseZahlOder(n, 0)); }

// ============================================================================
// PUNKT 65 / R12, Teil 3 (21.09.2026) — DIE DREIMONATSFRIST
// § 9 Abs. 4a Satz 6 und 7 EStG
//
// REIN ADDITIV. verpflegung(), fahrtkosten() und alles darüber bleiben
// unverändert.
//
// ▄▄▄ DER BEFUND ▄▄▄
// Die Verpflegungspauschale wurde für jeden Tag gerechnet, an dem jemand
// unterwegs war — ohne Ende. GEMESSEN: ein Monteur, der 200 Arbeitstage auf
// derselben Baustelle verbringt, ergab 200 × 14 EUR = 2.800 EUR. Steuerfrei
// sind davon nur die ersten drei Monate; der Rest ist steuerpflichtiger
// Arbeitslohn. Wer ihn trotzdem steuerfrei auszahlt, haftet für die
// Lohnsteuer — und das fällt bei der nächsten Lohnsteuer-Außenprüfung auf.
//
// ▄▄▄ VIER FEHLER, DIE DIESER ABSCHNITT VERHINDERN SOLL ▄▄▄
//
//  1. DIE FRIST ALS 90 TAGE RECHNEN.
//     Es sind DREI KALENDERMONATE. Beginn am 15. Januar heißt Ende am
//     14. April — das sind je nach Monat 89 bis 92 Tage. Wer mit 90 rechnet,
//     liegt in acht von zwölf Monaten daneben.
//
//  2. DIE WOCHENFREQUENZ ÜBERSEHEN.
//     Die Frist läuft überhaupt nur, wenn die Tätigkeitsstätte an
//     MINDESTENS DREI Tagen pro Woche aufgesucht wird. Wer über Jahre jeden
//     Dienstag zum selben Kunden fährt, bekommt die Pauschale dauerhaft.
//     Wer das übersieht, streicht einem Außendienstler eine Zahlung, die
//     ihm zusteht.
//
//  3. NACH FRISTABLAUF AUCH FAHRT- UND ÜBERNACHTUNGSKOSTEN STREICHEN.
//     Die Frist betrifft AUSSCHLIESSLICH die Verpflegungspauschale. Fahrt-
//     und Übernachtungskosten bleiben unbegrenzt abziehbar.
//
//  4. EINE KURZE UNTERBRECHUNG ALS NEUSTART WERTEN.
//     Erst eine Unterbrechung von MINDESTENS VIER WOCHEN setzt die Frist neu
//     in Gang — dann aber unabhängig vom Grund (Urlaub, Krankheit, anderer
//     Einsatzort). Ein verlängertes Wochenende reicht nicht, vier Wochen
//     Urlaub schon.
//
// ▄▄▄ ANDOCKPUNKT ▄▄▄
// Ruft noch niemand auf. Beim Anschließen gehört die Prüfung in die
// Reisekostenabrechnung, und zwar VOR der Auszahlung.
// ============================================================================

/** Drei Kalendermonate, nicht 90 Tage. */
export const FRIST_MONATE = 3;
/** So lange muss unterbrochen werden, damit die Frist neu läuft. */
export const UNTERBRECHUNG_WOCHEN = 4;
/** Ab so vielen Tagen je Woche läuft die Frist überhaupt. */
export const MIN_TAGE_JE_WOCHE = 3;

export interface FristEingabe {
  /** Erster Tag an dieser Tätigkeitsstätte, ISO. */
  beginnISO: string;
  /** Der Tag, für den geprüft wird, ISO. */
  tagISO: string;
  /**
   * An wie vielen Tagen je Woche wird die Stätte aufgesucht?
   * Unter MIN_TAGE_JE_WOCHE läuft die Frist gar nicht.
   */
  tageJeWoche?: number | null;
  /**
   * Unterbrechungen: jeweils erster und letzter Tag, ISO.
   * Nur Unterbrechungen ab vier Wochen zählen.
   */
  unterbrechungen?: readonly { vonISO: string; bisISO: string }[] | null;
}

export interface FristErgebnis {
  /** Läuft die Dreimonatsfrist für diesen Fall überhaupt? */
  greift: boolean;
  /** Ist die Frist am geprüften Tag schon abgelaufen? */
  abgelaufen: boolean;
  /** Tag, an dem die Frist (neu) zu laufen begann. */
  fristBeginn: string;
  /** Letzter Tag mit Verpflegungspauschale. */
  fristEnde: string;
  /** Unterbrechungen, die die Frist neu gestartet haben. */
  neustarts: string[];
  /** Verpflegungspauschale steuerfrei? */
  verpflegungSteuerfrei: boolean;
  /** Fahrt- und Übernachtungskosten — davon unberührt. */
  fahrtUndUebernachtung: 'unbegrenzt abziehbar';
  hinweis: string;
}

function tagNr(iso: string): number {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10));
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

function alsIso(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Drei Kalendermonate ab `beginn`. Der letzte Tag mit Anspruch ist der Tag
 * VOR dem gleichen Kalendertag drei Monate später: Beginn 15.01. → Ende 14.04.
 *
 * Fällt der Zieltag nicht auf den Monat (31.01. + 3 Monate = 31.04.), wird
 * auf den letzten Tag des Zielmonats gesetzt — dieselbe Regel, die bei den
 * wiederkehrenden Rechnungen in Punkt 20 schon gilt.
 */
export function fristEnde(beginnISO: string): string {
  const y = Number(beginnISO.slice(0, 4)), m = Number(beginnISO.slice(5, 7)), d = Number(beginnISO.slice(8, 10));
  if (!y || !m || !d) return beginnISO;
  const zielMonat = m - 1 + FRIST_MONATE;
  const zielJahr = y + Math.floor(zielMonat / 12);
  const monatIndex = zielMonat % 12;
  const letzterImZielmonat = new Date(Date.UTC(zielJahr, monatIndex + 1, 0)).getUTCDate();
  const tag = Math.min(d, letzterImZielmonat);
  // Der Tag davor ist der letzte mit Anspruch.
  return alsIso(Date.UTC(zielJahr, monatIndex, tag) - 86400000);
}

/**
 * Prüft die Dreimonatsfrist für einen bestimmten Tag.
 *
 * Gibt es mehrere Unterbrechungen ab vier Wochen, zählt die LETZTE vor dem
 * geprüften Tag — ab ihrem Ende läuft die Frist neu.
 */
export function dreimonatsfrist(e: FristEingabe): FristErgebnis {
  const tageJeWoche = leseZahlOder(e.tageJeWoche, MIN_TAGE_JE_WOCHE);

  // FEHLER 2: ohne die Wochenfrequenz läuft die Frist gar nicht.
  if (tageJeWoche > 0 && tageJeWoche < MIN_TAGE_JE_WOCHE) {
    return {
      greift: false,
      abgelaufen: false,
      fristBeginn: e.beginnISO,
      fristEnde: fristEnde(e.beginnISO),
      neustarts: [],
      verpflegungSteuerfrei: true,
      fahrtUndUebernachtung: 'unbegrenzt abziehbar',
      hinweis:
        `Die Tätigkeitsstätte wird an ${tageJeWoche} Tagen je Woche aufgesucht — unter ${MIN_TAGE_JE_WOCHE} Tagen ` +
        'läuft die Dreimonatsfrist nicht. Die Verpflegungspauschale steht dauerhaft zu.',
    };
  }

  // FEHLER 4: nur Unterbrechungen ab vier Wochen setzen neu an.
  const neustarts: string[] = [];
  let beginn = e.beginnISO;
  const tag = tagNr(e.tagISO);

  const sortiert = [...(e.unterbrechungen ?? [])].sort((a, b) => tagNr(a.vonISO) - tagNr(b.vonISO));
  for (const u of sortiert) {
    const von = tagNr(u.vonISO), bis = tagNr(u.bisISO);
    if (!Number.isFinite(von) || !Number.isFinite(bis) || bis < von) continue;
    const tage = (bis - von) / 86400000 + 1;
    if (tage < UNTERBRECHUNG_WOCHEN * 7) continue;
    if (bis >= tag) continue;                       // liegt nach dem geprüften Tag
    beginn = alsIso(bis + 86400000);                // Tag nach der Unterbrechung
    neustarts.push(beginn);
  }

  const ende = fristEnde(beginn);
  const abgelaufen = Number.isFinite(tag) && tag > tagNr(ende);

  return {
    greift: true,
    abgelaufen,
    fristBeginn: beginn,
    fristEnde: ende,
    neustarts,
    verpflegungSteuerfrei: !abgelaufen,
    // FEHLER 3: davon ist NUR die Verpflegungspauschale betroffen.
    fahrtUndUebernachtung: 'unbegrenzt abziehbar',
    hinweis: abgelaufen
      ? `Die Dreimonatsfrist lief am ${ende} ab. Ab dem Folgetag ist die Verpflegungspauschale ` +
        'steuerpflichtiger Arbeitslohn. Fahrt- und Übernachtungskosten bleiben unbegrenzt abziehbar.' +
        (neustarts.length > 0 ? ` Die Frist wurde zuletzt am ${beginn} neu gestartet.` : '')
      : `Die Verpflegungspauschale steht noch zu, letzter Tag ist der ${ende}.` +
        (neustarts.length > 0 ? ` Die Frist wurde am ${beginn} neu gestartet.` : ''),
  };
}

export interface EinsatzTag {
  /** Tag, ISO. */
  tagISO: string;
  /** Verpflegungspauschale für diesen Tag, brutto. */
  betrag: number;
}

export interface EinsatzErgebnis {
  steuerfrei: number;
  steuerpflichtig: number;
  gesamt: number;
  tageSteuerfrei: number;
  tagePflichtig: number;
  fristEnde: string;
  hinweis: string;
}

/**
 * Rechnet eine ganze Einsatzreihe ab und teilt sie an der Dreimonatsfrist.
 *
 * GEMESSEN mit 200 Arbeitstagen zu 14 EUR ab dem 1. Februar: ohne Frist
 * 2.800 EUR, mit Frist deutlich weniger — der Rest ist steuerpflichtiger
 * Arbeitslohn und muss über die Lohnabrechnung laufen.
 */
export function einsatzReihe(tage: readonly EinsatzTag[], e: Omit<FristEingabe, 'tagISO'>): EinsatzErgebnis {
  let steuerfrei = 0, steuerpflichtig = 0, tageSteuerfrei = 0, tagePflichtig = 0;
  let ende = '';

  for (const t of tage ?? []) {
    const f = dreimonatsfrist({ ...e, tagISO: t.tagISO });
    ende = f.fristEnde;
    const betrag = round2(leseZahlOder(t.betrag, 0));
    if (f.verpflegungSteuerfrei) { steuerfrei = round2(steuerfrei + betrag); tageSteuerfrei += 1; }
    else { steuerpflichtig = round2(steuerpflichtig + betrag); tagePflichtig += 1; }
  }

  const gesamt = round2(steuerfrei + steuerpflichtig);
  return {
    steuerfrei, steuerpflichtig, gesamt, tageSteuerfrei, tagePflichtig, fristEnde: ende,
    hinweis: tagePflichtig === 0
      ? `${tageSteuerfrei} Tage, alle innerhalb der Dreimonatsfrist — ${steuerfrei.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR steuerfrei.`
      : `${tageSteuerfrei} Tage steuerfrei, ${tagePflichtig} Tage nach Fristablauf. ` +
        `${steuerpflichtig.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR davon sind ` +
        'steuerpflichtiger Arbeitslohn und gehören über die Lohnabrechnung, nicht in die Reisekostenerstattung.',
  };
}
