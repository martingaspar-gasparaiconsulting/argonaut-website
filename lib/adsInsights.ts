// ============================================================================
// ARGONAUT OS · lib/adsInsights.ts — Insights/Reporting je Plattform einlesen
// (Ads · Insights-Autofüllen)
//
// Holt Ist-Kennzahlen (Ausgaben/Impressionen/Klicks/Conversions/Umsatz) aus den
// Reporting-APIs und normalisiert sie auf ein einheitliches Format, das in
// ads_ergebnis geschrieben wird. Die PARSER sind rein & node-testbar; die
// fetch-Funktionen sind gegen die Live-API erst verifizierbar, sobald das
// Werbekonto verbunden ist. Dokumentierte Form (Stand 2026).
// ============================================================================

export type Kennzahlen = { ausgaben: number; impressionen: number; klicks: number; conversions: number; umsatz: number };

const LEER: Kennzahlen = { ausgaben: 0, impressionen: 0, klicks: 0, conversions: 0, umsatz: 0 };

function z(v: unknown): number {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function summe(a: Kennzahlen, b: Kennzahlen): Kennzahlen {
  return {
    ausgaben: Math.round((a.ausgaben + b.ausgaben) * 100) / 100,
    impressionen: a.impressionen + b.impressionen,
    klicks: a.klicks + b.klicks,
    conversions: a.conversions + b.conversions,
    umsatz: Math.round((a.umsatz + b.umsatz) * 100) / 100,
  };
}

// ---- Parser (rein) ----------------------------------------------------------

/** Meta Graph /{campaign}/insights -> Kennzahlen. */
export function parseMetaInsights(json: unknown): Kennzahlen {
  const j = json as { data?: Record<string, unknown>[] } | null;
  const row = j?.data?.[0];
  if (!row) return { ...LEER };
  const actions = (row.actions as { action_type?: string; value?: unknown }[] | undefined) || [];
  const actionValues = (row.action_values as { action_type?: string; value?: unknown }[] | undefined) || [];
  const conversions = actions
    .filter((a) => /lead|purchase|complete_registration|conversion/i.test(a.action_type || ''))
    .reduce((s, a) => s + z(a.value), 0);
  const umsatz = actionValues
    .filter((a) => /purchase|conversion/i.test(a.action_type || ''))
    .reduce((s, a) => s + z(a.value), 0);
  return {
    ausgaben: z(row.spend),
    impressionen: Math.round(z(row.impressions)),
    klicks: Math.round(z(row.clicks)),
    conversions: Math.round(conversions),
    umsatz: Math.round(umsatz * 100) / 100,
  };
}

/** Google Ads GAQL-Row (metrics) -> Kennzahlen. costMicros -> €. */
export function parseGoogleMetrics(json: unknown): Kennzahlen {
  const j = json as { metrics?: Record<string, unknown> } | null;
  const m = j?.metrics;
  if (!m) return { ...LEER };
  return {
    ausgaben: Math.round((z(m.costMicros) / 1_000_000) * 100) / 100,
    impressionen: Math.round(z(m.impressions)),
    klicks: Math.round(z(m.clicks)),
    conversions: Math.round(z(m.conversions)),
    umsatz: Math.round(z(m.conversionsValue) * 100) / 100,
  };
}

/** TikTok /report/integrated/get/ -> Kennzahlen (erste Zeile der Liste). */
export function parseTiktokReport(json: unknown): Kennzahlen {
  const j = json as { data?: { list?: { metrics?: Record<string, unknown> }[] } } | null;
  const m = j?.data?.list?.[0]?.metrics;
  if (!m) return { ...LEER };
  return {
    ausgaben: z(m.spend),
    impressionen: Math.round(z(m.impressions)),
    klicks: Math.round(z(m.clicks)),
    conversions: Math.round(z(m.conversion)),
    umsatz: Math.round(z((m.total_purchase_value ?? m.total_complete_payment) as unknown) * 100) / 100,
  };
}

/** LinkedIn adAnalytics-Element -> Kennzahlen. */
export function parseLinkedinAnalytics(json: unknown): Kennzahlen {
  const j = json as { elements?: Record<string, unknown>[] } | null;
  const e = j?.elements?.[0];
  if (!e) return { ...LEER };
  const cost = (e.costInLocalCurrency ?? e.costInUsd) as unknown;
  return {
    ausgaben: z(cost),
    impressionen: Math.round(z(e.impressions)),
    klicks: Math.round(z(e.clicks)),
    conversions: Math.round(z(e.externalWebsiteConversions)),
    umsatz: 0,
  };
}

export { LEER as KENNZAHLEN_LEER, summe as summeKennzahlen };

// ---- Fetch je Plattform (unrein) -------------------------------------------

const META_VERSION = 'v21.0';

export async function holeMetaInsights(campaignId: string, token: string): Promise<Kennzahlen | null> {
  try {
    const url = `https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(campaignId)}/insights?fields=spend,impressions,clicks,actions,action_values&date_preset=maximum&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return parseMetaInsights(await res.json());
  } catch { return null; }
}

export async function holeGoogleInsights(customerId: string, campaignResourceName: string, token: string, entwicklerToken: string): Promise<Kennzahlen | null> {
  try {
    const cid = (customerId || '').replace(/[^0-9]/g, '');
    // campaignResourceName ~ customers/{cid}/campaigns/{id} -> id extrahieren
    const id = (campaignResourceName.split('/').pop() || '').replace(/[^0-9]/g, '');
    const query = `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id = ${id}`;
    const res = await fetch(`https://googleads.googleapis.com/v18/customers/${cid}/googleAds:search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'developer-token': entwicklerToken },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null) as { results?: unknown[] } | null;
    return parseGoogleMetrics((j?.results?.[0]) ?? null);
  } catch { return null; }
}

export async function holeTiktokInsights(advertiserId: string, campaignId: string, token: string): Promise<Kennzahlen | null> {
  try {
    const url = `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=${encodeURIComponent(advertiserId)}&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=["campaign_id"]&metrics=["spend","impressions","clicks","conversion","total_purchase_value"]&filtering=[{"field_name":"campaign_ids","filter_type":"IN","filter_value":"[\\"${campaignId}\\"]"}]`;
    const res = await fetch(url, { headers: { 'access-token': token } });
    if (!res.ok) return null;
    return parseTiktokReport(await res.json());
  } catch { return null; }
}

export async function holeLinkedinInsights(campaignId: string, token: string): Promise<Kennzahlen | null> {
  try {
    const id = campaignId.replace(/^urn:li:sponsoredCampaign:/, '');
    const url = `https://api.linkedin.com/rest/adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=ALL&campaigns=List(urn%3Ali%3AsponsoredCampaign%3A${id})&fields=costInLocalCurrency,impressions,clicks,externalWebsiteConversions`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, 'linkedin-version': '202401', 'x-restli-protocol-version': '2.0.0' } });
    if (!res.ok) return null;
    return parseLinkedinAnalytics(await res.json());
  } catch { return null; }
}
