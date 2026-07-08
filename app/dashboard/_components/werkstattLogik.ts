// ============================================================================
// ARGONAUT OS · Phase 2 · Modul D · Baustein "Werkstatt-Logik"
// Reine Logik — KEINE UI, KEINE externen Abhängigkeiten.
// Generisch für Kfz-Werkstatt, Reparatur-Annahme, Auftragsfertigung u.v.m.
// Rechnet Durchlaufzeit, Verweildauer je Phase (aus dem Status-Log) und die
// Dringlichkeits-Ampel (Priorität + zugesagter Termin).
// ============================================================================

// --- Die Status-Phasen: EINE zentrale Quelle für Board + Anzeige -------------
export type WerkstattStatus = 'angenommen' | 'in_arbeit' | 'wartet' | 'fertig' | 'abgeholt';

export interface StatusDef {
  wert: WerkstattStatus;
  label: string;
  farbe: string;
  /** true = Auftrag gilt als abgeschlossen (Durchlaufzeit endet). */
  abgeschlossen: boolean;
}

// Reihenfolge = Board-Spalten von links nach rechts.
export const STATUS_PHASEN: StatusDef[] = [
  { wert: 'angenommen', label: 'Angenommen', farbe: '#00e5ff', abgeschlossen: false },
  { wert: 'in_arbeit',  label: 'In Arbeit',  farbe: '#C9A84C', abgeschlossen: false },
  { wert: 'wartet',     label: 'Wartet',     farbe: '#E0A24C', abgeschlossen: false },
  { wert: 'fertig',     label: 'Fertig',     farbe: '#4CAF7D', abgeschlossen: true },
  { wert: 'abgeholt',   label: 'Abgeholt',   farbe: '#5a6b82', abgeschlossen: true },
];

export function statusDef(status: string | null | undefined): StatusDef {
  return STATUS_PHASEN.find((s) => s.wert === status) ?? STATUS_PHASEN[0];
}

/** Ist dieser Status ein abgeschlossener (fertig/abgeholt)? */
export function istAbgeschlossen(status: string | null | undefined): boolean {
  return statusDef(status).abgeschlossen;
}

// --- Datentypen: schlank, passen auf Zeilen der DB ---------------------------
export interface WerkstattBasis {
  id?: string;
  status?: string | null;
  prioritaet?: string | null;
  angenommen_am?: string | Date | null;
  fertig_am?: string | Date | null;
  zugesagt_am?: string | Date | null;   // date
}

export interface StatusLogEintrag {
  auftrag_id?: string | null;
  von_status?: string | null;
  nach_status?: string | null;
  geaendert_am?: string | Date | null;
}

// --- Zeit-Parsing ------------------------------------------------------------
export function parseZeit(wert: Date | string | null | undefined): Date | null {
  if (!wert) return null;
  if (wert instanceof Date) return isNaN(wert.getTime()) ? null : wert;
  const d = new Date(wert);
  return isNaN(d.getTime()) ? null : d;
}

// --- Dauer-Text --------------------------------------------------------------

/** Minuten -> "3 Tage 4 Std", "2 Std 15 Min", "45 Min". */
export function dauerTextMinuten(minuten: number | null | undefined): string {
  let m = !minuten || minuten < 0 ? 0 : Math.round(minuten);
  const tage = Math.floor(m / 1440); m -= tage * 1440;
  const std = Math.floor(m / 60); m -= std * 60;
  const teile: string[] = [];
  if (tage > 0) teile.push(tage === 1 ? '1 Tag' : `${tage} Tage`);
  if (std > 0) teile.push(`${std} Std`);
  if (m > 0 && tage === 0) teile.push(`${m} Min`); // Minuten nur zeigen, wenn < 1 Tag
  return teile.length > 0 ? teile.join(' ') : '0 Min';
}

/** Minuten zwischen zwei Zeitpunkten (>= 0). */
export function minutenZwischen(von: Date | string | null | undefined, bis: Date | string | null | undefined): number {
  const a = parseZeit(von), b = parseZeit(bis);
  if (!a || !b) return 0;
  const diff = Math.round((b.getTime() - a.getTime()) / 60000);
  return diff < 0 ? 0 : diff;
}

// --- Durchlaufzeit -----------------------------------------------------------

/**
 * Gesamte Durchlaufzeit eines Auftrags in Minuten.
 * Von angenommen_am bis fertig_am (falls gesetzt), sonst bis jetzt.
 */
export function durchlaufzeitMinuten(a: WerkstattBasis, jetzt: Date = new Date()): number {
  const start = parseZeit(a.angenommen_am);
  if (!start) return 0;
  const ende = istAbgeschlossen(a.status) ? (parseZeit(a.fertig_am) ?? jetzt) : jetzt;
  return minutenZwischen(start, ende);
}

/** Durchlaufzeit als Text. */
export function durchlaufzeitText(a: WerkstattBasis, jetzt: Date = new Date()): string {
  return dauerTextMinuten(durchlaufzeitMinuten(a, jetzt));
}

// --- Verweildauer je Phase (aus dem Status-Log) ------------------------------

export interface PhasenDauer {
  status: string;
  label: string;
  farbe: string;
  minuten: number;
}

/**
 * Rekonstruiert aus dem Status-Log, wie lange ein Auftrag in jeder Phase lag.
 * Prinzip: zwischen zwei Log-Einträgen liegt die Verweildauer im "nach_status"
 * des früheren Eintrags. Der letzte Abschnitt läuft bis fertig_am bzw. jetzt.
 *
 * @param auftrag  der Auftrag (für Start + Ende)
 * @param log      alle Log-Einträge DIESES Auftrags (beliebige Reihenfolge)
 */
export function verweildauerJePhase(
  auftrag: WerkstattBasis,
  log: StatusLogEintrag[],
  jetzt: Date = new Date(),
): PhasenDauer[] {
  const start = parseZeit(auftrag.angenommen_am);
  if (!start) return [];

  // Log nach Zeit sortieren
  const sortiert = log
    .map((e) => ({ nach: e.nach_status ?? null, zeit: parseZeit(e.geaendert_am) }))
    .filter((e) => e.zeit !== null)
    .sort((a, b) => (a.zeit!.getTime() - b.zeit!.getTime()));

  // Segmente bauen: (Status, ab-Zeitpunkt)
  type Seg = { status: string; ab: Date };
  const segmente: Seg[] = [];
  // Erster Abschnitt: der Anfangsstatus ab angenommen_am.
  // Anfangsstatus = "von_status" des ersten Log-Eintrags, sonst der erste "nach".
  const erstesVon = log
    .map((e) => ({ von: e.von_status ?? null, zeit: parseZeit(e.geaendert_am) }))
    .filter((e) => e.zeit !== null)
    .sort((a, b) => (a.zeit!.getTime() - b.zeit!.getTime()))[0]?.von;
  const startStatus = erstesVon || sortiert[0]?.nach || auftrag.status || 'angenommen';
  segmente.push({ status: startStatus, ab: start });
  for (const e of sortiert) {
    if (e.nach) segmente.push({ status: e.nach, ab: e.zeit! });
  }

  const ende = istAbgeschlossen(auftrag.status) ? (parseZeit(auftrag.fertig_am) ?? jetzt) : jetzt;

  // Minuten je Status aufsummieren
  const summe = new Map<string, number>();
  for (let i = 0; i < segmente.length; i++) {
    const ab = segmente[i].ab;
    const bis = i + 1 < segmente.length ? segmente[i + 1].ab : ende;
    const min = minutenZwischen(ab, bis);
    summe.set(segmente[i].status, (summe.get(segmente[i].status) ?? 0) + min);
  }

  // In der Reihenfolge der Phasen ausgeben (nur Phasen mit Dauer > 0)
  const ergebnis: PhasenDauer[] = [];
  for (const p of STATUS_PHASEN) {
    const min = summe.get(p.wert) ?? 0;
    if (min > 0) ergebnis.push({ status: p.wert, label: p.label, farbe: p.farbe, minuten: min });
  }
  return ergebnis;
}

// --- Dringlichkeits-Ampel ----------------------------------------------------

const AMPEL = { rot: '#E06666', gelb: '#E0A24C', gruen: '#4CAF7D', grau: '#8FA3BE', dringend: '#A855F7' };

export interface DringAmpel {
  farbe: string;
  label: string;
}

/**
 * Kombiniert Priorität + zugesagten Termin zu einer Ampel.
 * - abgeschlossen -> neutral
 * - dringend -> immer lila-rot Signal
 * - zugesagter Termin überschritten -> rot
 * - Termin heute/morgen -> gelb
 * - sonst grün (bzw. nach Priorität)
 */
export function dringlichkeitsAmpel(a: WerkstattBasis, jetzt: Date = new Date()): DringAmpel {
  if (istAbgeschlossen(a.status)) return { farbe: AMPEL.grau, label: 'Abgeschlossen' };

  const zugesagt = parseZeit(a.zugesagt_am);
  if (zugesagt) {
    const heuteMitternacht = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate()).getTime();
    const zielMitternacht = new Date(zugesagt.getFullYear(), zugesagt.getMonth(), zugesagt.getDate()).getTime();
    const tage = Math.round((zielMitternacht - heuteMitternacht) / 86400000);
    if (tage < 0) return { farbe: AMPEL.rot, label: `Termin ${Math.abs(tage)} T überzogen` };
    if (tage === 0) return { farbe: AMPEL.rot, label: 'Termin heute' };
    if (tage === 1) return { farbe: AMPEL.gelb, label: 'Termin morgen' };
    if (tage <= 3) return { farbe: AMPEL.gelb, label: `Termin in ${tage} T` };
  }

  if (a.prioritaet === 'dringend') return { farbe: AMPEL.dringend, label: 'Dringend' };
  if (a.prioritaet === 'hoch') return { farbe: AMPEL.gelb, label: 'Hohe Priorität' };
  return { farbe: AMPEL.gruen, label: 'Im Plan' };
}

// --- Board-Gruppierung -------------------------------------------------------

export interface SpalteMitAuftraegen<T extends WerkstattBasis> {
  def: StatusDef;
  auftraege: T[];
}

/** Gruppiert Aufträge in die Board-Spalten (in Phasen-Reihenfolge). */
export function gruppiereBoard<T extends WerkstattBasis>(auftraege: T[]): SpalteMitAuftraegen<T>[] {
  return STATUS_PHASEN.map((def) => ({
    def,
    auftraege: auftraege.filter((a) => (a.status ?? 'angenommen') === def.wert),
  }));
}

/** Nächster Status in der Kette (für "weiterrücken"-Button). null = schon am Ende. */
export function naechsterStatus(status: string | null | undefined): WerkstattStatus | null {
  const idx = STATUS_PHASEN.findIndex((s) => s.wert === status);
  if (idx < 0 || idx >= STATUS_PHASEN.length - 1) return null;
  return STATUS_PHASEN[idx + 1].wert;
}

/** Zählt offene (nicht abgeschlossene) Aufträge. */
export function zaehleOffen(auftraege: WerkstattBasis[]): number {
  return auftraege.filter((a) => !istAbgeschlossen(a.status)).length;
}
