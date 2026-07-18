'use client';

import { useEffect } from 'react';

// ============================================================
// ARGONAUT OS · SwRegister — registriert den Service-Worker (/sw.js)
// für die Offline-Grundfähigkeit der Monteur-App.
// Läuft NUR im Browser, nie beim Server-Rendern. Jeder Fehler wird geschluckt:
// ohne Service-Worker funktioniert alles wie bisher, nur eben ohne Offline.
// Rendert nichts (null) — reine Nebenwirkung.
// ============================================================
export default function SwRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const registriere = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* bleibt online-only */ });
    };
    if (document.readyState === 'complete') registriere();
    else {
      window.addEventListener('load', registriere, { once: true });
      return () => window.removeEventListener('load', registriere);
    }
  }, []);
  return null;
}
