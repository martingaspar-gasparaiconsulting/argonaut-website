// ============================================================================
// ARGONAUT OS · Phase 2 · Modul D · KFZ Block 1.1 · Baustein "Freigabe-Logik"
// Reine Logik — KEINE UI, KEINE externen Abhängigkeiten, KEIN DB-Zugriff.
// Das Rechenwerk für die KVA-Kundenfreigabe: Status-Definitionen, erlaubte
// Übergänge, die Nachtrag-Erkennung (freigegebene Summe überschritten) und die
// Freigabe-Ampel (zweite Ebene neben der Dringlichkeits-Ampel).
// Pfad: app/dashboard/_components/freigabeLogik.ts
// ============================================================================

// --- Die Freigabe-Zustände: EINE zentrale Quelle ----------------------------
export type FreigabeStatus = 'kein_kva' | 'kva_offen' | 'freigegeben' | 'abgelehnt';

export interface FreigabeDef {
  wert: FreigabeStatus;
  label: string;
  farbe: string;
  /** Kurzer Klartext für die Ampel/Tooltip. */
  hinweis: string;
}

// Farben im ARGONAUT-Schema (Navy/Gold/Cyan + Ampel-Töne).
const F = {
  grau: '#8FA3BE',   // kein KVA / neutral
  cyan: '#00e5ff',   // KVA offen (wartet auf Kunde)
  gruen: '#4CAF7D',  // freigegeben
  rot: '#E06666',    // abgelehnt
  gold: '#C9A84C',   // Nachtrag (Achtung-Signal)
};

export const FREIGABE_DEFS: FreigabeDef[] = [
  { wert: 'kein_kva',    label: 'Kein KVA',      farbe: F.grau,  hinweis: 'Noch kein Kostenvoranschlag erstellt.' },
  { wert: 'kva_offen',   label: 'KVA offen',     farbe: F.cyan,  hinweis: 'Kostenvoranschlag erstellt — wartet auf Kundenfreigabe.' },
  { wert: 'freigegeben', label: 'Freigegeben',   farbe: F.gruen, hinweis: 'Kunde hat den Kostenvoranschlag freigegeben.' },
  { wert: 'abgelehnt',   label: 'Abgelehnt',     farbe: F.rot,   hinweis: 'Kunde hat den Kostenvoranschlag abgelehnt.' },
];

export function freigabeDef(status: string | null | undefined): FreigabeDef {
  return FREIGABE_DEFS.find((f) => f.wert === status) ?? FREIGABE_DEFS[0];
}

// --- Datentyp: schlank, passt auf die neuen Auftrags-Felder ------------------
export interface FreigabeBasis {
  freigabe_status?: string | null;
  freigabe_am?: string | Date | null;
  freigabe_notiz?: string | null;
  freigabe_summe_netto?: number | null;   // Snapshot der freigegebenen Netto-Summe
}

// --- Erlaubte Status-Übergänge (Guard gegen unsinnige Sprünge) ---------------

/**
 * Welche Folge-Zustände sind aus dem aktuellen erlaubt?
 *  - kein_kva    -> kva_offen        (KVA erstellen)
 *  - kva_offen   -> freigegeben | abgelehnt
 *  - freigegeben -> kva_offen        (Nachtrag: erneut zur Freigabe)
 *  - abgelehnt   -> kva_offen        (neuer/überarbeiteter KVA)
 */
export function erlaubteUebergaenge(status: string | null | undefined): FreigabeStatus[] {
  switch (status) {
    case 'kein_kva':    return ['kva_offen'];
    case 'kva_offen':   return ['freigegeben', 'abgelehnt'];
    case 'freigegeben': return ['kva_offen'];
    case 'abgelehnt':   return ['kva_offen'];
    default:            return ['kva_offen'];
  }
}

export function uebergangErlaubt(
  von: string | null | undefined,
  nach: FreigabeStatus,
): boolean {
  return erlaubteUebergaenge(von).includes(nach);
}

// --- Nachtrag-Erkennung ------------------------------------------------------

/**
 * Ein "Nachtrag" liegt vor, wenn ein Auftrag bereits freigegeben war, die
 * aktuelle Auftragssumme aber die freigegebene Summe übersteigt — z.B. weil
 * während der Reparatur ein zusätzlicher Mangel als Position erfasst wurde.
 * Rechtlich darf dann NICHT weitergearbeitet werden, bis der Kunde den
 * Nachtrag freigibt.
 *
 * @param a               Auftrag mit Freigabe-Feldern
 * @param aktuelleSumme   aktuell berechnete Netto-Summe (aus leistungLogik)
 * @param toleranz        kleine Toleranz gegen Rundungs-/Cent-Rauschen (Default 0.01)
 */
export function hatOffenenNachtrag(
  a: FreigabeBasis,
  aktuelleSumme: number | null | undefined,
  toleranz = 0.01,
): boolean {
  if (a.freigabe_status !== 'freigegeben') return false;
  if (aktuelleSumme == null) return false;
  const basis = a.freigabe_summe_netto;
  if (basis == null) return false;
  return aktuelleSumme > basis + toleranz;
}

/** Differenz des Nachtrags (aktuell − freigegeben), oder 0. */
export function nachtragDifferenz(
  a: FreigabeBasis,
  aktuelleSumme: number | null | undefined,
): number {
  if (!hatOffenenNachtrag(a, aktuelleSumme)) return 0;
  const diff = (aktuelleSumme ?? 0) - (a.freigabe_summe_netto ?? 0);
  return Math.round(diff * 100) / 100;
}

// --- Freigabe-Ampel (zweite Ebene neben Dringlichkeit) -----------------------

export interface FreigabeAmpel {
  farbe: string;
  label: string;
  hinweis: string;
  /** true = braucht Aktion vom Chef/Kunden (KVA offen oder Nachtrag). */
  aktionNoetig: boolean;
}

/**
 * Verdichtet Freigabe-Status + Nachtrag-Erkennung zu einer Ampel.
 * Reihenfolge der Signale:
 *   1) Offener Nachtrag  -> Gold-Signal "Nachtrag freigeben lassen" (überstimmt "freigegeben")
 *   2) sonst der reine Freigabe-Status
 */
export function freigabeAmpel(
  a: FreigabeBasis,
  aktuelleSumme?: number | null,
): FreigabeAmpel {
  if (hatOffenenNachtrag(a, aktuelleSumme)) {
    const diff = nachtragDifferenz(a, aktuelleSumme);
    return {
      farbe: F.gold,
      label: 'Nachtrag offen',
      hinweis: `Zusätzliche Positionen über der Freigabe (+${diff.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} netto). Vor Weiterarbeit vom Kunden freigeben lassen.`,
      aktionNoetig: true,
    };
  }
  const def = freigabeDef(a.freigabe_status);
  return {
    farbe: def.farbe,
    label: def.label,
    hinweis: def.hinweis,
    aktionNoetig: def.wert === 'kva_offen',
  };
}

// --- Darf gearbeitet werden? -------------------------------------------------

/**
 * Kleine Entscheidungshilfe für die UI: Sollte vor dem Losarbeiten eine
 * Freigabe eingeholt werden? (kva_offen, abgelehnt oder offener Nachtrag)
 * Bei 'kein_kva' geben wir false zurück — kleine KVA-Pflicht erzwingen, viele
 * Klein-Reparaturen laufen ohne KVA; die Werkstatt entscheidet selbst.
 */
export function freigabeBlockiertArbeit(
  a: FreigabeBasis,
  aktuelleSumme?: number | null,
): boolean {
  if (hatOffenenNachtrag(a, aktuelleSumme)) return true;
  return a.freigabe_status === 'kva_offen' || a.freigabe_status === 'abgelehnt';
}

// --- Datum-Helper ------------------------------------------------------------
export function freigabeDatumText(wert: string | Date | null | undefined): string {
  if (!wert) return '—';
  const d = wert instanceof Date ? wert : new Date(wert);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
