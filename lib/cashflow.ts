// ============================================================================
// ARGONAUT OS · lib/cashflow.ts — Liquiditäts-Vorschau (Abschnitt 4 · Cashflow)
//
// Reine, node-testbare Aggregation: aus offenen Rechnungen (Restbetrag +
// Fälligkeitsdatum), einem Startsaldo und geschätzten monatlichen Fixkosten
// entsteht eine wochenweise Liquiditäts-Timeline mit laufendem Saldo und einer
// Unterdeckungs-/Runway-Warnung. KEINE Netzwerk-/Supabase-Aufrufe, KEINE Hooks.
// jetztIso wird hereingereicht (deterministisch).
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

const TAG = 86_400_000;
const WOCHE = 7 * TAG;

/**
 * Auf Cent runden — ueber den einen Zahlen-Leser (lib/zahlen.ts).
 *
 * Punkt 30, 21.09.2026. Zwei Fehler in einer Zeile, beide GEMESSEN:
 *  1. Der alte Leser war Number(n) || 0: aus dem Text "1.234,56", wie ihn
 *     eine numeric-Spalte oft liefert, wurde still die Zahl 0. Ein Saldo
 *     von 1.234,56 Euro stand als 0,00 Euro da.
 *  2. Die alte Rundung kippte bei negativen Betraegen nach oben:
 *     -0,005 wurde -0,00 und -1.234,565 wurde -1.234,56 statt -1.234,57.
 *     Genau hier faellt das auf, denn der Liquiditaets-Saldo IST oft
 *     negativ — das ist der Zweck dieser Vorschau.
 */
function r2(n: unknown): number { return centRunden(leseZahlOder(n, 0)); }
function zeitMs(v: unknown): number {
  const t = new Date(String(v ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
}
function ddmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.`;
}

export type OffeneRechnung = { rest: number; faelligkeitsdatum: string | null };

export type WochePunkt = {
  start: string;   // ISO Wochenbeginn
  label: string;   // dd.mm.
  zufluss: number;
  abfluss: number;
  saldo: number;   // laufender Saldo am Wochenende
  unterdeckung: boolean;
};

export type VorschauEingabe = {
  startSaldo: number;
  offene: OffeneRechnung[];
  fixkostenProMonat: number;
  jetztIso: string;
  wochen?: number; // Standard 12, 1..26
};

export type VorschauErgebnis = {
  punkte: WochePunkt[];
  startSaldo: number;
  endSaldo: number;
  summeZufluss: number;
  summeAbfluss: number;
  fixkostenProWoche: number;
  /** Erwartete Zuflüsse aus überfälligen Rechnungen (in Woche 1 eingeplant). */
  ueberfaellig: number;
  /** Offene Rechnungen OHNE Fälligkeitsdatum — konservativ NICHT eingeplant. */
  offeneOhneTermin: number;
  /** ISO-Wochenbeginn der ersten Unterdeckung (Saldo < 0) oder null. */
  ersteUnterdeckung: string | null;
};

/** Monatliche Fixkosten auf einen Wochenwert umlegen (12 Monate / 52 Wochen). */
export function fixProWoche(fixkostenProMonat: number): number {
  return r2(leseZahlOder(fixkostenProMonat, 0) * 12 / 52);
}

/**
 * Baut die wochenweise Liquiditäts-Timeline. Woche 1 fängt „jetzt" an; alle
 * bereits überfälligen offenen Rechnungen werden in Woche 1 als Zufluss
 * erwartet (sie sollten längst da sein). Rechnungen ohne Fälligkeitsdatum
 * werden bewusst NICHT eingeplant (konservativ) und separat ausgewiesen.
 */
export function liquiditaetsVorschau(e: VorschauEingabe): VorschauErgebnis {
  const wochen = Math.max(1, Math.min(26, Math.floor(e.wochen ?? 12)));
  const jetzt = zeitMs(e.jetztIso);
  const fpw = fixProWoche(e.fixkostenProMonat);
  const offene = e.offene || [];

  let ueberfaellig = 0;
  let offeneOhneTermin = 0;
  for (const r of offene) {
    const rest = leseZahlOder(r.rest, 0);
    if (rest <= 0) continue;
    const t = zeitMs(r.faelligkeitsdatum);
    if (t <= 0) offeneOhneTermin += rest;
    else if (t < jetzt) ueberfaellig += rest;
  }

  let saldo = leseZahlOder(e.startSaldo, 0);
  let summeZufluss = 0;
  let summeAbfluss = 0;
  let ersteUnterdeckung: string | null = null;
  const punkte: WochePunkt[] = [];

  for (let i = 0; i < wochen; i++) {
    const wStart = jetzt + i * WOCHE;
    const wEnd = wStart + WOCHE;
    let zufluss = 0;
    for (const r of offene) {
      const rest = leseZahlOder(r.rest, 0);
      if (rest <= 0) continue;
      const t = zeitMs(r.faelligkeitsdatum);
      if (t <= 0) continue; // ohne Termin: nicht einplanen
      const einplanen = i === 0 ? t < wEnd : (t >= wStart && t < wEnd); // Woche 1 fängt Überfällige mit ab
      if (einplanen) zufluss += rest;
    }
    zufluss = r2(zufluss);
    const abfluss = fpw;
    saldo = r2(saldo + zufluss - abfluss);
    summeZufluss = r2(summeZufluss + zufluss);
    summeAbfluss = r2(summeAbfluss + abfluss);
    const unterdeckung = saldo < 0;
    const startIso = new Date(wStart).toISOString();
    if (unterdeckung && !ersteUnterdeckung) ersteUnterdeckung = startIso;
    punkte.push({ start: startIso, label: ddmm(wStart), zufluss, abfluss, saldo, unterdeckung });
  }

  return {
    punkte,
    startSaldo: r2(e.startSaldo),
    endSaldo: saldo,
    summeZufluss,
    summeAbfluss,
    fixkostenProWoche: fpw,
    ueberfaellig: r2(ueberfaellig),
    offeneOhneTermin: r2(offeneOhneTermin),
    ersteUnterdeckung,
  };
}

// ============================================================================
// PUNKT 65 / R12, PAKET 2 (21.09.2026) — DIE TERMINZAHLUNGEN AN DEN STAAT
//
// REIN ADDITIV. liquiditaetsVorschau(), fixProWoche() und alle Typen darüber
// bleiben unverändert; die neue Funktion baut auf der alten auf.
//
// ▄▄▄ DER BEFUND ▄▄▄
// Die Vorschau kannte genau drei Größen: Startsaldo, offene Rechnungen und
// „Fixkosten pro Monat", gleichmäßig auf Wochen verteilt. Damit fehlen die
// drei größten und zugleich am besten planbaren Abflüsse eines Betriebs —
// und zwar gerade die, die NICHT gleichmäßig fließen, sondern an einem
// festen Tag in voller Höhe:
//
//   · Umsatzsteuer-Vorauszahlung   10. des Folgemonats
//                                  (mit Dauerfristverlängerung ein Monat später)
//   · Lohnsteuer                   10. des Folgemonats
//   · Sozialversicherungsbeiträge  drittletzter BANKARBEITSTAG des Monats
//
// Die Bauliste nannte die ersten beiden. Beim Nachsehen kam der dritte dazu,
// und der ist der größte: Bei einem Betrieb mit fünf Angestellten sind das
// schnell zehntausend Euro, die an EINEM Tag abgehen.
//
// Eine Liquiditätsvorschau, die diese drei nicht kennt, zeigt eine Decke, die
// es nicht gibt — und sie zeigt sie ausgerechnet in der Woche, in der es eng
// wird.
//
// ▄▄▄ DREI FEHLER, DIE DIESER ABSCHNITT VERHINDERN SOLL ▄▄▄
//
//  1. DIE TERMINZAHLUNGEN IN DIE MONATLICHEN FIXKOSTEN MISCHEN.
//     Dann laufen sie als Zweiundfünfzigstel durch jede Woche, und genau die
//     Woche, in der sie wirklich abgehen, sieht harmlos aus. Der Zweck der
//     Vorschau ist aber, diese Woche zu finden.
//
//  2. DEN SV-BEITRAG AUF DEN LETZTEN TAG DES MONATS LEGEN.
//     Er ist am DRITTLETZTEN BANKARBEITSTAG fällig (§ 23 Abs. 1 SGB IV) —
//     und Bankarbeitstage sind nicht Kalendertage. Im Dezember liegt der
//     Termin dadurch oft schon vor Weihnachten.
//
//  3. DIE DAUERFRISTVERLÄNGERUNG UNTERSCHLAGEN.
//     Wer sie hat, zahlt einen Monat später. Wer sie nicht hat und trotzdem
//     so plant, hat eine Woche zu spät gerechnet.
// ============================================================================

export type TerminArt = 'ustva' | 'lohnsteuer' | 'sozialversicherung' | 'sonstige';

export interface TerminZahlung {
  art: TerminArt;
  bezeichnung?: string | null;
  betrag: number | string;
  /** Fälligkeit, ISO. Wird sie weggelassen, rechnet sie terminFuer() aus. */
  faelligISO?: string | null;
}

export const TERMIN_ARTEN: readonly { key: TerminArt; label: string; regel: string }[] = [
  { key: 'ustva', label: 'Umsatzsteuer-Vorauszahlung', regel: '10. des Folgemonats, mit Dauerfristverlängerung einen Monat später' },
  { key: 'lohnsteuer', label: 'Lohnsteuer', regel: '10. des Folgemonats' },
  { key: 'sozialversicherung', label: 'Sozialversicherung', regel: 'drittletzter Bankarbeitstag des laufenden Monats (§ 23 Abs. 1 SGB IV)' },
  { key: 'sonstige', label: 'Sonstige Terminzahlung', regel: 'eigener Termin' },
];

/** Samstag und Sonntag sind keine Bankarbeitstage. Feiertage kennt lib/feiertage.ts. */
function istWochenende(ms: number): boolean {
  const t = new Date(ms).getUTCDay();
  return t === 0 || t === 6;
}

/**
 * Drittletzter Bankarbeitstag eines Monats.
 *
 * FEHLER 2: Gezählt werden BANKARBEITSTAGE, nicht Kalendertage. Feiertage
 * sind hier bewusst NICHT eingerechnet — sie hängen am Bundesland, und
 * lib/feiertage.ts kann das. Der Anschluss gehört in dasselbe Paket wie die
 * Anbindung an die Oberfläche, wo das Bundesland bekannt ist. Bis dahin
 * werden nur Wochenenden berücksichtigt, und `nurWochenenden` sagt es.
 */
export function drittletzterBankarbeitstag(jahr: number, monat1bis12: number): { datum: string; nurWochenenden: true } {
  let ms = Date.UTC(jahr, monat1bis12, 0);   // letzter Tag des Monats
  let gezaehlt = 0;
  while (gezaehlt < 3) {
    if (!istWochenende(ms)) gezaehlt += 1;
    if (gezaehlt < 3) ms -= 86_400_000;
  }
  const d = new Date(ms);
  return {
    datum: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    nurWochenenden: true,
  };
}

export interface TerminOptionen {
  /** Dauerfristverlängerung für die Umsatzsteuer-Voranmeldung. */
  dauerfristverlaengerung?: boolean | null;
}

/**
 * Fälligkeit einer Terminzahlung für einen Abrechnungsmonat.
 * `monatISO` ist irgendein Tag des Monats, FÜR den gezahlt wird.
 */
export function terminFuer(art: TerminArt, monatISO: string, opt: TerminOptionen = {}): string {
  const jahr = Number(monatISO.slice(0, 4));
  const monat = Number(monatISO.slice(5, 7));
  if (!jahr || !monat) return monatISO;

  if (art === 'sozialversicherung') {
    return drittletzterBankarbeitstag(jahr, monat).datum;
  }

  // FEHLER 3: Die Dauerfristverlängerung verschiebt um einen weiteren Monat.
  const plus = art === 'ustva' && opt.dauerfristverlaengerung === true ? 2 : 1;
  const zielMonat = monat - 1 + plus;
  const zielJahr = jahr + Math.floor(zielMonat / 12);
  const m = (zielMonat % 12) + 1;
  return `${zielJahr}-${String(m).padStart(2, '0')}-10`;
}

export interface VorschauMitTerminen extends VorschauErgebnis {
  /** Die eingeplanten Terminzahlungen, nach Woche. */
  termine: { start: string; label: string; betrag: number; arten: TerminArt[] }[];
  summeTermine: number;
  /** Termine, die außerhalb des Vorschauzeitraums liegen. */
  ausserhalb: number;
  /** Wochen, in denen erst die Terminzahlung die Unterdeckung auslöst. */
  nurWegenTerminen: string[];
  hinweise: string[];
}

/**
 * Wie liquiditaetsVorschau, aber mit den Terminzahlungen an ihrem echten Tag.
 *
 * FEHLER 1: Sie werden NICHT in die Fixkosten gemischt, sondern der Woche
 * zugeordnet, in der sie wirklich abgehen. `nurWegenTerminen` nennt die
 * Wochen, die ohne sie im Plus lägen — das ist die eigentliche Auskunft.
 */
export function vorschauMitTerminen(
  e: VorschauEingabe,
  zahlungen: readonly TerminZahlung[],
  opt: TerminOptionen = {},
): VorschauMitTerminen {
  const basis = liquiditaetsVorschau(e);
  const jetzt = zeitMs(e.jetztIso);
  const wochen = basis.punkte.length;
  const ende = jetzt + wochen * WOCHE;

  const jeWoche = new Map<number, { betrag: number; arten: Set<TerminArt> }>();
  let summeTermine = 0;
  let ausserhalb = 0;
  const hinweise: string[] = [];
  let svOhneFeiertage = 0;

  for (const zNr of zahlungen ?? []) {
    const betrag = r2(leseZahlOder(zNr.betrag, 0));
    if (betrag <= 0) continue;
    const faellig = zNr.faelligISO ? zeitMs(zNr.faelligISO) : zeitMs(terminFuer(zNr.art, e.jetztIso, opt));
    if (faellig <= 0) continue;
    if (zNr.art === 'sozialversicherung' && !zNr.faelligISO) svOhneFeiertage += 1;

    if (faellig < jetzt || faellig >= ende) { ausserhalb = r2(ausserhalb + betrag); continue; }
    const index = Math.floor((faellig - jetzt) / WOCHE);
    const eintrag = jeWoche.get(index) ?? { betrag: 0, arten: new Set<TerminArt>() };
    eintrag.betrag = r2(eintrag.betrag + betrag);
    eintrag.arten.add(zNr.art);
    jeWoche.set(index, eintrag);
    summeTermine = r2(summeTermine + betrag);
  }

  // Die Timeline neu aufbauen, diesmal mit den Terminzahlungen.
  let saldo = leseZahlOder(e.startSaldo, 0);
  let summeAbfluss = 0;
  let ersteUnterdeckung: string | null = null;
  const nurWegenTerminen: string[] = [];
  const punkte: WochePunkt[] = [];
  const termine: VorschauMitTerminen['termine'] = [];

  basis.punkte.forEach((p, i) => {
    const t = jeWoche.get(i);
    const abfluss = r2(p.abfluss + (t?.betrag ?? 0));
    const saldoOhne = r2(saldo + p.zufluss - p.abfluss);
    saldo = r2(saldo + p.zufluss - abfluss);
    summeAbfluss = r2(summeAbfluss + abfluss);
    const unterdeckung = saldo < 0;
    if (unterdeckung && !ersteUnterdeckung) ersteUnterdeckung = p.start;
    if (unterdeckung && saldoOhne >= 0) nurWegenTerminen.push(p.start);
    if (t) termine.push({ start: p.start, label: p.label, betrag: t.betrag, arten: [...t.arten] });
    punkte.push({ ...p, abfluss, saldo, unterdeckung });
  });

  if (svOhneFeiertage > 0) {
    hinweise.push(
      'Der Termin für die Sozialversicherung ist ohne Feiertage gerechnet — nur Wochenenden sind ' +
        'berücksichtigt. Fällt der drittletzte Bankarbeitstag in eine Feiertagswoche, liegt der echte ' +
        'Termin früher.',
    );
  }
  if (nurWegenTerminen.length > 0) {
    hinweise.push(
      `${nurWegenTerminen.length} Woche${nurWegenTerminen.length === 1 ? '' : 'n'} rutscht erst durch die ` +
        'Terminzahlungen ins Minus. Ohne sie sähe die Vorschau dort unauffällig aus.',
    );
  }
  if (ausserhalb > 0) {
    hinweise.push(
      `${ausserhalb.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR an ` +
        'Terminzahlungen liegen außerhalb des Vorschauzeitraums und sind nicht eingerechnet.',
    );
  }

  return {
    ...basis,
    punkte,
    endSaldo: saldo,
    summeAbfluss,
    ersteUnterdeckung,
    termine,
    summeTermine,
    ausserhalb,
    nurWegenTerminen,
    hinweise,
  };
}
