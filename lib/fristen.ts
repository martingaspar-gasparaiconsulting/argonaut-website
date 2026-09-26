// lib/fristen.ts
// ============================================================================
// A7 · Kanzlei — Akten & Fristen — reine Formeln & Logik.
// KEINE Hooks, KEINE Supabase-Aufrufe.
//
// Anwaltliche Fristenkontrolle: jede Frist hat eine Vorfrist (Vorwarnfenster).
// Regelverjährung §195 BGB: 3 Jahre, Beginn Schluss des Jahres der Entstehung (§199).
//
// ▄▄▄ REPARATUR PUNKT 21 (18.09.2026) ▄▄▄
// Der Kopf dieser Datei behauptete "Node-getestet (fristen.test.mjs, 11/11)".
// Diese Testdatei gibt es im Repo NICHT. Genau wie bei lib/bankAbgleich.ts
// (Punkt 18) stand die Zusage da, die Tests nie.
//
// DER FEHLER, GEMESSEN: tagUTC las sein Datum mit String(v).slice(0,4). Bei
// einem Date-OBJEKT ergibt String(v) "Thu Sep 18 2026 …", slice(0,4) ist also
// "Thu " und Number("Thu ") ist NaN. Die Signatur versprach string | Date —
// geliefert hat sie nur bei string.
//
// WAS DAS IN DER KANZLEI ANRICHTETE: app/dashboard/fristen/page.tsx uebergibt
// an DREI Stellen ausdruecklich new Date():
//   · zaehleFristen(fristen, new Date())      -> ueberfaellig 0, vorfrist 0
//   · fristStatus(..., new Date())             -> IMMER 'offen', also gruen
//   · restTage(f.frist_datum, new Date())      -> NaN
// Ergebnis auf dem Bildschirm: jede Frist stand auf "offen" in Gruen, in der
// Spalte darunter "in NaN T", und die Kachel "ueberfaellig" zeigte 0 — auch
// bei einer seit Wochen abgelaufenen NOTFRIST. Die gedruckte Fristenliste
// sortierte nach NaN, also gar nicht. Fuer eine Kanzlei ist das der Fall, in
// dem die Software den Haftungsfall nicht meldet, sondern verdeckt.
//
// AUSSERDEM GEFUNDEN:
//   · verjaehrungEnde(new Date(...)) ergab den Text "NaN-12-31" — ein
//     Verjaehrungsende, das so in die Akte haette wandern koennen.
//   · Ein Datum in deutscher Schreibweise ("01.10.2026") wurde klaglos als
//     Jahr 1.1 / Monat 0.2 gelesen und landete rund 2000 Jahre in der
//     Vergangenheit: es galt als ueberfaellig. Ein leeres Datum dagegen galt
//     als 'offen'. Zwei unlesbare Datumsangaben, zwei verschiedene Luegen.
//
// GRUNDREGEL DIESER REPARATUR: In einer Fristenkontrolle ist "gruen" die
// gefaehrliche Richtung. Was nicht lesbar ist, gilt jetzt als UEBERFAELLIG
// und wird in fristenHinweise() beim Namen genannt — lieber ein Fehlalarm,
// den jemand ansieht, als eine verpasste Notfrist.
//
// NICHT GEAENDERT: FristStatus bleibt bei seinen fuenf Werten. Die Seite hat
// ein Record<FristStatus, …> — ein sechster Wert haette den Build zerlegt.
// ============================================================================

export const VORFRIST_TAGE_STD = 7;

export const FRIST_ARTEN = ['notfrist', 'verjaehrung', 'wiedervorlage', 'termin', 'sonstige'] as const;
export type FristArt = typeof FRIST_ARTEN[number];

const MS_TAG = 86400000;

/**
 * Datums-Anteil als UTC-Mitternacht. Beide Formen werden unterstuetzt:
 *  - Text "YYYY-MM-DD" (auch mit Uhrzeit dahinter) — streng geprueft
 *  - Date-Objekt — ueber die LOKALEN Getter, damit der 18.09. um 00:30 in
 *    Berlin nicht zum 17.09. wird
 * Alles andere ergibt NaN, und das wird ab hier ueberall abgefangen.
 */
function tagUTC(v: unknown): number {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return NaN;
    return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const m = String(v ?? '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  const t = Date.UTC(y, mo - 1, d);
  // Den 31.02. gibt es nicht — Date.UTC rollt still weiter, das faellt hier auf.
  const zurueck = new Date(t);
  if (zurueck.getUTCMonth() !== mo - 1 || zurueck.getUTCDate() !== d) return NaN;
  return t;
}

/** Ist diese Datumsangabe ueberhaupt lesbar? */
export function istFristDatum(v: unknown): boolean {
  return !Number.isNaN(tagUTC(v));
}

/** Ganze Tage zwischen zwei Datumsangaben (Datums-Anteil, DST-sicher). NaN, wenn eine Seite unlesbar ist. */
export function tageDiff(von: string | Date, bis: string | Date): number {
  const a = tagUTC(von), b = tagUTC(bis);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / MS_TAG);
}

/** Verbleibende Tage bis zur Frist (positiv = Zukunft, negativ = überfällig). */
export function restTage(fristDatum: string | Date, heute: string | Date = new Date()): number {
  return tageDiff(heute, fristDatum);
}

export type FristStatus = 'erledigt' | 'ueberfaellig' | 'heute' | 'vorfrist' | 'offen';

/**
 * Ampel-Status einer Frist unter Berücksichtigung der Vorfrist.
 * Ein unlesbares Fristdatum gilt als UEBERFAELLIG, nicht als offen — siehe
 * Grundregel im Kopf der Datei.
 */
export function fristStatus(
  fristDatum: string | Date, vorfristTage: number = VORFRIST_TAGE_STD,
  erledigt = false, heute: string | Date = new Date(),
): FristStatus {
  if (erledigt) return 'erledigt';
  const r = restTage(fristDatum, heute);
  if (Number.isNaN(r)) return 'ueberfaellig';
  if (r < 0) return 'ueberfaellig';
  if (r === 0) return 'heute';
  const vf = Number.isFinite(Number(vorfristTage)) && Number(vorfristTage) >= 0
    ? Number(vorfristTage) : VORFRIST_TAGE_STD;
  if (r <= vf) return 'vorfrist';
  return 'offen';
}

/**
 * Regelverjährungs-Ende (§195/§199 BGB): 31.12. des Jahres Entstehung + jahre
 * (Default 3). Unlesbare Eingabe ergibt einen LEEREN Text — frueher stand hier
 * "NaN-12-31", und das haette so in der Akte stehen koennen.
 *
 * ACHTUNG, RECHTLICH: Die Regel "Schluss des Jahres" gilt fuer die
 * REGELVERJAEHRUNG nach §195/§199 BGB. Andere Fristen (etwa die dreissig
 * Jahre nach §197 BGB) laufen taggenau ab Entstehung, nicht zum Jahresende.
 * Diese Funktion rechnet weiterhin zum Jahresende — wer `jahre` veraendert,
 * bekommt dazu einen Hinweis aus fristenHinweise(). Ob im Einzelfall die
 * Kenntnis des Glaeubigers (§199 Abs. 1 Nr. 2) den Beginn verschiebt, kann
 * der Code nicht wissen; das gehoert auf die Anwalts-Checkliste.
 */
export function verjaehrungEnde(entstehungDatum: string | Date, jahre = 3): string {
  const t = tagUTC(entstehungDatum);
  if (Number.isNaN(t)) return '';
  const j = Math.trunc(Number(jahre));
  if (!Number.isFinite(j)) return '';
  return `${new Date(t).getUTCFullYear() + j}-12-31`;
}

export interface FristKennzahlen {
  offen: number;
  ueberfaellig: number;
  vorfrist: number;
  erledigt: number;
  /** Ab Punkt 21, additiv: offene Fristen mit unlesbarem Datum. Sie sind in
   *  `ueberfaellig` MIT gezaehlt, damit Kachel und Ampel dasselbe sagen. */
  unlesbar: number;
}

export interface FristZeile {
  frist_datum: string;
  vorfrist_tage?: number | null;
  erledigt?: boolean;
  art?: string | null;
  bezeichnung?: string | null;
}

/** KPI-Zähler über eine Liste Fristen (vorfrist inkl. heute fällig). */
export function zaehleFristen(
  fristen: FristZeile[],
  heute: string | Date = new Date(),
): FristKennzahlen {
  const offenL = (fristen || []).filter((f) => !f.erledigt);
  let ueberfaellig = 0, vorfrist = 0, unlesbar = 0;
  for (const f of offenL) {
    const r = restTage(f.frist_datum, heute);
    if (Number.isNaN(r)) { unlesbar++; ueberfaellig++; continue; }
    const vf = f.vorfrist_tage ?? VORFRIST_TAGE_STD;
    if (r < 0) ueberfaellig++;
    else if (r <= vf) vorfrist++;
  }
  return { offen: offenL.length, ueberfaellig, vorfrist, erledigt: (fristen || []).length - offenL.length, unlesbar };
}

/**
 * Klartext fuer die Fristenliste. Aendert nichts, rechnet nichts um.
 * NOCH NICHT auf der Seite angezeigt — Andockpunkt, gebuendelt mit
 * staffelUnstimmigkeiten / extfHinweise / ustvaHinweise / bankHinweise /
 * wiederkehrHinweise.
 */
export function fristenHinweise(
  fristen: FristZeile[],
  heute: string | Date = new Date(),
  verjaehrungJahre?: number,
): string[] {
  const h: string[] = [];
  const offenL = (fristen || []).filter((f) => !f.erledigt);

  const kaputt = offenL.filter((f) => !istFristDatum(f.frist_datum));
  if (kaputt.length > 0) {
    const namen = kaputt.map((f) => `${f.bezeichnung || 'ohne Bezeichnung'} ("${f.frist_datum}")`).join(', ');
    h.push(`${kaputt.length} Frist${kaputt.length === 1 ? '' : 'en'} mit unlesbarem Datum. Sie werden als ueberfaellig gefuehrt, bis das Datum steht: ${namen}.`);
  }

  const ueberfaellig = offenL.filter((f) => istFristDatum(f.frist_datum) && restTage(f.frist_datum, heute) < 0);
  const notfristUeber = ueberfaellig.filter((f) => f.art === 'notfrist');
  if (notfristUeber.length > 0) {
    h.push(`${notfristUeber.length} NOTFRIST${notfristUeber.length === 1 ? '' : 'EN'} ist ueberfaellig: ${notfristUeber.map((f) => f.bezeichnung || 'ohne Bezeichnung').join(', ')}.`);
  }
  const restUeber = ueberfaellig.length - notfristUeber.length;
  if (restUeber > 0) h.push(`${restUeber} weitere ueberfaellige Frist${restUeber === 1 ? '' : 'en'}.`);

  const notfristOhneVorfrist = offenL.filter((f) => f.art === 'notfrist' && (f.vorfrist_tage ?? VORFRIST_TAGE_STD) <= 0);
  if (notfristOhneVorfrist.length > 0) {
    h.push(`${notfristOhneVorfrist.length} Notfrist${notfristOhneVorfrist.length === 1 ? '' : 'en'} ohne Vorfrist — es gibt keine Vorwarnung, nur die Frist selbst.`);
  }

  if (verjaehrungJahre !== undefined && Math.trunc(Number(verjaehrungJahre)) !== 3) {
    h.push(`Der Verjaehrungs-Rechner ist auf ${verjaehrungJahre} Jahre gestellt. Die Regel "Ende zum 31.12." gilt fuer die Regelverjaehrung nach §195/§199 BGB; andere Fristen (z. B. §197 BGB) laufen taggenau ab Entstehung. Bitte pruefen.`);
  }
  return h;
}

/**
 * F21 (26.09.2026) — Monatsfrist ab einem Ereignistag (z. B. Eingang einer
 * DSGVO-Anfrage, Art. 12 Abs. 3 DSGVO; Rechnung wie § 188 Abs. 2 und 3 BGB):
 * gleiche Tageszahl n Monate spaeter; gibt es den Tag im Zielmonat nicht,
 * endet die Frist am letzten Tag dieses Monats (31.01. -> 28./29.02.).
 * Rein mit Zeichenketten gerechnet — keine Zeitzone, kein toISOString.
 * Vorher (dsgvo/page.tsx) lag die Frist in Deutschland 1 Tag zu frueh
 * (Mitternacht Ortszeit -> UTC-Vortag) und lief bei 31.01. in den Maerz.
 */
export function monatsFristEnde(iso: string, monate = 1): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return '';
  const j = Number(m[1]), mo = Number(m[2]), t = Number(m[3]);
  const ziel = (mo - 1) + monate;
  const zj = j + Math.floor(ziel / 12);
  const zm = ((ziel % 12) + 12) % 12; // 0-basiert
  const letzter = new Date(Date.UTC(zj, zm + 1, 0)).getUTCDate();
  const zt = Math.min(t, letzter);
  return `${zj}-${String(zm + 1).padStart(2, '0')}-${String(zt).padStart(2, '0')}`;
}
