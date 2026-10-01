"use client";

// ============================================================================
// ARGONAUT OS · app/dashboard/_components/useDarfAbrechnen.ts  (Paket 187)
//
// Claude-Befund (Rundumschlag 29.09.): Die Knöpfe „Rechnung erstellen" standen
// auf 21 Modulseiten auch bei Mitarbeitern OHNE das Recht „Darf abrechnen".
// Der Server lehnte zwar ab (lib/nurGeschaeftsleitung.abrechnungPruefen), aber
// der Mitarbeiter sah einen Knopf, der nur eine Fehlermeldung bringt.
//
// Dieser Hook fragt einmal: Chef? -> true. Mitarbeiter? -> darf_ich_abrechnen().
// Rückgabe: true / false / null (null = Prüfung läuft noch).
// Die Entscheidung selbst steckt rein und getestet in abrechnenKnopfZeigen().
//
// WICHTIG: Das ist nur die Anzeige. Die eigentliche Sperre bleibt auf dem
// Server (jede Route rechnung-aus-* prüft selbst).
// ============================================================================

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { abrechnenKnopfZeigen } from '@/lib/nurGeschaeftsleitung';

export function useDarfAbrechnen(): boolean | null {
  const [darf, setDarf] = useState<boolean | null>(null);
  useEffect(() => {
    let aus = false;
    (async () => {
      const sb = createClient();
      let chef: unknown = null;
      try { chef = (await sb.rpc('mein_chef_id')).data; } catch { chef = null; }
      let recht: unknown = false;
      if (typeof chef === 'string' && chef.trim()) {
        try {
          const r = await sb.rpc('darf_ich_abrechnen');
          recht = r.error ? false : r.data;
        } catch { recht = false; }
      }
      if (!aus) setDarf(abrechnenKnopfZeigen(chef, recht));
    })();
    return () => { aus = true; };
  }, []);
  return darf;
}
