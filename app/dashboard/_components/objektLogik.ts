// ============================================================================
// ARGONAUT OS · Phase 2 · Modul B · Baustein "Objekt-Logik"
// Reine Logik — KEINE UI, KEINE externen Abhängigkeiten.
// Rechnet objektbezogene Zeiten aus: Minuten <-> Stunden, Kosten aus
// Minuten x effektivem Satz, und die Gruppierung/Summe je Objekt.
//
// WICHTIG: Das hat NICHTS mit hr_zeiterfassung (gesetzliche Arbeitszeit) zu
// tun. Hier geht es rein um "wie viel Zeit floss auf welches Objekt".
// Zeit wird als Minuten (int) gespeichert -> rundungssicher.
// ============================================================================

// --- Datentypen: schlank, passen auf Zeilen aus objekt_zeiten / objekte -----
export interface ObjektZeitBasis {
  objekt_id?: string | null;
  datum?: string | null;
  dauer_minuten?: number | null;
  stundensatz_netto?: number | null;   // überschreibt den Objekt-Satz, wenn gesetzt
  abrechenbar?: boolean | null;
}

export interface ObjektBasis {
  id: string;
  bezeichnung: string;
  stundensatz_netto?: number | null;   // Standard-Satz des Objekts
}

// --- Minuten <-> Stunden -----------------------------------------------------

/** Minuten in Dezimalstunden (z. B. 90 -> 1.5). */
export function minutenZuStunden(minuten: number | null | undefined): number {
  if (!minuten || minuten < 0) return 0;
  return minuten / 60;
}

/** Dezimalstunden in Minuten, kaufmännisch gerundet (z. B. 1.5 -> 90). */
export function stundenZuMinuten(stunden: number | null | undefined): number {
  if (!stunden || stunden < 0) return 0;
  return Math.round(stunden * 60);
}

/**
 * Zeit-Text für die Anzeige.
 *  - unter 60 min  -> "45 min"
 *  - sonst         -> "7,5 h" (deutsches Komma, max. 2 Nachkommastellen, ohne Nullen)
 */
export function stundenText(minuten: number | null | undefined): string {
  const m = !minuten || minuten < 0 ? 0 : Math.round(minuten);
  if (m === 0) return '0 h';
  if (m < 60) return `${m} min`;
  const std = m / 60;
  const gerundet = Math.round(std * 100) / 100;
  const text = gerundet.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  return `${text} h`;
}

// --- Kosten ------------------------------------------------------------------

/**
 * Effektiver Stundensatz einer Buchung:
 * Buchungs-Satz hat Vorrang; fehlt er, gilt der Objekt-Satz; sonst null.
 */
export function effektiverSatz(
  buchungsSatz: number | null | undefined,
  objektSatz: number | null | undefined,
): number | null {
  if (buchungsSatz != null && buchungsSatz >= 0) return buchungsSatz;
  if (objektSatz != null && objektSatz >= 0) return objektSatz;
  return null;
}

/**
 * Kosten einer einzelnen Buchung = Minuten/60 x effektiver Satz.
 * Gibt null zurück, wenn kein Satz ermittelbar ist (dann "nicht kalkulierbar").
 */
export function buchungsKosten(
  z: ObjektZeitBasis,
  objektSatz: number | null | undefined,
): number | null {
  const satz = effektiverSatz(z.stundensatz_netto, objektSatz);
  if (satz == null) return null;
  const stunden = minutenZuStunden(z.dauer_minuten);
  return Math.round(stunden * satz * 100) / 100;
}

// --- Gruppierung je Objekt (Herzstück der Auswertung) -----------------------

export interface ObjektSumme {
  objektId: string | null;
  bezeichnung: string;
  anzahlBuchungen: number;
  minutenGesamt: number;
  minutenAbrechenbar: number;
  /** Kosten der abrechenbaren Zeit; null wenn (teilweise) kein Satz vorhanden. */
  kostenAbrechenbar: number | null;
  /** true, wenn mind. eine abrechenbare Buchung keinen Satz hatte. */
  kostenUnvollstaendig: boolean;
}

/**
 * Fasst eine Liste von Zeit-Buchungen je Objekt zusammen.
 * @param zeiten   Buchungen (aus objekt_zeiten)
 * @param objekte  bekannte Objekte (für Bezeichnung + Standard-Satz)
 * @returns Array von Objekt-Summen, absteigend nach Gesamtzeit sortiert.
 */
export function summiereJeObjekt(
  zeiten: ObjektZeitBasis[],
  objekte: ObjektBasis[],
): ObjektSumme[] {
  const objektMap = new Map<string, ObjektBasis>();
  for (const o of objekte) objektMap.set(o.id, o);

  const gruppen = new Map<string, ObjektSumme>();

  for (const z of zeiten) {
    const key = z.objekt_id ?? '__ohne__';
    const obj = z.objekt_id ? objektMap.get(z.objekt_id) : undefined;
    const objSatz = obj?.stundensatz_netto ?? null;

    let g = gruppen.get(key);
    if (!g) {
      g = {
        objektId: z.objekt_id ?? null,
        bezeichnung: obj?.bezeichnung ?? (z.objekt_id ? 'Unbekanntes Objekt' : 'Ohne Objekt'),
        anzahlBuchungen: 0,
        minutenGesamt: 0,
        minutenAbrechenbar: 0,
        kostenAbrechenbar: 0,
        kostenUnvollstaendig: false,
      };
      gruppen.set(key, g);
    }

    const min = !z.dauer_minuten || z.dauer_minuten < 0 ? 0 : z.dauer_minuten;
    g.anzahlBuchungen++;
    g.minutenGesamt += min;

    const abrechenbar = z.abrechenbar !== false; // default true
    if (abrechenbar) {
      g.minutenAbrechenbar += min;
      const k = buchungsKosten(z, objSatz);
      if (k == null) {
        g.kostenUnvollstaendig = true;
      } else if (g.kostenAbrechenbar != null) {
        g.kostenAbrechenbar += k;
      }
    }
  }

  // Wenn Kosten unvollständig sind, Kosten auf null setzen (ehrlicher als Teilsumme)
  const liste = Array.from(gruppen.values()).map((g) => ({
    ...g,
    kostenAbrechenbar: g.kostenUnvollstaendig ? null : Math.round((g.kostenAbrechenbar ?? 0) * 100) / 100,
  }));

  liste.sort((a, b) => b.minutenGesamt - a.minutenGesamt);
  return liste;
}

// --- Gesamt-Summen über alle Objekte (für Kopf-Kacheln) ---------------------

export interface GesamtSumme {
  minutenGesamt: number;
  minutenAbrechenbar: number;
  kostenAbrechenbar: number | null;
  kostenUnvollstaendig: boolean;
  anzahlBuchungen: number;
}

export function summiereGesamt(summen: ObjektSumme[]): GesamtSumme {
  const g: GesamtSumme = {
    minutenGesamt: 0,
    minutenAbrechenbar: 0,
    kostenAbrechenbar: 0,
    kostenUnvollstaendig: false,
    anzahlBuchungen: 0,
  };
  for (const s of summen) {
    g.minutenGesamt += s.minutenGesamt;
    g.minutenAbrechenbar += s.minutenAbrechenbar;
    g.anzahlBuchungen += s.anzahlBuchungen;
    if (s.kostenAbrechenbar == null) {
      g.kostenUnvollstaendig = true;
    } else if (g.kostenAbrechenbar != null) {
      g.kostenAbrechenbar += s.kostenAbrechenbar;
    }
  }
  if (g.kostenUnvollstaendig) g.kostenAbrechenbar = null;
  else if (g.kostenAbrechenbar != null) g.kostenAbrechenbar = Math.round(g.kostenAbrechenbar * 100) / 100;
  return g;
}

/** Euro-Format-Helper (deutsches Format), null -> Platzhalter. */
export function eur(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
