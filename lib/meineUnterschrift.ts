// ============================================================================
// ARGONAUT OS · lib/meineUnterschrift.ts
// Lädt die gespeicherte Unterschrift des aktuell eingeloggten Nutzers aus
// benutzer_unterschrift (RLS: jeder sieht nur seine eigene). Client-seitig —
// wird von den PDF-erzeugenden Seiten aufgerufen und als PNG-DataURL an die
// jeweilige PDF-Funktion durchgereicht. Gibt null zurück, wenn keine da ist.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Prozess-weiter Cache (nur Browser). Das Dashboard-Layout lädt die Unterschrift
// EINMAL beim Betreten und legt sie hier ab; jeder synchrone PDF-Generator liest
// sie danach ohne eigenen Datenbank-Aufruf und ohne Änderung an den Aufrufseiten.
// Fehlt sie (nicht eingeloggt / nichts hinterlegt), bleibt der Wert null und die
// Signaturlinie im PDF einfach leer.
// ---------------------------------------------------------------------------
let _cache: string | null = null;

/** Synchroner Lesezugriff für PDF-Generatoren. */
export function meineUnterschriftCache(): string | null {
  return _cache;
}

/** Setzt/aktualisiert den Cache (Layout-Loader + „Meine Unterschrift"-Karte). */
export function setMeineUnterschriftCache(bild: string | null): void {
  _cache = bild;
}

export async function ladeMeineUnterschrift(supabase: any): Promise<string | null> {
  try {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return null;
    const { data } = await supabase
      .from('benutzer_unterschrift')
      .select('bild, aktiv')
      .eq('auth_user_id', uid)
      .maybeSingle();
    const row = data as { bild?: string | null; aktiv?: boolean } | null;
    return row && row.aktiv !== false ? (row.bild ?? null) : null;
  } catch {
    return null;
  }
}
