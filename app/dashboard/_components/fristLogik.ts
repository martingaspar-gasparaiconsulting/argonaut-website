// ============================================================================
// ARGONAUT OS · Baustein "Frist-Wächter" (Etappe 1, Baustein 1)
// Reine Logik — KEINE UI, KEINE externen Abhängigkeiten.
// Universell einsetzbar: TÜV, Kündigung, Rechnungs-Fälligkeit, Prüfung,
// Vertragsende ... überall wo ein Zieldatum eine Ampel + Resttage braucht.
//
// Zeitzonen-Regel (ARGONAUT): Datum IMMER lokal auf Mitternacht bilden
// (getFullYear/getMonth/getDate), NIE toISOString() — sonst Tag-Versatz.
// ============================================================================

export type AmpelStatus = 'gruen' | 'gelb' | 'rot' | 'grau';

export interface AmpelOptionen {
  /** Ab so vielen Resttagen (oder weniger) wird es GELB. Default 30. */
  gelbAbTagen?: number;
  /** Ab so vielen Resttagen (oder weniger) wird es ROT. Default 7. */
  rotAbTagen?: number;
}

export interface AmpelErgebnis {
  status: AmpelStatus;
  /** Verbleibende Tage bis zum Zieldatum. Negativ = überfällig. null = kein Datum. */
  resttage: number | null;
  /** Kurzer Klartext, z. B. "In 5 Tagen", "Heute fällig", "Überfällig seit 3 Tagen". */
  label: string;
  /** Vordergrund-/Textfarbe (Hex). */
  farbe: string;
  /** Dezent getönte Hintergrundfarbe. */
  hintergrund: string;
  /** Randfarbe. */
  rand: string;
  /** true, wenn das Zieldatum in der Vergangenheit liegt. */
  ueberfaellig: boolean;
}

// --- Farbpalette (klassische Ampel, passend zum Dashboard) --------------------
const FARBEN: Record<AmpelStatus, { farbe: string; hintergrund: string; rand: string }> = {
  gruen: { farbe: '#16a34a', hintergrund: 'rgba(22,163,74,0.12)',  rand: 'rgba(22,163,74,0.35)' },
  gelb:  { farbe: '#d97706', hintergrund: 'rgba(217,119,6,0.12)',  rand: 'rgba(217,119,6,0.35)' },
  rot:   { farbe: '#dc2626', hintergrund: 'rgba(220,38,38,0.12)',  rand: 'rgba(220,38,38,0.35)' },
  grau:  { farbe: '#64748b', hintergrund: 'rgba(100,116,139,0.10)', rand: 'rgba(100,116,139,0.30)' },
};

// --- Datum robust auf lokale Mitternacht bringen ------------------------------
function aufMitternachtLokal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Wandelt Date | ISO-String | null | undefined sicher in ein Date um.
 * Reine "YYYY-MM-DD"-Strings werden LOKAL interpretiert (kein UTC-Versatz).
 */
export function parseDatum(wert: Date | string | null | undefined): Date | null {
  if (!wert) return null;
  if (wert instanceof Date) return isNaN(wert.getTime()) ? null : wert;

  const nurDatum = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert.trim());
  if (nurDatum) {
    return new Date(Number(nurDatum[1]), Number(nurDatum[2]) - 1, Number(nurDatum[3]));
  }
  const d = new Date(wert);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Berechnet Resttage bis zum Zieldatum (heute = 0). Negativ = überfällig.
 * Gibt null zurück, wenn kein gültiges Datum vorliegt.
 */
export function resttageBis(zielDatum: Date | string | null | undefined): number | null {
  const ziel = parseDatum(zielDatum);
  if (!ziel) return null;
  const heute = aufMitternachtLokal(new Date()).getTime();
  const zielMitternacht = aufMitternachtLokal(ziel).getTime();
  return Math.round((zielMitternacht - heute) / 86_400_000);
}

/** Baut den Klartext-Label aus den Resttagen. */
function labelAusResttagen(resttage: number): string {
  if (resttage === 0) return 'Heute fällig';
  if (resttage === 1) return 'Morgen fällig';
  if (resttage === -1) return 'Seit gestern überfällig';
  if (resttage > 1) return `In ${resttage} Tagen`;
  return `Überfällig seit ${Math.abs(resttage)} Tagen`;
}

/**
 * Herzstück: berechnet Ampel-Status + Resttage + Klartext + Farben.
 *
 * @param zielDatum  Zieldatum (Date, "YYYY-MM-DD", ISO-String, null/undefined)
 * @param optionen   Schwellen anpassen (gelbAbTagen=30, rotAbTagen=7)
 */
export function berechneAmpel(
  zielDatum: Date | string | null | undefined,
  optionen: AmpelOptionen = {},
): AmpelErgebnis {
  const gelbAb = optionen.gelbAbTagen ?? 30;
  const rotAb = optionen.rotAbTagen ?? 7;

  const resttage = resttageBis(zielDatum);

  // Kein Datum → grauer, neutraler Zustand (Leer-Zustand eingebaut).
  if (resttage === null) {
    return {
      status: 'grau',
      resttage: null,
      label: 'Kein Datum',
      ...FARBEN.grau,
      ueberfaellig: false,
    };
  }

  let status: AmpelStatus;
  if (resttage < 0) status = 'rot';          // bereits überfällig
  else if (resttage <= rotAb) status = 'rot';
  else if (resttage <= gelbAb) status = 'gelb';
  else status = 'gruen';

  return {
    status,
    resttage,
    label: labelAusResttagen(resttage),
    ...FARBEN[status],
    ueberfaellig: resttage < 0,
  };
}

// ============================================================================
// ERWEITERUNG (Etappe 2): Reaktionszeit-Ampel
// Misst die bereits VERSTRICHENE Zeit ab einem Startpunkt (z. B. Eingang einer
// Anfrage) in Stunden — statt Resttage bis zu einem Zieldatum. Gleiche Farben
// und gleiche Ergebnis-Struktur, damit dieselbe FristAmpel-Komponente es
// anzeigen kann. Einsatz: Leads-Reaktionszeit, später Ticket-Antwortzeit u. a.
// ============================================================================

export interface ReaktionsOptionen {
  /** Ab so vielen verstrichenen Stunden (oder mehr) wird es GELB. Default 4. */
  gelbAbStunden?: number;
  /** Ab so vielen verstrichenen Stunden (oder mehr) wird es ROT. Default 24. */
  rotAbStunden?: number;
}

/** Verstrichene Stunden seit einem Startzeitpunkt. null = kein gültiger Start. */
export function verstricheneStunden(start: Date | string | null | undefined): number | null {
  const s = parseDatum(start);
  if (!s) return null;
  return (Date.now() - s.getTime()) / 3_600_000;
}

function reaktionsLabel(stunden: number): string {
  if (stunden < 0) return 'gerade eben';
  if (stunden < 1) {
    const min = Math.max(1, Math.round(stunden * 60));
    return `vor ${min} Min. offen`;
  }
  if (stunden < 24) {
    const h = Math.round(stunden);
    return h === 1 ? 'seit 1 Std. offen' : `seit ${h} Std. offen`;
  }
  const tage = Math.floor(stunden / 24);
  return tage === 1 ? 'seit 1 Tag offen' : `seit ${tage} Tagen offen`;
}

/**
 * Reaktionszeit-Ampel: wie lange liegt etwas seit `start` bereits offen?
 * grün < gelbAb, gelb ab gelbAb, rot ab rotAb (jeweils in Stunden).
 */
export function berechneReaktionsAmpel(
  start: Date | string | null | undefined,
  optionen: ReaktionsOptionen = {},
): AmpelErgebnis {
  const gelbAb = optionen.gelbAbStunden ?? 4;
  const rotAb = optionen.rotAbStunden ?? 24;

  const stunden = verstricheneStunden(start);
  if (stunden === null) {
    return {
      status: 'grau',
      resttage: null,
      label: 'Kein Zeitpunkt',
      ...FARBEN.grau,
      ueberfaellig: false,
    };
  }

  let status: AmpelStatus;
  if (stunden >= rotAb) status = 'rot';
  else if (stunden >= gelbAb) status = 'gelb';
  else status = 'gruen';

  return {
    status,
    resttage: null, // bei Reaktionszeit nicht sinnvoll
    label: reaktionsLabel(stunden),
    ...FARBEN[status],
    ueberfaellig: status === 'rot',
  };
}
