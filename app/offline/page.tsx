'use client';

// ============================================================================
// ARGONAUT OS · /offline — die Seite, die erscheint, wenn nichts geht.
//
// Wird vom Service-Worker bei der Installation vorab geladen und ausgeliefert,
// sobald eine Navigation ohne Netz scheitert. Deshalb: keine Datenbank, keine
// Anmeldung, keine externen Schriften — sie muss ohne alles funktionieren.
//
// Ton: nicht entschuldigend, sondern handlungsfähig. Der Monteur im Keller
// weiß selbst, dass er kein Netz hat; er will wissen, was jetzt geht.
// ============================================================================

import { useEffect, useState } from 'react';

const C = {
  navy: '#0A1628', navy2: '#0F2036', gold: '#C9A84C', cyan: '#00e5ff',
  green: '#4CAF7D', text: '#E8EDF4', dim: '#8FA3BE', border: 'rgba(143,163,190,0.2)',
};

export default function OfflineSeite() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const merken = () => setOnline(navigator.onLine);
    merken();
    window.addEventListener('online', merken);
    window.addEventListener('offline', merken);
    return () => {
      window.removeEventListener('online', merken);
      window.removeEventListener('offline', merken);
    };
  }, []);

  return (
    <div style={{
      minHeight: '100vh', background: C.navy, color: C.text,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px 20px', fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>

        <div style={{ fontSize: 54, lineHeight: 1, marginBottom: 18 }}>📡</div>

        <h1 style={{
          fontFamily: 'var(--font-syne), sans-serif', fontSize: 27, fontWeight: 800,
          color: C.gold, margin: '0 0 10px',
        }}>
          Gerade keine Verbindung
        </h1>

        <p style={{ color: C.dim, fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>
          {online
            ? 'Die Verbindung ist zurück — Sie können weiterarbeiten.'
            : 'Kein Netz. Das kommt im Keller, im Aufzug und auf der Baustelle vor. Sobald Sie wieder Empfang haben, geht es normal weiter.'}
        </p>

        <div style={{
          border: `1px solid ${online ? 'rgba(76,175,125,0.4)' : C.border}`,
          background: online ? 'rgba(76,175,125,0.08)' : C.navy2,
          borderRadius: 12, padding: '12px 15px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: online ? C.green : '#E06666', flexShrink: 0,
          }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: online ? C.green : C.dim }}>
            {online ? 'Wieder online' : 'Offline — Verbindung wird beobachtet'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
          style={{
            width: '100%', padding: '13px 20px', borderRadius: 10, border: 'none',
            background: C.gold, color: C.navy, fontWeight: 800, fontSize: 15,
            cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10,
          }}
        >
          Erneut versuchen
        </button>

        <a
          href="/dashboard"
          style={{
            display: 'block', padding: '12px 20px', borderRadius: 10,
            border: `1px solid ${C.border}`, color: C.text, textDecoration: 'none',
            fontWeight: 700, fontSize: 14,
          }}
        >
          Zurück zur Übersicht
        </a>

        <p style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.6, marginTop: 24 }}>
          Bereits geöffnete Seiten lassen sich weiterhin ansehen. Nichts geht verloren:
          was Sie eingeben, wird gespeichert, sobald die Verbindung zurück ist.
        </p>

        <div style={{ color: 'rgba(143,163,190,0.5)', fontSize: 11.5, marginTop: 28, letterSpacing: 1 }}>
          ARGONAUT&nbsp;OS
        </div>
      </div>
    </div>
  );
}
