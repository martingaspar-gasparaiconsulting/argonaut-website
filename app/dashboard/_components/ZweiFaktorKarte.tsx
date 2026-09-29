'use client';

// ============================================================================
// ARGONAUT OS · Karte „Zwei-Faktor-Anmeldung" (Paket 164, Stufe 1)
// Pfad: app/dashboard/_components/ZweiFaktorKarte.tsx
// Steht in den Einstellungen und in „Mein Bereich": zeigt den Stand und führt
// zur Einrichtungs-Seite. Texte anredefrei (Chef und Mitarbeiter).
// ============================================================================

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { EINRICHT_PFAD } from '@/lib/zweiFaktor';

export default function ZweiFaktorKarte({ zurueck }: { zurueck: string }) {
  const [an, setAn] = useState<boolean | null>(null);

  useEffect(() => {
    createClient().auth.mfa.listFactors()
      .then(({ data }) => setAn(!!(data?.totp ?? []).some((f) => f.status === 'verified')))
      .catch(() => setAn(null));
  }, []);

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${an === false ? 'rgba(224,162,76,0.5)' : 'rgba(143,163,190,0.18)'}`, borderRadius: 14, padding: '18px 20px', margin: '18px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>🔐 Zwei-Faktor-Anmeldung</div>
          <div style={{ color: '#8FA3BE', fontSize: 13.5, marginTop: 4, lineHeight: 1.5 }}>
            {an === null ? 'Stand wird geladen …'
              : an ? 'Eingeschaltet — bei jeder Anmeldung zusätzlich der Code aus der App.'
              : 'Noch nicht eingerichtet. Ein gestohlenes Passwort reicht dann nicht mehr für den Zugang.'}
          </div>
        </div>
        <a href={`${EINRICHT_PFAD}?weiter=${encodeURIComponent(zurueck)}`}
          style={{ padding: '9px 14px', borderRadius: 9, fontSize: 13.5, fontWeight: 800, textDecoration: 'none', background: an ? 'transparent' : '#C9A84C', color: an ? '#E8EDF4' : '#0A1628', border: an ? '1px solid rgba(143,163,190,0.3)' : 'none' }}>
          {an ? 'Verwalten' : 'Jetzt einrichten'}
        </a>
      </div>
    </div>
  );
}
