// ============================================================================
// ARGONAUT OS · lib/adsVersand.ts — Schalt-Motor für bezahlte Werbung (Ads P3)
//
// Meta zuerst (Facebook + Instagram über die Meta-Marketing-API). Baut die
// Objekt-Kette Campaign → AdSet → AdCreative → Ad und steuert danach den Status
// (aktiv/pausiert/beendet). Google/LinkedIn/TikTok-Schalten folgen als eigenes
// Paket (Motor bewusst so aufgebaut, dass weitere Anbieter andocken).
//
// SICHERHEIT: Neue Kampagnen werden IMMER pausiert (PAUSED) angelegt — echtes
// Ausspielen erst nach bewusstem „Aktiv schalten". Reine Bauteile (Mapping,
// Budget-Umrechnung, Payload-Builder) sind node-testbar; nur sendeMetaAnfrage /
// schalteMetaKampagne sprechen mit dem Netz (gegen Live-API testbar, sobald das
// Werbekonto verbunden ist + APP_ENC_KEY gesetzt).
// ============================================================================

const META_VERSION = 'v21.0';

/** Interner Kampagnen-Status -> Meta-Status. Default schützt: PAUSED. */
export function metaStatusFuer(intern: string | null | undefined): 'ACTIVE' | 'PAUSED' | 'ARCHIVED' {
  if (intern === 'aktiv') return 'ACTIVE';
  if (intern === 'beendet') return 'ARCHIVED';
  return 'PAUSED'; // entwurf | bereit | pausiert | alles andere
}

/** ARGONAUT-Ziel -> Meta-Kampagnen-Objective (OUTCOME-Modell). */
export function zielZuObjective(ziel: string | null | undefined): string {
  switch (ziel) {
    case 'bekanntheit': return 'OUTCOME_AWARENESS';
    case 'interaktion': return 'OUTCOME_ENGAGEMENT';
    case 'leads': return 'OUTCOME_LEADS';
    case 'verkaeufe': return 'OUTCOME_SALES';
    case 'traffic':
    default: return 'OUTCOME_TRAFFIC';
  }
}

/** ARGONAUT-Ziel -> AdSet-Optimierung (optimization_goal + billing_event).
 *  Bewusst konservative Defaults: keine Pixel-/Lead-Formular-Abhängigkeit in P3
 *  (native Lead-Formulare & Conversion-Optimierung folgen später). */
export function zielZuOptimierung(ziel: string | null | undefined): { optimization_goal: string; billing_event: string } {
  switch (ziel) {
    case 'bekanntheit': return { optimization_goal: 'REACH', billing_event: 'IMPRESSIONS' };
    case 'interaktion': return { optimization_goal: 'POST_ENGAGEMENT', billing_event: 'IMPRESSIONS' };
    case 'leads': return { optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS' };
    case 'verkaeufe': return { optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS' };
    case 'traffic':
    default: return { optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS' };
  }
}

/** Euro -> Meta-Budget in Minor-Units (Cent), als String. Nie unter 100 (1 €). */
export function budgetCents(euro: number | null | undefined): string {
  const e = typeof euro === 'number' && Number.isFinite(euro) && euro > 0 ? euro : 0;
  const cents = Math.round(e * 100);
  return String(Math.max(100, cents));
}

/** Werbekonto-ID normalisieren: immer mit „act_"-Präfix (Meta erwartet das). */
export function normalisiereActId(kontoId: string | null | undefined): string {
  const s = (kontoId || '').trim();
  if (!s) return '';
  return s.startsWith('act_') ? s : `act_${s}`;
}

/** Endpunkt für ein Werbekonto-Objekt (campaigns|adsets|adcreatives|ads). */
export function metaEndpoint(kontoId: string, kind: 'campaigns' | 'adsets' | 'adcreatives' | 'ads'): string {
  return `https://graph.facebook.com/${META_VERSION}/${normalisiereActId(kontoId)}/${kind}`;
}

/** Endpunkt für ein bestehendes Objekt (Status ändern per POST). */
export function metaObjektEndpoint(objektId: string): string {
  return `https://graph.facebook.com/${META_VERSION}/${(objektId || '').trim()}`;
}

// ---- Payload-Builder (rein) ---------------------------------------------------

export function baueCampaignBody(v: { name: string; ziel: string | null | undefined; status: string }): Record<string, unknown> {
  return {
    name: v.name,
    objective: zielZuObjective(v.ziel),
    status: metaStatusFuer(v.status),
    special_ad_categories: [],
  };
}

export function baueAdSetBody(v: {
  name: string; campaignId: string; tagesbudgetEuro: number | null | undefined;
  startIso?: string | null; endIso?: string | null; ziel: string | null | undefined; status: string;
}): Record<string, unknown> {
  const opt = zielZuOptimierung(v.ziel);
  const body: Record<string, unknown> = {
    name: v.name,
    campaign_id: v.campaignId,
    daily_budget: budgetCents(v.tagesbudgetEuro),
    billing_event: opt.billing_event,
    optimization_goal: opt.optimization_goal,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: { geo_locations: { countries: ['DE'] } },
    status: metaStatusFuer(v.status),
  };
  if (v.startIso) body.start_time = new Date(v.startIso).toISOString();
  if (v.endIso) body.end_time = new Date(v.endIso).toISOString();
  return body;
}

export function baueCreativeBody(v: {
  name: string; pageId: string; message: string; ueberschrift?: string | null; link: string; bildUrl?: string | null;
}): Record<string, unknown> {
  const link_data: Record<string, unknown> = { message: v.message, link: v.link };
  if (v.ueberschrift) link_data.name = v.ueberschrift;
  if (v.bildUrl) link_data.picture = v.bildUrl;
  return {
    name: v.name,
    object_story_spec: { page_id: v.pageId, link_data },
  };
}

export function baueAdBody(v: { name: string; adsetId: string; creativeId: string; status: string }): Record<string, unknown> {
  return {
    name: v.name,
    adset_id: v.adsetId,
    creative: { creative_id: v.creativeId },
    status: metaStatusFuer(v.status),
  };
}

/** Was fehlt, damit eine Kampagne bei Meta schaltbar ist? (klartext, node-testbar) */
export function metaSchaltProbleme(v: {
  kanaele?: string[] | null; ziel_url?: string | null; pageId?: string | null; tagesbudget?: number | null;
}): string[] {
  const fehler: string[] = [];
  if (!(v.kanaele || []).includes('meta')) fehler.push('Diese Kampagne hat Meta nicht als Kanal ausgewählt.');
  if (!(v.ziel_url || '').trim()) fehler.push('Bitte eine Ziel-URL angeben (wohin die Anzeige führen soll).');
  if (!(v.pageId || '').trim()) fehler.push('Es ist keine Facebook-Seite verbunden — bitte unter „Social“ die Facebook-Seite verbinden.');
  if (!(typeof v.tagesbudget === 'number' && v.tagesbudget > 0)) fehler.push('Es ist kein Tagesbudget hinterlegt.');
  return fehler;
}

// ---- Netz (unrein) ------------------------------------------------------------

export type MetaAntwort = { ok: boolean; id?: string; fehler?: string };

/** Ein POST an die Meta-Graph-API mit Bearer-Token. JSON rein/raus. */
export async function sendeMetaAnfrage(url: string, body: Record<string, unknown>, token: string): Promise<MetaAntwort> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = j?.error?.error_user_msg || j?.error?.message || `Meta-API-Fehler (HTTP ${res.status}).`;
      return { ok: false, fehler: msg };
    }
    return { ok: true, id: j?.id ? String(j.id) : undefined };
  } catch {
    return { ok: false, fehler: 'Verbindung zur Meta-API fehlgeschlagen.' };
  }
}

export type SchaltErgebnis = {
  ok: boolean;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  creative_id?: string;
  fehler?: string;
};

/**
 * Legt eine ARGONAUT-Kampagne als echte Meta-Kampagne an (PAUSED). Reihenfolge
 * Campaign -> AdSet -> AdCreative -> Ad; bricht bei erstem Fehler ab und meldet
 * klar, was erreicht wurde (die Teil-IDs, damit nichts „verwaist" bleibt).
 */
export async function schalteMetaKampagne(v: {
  kontoId: string; token: string; pageId: string;
  name: string; ziel: string | null; tagesbudget: number | null;
  startIso?: string | null; endIso?: string | null;
  message: string; ueberschrift?: string | null; zielUrl: string; bildUrl?: string | null;
}): Promise<SchaltErgebnis> {
  // Immer pausiert anlegen (Sicherheit) — Aktivieren ist ein bewusster zweiter Schritt.
  const anlege = 'bereit';

  const camp = await sendeMetaAnfrage(metaEndpoint(v.kontoId, 'campaigns'),
    baueCampaignBody({ name: v.name, ziel: v.ziel, status: anlege }), v.token);
  if (!camp.ok || !camp.id) return { ok: false, fehler: camp.fehler || 'Kampagne konnte nicht angelegt werden.' };

  const adset = await sendeMetaAnfrage(metaEndpoint(v.kontoId, 'adsets'),
    baueAdSetBody({ name: `${v.name} — Anzeigengruppe`, campaignId: camp.id, tagesbudgetEuro: v.tagesbudget, startIso: v.startIso, endIso: v.endIso, ziel: v.ziel, status: anlege }), v.token);
  if (!adset.ok || !adset.id) return { ok: false, campaign_id: camp.id, fehler: adset.fehler || 'Anzeigengruppe konnte nicht angelegt werden.' };

  const creative = await sendeMetaAnfrage(metaEndpoint(v.kontoId, 'adcreatives'),
    baueCreativeBody({ name: `${v.name} — Motiv`, pageId: v.pageId, message: v.message, ueberschrift: v.ueberschrift, link: v.zielUrl, bildUrl: v.bildUrl }), v.token);
  if (!creative.ok || !creative.id) return { ok: false, campaign_id: camp.id, adset_id: adset.id, fehler: creative.fehler || 'Anzeigenmotiv konnte nicht angelegt werden.' };

  const ad = await sendeMetaAnfrage(metaEndpoint(v.kontoId, 'ads'),
    baueAdBody({ name: `${v.name} — Anzeige`, adsetId: adset.id, creativeId: creative.id, status: anlege }), v.token);
  if (!ad.ok || !ad.id) return { ok: false, campaign_id: camp.id, adset_id: adset.id, creative_id: creative.id, fehler: ad.fehler || 'Anzeige konnte nicht angelegt werden.' };

  return { ok: true, campaign_id: camp.id, adset_id: adset.id, creative_id: creative.id, ad_id: ad.id };
}

/** Status einer bestehenden Meta-Kampagne setzen (aktiv/pausiert/beendet). */
export async function setzeMetaStatus(campaignId: string, intern: string, token: string): Promise<MetaAntwort> {
  return sendeMetaAnfrage(metaObjektEndpoint(campaignId), { status: metaStatusFuer(intern) }, token);
}
