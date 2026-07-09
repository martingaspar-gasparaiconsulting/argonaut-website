// ============================================================================
// ARGONAUT OS · preisLogik.ts
// Block 2 · Welle 1 · A3a — Brennholz-Preise, Rabattstaffel, Netto/Brutto
//
// Reine Funktionen. Kein DB-Zugriff, kein React, keine Seiteneffekte.
// Setzt auf holzLogik.ts (Einheiten/Umrechnung) und sortimentLogik.ts auf.
//
// Fundament fuer: A4 Auftrag, C4 Preisauskunft, F1 Lieferschein, Rechnung.
//
// GRUNDSATZ 1 — Preise werden HINTERLEGT, nicht gerechnet.
//   Der Markt rechnet nicht linear: 95 EUR/SRM heisst nicht automatisch
//   237,50 EUR/FM. Das System SCHLAEGT den abgeleiteten Wert vor; der Betrieb
//   ueberschreibt ihn mit seiner runden Hausnummer. Vorschlag ja, Zwang nein.
//
// GRUNDSATZ 2 — Der Steuersatz haengt an der PREISZEILE, nicht am Beleg.
//   Brennholz ist ermaessigt besteuert, eine Dienstleistung nicht. Nur so
//   rechnet spaeter auch ein Paket mit gemischten Saetzen korrekt ab.
//
// ACHTUNG — KEINE STEUERBERATUNG:
//   STANDARD_STEUERSATZ_BRENNHOLZ ist ein VORBELEGTER Wert, keine Zusicherung.
//   Die Zuordnung im Einzelfall gehoert vom Steuerberater bestaetigt. Der Satz
//   ist deshalb pro Preiszeile frei einstellbar und nirgends hart verdrahtet.
//
// DOCK-POINT: `gueltig_ab` liegt bereits in der Tabelle. Eine echte
// Preishistorie (Preis zum Belegdatum) laesst sich spaeter additiv ergaenzen,
// ohne bestehende Datensaetze anzufassen.
// ============================================================================

import {
  EINHEITEN,
  einheitKurz,
  formatZahl,
  runde,
  umrechnen,
  type HolzEinheit,
  type PruefErgebnis,
} from './holzLogik';
import { sortimentBezeichnungPdf, type Sortiment } from './sortimentLogik';

// ----------------------------------------------------------------------------
// 1. STEUERSAETZE
// ----------------------------------------------------------------------------

/** Vorbelegung fuer Brennholz (ermaessigt). Frei aenderbar je Preiszeile. */
export const STANDARD_STEUERSATZ_BRENNHOLZ = 7;

/** Vorbelegung fuer Dienstleistung, Moebel, Anfahrt (Regelsatz). */
export const STANDARD_STEUERSATZ_REGEL = 19;

export const STEUER_HINWEIS =
  'Steuersätze sind vorbelegt, nicht verbindlich. Die Zuordnung im Einzelfall ' +
  'gehört von der Steuerberatung bestätigt — insbesondere bei Paketen mit ' +
  'gemischten Leistungen.';

// ----------------------------------------------------------------------------
// 2. DATENSAETZE (1:1 zu den Tabellen)
// ----------------------------------------------------------------------------

/** Entspricht einer Zeile in public.holz_preise. */
export interface Preis {
  id: string;
  owner_user_id: string;
  firma_id: string | null;
  sortiment_id: string;
  einheit: HolzEinheit;
  preis_netto: number;
  steuersatz_prozent: number;
  gueltig_ab: string;
  aktiv: boolean;
  notiz: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
}

/**
 * Entspricht einer Zeile in public.holz_mengenrabatt.
 * sortiment_id = null -> gilt fuer alle Varianten
 * einheit      = null -> gilt fuer alle Einheiten
 */
export interface Mengenrabatt {
  id: string;
  owner_user_id: string;
  firma_id: string | null;
  sortiment_id: string | null;
  einheit: HolzEinheit | null;
  ab_menge: number;
  rabatt_prozent: number;
  aktiv: boolean;
  notiz: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
}

export interface PreisEntwurf {
  einheit: HolzEinheit;
  preis_netto: number;
  steuersatz_prozent: number;
  aktiv?: boolean;
  notiz?: string | null;
}

export interface RabattEntwurf {
  sortiment_id: string | null;
  einheit: HolzEinheit | null;
  ab_menge: number;
  rabatt_prozent: number;
  aktiv?: boolean;
  notiz?: string | null;
}

// ----------------------------------------------------------------------------
// 3. GELD
// ----------------------------------------------------------------------------

/** Auf Cent runden. Jeder Geldbetrag laeuft hier durch. */
export function cent(betrag: number): number {
  return runde(betrag, 2);
}

/** z. B. "760,00 €" */
export function eur(betrag: number): string {
  if (!Number.isFinite(betrag)) return '—';
  return `${formatZahl(betrag, 2)} €`;
}

/** z. B. "95,00 €/SRM" */
export function eurJeEinheit(betrag: number, einheit: HolzEinheit): string {
  return `${eur(betrag)}/${einheitKurz(einheit)}`;
}

// ----------------------------------------------------------------------------
// 4. PREIS FINDEN
// ----------------------------------------------------------------------------

/** Der aktive Preis einer Variante in einer Einheit. */
export function findePreis(
  preise: readonly Preis[],
  sortimentId: string,
  einheit: HolzEinheit,
): Preis | undefined {
  return preise.find((p) => p.aktiv && p.sortiment_id === sortimentId && p.einheit === einheit);
}

/** In welchen Einheiten ist diese Variante ueberhaupt verkaufbar? */
export function bepreisteEinheiten(
  preise: readonly Preis[],
  sortimentId: string,
): HolzEinheit[] {
  return EINHEITEN
    .map((e) => e.wert)
    .filter((e) => findePreis(preise, sortimentId, e) !== undefined);
}

/** Hat die Variante mindestens einen Preis? Sonst taugt sie nicht fuer C4. */
export function istVerkaufsfertig(preise: readonly Preis[], sortimentId: string): boolean {
  return bepreisteEinheiten(preise, sortimentId).length > 0;
}

// ----------------------------------------------------------------------------
// 5. PREIS-VORSCHLAG AUS DER UMRECHNUNG
// ----------------------------------------------------------------------------

/**
 * Leitet aus einem bekannten Preis den Preis fuer eine andere Einheit ab.
 *
 * Denkweise: Was kostet 1 Zieleinheit?
 *   1 FM entspricht 2,5 SRM  ->  Preis je FM = Preis je SRM * 2,5
 * Deshalb wird die MENGE von Ziel nach Basis umgerechnet, nicht umgekehrt.
 *
 * Rueckgabe null, wenn keine sinnvolle Ableitung moeglich ist.
 */
export function preisVorschlag(
  basisPreisNetto: number,
  basisEinheit: HolzEinheit,
  zielEinheit: HolzEinheit,
  sortiment: Pick<Sortiment, 'holzart' | 'scheitlaenge_cm'>,
): number | null {
  if (!Number.isFinite(basisPreisNetto) || basisPreisNetto < 0) return null;
  if (basisEinheit === zielEinheit) return cent(basisPreisNetto);
  try {
    const basisProZiel = umrechnen(1, zielEinheit, basisEinheit, {
      holzart: sortiment.holzart,
      scheitlaenge: sortiment.scheitlaenge_cm,
    });
    if (!Number.isFinite(basisProZiel) || basisProZiel <= 0) return null;
    return cent(basisPreisNetto * basisProZiel);
  } catch {
    return null;
  }
}

/** Vorschlaege fuer alle vier Einheiten auf einmal (fuer die UI). */
export function alleVorschlaege(
  basisPreisNetto: number,
  basisEinheit: HolzEinheit,
  sortiment: Pick<Sortiment, 'holzart' | 'scheitlaenge_cm'>,
): Record<HolzEinheit, number | null> {
  const raus = {} as Record<HolzEinheit, number | null>;
  for (const e of EINHEITEN) {
    raus[e.wert] = preisVorschlag(basisPreisNetto, basisEinheit, e.wert, sortiment);
  }
  return raus;
}

// ----------------------------------------------------------------------------
// 6. MENGENRABATT
// ----------------------------------------------------------------------------

/**
 * Wie genau passt diese Staffel auf den Fall?
 *   3 = genau diese Variante UND diese Einheit
 *   2 = diese Variante, alle Einheiten
 *   1 = alle Varianten, diese Einheit
 *   0 = global
 *  -1 = passt nicht
 */
function spezifitaet(r: Mengenrabatt, sortimentId: string, einheit: HolzEinheit): number {
  const sortPasst = r.sortiment_id === null || r.sortiment_id === sortimentId;
  const einhPasst = r.einheit === null || r.einheit === einheit;
  if (!sortPasst || !einhPasst) return -1;
  if (r.sortiment_id !== null && r.einheit !== null) return 3;
  if (r.sortiment_id !== null) return 2;
  if (r.einheit !== null) return 1;
  return 0;
}

/**
 * Findet die anzuwendende Rabattstaffel.
 *
 * Regel: Die SPEZIFISCHSTE Staffel gewinnt. Innerhalb derselben Spezifitaet
 * gewinnt die hoechste erreichte Schwelle. Kein Aufaddieren, kein Raten.
 *
 * Beispiel: "ab 5 SRM = 3 %" und "ab 10 SRM = 5 %" -> bei 12 SRM greift 5 %.
 */
export function findeRabatt(
  rabatte: readonly Mengenrabatt[],
  sortimentId: string,
  einheit: HolzEinheit,
  menge: number,
): Mengenrabatt | null {
  if (!Number.isFinite(menge) || menge <= 0) return null;

  const kandidaten = rabatte
    .filter((r) => r.aktiv && menge >= r.ab_menge)
    .map((r) => ({ r, s: spezifitaet(r, sortimentId, einheit) }))
    .filter((x) => x.s >= 0);

  if (kandidaten.length === 0) return null;

  const maxS = Math.max(...kandidaten.map((x) => x.s));
  const engste = kandidaten.filter((x) => x.s === maxS).map((x) => x.r);

  return engste.reduce((a, b) => (b.ab_menge > a.ab_menge ? b : a));
}

/** Alle Staffeln einer Variante, aufsteigend — fuer die Anzeige. */
export function staffelFuerVariante(
  rabatte: readonly Mengenrabatt[],
  sortimentId: string,
  einheit: HolzEinheit,
): Mengenrabatt[] {
  return rabatte
    .filter((r) => r.aktiv && spezifitaet(r, sortimentId, einheit) >= 0)
    .sort((a, b) => a.ab_menge - b.ab_menge);
}

// ----------------------------------------------------------------------------
// 7. BERECHNUNG EINER POSITION
// ----------------------------------------------------------------------------

export interface PositionsErgebnis {
  ok: boolean;
  fehler: string[];
  hinweise: string[];

  menge: number;
  einheit: HolzEinheit;
  einzelpreisNetto: number;

  /** menge × einzelpreis, vor Rabatt */
  grundNetto: number;
  rabattProzent: number;
  rabattBetrag: number;
  /** grundNetto − rabattBetrag */
  netto: number;

  steuersatzProzent: number;
  steuerBetrag: number;
  brutto: number;
}

/** Ein leeres Ergebnis, wenn nichts gerechnet werden kann. */
function leeresErgebnis(
  menge: number,
  einheit: HolzEinheit,
  fehler: string[],
): PositionsErgebnis {
  return {
    ok: false, fehler, hinweise: [],
    menge, einheit, einzelpreisNetto: 0,
    grundNetto: 0, rabattProzent: 0, rabattBetrag: 0, netto: 0,
    steuersatzProzent: 0, steuerBetrag: 0, brutto: 0,
  };
}

/**
 * Rechnet eine Brennholz-Position durch: Menge × Preis, Rabatt, Steuer.
 * Jeder Zwischenschritt wird auf Cent gerundet, damit die Summe auf dem Beleg
 * exakt der Zeile entspricht — sonst weicht die Rechnung um Cents ab.
 */
export function berechnePosition(
  menge: number,
  einheit: HolzEinheit,
  sortimentId: string,
  preise: readonly Preis[],
  rabatte: readonly Mengenrabatt[] = [],
): PositionsErgebnis {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  if (!Number.isFinite(menge) || menge <= 0) {
    fehler.push('Bitte eine Menge größer als 0 angeben.');
  }

  const preis = findePreis(preise, sortimentId, einheit);
  if (!preis) {
    fehler.push(`Für diese Variante ist kein Preis in ${einheitKurz(einheit)} hinterlegt.`);
  }

  if (fehler.length > 0 || !preis) return leeresErgebnis(menge, einheit, fehler);

  const einzelpreisNetto = cent(preis.preis_netto);
  const grundNetto = cent(menge * einzelpreisNetto);

  const rabatt = findeRabatt(rabatte, sortimentId, einheit, menge);
  const rabattProzent = rabatt ? rabatt.rabatt_prozent : 0;
  const rabattBetrag = cent(grundNetto * (rabattProzent / 100));
  const netto = cent(grundNetto - rabattBetrag);

  const steuersatzProzent = preis.steuersatz_prozent;
  const steuerBetrag = cent(netto * (steuersatzProzent / 100));
  const brutto = cent(netto + steuerBetrag);

  if (rabatt) {
    hinweise.push(
      `Mengenrabatt ${formatZahl(rabattProzent, 0)} % ab ` +
        `${formatZahl(rabatt.ab_menge, 2)} ${einheitKurz(einheit)} angewendet.`,
    );
  }
  if (einzelpreisNetto === 0) {
    hinweise.push('Der hinterlegte Preis ist 0 € — bitte prüfen.');
  }

  return {
    ok: true, fehler, hinweise,
    menge, einheit, einzelpreisNetto,
    grundNetto, rabattProzent, rabattBetrag, netto,
    steuersatzProzent, steuerBetrag, brutto,
  };
}

// ----------------------------------------------------------------------------
// 8. SUMMEN — nach Steuersatz getrennt
// ----------------------------------------------------------------------------

export interface SteuerGruppe {
  steuersatzProzent: number;
  netto: number;
  steuerBetrag: number;
  brutto: number;
}

export interface GesamtSumme {
  netto: number;
  steuerBetrag: number;
  brutto: number;
  /** Aufteilung fuer den Steuerausweis auf der Rechnung. */
  gruppen: SteuerGruppe[];
}

/**
 * Summiert Positionen und schluesselt nach Steuersatz auf.
 * Das ist die Grundlage fuer den Steuerausweis — eine Rechnung mit 7 % Holz
 * und 19 % Anfahrt braucht zwei Zeilen, nicht eine gemittelte.
 */
export function summiere(positionen: readonly PositionsErgebnis[]): GesamtSumme {
  const gueltig = positionen.filter((p) => p.ok);
  const nachSatz = new Map<number, SteuerGruppe>();

  for (const p of gueltig) {
    const g = nachSatz.get(p.steuersatzProzent) ?? {
      steuersatzProzent: p.steuersatzProzent, netto: 0, steuerBetrag: 0, brutto: 0,
    };
    g.netto = cent(g.netto + p.netto);
    g.steuerBetrag = cent(g.steuerBetrag + p.steuerBetrag);
    g.brutto = cent(g.brutto + p.brutto);
    nachSatz.set(p.steuersatzProzent, g);
  }

  const gruppen = [...nachSatz.values()].sort((a, b) => a.steuersatzProzent - b.steuersatzProzent);

  return {
    netto: cent(gruppen.reduce((s, g) => s + g.netto, 0)),
    steuerBetrag: cent(gruppen.reduce((s, g) => s + g.steuerBetrag, 0)),
    brutto: cent(gruppen.reduce((s, g) => s + g.brutto, 0)),
    gruppen,
  };
}

// ----------------------------------------------------------------------------
// 9. KLARTEXT — fuer C4, KiKlartext und PDF
// ----------------------------------------------------------------------------

/**
 * Der Satz, den Schäfer dem Interessenten schickt.
 * Beispiel:
 *   "8 SRM Buche 33 cm, lufttrocken · 95,00 €/SRM · 5 % Mengenrabatt
 *    → 722,00 € netto · 772,54 € brutto (7 % USt.)"
 */
export function positionKlartext(
  e: PositionsErgebnis,
  sortiment: Pick<Sortiment, 'holzart' | 'scheitlaenge_cm' | 'trocknungsgrad'>,
): string {
  if (!e.ok) return e.fehler.join(' ');

  const ware = sortimentBezeichnungPdf(sortiment.holzart, sortiment.scheitlaenge_cm, sortiment.trocknungsgrad);
  const teile = [
    `${formatZahl(e.menge, 2)} ${einheitKurz(e.einheit)} ${ware}`,
    eurJeEinheit(e.einzelpreisNetto, e.einheit),
  ];
  if (e.rabattProzent > 0) {
    teile.push(`${formatZahl(e.rabattProzent, 0)} % Mengenrabatt (−${eur(e.rabattBetrag)})`);
  }
  return (
    teile.join(' · ') +
    ` → ${eur(e.netto)} netto · ${eur(e.brutto)} brutto (${formatZahl(e.steuersatzProzent, 0)} % USt.)`
  );
}

/** Der Steuerausweis als Textzeilen, z. B. für ein PDF. */
export function steuerAusweisZeilen(s: GesamtSumme): string[] {
  return s.gruppen.map(
    (g) => `zzgl. ${formatZahl(g.steuersatzProzent, 0)} % USt. auf ${eur(g.netto)}: ${eur(g.steuerBetrag)}`,
  );
}

// ----------------------------------------------------------------------------
// 10. PRUEFUNG DER STAMMDATEN
// ----------------------------------------------------------------------------

export function pruefePreis(e: PreisEntwurf): PruefErgebnis {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  if (!EINHEITEN.some((x) => x.wert === e.einheit)) {
    fehler.push('Bitte eine Einheit auswählen.');
  }
  if (!Number.isFinite(e.preis_netto)) {
    fehler.push('Bitte einen gültigen Preis eingeben.');
  } else if (e.preis_netto < 0) {
    fehler.push('Der Preis darf nicht negativ sein.');
  } else if (e.preis_netto === 0) {
    hinweise.push('Preis 0 € — die Variante wäre kostenlos. Absicht?');
  }

  if (!Number.isFinite(e.steuersatz_prozent) || e.steuersatz_prozent < 0 || e.steuersatz_prozent > 100) {
    fehler.push('Der Steuersatz muss zwischen 0 und 100 % liegen.');
  } else if (
    e.steuersatz_prozent !== STANDARD_STEUERSATZ_BRENNHOLZ &&
    e.steuersatz_prozent !== STANDARD_STEUERSATZ_REGEL &&
    e.steuersatz_prozent !== 0
  ) {
    hinweise.push(`Ungewöhnlicher Steuersatz (${formatZahl(e.steuersatz_prozent, 1)} %) — bitte prüfen.`);
  }

  return { ok: fehler.length === 0, fehler, hinweise };
}

export function pruefeRabatt(e: RabattEntwurf, vorhandene: readonly Mengenrabatt[] = []): PruefErgebnis {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  if (!Number.isFinite(e.ab_menge) || e.ab_menge <= 0) {
    fehler.push('Die Schwelle „ab Menge" muss größer als 0 sein.');
  }
  if (!Number.isFinite(e.rabatt_prozent) || e.rabatt_prozent <= 0 || e.rabatt_prozent > 100) {
    fehler.push('Der Rabatt muss zwischen 0 und 100 % liegen.');
  } else if (e.rabatt_prozent > 30) {
    hinweise.push(`${formatZahl(e.rabatt_prozent, 0)} % Rabatt ist ungewöhnlich hoch — bitte prüfen.`);
  }

  const doppelt = vorhandene.some(
    (r) => r.aktiv && r.sortiment_id === e.sortiment_id && r.einheit === e.einheit && r.ab_menge === e.ab_menge,
  );
  if (doppelt) fehler.push('Für diese Schwelle existiert bereits eine Staffel.');

  return { ok: fehler.length === 0, fehler, hinweise };
}
