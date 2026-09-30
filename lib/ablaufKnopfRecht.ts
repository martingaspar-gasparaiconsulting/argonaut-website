// ============================================================================
// ARGONAUT OS · lib/ablaufKnopfRecht.ts — Wer darf einen Knopf-Ablauf drücken? (Paket 192)
//
// Martin 29.09.2026 (Entscheidungsrunde Block 1): Je Ablauf ein Haken „Auch
// Mitarbeiter mit Schreibrecht dürfen starten" (Standard aus).
//
// Regeln:
//   · Die Geschäftsleitung (Besitzer des Ablaufs) darf immer.
//   · Ein Mitarbeiter nur, wenn
//       - der Ablauf den Haken hat UND auf einer Modulseite sitzt (mit Vorgang),
//       - er zu DIESEM Betrieb gehört und nicht ausgetreten ist,
//       - er das Modul sehen UND ändern darf (module + schreib_module).
// Rein, ohne Importe außer dem Katalog, node-getestet.
// ============================================================================

import { knopfModul, type Ausloeser } from './ablauf';

export type KnopfAufrufer =
  | { rolle: 'chef'; userId: string }
  | { rolle: 'mitarbeiter'; userId: string; betrieb: string; austrittsdatum: string | null; module: readonly string[]; schreibModule: readonly string[] };

export type KnopfPruefung = { ja: true; alsMitarbeiter: boolean } | { ja: false; grund: string };

export function darfKnopfStarten(
  ablauf: { owner_user_id: string; ausloeser: Ausloeser | null | undefined },
  wer: KnopfAufrufer,
  heute: string,
): KnopfPruefung {
  const a = ablauf.ausloeser;
  if (!a || a.art !== 'knopf') return { ja: false, grund: 'Dieser Ablauf startet nicht per Knopf.' };
  if (wer.rolle === 'chef') {
    return wer.userId === ablauf.owner_user_id ? { ja: true, alsMitarbeiter: false } : { ja: false, grund: 'Nur die Geschäftsleitung.' };
  }
  if (wer.betrieb !== ablauf.owner_user_id) return { ja: false, grund: 'Ablauf nicht gefunden.' };
  if (wer.austrittsdatum && wer.austrittsdatum < heute) return { ja: false, grund: 'Kein Zugang mehr.' };
  if (a.mitarbeiter !== true) return { ja: false, grund: 'Diesen Ablauf startet nur die Geschäftsleitung.' };
  const modul = knopfModul(a.modul);
  if (!modul) return { ja: false, grund: 'Mitarbeiter starten nur Knöpfe auf einer Modulseite.' };
  if (!wer.module.includes(modul.recht) || !wer.schreibModule.includes(modul.recht)) {
    return { ja: false, grund: `Dafür fehlt das Schreibrecht für ${modul.label}.` };
  }
  return { ja: true, alsMitarbeiter: true };
}
