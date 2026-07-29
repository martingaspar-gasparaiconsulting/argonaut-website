'use client';

// ============================================================================
// ARGONAUT OS · app/dashboard/_components/DemoReadonlyGuard.tsx  (Punkt 26b)
//
// Read-only-Sperre fuer ABGELAUFENE Demo-Konten. Ein zentraler Wachposten im
// Dashboard-Layout: solange `readonly` true ist, wird window.fetch so umhuellt,
// dass SCHREIB-Anfragen (POST/PUT/PATCH/DELETE) an die Supabase-REST-API
// (/rest/v1/) und an eigene /api/-Routen (inkl. KI) hoeflich mit 403 abgewiesen
// werden. Lesen (GET/HEAD) und die Auth-Endpunkte (/auth/, Login/Logout/Token)
// bleiben frei. So kann ein abgelaufenes Demo alles ANSEHEN, aber nichts mehr
// aendern — ueber ALLE Module hinweg, ohne jede Modul-Seite anzufassen.
//
// Wird NUR aktiv, wenn das Layout readonly=true uebergibt (demo + abgelaufen).
// Fuer echte Kunden und aktive Demos passiert hier gar nichts.
// Hinweis: harte KI-Kosten-Deckelung serverseitig kommt zusaetzlich in Punkt 28.
// ============================================================================

import { useEffect, useState } from 'react';

export default function DemoReadonlyGuard({ readonly: nurLesen }: { readonly: boolean }) {
  const [blockiert, setBlockiert] = useState(false);

  useEffect(() => {
    if (!nurLesen) return;

    const orig = window.fetch;
    let timer: number | undefined;

    const istWrite = (m: string) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m.toUpperCase());

    const wrapped = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      try {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
        const method = init?.method || (input instanceof Request ? input.method : 'GET');
        const rel = url.replace(/^https?:\/\/[^/]+/, '');
        const istZiel = url.includes('/rest/v1/') || rel.startsWith('/api/');
        const istAuth = url.includes('/auth/');
        if (istZiel && !istAuth && istWrite(method)) {
          setBlockiert(true);
          if (timer) window.clearTimeout(timer);
          timer = window.setTimeout(() => setBlockiert(false), 3500);
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'Demo abgelaufen — nur Ansehen.' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
      } catch {
        // Im Zweifel normal durchlassen — der Wachposten darf nie das Lesen kaputt machen.
      }
      return orig.call(window, input, init);
    };

    window.fetch = wrapped as typeof window.fetch;
    return () => {
      window.fetch = orig;
      if (timer) window.clearTimeout(timer);
    };
  }, [nurLesen]);

  if (!nurLesen || !blockiert) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#1a0e0e',
        border: '1px solid rgba(224,102,102,0.6)',
        color: '#fff',
        padding: '12px 18px',
        borderRadius: 10,
        fontWeight: 600,
        maxWidth: '90vw',
        textAlign: 'center',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
      }}
    >
      🔒 Demo abgelaufen — Änderungen sind deaktiviert. Ansehen geht natürlich weiter.
    </div>
  );
}
