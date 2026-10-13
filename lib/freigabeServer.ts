// ============================================================================
// ARGONAUT OS · lib/freigabeServer.ts — Paket 346 (13.10.2026)
// A0 Freigabe-Zentrale Teil 2: wirksamer Freigabe-Stand am SERVER.
//
// Liest freigabe_schalter (nur Zeilen mit an = true) über die Service-Rolle —
// Nutzer haben auf die Tabelle keine Rechte (SQL p345). Der Stand wird je
// Server-Instanz 60 Sekunden behalten; nach einer Änderung in der
// Freigabe-Zentrale leert /api/admin/freigaben den Speicher sofort.
//
// JEDER Fehler (Tabelle fehlt, Netz, fehlende Umgebungsvariable) = Stand des
// Codes = gesperrt. Nie im Browser importieren (Service-Rolle).
// ============================================================================

import { createAdminClient } from './supabase-admin';
import { codeStand, standAusDb, CACHE_MS, type FreigabeStand } from './freigabeStand';
import { startFrei, startSperrGrund, type StartBereich } from './startSperre';
import { anwaltSperrGrund, type AnwaltBereich } from './anwaltFreigabe';

let gespeichert: { stand: FreigabeStand; bis: number } | null = null;

/** Wirksamer Stand (Code ODER Freigabe-Zentrale). Fehler -> nur Code. */
export async function ladeFreigabeStand(): Promise<FreigabeStand> {
  const jetzt = Date.now();
  if (gespeichert && gespeichert.bis > jetzt) return gespeichert.stand;
  let stand: FreigabeStand;
  try {
    const { data, error } = await createAdminClient()
      .from('freigabe_schalter')
      .select('schluessel, an')
      .eq('an', true)
      .limit(200);
    stand = error ? codeStand() : standAusDb(data ?? []);
  } catch {
    stand = codeStand();
  }
  gespeichert = { stand, bis: jetzt + CACHE_MS };
  return stand;
}

/** Nach einer Änderung in der Freigabe-Zentrale: sofort neu lesen. */
export function freigabeSpeicherLeeren(): void {
  gespeichert = null;
}

export async function startFreiServer(bereich: StartBereich): Promise<boolean> {
  return startFrei(bereich, (await ladeFreigabeStand()).start);
}

export async function startSperrGrundServer(bereich: StartBereich): Promise<string | null> {
  return startSperrGrund(bereich, (await ladeFreigabeStand()).start);
}

export async function anwaltSperrGrundServer(bereich: AnwaltBereich | null | undefined): Promise<string | null> {
  return anwaltSperrGrund(bereich, (await ladeFreigabeStand()).anwalt);
}
