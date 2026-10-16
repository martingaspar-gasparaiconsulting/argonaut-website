// ============================================================================
// ARGONAUT OS · lib/protokollNachtrag.ts — MO1 Teil 3 (16.10.2026)
// Abgeschlossene Protokolle sind fest (SQL p390). Korrekturen nur als
// Nachtrag, der angehängt und nie geändert wird. Reine Prüf-Logik.
// ============================================================================

export const NACHTRAG_MIN = 3;
export const NACHTRAG_MAX = 4000;

export type Nachtrag = { id: string; eintrag_id: string; text: string; erstellt_von_name: string | null; erstellt_am: string };

export function pruefeNachtrag(text: unknown, status: unknown): string | null {
  if (status !== 'abgeschlossen') return 'Nachträge gibt es nur zu abgeschlossenen Formularen — Entwürfe bitte direkt ändern.';
  const t = typeof text === 'string' ? text.trim() : '';
  if (t.length < NACHTRAG_MIN) return 'Bitte den Nachtrag beschreiben (mindestens 3 Zeichen).';
  if (t.length > NACHTRAG_MAX) return `Der Nachtrag ist zu lang (höchstens ${NACHTRAG_MAX} Zeichen).`;
  return null;
}

/** Älteste zuerst — so liest sich die Geschichte des Protokolls von oben nach unten. */
export function nachtraegeFuer(alle: Nachtrag[], eintragId: string): Nachtrag[] {
  return (alle ?? []).filter((n) => n.eintrag_id === eintragId).sort((a, b) => String(a.erstellt_am).localeCompare(String(b.erstellt_am)));
}

/** Löschen-Knopf: Entwürfe immer (Chef), abgeschlossene nur, solange die Sperre (p390) noch nicht da ist. */
export function darfLoeschen(status: unknown, sperreAktiv: boolean, istChef: boolean): boolean {
  if (!istChef) return false;
  return status !== 'abgeschlossen' || !sperreAktiv;
}
