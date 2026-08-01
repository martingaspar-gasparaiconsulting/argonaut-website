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
