// ============================================================================
// ARGONAUT OS · app/dashboard/_components/slotLogik.ts
// Slot-Gehirn: rechnet aus Öffnungszeiten − Blockaden = freie Slots.
//
//   Freie Slots = verfuegbarkeiten (Regel-Fenster)
//                 − Feiertage (live, lib/feiertage.ts)
//                 − Abwesenheiten (hr_abwesenheiten, live)
//                 − Sperren (verfuegbarkeiten art='sperre')
//                 − Kapazität durch gebuchte termine
//
// Reine Logik, KEINE UI, KEINE DB-Zugriffe. Bekommt alle Daten übergeben.
// Zeit-Konvention [beginn, ende) mit EXKLUSIVEM Ende — identisch zu buchungsLogik.
// ============================================================================

import { ueberschneidetSich, parseZeit } from './buchungsLogik';
import { istFeiertag } from '@/lib/feiertage';

// --- Eingangs-Datentypen (passen auf die DB-Zeilen) -------------------------

export interface VerfuegbarkeitRow {
  id?: string;
  ebene?: string | null;              // 'betrieb' | 'mitarbeiter'
  mitarbeiter_id?: string | null;
  art?: string | null;                // 'regel' | 'sperre'
  wochentag?: number | null;          // 0=So .. 6=Sa
  datum_von?: string | null;          // 'YYYY-MM-DD' (bei Sperre)
  datum_bis?: string | null;
  ganztags?: boolean | null;
  von_uhrzeit?: string | null;        // 'HH:MM' oder 'HH:MM:SS'
  bis_uhrzeit?: string | null;
  kapazitaet?: number | null;
  ueberbuchung_erlaubt?: boolean | null;
  aktiv?: boolean | null;
  titel?: string | null;
}

export interface TerminRow {
  id?: string;
  mitarbeiter_id?: string | null;
  beginn_am?: string | Date | null;
  ende_am?: string | Date | null;
  status?: string | null;
}

export interface AbwesenheitRow {
  mitarbeiter_id?: string | null;
  von?: string | null;               // date 'YYYY-MM-DD'
  bis?: string | null;               // date 'YYYY-MM-DD'
  status?: string | null;
}

export interface TerminArt {
  modus?: string | null;             // 'fix' | 'spanne' | 'mehrtaegig'
  dauer_minuten?: number | null;
  dauer_min_minuten?: number | null;
  dauer_max_minuten?: number | null;
  std_pro_tag?: number | null;
  puffer_minuten?: number | null;
  kapazitaet?: number | null;
}

// --- Ausgangs-Datentypen -----------------------------------------------------

export interface Slot {
  datum: string;                     // 'YYYY-MM-DD' (lokal)
  beginn: Date;
  ende: Date;
  mitarbeiter_id: string | null;     // null = betriebsweit
  kapazitaet: number;
  belegt: number;
  frei: boolean;
  ueberbuchung: boolean;             // true = keine harte Kapazitätsgrenze
}

export interface TagInfo {
  datum: string;
  wochentag: number;
  buchbar: boolean;
  grund?: string;                    // warum ein Tag blockiert ist (interne Sicht)
  slots: Slot[];
}

export interface SlotErgebnis {
  tage: TagInfo[];
  slots: Slot[];                     // flach über alle Tage (nur die realen Slots)
  hinweis?: string;                  // z.B. bei modus='mehrtaegig'
}

export interface SlotParams {
  von: string | Date;               // Bereichsstart (Tag, inklusive)
  bis: string | Date;               // Bereichsende (Tag, inklusive)
  verfuegbarkeiten: VerfuegbarkeitRow[];
  termine?: TerminRow[];
  abwesenheiten?: AbwesenheitRow[];
  bundesland?: string | null;
  art: TerminArt;                   // gewählte Termin-Art (Dauer/Modus/Puffer)
  mitarbeiterId?: string | null;    // gesetzt = nur dieser MA; sonst betriebsweit
  dauerMinutenOverride?: number;    // bei modus='spanne': gewählte Dauer
  jetzt?: Date;                     // Vergangenheit ausblenden
}

// --- kleine Datums-/Zeit-Helfer ---------------------------------------------

function pad(n: number): string { return n < 10 ? '0' + n : String(n); }

function isoLokal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function zuDatumStr(w: string | Date): string {
  if (w instanceof Date) return isoLokal(w);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(w.trim());
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(w);
  return isNaN(d.getTime()) ? '' : isoLokal(d);
}

/** 'HH:MM' | 'HH:MM:SS' -> Minuten seit Mitternacht (oder null). */
function uhrzeitZuMinuten(z: string | null | undefined): number | null {
  if (!z) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(z.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 'YYYY-MM-DD' + Minuten -> lokales Date. */
function tagPlusMinuten(datum: string, minuten: number): Date {
  const [y, mo, d] = datum.split('-').map(Number);
  return new Date(y, mo - 1, d, Math.floor(minuten / 60), minuten % 60, 0, 0);
}

/** Alle Tage 'YYYY-MM-DD' im Bereich [von, bis] inklusive. */
function tageImBereich(vonStr: string, bisStr: string): string[] {
  const [vy, vm, vd] = vonStr.split('-').map(Number);
  const [by, bm, bd] = bisStr.split('-').map(Number);
  const start = new Date(vy, vm - 1, vd);
  const ende = new Date(by, bm - 1, bd);
  const out: string[] = [];
  let cur = start;
  let schutz = 0;
  while (cur.getTime() <= ende.getTime() && schutz < 400) {
    out.push(isoLokal(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    schutz++;
  }
  return out;
}

// --- Intervall-Subtraktion (für zeitlich begrenzte Sperren) ------------------

interface Fenster { start: number; ende: number; } // ms-Zeitstempel

function subtrahiere(fenster: Fenster[], bloecke: Fenster[]): Fenster[] {
  let result = fenster.slice();
  for (const b of bloecke) {
    const next: Fenster[] = [];
    for (const f of result) {
      if (b.ende <= f.start || b.start >= f.ende) { next.push(f); continue; } // keine Überlappung
      if (b.start > f.start) next.push({ start: f.start, ende: b.start });
      if (b.ende < f.ende) next.push({ start: b.ende, ende: f.ende });
      // vollständig überdeckt -> fällt weg
    }
    result = next;
  }
  return result;
}

// --- Status-Regeln -----------------------------------------------------------

/** Belegt dieser Termin einen Slot? (abgesagt/storniert/verschoben nicht) */
function terminBelegt(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  return !(s === 'abgesagt' || s === 'storniert' || s === 'verschoben');
}

/** Blockiert diese Abwesenheit? (abgelehnt/storniert/abgesagt nicht) */
function abwesenheitBlockt(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase();
  return !(s === 'abgelehnt' || s === 'storniert' || s === 'abgesagt');
}

// --- Slot-Länge aus Termin-Art -----------------------------------------------

function slotLaenge(art: TerminArt, override?: number): { minuten: number | null; mehrtaegig: boolean } {
  if (override && override > 0) return { minuten: override, mehrtaegig: false };
  const modus = (art.modus ?? 'fix').toLowerCase();
  if (modus === 'mehrtaegig') return { minuten: null, mehrtaegig: true };
  if (modus === 'spanne') {
    const m = art.dauer_min_minuten ?? null;
    return { minuten: m && m > 0 ? m : null, mehrtaegig: false };
  }
  // fix
  const d = art.dauer_minuten ?? null;
  return { minuten: d && d > 0 ? d : null, mehrtaegig: false };
}

// --- Hauptfunktion -----------------------------------------------------------

export function berechneSlots(params: SlotParams): SlotErgebnis {
  const vonStr = zuDatumStr(params.von);
  const bisStr = zuDatumStr(params.bis);
  const jetzt = params.jetzt ?? new Date();
  const maId = params.mitarbeiterId ?? null;
  const termine = params.termine ?? [];
  const abwesenheiten = params.abwesenheiten ?? [];
  const verf = (params.verfuegbarkeiten ?? []).filter((v) => v.aktiv !== false);

  const { minuten: slotMin, mehrtaegig } = slotLaenge(params.art, params.dauerMinutenOverride);
  const pufferMin = Math.max(0, params.art.puffer_minuten ?? 0);

  if (mehrtaegig) {
    return { tage: [], slots: [], hinweis: 'Mehrtägige Termin-Art — Planung erfolgt im Dispo-Board (Field Service).' };
  }
  if (!slotMin || slotMin <= 0 || !vonStr || !bisStr) {
    return { tage: [], slots: [], hinweis: 'Keine gültige Slot-Länge/Zeitraum.' };
  }

  const tage: TagInfo[] = [];
  const alleSlots: Slot[] = [];

  for (const datum of tageImBereich(vonStr, bisStr)) {
    const [y, mo, d] = datum.split('-').map(Number);
    const wtag = new Date(y, mo - 1, d).getDay(); // 0=So..6=Sa

    // 1) Feiertag -> ganzer Tag raus
    const feier = istFeiertag(datum, params.bundesland);
    if (feier) {
      tage.push({ datum, wochentag: wtag, buchbar: false, grund: `Feiertag: ${feier.name}`, slots: [] });
      continue;
    }

    // 2) Abwesenheit des MA (nur im MA-Modus relevant)
    if (maId) {
      const abw = abwesenheiten.find((a) =>
        a.mitarbeiter_id === maId && abwesenheitBlockt(a.status) &&
        a.von && a.bis && datum >= zuDatumStr(a.von) && datum <= zuDatumStr(a.bis),
      );
      if (abw) {
        tage.push({ datum, wochentag: wtag, buchbar: false, grund: 'Abwesend', slots: [] });
        continue;
      }
    }

    // 3) Regel-Fenster für diesen Wochentag sammeln (MA überschreibt Betrieb)
    const regeln = verf.filter((v) => (v.art ?? 'regel') === 'regel' && v.wochentag === wtag);
    let genutzt: VerfuegbarkeitRow[];
    if (maId) {
      const maRegeln = regeln.filter((v) => v.ebene === 'mitarbeiter' && v.mitarbeiter_id === maId);
      genutzt = maRegeln.length > 0 ? maRegeln : regeln.filter((v) => (v.ebene ?? 'betrieb') === 'betrieb');
    } else {
      genutzt = regeln.filter((v) => (v.ebene ?? 'betrieb') === 'betrieb');
    }

    if (genutzt.length === 0) {
      tage.push({ datum, wochentag: wtag, buchbar: false, grund: 'Keine Öffnungszeit', slots: [] });
      continue;
    }

    // 4) Ganztägige Sperren (Betrieb blockt alle; MA blockt nur diesen MA)
    const sperren = verf.filter((v) => (v.art ?? '') === 'sperre' &&
      v.datum_von && v.datum_bis && datum >= zuDatumStr(v.datum_von) && datum <= zuDatumStr(v.datum_bis) &&
      (v.ebene === 'betrieb' || (maId && v.ebene === 'mitarbeiter' && v.mitarbeiter_id === maId)),
    );
    const ganztagsSperre = sperren.find((s) => s.ganztags !== false && !s.von_uhrzeit);
    if (ganztagsSperre) {
      tage.push({ datum, wochentag: wtag, buchbar: false, grund: `Gesperrt${ganztagsSperre.titel ? ': ' + ganztagsSperre.titel : ''}`, slots: [] });
      continue;
    }

    // zeitlich begrenzte Sperren -> als Blöcke
    const bloecke: Fenster[] = [];
    for (const s of sperren) {
      const vm = uhrzeitZuMinuten(s.von_uhrzeit);
      const bm = uhrzeitZuMinuten(s.bis_uhrzeit);
      if (vm != null && bm != null && bm > vm) {
        bloecke.push({ start: tagPlusMinuten(datum, vm).getTime(), ende: tagPlusMinuten(datum, bm).getTime() });
      }
    }

    // 5) Slots je Regel-Fenster erzeugen
    const tagSlots: Slot[] = [];
    for (const fenster of genutzt) {
      const vm = uhrzeitZuMinuten(fenster.von_uhrzeit);
      const bm = uhrzeitZuMinuten(fenster.bis_uhrzeit);
      if (vm == null || bm == null || bm <= vm) continue;

      const kapazitaet = params.art.kapazitaet ?? fenster.kapazitaet ?? 1;
      const ueberbuchung = fenster.ueberbuchung_erlaubt === true;

      // Fenster minus zeitliche Sperren
      const roh: Fenster[] = [{ start: tagPlusMinuten(datum, vm).getTime(), ende: tagPlusMinuten(datum, bm).getTime() }];
      const rest = subtrahiere(roh, bloecke);

      const stepMs = (slotMin + pufferMin) * 60000;
      const slotMs = slotMin * 60000;

      for (const f of rest) {
        let sMs = f.start;
        let schutz = 0;
        while (sMs + slotMs <= f.ende && schutz < 500) {
          const beginn = new Date(sMs);
          const ende = new Date(sMs + slotMs);

          // Belegung durch Termine zählen
          let belegt = 0;
          for (const t of termine) {
            if (!terminBelegt(t.status)) continue;
            if (maId && t.mitarbeiter_id !== maId) continue;
            if (ueberschneidetSich(beginn, ende, t.beginn_am, t.ende_am)) belegt++;
          }

          const inVergangenheit = ende.getTime() <= jetzt.getTime();
          const frei = !inVergangenheit && (ueberbuchung || belegt < kapazitaet);

          const slot: Slot = { datum, beginn, ende, mitarbeiter_id: maId, kapazitaet, belegt, frei, ueberbuchung };
          tagSlots.push(slot);
          alleSlots.push(slot);
          sMs += stepMs;
          schutz++;
        }
      }
    }

    tagSlots.sort((a, b) => a.beginn.getTime() - b.beginn.getTime());
    tage.push({ datum, wochentag: wtag, buchbar: tagSlots.some((s) => s.frei), slots: tagSlots });
  }

  return { tage, slots: alleSlots };
}

// --- Bequeme Zusatz-Helfer für die UI ---------------------------------------

/** Nur die freien Slots (für Kunden-/Buchungsansicht). */
export function nurFreie(erg: SlotErgebnis): Slot[] {
  return erg.slots.filter((s) => s.frei);
}

/** Gruppiert Slots nach Tag (für Kalender-Spalten). */
export function slotsNachTag(slots: Slot[]): Map<string, Slot[]> {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const arr = map.get(s.datum) ?? [];
    arr.push(s);
    map.set(s.datum, arr);
  }
  return map;
}
