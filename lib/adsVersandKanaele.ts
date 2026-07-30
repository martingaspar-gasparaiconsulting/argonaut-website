// ============================================================================
// ARGONAUT OS · lib/adsVersandKanaele.ts — Schalt-Motoren Google / LinkedIn / TikTok
//
// Ergänzt den Meta-Motor (lib/adsVersand.ts) um die weiteren Ad-Plattformen.
// Jede Plattform hat ihre EIGENE API-Sprache; darum je Plattform ein eigener
// Payload-Baustein — dokumentierte Form (Stand 2026). Reine Bauteile (Status-/
// Ziel-Mapping, Budget-Umrechnung, Endpunkte, Body) sind node-testbar; die
// fetch-Aufrufe sind gegen die Live-API erst verifizierbar, sobald das jeweilige
// Werbekonto verbunden ist. SICHERHEIT: alles wird PAUSIERT angelegt.
//
// HINWEIS Google: braucht zusätzlich einen App-weiten Entwickler-Token
// (Umgebungsvariable GOOGLE_ADS_DEVELOPER_TOKEN).
// ============================================================================

export type SchaltErgebnis = { ok: boolean; campaign_id?: string; fehler?: string };
export type StatusAntwort = { ok: boolean; fehler?: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
function budgetZahl(v: number | null | undefined): number {
  const n = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
  return n;
}

// ======================= GOOGLE ADS =========================================
// REST, Objekt-Kette: CampaignBudget -> Campaign. Budget in Micros (€ × 1e6).

const GOOGLE_VERSION = 'v18';

export function googleStatus(intern: string | null | undefined): 'ENABLED' | 'PAUSED' | 'REMOVED' {
  if (intern === 'aktiv') return 'ENABLED';
  if (intern === 'beendet') return 'REMOVED';
  return 'PAUSED';
}
export function budgetMicros(euro: number | null | undefined): string {
  return String(Math.max(1_000_000, Math.round(budgetZahl(euro) * 1_000_000)));
}
export function googleEndpoint(customerId: string, ressource: string): string {
  const cid = (customerId || '').replace(/[^0-9]/g, '');
  return `https://googleads.googleapis.com/${GOOGLE_VERSION}/customers/${cid}/${ressource}`;
}
export function baueGoogleBudgetOp(name: string, euro: number | null | undefined) {
  return { operations: [{ create: { name: `${name} — Budget`, amountMicros: budgetMicros(euro), deliveryMethod: 'STANDARD' } }] };
}
export function baueGoogleCampaignOp(name: string, budgetResourceName: string, intern: string) {
  return {
    operations: [{
      create: {
        name,
        status: googleStatus(intern),
        advertisingChannelType: 'SEARCH',
        campaignBudget: budgetResourceName,
        networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false },
      },
    }],
  };
}

async function googleMutate(url: string, body: unknown, token: string, entwicklerToken: string): Promise<{ ok: boolean; resourceName?: string; fehler?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'developer-token': entwicklerToken },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, fehler: j?.error?.message || `Google-Ads-Fehler (HTTP ${res.status}).` };
    const rn = j?.results?.[0]?.resourceName;
    return { ok: true, resourceName: rn ? String(rn) : undefined };
  } catch { return { ok: false, fehler: 'Verbindung zur Google-Ads-API fehlgeschlagen.' }; }
}

export async function schalteGoogleKampagne(v: { kontoId: string; token: string; name: string; tagesbudget: number | null; intern?: string }): Promise<SchaltErgebnis> {
  const entwicklerToken = (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim();
  if (!entwicklerToken) return { ok: false, fehler: 'Google-Ads-Entwickler-Token (GOOGLE_ADS_DEVELOPER_TOKEN) fehlt in den Umgebungsvariablen.' };
  const budget = await googleMutate(googleEndpoint(v.kontoId, 'campaignBudgets:mutate'), baueGoogleBudgetOp(v.name, v.tagesbudget), v.token, entwicklerToken);
  if (!budget.ok || !budget.resourceName) return { ok: false, fehler: budget.fehler || 'Google-Budget konnte nicht angelegt werden.' };
  const camp = await googleMutate(googleEndpoint(v.kontoId, 'campaigns:mutate'), baueGoogleCampaignOp(v.name, budget.resourceName, 'bereit'), v.token, entwicklerToken);
  if (!camp.ok || !camp.resourceName) return { ok: false, fehler: camp.fehler || 'Google-Kampagne konnte nicht angelegt werden.' };
  return { ok: true, campaign_id: camp.resourceName };
}

export async function setzeGoogleStatus(kontoId: string, campaignResourceName: string, intern: string, token: string): Promise<StatusAntwort> {
  const entwicklerToken = (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim();
  if (!entwicklerToken) return { ok: false, fehler: 'Google-Ads-Entwickler-Token fehlt.' };
  const body = { operations: [{ update: { resourceName: campaignResourceName, status: googleStatus(intern) }, updateMask: 'status' }] };
  const res = await googleMutate(googleEndpoint(kontoId, 'campaigns:mutate'), body, token, entwicklerToken);
  return { ok: res.ok, fehler: res.fehler };
}

// ======================= LINKEDIN ===========================================
// REST (Rest.li). Kampagne unter urn:li:sponsoredAccount. Budget in Major-Units.

export function linkedinStatus(intern: string | null | undefined): 'ACTIVE' | 'PAUSED' | 'ARCHIVED' {
  if (intern === 'aktiv') return 'ACTIVE';
  if (intern === 'beendet') return 'ARCHIVED';
  return 'PAUSED';
}
export function baueLinkedinCampaign(v: { kontoUrn: string; name: string; tagesbudget: number | null; intern: string }) {
  return {
    account: v.kontoUrn,
    name: v.name,
    type: 'SPONSORED_UPDATES',
    status: linkedinStatus(v.intern),
    costType: 'CPM',
    dailyBudget: { amount: String(r2(budgetZahl(v.tagesbudget))), currencyCode: 'EUR' },
  };
}

async function linkedinPost(url: string, body: unknown, token: string, method = 'POST', extraHeaders: Record<string, string> = {}): Promise<{ ok: boolean; id?: string; fehler?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json', authorization: `Bearer ${token}`,
        'x-restli-protocol-version': '2.0.0', 'linkedin-version': '202401', ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const j = await res.json().catch(() => null); return { ok: false, fehler: j?.message || `LinkedIn-Fehler (HTTP ${res.status}).` }; }
    const id = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || undefined;
    return { ok: true, id: id ? String(id) : undefined };
  } catch { return { ok: false, fehler: 'Verbindung zur LinkedIn-API fehlgeschlagen.' }; }
}

export async function schalteLinkedinKampagne(v: { kontoId: string; token: string; name: string; tagesbudget: number | null }): Promise<SchaltErgebnis> {
  const kontoUrn = v.kontoId.startsWith('urn:') ? v.kontoId : `urn:li:sponsoredAccount:${v.kontoId.replace(/[^0-9]/g, '')}`;
  const res = await linkedinPost('https://api.linkedin.com/rest/adCampaigns', baueLinkedinCampaign({ kontoUrn, name: v.name, tagesbudget: v.tagesbudget, intern: 'bereit' }), v.token);
  if (!res.ok) return { ok: false, fehler: res.fehler };
  return { ok: true, campaign_id: res.id };
}

export async function setzeLinkedinStatus(campaignId: string, intern: string, token: string): Promise<StatusAntwort> {
  const id = campaignId.replace(/^urn:li:sponsoredCampaign:/, '');
  const body = { patch: { $set: { status: linkedinStatus(intern) } } };
  const res = await linkedinPost(`https://api.linkedin.com/rest/adCampaigns/${id}`, body, token, 'POST', { 'x-restli-method': 'partial_update' });
  return { ok: res.ok, fehler: res.fehler };
}

// ======================= TIKTOK =============================================
// Business API v1.3. Kampagne je advertiser_id. Budget in Konto-Währung (Major).

const TIKTOK_BASIS = 'https://business-api.tiktok.com/open_api/v1.3';

export function tiktokObjective(ziel: string | null | undefined): string {
  switch (ziel) {
    case 'bekanntheit': return 'REACH';
    case 'interaktion': return 'ENGAGEMENT';
    case 'leads': return 'LEAD_GENERATION';
    case 'verkaeufe': return 'WEB_CONVERSIONS';
    case 'traffic':
    default: return 'TRAFFIC';
  }
}
export function tiktokOperationStatus(intern: string | null | undefined): 'ENABLE' | 'DISABLE' | 'DELETE' {
  if (intern === 'aktiv') return 'ENABLE';
  if (intern === 'beendet') return 'DELETE';
  return 'DISABLE';
}
export function baueTiktokCampaign(v: { advertiserId: string; name: string; ziel: string | null; tagesbudget: number | null }) {
  return {
    advertiser_id: v.advertiserId,
    campaign_name: v.name,
    objective_type: tiktokObjective(v.ziel),
    budget_mode: 'BUDGET_MODE_DAY',
    budget: budgetZahl(v.tagesbudget),
    operation_status: 'DISABLE', // immer pausiert anlegen
  };
}

async function tiktokPost(pfad: string, body: unknown, token: string): Promise<{ ok: boolean; id?: string; fehler?: string }> {
  try {
    const res = await fetch(`${TIKTOK_BASIS}${pfad}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'access-token': token },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    // TikTok liefert HTTP 200 + code!=0 bei Fehlern.
    if (!res.ok || (j && typeof j.code === 'number' && j.code !== 0)) {
      return { ok: false, fehler: j?.message || `TikTok-Fehler (HTTP ${res.status}).` };
    }
    const id = j?.data?.campaign_id;
    return { ok: true, id: id ? String(id) : undefined };
  } catch { return { ok: false, fehler: 'Verbindung zur TikTok-API fehlgeschlagen.' }; }
}

export async function schalteTiktokKampagne(v: { kontoId: string; token: string; name: string; ziel: string | null; tagesbudget: number | null }): Promise<SchaltErgebnis> {
  const res = await tiktokPost('/campaign/create/', baueTiktokCampaign({ advertiserId: v.kontoId, name: v.name, ziel: v.ziel, tagesbudget: v.tagesbudget }), v.token);
  if (!res.ok) return { ok: false, fehler: res.fehler };
  return { ok: true, campaign_id: res.id };
}

export async function setzeTiktokStatus(advertiserId: string, campaignId: string, intern: string, token: string): Promise<StatusAntwort> {
  const res = await tiktokPost('/campaign/status/update/', { advertiser_id: advertiserId, campaign_ids: [campaignId], operation_status: tiktokOperationStatus(intern) }, token);
  return { ok: res.ok, fehler: res.fehler };
}
