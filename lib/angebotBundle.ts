// lib/angebotBundle.ts
// CPQ · A8b — wiederverwendbare Angebots-Bausteine („Bundles"): ein gespeichertes
// Set von Positionen, das man mit einem Klick in ein neues Angebot einfügt.
// Reine Daten/Formeln — KEINE Supabase-/React-Abhängigkeit. Node-getestet.
//
// Die Positionen werden als JSONB gespeichert; alle Felder als STRINGS (identisch
// zum Formular-Zustand der Angebote-Seite), damit Einfügen 1:1 möglich ist.

export interface BundlePosition {
  bezeichnung: string; menge: string; einheit: string; einzelpreis: string; mwst_satz: string; rabatt: string;
}
export interface Bundle { id: string; name: string; positionen: BundlePosition[]; }

function s(x: unknown, fallback = ''): string {
  if (x == null) return fallback;
  if (typeof x === 'number') return Number.isFinite(x) ? String(x) : fallback;
  const t = String(x).trim();
  return t === '' ? fallback : t;
}

/** Eine rohe (JSONB-)Position defensiv in die Formular-Form bringen. */
export function normalisierePosition(roh: unknown): BundlePosition {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
  return {
    bezeichnung: s(r.bezeichnung),
    menge: s(r.menge, '1'),
    einheit: s(r.einheit, 'Stk'),
    einzelpreis: s(r.einzelpreis, ''),
    mwst_satz: s(r.mwst_satz, '19'),
    rabatt: s(r.rabatt, '0'),
  };
}

/** Rohes Positionen-Array (aus der DB) → saubere Bundle-Positionen. */
export function normalisierePositionen(roh: unknown): BundlePosition[] {
  if (!Array.isArray(roh)) return [];
  return roh.map(normalisierePosition);
}

/** Nur Positionen mit Inhalt (Bezeichnung oder Preis) übernehmen. */
export function nurGefuellte(positionen: BundlePosition[]): BundlePosition[] {
  return (positionen || []).filter((p) => (p.bezeichnung || '').trim() !== '' || (Number((p.einzelpreis || '').replace(',', '.')) || 0) > 0);
}

/** Name säubern; leerer Name → '' (Aufrufer lehnt dann ab). */
export function bundleName(name: string | null | undefined): string {
  return (name ?? '').trim().slice(0, 80);
}

/** Kurzbeschreibung eines Bundles für die Auswahl (Positionsanzahl). */
export function bundleLabel(b: Bundle): string {
  const n = (b.positionen || []).length;
  return `${b.name} · ${n} Position${n === 1 ? '' : 'en'}`;
}
