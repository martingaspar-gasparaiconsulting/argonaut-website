// ============================================================================
// ARGONAUT OS · lib/protokollBezug.ts — MO1 Teil 2 (16.10.2026)
//
// Protokoll-Motor: ein ausgefülltes Formular hängt an einem OBJEKT
// (Anlage, Gebäude/Objekt, Fahrzeug, Tier, Kunde, Baustelle) und eine
// Vorlage kann ein INTERVALL haben (z. B. 12 Monate). Beim Abschluss wird
// die nächste Fälligkeit berechnet; die Fristen-Übersicht zeigt je
// Vorlage + Objekt den letzten Abschluss und die Ampel.
//
// Fristen-Rechnung NICHT neu erfunden: plusMonate/heuteIso/bewerte aus
// lib/nachweisMotor.ts (Monatsende bleibt fest, Vorwarnung 30 Tage,
// ohne Datum nie still grün).
//
// Rein, ohne Datenbank — getestet in tests/protokollBezugMO1b.test.mjs.
// SQL: supabase-sql/p388-protokoll-bezug-frist.sql (Code läuft auch vorher).
// ============================================================================

import { plusMonate, heuteIso, bewerte, istIsoDatum, type Status } from './nachweisMotor';

export type BezugTyp = 'anlage' | 'objekt' | 'fahrzeug' | 'tier' | 'kunde' | 'baustelle';

export const BEZUG_TYPEN: { key: BezugTyp; label: string; icon: string; tabelle: string }[] = [
  { key: 'anlage', label: 'Anlage / Gerät', icon: '⚙️', tabelle: 'assets' },
  { key: 'objekt', label: 'Gebäude / Objekt', icon: '🏢', tabelle: 'objekte' },
  { key: 'fahrzeug', label: 'Fahrzeug', icon: '🚐', tabelle: 'fahrzeuge' },
  { key: 'tier', label: 'Tier', icon: '🐾', tabelle: 'tier_tiere' },
  { key: 'kunde', label: 'Kunde', icon: '👤', tabelle: 'kontakte' },
  { key: 'baustelle', label: 'Baustelle / Projekt', icon: '🏗️', tabelle: 'projekte' },
];

export function istBezugTyp(x: unknown): x is BezugTyp {
  return typeof x === 'string' && BEZUG_TYPEN.some((b) => b.key === x);
}
export function bezugTyp(x: unknown) {
  return BEZUG_TYPEN.find((b) => b.key === x) ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function istUuid(x: unknown): x is string {
  return typeof x === 'string' && UUID.test(x);
}

function t(x: unknown): string {
  return typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : '';
}

/** Anzeigename einer Zeile aus der jeweiligen Tabelle — robust, falls Spalten fehlen. */
export function bezugLabel(typ: BezugTyp, row: Record<string, unknown> | null | undefined): string {
  if (!row) return '—';
  switch (typ) {
    case 'fahrzeug': {
      const b = t(row.bezeichnung); const k = t(row.kennzeichen);
      return [b, k && k !== b ? k : ''].filter(Boolean).join(' · ') || 'Fahrzeug ohne Namen';
    }
    case 'tier': {
      const n = t(row.name); const a = t(row.art); const h = t(row.halter);
      return [n || 'Tier ohne Namen', a, h ? `Halter ${h}` : ''].filter(Boolean).join(' · ');
    }
    case 'kunde': {
      const person = [t(row.vorname), t(row.nachname)].filter(Boolean).join(' ');
      return t(row.anzeigename) || t(row.firma) || t(row.name) || person || t(row.email) || 'Kontakt ohne Namen';
    }
    case 'baustelle': return t(row.name) || t(row.titel) || 'Projekt ohne Namen';
    case 'objekt': {
      const b = t(row.bezeichnung) || t(row.name); const a = t(row.adresse);
      return [b || 'Objekt ohne Namen', a].filter(Boolean).join(' · ');
    }
    case 'anlage':
    default: {
      const b = t(row.bezeichnung) || t(row.name); const s = t(row.seriennummer) || t(row.inventarnummer);
      return [b || 'Anlage ohne Namen', s].filter(Boolean).join(' · ');
    }
  }
}

/** Auswahl-Liste: id + Name, alphabetisch, ohne Zeilen ohne gültige id. */
export function bezugOptionen(typ: BezugTyp, rows: unknown[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const r of rows ?? []) {
    const row = (r ?? {}) as Record<string, unknown>;
    if (!istUuid(row.id)) continue;
    out.push({ id: row.id, name: bezugLabel(typ, row) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// ---------------------------------------------------------------------------
// Intervall
// ---------------------------------------------------------------------------

export const MAX_INTERVALL_MONATE = 120;

/** Eingabe im Vorlagen-Editor: leer = kein Intervall (anlassbezogen). */
export function leseIntervall(roh: unknown): { wert: number | null; fehler: string | null } {
  const s = t(roh);
  if (!s) return { wert: null, fehler: null };
  if (!/^\d{1,3}$/.test(s)) return { wert: null, fehler: 'Intervall: bitte ganze Monate (1 bis 120) oder leer lassen.' };
  const n = Number(s);
  if (n < 1 || n > MAX_INTERVALL_MONATE) return { wert: null, fehler: 'Intervall: bitte ganze Monate (1 bis 120) oder leer lassen.' };
  return { wert: n, fehler: null };
}

export function intervallText(m: number | null | undefined): string {
  if (!m || m < 1) return 'ohne festes Intervall';
  if (m === 12) return 'jährlich';
  if (m % 12 === 0) return `alle ${m / 12} Jahre`;
  if (m === 1) return 'monatlich';
  if (m === 3) return 'vierteljährlich';
  if (m === 6) return 'halbjährlich';
  return `alle ${m} Monate`;
}

/**
 * Nächste Fälligkeit beim Abschluss: Abschlusstag (deutsche Zeit) + Intervall.
 * Ohne gültiges Intervall -> null (anlassbezogen).
 */
export function naechsteFaellig(abgeschlossenAm: string | Date | null | undefined, intervallMonate: number | null | undefined): string | null {
  const n = Number(intervallMonate);
  if (!Number.isInteger(n) || n < 1 || n > MAX_INTERVALL_MONATE) return null;
  let tag: string | null = null;
  if (abgeschlossenAm instanceof Date) tag = isNaN(abgeschlossenAm.getTime()) ? null : heuteIso(abgeschlossenAm);
  else if (typeof abgeschlossenAm === 'string') {
    if (istIsoDatum(abgeschlossenAm)) tag = abgeschlossenAm;
    else { const d = new Date(abgeschlossenAm); tag = isNaN(d.getTime()) ? null : heuteIso(d); }
  }
  return tag ? plusMonate(tag, n) : null;
}

// ---------------------------------------------------------------------------
// Fristen-Übersicht
// ---------------------------------------------------------------------------

export type FristEintrag = {
  id: string;
  vorlage_id: string | null;
  vorlage_titel: string;
  status: string;
  abgeschlossen_am: string | null;
  bezug_typ?: string | null;
  bezug_id?: string | null;
  bezug?: string | null;
  naechste_faellig?: string | null;
};
export type FristVorlage = { id: string; titel: string; aktiv?: boolean; intervall_monate?: number | null };

export type FristZeile = {
  schluessel: string;
  vorlage_id: string;
  vorlage_titel: string;
  bezug_typ: BezugTyp | null;
  bezug_id: string | null;
  bezug: string | null;
  letzter_id: string;
  letzte_am: string | null;
  faellig: string | null;
  status: Status;
  rest: number | null;
  text: string;
};

const RANG: Record<Status, number> = { ueberfaellig: 0, fehlt: 1, bald: 2, ok: 3, anlass: 4 };

/**
 * Je Vorlage (mit Intervall) + Objekt der LETZTE Abschluss.
 * Fälligkeit: gespeicherte naechste_faellig, sonst aus Abschluss + heutigem
 * Vorlagen-Intervall berechnet. Entwürfe zählen nicht (eine Prüfung ist erst
 * mit Abschluss erledigt). Vorlagen ohne Intervall erscheinen nicht.
 * Objekt-Schlüssel: bezug_typ+bezug_id, sonst der Freitext-Bezug (klein).
 */
export function fristenUebersicht(eintraege: FristEintrag[], vorlagen: FristVorlage[], heute: string): FristZeile[] {
  const vMap = new Map(vorlagen.map((v) => [v.id, v]));
  const letzte = new Map<string, FristEintrag>();
  for (const e of eintraege ?? []) {
    if (e.status !== 'abgeschlossen' || !e.vorlage_id || !e.abgeschlossen_am) continue;
    const v = vMap.get(e.vorlage_id);
    if (!v || !(Number(v.intervall_monate) > 0)) continue;
    const obj = istBezugTyp(e.bezug_typ) && istUuid(e.bezug_id) ? `${e.bezug_typ}:${e.bezug_id}` : `frei:${t(e.bezug).toLowerCase()}`;
    const k = `${e.vorlage_id}|${obj}`;
    const alt = letzte.get(k);
    if (!alt || String(e.abgeschlossen_am) > String(alt.abgeschlossen_am)) letzte.set(k, e);
  }
  const zeilen: FristZeile[] = [];
  for (const [k, e] of letzte) {
    const v = vMap.get(e.vorlage_id as string)!;
    const faellig = e.naechste_faellig && istIsoDatum(e.naechste_faellig) ? e.naechste_faellig : naechsteFaellig(e.abgeschlossen_am, v.intervall_monate);
    const b = bewerte({ gueltig_bis: faellig }, heute);
    const letzteAm = e.abgeschlossen_am ? (istIsoDatum(e.abgeschlossen_am) ? e.abgeschlossen_am : heuteIso(new Date(e.abgeschlossen_am))) : null;
    zeilen.push({
      schluessel: k, vorlage_id: e.vorlage_id as string, vorlage_titel: v.titel || e.vorlage_titel,
      bezug_typ: istBezugTyp(e.bezug_typ) ? e.bezug_typ : null, bezug_id: istUuid(e.bezug_id) ? e.bezug_id : null,
      bezug: t(e.bezug) || null, letzter_id: e.id, letzte_am: letzteAm,
      faellig: b.faellig, status: b.status, rest: b.rest, text: b.text,
    });
  }
  return zeilen.sort((a, b) => RANG[a.status] - RANG[b.status] || String(a.faellig ?? '9999').localeCompare(String(b.faellig ?? '9999')) || a.vorlage_titel.localeCompare(b.vorlage_titel, 'de'));
}

export function fristenZahlen(zeilen: FristZeile[]): { ueberfaellig: number; bald: number; ok: number } {
  return {
    ueberfaellig: zeilen.filter((z) => z.status === 'ueberfaellig' || z.status === 'fehlt').length,
    bald: zeilen.filter((z) => z.status === 'bald').length,
    ok: zeilen.filter((z) => z.status === 'ok').length,
  };
}

/** Felder für die Datenbank — nur wenn die Spalten da sind (Code läuft vor dem SQL). */
export function bezugPatch(spalten: boolean, typ: unknown, id: unknown): Record<string, unknown> {
  if (!spalten) return {};
  if (istBezugTyp(typ) && istUuid(id)) return { bezug_typ: typ, bezug_id: id };
  return { bezug_typ: null, bezug_id: null };
}
