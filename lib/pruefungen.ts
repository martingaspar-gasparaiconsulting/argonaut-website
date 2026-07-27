// ============================================================================
// ARGONAUT OS · lib/pruefungen.ts — Prüfprotokoll-Katalog & -Formeln (A3)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks. Norm-Katalog mit
// web-verifizierten Prüffristen (Stand 07/2026) + Fälligkeit, Gesamtergebnis
// und Ampel. Prüfpunkte je Norm als Startvorlage — vom Prüfer anpassbar.
// ============================================================================

export interface PruefNorm {
  key: string;
  bezeichnung: string;
  norm: string;
  intervall_monate: number;
  pruefpunkte: string[];
}

/** Norm-Katalog. Fristen per WebSearch verifiziert (07/2026). */
export const PRUEF_NORMEN: PruefNorm[] = [
  {
    key: 'elektro_ortsveraenderlich',
    bezeichnung: 'Ortsveränderliche Elektrogeräte (E-Check)',
    norm: 'DGUV V3 / DIN VDE 0701-0702',
    intervall_monate: 24, // Büro/leichte Beanspruchung; Werkstatt 12, Baustelle 3
    pruefpunkte: ['Sichtprüfung Gehäuse & Anschlussleitung', 'Schutzleiterwiderstand', 'Isolationswiderstand', 'Schutzleiter-/Berührungsstrom', 'Funktionsprüfung'],
  },
  {
    key: 'elektro_ortsfest',
    bezeichnung: 'Ortsfeste elektrische Anlage',
    norm: 'DGUV V3 / DIN VDE 0105',
    intervall_monate: 48, // 4 Jahre allgemein
    pruefpunkte: ['Sichtprüfung Verteilung & Leitungen', 'RCD/FI-Auslösung geprüft', 'Isolationswiderstand', 'Schleifenimpedanz', 'Funktionsprüfung Schutzeinrichtungen'],
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

/** Datum + Monate (monatsgenau), ISO zurück. */
export function naechsteFaelligkeit(datumIso: string, intervallMonate: number): string {
  const d = new Date((datumIso || '').slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  const m = Math.max(0, Math.round(Number(intervallMonate) || 0));
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}

export interface PunktBasis { status?: string | null; }

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
