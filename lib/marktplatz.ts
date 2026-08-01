// lib/marktplatz.ts
// Marktplatz-Sync (Punkt 6): Amazon/eBay/Kaufland/OTTO anschlussfertig
// verbinden (verschlüsselte Zugangsdaten). Der eigentliche Bestell-/Bestands-
// Abgleich ist „in Aufbau". Reine Daten — KEINE Supabase-/React-Abhängigkeit.
// Node-getestet.

export interface MarktplatzInfo {
  key: string;
  name: string;
  icon: string;
  /** Beschriftung der Konto-Kennung (Verkäufer-/Händler-ID). */
  idLabel: string;
  /** Beschriftung des geheimen Tokens/Schlüssels. */
  tokenLabel: string;
}

export const MARKTPLAETZE: MarktplatzInfo[] = [
  { key: 'amazon',   name: 'Amazon',   icon: '📦', idLabel: 'Verkäufer-/Merchant-ID', tokenLabel: 'SP-API Refresh-Token' },
  { key: 'ebay',     name: 'eBay',     icon: '🏷', idLabel: 'App-ID (Client-ID)',      tokenLabel: 'OAuth-Token' },
  { key: 'kaufland', name: 'Kaufland', icon: '🛒', idLabel: 'Client-Key',             tokenLabel: 'Secret-Key' },
  { key: 'otto',     name: 'OTTO',     icon: '🛍', idLabel: 'Partner-/Benutzername',   tokenLabel: 'API-Token' },
];

export function marktplatzInfo(key: string | null | undefined): MarktplatzInfo | undefined {
  return MARKTPLAETZE.find((m) => m.key === key);
}
export function istMarktplatz(key: string | null | undefined): boolean {
  return MARKTPLAETZE.some((m) => m.key === key);
}
export function marktplatzName(key: string | null | undefined): string {
  return marktplatzInfo(key)?.name ?? '—';
}
