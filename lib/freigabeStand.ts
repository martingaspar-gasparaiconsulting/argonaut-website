// ============================================================================
// ARGONAUT OS · lib/freigabeStand.ts — Paket 346 (13.10.2026)
// A0 Freigabe-Zentrale Teil 2: der WIRKSAME Stand aller Start-Schalter und
// Import-Sperren.
//
// Regel: wirksam frei = Schalter im Code an ODER in der Freigabe-Zentrale
// freigegeben (Tabelle freigabe_schalter, an = true). Alles andere = gesperrt:
//   · unbekannte Schlüssel in der Datenbank zählen nicht
//   · Lesefehler, leere Antwort, kaputte Daten -> Stand des Codes (= aus)
//   · im Browser zählt nur ein echtes `true` aus der Antwort des Servers
// Eine Freigabe kann also nie aus Versehen entstehen — nur durch den
// Betreiber mit bestätigtem zweiten Faktor (/api/admin/freigaben) oder den Code.
//
// Keine Hooks, kein Supabase — node-testbar (tests/freigabeWirksamP346).
// Server: lib/freigabeServer.ts · Browser: lib/useFreigabeStand.ts
// ============================================================================

import { START_FREIGABE, type StartBereich } from './startSperre';
import { ANWALT_FREIGABE, type AnwaltBereich } from './anwaltFreigabe';

export type FreigabeStand = {
  start: Readonly<Record<StartBereich, boolean>>;
  anwalt: Readonly<Record<AnwaltBereich, boolean>>;
};

/** Stand allein aus dem Code — gilt, solange nichts anderes sicher bekannt ist. */
export function codeStand(): FreigabeStand {
  return { start: { ...START_FREIGABE }, anwalt: { ...ANWALT_FREIGABE } };
}

export type DbFreigabe = { schluessel?: unknown; an?: unknown };

/**
 * Wirksamer Stand aus Code + Datenbank-Zeilen. `null`/kein Array (Lesefehler)
 * -> nur Code. Gezählt werden nur `startSperre.<bereich>` und
 * `anwaltFreigabe.<bereich>` mit an === true für Bereiche, die es im Code gibt.
 */
export function standAusDb(zeilen: readonly DbFreigabe[] | null | undefined): FreigabeStand {
  const s = codeStand();
  const start = { ...s.start } as Record<StartBereich, boolean>;
  const anwalt = { ...s.anwalt } as Record<AnwaltBereich, boolean>;
  if (!Array.isArray(zeilen)) return { start, anwalt };
  for (const z of zeilen) {
    if (!z || z.an !== true || typeof z.schluessel !== 'string') continue;
    const [gruppe, bereich, rest] = z.schluessel.split('.');
    if (rest !== undefined || !bereich) continue;
    if (gruppe === 'startSperre' && Object.prototype.hasOwnProperty.call(START_FREIGABE, bereich)) start[bereich as StartBereich] = true;
    if (gruppe === 'anwaltFreigabe' && Object.prototype.hasOwnProperty.call(ANWALT_FREIGABE, bereich)) anwalt[bereich as AnwaltBereich] = true;
  }
  return { start, anwalt };
}

/**
 * Antwort des Servers im Browser vorsichtig lesen: nur ein echtes `true` für
 * bekannte Bereiche öffnet, alles andere bleibt beim Code-Stand.
 */
export function standAusAntwort(x: unknown): FreigabeStand {
  const o = (x && typeof x === 'object' ? x : {}) as { start?: unknown; anwalt?: unknown };
  const zeilen: DbFreigabe[] = [];
  const nimm = (gruppe: string, m: unknown) => {
    if (!m || typeof m !== 'object') return;
    for (const [k, v] of Object.entries(m as Record<string, unknown>)) zeilen.push({ schluessel: `${gruppe}.${k}`, an: v === true });
  };
  nimm('startSperre', o.start);
  nimm('anwaltFreigabe', o.anwalt);
  return standAusDb(zeilen);
}

/** Welche Bereiche nur über die Datenbank frei sind (für Anzeige und Protokoll). */
export function nurDurchDatenbank(stand: FreigabeStand): string[] {
  const raus: string[] = [];
  for (const [k, v] of Object.entries(stand.start)) if (v && START_FREIGABE[k as StartBereich] !== true) raus.push('startSperre.' + k);
  for (const [k, v] of Object.entries(stand.anwalt)) if (v && ANWALT_FREIGABE[k as AnwaltBereich] !== true) raus.push('anwaltFreigabe.' + k);
  return raus;
}

/** Wie lange der Server den gelesenen Stand behält (Millisekunden). */
export const CACHE_MS = 60_000;
