// ============================================================================
// ARGONAUT OS · lib/speicherPfadServer.ts — Ordner-Kennungen eines Betriebs (Paket 184)
//
// Liefert die Kennungen, unter deren Ordner Dateien des Betriebs liegen dürfen:
// der Betrieb selbst (Chef) + die Zugänge seiner Mitarbeiter (die laden
// teils in ihren eigenen Ordner hoch). Braucht einen Client, der die Tabelle
// mitarbeiter lesen darf (Dienstschlüssel). Bei Störung nur der Betrieb selbst.
// ============================================================================

type Db = {
  from: (t: string) => {
    select: (s: string) => {
      eq: (k: string, v: string) => PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};

export async function betriebsOrdner(db: Db, betrieb: string | null | undefined): Promise<string[]> {
  if (!betrieb) return [];
  const ordner = [String(betrieb)];
  try {
    const { data, error } = await db.from('mitarbeiter').select('auth_user_id').eq('owner_user_id', String(betrieb));
    if (!error && Array.isArray(data)) {
      for (const z of data as { auth_user_id?: string | null }[]) {
        if (z?.auth_user_id && !ordner.includes(z.auth_user_id)) ordner.push(z.auth_user_id);
      }
    }
  } catch { /* nur der Betrieb selbst */ }
  return ordner;
}
