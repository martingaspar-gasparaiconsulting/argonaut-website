'use client';

// ============================================================================
// ARGONAUT OS · Rechts-Freigabe an der Funktion (Paket 288, RF1b)
// Pfad: app/dashboard/_components/RechtsFreigabe.tsx
//
// useRechtsFreigabe('leistungsauswertung') fragt /api/rechts-freigaben und
// liefert, ob die Funktion für den eigenen Betrieb freigegeben ist. Solange
// geladen wird oder ein Fehler auftritt: GESPERRT (nie aus Versehen frei).
// <FreigabeHinweis> zeigt an der gesperrten Funktion, warum sie gesperrt ist —
// der Geschäftsleitung mit Link zur Seite „Rechtliche Freigaben", Mitarbeitern
// mit dem Hinweis, dass die Geschäftsleitung sie freigeben kann. Läuft eine
// Freigabe in 30 Tagen ab, erscheint ein gelber Hinweis.
// Gemeinsamer Baustein für alle heiklen Funktionen (Rangliste, später
// Führerscheinkontrolle, Ortung …).
// ============================================================================

import { useEffect, useState, type CSSProperties } from 'react';
import type { FreigabeStand } from '@/lib/rechtsFreigaben';

export type FreigabeLage = {
  laedt: boolean;
  aktiv: boolean;
  istChef: boolean;
  titel: string;
  stand: FreigabeStand | null;
  sperrText: string | null;
};

type Antwort = { ok?: boolean; rolle?: string; funktionen?: { key: string; titel: string; stand: FreigabeStand; sperrText: string | null }[] };

export const FREIGABE_SEITE = '/dashboard/rechtliche-freigaben';

/** Lage einer Funktion aus der Antwort der Route — gesperrt, wenn irgendetwas fehlt. */
export function lageAus(j: Antwort | null, key: string): FreigabeLage {
  const f = j?.ok ? j.funktionen?.find((x) => x.key === key) : undefined;
  const istChef = j?.rolle === 'chef';
  if (!f) return { laedt: false, aktiv: false, istChef, titel: key, stand: null, sperrText: 'Die Freigabe konnte gerade nicht geprüft werden — die Funktion bleibt bis dahin gesperrt.' };
  return { laedt: false, aktiv: f.stand?.aktiv === true, istChef, titel: f.titel, stand: f.stand ?? null, sperrText: f.sperrText };
}

export function useRechtsFreigabe(key: string): FreigabeLage & { neuLaden: () => void } {
  const [j, setJ] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [runde, setRunde] = useState(0);
  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        const r = await fetch('/api/rechts-freigaben', { cache: 'no-store' });
        const d = await r.json() as Antwort;
        if (!weg) setJ(r.ok ? d : null);
      } catch { if (!weg) setJ(null); }
      if (!weg) setLaedt(false);
    })();
    return () => { weg = true; };
  }, [runde]);
  const lage = lageAus(j, key);
  return { ...lage, laedt, aktiv: !laedt && lage.aktiv, neuLaden: () => setRunde((n) => n + 1) };
}

const box: CSSProperties = { border: '1px solid rgba(224,162,76,0.45)', background: 'rgba(224,162,76,0.08)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.55, margin: '8px 0' };

/** Hinweis an der Funktion: gesperrt (mit Grund) oder läuft bald ab. Nichts, wenn frei und nicht bald. */
export function FreigabeHinweis({ lage }: { lage: FreigabeLage }) {
  if (lage.laedt) return null;
  if (lage.aktiv) {
    if (!lage.stand?.bald) return null;
    return (
      <div style={box}>
        Die rechtliche Freigabe „{lage.titel}“ läuft in {lage.stand.restTage} Tag{lage.stand.restTage === 1 ? '' : 'en'} ab.
        {lage.istChef ? <> <a href={FREIGABE_SEITE} style={{ color: '#C9A84C' }}>Jetzt neu bestätigen</a></> : ' Die Geschäftsleitung kann sie neu bestätigen.'}
      </div>
    );
  }
  return (
    <div style={box}>
      🔒 {lage.sperrText ?? 'Diese Funktion ist gesperrt, bis die rechtlichen Voraussetzungen bestätigt sind.'}
      {lage.istChef && <> <a href={FREIGABE_SEITE} style={{ color: '#C9A84C' }}>Zu den rechtlichen Freigaben</a></>}
    </div>
  );
}
