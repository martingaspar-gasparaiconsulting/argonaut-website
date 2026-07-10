// ============================================================
// ARGONAUT OS · steuerLogik.ts
// Steuerausweis nach Steuersaetzen — § 14 Abs. 4 Nr. 7 + 8 UStG.
//
// Grundsatz: Der Steuerbetrag wird JE STEUERSATZ auf die GRUPPENSUMME
// gerechnet, niemals je Position aufaddiert. Der Gesamtsteuerbetrag ist
// die Summe der Gruppen-Steuerbetraege. Genau so verlangt es die Norm,
// und genau so rechnet auch `summiereSteuer()` in preisauskunftLogik.ts.
//
// Rein: keine Imports, keine Seiteneffekte. Serverseitig und im Browser
// gleichermassen verwendbar.
// ============================================================

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
}

/**
 * Kaufmaennisch auf zwei Nachkommastellen.
 * Symmetrisch um die Null — sonst rundet eine Gutschrift falsch.
 */
export function cent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const vz = n < 0 ? -1 : 1;
  return (vz * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
}

/** Liest einen Zahlwert tolerant (String aus dem Formular, numeric aus der DB). */
function zahl(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Fasst Positionen nach Steuersatz zusammen.
 *
 * Positionen mit Nettobetrag 0 zaehlen nicht — sie wuerden eine leere
 * Steuerzeile erzeugen ("0 % auf 0,00 €"), die niemand lesen will.
 * Eine Position mit Satz 0 und echtem Betrag (z. B. § 4 UStG steuerfrei)
 * bleibt dagegen sichtbar. Das ist gewollt: Steuerbefreiungen gehoeren
 * ausgewiesen.
 */
export function steuerGruppen(posten: readonly SteuerPosten[]): SteuerSumme {
  const nachSatz = new Map<number, { satz: number; netto: number }>();

  for (const p of posten) {
    const netto = zahl(p.netto);
    const satz = zahl(p.satz);
    if (netto === 0) continue;

    const g = nachSatz.get(satz) ?? { satz, netto: 0 };
    g.netto += netto; // exakt aufsummieren, erst die Gruppe wird gerundet
    nachSatz.set(satz, g);
  }

  const gruppen: SteuerGruppe[] = [...nachSatz.values()]
    .map((g) => {
      const netto = cent(g.netto);
      const steuer = cent(netto * (g.satz / 100)); // EINMAL runden, auf der Gruppensumme
      return { satz: g.satz, netto, steuer, brutto: cent(netto + steuer) };
    })
    .sort((a, b) => a.satz - b.satz);

  const netto = cent(gruppen.reduce((s, g) => s + g.netto, 0));
  const steuer = cent(gruppen.reduce((s, g) => s + g.steuer, 0));

  return { netto, steuer, brutto: cent(netto + steuer), gruppen };
}

/**
 * Weicht ein gespeicherter Wert vom neu berechneten ab?
 * Toleranz ist ein halber Cent — alles darueber ist eine echte Abweichung
 * und muss dem Nutzer gezeigt, nicht stillschweigend verschluckt werden.
 */
export function weichtAb(gespeichert: unknown, berechnet: number): boolean {
  const g = zahl(gespeichert);
  if (g === 0 && berechnet === 0) return false;
  return Math.abs(cent(g) - cent(berechnet)) > 0.005;
}

/** Steuersatz fuer die Anzeige: "7" statt "7,00", aber "10,7" bleibt "10,7". */
export function satzText(satz: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(satz);
}
