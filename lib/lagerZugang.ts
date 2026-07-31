// lib/lagerZugang.ts
// Ernte → Lager (generischer Lager-Zugang): ordnet einen Ernte-Posten einem
// vorhandenen Lager-Artikel per (normalisiertem) Namen zu bzw. liefert die
// Stammdaten für einen neuen Artikel. KEINE Supabase-Aufrufe, KEINE React-Hooks
// (importierbar von Client + Node). Node-getestet (lagerZugang.test.ts).

/** Normalisiert einen Namen für den Vergleich (trim, klein, Mehrfach-Leerzeichen → eins). */
export function normName(s?: string | null): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface ArtikelLite { id: string; bezeichnung?: string | null; }

/** Findet die artikel_id zu einer Bezeichnung (erster Namens-Treffer) oder null. */
export function findeArtikelId(bezeichnung: string | null | undefined, artikel: ArtikelLite[]): string | null {
  const ziel = normName(bezeichnung);
  if (!ziel) return null;
  for (const a of artikel || []) {
    if (normName(a.bezeichnung) === ziel) return a.id;
  }
  return null;
}

export interface ArtikelStamm { bezeichnung: string; kategorie: string; einheit: string; }

/** Stammdaten für einen neuen Lager-Artikel aus einem Ernte-Posten (ohne Bestand). */
export function artikelStammAusErnte(kultur?: string | null, einheit?: string | null): ArtikelStamm {
  const bez = (kultur || '').trim() || 'Ernte';
  return { bezeichnung: bez.slice(0, 200), kategorie: 'Ernte', einheit: (einheit || '').trim() || 'kg' };
}

/** Menge sauber als nicht-negative Zahl (max. 3 Nachkommastellen). */
export function zugangsMenge(menge: unknown): number {
  const n = Number(menge) || 0;
  return n > 0 ? Math.round(n * 1000) / 1000 : 0;
}

/** Neuer Bestand nach einem Zugang (alt + Zugang, nie negativ). */
export function neuerBestand(alt: unknown, zugang: unknown): number {
  const a = Number(alt) || 0;
  const z = zugangsMenge(zugang);
  return Math.round((a + z) * 1000) / 1000;
}
