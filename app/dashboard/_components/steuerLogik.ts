// ============================================================
// ARGONAUT OS · steuerLogik.ts
// Steuerausweis nach Steuersaetzen — § 14 Abs. 4 Nr. 7 + 8 UStG.
//
// Grundsatz: Der Steuerbetrag wird JE STEUERSATZ auf die GRUPPENSUMME
// gerechnet, niemals je Position aufaddiert. Der Gesamtsteuerbetrag ist
// die Summe der Gruppen-Steuerbetraege. Genau so verlangt es die Norm,
// und genau so rechnet auch `summiereSteuer()` in preisauskunftLogik.ts.
//
// Rein: keine Seiteneffekte, keine Supabase- oder React-Abhaengigkeit.
// Serverseitig und im Browser gleichermassen verwendbar.
//
// ▄▄▄ PUNKT 27 (20.09.2026) — WAS SICH GEAENDERT HAT ▄▄▄
// Die Rechenregel selbst war richtig und bleibt unveraendert. Geaendert
// wurde nur, WIE die Zahlen hereinkommen:
//
//  1. Der eigene Zahl-Leser war Bauart A (nur Komma zu Punkt). Aus
//     "1.234,56" wurde "1.234.56" und damit 0 — die Position fiel wegen
//     `netto === 0` komplett aus der Rechnung, ohne jede Meldung.
//     Jetzt liest lib/zahlen.ts.
//  2. Ein nicht lesbarer Wert wurde still zu 0. Bei einem BETRAG hiess das
//     "Position verschwindet", bei einem STEUERSATZ "Position ist
//     steuerfrei". Beides blieb unbemerkt. Jetzt wird gezaehlt und im
//     Klartext gemeldet (`unlesbar`, `hinweise`).
//
//     ▲ WICHTIG: Die SUMMEN aendern sich dadurch NICHT. Ein unlesbarer
//       Steuersatz laesst den Nettobetrag weiterhin in der 0-%-Gruppe
//       stehen — haette ich die Position stattdessen herausgenommen, waere
//       die Rechnungssumme still GESCHRUMPFT, und das waere schlimmer als
//       der Fehler, den ich repariere. Der Betrag bleibt, der Hinweis
//       kommt dazu. Eine ausdrueckliche 0 bleibt eine 0 — § 4 UStG ist ein
//       echter Fall und gehoert ausgewiesen.
//  3. `cent()` ist jetzt `centRunden` aus lib/zahlen.ts. Verhalten
//     identisch (war hier schon symmetrisch); eine Fassung weniger im Haus.
//
// ▄▄▄ PAKET 191 (30.09.2026) — CENT-RUNDUNG ▄▄▄
//  centRunden rundet jetzt ohne Gleitkomma-Fehler (19 % von 42,50 € = 8,08 €,
//  nicht mehr 8,07 €). steuerGruppen nimmt optional eine Rundung entgegen;
//  rundungWieGespeichert waehlt fuer das NEU-Rendern eines gespeicherten
//  Belegs (PDF, ZUGFeRD) die Rundung, mit der seine Summen entstanden sind —
//  ein alter Beleg sieht nach dem Update genau so aus wie vorher (GoBD).
//
// Node-getestet: tests/geldSchichtP27.test.mjs, tests/centRundungP191.test.mjs
// ============================================================

import { leseZahl, centRunden, centRundenBis191 } from '@/lib/zahlen';

/** Eine Rundungsregel auf Cent. Standard: centRunden. */
export type Rundung = (n: number) => number;

/** Eine Position, so wie sie aus `rechnung_positionen` kommt. */
export interface SteuerPosten {
  /** Nettobetrag der Zeile. */
  netto: number;
  /** Steuersatz in Prozent, z. B. 7 oder 19. */
  satz: number;
}

/** Alle Positionen eines Steuersatzes, zusammengefasst. */
export interface SteuerGruppe {
  satz: number;
  netto: number;
  steuer: number;
  brutto: number;
}

export interface SteuerSumme {
  netto: number;
  steuer: number;
  brutto: number;
  /** Aufsteigend nach Steuersatz. Leer, wenn keine Position einen Betrag traegt. */
  gruppen: SteuerGruppe[];
  /**
   * Wie viele Posten wegen eines nicht lesbaren Betrags oder Steuersatzes
   * NICHT mitgerechnet wurden. Additiv ergaenzt (Punkt 27) — alte Aufrufer
   * sehen das Feld nicht und rechnen unveraendert weiter.
   */
  unlesbar: number;
  /** Klartext zu den nicht gerechneten Posten. Leer, wenn alles sauber war. */
  hinweise: string[];
}

/**
 * Kaufmaennisch auf zwei Nachkommastellen.
 * Symmetrisch um die Null — sonst rundet eine Gutschrift falsch.
 *
 * Durchgereicht aus lib/zahlen.ts, damit es im Haus nur EINE Rundung gibt.
 * Der Export bleibt bestehen: rechnungen/[id]/page.tsx und aufmassLogik.ts
 * holen `cent` von hier.
 */
export function cent(n: number): number {
  return centRunden(n);
}

/**
 * Liest einen Zahlwert. Gibt null zurueck, wenn die Eingabe keine
 * eindeutige Zahl ist — NIE still 0.
 */
function zahlOderNull(v: unknown): number | null {
  return leseZahl(v);
}

/**
 * Fasst Positionen nach Steuersatz zusammen.
 *
 * Positionen mit Nettobetrag 0 zaehlen nicht — sie wuerden eine leere
 * Steuerzeile erzeugen ("0 % auf 0,00 €"), die niemand lesen will.
 * Eine Position mit Satz 0 und echtem Betrag (z. B. § 4 UStG steuerfrei)
 * bleibt dagegen sichtbar. Das ist gewollt: Steuerbefreiungen gehoeren
 * ausgewiesen.
 *
 * Ein nicht lesbarer Betrag oder Steuersatz wird gezaehlt und im Klartext
 * genannt. Die Summen bleiben dabei, was sie waren — siehe Kopf.
 */
export function steuerGruppen(posten: readonly SteuerPosten[], rundung: Rundung = centRunden): SteuerSumme {
  const cent = rundung;
  const nachSatz = new Map<number, { satz: number; netto: number }>();
  const hinweise: string[] = [];
  let unlesbar = 0;

  posten.forEach((p, i) => {
    const netto = zahlOderNull(p.netto);

    // Ohne lesbaren Betrag gibt es nichts zu rechnen. Das war auch bisher so
    // (der alte Leser machte daraus eine 0, und `netto === 0` sprang weiter) —
    // neu ist nur, dass es jemand erfaehrt.
    if (netto === null) {
      unlesbar++;
      hinweise.push(`Position ${i + 1}: Der Nettobetrag ist nicht lesbar und wurde nicht gerechnet.`);
      return;
    }
    if (netto === 0) return;

    // Unlesbarer Steuersatz: der BETRAG bleibt stehen, damit die Summe nicht
    // still schrumpft. Er landet wie bisher in der 0-%-Gruppe — aber sichtbar.
    const satzGelesen = zahlOderNull(p.satz);
    if (satzGelesen === null) {
      unlesbar++;
      hinweise.push(`Position ${i + 1}: Der Steuersatz ist nicht lesbar. Der Betrag steht als steuerfrei (0 %) in der Aufstellung — bitte den Steuersatz nachtragen, bevor die Rechnung hinausgeht.`);
    }
    const satz = satzGelesen ?? 0;

    const g = nachSatz.get(satz) ?? { satz, netto: 0 };
    g.netto += netto; // exakt aufsummieren, erst die Gruppe wird gerundet
    nachSatz.set(satz, g);
  });

  const gruppen: SteuerGruppe[] = [...nachSatz.values()]
    .map((g) => {
      const netto = cent(g.netto);
      const steuer = cent(netto * (g.satz / 100)); // EINMAL runden, auf der Gruppensumme
      return { satz: g.satz, netto, steuer, brutto: cent(netto + steuer) };
    })
    .sort((a, b) => a.satz - b.satz);

  const netto = cent(gruppen.reduce((s, g) => s + g.netto, 0));
  const steuer = cent(gruppen.reduce((s, g) => s + g.steuer, 0));

  return { netto, steuer, brutto: cent(netto + steuer), gruppen, unlesbar, hinweise };
}

/**
 * Weicht ein gespeicherter Wert vom neu berechneten ab?
 * Toleranz ist ein halber Cent — alles darueber ist eine echte Abweichung
 * und muss dem Nutzer gezeigt, nicht stillschweigend verschluckt werden.
 *
 * Ein nicht lesbarer gespeicherter Wert gilt als Abweichung: "kann ich
 * nicht lesen" darf nicht wie "stimmt ueberein" aussehen.
 */
export function weichtAb(gespeichert: unknown, berechnet: number): boolean {
  const g = zahlOderNull(gespeichert);
  if (g === null) return true;
  if (g === 0 && berechnet === 0) return false;
  return Math.abs(cent(g) - cent(berechnet)) > 0.005;
}

/** Gespeicherte Summen eines Belegs. Nicht gesetzte Felder werden nicht verglichen. */
export interface GespeicherteSummen {
  netto?: unknown;
  steuer?: unknown;
  brutto?: unknown;
}

/**
 * Paket 191 — welche Rundung hat die gespeicherten Summen erzeugt?
 *
 * `postenMit` baut die Posten fuer eine gegebene Rundung (falls die Zeilen
 * selbst gerundet werden). Ergebnis:
 *  - stimmt die NEUE Rundung mit den gespeicherten Summen (oder ist nichts
 *    gespeichert)  -> neue Rundung
 *  - stimmt nur die ALTE (bis Paket 190)                 -> alte Rundung,
 *    damit der Beleg unveraendert wiedergegeben wird (GoBD)
 *  - stimmt keine                                        -> neue Rundung; die
 *    Abweichungs-Warnung des Aufrufers greift wie bisher.
 */
export function rundungWieGespeichert(
  postenMit: (rundung: Rundung) => readonly SteuerPosten[],
  gespeichert: GespeicherteSummen | null | undefined,
): { rundung: Rundung; alteRundung: boolean } {
  const neu = { rundung: centRunden as Rundung, alteRundung: false };
  if (!gespeichert) return neu;
  const felder = (['netto', 'steuer', 'brutto'] as const).filter((f) => gespeichert[f] !== undefined && gespeichert[f] !== null);
  if (felder.length === 0) return neu;

  const passt = (r: Rundung): boolean => {
    const s = steuerGruppen(postenMit(r), r);
    return felder.every((f) => !weichtAb(gespeichert[f], s[f]));
  };
  if (passt(centRunden)) return neu;
  if (passt(centRundenBis191)) return { rundung: centRundenBis191, alteRundung: true };
  return neu;
}

/** Steuersatz fuer die Anzeige: "7" statt "7,00", aber "10,7" bleibt "10,7". */
export function satzText(satz: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(satz);
}
