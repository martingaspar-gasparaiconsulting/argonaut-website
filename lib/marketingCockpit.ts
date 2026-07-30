// ============================================================================
// ARGONAUT OS · lib/marketingCockpit.ts — kanalübergreifende Marketing-Kennzahlen
// (Marketing-Cockpit · alle Kanäle auf einen Blick)
//
// KEINE Netzwerk-/Supabase-Aufrufe — nur pure, node-testbare Aggregation. Die
// Route liest die Roh-Zeilen je Kanal (RLS-scoped) und ruft fasseCockpit().
// ============================================================================

// Kleine, eigenständige Helfer (kein Cross-Import -> node-testbar + build-sicher).
function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const n = Number(String(v ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function roasVon(umsatz: number, ausgaben: number): number | null {
  if (ausgaben <= 0) return null;
  return Math.round((umsatz / ausgaben) * 100) / 100;
}

export type CockpitRoh = {
  newsletterAbos?: { status?: string | null }[] | null;
  newsletterVersand?: { erfolg_anzahl?: number | null }[] | null;
  socialBeitraege?: { status?: string | null }[] | null;
  socialKanaele?: { aktiv?: boolean | null; verbunden?: boolean | null }[] | null;
  whatsappKontakte?: { status?: string | null }[] | null;
  whatsappVersand?: { status?: string | null }[] | null;
  adsKampagnen?: { status?: string | null; tagesbudget?: number | null }[] | null;
  adsErgebnisse?: { ausgaben?: number | null; umsatz?: number | null; klicks?: number | null; conversions?: number | null }[] | null;
  leads?: { status?: string | null; kampagne_id?: string | null }[] | null;
};

/** Zeilen zählen, deren Feld einen der Werte hat. */
function zaehle<T extends Record<string, unknown>>(rows: T[] | null | undefined, feld: keyof T, werte: unknown[]): number {
  let n = 0;
  for (const r of rows || []) if (werte.includes(r?.[feld])) n++;
  return n;
}

export function fasseCockpit(roh: CockpitRoh) {
  const newsletterAbos = roh.newsletterAbos || [];
  const nlVersand = roh.newsletterVersand || [];
  const socialBeitraege = roh.socialBeitraege || [];
  const socialKanaele = roh.socialKanaele || [];
  const waKontakte = roh.whatsappKontakte || [];
  const waVersand = roh.whatsappVersand || [];
  const adsKampagnen = roh.adsKampagnen || [];
  const leads = roh.leads || [];

  const newsletter = {
    abonnenten: zaehle(newsletterAbos, 'status', ['aktiv']),
    kampagnen: nlVersand.length,
    mails_gesendet: nlVersand.reduce((s, v) => s + Math.round(num(v?.erfolg_anzahl)), 0),
  };

  const social = {
    beitraege: socialBeitraege.length,
    geplant: zaehle(socialBeitraege, 'status', ['geplant']),
    gesendet: zaehle(socialBeitraege, 'status', ['gesendet']),
    kanaele_verbunden: zaehle(socialKanaele, 'verbunden', [true]),
  };

  const whatsapp = {
    kontakte: zaehle(waKontakte, 'status', ['aktiv']),
    gesendet: zaehle(waVersand, 'status', ['gesendet']),
  };

  const adsErgebnisse = roh.adsErgebnisse || [];
  const adsAusgaben = Math.round(adsErgebnisse.reduce((s, e) => s + num(e?.ausgaben), 0) * 100) / 100;
  const adsUmsatz = Math.round(adsErgebnisse.reduce((s, e) => s + num(e?.umsatz), 0) * 100) / 100;
  const adsKlicks = adsErgebnisse.reduce((s, e) => s + Math.round(num(e?.klicks)), 0);
  const ads = {
    kampagnen: adsKampagnen.length,
    aktiv: zaehle(adsKampagnen, 'status', ['aktiv']),
    ausgaben: adsAusgaben,
    umsatz: adsUmsatz,
    klicks: adsKlicks,
    roas: roasVon(adsUmsatz, adsAusgaben),
  };

  const leadKpi = {
    gesamt: leads.length,
    neu: zaehle(leads, 'status', ['neu']),
    ausKampagne: leads.filter((l) => !!l?.kampagne_id).length,
  };

  // „Aktive Kanäle" = wie viele der vier Kanäle tatsächlich in Nutzung sind.
  const aktiveKanaele =
    (newsletter.abonnenten > 0 ? 1 : 0) +
    (social.gesendet > 0 || social.kanaele_verbunden > 0 ? 1 : 0) +
    (whatsapp.kontakte > 0 ? 1 : 0) +
    (ads.aktiv > 0 || ads.kampagnen > 0 ? 1 : 0);

  return {
    newsletter,
    social,
    whatsapp,
    ads,
    leads: leadKpi,
    gesamt: {
      leads: leadKpi.gesamt,
      aktive_kanaele: aktiveKanaele,
      ads_ausgaben: ads.ausgaben,
      ads_umsatz: ads.umsatz,
      ads_roas: ads.roas,
    },
  };
}

export type CockpitDaten = ReturnType<typeof fasseCockpit>;
