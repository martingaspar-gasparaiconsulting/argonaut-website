'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// ============================================================
// ARGONAUT OS · NutzungMelder — Punkt 6.4
//
// Rendert NICHTS. Meldet einmal je Seitenwechsel, welches MODUL geöffnet
// wurde — nicht, wer es geöffnet hat und nicht, was dort getan wurde.
//
// ▄▄▄ DREI BREMSEN, DAMIT DARAUS KEIN KLICK-PROTOKOLL WIRD ▄▄▄
//  1. Ein Modul wird je Sitzung nur EINMAL gemeldet. Wer zwanzigmal zwischen
//     Rechnungen und CRM hin und her springt, erzeugt zwei Meldungen, nicht
//     vierzig.
//  2. Gemeldet wird erst nach kurzem Verweilen. Wer nur durchklickt, hat das
//     Modul nicht benutzt — er ist daran vorbeigekommen.
//  3. `keepalive` — die Meldung stört den Seitenwechsel nicht und hält nichts
//     auf. Scheitert sie, passiert genau nichts: Die Zahl ist dann um eins zu
//     niedrig, und das ist der billigste aller Fehler.
//
// Was gezählt wird, entscheidet lib/nutzung.ts — dort steht auch, warum es
// keine Spalte für eine Person gibt.
// ============================================================

/** Wie lange jemand auf einer Seite bleiben muss, damit sie als benutzt gilt. */
const VERWEILEN_MS = 4000;

export default function NutzungMelder() {
  const pfad = usePathname();
  const gemeldet = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!pfad) return;

    // Schon in dieser Sitzung gemeldet? Dann nichts tun.
    if (gemeldet.current.has(pfad)) return;

    const uhr = window.setTimeout(() => {
      // Nach dem Warten noch einmal prüfen: Ein zweiter Aufruf desselben
      // Pfades könnte inzwischen gemeldet haben.
      if (gemeldet.current.has(pfad)) return;
      gemeldet.current.add(pfad);

      void fetch('/api/nutzung', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pfad }),
        keepalive: true,
      }).catch(() => {
        // Bewusst still. Eine Statistik darf niemandem die Arbeit stören.
      });
    }, VERWEILEN_MS);

    return () => window.clearTimeout(uhr);
  }, [pfad]);

  return null;
}
