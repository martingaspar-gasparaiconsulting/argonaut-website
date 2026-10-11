'use client';

// ============================================================
// ARGONAUT OS · Aufträge · Branchen-Vorlage laden (Paket 311, BV2 Aufträge)
// Gemeinsam für Liste und Auftrags-Akte: Betrieb (Chef) bestimmen,
// Branche und Ansicht-Einstellung „auftraege" laden — fail-open:
// ohne Antwort gilt die Grund-Vorlage (Wörter wie bisher).
// Pfad: app/dashboard/auftraege/useAuftragVorlage.ts
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { vorlageFuer, mitKunde, feinschliffName, type KundenEinstellung, type Vorlage } from '@/lib/branchenVorlage';

export const AUFTRAG_MODUL = 'auftraege';

export function useAuftragVorlage(supabase: SupabaseClient) {
  const [branche, setBranche] = useState('');
  const [einstellung, setEinstellung] = useState<KundenEinstellung | null>(null);
  const [betrieb, setBetrieb] = useState('');
  const [istChef, setIstChef] = useState(false);

  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) return;
        let chefId = uid;
        try { const { data: c } = await supabase.rpc('mein_chef_id'); if (typeof c === 'string' && c) chefId = c; } catch { /* Chef selbst */ }
        if (weg) return;
        setBetrieb(chefId); setIstChef(chefId === uid);
        const [pr, me] = await Promise.all([
          supabase.from('profiles').select('branche').eq('id', chefId).maybeSingle(),
          supabase.from('modul_einstellung').select('einstellung').eq('owner_user_id', chefId).eq('modul', AUFTRAG_MODUL).maybeSingle(),
        ]);
        if (weg) return;
        setBranche(String((pr.data as { branche?: string | null } | null)?.branche ?? ''));
        setEinstellung(((me.data as { einstellung?: KundenEinstellung } | null)?.einstellung) ?? null);
      } catch { /* Grund-Vorlage */ }
    })();
    return () => { weg = true; };
  }, [supabase]);

  const vorlage = useMemo<Vorlage>(() => mitKunde(vorlageFuer(AUFTRAG_MODUL, branche) as Vorlage, einstellung), [branche, einstellung]);
  const fein = useMemo(() => feinschliffName(AUFTRAG_MODUL, branche), [branche]);
  const statusLabel = (k: string): string => vorlage.status.find((s) => s.key === k)?.label ?? k;
  const sichtbar = (k: string): boolean => vorlage.spalten.find((s) => s.key === k)?.sichtbar ?? false;
  const spaltenLabel = (k: string): string => vorlage.spalten.find((s) => s.key === k)?.label ?? k;

  return { vorlage, einstellung, setEinstellung, betrieb, istChef, fein, statusLabel, sichtbar, spaltenLabel };
}
