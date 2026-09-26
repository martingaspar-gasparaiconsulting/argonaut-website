// ============================================================================
// ARGONAUT OS · lib/speichernPruefen.ts — F20 (26.09.2026)
//
// Supabase meldet bei .update()/.delete() KEINEN Fehler, wenn die Zugriffs-
// regel (RLS) die Zeile gar nicht erst trifft — es werden dann einfach 0
// Zeilen geaendert. Die Seite zeigte trotzdem „✓ gespeichert". Typisch: ein
// Mitarbeiter ohne Aenderungsrecht, oder der Eintrag wurde inzwischen
// geloescht. Abhilfe: .select('id') anhaengen und pruefen, ob etwas
// zurueckkommt.
//
//   const { data, error } = await supabase.from('t').update(x).eq('id', id).select('id');
//   if (error) throw error;
//   if (nichtsGeschrieben(data)) throw new Error(NICHT_GESPEICHERT);
// ============================================================================

export const NICHT_GESPEICHERT =
  'Nicht gespeichert — Ihnen fehlt dafür die Berechtigung, oder der Eintrag existiert nicht mehr. Bitte laden Sie die Seite neu oder fragen Sie Ihren Chef.';

export const NICHT_GELOESCHT =
  'Nicht gelöscht — Ihnen fehlt dafür die Berechtigung, oder der Eintrag existiert nicht mehr.';

/** Wurde nichts geschrieben (0 Zeilen zurück)? */
export function nichtsGeschrieben(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  return data === null || data === undefined;
}
