'use client';

// ============================================================
// ARGONAUT OS · Q2d · UnterschriftLoader
// Rendert nichts. Lädt die gespeicherte Unterschrift des eingeloggten Nutzers
// EINMAL beim Betreten des Dashboards und legt sie im prozessweiten Cache ab
// (lib/meineUnterschrift). Danach können alle synchronen PDF-Generatoren die
// Faksimile-Unterschrift ohne eigenen DB-Aufruf und ohne Änderung an ihren
// Aufrufseiten einsetzen. Fehlt eine Unterschrift, bleibt der Cache null.
// ============================================================

import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ladeMeineUnterschrift, setMeineUnterschriftCache } from '@/lib/meineUnterschrift';

export default function UnterschriftLoader() {
  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL as string,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
        );
        const bild = await ladeMeineUnterschrift(supabase);
        if (aktiv) setMeineUnterschriftCache(bild);
      } catch {
        /* Unterschrift ist optional — bei Fehler bleibt der Cache leer. */
      }
    })();
    return () => { aktiv = false; };
  }, []);

  return null;
}
