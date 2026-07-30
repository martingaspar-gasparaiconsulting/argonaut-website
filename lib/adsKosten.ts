// ============================================================================
// ARGONAUT OS · lib/adsKosten.ts — Kosten-/Postenanalyse für Ads
// „Was kostet mich das eigentlich, wo geht das Geld hin, was kostet jedes Ergebnis"
//
// KEINE Netzwerk-/Supabase-Aufrufe — nur pure, node-testbare Aggregation.
// Eigenständig (kein Cross-Import -> node-testbar + build-sicher).
// ============================================================================

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const n = Number(String(v ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
function teile(zaehler: number, nenner: number): number | null {
  return nenner > 0 ? r2(zaehler / nenner) : null;
}

export type KampagneLite = { id: string; name?: string | null; kanaele?: string[] | null; status?: string | null; tagesbudget?: number | null };
export type ErgebnisLite = { ausgaben?: number | null; impressionen?: number | null; klicks?: number | null; conversions?: number | null; umsatz?: number | null };

export type KostenPosten = {
  id: string;
  name: string;
  kanaele: string[];
  status: string;
  ausgaben: number;
  anteil: number;          // Anteil an den Gesamtausgaben (0..1)
  klicks: number;
  conversions: number;
  umsatz: number;
  cpc: number | null;      // Kosten pro Klick
  cpa: number | null;      // Kosten pro Conversion
  roas: number | null;
};

export type KostenAnalyse = {
  posten: KostenPosten[];
  gesamt: {
    ausgaben: number; umsatz: number; klicks: number; conversions: number; impressionen: number;
    cpc: number | null; cpa: number | null; tkp: number | null; roas: number | null;
  };
  budget: {
    aktivTag: number;        // Summe Tagesbudget aktiver Kampagnen
    geplantTag: number;      // Summe Tagesbudget aktiv+pausiert+bereit
    ausgegeben: number;      // tatsächliche Gesamtausgaben
    hochrechnungMonat: number; // aktives Tagesbudget × 30,4
  };
};

/**
 * Baut die Kosten-/Postenanalyse aus Kampagnen + Ergebnis-Map (kampagne_id -> Ergebnis).
 * Posten sind nach Ausgaben absteigend sortiert (teuerste zuerst).
 */
export function postenAnalyse(
  kampagnen: KampagneLite[] | null | undefined,
  ergebnisMap: Record<string, ErgebnisLite> | null | undefined,
): KostenAnalyse {
  const ks = kampagnen || [];
  const map = ergebnisMap || {};

  let gAus = 0, gUms = 0, gKlick = 0, gConv = 0, gImp = 0;
  for (const k of ks) {
    const e = map[k.id] || {};
    gAus += num(e.ausgaben); gUms += num(e.umsatz);
    gKlick += Math.round(num(e.klicks)); gConv += Math.round(num(e.conversions));
    gImp += Math.round(num(e.impressionen));
  }
  gAus = r2(gAus); gUms = r2(gUms);

  const posten: KostenPosten[] = ks.map((k) => {
    const e = map[k.id] || {};
    const ausgaben = r2(num(e.ausgaben));
    const klicks = Math.round(num(e.klicks));
    const conversions = Math.round(num(e.conversions));
    const umsatz = r2(num(e.umsatz));
    return {
      id: k.id,
      name: (k.name || '').trim() || 'Ohne Namen',
      kanaele: Array.isArray(k.kanaele) ? k.kanaele : [],
      status: k.status || 'entwurf',
      ausgaben,
      anteil: gAus > 0 ? r2(ausgaben / gAus) : 0,
      klicks, conversions, umsatz,
      cpc: teile(ausgaben, klicks),
      cpa: teile(ausgaben, conversions),
      roas: ausgaben > 0 ? r2(umsatz / ausgaben) : null,
    };
  }).sort((a, b) => b.ausgaben - a.ausgaben);

  const statusIn = (k: KampagneLite, s: string[]) => s.includes((k.status || '') as string);
  const aktivTag = r2(ks.filter((k) => statusIn(k, ['aktiv'])).reduce((s, k) => s + num(k.tagesbudget), 0));
  const geplantTag = r2(ks.filter((k) => statusIn(k, ['aktiv', 'pausiert', 'bereit'])).reduce((s, k) => s + num(k.tagesbudget), 0));

  return {
    posten,
    gesamt: {
      ausgaben: gAus, umsatz: gUms, klicks: gKlick, conversions: gConv, impressionen: gImp,
      cpc: teile(gAus, gKlick),
      cpa: teile(gAus, gConv),
      tkp: gImp > 0 ? r2((gAus / gImp) * 1000) : null,
      roas: gAus > 0 ? r2(gUms / gAus) : null,
    },
    budget: {
      aktivTag, geplantTag, ausgegeben: gAus,
      hochrechnungMonat: r2(aktivTag * 30.4),
    },
  };
}
