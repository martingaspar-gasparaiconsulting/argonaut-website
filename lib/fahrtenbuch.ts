// ============================================================================
// ARGONAUT OS · lib/fahrtenbuch.ts — F1b Fahrtenbuch und Ladestrom (Paket 290)
//
// Fahrtenbuch je Fahrzeug: jede Fahrt mit Datum, km Beginn/Ende, Art
// (dienstlich, privat, Arbeitsweg), bei Dienstfahrten Ziel und Zweck.
// Lückenlos (die Software zeigt Lücken und Überschneidungen), zeitnah (spät
// nachgetragene Fahrten werden gekennzeichnet), nachträglich nur mit Grund
// änderbar (die Datenbank protokolliert alt/neu), abgeschlossene Monate gesperrt.
// Ob ein Fahrtenbuch steuerlich anerkannt wird, entscheidet das Finanzamt —
// die Software liefert die Voraussetzungen, keine Zusage.
//
// Ladestrom zu Hause: kWh aus Zählerständen × Preis je kWh laut Stromvertrag.
// Keine festen Pauschalen im Code — was erstattet wird, klärt der Betrieb mit
// seinem Steuerberater.
//
// Rein (nur lib/zahlen), node-getestet (tests/fahrtenbuchP290).
// ============================================================================

import { leseZahl, rundeStellen } from './zahlen';

export const ARTEN = [
  { key: 'dienst', label: 'Dienstfahrt' },
  { key: 'privat', label: 'Privatfahrt' },
  { key: 'arbeitsweg', label: 'Wohnung – Arbeitsstätte' },
] as const;
export type Art = typeof ARTEN[number]['key'];
export const NACHTRAG_TAGE = 7;
export const MAX_STRECKE = 5000;

export function istIso(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [j, m, t] = x.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}
export function monatVon(iso: string): string { return iso.slice(0, 7) + '-01'; }

function text(roh: unknown, max: number): string | null {
  const t = String(roh ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || null;
}
function ganzeKm(roh: unknown): number | null {
  const n = typeof roh === 'number' ? roh : leseZahl(roh);
  if (n === null || !Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 5_000_000) return null;
  return n;
}

export type FahrtZeile = {
  fahrzeug_id: string; datum: string; km_start: number; km_ende: number; art: Art;
  start_ort: string | null; ziel: string | null; zweck: string | null; partner: string | null; fahrer_name: string | null;
};

/** Eingabe einer Fahrt prüfen. Dienstfahrt braucht Ziel und Zweck; Privatfahrten nur km. */
export function fahrtPruefen(o: {
  fahrzeugId: unknown; datum: unknown; kmStart: unknown; kmEnde: unknown; art: unknown;
  startOrt?: unknown; ziel?: unknown; zweck?: unknown; partner?: unknown; fahrer?: unknown; heute: string; abgeschlossen?: string[];
}): { ok: true; zeile: FahrtZeile } | { ok: false; grund: string } {
  if (typeof o.fahrzeugId !== 'string' || !/^[0-9a-f-]{36}$/i.test(o.fahrzeugId)) return { ok: false, grund: 'Bitte ein Fahrzeug wählen.' };
  if (!istIso(o.datum)) return { ok: false, grund: 'Bitte das Datum der Fahrt angeben.' };
  if (o.datum > o.heute) return { ok: false, grund: 'Eine Fahrt kann nicht in der Zukunft liegen.' };
  if ((o.abgeschlossen ?? []).includes(monatVon(o.datum))) return { ok: false, grund: 'Dieser Monat ist abgeschlossen — Fahrten darin lassen sich nicht mehr eintragen.' };
  const a = ganzeKm(o.kmStart), e = ganzeKm(o.kmEnde);
  if (a === null || e === null) return { ok: false, grund: 'Bitte den Kilometerstand bei Beginn und Ende als ganze Zahl eintragen.' };
  if (e <= a) return { ok: false, grund: 'Der Kilometerstand am Ende muss größer sein als am Beginn.' };
  if (e - a > MAX_STRECKE) return { ok: false, grund: `Mehr als ${MAX_STRECKE.toLocaleString('de-DE')} km in einer Fahrt — bitte die Kilometerstände prüfen.` };
  const art = ARTEN.some((x) => x.key === o.art) ? (o.art as Art) : null;
  if (!art) return { ok: false, grund: 'Bitte die Art der Fahrt wählen.' };
  const ziel = text(o.ziel, 200), zweck = text(o.zweck, 200);
  if (art === 'dienst' && (!ziel || !zweck)) return { ok: false, grund: 'Bei einer Dienstfahrt bitte Reiseziel und Zweck angeben.' };
  return {
    ok: true,
    zeile: {
      fahrzeug_id: o.fahrzeugId, datum: o.datum, km_start: a, km_ende: e, art,
      start_ort: text(o.startOrt, 120), ziel: art === 'privat' ? null : ziel, zweck: art === 'privat' ? null : zweck,
      partner: art === 'dienst' ? text(o.partner, 120) : null, fahrer_name: text(o.fahrer, 120),
    },
  };
}

/** Grund für eine Änderung: mindestens 5 Zeichen, nicht derselbe wie zuletzt. */
export function grundPruefen(neu: unknown, bisher: string | null | undefined): { ok: true; grund: string } | { ok: false; grund: string } {
  const g = text(neu, 300);
  if (!g || g.length < 5) return { ok: false, grund: 'Bitte angeben, warum die Fahrt geändert wird (mindestens 5 Zeichen).' };
  if (bisher && g === bisher.trim()) return { ok: false, grund: 'Bitte einen neuen Grund für diese Änderung angeben.' };
  return { ok: true, grund: g };
}

export type Fahrt = { id?: string; datum: string; km_start: number; km_ende: number; art: string; erfasst_am?: string | null };

/** Nächster Kilometerstand als Vorschlag: höchster bisheriger Endstand. */
export function kmVorschlag(fahrten: Fahrt[]): number | null {
  let max: number | null = null;
  for (const f of fahrten) if (Number.isFinite(f.km_ende) && (max === null || f.km_ende > max)) max = f.km_ende;
  return max;
}

export type Pruefpunkt = { art: 'luecke' | 'ueberschneidung'; nach?: string; vor?: string; von: number; bis: number };

/** Lücken und Überschneidungen in der Kilometer-Kette (nach km_start sortiert). */
export function kettePruefen(fahrten: Fahrt[]): Pruefpunkt[] {
  const s = [...fahrten].sort((a, b) => a.km_start - b.km_start || a.datum.localeCompare(b.datum));
  const r: Pruefpunkt[] = [];
  for (let i = 1; i < s.length; i++) {
    const vor = s[i - 1], nach = s[i];
    if (nach.km_start > vor.km_ende) r.push({ art: 'luecke', vor: vor.id, nach: nach.id, von: vor.km_ende, bis: nach.km_start });
    else if (nach.km_start < vor.km_ende) r.push({ art: 'ueberschneidung', vor: vor.id, nach: nach.id, von: nach.km_start, bis: vor.km_ende });
  }
  return r;
}

/** Spät eingetragen? (Erfassung mehr als 7 Tage nach der Fahrt) */
export function nachgetragen(f: Fahrt): boolean {
  if (!f.erfasst_am || !istIso(f.datum)) return false;
  const erfasst = Date.parse(String(f.erfasst_am));
  if (!Number.isFinite(erfasst)) return false;
  return erfasst - Date.parse(f.datum + 'T23:59:59Z') > NACHTRAG_TAGE * 86_400_000;
}

/** km je Art und Anteil privat (in ganzen Prozent, Anzeige) für einen Zeitraum [von, bis]. */
export function auswertung(fahrten: Fahrt[], von: string, bis: string): { dienst: number; privat: number; arbeitsweg: number; gesamt: number; anteilPrivat: number | null; fahrten: number } {
  const r = { dienst: 0, privat: 0, arbeitsweg: 0, gesamt: 0, anteilPrivat: null as number | null, fahrten: 0 };
  for (const f of fahrten) {
    if (f.datum < von || f.datum > bis) continue;
    const km = f.km_ende - f.km_start;
    if (!(km > 0)) continue;
    if (f.art === 'dienst' || f.art === 'privat' || f.art === 'arbeitsweg') r[f.art] += km;
    r.gesamt += km; r.fahrten++;
  }
  r.anteilPrivat = r.gesamt > 0 ? rundeStellen((r.privat / r.gesamt) * 100, 0) : null;
  return r;
}

/** Abschließen darf man nur Monate, die vorbei sind. */
export function abschliessbar(monat: string, heute: string): boolean {
  return istIso(monat) && monat.endsWith('-01') && monat < monatVon(heute);
}

// ── Ladestrom ────────────────────────────────────────────────────────────────

export type LadestromZeile = {
  mitarbeiter_id: string | null; person_name: string; fahrzeug_id: string | null; monat: string;
  zaehler_anfang: number; zaehler_ende: number; preis_kwh_cent: number; kwh: number; betrag_cent: number; beleg_notiz: string | null;
};

/** Erstattung berechnen: kWh = Ende − Anfang (2 Stellen), Betrag = kWh × Cent je kWh, auf ganze Cent. */
export function ladestromPruefen(o: {
  mitarbeiterId?: unknown; name: unknown; fahrzeugId?: unknown; monat: unknown; anfang: unknown; ende: unknown; preisCent: unknown; beleg?: unknown; heute: string;
}): { ok: true; zeile: LadestromZeile } | { ok: false; grund: string } {
  const name = text(o.name, 120);
  if (!name || name.length < 2) return { ok: false, grund: 'Bitte angeben, für wen erstattet wird.' };
  const monat = typeof o.monat === 'string' && /^\d{4}-\d{2}$/.test(o.monat) ? o.monat + '-01' : o.monat;
  if (!istIso(monat) || !monat.endsWith('-01')) return { ok: false, grund: 'Bitte den Monat wählen.' };
  if (monat > monatVon(o.heute)) return { ok: false, grund: 'Der Monat liegt in der Zukunft.' };
  const a = leseZahl(o.anfang), e = leseZahl(o.ende), p = leseZahl(o.preisCent);
  if (a === null || e === null || a < 0) return { ok: false, grund: 'Bitte beide Zählerstände (kWh) eintragen.' };
  if (e < a) return { ok: false, grund: 'Der Zählerstand am Monatsende ist kleiner als am Anfang.' };
  if (p === null || p <= 0 || p > 200) return { ok: false, grund: 'Bitte den Preis je kWh in Cent laut Stromvertrag eintragen (z. B. 32,5).' };
  const anfang = rundeStellen(a, 2), ende = rundeStellen(e, 2), preis = rundeStellen(p, 3);
  const kwh = rundeStellen(ende - anfang, 2);
  if (kwh > 5000) return { ok: false, grund: 'Mehr als 5.000 kWh in einem Monat — bitte die Zählerstände prüfen.' };
  const mid = typeof o.mitarbeiterId === 'string' && /^[0-9a-f-]{36}$/i.test(o.mitarbeiterId) ? o.mitarbeiterId : null;
  const fz = typeof o.fahrzeugId === 'string' && /^[0-9a-f-]{36}$/i.test(o.fahrzeugId) ? o.fahrzeugId : null;
  return {
    ok: true,
    zeile: {
      mitarbeiter_id: mid, person_name: name, fahrzeug_id: fz, monat, zaehler_anfang: anfang, zaehler_ende: ende,
      preis_kwh_cent: preis, kwh, betrag_cent: rundeStellen(kwh * preis, 0), beleg_notiz: text(o.beleg, 200),
    },
  };
}
