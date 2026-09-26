// ============================================================================
// ARGONAUT OS · lib/eigeneFelder.ts — „Eigene Felder" (kundendefinierte Spalten)
//
// Reine Logik + Typen (KEINE Imports, KEINE Hooks) — von Client- und Server-Code
// nutzbar. Ein Betrieb kann sich je Modul eigene Felder/Spalten anlegen (Name +
// Typ). Gespeichert in eigenes_feld (Definition) + eigenes_feld_wert (Werte),
// streng je Betrieb getrennt (RLS). Hier steckt nur die typunabhängige Logik.
// ============================================================================

export type FeldTyp = 'text' | 'zahl' | 'datum' | 'auswahl' | 'ja_nein';

export type EigenesFeld = {
  id: string;
  modul: string;
  label: string;
  feld_typ: FeldTyp;
  optionen: string[];   // nur bei 'auswahl'
  reihenfolge: number;
  aktiv: boolean;
};

export const FELD_TYPEN: { key: FeldTyp; label: string; hinweis: string }[] = [
  { key: 'text',    label: 'Text',         hinweis: 'Freitext, z. B. „Sparte" oder „Kennzeichen".' },
  { key: 'zahl',    label: 'Zahl',         hinweis: 'Zahlenwert, z. B. Menge oder Größe.' },
  { key: 'datum',   label: 'Datum',        hinweis: 'Ein Datum, z. B. Eintrittsdatum.' },
  { key: 'auswahl', label: 'Auswahlliste', hinweis: 'Feste Auswahl, z. B. Fußball / Turnen / Tennis.' },
  { key: 'ja_nein', label: 'Ja/Nein',      hinweis: 'Häkchen, z. B. „aktiv" oder „bezahlt".' },
];

export function istFeldTyp(k: unknown): k is FeldTyp {
  return typeof k === 'string' && FELD_TYPEN.some((t) => t.key === k);
}

export function feldTypLabel(k: string): string {
  return FELD_TYPEN.find((t) => t.key === k)?.label ?? k;
}

/** „Fußball, Turnen; Tennis\nSchwimmen" -> ['Fußball','Turnen','Tennis','Schwimmen'] */
export function parseOptionen(roh: string): string[] {
  return (roh || '')
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

/** Wert für die Anzeige aufbereiten (Datum deutsch, Ja/Nein lesbar). */
export function formatWert(typ: string, wert: string | null | undefined): string {
  const v = (wert ?? '').toString().trim();
  if (!v) return '—';
  if (typ === 'ja_nein') return v === 'ja' || v === 'true' || v === '1' ? 'Ja' : 'Nein';
  if (typ === 'datum') { const p = v.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : v; }
  return v;
}

/** Leeres Werte-Objekt für ein Formular (feldId -> ''). */
export function leereWerte(felder: EigenesFeld[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const f of felder) o[f.id] = '';
  return o;
}

// ============================================================================
// B1c (26.09.2026) — EIGENE FELDER GEHÖREN DEM BETRIEB
//
// Der Fehler: Auf rund 27 Seiten (Werkstatt, Service, CRM, Anlagen, Personal
// …) wurden Werte und Felddefinitionen mit der Kennung der ANGEMELDETEN Person
// gespeichert. Trägt ein Mitarbeiter ein eigenes Feld aus, sieht der Chef den
// Wert nicht — und legt ein Mitarbeiter ein Feld an, fehlt es beim Chef ganz.
// Die Lösung sitzt an EINER Stelle: speichereWerte() und der Feld-Manager
// fragen selbst nach dem Betrieb (mein_chef_id). Beim Chef ist das null, dann
// gilt die übergebene Kennung. So kann keine Seite es mehr falsch machen.
// ============================================================================

/** Betriebs-Kennung: beim Mitarbeiter der Chef, sonst die übergebene Kennung. */
export function betriebsKennung(chef: unknown, fallback: string | null | undefined): string | null {
  if (typeof chef === 'string' && chef.trim()) return chef.trim();
  return fallback ? String(fallback) : null;
}
