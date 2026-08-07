// ============================================================================
// ARGONAUT OS · lib/marketingAnalytics.ts — reine Aggregation fuers Analytics-Board
// (Marketing-Ausbau · Punkt 4 — visueller Analytics-Board)
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks, KEIN Cross-Import — nur
// pure, node-testbare Funktionen (Muster wie lib/marketingCockpit.ts). Die Route
// liest die Roh-Zeilen RLS-scoped und ruft fasseAnalytics(); die Region-Karte
// (PLZ->Bundesland) liefert die Route separat ueber lib/plzBundesland.
//
// Liefert die vier Bausteine des Boards:
//   · KPIs (Leads gesamt / diese Woche / Trend / aus Kampagne)
//   · Lead-Funnel nach Status (Phasen in Pipeline-Reihenfolge)
//   · Zeit-Trend (Leads je Woche, gleitendes Fenster)
//   · Quellen-Verteilung (woher die Leads kommen)
//   · Ads-Effizienz (Ausgaben/Umsatz/ROAS/CPL — eine €-Achse, kein Dual-Axis)
// ============================================================================

export type LeadRoh = {
  status?: unknown;
  quelle?: unknown;
  created_at?: unknown;
  kampagne_id?: unknown;
};

export type AdsErgebnisRoh = {
  ausgaben?: unknown;
  umsatz?: unknown;
  klicks?: unknown;
  conversions?: unknown;
};

const TAG = 86_400_000;

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const n = Number(String(v ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function zeitMs(v: unknown): number {
  const t = new Date(String(v ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
}

function runde2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// --- Lead-Status: Phasen in sinnvoller Trichter-Reihenfolge -----------------
// Deckt die gaengigen Status ab; unbekannte Status werden hinten angehaengt,
// damit nie Daten verschwinden. Label = schoene Anzeige.
const STATUS_REIHENFOLGE: string[] = [
  'neu', 'offen', 'kontaktiert', 'in_bearbeitung', 'qualifiziert',
  'angebot', 'verhandlung', 'gewonnen', 'kunde', 'verloren',
];
const STATUS_LABEL: Record<string, string> = {
  neu: 'Neu', offen: 'Offen', kontaktiert: 'Kontaktiert', in_bearbeitung: 'In Bearbeitung',
  qualifiziert: 'Qualifiziert', angebot: 'Angebot', verhandlung: 'Verhandlung',
  gewonnen: 'Gewonnen', kunde: 'Kunde', verloren: 'Verloren',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unbekannt');
}

export type FunnelStufe = { status: string; label: string; anzahl: number; anteil: number };

/** Lead-Funnel: Anzahl je Status, in Pipeline-Reihenfolge (unbekannte hinten). */
export function leadFunnel(leads: LeadRoh[]): FunnelStufe[] {
  const rows = leads || [];
  const gesamt = rows.length;
  const map: Record<string, number> = {};
  for (const l of rows) {
    const s = (typeof l?.status === 'string' && l.status.trim()) ? l.status.trim() : 'neu';
    map[s] = (map[s] || 0) + 1;
  }
  const keys = Object.keys(map).sort((a, b) => {
    const ia = STATUS_REIHENFOLGE.indexOf(a);
    const ib = STATUS_REIHENFOLGE.indexOf(b);
    if (ia === -1 && ib === -1) return b.localeCompare(a);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return keys.map((status) => ({
    status,
    label: statusLabel(status),
    anzahl: map[status],
    anteil: gesamt > 0 ? Math.round((map[status] / gesamt) * 100) : 0,
  }));
}

export type ZeitPunkt = { start: string; label: string; anzahl: number; istAktuell: boolean };

/**
 * Leads je Woche ueber ein gleitendes Fenster (Standard 8 Wochen), aeltestes
 * zuerst. Fenster enden „jetzt"; jetztIso wird uebergeben (node-testbar).
 * label = Startdatum der Woche (dd.mm.).
 */
export function leadsProWoche(leads: LeadRoh[], jetztIso: string, wochen = 8): ZeitPunkt[] {
  const rows = leads || [];
  const jetzt = zeitMs(jetztIso) || Date.now();
  const woche = 7 * TAG;
  const anzahlWochen = Math.max(1, Math.min(26, Math.floor(wochen)));
  const zeiten = rows.map((l) => zeitMs(l?.created_at)).filter((t) => t > 0);

  const out: ZeitPunkt[] = [];
  for (let i = anzahlWochen - 1; i >= 0; i--) {
    const ende = jetzt - i * woche;
    const start = ende - woche;
    const anzahl = zeiten.filter((t) => t > start && t <= ende).length;
    const d = new Date(start + TAG); // Fensterbeginn (nächster Tag) fürs Label
    const label = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.`;
    out.push({ start: new Date(start).toISOString(), label, anzahl, istAktuell: i === 0 });
  }
  return out;
}

export type QuelleAnteil = { quelle: string; anzahl: number; anteil: number };

/** Leads je Quelle, groesste zuerst; Rest ab Rang 8 als „Weitere" gebuendelt. */
export function leadsJeQuelle(leads: LeadRoh[], maxZeilen = 8): QuelleAnteil[] {
  const rows = leads || [];
  const gesamt = rows.length;
  const map: Record<string, number> = {};
  for (const l of rows) {
    const q = (typeof l?.quelle === 'string' && l.quelle.trim()) ? l.quelle.trim() : 'Direkt/Unbekannt';
    map[q] = (map[q] || 0) + 1;
  }
  const sortiert = Object.entries(map)
    .map(([quelle, anzahl]) => ({ quelle, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl);

  let liste = sortiert;
  if (sortiert.length > maxZeilen) {
    const kopf = sortiert.slice(0, maxZeilen - 1);
    const restAnzahl = sortiert.slice(maxZeilen - 1).reduce((s, x) => s + x.anzahl, 0);
    liste = [...kopf, { quelle: 'Weitere', anzahl: restAnzahl }];
  }
  return liste.map((x) => ({ ...x, anteil: gesamt > 0 ? Math.round((x.anzahl / gesamt) * 100) : 0 }));
}

export type AdsEffizienz = {
  ausgaben: number; umsatz: number; klicks: number; conversions: number;
  roas: number | null; cpl: number | null;
};

/** Ads-Effizienz: Summen + ROAS (Umsatz/Ausgaben) + CPL (Ausgaben/Conversion). */
export function adsEffizienz(ergebnisse: AdsErgebnisRoh[]): AdsEffizienz {
  const rows = ergebnisse || [];
  const ausgaben = runde2(rows.reduce((s, e) => s + num(e?.ausgaben), 0));
  const umsatz = runde2(rows.reduce((s, e) => s + num(e?.umsatz), 0));
  const klicks = rows.reduce((s, e) => s + Math.round(num(e?.klicks)), 0);
  const conversions = rows.reduce((s, e) => s + Math.round(num(e?.conversions)), 0);
  return {
    ausgaben, umsatz, klicks, conversions,
    roas: ausgaben > 0 ? runde2(umsatz / ausgaben) : null,
    cpl: conversions > 0 ? runde2(ausgaben / conversions) : null,
  };
}

export type AnalyticsKpis = {
  leadsGesamt: number; dieseWoche: number; vorWoche: number;
  trendProzent: number | null; ausKampagne: number;
};

/** Kern-Kennzahlen: gesamt, diese/vorige Woche + Trend, aus Kampagne. */
export function analyticsKpis(leads: LeadRoh[], jetztIso: string): AnalyticsKpis {
  const rows = leads || [];
  const jetzt = zeitMs(jetztIso) || Date.now();
  const woche = 7 * TAG;
  const zeiten = rows.map((l) => zeitMs(l?.created_at));
  const dieseWoche = zeiten.filter((t) => t > jetzt - woche && t <= jetzt).length;
  const vorWoche = zeiten.filter((t) => t > jetzt - 2 * woche && t <= jetzt - woche).length;
  const trendProzent = vorWoche > 0
    ? Math.round(((dieseWoche - vorWoche) / vorWoche) * 100)
    : (dieseWoche > 0 ? null : 0); // null = „neu, kein Vergleich"
  return {
    leadsGesamt: rows.length,
    dieseWoche,
    vorWoche,
    trendProzent,
    ausKampagne: rows.filter((l) => !!l?.kampagne_id).length,
  };
}

export type AnalyticsInput = {
  leads?: LeadRoh[] | null;
  adsErgebnisse?: AdsErgebnisRoh[] | null;
  jetztIso: string;
  wochen?: number;
};

/** Alles fuers Board auf einmal (Region liefert die Route separat). */
export function fasseAnalytics(input: AnalyticsInput) {
  const leads = input.leads || [];
  const ads = input.adsErgebnisse || [];
  return {
    kpis: analyticsKpis(leads, input.jetztIso),
    funnel: leadFunnel(leads),
    zeitReihe: leadsProWoche(leads, input.jetztIso, input.wochen ?? 8),
    quellen: leadsJeQuelle(leads),
    ads: adsEffizienz(ads),
  };
}
