import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele, encKeyBereit } from '@/lib/crypto';
import { schalteMetaKampagne, setzeMetaStatus, metaSchaltProbleme } from '@/lib/adsVersand';
import {
  schalteGoogleKampagne, setzeGoogleStatus,
  schalteLinkedinKampagne, setzeLinkedinStatus,
  schalteTiktokKampagne, setzeTiktokStatus,
} from '@/lib/adsVersandKanaele';
import { istVerbindbar, plattformFuer, VERBINDBARE_ADS } from '@/lib/ads';
import { sichereMedienUrl } from '@/lib/landingpages';

// ============================================================================
// ARGONAUT OS · app/api/marketing/ads-schalten/route.ts  (Ads P3 + Kanäle)
//
// POST { kampagne_id, aktion } — schaltet & steuert auf ALLEN verbundenen
// Werbekanälen der Kampagne (Meta, Google, LinkedIn, TikTok).
//   'schalten'   -> legt die Kampagne je verbundenem Kanal an (IMMER pausiert)
//   'aktivieren' -> alle Schaltungen der Kampagne auf aktiv
//   'pausieren'  -> pausiert · 'beenden' -> beendet/archiviert
//
// SICHERHEIT: Anlegen immer pausiert. Demo-Konten schalten NICHT. Token wird
// serverseitig entschlüsselt. Meta-Motiv braucht die verbundene Facebook-Seite
// (social_zugang). Jede Plattform hat eigene, dokumentierte API-Form.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

type Zugang = { kontoId: string; token: string };
type KampagneRow = {
  id: string; name: string; ziel: string | null; kanaele: string[] | null;
  tagesbudget: number | null; start_datum: string | null; end_datum: string | null;
  ueberschrift: string | null; text: string | null; ziel_url: string | null; medien_urls: string[] | null;
};

/** Alle verbundenen Werbekonto-Zugänge (entschlüsselt) je Plattform. */
async function zugaenge(admin: ReturnType<typeof createAdminClient>, uid: string): Promise<Record<string, Zugang>> {
  const { data } = await admin
    .from('ads_zugang')
    .select('plattform, konto_id, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid)
    .in('plattform', VERBINDBARE_ADS);
  const map: Record<string, Zugang> = {};
  for (const r of (data ?? []) as { plattform: string; konto_id: string | null; token_verschluesselt: string | null; verbunden: boolean | null }[]) {
    if (r.verbunden !== true || !r.konto_id || !r.token_verschluesselt) continue;
    try { const token = entschluessele(r.token_verschluesselt); if (token) map[r.plattform] = { kontoId: r.konto_id, token }; }
    catch { /* defekt -> überspringen */ }
  }
  return map;
}

async function facebookSeitenId(admin: ReturnType<typeof createAdminClient>, uid: string): Promise<string> {
  const { data } = await admin.from('social_zugang').select('ziel_id, verbunden').eq('owner_user_id', uid).eq('plattform', 'facebook').maybeSingle();
  const r = data as { ziel_id: string | null; verbunden: boolean | null } | null;
  return (r?.verbunden === true && r.ziel_id) ? r.ziel_id : '';
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const kampagneId = (body?.kampagne_id || '').toString().trim();
  const aktion = (body?.aktion || 'schalten').toString();
  if (!kampagneId) return NextResponse.json({ ok: false, error: 'Keine Kampagne angegeben.' }, { status: 400 });

  const admin = createAdminClient();

  const { data: prof } = await admin.from('profiles').select('demo').eq('id', uid).maybeSingle();
  if ((prof as { demo?: boolean | null } | null)?.demo) return NextResponse.json({ ok: false, error: 'Im Demo-Konto ist das Schalten deaktiviert.' }, { status: 400 });
  if (!encKeyBereit()) return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt.' }, { status: 400 });

  const zg = await zugaenge(admin, uid);

  // ---- Status-Aktionen auf bestehenden Schaltungen ----
  if (aktion === 'aktivieren' || aktion === 'pausieren' || aktion === 'beenden') {
    const intern = aktion === 'aktivieren' ? 'aktiv' : aktion === 'pausieren' ? 'pausiert' : 'beendet';
    const { data: schaltungen } = await admin
      .from('ads_schaltung')
      .select('id, plattform, extern_campaign_id')
      .eq('owner_user_id', uid).eq('kampagne_id', kampagneId).not('extern_campaign_id', 'is', null);
    const rows = (schaltungen ?? []) as { id: string; plattform: string; extern_campaign_id: string }[];
    if (rows.length === 0) return NextResponse.json({ ok: false, error: 'Diese Kampagne wurde noch bei keinem Werbekanal angelegt.' }, { status: 400 });

    let ok = 0; const fehlerListe: string[] = [];
    for (const r of rows) {
      const z = zg[r.plattform];
      if (!z) { fehlerListe.push(`${plattformFuer(r.plattform)?.name || r.plattform}: nicht verbunden`); continue; }
      let res: { ok: boolean; fehler?: string };
      if (r.plattform === 'meta') res = await setzeMetaStatus(r.extern_campaign_id, intern, z.token);
      else if (r.plattform === 'google') res = await setzeGoogleStatus(z.kontoId, r.extern_campaign_id, intern, z.token);
      else if (r.plattform === 'linkedin') res = await setzeLinkedinStatus(r.extern_campaign_id, intern, z.token);
      else if (r.plattform === 'tiktok') res = await setzeTiktokStatus(z.kontoId, r.extern_campaign_id, intern, z.token);
      else res = { ok: false, fehler: 'Unbekannte Plattform' };
      if (res.ok) { ok++; await admin.from('ads_schaltung').update({ status: intern }).eq('id', r.id); }
      else fehlerListe.push(`${plattformFuer(r.plattform)?.name || r.plattform}: ${res.fehler || 'Fehler'}`);
    }
    if (ok > 0) await admin.from('ads_kampagne').update({ status: intern }).eq('id', kampagneId).eq('owner_user_id', uid);
    return NextResponse.json({ ok: ok > 0, geaendert: ok, fehler: fehlerListe });
  }

  // ---- Neu anlegen (immer pausiert) auf allen verbundenen Kanälen ----
  const { data: kd } = await admin
    .from('ads_kampagne')
    .select('id, name, ziel, kanaele, tagesbudget, start_datum, end_datum, ueberschrift, text, ziel_url, medien_urls')
    .eq('id', kampagneId).eq('owner_user_id', uid).maybeSingle();
  const k = kd as KampagneRow | null;
  if (!k) return NextResponse.json({ ok: false, error: 'Kampagne nicht gefunden.' }, { status: 404 });

  const kanaele = (k.kanaele || []).filter((p) => istVerbindbar(p));
  const verbundene = kanaele.filter((p) => !!zg[p]);
  if (verbundene.length === 0) return NextResponse.json({ ok: false, error: 'Kein verbundener Werbekanal für diese Kampagne. Bitte oben das passende Werbekonto verbinden.' }, { status: 400 });

  const bildUrl = Array.isArray(k.medien_urls) && k.medien_urls[0] ? sichereMedienUrl(k.medien_urls[0]) : '';
  let angelegt = 0; const fehlerListe: string[] = [];

  for (const p of verbundene) {
    const z = zg[p];
    let erg: { ok: boolean; campaign_id?: string; fehler?: string };

    if (p === 'meta') {
      const pageId = await facebookSeitenId(admin, uid);
      const probleme = metaSchaltProbleme({ kanaele: k.kanaele, ziel_url: k.ziel_url, pageId, tagesbudget: k.tagesbudget });
      if (probleme.length > 0) { fehlerListe.push(`Meta: ${probleme.join(' ')}`); continue; }
      erg = await schalteMetaKampagne({
        kontoId: z.kontoId, token: z.token, pageId, name: k.name, ziel: k.ziel, tagesbudget: k.tagesbudget,
        startIso: k.start_datum, endIso: k.end_datum, message: k.text || '', ueberschrift: k.ueberschrift, zielUrl: (k.ziel_url || '').trim(), bildUrl,
      });
    } else if (p === 'google') {
      erg = await schalteGoogleKampagne({ kontoId: z.kontoId, token: z.token, name: k.name, tagesbudget: k.tagesbudget });
    } else if (p === 'linkedin') {
      erg = await schalteLinkedinKampagne({ kontoId: z.kontoId, token: z.token, name: k.name, tagesbudget: k.tagesbudget });
    } else if (p === 'tiktok') {
      erg = await schalteTiktokKampagne({ kontoId: z.kontoId, token: z.token, name: k.name, ziel: k.ziel, tagesbudget: k.tagesbudget });
    } else {
      erg = { ok: false, fehler: 'Unbekannte Plattform' };
    }

    await admin.from('ads_schaltung').insert({
      owner_user_id: uid, kampagne_id: k.id, plattform: p,
      extern_campaign_id: erg.campaign_id ?? null,
      status: erg.ok ? 'pausiert' : 'fehler', fehler_text: erg.ok ? null : (erg.fehler ?? 'Unbekannter Fehler'),
    });
    if (erg.ok) angelegt++;
    else fehlerListe.push(`${plattformFuer(p)?.name || p}: ${erg.fehler || 'Fehler'}`);
  }

  if (angelegt > 0) await admin.from('ads_kampagne').update({ status: 'pausiert' }).eq('id', k.id).eq('owner_user_id', uid);
  return NextResponse.json({ ok: angelegt > 0, angelegt, fehler: fehlerListe });
}
