// ============================================================================
// ARGONAUT OS · lib/pruefungen.ts — Prüfprotokoll-Katalog & -Formeln (A3)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks. Norm-Katalog mit
// web-verifizierten Prüffristen (Stand 07/2026) + Fälligkeit, Gesamtergebnis
// und Ampel. Prüfpunkte je Norm als Startvorlage — vom Prüfer anpassbar.
// ============================================================================

import { plusMonate } from './nachweisMotor';
import { MESS_VDE_0100_600, MESS_VDE_0105, MESS_VDE_0701_0702, bewerteMesswert, type MessVorlage } from './elektroMesswerte';

export interface PruefNorm {
  key: string;
  bezeichnung: string;
  norm: string;
  intervall_monate: number;
  pruefpunkte: string[];
  /** Paket 196: Messpunkte mit Zahlenfeld, Einheit und Grenzwert (lib/elektroMesswerte). */
  messungen?: MessVorlage[];
  /** Kurzer Hinweis zur Frist (z. B. Erstprüfung ohne eigenes Intervall). */
  fristHinweis?: string;
}

/** Norm-Katalog. Fristen per WebSearch verifiziert (07/2026). */
export const PRUEF_NORMEN: PruefNorm[] = [
  {
    key: 'elektro_ortsveraenderlich',
    bezeichnung: 'Ortsveränderliche Elektrogeräte (E-Check)',
    norm: 'DGUV V3 / DIN VDE 0701-0702',
    intervall_monate: 24, // Büro/leichte Beanspruchung; Werkstatt 12, Baustelle 3
    // Paket 196: die Messungen (Schutzleiter, Isolation, Ströme) sind jetzt Zahlenfelder mit Grenzwert.
    pruefpunkte: ['Sichtprüfung Gehäuse & Anschlussleitung', 'Funktionsprüfung'],
    messungen: MESS_VDE_0701_0702,
  },
  {
    key: 'elektro_ortsfest',
    bezeichnung: 'Ortsfeste elektrische Anlage',
    norm: 'DGUV V3 / DIN VDE 0105',
    intervall_monate: 48, // 4 Jahre allgemein
    pruefpunkte: ['Sichtprüfung Verteilung & Leitungen', 'RCD/FI-Prüftaste erprobt', 'Funktionsprüfung Schutzeinrichtungen'],
    messungen: MESS_VDE_0105,
  },
  {
    // Paket 196: Erstprüfung vor der ersten Inbetriebnahme bzw. nach Erweiterung/Änderung.
    key: 'elektro_erstpruefung',
    bezeichnung: 'Erstprüfung elektrische Anlage (Neubau/Erweiterung)',
    norm: 'DIN VDE 0100-600',
    intervall_monate: 48, // danach Wiederholungsprüfung nach DGUV V3 / DIN VDE 0105-100
    fristHinweis: 'Erstprüfung vor Inbetriebnahme; die nächste Fälligkeit ist die erste Wiederholungsprüfung (gewerblich 4 Jahre).',
    pruefpunkte: [
      'Besichtigen: Schutz gegen elektrischen Schlag (Abdeckungen, Schutzmaßnahme)',
      'Besichtigen: Leitungsauswahl, Querschnitte, Verlegung',
      'Besichtigen: Schutz- und Trenneinrichtungen richtig ausgewählt und eingestellt',
      'Besichtigen: Brandabschottungen, Kennzeichnung, Beschriftung der Stromkreise',
      'Erproben: RCD-Prüftaste, Schalter und Steuerungen',
      'Erproben: Drehfeld rechts / Spannung an den Anschlussstellen',
      'Dokumentation übergeben (Stromkreisliste, Schaltplan, Messprotokoll)',
    ],
    messungen: MESS_VDE_0100_600,
  },
  {
    key: 'feuerloescher',
    bezeichnung: 'Feuerlöscher',
    norm: 'DIN 14406-4',
    intervall_monate: 24,
    pruefpunkte: ['Druckanzeige im grünen Bereich', 'Plombe/Sicherung unversehrt', 'Keine Beschädigung/Korrosion', 'Standort & Kennzeichnung', 'Prüfplakette aktualisiert'],
  },
  {
    key: 'leiter_tritt',
    bezeichnung: 'Leitern & Tritte',
    norm: 'DGUV Information 208-016',
    intervall_monate: 12, // Baustelle/häufig 6
    pruefpunkte: ['Holme & Sprossen unbeschädigt', 'Beschläge & Gelenke fest', 'Spreizsicherung funktionsfähig', 'Leiterfüße & Standsicherheit', 'Kennzeichnung vorhanden'],
  },
  {
    key: 'regal',
    bezeichnung: 'Regalanlage',
    norm: 'DIN EN 15635',
    intervall_monate: 12, // + wöchentliche Sichtkontrolle durch Personal
    pruefpunkte: ['Ständer/Streben ohne Verformung', 'Keine Anfahrschäden', 'Verankerung im Boden', 'Traglastschilder lesbar', 'Aussteifungen/Verbände vollständig'],
  },
  {
    key: 'spielplatz_haupt',
    bezeichnung: 'Spielplatz — Hauptinspektion',
    norm: 'DIN EN 1176',
    intervall_monate: 12,
    pruefpunkte: ['Fundamente & Verankerungen', 'Verschleiß beweglicher Teile', 'Fallschutz & Untergrund', 'Korrosion/Holzschäden', 'Fang- & Quetschstellen'],
  },
  {
    key: 'spielplatz_operativ',
    bezeichnung: 'Spielplatz — operative Inspektion',
    norm: 'DIN EN 1176',
    intervall_monate: 3,
    pruefpunkte: ['Sauberkeit & Fremdkörper', 'Verschleiß sichtbar', 'Vandalismusschäden', 'Fallschutz-Zustand', 'Befestigungen fest'],
  },
  {
    key: 'psa_absturz',
    bezeichnung: 'PSA gegen Absturz',
    norm: 'DGUV Regel 112-198/199',
    intervall_monate: 12,
    pruefpunkte: ['Gurtbänder & Nähte', 'Karabiner & Verschlüsse', 'Falldämpfer unversehrt', 'Verbindungsmittel/Seil', 'Kennzeichnung & max. Nutzungsdauer'],
  },
];

export function pruefNorm(key: string): PruefNorm | undefined {
  return PRUEF_NORMEN.find((n) => n.key === key);
}

/**
 * Datum + Monate (monatsgenau), ISO zurück.
 * Paket 187: rechnete vorher mit new Date(...T00:00:00).setMonth().toISOString() —
 * im Browser in Deutschland ergab das den VORTAG, und 31.01. + 1 Monat wurde 03.03.
 * Jetzt über lib/nachweisMotor.plusMonate (reine Kalendertage, Monatsende festgehalten).
 */
export function naechsteFaelligkeit(datumIso: string, intervallMonate: number): string {
  const m = Math.max(0, Math.round(Number(intervallMonate) || 0));
  return plusMonate(String(datumIso || '').slice(0, 10), m) ?? '';
}

export interface PunktBasis { status?: string | null; }

/** Ein Prüfpunkt im Entwurf — Messfelder nur bei Messpunkten. */
export interface PunktEntwurf {
  punkt: string;
  status: string;
  hinweis: string;
  /** Paket 196: Messpunkt? Dann Messwert als Text (deutsche Eingabe), Einheit, Grenzen. */
  mess?: boolean;
  messwert?: string;
  einheit?: string;
  grenz_min?: number | null;
  grenz_max?: number | null;
  /** Hinweis aus der Norm-Vorlage (Prüfspannung, Bezug) — nur Anzeige, wird nicht gespeichert. */
  tipp?: string;
}

/** Startpunkte einer Norm: erst die Sicht-/Erprobungspunkte, dann die Messpunkte mit leerem Messwert. */
export function entwurfAusNorm(n: PruefNorm | undefined): PunktEntwurf[] {
  if (!n) return [];
  const sicht: PunktEntwurf[] = n.pruefpunkte.map((p) => ({ punkt: p, status: 'ok', hinweis: '' }));
  const mess: PunktEntwurf[] = (n.messungen ?? []).map((m) => ({
    punkt: m.punkt, status: 'ok', hinweis: '', mess: true, messwert: '',
    einheit: m.einheit, grenz_min: m.min ?? null, grenz_max: m.max ?? null, tipp: m.hinweis,
  }));
  return [...sicht, ...mess];
}

/**
 * Status eines Messpunkts nach Eingabe des Messwerts: ausserhalb der Grenze → 'mangel',
 * innerhalb → 'ok'. Ohne Messwert bleibt der bisherige Status (der Prüfer entscheidet).
 */
export function statusNachMessung(p: PunktEntwurf): string {
  if (!p.mess) return p.status;
  const b = bewerteMesswert(p.messwert, p.grenz_min, p.grenz_max);
  if (b === 'leer') return p.status;
  return b;
}

/** Messpunkte ohne Messwert (zum Hinweis vor dem Speichern). */
export function offeneMessungen(punkte: PunktEntwurf[]): number {
  return punkte.filter((p) => p.mess && p.status !== 'na' && bewerteMesswert(p.messwert, null, null) === 'leer').length;
}

/**
 * Gesamtergebnis aus den Prüfpunkten:
 *   irgendein 'mangel' -> 'maengel', sonst 'bestanden'.
 * ('durchgefallen' bleibt eine manuelle Einstufung durch den Prüfer.)
 */
export function gesamtErgebnis(punkte: PunktBasis[]): 'bestanden' | 'maengel' {
  return punkte.some((p) => p.status === 'mangel') ? 'maengel' : 'bestanden';
}

/** Anzahl Mängel. */
export function zaehleMaengel(punkte: PunktBasis[]): number {
  return punkte.filter((p) => p.status === 'mangel').length;
}

/** Fälligkeits-Ampel: überfällig / bald (<= 30 Tage) / ok. */
export function faelligBucket(naechsteIso: string | null | undefined, heuteIso: string, baldTage = 30): 'ueberfaellig' | 'bald' | 'ok' {
  if (!naechsteIso) return 'ok';
  const n = new Date(String(naechsteIso).slice(0, 10) + 'T00:00:00').getTime();
  const h = new Date(String(heuteIso).slice(0, 10) + 'T00:00:00').getTime();
  if (isNaN(n) || isNaN(h)) return 'ok';
  if (n < h) return 'ueberfaellig';
  if (n - h <= baldTage * 86400000) return 'bald';
  return 'ok';
}

export interface ProtokollBasis {
  ergebnis?: string | null;
  naechste_pruefung?: string | null;
}

/** Kennzahlen über die Protokolle (fürs Cockpit/Auge). */
export function zaehlePruef(protokolle: ProtokollBasis[], heuteIso: string): { gesamt: number; maengel: number; ueberfaellig: number; bald: number } {
  let maengel = 0, ueberfaellig = 0, bald = 0;
  for (const p of protokolle) {
    if (p.ergebnis === 'maengel' || p.ergebnis === 'durchgefallen') maengel++;
    const b = faelligBucket(p.naechste_pruefung, heuteIso);
    if (b === 'ueberfaellig') ueberfaellig++;
    else if (b === 'bald') bald++;
  }
  return { gesamt: protokolle.length, maengel, ueberfaellig, bald };
}
