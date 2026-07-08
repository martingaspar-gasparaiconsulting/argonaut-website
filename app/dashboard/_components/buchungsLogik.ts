// ============================================================================
// ARGONAUT OS · Phase 2 · Modul C · Baustein "Buchungs-Logik"
// Reine Logik — KEINE UI, KEINE externen Abhängigkeiten.
// Herzstück: Überschneidungs-Erkennung für Ressourcen-Buchungen, damit das
// Formular schon VOR dem Speichern warnen kann (die DB-EXCLUDE-Sperre ist das
// Sicherheitsnetz darunter). Dazu Status/Ampel, Zeit-Helfer, Gruppierung.
//
// Zeit-Konvention (identisch mit dem DB-Constraint):
//   Zeitraum ist [beginn, ende) — Ende EXKLUSIV. Damit sind nahtlose Termine
//   (10:00–11:00 und 11:00–12:00) KEIN Konflikt.
// ============================================================================

export type BuchungsStatus = 'geplant' | 'bestaetigt' | 'erledigt' | 'storniert';

// --- Datentypen: schlank, passen auf Zeilen aus buchungen / ressourcen -------
export interface BuchungBasis {
  id?: string;
  ressource_id?: string | null;
  titel?: string | null;
  beginn_am?: string | Date | null;   // timestamptz
  ende_am?: string | Date | null;      // timestamptz
  status?: string | null;
}

export interface RessourceBasis {
  id: string;
  bezeichnung: string;
  typ?: string | null;
  farbe?: string | null;
}

// --- Zeit-Parsing (robust) ---------------------------------------------------

/** Wandelt Date | ISO-String | null sicher in ein Date um (oder null). */
export function parseZeit(wert: Date | string | null | undefined): Date | null {
  if (!wert) return null;
  if (wert instanceof Date) return isNaN(wert.getTime()) ? null : wert;
  const d = new Date(wert);
  return isNaN(d.getTime()) ? null : d;
}

// --- Überschneidungs-Erkennung (HERZSTÜCK) -----------------------------------

/**
 * Überschneiden sich zwei Zeiträume? Ende ist EXKLUSIV (wie der DB-Constraint).
 * Regel: Überlappung genau dann, wenn aStart < bEnde UND bStart < aEnde.
 * Nahtlos aneinander (aEnde == bStart) = KEINE Überlappung.
 */
export function ueberschneidetSich(
  aStart: Date | string | null | undefined,
  aEnde: Date | string | null | undefined,
  bStart: Date | string | null | undefined,
  bEnde: Date | string | null | undefined,
): boolean {
  const as = parseZeit(aStart), ae = parseZeit(aEnde);
  const bs = parseZeit(bStart), be = parseZeit(bEnde);
  if (!as || !ae || !bs || !be) return false;
  return as.getTime() < be.getTime() && bs.getTime() < ae.getTime();
}

/**
 * Findet alle bestehenden Buchungen, die mit der geplanten kollidieren.
 * - nur dieselbe Ressource
 * - stornierte Buchungen zählen NICHT (blockieren keinen Slot)
 * - die Buchung selbst (gleiche id) wird ignoriert (wichtig beim Bearbeiten)
 *
 * @param geplant      die zu prüfende Buchung (Ressource + Zeitraum)
 * @param bestehende   alle vorhandenen Buchungen (z.B. der ganze Monat)
 * @returns Liste der kollidierenden bestehenden Buchungen (leer = frei)
 */
export function findeKonflikte(
  geplant: BuchungBasis,
  bestehende: BuchungBasis[],
): BuchungBasis[] {
  if (!geplant.ressource_id) return [];
  const gs = parseZeit(geplant.beginn_am);
  const ge = parseZeit(geplant.ende_am);
  if (!gs || !ge) return [];

  return bestehende.filter((b) => {
    if (b.ressource_id !== geplant.ressource_id) return false;
    if (b.status === 'storniert') return false;
    if (geplant.id && b.id === geplant.id) return false; // sich selbst nicht
    return ueberschneidetSich(gs, ge, b.beginn_am, b.ende_am);
  });
}

/** Kurzform: Gibt es überhaupt einen Konflikt? */
export function hatKonflikt(geplant: BuchungBasis, bestehende: BuchungBasis[]): boolean {
  return findeKonflikte(geplant, bestehende).length > 0;
}

// --- Status / Ampel ----------------------------------------------------------

const AMPEL = {
  grau:  '#8FA3BE',  // storniert / neutral
  cyan:  '#00e5ff',  // läuft gerade
  gruen: '#4CAF7D',  // heute anstehend / bestätigt zukünftig
  gold:  '#C9A84C',  // geplant zukünftig
  dim:   '#5a6b82',  // vorbei / erledigt
};

export interface BuchungsAmpel {
  farbe: string;
  label: string;
}

/**
 * Leitet aus Status + Zeit einen Anzeige-Zustand ab.
 * "läuft gerade" hat Vorrang, dann heute, dann geplant/vorbei.
 */
export function buchungsAmpel(b: BuchungBasis, jetzt: Date = new Date()): BuchungsAmpel {
  if (b.status === 'storniert') return { farbe: AMPEL.grau, label: 'Storniert' };

  const s = parseZeit(b.beginn_am);
  const e = parseZeit(b.ende_am);
  if (!s || !e) return { farbe: AMPEL.grau, label: 'Kein Zeitraum' };

  const t = jetzt.getTime();
  if (s.getTime() <= t && t < e.getTime()) return { farbe: AMPEL.cyan, label: 'Läuft gerade' };
  if (t >= e.getTime()) {
    return { farbe: AMPEL.dim, label: b.status === 'erledigt' ? 'Erledigt' : 'Vorbei' };
  }
  // Zukunft
  if (istGleicherTag(s, jetzt)) return { farbe: AMPEL.gruen, label: 'Heute' };
  return { farbe: b.status === 'bestaetigt' ? AMPEL.gruen : AMPEL.gold, label: b.status === 'bestaetigt' ? 'Bestätigt' : 'Geplant' };
}

// --- Zeit-Helfer für Anzeige -------------------------------------------------

function zwei(n: number): string { return n < 10 ? '0' + n : String(n); }

export function istGleicherTag(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** "14:30" (lokale Uhrzeit). */
export function uhrzeit(wert: Date | string | null | undefined): string {
  const d = parseZeit(wert);
  if (!d) return '—';
  return `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

/** "08.07.2026" (lokales Datum). */
export function datumKurz(wert: Date | string | null | undefined): string {
  const d = parseZeit(wert);
  if (!d) return '—';
  return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** "08.07. · 14:30–16:00" oder bei mehreren Tagen "08.07. 14:30 → 09.07. 10:00". */
export function zeitraumText(beginn: Date | string | null | undefined, ende: Date | string | null | undefined): string {
  const s = parseZeit(beginn);
  const e = parseZeit(ende);
  if (!s || !e) return '—';
  if (istGleicherTag(s, e)) {
    return `${zwei(s.getDate())}.${zwei(s.getMonth() + 1)}. · ${uhrzeit(s)}–${uhrzeit(e)}`;
  }
  return `${datumKurz(s)} ${uhrzeit(s)} → ${datumKurz(e)} ${uhrzeit(e)}`;
}

/** Dauer als Text: "2 Std 30 Min", "45 Min", "1 Tag 3 Std". */
export function dauerText(beginn: Date | string | null | undefined, ende: Date | string | null | undefined): string {
  const s = parseZeit(beginn);
  const e = parseZeit(ende);
  if (!s || !e) return '—';
  let min = Math.round((e.getTime() - s.getTime()) / 60000);
  if (min < 0) min = 0;
  const tage = Math.floor(min / 1440); min -= tage * 1440;
  const std = Math.floor(min / 60); min -= std * 60;
  const teile: string[] = [];
  if (tage > 0) teile.push(tage === 1 ? '1 Tag' : `${tage} Tage`);
  if (std > 0) teile.push(`${std} Std`);
  if (min > 0) teile.push(`${min} Min`);
  return teile.length > 0 ? teile.join(' ') : '0 Min';
}

/**
 * Baut einen ISO-Timestamp aus getrennten Datum-/Zeit-Feldern (wie im Formular).
 * datum = "YYYY-MM-DD", zeit = "HH:MM" (beide lokal interpretiert).
 * Ergebnis ist ein voller Date-Wert (lokal), den man .toISOString()-en kann.
 */
export function baueZeitpunkt(datum: string, zeit: string): Date | null {
  const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum.trim());
  const mz = /^(\d{1,2}):(\d{2})$/.exec(zeit.trim());
  if (!md || !mz) return null;
  const d = new Date(Number(md[1]), Number(md[2]) - 1, Number(md[3]), Number(mz[1]), Number(mz[2]), 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

// --- Gruppierung für die Timeline (C.3) --------------------------------------

export interface RessourceMitBuchungen {
  ressource: RessourceBasis;
  buchungen: BuchungBasis[];
}

/**
 * Gruppiert Buchungen je Ressource (für die Timeline-Darstellung).
 * Buchungen je Ressource nach Beginn sortiert. Ressourcen ohne Buchung
 * erscheinen trotzdem (leere Spur), damit die Timeline vollständig ist.
 */
export function gruppiereNachRessource(
  ressourcen: RessourceBasis[],
  buchungen: BuchungBasis[],
): RessourceMitBuchungen[] {
  const map = new Map<string, BuchungBasis[]>();
  for (const r of ressourcen) map.set(r.id, []);
  for (const b of buchungen) {
    if (b.ressource_id && map.has(b.ressource_id)) {
      map.get(b.ressource_id)!.push(b);
    }
  }
  return ressourcen.map((r) => {
    const liste = (map.get(r.id) ?? []).slice().sort((a, b) => {
      const as = parseZeit(a.beginn_am)?.getTime() ?? 0;
      const bs = parseZeit(b.beginn_am)?.getTime() ?? 0;
      return as - bs;
    });
    return { ressource: r, buchungen: liste };
  });
}

/** Zählt Buchungen eines Tages nach Ampel-Zustand (für Kopf-Kacheln). */
export function zaehleHeute(buchungen: BuchungBasis[], jetzt: Date = new Date()): {
  heute: number; laufen: number; geplant: number;
} {
  let heute = 0, laufen = 0, geplant = 0;
  for (const b of buchungen) {
    if (b.status === 'storniert') continue;
    const s = parseZeit(b.beginn_am);
    if (!s) continue;
    if (istGleicherTag(s, jetzt)) heute++;
    const a = buchungsAmpel(b, jetzt);
    if (a.label === 'Läuft gerade') laufen++;
    if (a.label === 'Geplant' || a.label === 'Bestätigt' || a.label === 'Heute') geplant++;
  }
  return { heute, laufen, geplant };
}
