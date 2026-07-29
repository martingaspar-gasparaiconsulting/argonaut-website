// lib/marketing.ts
// Marketing ↔ CRM/Leads — reine Zähl-/Zuordnungs-Logik (Lead-Attribution).
// KEINE Supabase-Aufrufe, KEINE React-Hooks. Node-getestet.

export interface LeadLite {
  kampagne_id?: string | null;
}

/** Leads je Kampagne zählen (nur Leads mit gesetzter kampagne_id). */
export function leadsProKampagne(leads: LeadLite[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const l of leads || []) {
    const k = l && l.kampagne_id;
    if (!k) continue;
    map[k] = (map[k] || 0) + 1;
  }
  return map;
}

/** Gesamtzahl der Leads, die überhaupt einer Kampagne zugeordnet sind. */
export function leadsMitKampagne(leads: LeadLite[]): number {
  return (leads || []).filter((l) => !!(l && l.kampagne_id)).length;
}
