// ============================================================================
// ARGONAUT OS · auftragLogik.ts
// Block 1 · A4-2 — Der Brennholz-Auftrag
//
// Reine Funktionen. Kein DB-Zugriff, kein React.
//
// DIE BRÜCKE
//   Sortiment + Preis + Rabatt  ─┐
//                                ├─► Position[] ─► positionsLogik ─► Summe
//   Anfahrt (Meter + Staffel)   ─┘
//
//   Diese Datei rechnet nicht selbst. Sie baut Positionen und übergibt sie an
//   das universelle Rechenwerk. Eine Rechenstelle, vier Verwender.
//
// ⚠️ PREISE WERDEN EINGEFROREN
//   Bestellt der Kunde heute 8 SRM zu 95 EUR/SRM und ändert der Betrieb morgen
//   den Preis auf 99 EUR — der Auftrag von gestern muss weiter 95 EUR zeigen.
//
//   Deshalb trägt jede Position ihren Preis SELBST. Sie verweist nicht auf die
//   Preisliste, sie hat ihn abgeschrieben. Das ist GoBD-relevant und der
//   häufigste Anfängerfehler bei Auftragssystemen.
//
//   `preisAbweichung()` zeigt später, dass sich der Listenpreis geändert hat —
//   ohne den Auftrag anzufassen.
//
// ⚠️ RESTFEUCHTE GEHÖRT AN DEN AUFTRAG
//   Sie wird beim Kunden gemessen. Ein Messprotokoll DIESER Lieferung, kein
//   Stammdatum. Beim nächsten Auftrag wird neu gemessen.
// ============================================================================

import { einheitKurz, formatZahl, type HolzEinheit } from './holzLogik';
import { sortimentBezeichnungPdf, type Sortiment } from './sortimentLogik';
import {
  findePreis, findeRabatt, bepreisteEinheiten,
  type Preis, type Mengenrabatt,
} from './preisLogik';
import {
  berechneAnfahrt, anfahrtBezeichnung, formatKm,
  type AnfahrtKonfig, type FahrtkostenStufe, type DistanzQuelle, type AnfahrtErgebnis,
} from './anfahrtLogik';
import {
  summiere, nummeriere, eur,
  type Position, type Summe,
} from './positionsLogik';

// ----------------------------------------------------------------------------
// 1. STATUS
// ----------------------------------------------------------------------------

export type AuftragStatus = 'entwurf' | 'bestaetigt' | 'geliefert' | 'abgerechnet' | 'storniert';

export interface StatusInfo {
  wert: AuftragStatus;
  label: string;
  farbe: 'grau' | 'cyan' | 'gruen' | 'gold' | 'rot';
  /** Dürfen Positionen noch geändert werden? */
  bearbeitbar: boolean;
}

export const STATUS_LISTE: readonly StatusInfo[] = [
  { wert: 'entwurf', label: 'Entwurf', farbe: 'grau', bearbeitbar: true },
  { wert: 'bestaetigt', label: 'Bestätigt', farbe: 'cyan', bearbeitbar: true },
  { wert: 'geliefert', label: 'Geliefert', farbe: 'gruen', bearbeitbar: false },
  { wert: 'abgerechnet', label: 'Abgerechnet', farbe: 'gold', bearbeitbar: false },
  { wert: 'storniert', label: 'Storniert', farbe: 'rot', bearbeitbar: false },
];

export function statusInfo(s: string | null | undefined): StatusInfo {
  return STATUS_LISTE.find((x) => x.wert === s) ?? STATUS_LISTE[0];
}

/**
 * Nach dem Abrechnen wird nichts mehr geändert. Ein Beleg, dessen Positionen
 * sich nachträglich ändern lassen, ist kein Beleg.
 */
export function istBearbeitbar(status: string | null | undefined): boolean {
  return statusInfo(status).bearbeitbar;
}

/** Welche Übergänge sind erlaubt? Ohne Rücksprung aus 'abgerechnet'. */
export function erlaubteFolgeStatus(status: string | null | undefined): AuftragStatus[] {
  switch (statusInfo(status).wert) {
    case 'entwurf': return ['bestaetigt', 'storniert'];
    case 'bestaetigt': return ['geliefert', 'entwurf', 'storniert'];
    case 'geliefert': return ['abgerechnet', 'bestaetigt'];
    case 'abgerechnet': return [];
    case 'storniert': return ['entwurf'];
  }
}

// ----------------------------------------------------------------------------
// 2. POSITIONEN BAUEN
// ----------------------------------------------------------------------------

export interface WarenEingabe {
  sortiment: Sortiment;
  menge: number;
  einheit: HolzEinheit;
}

export interface PositionsFehler {
  fehler: string[];
  hinweise: string[];
}

/**
 * Baut eine Warenposition — mit eingefrorenem Preis und Rabatt.
 *
 * Rückgabe `null`, wenn es keinen Preis gibt. Ein Auftrag ohne Preis ist
 * kein Auftrag, sondern ein Missverständnis.
 */
export function warePosition(
  e: WarenEingabe,
  preise: readonly Preis[],
  rabatte: readonly Mengenrabatt[] = [],
): { position: Position | null } & PositionsFehler {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  if (!Number.isFinite(e.menge) || e.menge <= 0) fehler.push('Bitte eine Menge größer als 0 angeben.');

  const preis = findePreis(preise, e.sortiment.id, e.einheit);
  if (!preis) {
    const moeglich = bepreisteEinheiten(preise, e.sortiment.id);
    fehler.push(
      `Für diese Variante ist kein Preis in ${einheitKurz(e.einheit)} hinterlegt.` +
      (moeglich.length > 0 ? ` Verfügbar: ${moeglich.map(einheitKurz).join(', ')}.` : ''),
    );
  }

  if (!e.sortiment.aktiv) hinweise.push('Diese Variante ist derzeit nicht im Verkauf.');

  if (fehler.length > 0 || !preis) return { position: null, fehler, hinweise };

  const rabatt = findeRabatt(rabatte, e.sortiment.id, e.einheit, e.menge);
  if (rabatt) {
    hinweise.push(
      `Mengenrabatt ${formatZahl(rabatt.rabatt_prozent, 0)} % ab ` +
      `${formatZahl(rabatt.ab_menge, 2)} ${einheitKurz(e.einheit)} angewendet.`,
    );
  }

  const s = e.sortiment;
  return {
    position: {
      art: 'sortiment',
      quelle_id: s.id,
      bezeichnung: sortimentBezeichnungPdf(s.holzart, s.scheitlaenge_cm, s.trocknungsgrad),
      detail: s.restfeuchte_prozent != null
        ? `Restfeuchte laut Stammdaten: ${formatZahl(s.restfeuchte_prozent, 1)} %`
        : null,
      menge: e.menge,
      einheit: einheitKurz(e.einheit),
      // ⚠️ Abgeschrieben, nicht verwiesen.
      einzelpreis_netto: preis.preis_netto,
      steuersatz_prozent: preis.steuersatz_prozent,
      rabatt_prozent: rabatt ? rabatt.rabatt_prozent : null,
    },
    fehler,
    hinweise,
  };
}

/**
 * Baut die Anfahrtsposition aus Entfernung und Fahrtkosten-Staffel.
 *
 * Rückgabe `null` heißt nicht "Fehler", sondern eines von dreien:
 *   - Fahrtkosten sind ausgeschaltet
 *   - die Entfernung liegt in der Freigrenze
 *   - es wurde keine Entfernung übergeben
 */
export function anfahrtPosition(
  distanzMeter: number | null,
  distanzQuelle: DistanzQuelle,
  konfig: AnfahrtKonfig | null,
  stufen: readonly FahrtkostenStufe[] = [],
): { position: Position | null; ergebnis: AnfahrtErgebnis | null } & PositionsFehler {
  if (distanzMeter === null || distanzMeter === undefined) {
    return { position: null, ergebnis: null, fehler: [], hinweise: [] };
  }

  const e = berechneAnfahrt(distanzMeter, distanzQuelle, konfig, stufen);

  if (e.deaktiviert) return { position: null, ergebnis: e, fehler: [], hinweise: [] };
  if (!e.ok) return { position: null, ergebnis: e, fehler: e.fehler, hinweise: e.hinweise };
  if (e.imFreibereich || e.betragNetto <= 0) {
    return { position: null, ergebnis: e, fehler: [], hinweise: e.hinweise };
  }

  return {
    position: {
      art: 'anfahrt',
      bezeichnung: anfahrtBezeichnung(e),
      detail: e.geschaetzt ? 'Entfernung geschätzt (Luftlinie)' : null,
      menge: 1,
      einheit: 'pausch.',
      einzelpreis_netto: e.betragNetto,
      steuersatz_prozent: e.steuersatzProzent,
      rabatt_prozent: null,
    },
    ergebnis: e,
    fehler: [],
    hinweise: e.hinweise,
  };
}

// ----------------------------------------------------------------------------
// 3. DER GANZE AUFTRAG
// ----------------------------------------------------------------------------

export interface AuftragEingabe {
  waren: readonly WarenEingabe[];
  preise: readonly Preis[];
  rabatte?: readonly Mengenrabatt[];

  distanzMeter?: number | null;
  distanzQuelle?: DistanzQuelle;
  konfig?: AnfahrtKonfig | null;
  stufen?: readonly FahrtkostenStufe[];

  /** Zusätzliche Zeilen: Schichten, Feuchtemessung, Freitext. */
  zusatz?: readonly Position[];
}

export interface AuftragBefund {
  positionen: Position[];
  summe: Summe;
  anfahrt: AnfahrtErgebnis | null;
  geschaetzt: boolean;
  fehler: string[];
  hinweise: string[];
  ok: boolean;
}

export function baueAuftrag(e: AuftragEingabe): AuftragBefund {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  const positionen: Position[] = [];

  for (const w of e.waren) {
    const r = warePosition(w, e.preise, e.rabatte ?? []);
    fehler.push(...r.fehler);
    hinweise.push(...r.hinweise);
    if (r.position) positionen.push(r.position);
  }

  for (const z of e.zusatz ?? []) positionen.push(z);

  const a = anfahrtPosition(
    e.distanzMeter ?? null,
    e.distanzQuelle ?? 'route',
    e.konfig ?? null,
    e.stufen ?? [],
  );
  fehler.push(...a.fehler);
  hinweise.push(...a.hinweise);
  if (a.position) positionen.push(a.position);

  const nummeriert = nummeriere(positionen);
  const summe = summiere(nummeriert);

  fehler.push(...summe.fehler);
  hinweise.push(...summe.hinweise);

  if (nummeriert.length === 0) fehler.push('Der Auftrag hat keine Positionen.');

  return {
    positionen: nummeriert,
    summe,
    anfahrt: a.ergebnis,
    geschaetzt: a.ergebnis?.geschaetzt ?? false,
    fehler,
    hinweise,
    ok: fehler.length === 0 && summe.ok,
  };
}

// ----------------------------------------------------------------------------
// 4. DER WÄCHTER: hat sich der Listenpreis geändert?
// ----------------------------------------------------------------------------

export interface Abweichung {
  position: Position;
  preisImAuftrag: number;
  preisInListe: number;
  differenz: number;
  text: string;
}

/**
 * Vergleicht die eingefrorenen Preise eines Auftrags mit der heutigen
 * Preisliste.
 *
 * Das ist KEIN Fehler. Ein alter Auftrag darf einen alten Preis haben — er
 * MUSS es sogar. Aber wer ihn öffnet, soll es sehen, statt sich zu wundern.
 *
 * Ändert nichts. Sagt nur, was ist.
 */
export function preisAbweichung(
  positionen: readonly Position[],
  preise: readonly Preis[],
): Abweichung[] {
  const raus: Abweichung[] = [];

  for (const p of positionen) {
    if (p.art !== 'sortiment' || !p.quelle_id) continue;

    // Die Einheit steht als Kurzform in der Position: "SRM" -> 'srm'
    const einheit = p.einheit.toLowerCase() as HolzEinheit;
    const aktuell = findePreis(preise, p.quelle_id, einheit);
    if (!aktuell) continue;

    const diff = Math.round((aktuell.preis_netto - p.einzelpreis_netto) * 100) / 100;
    if (diff === 0) continue;

    raus.push({
      position: p,
      preisImAuftrag: p.einzelpreis_netto,
      preisInListe: aktuell.preis_netto,
      differenz: diff,
      text:
        `„${p.bezeichnung}": im Auftrag ${eur(p.einzelpreis_netto)}, ` +
        `in der Preisliste heute ${eur(aktuell.preis_netto)} ` +
        `(${diff > 0 ? '+' : ''}${eur(diff)}). Der Auftrag bleibt unverändert.`,
    });
  }

  return raus;
}

// ----------------------------------------------------------------------------
// 5. KLARTEXT
// ----------------------------------------------------------------------------

/** Eine Zeile für Listen: "BH-2026-0001 · Anna Weber · 832,04 € · Geliefert" */
export function auftragKurz(
  nummer: string | null,
  empfaenger: string | null,
  summe: Summe,
  status: string | null,
): string {
  return [
    nummer ?? 'ohne Nummer',
    empfaenger ?? 'ohne Empfänger',
    eur(summe.brutto),
    statusInfo(status).label,
  ].join(' · ');
}

/** Der Anfahrts-Zusatz für den Beleg. */
export function anfahrtHinweis(a: AnfahrtErgebnis | null): string | null {
  if (!a || a.deaktiviert) return null;
  if (a.imFreibereich) {
    return `Anlieferung ${formatKm(a.distanz.kmAbgerechnet, 0)}: innerhalb der Freigrenze, kostenfrei.`;
  }
  if (a.geschaetzt) {
    return 'Die Entfernung ist ein Schätzwert. Der endgültige Anfahrtsbetrag kann geringfügig abweichen.';
  }
  return null;
}

/** Restfeuchte-Zeile für den Lieferschein. */
export function feuchteProtokoll(prozent: number | null, gemessenAm: string | null): string | null {
  if (prozent === null || prozent === undefined) return null;
  const datum = gemessenAm ? new Date(gemessenAm) : null;
  const wann = datum && Number.isFinite(datum.getTime())
    ? ` am ${datum.toLocaleDateString('de-DE')}`
    : '';
  return `Restfeuchte bei Lieferung gemessen${wann}: ${formatZahl(prozent, 1)} %`;
}
