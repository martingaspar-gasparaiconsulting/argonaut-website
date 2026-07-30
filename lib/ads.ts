// ============================================================================
// ARGONAUT OS · lib/ads.ts — reine Helfer fuer bezahlte Werbung (Ads)
// (Ads Paket 1 · Fundament — Kampagnen-Editor + Kanal-Verwaltung + Transparenz)
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — nur pure Funktionen
// (node-testbar). Das echte Verbinden (Werbekonto-Token je Plattform) + das
// echte Schalten/Budget-Steuern kommen in den Folgepaketen (P2+), pro Plattform,
// sobald der Zugang beim Betrieb hinterlegt ist. ARGONAUT bleibt sein eigener
// interner Aggregator (kein Fremd-Dienst zwischen Betrieb und Werbeplattform).
//
// Budget-Zahlen sind bewusst RICHTWERTE (Stand 07/2026, plattform-/laenderabhaengig)
// — sie schuetzen den Nutzer vor unmoeglichen Eingaben, sind aber keine Zusage.
// ============================================================================

export type AdsPlattformId = 'meta' | 'google' | 'linkedin' | 'tiktok';

/** Kern = direkt/verbreitet. Schwanz = mit zusaetzlicher Huerde (Audit/Nische). */
export type AdsGruppe = 'kern' | 'schwanz';

export type AdsPlattform = {
  id: AdsPlattformId;
  name: string;
  icon: string;
  gruppe: AdsGruppe;
  mindestTagesbudget: number;   // technischer Richtwert-Boden je Tag (EUR); 0 = kein festes Minimum
  empfohlenTagesbudget: number; // praktischer Startwert je Tag (EUR, Richtwert)
  apiKurz: string;              // Schalt-Weg in einem Satz
  kostenKurz: string;           // eine Zeile fuer die Transparenz-Box
  freigabeKurz: string;         // welche Freigabe / Huerde
  link: string;                 // offizielle Doku/Preise
};

/**
 * Ads-Kanal-Landkarte (Stand 07/2026). Kern zuerst (Reichweite/Relevanz fuer
 * den DE-Mittelstand), danach der Schwanz. Mindestbudgets sind Richtwerte des
 * jeweiligen Anbieters und koennen sich aendern.
 */
export const ADS_PLATTFORMEN: AdsPlattform[] = [
  {
    id: 'meta',
    name: 'Meta (Facebook & Instagram)',
    icon: '📘',
    gruppe: 'kern',
    mindestTagesbudget: 1,
    empfohlenTagesbudget: 10,
    apiKurz: 'Anzeigen über die Meta-Marketing-API (ein Werbekonto für Facebook & Instagram).',
    kostenKurz: 'Zugang kostenlos · Werbebudget zahlen Sie direkt an Meta · techn. Minimum ~1 €/Tag',
    freigabeKurz: 'Meta-Business-Konto + Werbekonto + Meta-App mit Marketing-API-Zugriff.',
    link: 'https://developers.facebook.com/docs/marketing-apis/',
  },
  {
    id: 'google',
    name: 'Google Ads',
    icon: '🔍',
    gruppe: 'kern',
    mindestTagesbudget: 0,
    empfohlenTagesbudget: 10,
    apiKurz: 'Such- und Display-Anzeigen über die Google-Ads-API.',
    kostenKurz: 'Zugang kostenlos · kein festes Mindestbudget · Werbekosten direkt an Google',
    freigabeKurz: 'Google-Ads-Konto + Entwickler-Token (Basic-/Standard-Freigabe durch Google).',
    link: 'https://developers.google.com/google-ads/api/docs/start',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn Ads',
    icon: '💼',
    gruppe: 'kern',
    mindestTagesbudget: 10,
    empfohlenTagesbudget: 100,
    apiKurz: 'B2B-Anzeigen über die LinkedIn-Marketing-API (Kampagnen-Manager).',
    kostenKurz: 'Zugang kostenlos · Minimum ~10 €/Tag je Kampagne · Werbekosten direkt an LinkedIn',
    freigabeKurz: 'LinkedIn-Werbekonto + Marketing-Developer-App (Freigabe durch LinkedIn).',
    link: 'https://learn.microsoft.com/linkedin/marketing/',
  },
  {
    id: 'tiktok',
    name: 'TikTok Ads',
    icon: '🎵',
    gruppe: 'schwanz',
    mindestTagesbudget: 50,
    empfohlenTagesbudget: 50,
    apiKurz: 'Video-Anzeigen über die TikTok-Marketing-API (TikTok Ads Manager).',
    kostenKurz: 'Zugang kostenlos (App-Audit) · Minimum ~50 €/Tag (Kampagne) · Werbekosten direkt an TikTok',
    freigabeKurz: 'TikTok-Business-Konto + Marketing-API-App (Audit/Freigabe durch TikTok).',
    link: 'https://business-api.tiktok.com/portal/docs',
  },
];

/** Werbe-Ziele (plattformuebergreifend, kuratiert). */
export type AdsZiel = { id: string; label: string; hinweis: string };

export const ADS_ZIELE: AdsZiel[] = [
  { id: 'bekanntheit', label: 'Bekanntheit & Reichweite', hinweis: 'Möglichst viele Menschen erreichen.' },
  { id: 'traffic', label: 'Websitebesuche (Traffic)', hinweis: 'Nutzer auf Ihre Seite oder Landingpage bringen.' },
  { id: 'interaktion', label: 'Interaktion', hinweis: 'Mehr Likes, Kommentare und Videoaufrufe.' },
  { id: 'leads', label: 'Leads & Anfragen', hinweis: 'Kontaktdaten von Interessenten sammeln.' },
  { id: 'verkaeufe', label: 'Verkäufe & Conversions', hinweis: 'Käufe oder Abschlüsse auslösen.' },
];

/** Reihenfolge/Labels der Kampagnen-Status. In P1 setzt der Editor nur
 *  'entwurf' | 'bereit'; 'aktiv' | 'pausiert' | 'beendet' folgen mit dem
 *  echten Schalten (P3). */
export const ADS_STATUS: { id: string; label: string }[] = [
  { id: 'entwurf', label: 'Entwurf' },
  { id: 'bereit', label: 'Bereit zum Schalten' },
  { id: 'aktiv', label: 'Aktiv' },
  { id: 'pausiert', label: 'Pausiert' },
  { id: 'beendet', label: 'Beendet' },
];

/** Gueltige Ids (fuer Server-Validierung). */
export const ADS_PLATTFORM_IDS: string[] = ADS_PLATTFORMEN.map((p) => p.id);
export const ADS_ZIEL_IDS: string[] = ADS_ZIELE.map((z) => z.id);

/** Plattform-Objekt per Id (oder null). */
export function plattformFuer(id: string | null | undefined): AdsPlattform | null {
  return ADS_PLATTFORMEN.find((p) => p.id === id) ?? null;
}

/** Alle Plattformen einer Gruppe (kern/schwanz), in Katalog-Reihenfolge. */
export function plattformenNachGruppe(gruppe: AdsGruppe): AdsPlattform[] {
  return ADS_PLATTFORMEN.filter((p) => p.gruppe === gruppe);
}

/** Ziel-Objekt per Id (oder null). */
export function zielFuer(id: string | null | undefined): AdsZiel | null {
  return ADS_ZIELE.find((z) => z.id === id) ?? null;
}

/** Nur bekannte Plattform-Ids aus einer Roh-Liste (dedupe, Katalog-Reihenfolge). */
export function bereinigeKanaele(roh: unknown): AdsPlattformId[] {
  const set = new Set<string>();
  if (Array.isArray(roh)) for (const r of roh) if (typeof r === 'string') set.add(r);
  return ADS_PLATTFORMEN.filter((p) => set.has(p.id)).map((p) => p.id);
}

/** Zahl aus beliebiger Eingabe (Komma/Punkt), sonst 0. Nie negativ. */
export function zuBetrag(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const s = String(v ?? '').trim().replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Euro-Format (de-DE), z. B. 1500 -> „1.500,00 €". null/0-sicher. */
export function formatEuro(n: number | null | undefined): string {
  const w = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return w.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/**
 * Laufzeit in Tagen (inklusiv). Beide Datumsangaben noetig (ISO/YYYY-MM-DD),
 * Ende darf nicht vor Start liegen -> sonst null.
 */
export function laufzeitTage(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  if (!startIso || !endIso) return null;
  const a = new Date(startIso), b = new Date(endIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const tage = Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
  return tage >= 1 ? tage : null;
}

/**
 * Geschaetztes Gesamtbudget = Tagesbudget x Laufzeittage. Ohne vollstaendige
 * Laufzeit -> null (dann zeigt die UI nur das Tagesbudget).
 */
export function gesamtBudget(
  tagesBudget: number | null | undefined,
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): number | null {
  const tb = zuBetrag(tagesBudget);
  const tage = laufzeitTage(startIso, endIso);
  if (tb <= 0 || tage == null) return null;
  return Math.round(tb * tage * 100) / 100;
}

/**
 * Budget-Probleme fuer EINEN Kanal: liegt das Tagesbudget unter dem
 * technischen Mindestbudget der Plattform? (Richtwert, blockiert nicht hart —
 * aber warnt klar.)
 */
export function budgetProblemeFuerKanal(plattformId: string, tagesBudget: number): string[] {
  const p = plattformFuer(plattformId);
  const fehler: string[] = [];
  if (!p) return fehler;
  const tb = zuBetrag(tagesBudget);
  if (p.mindestTagesbudget > 0 && tb > 0 && tb < p.mindestTagesbudget) {
    fehler.push(`${p.name}: Tagesbudget unter dem Richtwert-Minimum (~${p.mindestTagesbudget} €/Tag).`);
  }
  return fehler;
}

export type KampagneEingabe = {
  name?: string | null;
  ziel?: string | null;
  kanaele?: string[] | null;
  tagesBudget?: number | string | null;
  startDatum?: string | null;
  endDatum?: string | null;
};

/**
 * Gesamt-Pruefung einer Kampagne vor dem Speichern. Regeln: Name, mind. ein
 * Kanal, gueltiges Ziel, Tagesbudget > 0, Laufzeit (Ende nicht vor Start) und
 * je Kanal die Budget-Richtwerte. Klare deutsche Meldungen.
 */
export function validiereKampagne(v: KampagneEingabe): { ok: boolean; fehler: string[] } {
  const fehler: string[] = [];
  const name = (v?.name || '').trim();
  const kanaele = bereinigeKanaele(v?.kanaele);
  const tb = zuBetrag(v?.tagesBudget);

  if (!name) fehler.push('Bitte einen Namen für die Kampagne eingeben.');
  if (kanaele.length === 0) fehler.push('Bitte mindestens einen Werbekanal auswählen.');
  if (v?.ziel && !ADS_ZIEL_IDS.includes(v.ziel)) fehler.push('Unbekanntes Kampagnen-Ziel.');
  if (tb <= 0) fehler.push('Bitte ein Tagesbudget (größer 0) eingeben.');

  if (v?.startDatum && v?.endDatum) {
    const tage = laufzeitTage(v.startDatum, v.endDatum);
    if (tage == null) fehler.push('Das Enddatum darf nicht vor dem Startdatum liegen.');
  }

  for (const id of kanaele) fehler.push(...budgetProblemeFuerKanal(id, tb));

  return { ok: fehler.length === 0, fehler };
}

/** Kampagnen zaehlen nach Status (fuer KPI). */
export function zaehleKampagnen(liste: { status?: string | null }[]): {
  gesamt: number; entwurf: number; bereit: number; aktiv: number;
} {
  const l = liste || [];
  let entwurf = 0, bereit = 0, aktiv = 0;
  for (const x of l) {
    if (x?.status === 'bereit') bereit++;
    else if (x?.status === 'aktiv') aktiv++;
    else if (x?.status === 'entwurf' || !x?.status) entwurf++;
  }
  return { gesamt: l.length, entwurf, bereit, aktiv };
}

/** Aktive (vorgemerkte) Werbekanaele zaehlen. */
export function zaehleAdsKanaele(liste: { aktiv?: boolean | null }[]): { gesamt: number; aktiv: number } {
  const l = liste || [];
  let aktiv = 0;
  for (const x of l) if (x?.aktiv) aktiv++;
  return { gesamt: l.length, aktiv };
}

// ============================================================================
// WERBEKONTO-VERBINDUNG (Ads P2)
// Generische, token-basierte Verbindung je Werbekonto (Muster wie Social/Meta):
// Konto-Kennung + Zugangs-Token werden serverseitig AES-256-GCM verschluesselt
// (lib/crypto.ts) in ads_zugang abgelegt. Der Token wird nie an den Client
// zurueckgegeben. Das echte Schalten (P3) liest + entschluesselt serverseitig.
// ============================================================================

/** Alle Ad-Plattformen, die per Token-Verbindung anbindbar sind (aktuell alle 4). */
export const VERBINDBARE_ADS: AdsPlattformId[] = ['meta', 'google', 'linkedin', 'tiktok'];

export function istVerbindbar(id: string | null | undefined): boolean {
  return VERBINDBARE_ADS.includes(id as AdsPlattformId);
}

export type AdsVerbindungFeld = { kontoLabel: string; kontoHinweis: string; tokenLabel: string };

/** Welche Felder der Betrieb je Werbekonto eintraegt (UI-getrieben aus Daten). */
export const ADS_VERBINDUNG_FELDER: Record<AdsPlattformId, AdsVerbindungFeld> = {
  meta: {
    kontoLabel: 'Werbekonto-ID (act_…)',
    kontoHinweis: 'Ihre Meta-Werbekonto-ID aus dem Werbeanzeigen-Manager, beginnt mit „act_“.',
    tokenLabel: 'System-User-Zugangs-Token',
  },
  google: {
    kontoLabel: 'Kundennummer (Customer-ID)',
    kontoHinweis: 'Ihre 10-stellige Google-Ads-Kundennummer (ohne Bindestriche), oben rechts im Konto.',
    tokenLabel: 'OAuth-Zugangs-Token',
  },
  linkedin: {
    kontoLabel: 'Werbekonto-URN',
    kontoHinweis: 'Form „urn:li:sponsoredAccount:…“ aus dem LinkedIn-Kampagnen-Manager.',
    tokenLabel: 'LinkedIn-Zugangs-Token',
  },
  tiktok: {
    kontoLabel: 'Advertiser-ID',
    kontoHinweis: 'Ihre TikTok-Advertiser-ID aus dem TikTok Ads Manager (Konto-Info).',
    tokenLabel: 'TikTok-Zugangs-Token',
  },
};

/** Feld-Definition zu einer Ad-Plattform (oder null, wenn nicht verbindbar). */
export function adsVerbindungFeld(id: string | null | undefined): AdsVerbindungFeld | null {
  return (id && istVerbindbar(id)) ? ADS_VERBINDUNG_FELDER[id as AdsPlattformId] : null;
}
