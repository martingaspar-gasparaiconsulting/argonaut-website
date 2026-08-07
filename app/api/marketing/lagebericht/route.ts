import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { fasseCockpit } from '@/lib/marketingCockpit';
import { lagebericht, lageAmpel, type LageInput } from '@/lib/marketingLagebericht';
import { funnelJeVariante, abSieger } from '@/lib/lpAnalytics';
import { kiFetch } from '@/lib/ki';

// ============================================================================
// ARGONAUT OS · app/api/marketing/lagebericht/route.ts
// Der KI-Marketing-Lagebericht. Liest alle Kanal-Rohdaten RLS-scoped (der
// Betrieb sieht nur eigenes bzw. das des Chefs — funktioniert für Kunde UND
// Betreiber), fasst sie zusammen, ermittelt Lead-Trend/Quelle, Landingpage-
// A/B-Sieger und Website-Kanäle, leitet daraus mechanisch die Befunde ab
// (lib/marketingLagebericht) und lässt die KI daraus einen kurzen Klartext
// formulieren (haiku; erfindet keine Zahlen). Jede Zusatz-Quelle ist defensiv.
// GET -> { ok, ampel, kpis, kanaeleLeads, befunde, klartext }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
type Row = Record<string, unknown>;

/** Defensive Abfrage: bei Fehler leere Liste (fehlt Tabelle in einem Konto → 0). */
async function hole(sb: Sb, tabelle: string, spalten: string): Promise<Row[]> {
  try {
    const { data, error } = await sb.from(tabelle).select(spalten).limit(5000);
    if (error) return [];
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  // RLS-scoped Rohdaten je Kanal.
  const [nlAbos, nlVersand, socialBeitraege, socialKanaele, waKontakte, waVersand, adsKampagnen, adsErgebnisse, leadsRoh] =
    await Promise.all([
      hole(supabase, 'newsletter_abonnenten', 'status'),
      hole(supabase, 'newsletter_versand', 'erfolg_anzahl'),
      hole(supabase, 'social_beitrag', 'status'),
      hole(supabase, 'social_kanal', 'verbunden'),
      hole(supabase, 'whatsapp_kontakt', 'status'),
      hole(supabase, 'whatsapp_versand', 'status'),
      hole(supabase, 'ads_kampagne', 'status, tagesbudget'),
      hole(supabase, 'ads_ergebnis', 'ausgaben, umsatz, klicks, conversions'),
      hole(supabase, 'leads', 'status, kampagne_id, quelle, created_at'),
    ]);

  const cockpit = fasseCockpit({
    newsletterAbos: nlAbos, newsletterVersand: nlVersand,
    socialBeitraege, socialKanaele,
    whatsappKontakte: waKontakte, whatsappVersand: waVersand,
    adsKampagnen, adsErgebnisse, leads: leadsRoh,
  });

  // Lead-Details: Trend Woche/Vorwoche + je Quelle.
  const jetzt = Date.now();
  const woche = 7 * 86400000;
  const zeit = (v: unknown) => { const t = new Date(String(v ?? '')).getTime(); return Number.isFinite(t) ? t : 0; };
  const dieseWoche = leadsRoh.filter((l) => { const t = zeit(l.created_at); return t > jetzt - woche && t <= jetzt; }).length;
  const vorWoche = leadsRoh.filter((l) => { const t = zeit(l.created_at); return t > jetzt - 2 * woche && t <= jetzt - woche; }).length;
  const jeQuelle: Record<string, number> = {};
  for (const l of leadsRoh) {
    const q = (typeof l.quelle === 'string' && l.quelle.trim()) ? l.quelle.trim() : 'Direkt/Unbekannt';
    jeQuelle[q] = (jeQuelle[q] || 0) + 1;
  }

  // Landingpage-A/B: den klarsten Sieger finden (defensiv, Service-Role).
  let lp: LageInput['lp'] = null;
  try {
    const admin = createAdminClient();
    const { data: lpData } = await admin.from('landingpages').select('id, titel, ab_aktiv').eq('owner_user_id', user.id);
    const abPages = ((lpData ?? []) as Array<{ id: string; titel: string; ab_aktiv: boolean | null }>).filter((p) => p.ab_aktiv);
    if (abPages.length) {
      const ids = abPages.map((p) => p.id);
      const { data: evData } = await admin.from('lp_ereignisse').select('landingpage_id, typ, variante').in('landingpage_id', ids);
      const ev = (evData ?? []) as Array<{ landingpage_id: string | null; typ: string | null; variante: string | null }>;
      let best: LageInput['lp'] = null;
      let bestVor = 0;
      for (const p of abPages) {
        const v = funnelJeVariante(ev.filter((e) => e.landingpage_id === p.id));
        const s = abSieger(v.A, v.B);
        if (s.reif && (s.sieger === 'A' || s.sieger === 'B')) {
          const hoch = Math.max(s.quoteA, s.quoteB);
          const tief = Math.min(s.quoteA, s.quoteB);
          const vor = tief > 0 ? Math.round(((hoch - tief) / tief) * 100) : (hoch > 0 ? 100 : 0);
          if (vor > bestVor) { bestVor = vor; best = { titel: p.titel, besser: s.sieger, vorsprungProzent: vor }; }
        }
      }
      lp = best;
    }
  } catch { /* Landingpages optional */ }

  // Website-Kanäle (Besucher, 30 Tage) — defensiv über Service-Role-RPC.
  let web: LageInput['web'] = null;
  try {
    const admin = createAdminClient();
    let seite: string | null = null;
    if (process.env.ANALYSE_BETREIBER_ID && user.id === process.env.ANALYSE_BETREIBER_ID) {
      seite = 'argonaut-os';
    } else {
      const { data } = await admin.from('web_seiten').select('oeffentlich_id, status').eq('owner_user_id', user.id).eq('status', 'live').limit(1);
      const r = ((data ?? []) as Array<{ oeffentlich_id?: string }>)[0];
      seite = r?.oeffentlich_id ?? null;
    }
    if (seite) {
      const seit = new Date(jetzt - 30 * 86400000).toISOString();
      const { data: kn } = await admin.rpc('web_nach_kanal', { seit, p_seite: seite });
      const besucherJeKanal = ((kn ?? []) as Array<Record<string, unknown>>)
        .map((r) => ({ kanal: String(r.kanal ?? 'direkt'), besucher: Number(r.besucher ?? r.aufrufe ?? 0) }))
        .filter((x) => x.besucher > 0);
      if (besucherJeKanal.length) web = { besucherJeKanal };
    }
  } catch { /* Website-Analyse optional */ }

  const input: LageInput = {
    ads: cockpit.ads,
    leads: {
      gesamt: cockpit.leads.gesamt, neu: cockpit.leads.neu, ausKampagne: cockpit.leads.ausKampagne,
      dieseWoche, vorWoche, jeQuelle,
    },
    kanaele: {
      newsletterAbos: cockpit.newsletter.abonnenten,
      socialAktiv: cockpit.social.gesendet > 0 || cockpit.social.kanaele_verbunden > 0,
      whatsappKontakte: cockpit.whatsapp.kontakte,
      adsAktiv: cockpit.ads.aktiv > 0 || cockpit.ads.kampagnen > 0,
    },
    lp, web,
  };

  const befunde = lagebericht(input);
  const ampel = lageAmpel(befunde);

  // KI-Klartext (best effort — erfindet keine Zahlen, nur die Befunde).
  let klartext = '';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && befunde.length) {
    try {
      const sys = `Du bist ein nüchterner, ermutigender Marketing-Berater für einen deutschen Mittelstandsbetrieb. Fasse die übergebenen Befunde in 3–5 Sätzen Klartext zusammen: was läuft gut, was ist am dringendsten, was als Nächstes tun. Sie-Ansprache, konkret, ohne Floskeln. ERFINDE KEINE Zahlen — nutze nur die in den Befunden genannten. Kein Markdown, keine Aufzählung, nur Fließtext.`;
      const nutzer = 'Befunde:\n' + befunde.map((x) => `- [${x.schwere}] ${x.titel}: ${x.text}`).join('\n');
      const kiRes = await kiFetch('marketing-lagebericht', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 400, system: sys, messages: [{ role: 'user', content: [{ type: 'text', text: nutzer }] }] }),
      });
      if (kiRes.ok) {
        const d = await kiRes.json();
        const blocks: Array<{ type?: string; text?: string }> = Array.isArray(d.content) ? d.content : [];
        klartext = blocks.filter((x) => x.type === 'text').map((x) => x.text || '').join('').trim();
      }
    } catch { /* KI optional — Befunde stehen auch ohne Klartext */ }
  }

  return NextResponse.json({
    ok: true,
    ampel,
    kpis: {
      leadsGesamt: cockpit.leads.gesamt, leadsNeu: cockpit.leads.neu, leadsDieseWoche: dieseWoche,
      adsAusgaben: cockpit.ads.ausgaben, adsUmsatz: cockpit.ads.umsatz, adsRoas: cockpit.ads.roas,
      aktiveKanaele: cockpit.gesamt.aktive_kanaele,
    },
    kanaeleLeads: Object.entries(jeQuelle).map(([quelle, anzahl]) => ({ quelle, anzahl })).sort((a, b) => b.anzahl - a.anzahl),
    befunde, klartext,
  });
}
