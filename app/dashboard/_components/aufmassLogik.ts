// ============================================================================
// ARGONAUT OS · Phase 2 · Modul E · Baustein "Aufmaß-Logik"
// Reine Logik — KEINE UI, KEINE externen Abhängigkeiten außer steuerLogik.
// Rechnet Positions- und Gesamtsummen eines Aufmaßes, formatiert Mengen sauber
// und liefert die zentralen Einheiten + Status-Definitionen.
// Generisch: Bau, GaLaBau, Maler, Dachdecker, Zaunbau, Umzug, Erdbau, Forst.
//
// E1 — Vier Korrekturen:
//
//   (1) `mitMwSt()` rechnete FEST 19 %. Auf einem Aufmaßblatt mit Brennholz (7 %)
//       stand damit ein falscher Steuerbetrag — und das Blatt geht an den Kunden.
//       Ersetzt durch steuerGruppen(): je Steuersatz auf die Gruppensumme,
//       § 14 Abs. 4 Nr. 7 + 8 UStG. Jede Position trägt ihren eigenen Satz.
//
//   (2) EINHEITEN war eine geschlossene Auswahlliste ohne `Srm` und `Rm` —
//       Schäfers gesamtes Brennholzgeschäft rechnet in Schüttraummetern.
//       Die Liste ist jetzt ein Vorschlag, kein Zaun. Die DB-Spalte hat
//       ohnehin keinen CHECK.
//
//   (3) `'pauschal'` stand als EINHEIT in der Liste ("1 pauschal × 500 €").
//       Eine Pauschale ist keine Einheit. Sie hat ein eigenes Feld und gewinnt.
//
//   (4) `rechneMenge()`: niemand misst "47,31 m²". Man misst 8,20 × 5,77.
//       Der Rechenweg bleibt erhalten — in zwei Jahren fragt jemand, woher die
//       Zahl kam, und dann steht sie da.
// ============================================================================

import { steuerGruppen, cent, satzText, type SteuerGruppe, type SteuerPosten } from './steuerLogik';
import { nachMinuten, minutenZuStunden, istMengenLeistung, type KatalogEintrag } from './leistungLogik';

// --- Einheiten (Vorschlagsliste, KEINE Beschränkung) -------------------------
// Die Spalte `aufmass_positionen.einheit` ist freier Text ohne CHECK. Diese Liste
// füllt nur das Vorschlagsfeld. Jeder Betrieb darf seine eigene Einheit tippen.
export const EINHEITEN = [
  'm²', 'lfm', 'm³', 'Stück', 'ha', 'fm', 'Srm', 'Rm', 'Std', 'kg', 't', 'Psch',
] as const;
export type Einheit = typeof EINHEITEN[number];

/** Einheiten, bei denen ein Zwischenrechner sinnvoll ist. */
export const EINHEITEN_FLAECHE = ['m²'] as const;
export const EINHEITEN_VOLUMEN = ['m³', 'Srm', 'Rm', 'fm'] as const;

// --- Status -----------------------------------------------------------------
export type AufmassStatus = 'entwurf' | 'fertig' | 'abgerechnet';

export interface StatusDef {
  wert: AufmassStatus;
  label: string;
  farbe: string;
}
export const STATUS_LISTE: StatusDef[] = [
  { wert: 'entwurf',     label: 'Entwurf',     farbe: '#8FA3BE' },
  { wert: 'fertig',      label: 'Fertig',      farbe: '#4CAF7D' },
  { wert: 'abgerechnet', label: 'Abgerechnet', farbe: '#C9A84C' },
];
export function statusDef(status: string | null | undefined): StatusDef {
  return STATUS_LISTE.find((s) => s.wert === status) ?? STATUS_LISTE[0];
}

/**
 * Ab `abgerechnet` sind die Positionen gesperrt.
 * Eine abgerechnete Menge nachträglich zu ändern, ohne die Rechnung zu ändern,
 * ist genau der Vorgang, den die GoBD verhindern soll.
 */
export function istGesperrt(status: string | null | undefined): boolean {
  return status === 'abgerechnet';
}

// --- Datentyp: schlank, passt auf DB-Zeilen ---------------------------------
export interface PositionBasis {
  bezeichnung?: string | null;
  menge?: number | null;
  einheit?: string | null;
  einzelpreis_netto?: number | null;
  /** Pauschale. Wenn gesetzt, gewinnt sie gegen menge × einzelpreis. */
  festpreis_netto?: number | null;
  /** Steuersatz der Position in Prozent. Fehlt er, gelten 19 %. */
  mwst_satz?: number | null;
  /** Wie die Menge zustande kam: "8,20 × 5,77". */
  rechenweg?: string | null;
  /** Herkunft aus dem Leistungskatalog. Schnappschuss, kein Verweis. */
  leistung_id?: string | null;
}

// --- Zahlen-/Mengen-Formatierung --------------------------------------------

/**
 * Liest eine Zahl tolerant.
 * "8,20" -> 8.2 · "1.234,50" -> 1234.5 (Punkt als Tausender) · "8.2" -> 8.2
 */
export function zahl(eingabe: string | number | null | undefined): number {
  if (typeof eingabe === 'number') return Number.isFinite(eingabe) ? eingabe : NaN;
  if (typeof eingabe !== 'string') return NaN;
  let s = eingabe.trim().replace(/\s+/g, '');
  if (s === '') return NaN;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, ''); // Punkt = Tausender
  s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Menge sauber: 12,5 statt 12.500; bis 3 Nachkommastellen, ohne Nullen. */
export function mengeText(menge: number | null | undefined, einheit?: string | null): string {
  const m = typeof menge === 'number' && Number.isFinite(menge) ? menge : 0;
  const txt = m.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return einheit ? `${txt} ${einheit}` : txt;
}

/** Euro-Format. */
export function eur(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/** Steuersatz für die Anzeige. Aus steuerLogik durchgereicht. */
export { satzText };

// --- Zwischenrechner ---------------------------------------------------------

export interface MengeErgebnis {
  /** Auf 3 Nachkommastellen gerundet. Null, wenn die Eingabe unverständlich ist. */
  menge: number | null;
  /** Normalisiert: "8,20 × 5,77". Null, wenn eine reine Zahl eingegeben wurde. */
  rechenweg: string | null;
  fehler: string | null;
}

/**
 * Rechnet eine Aufmaß-Eingabe aus.
 *
 *   "47,31"                  -> 47,31            (keine Formel)
 *   "8,20 x 5,77"            -> 47,314           Rechenweg "8,20 × 5,77"
 *   "2,50 * 1,80 * 4"        -> 18               Rechenweg "2,50 × 1,80 × 4"
 *   "8,20 x 5,77 + 3,5"      -> 50,814           Summe von Produkten
 *   "12 - 1,5"               -> 10,5
 *
 * Bewusst KEIN eval: nur Zahlen, ×, *, x, +, −. Alles andere ist ein Fehler,
 * kein stiller Nullwert.
 */
export function rechneMenge(eingabe: string | null | undefined): MengeErgebnis {
  const roh = (eingabe ?? '').trim();
  if (roh === '') return { menge: null, rechenweg: null, fehler: 'Bitte eine Menge eingeben.' };

  // Reine Zahl?
  const einfach = zahl(roh);
  if (!Number.isNaN(einfach) && !/[x×*+\-]/i.test(roh.slice(1))) {
    return { menge: runde3(einfach), rechenweg: null, fehler: null };
  }

  if (!/^[0-9.,\s+\-x×*]+$/i.test(roh)) {
    return { menge: null, rechenweg: null, fehler: 'Erlaubt sind nur Zahlen und die Zeichen × * x + −' };
  }

  // In Summanden zerlegen (Vorzeichen behalten)
  const teile = roh.split(/(?=[+\-])/).map((t) => t.trim()).filter(Boolean);
  let summe = 0;
  const wegTeile: string[] = [];

  for (const teil of teile) {
    let vorzeichen = 1;
    let rest = teil;
    if (rest.startsWith('+')) rest = rest.slice(1);
    else if (rest.startsWith('-')) { vorzeichen = -1; rest = rest.slice(1); }

    const faktoren = rest.split(/[x×*]/i).map((f) => f.trim()).filter(Boolean);
    if (faktoren.length === 0) return { menge: null, rechenweg: null, fehler: 'Unvollständige Rechnung.' };

    let produkt = 1;
    const faktorTexte: string[] = [];
    for (const f of faktoren) {
      const n = zahl(f);
      if (Number.isNaN(n)) return { menge: null, rechenweg: null, fehler: `"${f}" ist keine Zahl.` };
      produkt *= n;
      faktorTexte.push(f.replace('.', ','));
    }
    summe += vorzeichen * produkt;
    wegTeile.push((wegTeile.length === 0 ? '' : vorzeichen < 0 ? '− ' : '+ ') + faktorTexte.join(' × '));
  }

  return { menge: runde3(summe), rechenweg: wegTeile.join(' '), fehler: null };
}

function runde3(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const vz = n < 0 ? -1 : 1;
  return (vz * Math.round((Math.abs(n) + Number.EPSILON) * 1000)) / 1000;
}

// --- Betrag je Position -----------------------------------------------------

/**
 * Betrag einer Position (netto), oder null wenn nicht kalkulierbar.
 *   1. Pauschale gesetzt -> genau dieser Betrag. Die Menge wird NICHT multipliziert.
 *   2. Sonst menge × einzelpreis.
 *   3. Kein Preis -> null. Ehrlich, kein stiller 0,00-€-Posten.
 */
export function positionsBetrag(p: PositionBasis): number | null {
  if (p.festpreis_netto != null && p.festpreis_netto >= 0) return cent(p.festpreis_netto);
  const preis = p.einzelpreis_netto;
  if (preis == null || preis < 0) return null;
  const menge = typeof p.menge === 'number' && p.menge >= 0 ? p.menge : 0;
  return cent(menge * preis);
}

/** Steuersatz der Position. Fehlt er, gelten 19 % — das ist der DB-Default. */
export function positionsSteuersatz(p: PositionBasis): number {
  const s = p.mwst_satz;
  return typeof s === 'number' && Number.isFinite(s) ? s : 19;
}

// --- Gesamtsumme ------------------------------------------------------------

export interface MengeJeEinheit {
  einheit: string;
  menge: number;
  anzahl: number;   // wie viele Positionen dieser Einheit
}

export interface AufmassSumme {
  netto: number;
  steuer: number;
  brutto: number;
  /** Aufschlüsselung nach Steuersätzen — genau das, was aufs Blatt gehört. */
  gruppen: SteuerGruppe[];
  /** Mindestens eine Position hat keinen Preis. Die Summe ist dann zu niedrig. */
  betragUnvollstaendig: boolean;
  /** Bezeichnungen der Positionen ohne Preis. */
  ohnePreis: string[];
  anzahlPositionen: number;
  mengenJeEinheit: MengeJeEinheit[];
}

/**
 * Summiert alle Positionen: Netto, Steuer je Satz, Brutto, Mengen je Einheit.
 * Positionen ohne Preis fließen NICHT als 0,00 € ein — sie werden gemeldet.
 */
export function aufmassSumme(positionen: PositionBasis[]): AufmassSumme {
  const jeEinheit = new Map<string, { menge: number; anzahl: number }>();
  const posten: SteuerPosten[] = [];
  const ohnePreis: string[] = [];

  for (const p of positionen) {
    const einheit = (p.einheit || '—').trim() || '—';
    const menge = typeof p.menge === 'number' && p.menge >= 0 ? p.menge : 0;
    const vorhanden = jeEinheit.get(einheit) ?? { menge: 0, anzahl: 0 };
    vorhanden.menge += menge;
    vorhanden.anzahl += 1;
    jeEinheit.set(einheit, vorhanden);

    const b = positionsBetrag(p);
    if (b == null) ohnePreis.push(p.bezeichnung?.trim() || '(ohne Bezeichnung)');
    else posten.push({ netto: b, satz: positionsSteuersatz(p) });
  }

  const s = steuerGruppen(posten);

  return {
    netto: s.netto,
    steuer: s.steuer,
    brutto: s.brutto,
    gruppen: s.gruppen,
    betragUnvollstaendig: ohnePreis.length > 0,
    ohnePreis,
    anzahlPositionen: positionen.length,
    mengenJeEinheit: Array.from(jeEinheit.entries())
      .map(([einheit, v]) => ({ einheit, menge: runde3(v.menge), anzahl: v.anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl),
  };
}

// --- Katalog -> Aufmaß-Position ---------------------------------------------

/**
 * Übernimmt eine Katalog-Leistung als Aufmaß-Position.
 *
 * Ein Aufmaß kennt keine Arbeitswerte und keine Minuten — es kennt Menge,
 * Einheit, Preis und Steuersatz. Zeit-Leistungen werden deshalb in STUNDEN
 * umgerechnet: "Ölwechsel, 30 Min, 95 €/h" wird zu "0,5 Std × 95,00 €".
 *
 * Alle Werte sind ein SCHNAPPSCHUSS. Ändert der Betrieb später den Katalogpreis,
 * bleibt das alte Aufmaß unverändert. Genau wie bei werkstatt_positionen.
 */
export function katalogNachAufmassPosition(k: KatalogEintrag): PositionBasis {
  const mwst = typeof k.mwst_satz === 'number' ? k.mwst_satz : 19;
  const pauschale = k.festpreis_netto ?? null;

  if (pauschale != null) {
    return {
      bezeichnung: k.bezeichnung ?? '',
      menge: 1,
      einheit: 'Psch',
      einzelpreis_netto: null,
      festpreis_netto: pauschale,
      mwst_satz: mwst,
      leistung_id: k.id ?? null,
      rechenweg: null,
    };
  }

  if (istMengenLeistung(k.erfassungsart)) {
    return {
      bezeichnung: k.bezeichnung ?? '',
      menge: k.standard_wert ?? 1,
      einheit: (k.einheit ?? '').trim() || 'Stück',
      einzelpreis_netto: k.einheitspreis_netto ?? null,
      festpreis_netto: null,
      mwst_satz: mwst,
      leistung_id: k.id ?? null,
      rechenweg: null,
    };
  }

  // Zeit-Leistung: in Stunden umrechnen, Einzelpreis = Stundensatz
  const minuten = nachMinuten(k.standard_wert ?? 1, k.erfassungsart, k.aw_minuten);
  return {
    bezeichnung: k.bezeichnung ?? '',
    menge: cent(minutenZuStunden(minuten)),
    einheit: 'Std',
    einzelpreis_netto: k.stundensatz_netto ?? null,
    festpreis_netto: null,
    mwst_satz: mwst,
    leistung_id: k.id ?? null,
    rechenweg: null,
  };
}
