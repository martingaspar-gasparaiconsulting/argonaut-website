// ============================================================================
// ARGONAUT OS · lib/kalkulatorUebergabe.ts
//
// Der Weg vom Kalkulator ins Geschaeft: aus einer fertigen Kalkulation wird
// eine Angebotsposition oder ein Eintrag im Leistungskatalog.
//
// WARUM DIESE DATEI UEBERHAUPT EXISTIERT
// Die Summenberechnung eines Angebots steht heute INLINE in
// app/dashboard/angebote/page.tsx. Wer von aussen eine Position anhaengt,
// muss exakt genauso rechnen — sonst weicht die gespeicherte Angebotssumme
// von dem ab, was die Angebotsseite anzeigt, und niemand weiss, welche Zahl
// stimmt. Statt die Formel ein drittes Mal abzuschreiben, steht sie hier
// EINMAL und ist node-testbar. Die Rundung ist zeichengenau uebernommen:
//
//   · je Position:      Math.round(menge * einzelpreis * 100)   → ganze Cent
//   · je MwSt-Satz:     Math.round(gruppensumme * satz / 100)   → ganze Cent
//   · brutto:           (nettoCent + mwstCent) / 100            → NICHT erneut gerundet
//
// Keine Imports, keine Hooks — node-testbar.
// ============================================================================

export type AngebotsPosition = {
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  mwst_satz: number;
  gesamt_netto: number;
};

export type Summen = { netto: number; mwst: number; brutto: number };

/** Netto einer einzelnen Position — kaufmaennisch auf Cent. */
export function positionsNetto(menge: number, einzelpreis: number): number {
  return Math.round((Number(menge) || 0) * (Number(einzelpreis) || 0) * 100) / 100;
}

/**
 * Angebotssummen aus allen Positionen. Bewusst zeichengleich mit der Formel
 * in app/dashboard/angebote/page.tsx (Funktion `rechne`, Zeilen 48-56).
 * MwSt wird je Steuersatz auf die GRUPPENSUMME gerechnet, nicht je Zeile —
 * bei gemischten Saetzen ergibt das sonst Rundungsdifferenzen von Cents.
 */
export function angebotsSummen(positionen: Array<{ menge: number; einzelpreis: number; mwst_satz: number }>): Summen {
  let nettoC = 0;
  const jeSatz: Record<number, number> = {};

  for (const p of positionen) {
    const c = Math.round((Number(p.menge) || 0) * (Number(p.einzelpreis) || 0) * 100);
    nettoC += c;
    const s = Number(p.mwst_satz) || 0;
    jeSatz[s] = (jeSatz[s] || 0) + c;
  }

  let mwstC = 0;
  for (const s of Object.keys(jeSatz)) {
    mwstC += Math.round((jeSatz[Number(s)] ?? 0) * Number(s) / 100);
  }

  return { netto: nettoC / 100, mwst: mwstC / 100, brutto: (nettoC + mwstC) / 100 };
}

// ---------------------------------------------------------------------------
// Aus der Kalkulation wird eine Position
// ---------------------------------------------------------------------------

export type UebergabeQuelle = {
  name: string;
  menge: number;
  einheit: string;
  /** Angebotspreis netto JE EINHEIT aus dem Kalkulator. */
  preisJeEinheit: number;
  mwstSatz: number;
  /** Optional: was in der Position als Erlaeuterung stehen soll. */
  hinweis?: string;
};

/** Baut die Angebotsposition. Der Kalkulator liefert den Preis je Einheit —
 *  Menge und Einheit werden unveraendert uebernommen, damit der Kunde im
 *  Angebot dieselbe Rechnung nachvollziehen kann. */
export function alsAngebotsposition(q: UebergabeQuelle): AngebotsPosition {
  const menge = Math.max(0, Number(q.menge) || 0);
  const preis = Math.round((Number(q.preisJeEinheit) || 0) * 100) / 100;
  const bezeichnung = String(q.name || 'Leistung').trim() || 'Leistung';
  return {
    bezeichnung: q.hinweis ? `${bezeichnung} — ${q.hinweis}` : bezeichnung,
    menge,
    einheit: String(q.einheit || 'Stk').trim() || 'Stk',
    einzelpreis: preis,
    mwst_satz: Number(q.mwstSatz) || 19,
    gesamt_netto: positionsNetto(menge, preis),
  };
}

// ---------------------------------------------------------------------------
// Aus der Kalkulation wird ein Katalog-Eintrag
// ---------------------------------------------------------------------------

export type KatalogEintrag = {
  bezeichnung: string;
  kuerzel: string;
  kategorie: string;
  erfassungsart: string;
  standard_wert: number;
  einheit: string;
  einheitspreis_netto: number;
  stundensatz_netto: number;
  festpreis_netto: number;
  mwst_satz: number;
  aktiv: boolean;
};

/** Kuerzel aus der Bezeichnung — kurz, gross, ohne Sonderzeichen. */
export function kuerzelAus(bezeichnung: string): string {
  const worte = String(bezeichnung || '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim().split(/\s+/).filter(Boolean);
  if (worte.length === 0) return 'POS';
  if (worte.length === 1) return (worte[0] ?? '').slice(0, 6).toUpperCase();
  return worte.slice(0, 3).map((w) => w.slice(0, 3)).join('-').toUpperCase().slice(0, 12);
}

/**
 * Baut den Katalog-Eintrag. Die Erfassungsart richtet sich nach der Einheit:
 * bei Stunden wird ein Stundensatz gepflegt, sonst ein Preis je Einheit —
 * so, wie der Leistungskatalog es ohnehin unterscheidet.
 */
export function alsKatalogEintrag(q: UebergabeQuelle & { kategorie?: string }): KatalogEintrag {
  const einheit = String(q.einheit || 'Stk').trim() || 'Stk';
  const preis = Math.round((Number(q.preisJeEinheit) || 0) * 100) / 100;
  const istStunde = ['h', 'std', 'stunde', 'stunden'].includes(einheit.toLowerCase());
  const bezeichnung = String(q.name || 'Leistung').trim() || 'Leistung';

  return {
    bezeichnung,
    kuerzel: kuerzelAus(bezeichnung),
    kategorie: String(q.kategorie || 'Kalkuliert'),
    erfassungsart: istStunde ? 'stunden' : 'menge',
    standard_wert: 1,
    einheit,
    einheitspreis_netto: istStunde ? 0 : preis,
    stundensatz_netto: istStunde ? preis : 0,
    festpreis_netto: 0,
    mwst_satz: Number(q.mwstSatz) || 19,
    aktiv: true,
  };
}

/** Erläuterung für die Angebotsposition — was in der Kalkulation steckte. */
export function positionsHinweis(zeitMinutenJeEinheit: number, kwhJeEinheit: number): string {
  const teile: string[] = [];
  if (zeitMinutenJeEinheit > 0) teile.push(`${zeitMinutenJeEinheit} Min Arbeitszeit`);
  if (kwhJeEinheit > 0) teile.push(`${kwhJeEinheit} kWh`);
  return teile.length > 0 ? `je Einheit ${teile.join(', ')}` : '';
}
