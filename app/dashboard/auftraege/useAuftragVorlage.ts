'use client';

// ============================================================
// ARGONAUT OS · Aufträge · Branchen-Vorlage laden (Paket 311, BV2 Aufträge)
// Gemeinsam für Liste und Auftrags-Akte. Seit Paket 312 nur noch ein
// Zugang zum allgemeinen Haken useBranchenVorlage (gleiches Verhalten,
// fail-open: ohne Antwort gilt die Grund-Vorlage).
// Pfad: app/dashboard/auftraege/useAuftragVorlage.ts
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { useBranchenVorlage } from '../_components/useBranchenVorlage';

export const AUFTRAG_MODUL = 'auftraege';

export function useAuftragVorlage(supabase: SupabaseClient) {
  return useBranchenVorlage(supabase, AUFTRAG_MODUL);
}
