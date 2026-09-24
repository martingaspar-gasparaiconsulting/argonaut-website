// ============================================================================
// ARGONAUT OS · lib/rechnungsAbgleich.ts — Rechnung ↔ Bestellung ↔ Wareneingang
// Paket PB · B02 (24.09.2026). Reine Logik, node-getestet
// (tests/einkaufP71.test.mjs). KEINE Supabase-Aufrufe, KEINE Hooks.
//
// Drei Fragen, bevor eine Eingangsrechnung bezahlt wird:
//   1. Haben wir diese Rechnung schon?                 -> findeDubletten()
//   2. Zu welcher Bestellung gehoert sie?               -> bestellVorschlaege()
//   3. Stimmt der Betrag mit dem, was BESTELLT und was
//      tatsaechlich GELIEFERT wurde?                    -> pruefeGegenBestellung()
//
// ▄▄▄ GRUNDREGELN ▄▄▄
// · Verglichen wird NETTO. Die Bestellung kennt nur Nettopreise; ein
//   Vergleich mit dem Brutto der Rechnung waere immer 19 % daneben.
// · Die Toleranz ist klein und fest: 1,00 EUR ODER 1 %, je nachdem, was
//   groesser ist. Rundungen auf Positionsebene sollen nicht rot werden,
//   ein vergessener Rabatt schon.
// · "Mehr berechnet als geliefert" ist der teure Fall und wird zuerst
//   gemeldet — auch wenn der Betrag zur BESTELLUNG passt.
// · Nichts hier blockiert. Alles sind Hinweise; bezahlen oder buchen
//   entscheidet der Mensch.
// ============================================================================

import { leseZahl, leseZahlOder, centRunden } from './zahlen';

// ---------------------------------------------------------------------------
// Lieferanten-Namen vergleichbar machen
// ---------------------------------------------------------------------------

const RECHTSFORMEN = /\b(gmbh\s*&\s*co\.?\s*kg|gmbh|mbh|ag|kg|ohg|gbr|ug|e\.?\s?k\.?|e\.?\s?v\.?|inh\.?|haftungsbeschränkt|co\.?)\b/gi;

/**
 * "Würth GmbH & Co. KG" und "WÜRTH" werden gleich; Umlaute bleiben erhalten,
 * aber ae/oe/ue gilt als dasselbe wie ä/ö/ü.
 */
export function normName(name: unknown): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(RECHTSFORMEN, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Gleicher Lieferant? Exakt gleich nach normName, oder einer steckt im anderen (ab 4 Zeichen). */
export function gleicherLieferant(a: unknown, b: unknown): boolean {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [kurz, lang] = x.length <= y.length ? [x, y] : [y, x];
  return kurz.length >= 4 && (lang.startsWith(kurz + ' ') || lang.endsWith(' ' + kurz) || lang.includes(' ' + kurz + ' '));
}

/** Rechnungsnummer vergleichbar: ohne Leerzeichen, Striche, fuehrende Nullen; gross/klein egal. */
export function normNummer(nr: unknown): string {
  return String(nr ?? '').toUpperCase().replace(/[\s\-_/.]/g, '').replace(/^0+(?=\d)/, '');
}

// ---------------------------------------------------------------------------
// 1 · Dubletten
// ---------------------------------------------------------------------------

export type BelegLite = {
  id?: string;
  lieferant?: string | null;
  belegnummer?: string | null;
  belegdatum?: string | null;
  netto?: unknown;
  brutto?: unknown;
};

export type Dublette = { id: string | undefined; grund: string; sicher: boolean };

function tageAbstand(a: string, b: string): number | null {
  const ta = Date.parse(a.slice(0, 10) + 'T00:00:00Z');
  const tb = Date.parse(b.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.abs(Math.round((ta - tb) / 86_400_000));
}

/**
 * Sucht Belege, die dieselbe Rechnung sein koennten.
 *   sicher  = gleicher Lieferant UND gleiche Rechnungsnummer
 *   moeglich= gleicher Lieferant, gleicher Bruttobetrag, Datum hoechstens 3 Tage auseinander
 * Der Beleg selbst (gleiche id) zaehlt nicht.
 */
export function findeDubletten(neu: BelegLite, vorhandene: BelegLite[]): Dublette[] {
  const treffer: Dublette[] = [];
  const nrNeu = normNummer(neu.belegnummer);
  const bruttoNeu = leseZahl(neu.brutto);
  for (const b of vorhandene ?? []) {
    if (neu.id && b.id === neu.id) continue;
    if (!gleicherLieferant(neu.lieferant, b.lieferant)) continue;
    const nr = normNummer(b.belegnummer);
    if (nrNeu && nr && nrNeu === nr) {
      treffer.push({ id: b.id, sicher: true, grund: `Gleiche Rechnungsnummer ${b.belegnummer} von ${b.lieferant} ist schon erfasst.` });
      continue;
    }
    const brutto = leseZahl(b.brutto);
    const abstand = neu.belegdatum && b.belegdatum ? tageAbstand(neu.belegdatum, b.belegdatum) : null;
    if (bruttoNeu !== null && brutto !== null && Math.abs(bruttoNeu - brutto) < 0.005 && abstand !== null && abstand <= 3) {
      treffer.push({ id: b.id, sicher: false, grund: `Gleicher Betrag (${euro(brutto)}) von ${b.lieferant} im Abstand von ${abstand} Tag${abstand === 1 ? '' : 'en'} — bitte prüfen, ob es dieselbe Rechnung ist.` });
    }
  }
  return treffer.sort((a, b) => Number(b.sicher) - Number(a.sicher));
}

// ---------------------------------------------------------------------------
// 2 + 3 · Bestellung
// ---------------------------------------------------------------------------

export type PositionLite = {
  menge?: unknown;
  menge_erhalten?: unknown;
  retoure_menge?: unknown;
  ek_preis?: unknown;
};

export type BestellungLite = {
  id: string;
  bestell_nr?: string | null;
  datum?: string | null;
  status?: string | null;
  lieferant_name?: string | null;
  positionen: PositionLite[];
};

export type Ampel = 'gruen' | 'gelb' | 'rot';

export type Abgleich = {
  bestellwert: number;
  /** Wert der tatsaechlich eingegangenen Menge, abzueglich Retouren */
  geliefertWert: number;
  rechnungNetto: number | null;
  /** Rechnung minus gelieferter Wert — positiv = es wird MEHR berechnet */
  differenzGeliefert: number | null;
  differenzBestellt: number | null;
  ampel: Ampel;
  meldungen: string[];
};

export const TOLERANZ_EURO = 1;
export const TOLERANZ_PROZENT = 1;
export const GELB_PROZENT = 3;

export function toleranz(basis: number): number {
  return Math.max(TOLERANZ_EURO, Math.abs(basis) * TOLERANZ_PROZENT / 100);
}

function euro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
}

/** Bestellter und gelieferter Netto-Wert einer Bestellung. */
export function bestellWerte(positionen: PositionLite[]): { bestellwert: number; geliefertWert: number; nichtsGeliefert: boolean } {
  let bestellt = 0, geliefert = 0, erhaltenMenge = 0;
  for (const p of positionen ?? []) {
    const preis = leseZahlOder(p.ek_preis, 0);
    const menge = leseZahlOder(p.menge, 0);
    const erhalten = Math.max(0, leseZahlOder(p.menge_erhalten, 0) - leseZahlOder(p.retoure_menge, 0));
    bestellt += menge * preis;
    geliefert += erhalten * preis;
    erhaltenMenge += leseZahlOder(p.menge_erhalten, 0);
  }
  return { bestellwert: centRunden(bestellt), geliefertWert: centRunden(geliefert), nichtsGeliefert: erhaltenMenge <= 0 };
}

/**
 * Prueft einen Rechnungsbetrag (NETTO) gegen eine Bestellung.
 * Reihenfolge der Meldungen = Reihenfolge der Wichtigkeit.
 */
export function pruefeGegenBestellung(rechnungNettoRoh: unknown, positionen: PositionLite[]): Abgleich {
  const { bestellwert, geliefertWert, nichtsGeliefert } = bestellWerte(positionen);
  const netto = leseZahl(rechnungNettoRoh);
  const meldungen: string[] = [];

  if (netto === null) {
    return {
      bestellwert, geliefertWert, rechnungNetto: null, differenzGeliefert: null, differenzBestellt: null,
      ampel: 'gelb',
      meldungen: ['Der Nettobetrag der Rechnung fehlt oder ist nicht lesbar — ohne ihn ist kein Abgleich möglich.'],
    };
  }

  const rechnungNetto = centRunden(netto);
  const differenzBestellt = centRunden(rechnungNetto - bestellwert);
  const differenzGeliefert = centRunden(rechnungNetto - geliefertWert);
  let ampel: Ampel = 'gruen';

  if (nichtsGeliefert) {
    ampel = 'rot';
    meldungen.push('Zu dieser Bestellung ist noch KEIN Wareneingang gebucht. Erst Ware prüfen, dann bezahlen.');
  } else if (differenzGeliefert > toleranz(geliefertWert)) {
    ampel = 'rot';
    meldungen.push(`Es wird ${euro(differenzGeliefert)} MEHR berechnet als geliefert wurde (geliefert: ${euro(geliefertWert)}).`);
  }

  if (differenzBestellt > toleranz(bestellwert)) {
    // Ueber der Bestellung: Preiserhoehung oder Zusatzposten. Ab 3 % rot.
    const prozent = bestellwert > 0 ? differenzBestellt / bestellwert * 100 : 100;
    if (ampel !== 'rot') ampel = prozent > GELB_PROZENT ? 'rot' : 'gelb';
    meldungen.push(`Rechnung liegt ${euro(differenzBestellt)} über der Bestellung (${prozent.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %) — Preiserhöhung oder Zusatzposten?`);
  } else if (-differenzBestellt > toleranz(bestellwert)) {
    // Unter der Bestellung: fuer den Betrieb nicht teuer, aber zu klaeren.
    // Passt sie zur GELIEFERTEN Menge, ist es eine sauber berechnete Teillieferung.
    if (ampel !== 'rot') ampel = 'gelb';
    const passtGeliefert = Math.abs(differenzGeliefert) <= toleranz(geliefertWert);
    meldungen.push(passtGeliefert
      ? `Teillieferung: Die Rechnung passt zur gelieferten Menge. Rest der Bestellung (${euro(-differenzBestellt)}) ist noch offen.`
      : `Rechnung liegt ${euro(-differenzBestellt)} unter der Bestellung — Gutschrift, Rabatt oder fehlende Position?`);
  }

  if (meldungen.length === 0) meldungen.push('Rechnung passt zur Bestellung und zum Wareneingang.');
  return { bestellwert, geliefertWert, rechnungNetto, differenzGeliefert, differenzBestellt, ampel, meldungen };
}

export type Vorschlag = { bestellung: BestellungLite; abgleich: Abgleich; passtBetrag: boolean };

/**
 * Welche Bestellungen kommen fuer diese Rechnung in Frage?
 * Nur gleicher Lieferant, nicht storniert, nicht im Entwurf. Die am besten
 * passende (kleinste Abweichung zum gelieferten Wert) steht oben.
 */
export function bestellVorschlaege(beleg: BelegLite, bestellungen: BestellungLite[], max = 5): Vorschlag[] {
  const liste: Vorschlag[] = [];
  for (const b of bestellungen ?? []) {
    const st = String(b.status ?? '');
    if (st === 'storniert' || st === 'entwurf') continue;
    if (!gleicherLieferant(beleg.lieferant, b.lieferant_name)) continue;
    const abgleich = pruefeGegenBestellung(beleg.netto, b.positionen);
    const d = abgleich.differenzGeliefert;
    liste.push({ bestellung: b, abgleich, passtBetrag: d !== null && Math.abs(d) <= toleranz(abgleich.geliefertWert) });
  }
  const abstand = (v: Vorschlag) => (v.abgleich.differenzGeliefert === null ? Infinity : Math.abs(v.abgleich.differenzGeliefert));
  return liste.sort((a, b) => abstand(a) - abstand(b)).slice(0, Math.max(0, max));
}
