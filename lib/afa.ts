// ============================================================================
// ARGONAUT OS · lib/afa.ts — Regel-Ebene: Abschreibung (AfA) rechnen
//
// KEINE KI. Deutsche Abschreibungsregeln (Stand 2026):
//   · GWG: Anschaffungskosten ≤ 800 € netto → Sofortabschreibung im Jahr
//     der Anschaffung (voller Betrag).
//   · Darueber: lineare AfA über die betriebsgewöhnliche Nutzungsdauer,
//     MONATSGENAU im Anschaffungsjahr (pro rata temporis, 1/12 je Monat ab
//     Anschaffungsmonat). Der Rest laeuft in die Folgejahre.
//   · Nutzungsdauer 1 Jahr (z. B. digitale Wirtschaftsgueter nach BMF) →
//     voller Abzug im Anschaffungsjahr.
//
// Reine Funktionen, keine Hooks/Supabase — ueberall importierbar.
//
// ▄▄▄ PUNKT 29b (20.09.2026) ▄▄▄
// r2() las Zahlen mit Number() und rundete unsymmetrisch. Anschaffungskosten
// als "1.234,56" wurden damit 0 — und ein Wirtschaftsgut mit 0 EUR faellt
// durch den GWG-Zweig (k > 0) in die lineare AfA und schreibt jahrelang
// nichts ab. Jetzt ueber lib/zahlen.ts.
// Node-getestet: tests/steuerRechnerP29.test.mjs
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

export const GWG_GRENZE = 800; // € netto, Sofortabschreibung 2026

export type AfaMethode = 'linear' | 'gwg';
export type AfaJahr = { jahr: number; afa: number; restbuchwert: number };
export type AfaPlan = {
  methode: AfaMethode;
  jahresAfa: number;          // volle Jahresrate (linear) bzw. Sofortbetrag (GWG)
  plan: AfaJahr[];            // Jahr fuer Jahr, chronologisch
  restbuchwertHeute: number;  // Buchwert zum Ende des Stichjahres
  afaStichjahr: number;       // Abschreibung, die im Stichjahr anfaellt
  hinweis: string;
};

function r2(n: number): number { return centRunden(leseZahlOder(n, 0)); }

export function afaPlan(kosten: number, nutzungsdauer: number, anschaffungISO?: string | null, stichjahr?: number): AfaPlan {
  const k = r2(kosten);
  const leer: AfaPlan = { methode: 'linear', jahresAfa: 0, plan: [], restbuchwertHeute: k, afaStichjahr: 0, hinweis: '' };
  if (!anschaffungISO || anschaffungISO.length < 7) return { ...leer, hinweis: 'Anschaffungsdatum angeben.' };
  const aJahr = parseInt(anschaffungISO.slice(0, 4), 10);
  const monat = Math.min(12, Math.max(1, parseInt(anschaffungISO.slice(5, 7), 10) || 1));
  if (!Number.isFinite(aJahr)) return { ...leer, hinweis: 'Anschaffungsdatum ungültig.' };
  const jahr = Number.isFinite(stichjahr as number) ? (stichjahr as number) : aJahr;

  const stichHelfer = (plan: AfaJahr[]): { rest: number; afa: number } => {
    if (jahr < aJahr) return { rest: k, afa: 0 };
    const e = plan.find((p) => p.jahr === jahr);
    if (e) return { rest: e.restbuchwert, afa: e.afa };
    return { rest: 0, afa: 0 }; // nach Planende
  };

  // --- GWG: Sofortabschreibung ---
  if (k > 0 && k <= GWG_GRENZE) {
    const plan: AfaJahr[] = [{ jahr: aJahr, afa: k, restbuchwert: 0 }];
    const s = stichHelfer(plan);
    return { methode: 'gwg', jahresAfa: k, plan, restbuchwertHeute: s.rest, afaStichjahr: s.afa, hinweis: `GWG (≤ ${GWG_GRENZE} € netto): Sofortabschreibung im Jahr ${aJahr}.` };
  }

  const nd = Math.max(1, Math.round(nutzungsdauer || 0));

  // --- Nutzungsdauer 1 Jahr: voller Abzug im Anschaffungsjahr ---
  if (nd <= 1) {
    const plan: AfaJahr[] = [{ jahr: aJahr, afa: k, restbuchwert: 0 }];
    const s = stichHelfer(plan);
    return { methode: 'linear', jahresAfa: k, plan, restbuchwertHeute: s.rest, afaStichjahr: s.afa, hinweis: `Nutzungsdauer 1 Jahr: voller Abzug im Jahr ${aJahr}.` };
  }

  // --- Lineare AfA, monatsgenau ---
  const jahresAfa = r2(k / nd);
  const monateErstes = 13 - monat; // Anschaffung im Monat m -> (13-m) Monate im ersten Jahr
  const plan: AfaJahr[] = [];
  let rest = k;
  let j = aJahr;
  let afa1 = Math.min(r2(jahresAfa * monateErstes / 12), rest);
  rest = r2(rest - afa1);
  plan.push({ jahr: j, afa: afa1, restbuchwert: rest });
  while (rest > 0 && plan.length < nd + 3) {
    j += 1;
    const afa = Math.min(jahresAfa, rest);
    rest = r2(rest - afa);
    plan.push({ jahr: j, afa: r2(afa), restbuchwert: rest });
  }
  const s = stichHelfer(plan);
  return { methode: 'linear', jahresAfa, plan, restbuchwertHeute: s.rest, afaStichjahr: s.afa, hinweis: `Linear über ${nd} Jahre, monatsgenau ab ${String(monat).padStart(2, '0')}/${aJahr}.` };
}

// ============================================================================
// PUNKT 65 / R12, Teil 2 (21.09.2026) — DER SAMMELPOSTEN NACH § 6 Abs. 2a EStG
//
// REIN ADDITIV. afaPlan(), GWG_GRENZE und alles darüber bleiben unverändert.
//
// ▄▄▄ DER BEFUND ▄▄▄
// Diese Datei kannte genau zwei Wege: GWG-Sofortabschreibung bis 800 EUR und
// lineare AfA darüber. Der dritte, den § 6 Abs. 2a EStG vorsieht, fehlte ganz
// — der Sammelposten. Für einen Betrieb, der jedes Jahr ein Dutzend Geräte
// zwischen 250 und 1.000 EUR anschafft, ist das der praktisch wichtigste.
//
// ▄▄▄ DIE REGEL ▄▄▄
//   bis 250,00 EUR netto      Sofortabzug, ohne Verzeichnis
//   250,01 bis 800,00 EUR     Wahl: GWG-Sofortabzug (mit Verzeichnis)
//                             ODER Sammelposten
//   250,01 bis 1.000,00 EUR   Sammelposten ODER lineare AfA
//   Sammelposten              Auflösung über FÜNF Jahre, je ein Fünftel,
//                             beginnend im Jahr der Bildung
//
// ▄▄▄ DREI FEHLER, DIE DIESER ABSCHNITT VERHINDERN SOLL ▄▄▄
//
//  1. DAS WAHLRECHT JE WIRTSCHAFTSGUT AUSÜBEN.
//     § 6 Abs. 2a Satz 5 EStG verlangt, dass es für ALLE Güter eines
//     Wirtschaftsjahres EINHEITLICH ausgeübt wird. Wer bei einem Gerät für
//     640 EUR sofort abschreibt und beim nächsten für 700 EUR den
//     Sammelposten wählt, hat einen Fehler in der Bilanz, den erst die
//     Betriebsprüfung findet. `pruefeEinheitlich()` sagt es vorher.
//
//  2. DEN SAMMELPOSTEN MINDERN, WENN EIN GUT AUSSCHEIDET.
//     Er bleibt unverändert (§ 6 Abs. 2a Satz 3 EStG) — auch wenn das Gerät
//     im zweiten Jahr kaputtgeht oder verkauft wird. Der Posten läuft seine
//     fünf Jahre zu Ende. Das ist kontraintuitiv und deshalb der Fehler, der
//     am häufigsten gemacht wird.
//
//  3. DIE UNTERGRENZE ÜBERSEHEN.
//     Unter 250,01 EUR gehört nichts in den Sammelposten — solche Güter sind
//     ohnehin sofort abziehbar. Wer sie einstellt, streckt einen Abzug über
//     fünf Jahre, den er sofort haben könnte.
// ============================================================================

/** Untergrenze: darunter Sofortabzug ohne Verzeichnis. */
export const SAMMELPOSTEN_UNTERGRENZE = 250;
/** Obergrenze des Sammelpostens. */
export const SAMMELPOSTEN_OBERGRENZE = 1000;
/** Auflösung über so viele Jahre, je ein Fünftel. */
export const SAMMELPOSTEN_JAHRE = 5;

export type WahlWeg = 'sofort_ohne_verzeichnis' | 'gwg_sofort' | 'sammelposten' | 'linear';

export interface WegOption {
  weg: WahlWeg;
  moeglich: boolean;
  grund: string;
}

/**
 * Welche Wege stehen für EIN Wirtschaftsgut offen?
 * Sagt ausdrücklich auch, was NICHT geht und warum.
 */
export function wegeFuer(kosten: number): WegOption[] {
  const k = r2(kosten);
  return [
    {
      weg: 'sofort_ohne_verzeichnis',
      moeglich: k > 0 && k <= SAMMELPOSTEN_UNTERGRENZE,
      grund: k <= SAMMELPOSTEN_UNTERGRENZE
        ? `Bis ${SAMMELPOSTEN_UNTERGRENZE} EUR netto sofort abziehbar, ohne Verzeichnis.`
        : `Über ${SAMMELPOSTEN_UNTERGRENZE} EUR netto nicht mehr ohne Verzeichnis.`,
    },
    {
      weg: 'gwg_sofort',
      moeglich: k > 0 && k <= GWG_GRENZE,
      grund: k <= GWG_GRENZE
        ? `GWG bis ${GWG_GRENZE} EUR netto: Sofortabzug, Verzeichnis ab ${SAMMELPOSTEN_UNTERGRENZE} EUR nötig.`
        : `Über ${GWG_GRENZE} EUR netto kein GWG mehr.`,
    },
    {
      weg: 'sammelposten',
      moeglich: k > SAMMELPOSTEN_UNTERGRENZE && k <= SAMMELPOSTEN_OBERGRENZE,
      grund: k <= SAMMELPOSTEN_UNTERGRENZE
        ? `Unter ${SAMMELPOSTEN_UNTERGRENZE} EUR gehört nichts in den Sammelposten — das wäre ein gestreckter Abzug ohne Not.`
        : k <= SAMMELPOSTEN_OBERGRENZE
          ? `Sammelposten nach § 6 Abs. 2a EStG, Auflösung über ${SAMMELPOSTEN_JAHRE} Jahre.`
          : `Über ${SAMMELPOSTEN_OBERGRENZE} EUR netto kein Sammelposten mehr.`,
    },
    {
      weg: 'linear',
      moeglich: k > SAMMELPOSTEN_UNTERGRENZE,
      grund: k > SAMMELPOSTEN_UNTERGRENZE
        ? 'Lineare AfA über die betriebsgewöhnliche Nutzungsdauer.'
        : 'Bei diesem Betrag lohnt die lineare AfA nicht — Sofortabzug ist möglich.',
    },
  ];
}

export interface SammelpostenGut {
  bezeichnung?: string | null;
  /** Anschaffungskosten netto. */
  kosten: number | string | null;
  /** Falls das Gut im Lauf der fünf Jahre ausscheidet: Jahr des Abgangs. */
  abgangJahr?: number | null;
}

export interface SammelpostenJahr {
  jahr: number;
  aufloesung: number;
  restwert: number;
}

export interface Sammelposten {
  bildungsjahr: number;
  /** Summe aller eingestellten Güter. */
  summe: number;
  /** Güter, die eingestellt wurden. */
  enthalten: { bezeichnung: string; kosten: number }[];
  /** Güter, die NICHT hineingehören, mit Grund. */
  abgelehnt: { bezeichnung: string; kosten: number; grund: string }[];
  jahresAufloesung: number;
  plan: SammelpostenJahr[];
  hinweise: string[];
  klartext: string;
}

/**
 * Bildet den Sammelposten eines Wirtschaftsjahres und löst ihn über fünf
 * Jahre auf.
 *
 * FEHLER 2 aus dem Abschnittskopf: Ein Abgang ändert NICHTS. `abgangJahr`
 * wird entgegengenommen und ausdrücklich als folgenlos vermerkt, statt still
 * ignoriert zu werden — sonst fragt sich jemand, warum das Feld existiert.
 */
export function sammelposten(gueter: readonly SammelpostenGut[], bildungsjahr: number): Sammelposten {
  const enthalten: { bezeichnung: string; kosten: number }[] = [];
  const abgelehnt: { bezeichnung: string; kosten: number; grund: string }[] = [];
  const hinweise: string[] = [];
  let summe = 0;
  let abgaenge = 0;

  for (const g of gueter ?? []) {
    const k = r2(leseZahlOder(g.kosten, 0));
    const name = (g.bezeichnung ?? '').trim() || 'Wirtschaftsgut';

    if (k <= 0) {
      abgelehnt.push({ bezeichnung: name, kosten: k, grund: 'Keine Anschaffungskosten angegeben.' });
      continue;
    }
    if (k <= SAMMELPOSTEN_UNTERGRENZE) {
      abgelehnt.push({
        bezeichnung: name, kosten: k,
        grund: `Bis ${SAMMELPOSTEN_UNTERGRENZE} EUR netto sofort abziehbar — im Sammelposten wäre der Abzug ohne Not auf ${SAMMELPOSTEN_JAHRE} Jahre gestreckt.`,
      });
      continue;
    }
    if (k > SAMMELPOSTEN_OBERGRENZE) {
      abgelehnt.push({
        bezeichnung: name, kosten: k,
        grund: `Über ${SAMMELPOSTEN_OBERGRENZE} EUR netto: lineare AfA über die Nutzungsdauer.`,
      });
      continue;
    }
    enthalten.push({ bezeichnung: name, kosten: k });
    summe = r2(summe + k);
    if (g.abgangJahr != null) abgaenge += 1;
  }

  const jahresAufloesung = r2(summe / SAMMELPOSTEN_JAHRE);
  const plan: SammelpostenJahr[] = [];
  let rest = summe;
  for (let i = 0; i < SAMMELPOSTEN_JAHRE; i++) {
    // Im letzten Jahr der Rest, damit die Summe der Auflösungen exakt aufgeht.
    const a = i === SAMMELPOSTEN_JAHRE - 1 ? rest : Math.min(jahresAufloesung, rest);
    rest = r2(rest - a);
    plan.push({ jahr: bildungsjahr + i, aufloesung: r2(a), restwert: rest });
  }

  if (abgaenge > 0) {
    hinweise.push(
      `${abgaenge} Wirtschaftsgut${abgaenge === 1 ? '' : 'er'} scheidet vorzeitig aus. Das ändert am Sammelposten NICHTS: ` +
        `er wird nach § 6 Abs. 2a Satz 3 EStG nicht gemindert und läuft seine ${SAMMELPOSTEN_JAHRE} Jahre zu Ende.`,
    );
  }
  if (enthalten.length > 0) {
    hinweise.push(
      'Das Wahlrecht zwischen Sofortabzug und Sammelposten muss für ALLE Güter dieses Wirtschaftsjahres ' +
        'einheitlich ausgeübt werden (§ 6 Abs. 2a Satz 5 EStG).',
    );
  }

  return {
    bildungsjahr,
    summe,
    enthalten,
    abgelehnt,
    jahresAufloesung,
    plan,
    hinweise,
    klartext: enthalten.length === 0
      ? 'Kein Wirtschaftsgut gehört in den Sammelposten.'
      : `${enthalten.length} Wirtschaftsgüter, zusammen ${summe.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR. ` +
        `Auflösung über ${SAMMELPOSTEN_JAHRE} Jahre, ${bildungsjahr} bis ${bildungsjahr + SAMMELPOSTEN_JAHRE - 1}.`,
  };
}

export interface EinheitlichPruefung {
  einheitlich: boolean;
  sofort: string[];
  imSammelposten: string[];
  meldung: string | null;
}

/**
 * FEHLER 1 aus dem Abschnittskopf: das Wahlrecht gilt fürs ganze Jahr.
 *
 * Geprüft wird nur der Bereich, in dem es überhaupt ein Wahlrecht GIBT:
 * zwischen der Untergrenze und der GWG-Grenze. Darüber und darunter ist der
 * Weg vorgegeben, dort ist nichts uneinheitlich.
 */
export function pruefeEinheitlich(
  entscheidungen: readonly { bezeichnung?: string | null; kosten: number | string | null; weg: WahlWeg }[],
): EinheitlichPruefung {
  const sofort: string[] = [];
  const imSammelposten: string[] = [];

  for (const e of entscheidungen ?? []) {
    const k = r2(leseZahlOder(e.kosten, 0));
    if (k <= SAMMELPOSTEN_UNTERGRENZE || k > GWG_GRENZE) continue;   // kein Wahlrecht
    const name = (e.bezeichnung ?? '').trim() || `Gut über ${k} EUR`;
    if (e.weg === 'gwg_sofort') sofort.push(name);
    else if (e.weg === 'sammelposten') imSammelposten.push(name);
  }

  const einheitlich = sofort.length === 0 || imSammelposten.length === 0;
  return {
    einheitlich,
    sofort,
    imSammelposten,
    meldung: einheitlich ? null
      : `Das Wahlrecht ist uneinheitlich ausgeübt: ${sofort.join(', ')} sofort abgeschrieben, ` +
        `${imSammelposten.join(', ')} im Sammelposten. § 6 Abs. 2a Satz 5 EStG verlangt für alle Güter eines ` +
        'Wirtschaftsjahres denselben Weg.',
  };
}
