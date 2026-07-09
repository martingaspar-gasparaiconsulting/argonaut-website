// ============================================================================
// ARGONAUT OS · sortimentLogik.ts
// Block 2 · Welle 1 · A2 — Brennholz-Sortiment (Stammdaten-Logik)
//
// Reine Funktionen. Kein DB-Zugriff, kein React, keine Seiteneffekte.
// Setzt auf holzLogik.ts auf (Holzarten, Scheitlaengen, Formatierung).
//
// Ein "Sortiment" ist EINE verkaufbare Variante:
//     Holzart  ×  Scheitlaenge  ×  Trocknungsgrad
// Genau so, wie der Kunde am Telefon bestellt: "8 SRM Buche, 33er, trocken".
//
// Die A3-Preisliste haengt spaeter am Sortiment-Datensatz. Deshalb muss die
// Kombination eindeutig sein — dafuer sorgt der Unique-Index in der DB.
//
// DOCK-POINT: firma_id ist im Datensatz vorgesehen, wird aber noch nicht
// ausgewertet. Erweiterung bleibt additiv.
// ============================================================================

import {
  HOLZARTEN,
  SCHEITLAENGEN,
  STANDARD_HOLZART,
  STANDARD_SCHEITLAENGE,
  formatZahl,
  holzartName,
  type HolzartSchluessel,
  type PruefErgebnis,
  type Scheitlaenge,
} from './holzLogik';

// ----------------------------------------------------------------------------
// 1. TROCKNUNGSGRAD & RESTFEUCHTE
// ----------------------------------------------------------------------------

export type Trocknungsgrad = 'frisch' | 'lufttrocken' | 'kammergetrocknet';

/**
 * WICHTIG — welche Feuchte ist gemeint?
 *
 * Alle Prozentwerte hier sind die **Holzfeuchte u**, bezogen auf die
 * Trockenmasse (Darrmasse). Das ist die Groesse, auf die sich auch die
 * 1. BImSchV bezieht.
 *
 * Nicht zu verwechseln mit dem "Wassergehalt w", der sich auf die Gesamtmasse
 * bezieht und deshalb kleinere Zahlen liefert. Ein Messgeraet aus dem
 * Baumarkt zeigt in aller Regel die Holzfeuchte u an.
 */
export interface TrocknungsgradInfo {
  schluessel: Trocknungsgrad;
  name: string;
  /** Untergrenze Holzfeuchte in %, einschliesslich. */
  minProzent: number;
  /** Obergrenze Holzfeuchte in %, einschliesslich. `Infinity` = offen nach oben. */
  maxProzent: number;
  beschreibung: string;
  /** Darf so verheizt werden (1. BImSchV)? */
  brennfertig: boolean;
}

/**
 * Grenzwert der 1. BImSchV (§ 3): Scheitholz darf mit hoechstens 25 %
 * Holzfeuchte verfeuert werden. Darueber qualmt es, verrusst den Ofen und
 * ist als "ofenfertig" nicht verkehrsfaehig.
 *
 * Deshalb liegt die Grenze zwischen "lufttrocken" und "frisch" exakt hier.
 */
export const BRENNFERTIG_GRENZE_PROZENT = 25;

export const TROCKNUNGSGRADE: readonly TrocknungsgradInfo[] = [
  {
    schluessel: 'kammergetrocknet',
    name: 'Kammergetrocknet',
    minProzent: 0,
    maxProzent: 15,
    beschreibung: 'Technisch getrocknet. Sofort brennfertig, höchster Heizwert, höchster Preis.',
    brennfertig: true,
  },
  {
    schluessel: 'lufttrocken',
    name: 'Lufttrocken',
    minProzent: 15,
    maxProzent: 25,
    beschreibung: 'Ein bis zwei Jahre gelagert. Brennfertig nach 1. BImSchV. Der Standardartikel.',
    brennfertig: true,
  },
  {
    schluessel: 'frisch',
    name: 'Frisch (waldfrisch)',
    minProzent: 25,
    maxProzent: Infinity,
    beschreibung: 'Noch nicht abgelagert. Muss vor dem Verfeuern trocknen — nicht als ofenfertig verkaufen.',
    brennfertig: false,
  },
];

export const STANDARD_TROCKNUNGSGRAD: Trocknungsgrad = 'lufttrocken';

export function trocknungsgradInfo(grad: Trocknungsgrad): TrocknungsgradInfo | undefined {
  return TROCKNUNGSGRADE.find((t) => t.schluessel === grad);
}

export function trocknungsgradName(grad: Trocknungsgrad): string {
  return trocknungsgradInfo(grad)?.name ?? String(grad);
}

export function istTrocknungsgrad(wert: unknown): wert is Trocknungsgrad {
  return typeof wert === 'string' && TROCKNUNGSGRADE.some((t) => t.schluessel === wert);
}

/** Erfuellt dieser Feuchtewert die 1. BImSchV? */
export function istBrennfertig(restfeuchteProzent: number): boolean {
  return Number.isFinite(restfeuchteProzent) && restfeuchteProzent <= BRENNFERTIG_GRENZE_PROZENT;
}

/**
 * Leitet aus einem gemessenen Feuchtewert den passenden Trocknungsgrad ab.
 * Grenzen: <= 15 % kammergetrocknet, <= 25 % lufttrocken, darueber frisch.
 */
export function trocknungsgradAusRestfeuchte(restfeuchteProzent: number): Trocknungsgrad {
  if (!Number.isFinite(restfeuchteProzent)) return STANDARD_TROCKNUNGSGRAD;
  if (restfeuchteProzent <= 15) return 'kammergetrocknet';
  if (restfeuchteProzent <= BRENNFERTIG_GRENZE_PROZENT) return 'lufttrocken';
  return 'frisch';
}

/** Passt der gemessene Wert zum ausgewaehlten Grad? */
export function restfeuchtePasst(grad: Trocknungsgrad, restfeuchteProzent: number): boolean {
  const info = trocknungsgradInfo(grad);
  if (!info || !Number.isFinite(restfeuchteProzent)) return false;
  const untenOk = grad === 'kammergetrocknet' ? restfeuchteProzent >= info.minProzent : restfeuchteProzent > info.minProzent;
  return untenOk && restfeuchteProzent <= info.maxProzent;
}

/** z. B. "15–25 %" oder "über 25 %" */
export function restfeuchteBereichText(grad: Trocknungsgrad): string {
  const info = trocknungsgradInfo(grad);
  if (!info) return '—';
  if (info.maxProzent === Infinity) return `über ${formatZahl(info.minProzent, 0)} %`;
  return `${formatZahl(info.minProzent, 0)}–${formatZahl(info.maxProzent, 0)} %`;
}

// ----------------------------------------------------------------------------
// 2. DER DATENSATZ
// ----------------------------------------------------------------------------

/** Entspricht 1:1 einer Zeile in public.holz_sortiment. */
export interface Sortiment {
  id: string;
  owner_user_id: string;
  firma_id: string | null;

  holzart: HolzartSchluessel;
  scheitlaenge_cm: number;
  trocknungsgrad: Trocknungsgrad;
  restfeuchte_prozent: number | null;

  bezeichnung: string | null;
  notiz: string | null;
  aktiv: boolean;

  erstellt_am: string;
  aktualisiert_am: string;
}

/** Was das Formular ausfuellt, bevor gespeichert wird. */
export interface SortimentEntwurf {
  holzart: HolzartSchluessel;
  scheitlaenge_cm: number;
  trocknungsgrad: Trocknungsgrad;
  restfeuchte_prozent?: number | null;
  bezeichnung?: string | null;
  notiz?: string | null;
  aktiv?: boolean;
}

/** Leerer Entwurf mit sinnvollen Vorbelegungen (Schäfers Standardartikel). */
export function neuerSortimentEntwurf(): SortimentEntwurf {
  return {
    holzart: STANDARD_HOLZART,
    scheitlaenge_cm: STANDARD_SCHEITLAENGE,
    trocknungsgrad: STANDARD_TROCKNUNGSGRAD,
    restfeuchte_prozent: null,
    bezeichnung: null,
    notiz: null,
    aktiv: true,
  };
}

// ----------------------------------------------------------------------------
// 3. BEZEICHNUNGEN — ein Ort, damit ueberall dasselbe steht
// ----------------------------------------------------------------------------

/** Fuer Bildschirm und Listen: "Buche · 33 cm · lufttrocken" */
export function sortimentBezeichnung(
  holzart: HolzartSchluessel,
  scheitlaenge_cm: number,
  trocknungsgrad: Trocknungsgrad,
): string {
  return `${holzartName(holzart)} · ${scheitlaenge_cm} cm · ${trocknungsgradName(trocknungsgrad).toLowerCase()}`;
}

/** Fuer PDF, Rechnung und Lieferschein: "Buche 33 cm, lufttrocken" */
export function sortimentBezeichnungPdf(
  holzart: HolzartSchluessel,
  scheitlaenge_cm: number,
  trocknungsgrad: Trocknungsgrad,
): string {
  return `${holzartName(holzart)} ${scheitlaenge_cm} cm, ${trocknungsgradName(trocknungsgrad).toLowerCase()}`;
}

/**
 * Der Anzeigename eines Datensatzes. Eigene `bezeichnung` schlaegt die
 * automatische — Schäfer darf seine Ware nennen, wie er will.
 */
export function anzeigeName(s: Sortiment): string {
  const eigen = s.bezeichnung?.trim();
  if (eigen) return eigen;
  return sortimentBezeichnung(s.holzart, s.scheitlaenge_cm, s.trocknungsgrad);
}

/** Kleingeschriebener Suchtext fuer Filterfelder. */
export function sortimentSuchtext(s: Sortiment): string {
  return [
    anzeigeName(s),
    holzartName(s.holzart),
    `${s.scheitlaenge_cm}`,
    trocknungsgradName(s.trocknungsgrad),
    s.notiz ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

// ----------------------------------------------------------------------------
// 4. PRUEFUNG
// ----------------------------------------------------------------------------

/**
 * Prueft einen Entwurf, bevor er in die DB geht.
 *
 * Fehler   = blockierend, Speichern verhindern.
 * Hinweise = nicht blockierend, aber der Bediener soll sie sehen.
 *
 * Der wichtigste Hinweis: wenn jemand "kammergetrocknet" waehlt und 28 %
 * misst, stimmt etwas nicht. Das System rechnet dann nicht still weiter,
 * sondern sagt es.
 */
export function pruefeSortiment(e: SortimentEntwurf): PruefErgebnis {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  // Holzart
  if (!HOLZARTEN.some((h) => h.schluessel === e.holzart)) {
    fehler.push('Bitte eine Holzart auswählen.');
  }

  // Scheitlaenge
  if (!Number.isFinite(e.scheitlaenge_cm) || e.scheitlaenge_cm <= 0) {
    fehler.push('Bitte eine Scheitlänge in cm angeben.');
  } else if (e.scheitlaenge_cm < 5 || e.scheitlaenge_cm > 200) {
    fehler.push('Die Scheitlänge muss zwischen 5 und 200 cm liegen.');
  } else if (!SCHEITLAENGEN.includes(e.scheitlaenge_cm as Scheitlaenge)) {
    hinweise.push(
      `Für ${e.scheitlaenge_cm} cm ist kein eigener Umrechnungsfaktor hinterlegt — ` +
        'die Mengenumrechnung nutzt den Faktor der nächstliegenden Länge.',
    );
  }

  // Trocknungsgrad
  if (!istTrocknungsgrad(e.trocknungsgrad)) {
    fehler.push('Bitte einen Trocknungsgrad auswählen.');
  }

  // Restfeuchte (optional, aber wenn da, dann plausibel)
  const rf = e.restfeuchte_prozent;
  if (rf !== null && rf !== undefined) {
    if (!Number.isFinite(rf)) {
      fehler.push('Die Restfeuchte ist keine gültige Zahl.');
    } else if (rf < 0 || rf > 100) {
      fehler.push('Die Restfeuchte muss zwischen 0 und 100 % liegen.');
    } else if (istTrocknungsgrad(e.trocknungsgrad)) {
      // Widerspruch zwischen Auswahl und Messwert?
      if (!restfeuchtePasst(e.trocknungsgrad, rf)) {
        const passt = trocknungsgradAusRestfeuchte(rf);
        hinweise.push(
          `${formatZahl(rf, 1)} % Restfeuchte passt nicht zu „${trocknungsgradName(e.trocknungsgrad)}“ ` +
            `(${restfeuchteBereichText(e.trocknungsgrad)}). Der Wert entspricht „${trocknungsgradName(passt)}“.`,
        );
      }
      // Verkehrsfaehigkeit
      if (!istBrennfertig(rf)) {
        hinweise.push(
          `Über ${BRENNFERTIG_GRENZE_PROZENT} % Restfeuchte darf das Holz nach der 1. BImSchV ` +
            'nicht verfeuert werden. Nicht als „ofenfertig“ anbieten.',
        );
      }
    }
  } else if (e.trocknungsgrad === 'kammergetrocknet') {
    hinweise.push('Bei kammergetrocknetem Holz lohnt sich ein gemessener Feuchtewert — das rechtfertigt den Preis.');
  }

  return { ok: fehler.length === 0, fehler, hinweise };
}

/** Ein Satz für den Kunden bzw. für KiKlartext. */
export function sortimentKlartext(s: Sortiment): string {
  const teile: string[] = [anzeigeName(s)];

  const info = trocknungsgradInfo(s.trocknungsgrad);
  if (info) teile.push(info.beschreibung);

  if (s.restfeuchte_prozent !== null && s.restfeuchte_prozent !== undefined) {
    const rf = s.restfeuchte_prozent;
    teile.push(
      istBrennfertig(rf)
        ? `Gemessene Restfeuchte ${formatZahl(rf, 1)} % — brennfertig.`
        : `Gemessene Restfeuchte ${formatZahl(rf, 1)} % — noch zu feucht zum Verfeuern.`,
    );
  }

  if (!s.aktiv) teile.push('Diese Variante ist derzeit nicht im Verkauf.');

  return teile.join(' ');
}

// ----------------------------------------------------------------------------
// 5. LISTEN
// ----------------------------------------------------------------------------

/**
 * Sortierung fuer die Uebersicht: aktive zuerst, dann Holzart (in der
 * Reihenfolge von HOLZARTEN — Hartholz vor Weichholz), dann Laenge,
 * dann Trocknungsgrad (trockenstes zuerst).
 */
export function sortiereSortimente(liste: readonly Sortiment[]): Sortiment[] {
  const holzRang = new Map(HOLZARTEN.map((h, i) => [h.schluessel, i]));
  const trockenRang = new Map(TROCKNUNGSGRADE.map((t, i) => [t.schluessel, i]));

  return [...liste].sort((a, b) => {
    if (a.aktiv !== b.aktiv) return a.aktiv ? -1 : 1;

    const ha = holzRang.get(a.holzart) ?? 999;
    const hb = holzRang.get(b.holzart) ?? 999;
    if (ha !== hb) return ha - hb;

    if (a.scheitlaenge_cm !== b.scheitlaenge_cm) return a.scheitlaenge_cm - b.scheitlaenge_cm;

    const ta = trockenRang.get(a.trocknungsgrad) ?? 999;
    const tb = trockenRang.get(b.trocknungsgrad) ?? 999;
    return ta - tb;
  });
}

/** Nur die Varianten, die verkauft werden. */
export function nurAktive(liste: readonly Sortiment[]): Sortiment[] {
  return liste.filter((s) => s.aktiv);
}

/**
 * Erkennt, ob eine Variante bereits existiert — bevor die DB mit dem
 * Unique-Index dazwischenfaehrt. So sieht der Bediener einen freundlichen
 * Hinweis statt einer Datenbank-Fehlermeldung.
 */
export function findeVariante(
  liste: readonly Sortiment[],
  e: SortimentEntwurf,
  ausserId?: string,
): Sortiment | undefined {
  return liste.find(
    (s) =>
      s.id !== ausserId &&
      s.holzart === e.holzart &&
      s.scheitlaenge_cm === e.scheitlaenge_cm &&
      s.trocknungsgrad === e.trocknungsgrad,
  );
}
