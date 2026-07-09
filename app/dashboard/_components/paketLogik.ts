// ============================================================================
// ARGONAUT OS · paketLogik.ts
// Block 1 · A3b-2 — Pakete: ein Fixpreis für einen Korb
//
// Reine Funktionen. Kein DB-Zugriff, kein React.
// BRANCHENNEUTRAL. Kein Wort über Holz.
//   Schäfers Starterkit, die Werkstatt-Inspektion, das Wartungspaket —
//   dieselbe Struktur: Positionen mit Einzelpreisen, ein Fixpreis darüber.
//
// ⚠️ DAS PAKET IST EIN PREISMODELL, KEIN ARTIKEL
//   Auf dem Beleg erscheint NICHT "Starterkit 249 €", sondern die einzelnen
//   Positionen mit ihrem Anteil am Fixpreis.
//
//   Der Grund ist zwingend: Bei zwei Steuersätzen (7 % Holz, 19 % Anzünder)
//   ist eine einzige Zeile nicht ausweisbar. Die Umsatzsteuer braucht die
//   Aufteilung. Und der Kunde sieht, was er bekommt.
//
// ⚠️ DIE AUFTEILUNG
//   Nach dem Verhältnis der Einzelpreise — die marktübliche und begründbare
//   Methode. `verteileFixpreis()` aus positionsLogik rechnet sie cent-exakt.
//
//   KEINE STEUERBERATUNG. Ob diese Methode für einen konkreten Betrieb
//   zulässig ist, gehört von der Steuerberatung bestätigt.
//
// ⚠️ PFLICHTANGABEN
//   Sobald ein Paket ein Lebensmittel enthält, greift Lebensmittelrecht:
//   Allergene, Zutaten, Mindesthaltbarkeit. Die Angaben müssen VOR der
//   Bestellung sichtbar sein. Diese Datei kann Lebensmittel nicht erkennen —
//   sie fragt nach, wenn Pflichtangaben fehlen könnten.
//
//   Kein Rechtsrat. Nur ein Wächter, der nicht schweigt.
// ============================================================================

import {
  verteileFixpreis, summiere, cent, eur, formatZahl,
  type Position, type PositionsArt, type Summe,
} from './positionsLogik';

// ----------------------------------------------------------------------------
// 1. TYPEN
// ----------------------------------------------------------------------------

/** Entspricht einer Zeile in public.pakete. */
export interface Paket {
  id: string;
  owner_user_id: string;
  firma_id: string | null;

  bezeichnung: string;
  beschreibung: string | null;
  fixpreis_netto: number;

  /** Lebensmittel, Gefahrgut, Altersfreigabe — was vor der Bestellung sichtbar sein muss. */
  pflichtangaben: string | null;

  aktiv: boolean;
  notiz: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
}

/** Entspricht einer Zeile in public.paket_positionen. */
export interface PaketPosition {
  id: string;
  owner_user_id: string;
  paket_id: string;

  position_nr: number | null;
  art: PositionsArt;
  sortiment_id: string | null;
  artikel_id: string | null;
  leistung_id: string | null;

  bezeichnung: string;
  detail: string | null;
  menge: number;
  einheit: string;
  /** Der Preis, der OHNE Paket gälte. Grundlage der Aufteilung. */
  einzelpreis_netto: number;
  steuersatz_prozent: number;
}

export interface PaketEntwurf {
  bezeichnung: string;
  fixpreis_netto: number;
  beschreibung?: string | null;
  pflichtangaben?: string | null;
  aktiv?: boolean;
}

export interface PruefErgebnis {
  ok: boolean;
  fehler: string[];
  hinweise: string[];
}

// ----------------------------------------------------------------------------
// 2. AUFKLAPPEN
// ----------------------------------------------------------------------------

export interface PaketBefund {
  /** Positionen mit anteiligem Fixpreis. Genau das kommt in den Auftrag. */
  positionen: Position[];
  summe: Summe;

  /** Was die Positionen einzeln kosten würden. */
  einzelSumme: number;
  /** einzelSumme − fixpreis. Positiv = der Kunde spart. */
  ersparnis: number;
  ersparnisProzent: number;

  /** Mehr als ein Steuersatz? Dann ist die Aufteilung nicht optional. */
  gemischteSteuer: boolean;

  fehler: string[];
  hinweise: string[];
  ok: boolean;
}

function alsPosition(p: PaketPosition): Position {
  return {
    art: p.art,
    quelle_id: p.sortiment_id ?? p.artikel_id ?? p.leistung_id ?? null,
    bezeichnung: p.bezeichnung,
    detail: p.detail,
    menge: p.menge,
    einheit: p.einheit,
    einzelpreis_netto: p.einzelpreis_netto,
    steuersatz_prozent: p.steuersatz_prozent,
    position_nr: p.position_nr,
  };
}

/**
 * Klappt ein Paket zu Auftragspositionen auf.
 *
 * Der Fixpreis wird anteilig verteilt. Was herauskommt, summiert sich
 * cent-exakt auf den Fixpreis — geprüft in positionsLogik.
 */
export function klappeAuf(paket: Paket, positionen: readonly PaketPosition[]): PaketBefund {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  if (positionen.length === 0) {
    fehler.push('Das Paket enthält keine Positionen.');
    return {
      positionen: [], summe: summiere([]), einzelSumme: 0, ersparnis: 0, ersparnisProzent: 0,
      gemischteSteuer: false, fehler, hinweise, ok: false,
    };
  }

  const roh = positionen.map(alsPosition);
  const einzelSumme = cent(roh.reduce((s, p) => s + p.menge * p.einzelpreis_netto, 0));

  const auf = verteileFixpreis(roh, paket.fixpreis_netto);
  hinweise.push(...auf.hinweise);

  const summe = summiere(auf.positionen);
  fehler.push(...summe.fehler);

  const ersparnis = cent(einzelSumme - paket.fixpreis_netto);
  const ersparnisProzent = einzelSumme > 0 ? Math.round((ersparnis / einzelSumme) * 1000) / 10 : 0;

  const saetze = new Set(roh.map((p) => p.steuersatz_prozent));
  const gemischteSteuer = saetze.size > 1;

  // --- Die Wächter -------------------------------------------------------
  if (paket.fixpreis_netto === 0) {
    hinweise.push('Der Fixpreis ist 0 € — das Paket wäre kostenlos. Absicht?');
  } else if (ersparnis < 0) {
    hinweise.push(
      `Der Fixpreis liegt ${eur(Math.abs(ersparnis))} ÜBER der Summe der Einzelpreise. ` +
      'Das ist ein Aufschlag, kein Paketpreis — bitte prüfen.',
    );
  } else if (ersparnisProzent > 50) {
    hinweise.push(`${formatZahl(ersparnisProzent, 1)} % Nachlass — ungewöhnlich hoch, bitte prüfen.`);
  }

  if (!paket.aktiv) hinweise.push('Dieses Paket ist derzeit nicht im Verkauf.');

  return {
    positionen: auf.positionen,
    summe,
    einzelSumme,
    ersparnis,
    ersparnisProzent,
    gemischteSteuer,
    fehler,
    hinweise,
    ok: fehler.length === 0 && summe.ok,
  };
}

/** Der Belegtext über den aufgeklappten Zeilen. */
export function paketUeberschrift(paket: Paket): string {
  return `Paket „${paket.bezeichnung}" · Festpreis ${eur(paket.fixpreis_netto)} netto`;
}

// ----------------------------------------------------------------------------
// 3. PRÜFUNG DER STAMMDATEN
// ----------------------------------------------------------------------------

export function pruefePaket(
  e: PaketEntwurf,
  positionen: readonly PaketPosition[] = [],
): PruefErgebnis {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  if (!e.bezeichnung?.trim()) fehler.push('Das Paket braucht eine Bezeichnung.');

  if (!Number.isFinite(e.fixpreis_netto)) fehler.push('Der Fixpreis ist keine gültige Zahl.');
  else if (e.fixpreis_netto < 0) fehler.push('Der Fixpreis darf nicht negativ sein.');
  else if (e.fixpreis_netto === 0) hinweise.push('Fixpreis 0 € — das Paket wäre kostenlos.');

  if (positionen.length === 0) {
    hinweise.push('Noch keine Positionen. Ohne Inhalt lässt sich das Paket nicht verkaufen.');
  }

  const einzelSumme = cent(positionen.reduce((s, p) => s + p.menge * p.einzelpreis_netto, 0));
  if (einzelSumme > 0 && e.fixpreis_netto > einzelSumme) {
    hinweise.push(
      `Der Fixpreis (${eur(e.fixpreis_netto)}) liegt über der Summe der Einzelpreise ` +
      `(${eur(einzelSumme)}). Ein Paket ist üblicherweise günstiger als die Teile.`,
    );
  }

  // --- Der Pflichtangaben-Wächter ---------------------------------------
  // Diese Datei erkennt kein Lebensmittel. Aber sie kann fragen.
  const hatFreitext = positionen.some((p) => p.art === 'freitext');
  if (hatFreitext && !e.pflichtangaben?.trim()) {
    hinweise.push(
      'Das Paket enthält freie Positionen. Falls darunter Lebensmittel, Gefahrgut oder ' +
      'altersbeschränkte Waren sind, müssen Pflichtangaben (Zutaten, Allergene, ' +
      'Haltbarkeit) VOR der Bestellung sichtbar sein. Bitte im Feld „Pflichtangaben" ergänzen.',
    );
  }

  return { ok: fehler.length === 0, fehler, hinweise };
}

export function pruefePaketPosition(p: Partial<PaketPosition>): PruefErgebnis {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  if (!p.bezeichnung?.trim()) fehler.push('Die Position braucht eine Bezeichnung.');

  if (!Number.isFinite(p.menge) || (p.menge ?? 0) <= 0) fehler.push('Die Menge muss größer als 0 sein.');

  if (!Number.isFinite(p.einzelpreis_netto) || (p.einzelpreis_netto ?? -1) < 0) {
    fehler.push('Der Einzelpreis darf nicht negativ sein.');
  } else if (p.einzelpreis_netto === 0) {
    hinweise.push(
      'Einzelpreis 0 € — diese Position bekommt keinen Anteil am Fixpreis. ' +
      'Für die Aufteilung braucht jede Position einen Wert.',
    );
  }

  const s = p.steuersatz_prozent;
  if (!Number.isFinite(s) || (s ?? -1) < 0 || (s ?? 101) > 100) {
    fehler.push('Der Steuersatz muss zwischen 0 und 100 % liegen.');
  }

  if (!p.einheit?.trim()) hinweise.push('Ohne Einheit steht auf dem Beleg nur eine Zahl.');

  return { ok: fehler.length === 0, fehler, hinweise };
}

// ----------------------------------------------------------------------------
// 4. KLARTEXT
// ----------------------------------------------------------------------------

/** "Starterkit · 249,00 € · spart 41,00 € (19,7 %)" */
export function paketKurz(paket: Paket, befund: PaketBefund): string {
  const teile = [paket.bezeichnung, `${eur(paket.fixpreis_netto)} netto`];
  if (befund.ersparnis > 0) {
    teile.push(`spart ${eur(befund.ersparnis)} (${formatZahl(befund.ersparnisProzent, 1)} %)`);
  }
  return teile.join(' · ');
}

/** Was der Kunde sieht, bevor er bestellt. */
export function paketKlartext(paket: Paket, befund: PaketBefund): string[] {
  const zeilen: string[] = [paketUeberschrift(paket)];

  if (paket.beschreibung?.trim()) zeilen.push(paket.beschreibung.trim());

  zeilen.push('');
  for (const p of befund.positionen) {
    zeilen.push(`  ${formatZahl(p.menge, 2)} ${p.einheit} ${p.bezeichnung}`);
  }

  zeilen.push('');
  zeilen.push(`Summe netto: ${eur(befund.summe.netto)}`);
  for (const g of befund.summe.gruppen) {
    zeilen.push(`zzgl. ${formatZahl(g.steuersatzProzent, 0)} % USt. auf ${eur(g.netto)}: ${eur(g.steuerBetrag)}`);
  }
  zeilen.push(`Gesamtbetrag: ${eur(befund.summe.brutto)} brutto`);

  if (befund.ersparnis > 0) {
    zeilen.push('', `Einzeln gekauft: ${eur(befund.einzelSumme)} netto. Sie sparen ${eur(befund.ersparnis)}.`);
  }

  if (paket.pflichtangaben?.trim()) {
    zeilen.push('', 'Pflichtangaben:', paket.pflichtangaben.trim());
  }

  return zeilen;
}

/**
 * Der Hinweis für den Betrieb, nicht für den Kunden.
 * Erscheint in der Oberfläche, sobald ein Paket zwei Steuersätze mischt.
 */
export const STEUER_HINWEIS_PAKET =
  'Dieses Paket enthält Positionen mit verschiedenen Steuersätzen. Der Fixpreis wird nach dem ' +
  'Verhältnis der Einzelpreise aufgeteilt, damit die Umsatzsteuer korrekt ausgewiesen werden ' +
  'kann. Bitte von der Steuerberatung bestätigen lassen.';
