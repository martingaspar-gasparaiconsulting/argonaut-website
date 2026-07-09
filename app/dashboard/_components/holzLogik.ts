// ============================================================================
// ARGONAUT OS · holzLogik.ts
// Block 2 · Welle 1 · A1 — Holz-Einheiten & konfigurierbare Umrechnung
//
// Reine Funktionen. Kein DB-Zugriff, kein React, keine Seiteneffekte.
// Fundament fuer: A2 Sortiment, A3 Preisliste, A4 Auftrag,
//                 C4 Preisauskunft, F1 Lieferschein.
//
// GRUNDSATZ: Der SRM-Faktor ist KEIN fester Wert. Er haengt von der
// Scheitlaenge ab (kurze Scheite schuetten dichter, lange bruecken mehr Luft)
// und leicht von der Holzart. Deshalb ist die gesamte Umrechnung ueber eine
// Konfiguration steuerbar - nichts ist hart verdrahtet.
//
// DOCK-POINT: Spaeter laedt der Betrieb seine eigenen Faktoren aus der
// Tabelle `holz_umrechnung` (Spalte firma_id) und uebergibt sie als
// `konfig`-Parameter. Ohne Uebergabe greift STANDARD_UMRECHNUNG.
// Bis dahin bleibt der Code unveraendert nutzbar - rein additiv.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. EINHEITEN
// ----------------------------------------------------------------------------

/** Die vier Holz-Mengeneinheiten, mit denen im Brennholzhandel gerechnet wird. */
export type HolzEinheit = 'fm' | 'rm' | 'srm' | 'm3';

export interface EinheitInfo {
  wert: HolzEinheit;
  kurz: string;
  lang: string;
  beschreibung: string;
  /** true = Umrechnung braucht die Scheitlaenge, sonst ist sie ungenau. */
  brauchtScheitlaenge: boolean;
}

/** Metadaten fuer Dropdowns, Tooltips und PDF-Beschriftungen. */
export const EINHEITEN: readonly EinheitInfo[] = [
  {
    wert: 'srm',
    kurz: 'SRM',
    lang: 'Schüttraummeter',
    beschreibung: 'Lose geschüttet, z. B. in Gitterbox oder Kipper. Viel Luft dazwischen.',
    brauchtScheitlaenge: true,
  },
  {
    wert: 'rm',
    kurz: 'RM',
    lang: 'Raummeter (Ster)',
    beschreibung: 'Ordentlich gestapelt, 1 m × 1 m × 1 m. Weniger Luft als geschüttet.',
    brauchtScheitlaenge: true,
  },
  {
    wert: 'fm',
    kurz: 'FM',
    lang: 'Festmeter',
    beschreibung: 'Reine Holzmasse ohne jeden Zwischenraum. Die Bezugsgröße im Forst.',
    brauchtScheitlaenge: false,
  },
  {
    wert: 'm3',
    kurz: 'm³',
    lang: 'Kubikmeter (fest)',
    beschreibung: 'Rechnerisch identisch mit dem Festmeter. Übliche Schreibweise beim Kunden.',
    brauchtScheitlaenge: false,
  },
];

/** Interne Rechenbasis. Alles laeuft ueber den Festmeter. */
const BASIS_EINHEIT: HolzEinheit = 'fm';

// ----------------------------------------------------------------------------
// 2. SCHEITLAENGEN
// ----------------------------------------------------------------------------

export type Scheitlaenge = 25 | 33 | 50 | 100;

export const SCHEITLAENGEN: readonly Scheitlaenge[] = [25, 33, 50, 100];

/** Wird verwendet, wenn keine Scheitlaenge angegeben ist. 33 cm ist Marktstandard. */
export const STANDARD_SCHEITLAENGE: Scheitlaenge = 33;

// ----------------------------------------------------------------------------
// 3. HOLZARTEN
// ----------------------------------------------------------------------------

export type HolzartSchluessel =
  | 'buche'
  | 'eiche'
  | 'esche'
  | 'birke'
  | 'ahorn'
  | 'fichte'
  | 'kiefer'
  | 'laerche'
  | 'douglasie'
  | 'mischholz';

export interface HolzartInfo {
  schluessel: HolzartSchluessel;
  name: string;
  gruppe: 'hart' | 'weich';
}

export const HOLZARTEN: readonly HolzartInfo[] = [
  { schluessel: 'buche', name: 'Buche', gruppe: 'hart' },
  { schluessel: 'eiche', name: 'Eiche', gruppe: 'hart' },
  { schluessel: 'esche', name: 'Esche', gruppe: 'hart' },
  { schluessel: 'birke', name: 'Birke', gruppe: 'hart' },
  { schluessel: 'ahorn', name: 'Ahorn', gruppe: 'hart' },
  { schluessel: 'fichte', name: 'Fichte', gruppe: 'weich' },
  { schluessel: 'kiefer', name: 'Kiefer', gruppe: 'weich' },
  { schluessel: 'laerche', name: 'Lärche', gruppe: 'weich' },
  { schluessel: 'douglasie', name: 'Douglasie', gruppe: 'weich' },
  { schluessel: 'mischholz', name: 'Mischholz', gruppe: 'hart' },
];

/** Standard-Holzart, wenn nichts angegeben wurde. */
export const STANDARD_HOLZART: HolzartSchluessel = 'buche';

// ----------------------------------------------------------------------------
// 4. UMRECHNUNGS-KONFIGURATION
// ----------------------------------------------------------------------------

export interface UmrechnungsKonfig {
  /** Wie viele Festmeter stecken in 1 gestapelten Raummeter? */
  fmProRm: number;
  /** Wie viele Festmeter stecken in 1 Schüttraummeter — je Scheitlänge in cm. */
  fmProSrmNachLaenge: Readonly<Record<number, number>>;
  /** Feinkorrektur je Holzart (1,00 = Referenz Buche). */
  holzartKorrektur: Readonly<Record<HolzartSchluessel, number>>;
}

/**
 * Praxisnahe Standardwerte (Marktueblich, an Buche kalibriert).
 *
 * Ableitung zur Kontrolle:
 *   1 FM  = 1 / 0,70 = 1,43 RM
 *   1 FM  = 1 / 0,40 = 2,50 SRM  (bei 33 cm)
 * Das deckt sich mit der gaengigen Faustregel 1 FM ~ 1,4 RM ~ 2,5 SRM.
 *
 * Warum sinkt der Faktor mit der Laenge?
 * Lange Scheite verhaken und bruecken beim Schuetten staerker -> mehr Luft
 * im Behaelter -> weniger echtes Holz pro Schuettraummeter.
 */
export const STANDARD_UMRECHNUNG: UmrechnungsKonfig = {
  fmProRm: 0.7,
  fmProSrmNachLaenge: {
    25: 0.42,
    33: 0.4,
    50: 0.38,
    100: 0.36,
  },
  holzartKorrektur: {
    buche: 1.0,
    eiche: 0.99,
    esche: 1.0,
    birke: 0.98,
    ahorn: 0.99,
    fichte: 0.94,
    kiefer: 0.95,
    laerche: 0.96,
    douglasie: 0.95,
    mischholz: 0.98,
  },
};

/** Zusatzangaben, die eine Umrechnung genauer machen. Alles optional. */
export interface UmrechnungsOptionen {
  scheitlaenge?: Scheitlaenge | number;
  holzart?: HolzartSchluessel;
  konfig?: UmrechnungsKonfig;
}

// ----------------------------------------------------------------------------
// 5. HILFSFUNKTIONEN
// ----------------------------------------------------------------------------

/** Kaufmaennisch runden ohne Gleitkomma-Ueberraschungen (0,1 + 0,2 usw.). */
export function runde(wert: number, stellen = 3): number {
  const f = Math.pow(10, stellen);
  return Math.round((wert + Number.EPSILON) * f) / f;
}

/**
 * Sucht den Faktor zur uebergebenen Scheitlaenge.
 * Ist die Laenge nicht konfiguriert (z. B. 40 cm), wird der Faktor der
 * naechstgelegenen konfigurierten Laenge genommen — statt stillschweigend
 * einen Standardwert zu unterstellen.
 */
export function fmProSrm(
  scheitlaenge: number = STANDARD_SCHEITLAENGE,
  konfig: UmrechnungsKonfig = STANDARD_UMRECHNUNG,
): number {
  const tabelle = konfig.fmProSrmNachLaenge;
  const direkt = tabelle[scheitlaenge];
  if (typeof direkt === 'number') return direkt;

  const laengen = Object.keys(tabelle)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (laengen.length === 0) return STANDARD_UMRECHNUNG.fmProSrmNachLaenge[STANDARD_SCHEITLAENGE];

  const naechste = laengen.reduce((a, b) =>
    Math.abs(b - scheitlaenge) < Math.abs(a - scheitlaenge) ? b : a,
  );
  return tabelle[naechste];
}

/** Feinkorrektur der Holzart. Unbekannte Holzart -> 1,00 (keine Korrektur). */
export function holzartFaktor(
  holzart: HolzartSchluessel = STANDARD_HOLZART,
  konfig: UmrechnungsKonfig = STANDARD_UMRECHNUNG,
): number {
  const f = konfig.holzartKorrektur[holzart];
  return typeof f === 'number' && f > 0 ? f : 1;
}

/** Braucht diese Einheit eine Scheitlaenge, um sauber umgerechnet zu werden? */
export function brauchtScheitlaenge(einheit: HolzEinheit): boolean {
  return EINHEITEN.find((e) => e.wert === einheit)?.brauchtScheitlaenge ?? false;
}

export function einheitKurz(einheit: HolzEinheit): string {
  return EINHEITEN.find((e) => e.wert === einheit)?.kurz ?? String(einheit).toUpperCase();
}

export function einheitLang(einheit: HolzEinheit): string {
  return EINHEITEN.find((e) => e.wert === einheit)?.lang ?? String(einheit);
}

export function holzartName(holzart: HolzartSchluessel): string {
  return HOLZARTEN.find((h) => h.schluessel === holzart)?.name ?? String(holzart);
}

export function istHolzEinheit(wert: unknown): wert is HolzEinheit {
  return typeof wert === 'string' && EINHEITEN.some((e) => e.wert === wert);
}

// ----------------------------------------------------------------------------
// 6. KERN: UMRECHNUNG
// ----------------------------------------------------------------------------

/** Menge einer beliebigen Einheit in Festmeter umrechnen. */
export function nachFestmeter(
  menge: number,
  einheit: HolzEinheit,
  opt: UmrechnungsOptionen = {},
): number {
  if (!Number.isFinite(menge)) throw new Error('Menge ist keine gültige Zahl.');
  if (!istHolzEinheit(einheit)) throw new Error(`Unbekannte Einheit: ${String(einheit)}`);

  const konfig = opt.konfig ?? STANDARD_UMRECHNUNG;
  const korrektur = holzartFaktor(opt.holzart ?? STANDARD_HOLZART, konfig);

  switch (einheit) {
    case 'fm':
    case 'm3':
      // Festmeter und Kubikmeter (fest) sind rechnerisch dasselbe.
      return menge;
    case 'rm':
      return menge * konfig.fmProRm * korrektur;
    case 'srm':
      return menge * fmProSrm(opt.scheitlaenge ?? STANDARD_SCHEITLAENGE, konfig) * korrektur;
  }
}

/** Festmeter zurueck in eine beliebige Zieleinheit rechnen. */
export function vonFestmeter(
  festmeter: number,
  einheit: HolzEinheit,
  opt: UmrechnungsOptionen = {},
): number {
  if (!Number.isFinite(festmeter)) throw new Error('Festmeter-Wert ist keine gültige Zahl.');
  if (!istHolzEinheit(einheit)) throw new Error(`Unbekannte Einheit: ${String(einheit)}`);

  const konfig = opt.konfig ?? STANDARD_UMRECHNUNG;
  const korrektur = holzartFaktor(opt.holzart ?? STANDARD_HOLZART, konfig);

  switch (einheit) {
    case 'fm':
    case 'm3':
      return festmeter;
    case 'rm': {
      const teiler = konfig.fmProRm * korrektur;
      if (teiler <= 0) throw new Error('Ungültiger Umrechnungsfaktor für Raummeter.');
      return festmeter / teiler;
    }
    case 'srm': {
      const teiler = fmProSrm(opt.scheitlaenge ?? STANDARD_SCHEITLAENGE, konfig) * korrektur;
      if (teiler <= 0) throw new Error('Ungültiger Umrechnungsfaktor für Schüttraummeter.');
      return festmeter / teiler;
    }
  }
}

/**
 * Die zentrale Funktion: Menge von einer Einheit in eine andere umrechnen.
 * Weg fuehrt immer ueber den Festmeter als gemeinsame Basis.
 */
export function umrechnen(
  menge: number,
  von: HolzEinheit,
  nach: HolzEinheit,
  opt: UmrechnungsOptionen = {},
): number {
  if (von === nach) return menge;
  const fm = nachFestmeter(menge, von, opt);
  return vonFestmeter(fm, nach, opt);
}

/** Wie viel Schüttraummeter ergibt 1 Festmeter? (fuer Anzeige/Hinweise) */
export function srmProFm(opt: UmrechnungsOptionen = {}): number {
  return vonFestmeter(1, 'srm', opt);
}

/** Wie viel Raummeter ergibt 1 Festmeter? */
export function rmProFm(opt: UmrechnungsOptionen = {}): number {
  return vonFestmeter(1, 'rm', opt);
}

/** Der tatsaechlich verwendete Faktor einer Umrechnung — fuer Nachvollziehbarkeit. */
export function verwendeterFaktor(
  von: HolzEinheit,
  nach: HolzEinheit,
  opt: UmrechnungsOptionen = {},
): number {
  return umrechnen(1, von, nach, opt);
}

// ----------------------------------------------------------------------------
// 7. VALIDIERUNG
// ----------------------------------------------------------------------------

export interface PruefErgebnis {
  ok: boolean;
  /** Blockierende Fehler. Bei ok = false immer mindestens einer. */
  fehler: string[];
  /** Nicht blockierend, aber wichtig fuer den Bediener. */
  hinweise: string[];
}

/**
 * Prueft eine Mengenangabe, bevor sie in Auftrag oder Lieferschein wandert.
 * Bewusst getrennt vom Rechnen: die UI entscheidet, was mit Hinweisen passiert.
 */
export function pruefeMenge(
  menge: number,
  einheit: HolzEinheit,
  opt: UmrechnungsOptionen = {},
): PruefErgebnis {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  if (!Number.isFinite(menge)) {
    fehler.push('Bitte eine gültige Menge eingeben.');
  } else if (menge <= 0) {
    fehler.push('Die Menge muss größer als 0 sein.');
  } else if (menge > 10000) {
    hinweise.push('Ungewöhnlich große Menge — bitte kurz prüfen.');
  }

  if (!istHolzEinheit(einheit)) {
    fehler.push('Bitte eine Einheit auswählen (SRM, RM, FM oder m³).');
  } else if (brauchtScheitlaenge(einheit) && opt.scheitlaenge === undefined) {
    hinweise.push(
      `Ohne Scheitlänge wird mit ${STANDARD_SCHEITLAENGE} cm gerechnet. ` +
        'Bei abweichender Länge weicht die Umrechnung spürbar ab.',
    );
  }

  if (
    opt.scheitlaenge !== undefined &&
    !SCHEITLAENGEN.includes(opt.scheitlaenge as Scheitlaenge)
  ) {
    hinweise.push(
      `Für ${opt.scheitlaenge} cm ist kein eigener Faktor hinterlegt — ` +
        'es wird der Faktor der nächstliegenden Länge verwendet.',
    );
  }

  return { ok: fehler.length === 0, fehler, hinweise };
}

// ----------------------------------------------------------------------------
// 8. FORMATIERUNG & KLARTEXT
// ----------------------------------------------------------------------------

/** Zahl im deutschen Format. */
export function formatZahl(wert: number, stellen = 2): string {
  if (!Number.isFinite(wert)) return '—';
  return wert.toLocaleString('de-DE', {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
  });
}

/** z. B. "8,00 SRM" */
export function formatMenge(menge: number, einheit: HolzEinheit, stellen = 2): string {
  return `${formatZahl(menge, stellen)} ${einheitKurz(einheit)}`;
}

/** z. B. "8 SRM Buche, 33 cm" */
export function formatMengeMitHolz(
  menge: number,
  einheit: HolzEinheit,
  opt: UmrechnungsOptionen = {},
  stellen = 2,
): string {
  const teile: string[] = [formatMenge(menge, einheit, stellen)];
  if (opt.holzart) teile.push(holzartName(opt.holzart));
  if (brauchtScheitlaenge(einheit) && opt.scheitlaenge !== undefined) {
    teile.push(`${opt.scheitlaenge} cm`);
  }
  return teile.join(' · ');
}

/**
 * Ein Satz, der die Umrechnung erklaert — fuer KiKlartext, Tooltips und PDF.
 * Beispiel: "1 SRM Buche (33 cm) entspricht 0,40 FM. Umgekehrt: 1 FM ≈ 2,50 SRM."
 */
export function umrechnungsHinweis(
  von: HolzEinheit,
  nach: HolzEinheit,
  opt: UmrechnungsOptionen = {},
): string {
  if (von === nach) return `${einheitKurz(von)} bleibt ${einheitKurz(nach)} — keine Umrechnung nötig.`;

  const hin = runde(verwendeterFaktor(von, nach, opt), 4);
  const rueck = runde(verwendeterFaktor(nach, von, opt), 4);

  const zusatz: string[] = [];
  if (opt.holzart) zusatz.push(holzartName(opt.holzart));
  if (brauchtScheitlaenge(von) || brauchtScheitlaenge(nach)) {
    zusatz.push(`${opt.scheitlaenge ?? STANDARD_SCHEITLAENGE} cm`);
  }
  const kontext = zusatz.length > 0 ? ` (${zusatz.join(', ')})` : '';

  return (
    `1 ${einheitKurz(von)}${kontext} entspricht ${formatZahl(hin, 2)} ${einheitKurz(nach)}. ` +
    `Umgekehrt: 1 ${einheitKurz(nach)} ≈ ${formatZahl(rueck, 2)} ${einheitKurz(von)}.`
  );
}

/**
 * Alle vier Einheiten fuer eine Menge auf einen Blick.
 * Genau das, was der Kunde am Telefon hoeren will: "8 SRM — was ist das in Ster?"
 */
export interface UmrechnungsUebersicht {
  fm: number;
  rm: number;
  srm: number;
  m3: number;
}

export function alleEinheiten(
  menge: number,
  einheit: HolzEinheit,
  opt: UmrechnungsOptionen = {},
  stellen = 2,
): UmrechnungsUebersicht {
  const fm = nachFestmeter(menge, einheit, opt);
  return {
    fm: runde(fm, stellen),
    rm: runde(vonFestmeter(fm, 'rm', opt), stellen),
    srm: runde(vonFestmeter(fm, 'srm', opt), stellen),
    m3: runde(fm, stellen),
  };
}

// ----------------------------------------------------------------------------
// 9. BASIS-EINHEIT NACH AUSSEN (fuer A3 Preisliste / A4 Auftrag)
// ----------------------------------------------------------------------------

/**
 * Die Preisliste hinterlegt ihre Preise je Einheit. Damit unterschiedlich
 * bepreiste Positionen vergleichbar bleiben, rechnet A3 intern auf FM.
 * Diese Konstante ist der einzige Ort, an dem die Basis definiert ist.
 */
export const HOLZ_BASIS_EINHEIT: HolzEinheit = BASIS_EINHEIT;
