'use client';
// ============================================================================
// ARGONAUT OS · lib/useFreigabeStand.ts — Paket 346 (13.10.2026)
// A0 Freigabe-Zentrale Teil 2: wirksamer Freigabe-Stand im BROWSER.
//
// Startet mit dem Stand des Codes (= gesperrt) und holt einmal je Seitenaufruf
// /api/freigaben/stand. Nur ein echtes `true` vom Server öffnet
// (lib/freigabeStand.standAusAntwort). Fehler -> bleibt gesperrt.
// Die Anzeige im Browser ist Bequemlichkeit — gesperrt wird am Server.
// ============================================================================

import { useEffect, useState } from 'react';
import { codeStand, standAusAntwort, type FreigabeStand } from './freigabeStand';

let anfrage: Promise<FreigabeStand> | null = null;

function holen(): Promise<FreigabeStand> {
  if (!anfrage) {
    anfrage = fetch('/api/freigaben/stand', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => standAusAntwort(j))
      .catch(() => codeStand());
  }
  return anfrage;
}

export function useFreigabeStand(): FreigabeStand {
  const [stand, setStand] = useState<FreigabeStand>(codeStand);
  useEffect(() => {
    let aktiv = true;
    holen().then((s) => { if (aktiv) setStand(s); });
    return () => { aktiv = false; };
  }, []);
  return stand;
}
