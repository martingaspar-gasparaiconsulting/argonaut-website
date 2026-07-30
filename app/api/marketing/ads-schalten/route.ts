import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele, encKeyBereit } from '@/lib/crypto';
import { schalteMetaKampagne, setzeMetaStatus, metaSchaltProbleme } from '@/lib/adsVersand';
import { sichereMedienUrl } from '@/lib/landingpages';

// ============================================================================
// ARGONAUT OS · app/api/marketing/ads-schalten/route.ts  (Ads P3)
//
// POST { kampagne_id, aktion } — Meta-Kampagne schalten & steuern.
//   aktion 'schalten'   -> legt die Kampagne bei Meta an (IMMER pausiert)
//   aktion 'aktivieren' -> setzt die bestehende Meta-Kampagne auf ACTIVE
//   aktion 'pausieren'  -> PAUSED
//   aktion 'beenden'    -> ARCHIVED
//
// SICHERHEIT: Anlegen erfolgt immer pausiert; echtes Ausspielen erst nach
// bewusstem 'aktivieren'. Demo-Konten schalten NICHT. Token wird serverseitig
// entschluesselt und verlaesst den Server nie. Facebook-Seite wird aus der
// verbundenen Social-Facebook-Verbindung (social_zugang) gezogen.
// Weitere Anbieter (Google/LinkedIn/TikTok) folgen als eigenes Paket.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

type KampagneRow = {
  id: string; name: string; ziel: string | null; kanaele: string[] | null;
  tagesbudget: number | null; start_datum: string | null; end_datum: string | null;
  ueberschrift: string | null; text: string | null; ziel_url: string | null; medien_urls: string[] | null;
};

/** Meta-Zugang (entschluesselt) des Betriebs, oder null. */
async function metaZugang(admin: ReturnType<typeof createAdminClient>, uid: string): Promise<{ kontoId: string; token: string } | null> {
  const { data } = await admin
    .from('ads_zugang')
    .select('konto_id, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid)
    .eq('plattform', 'meta')
    .maybeSingle();
  const r = data as { konto_id: string | null; token_verschluesselt: string | null; verbunden: boolean | null } | null;
  if (!r || r.verbunden !== true || !r.konto_id || !r.token_verschluesselt) return null;
  try {
    const token = entschluessele(r.token_verschluesselt);
    return token ? { kontoId: r.konto_id, token } : null;
  } catch { return null; }
}

/** Facebook-Seiten-ID aus der verbundenen Social-Facebook-Verbindung. */
async function facebookSeitenId(admin: ReturnType<typeof createAdminClient>, uid: string): Promise<string> {
  const { data } = await admin
    .from('social_zugang')
    .select('ziel_id, verbunden')
    .eq('owner_user_id', uid)
    .eq('plattform', 'facebook')
    .maybeSingle();
  const r = data as { ziel_id: string | null; verbunden: boolean | null } | null;
  return (r?.verbunden === true && r.ziel_id) ? r.ziel_id : '';
}

async function neuesterSchaltCampaignId(admin: ReturnType<typeof createAdminClient>, uid: string, kampagneId: string): Promise<string> {
  const { data } = await admin
    .from('ads_schaltung')
    .select('extern_campaign_id, geschaltet_am')
    .eq('owner_user_id', uid)
    .eq('kampagne_id', kampagneId)
    .eq('plattform', 'meta')
    .order('geschaltet_am', { ascending: false })
    .limit(1);
  const r = (data ?? [])[0] as { extern_campaign_id: string | null } | undefined;
  return r?.extern_campaign_id || '';
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
  if ((prof as { demo?: boolean | null } | null)?.demo) {
    return NextResponse.json({ ok: false, error: 'Im Demo-Konto ist das Schalten deaktiviert.' }, { status: 400 });
  }
  if (!encKeyBereit()) return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt.' }, { status: 400 });

  const zugang = await metaZugang(admin, uid);
  if (!zugang) return NextResponse.json({ ok: false, error: 'Kein verbundenes Meta-Werbekonto. Bitte oben das Werbekonto verbinden.' }, { status: 400 });

  // ---- Status-Aktionen an bestehender Kampagne ----
  if (aktion === 'aktivieren' || aktion === 'pausieren' || aktion === 'beenden') {
    const intern = aktion === 'aktivieren' ? 'aktiv' : aktion === 'pausieren' ? 'pausiert' : 'beendet';
    const campaignId = await neuesterSchaltCampaignId(admin, uid, kampagneId);
    if (!campaignId) return NextResponse.json({ ok: false, error: 'Diese Kampagne wurde bei Meta noch nicht angelegt.' }, { status: 400 });

    const res = await setzeMetaStatus(campaignId, intern, zugang.token);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.fehler || 'Statusänderung fehlgeschlagen.' }, { status: 502 });

    await admin.from('ads_kampagne').update({ status: intern }).eq('id', kampagneId).eq('owner_user_id', uid);
    await admin.from('ads_schaltung').update({ status: intern }).eq('owner_user_id', uid).eq('kampagne_id', kampagneId).eq('plattform', 'meta').eq('extern_campaign_id', campaignId);
    return NextResponse.json({ ok: true, status: intern });
  }

  // ---- Neu anlegen (immer pausiert) ----
  const { data: kd } = await admin
    .from('ads_kampagne')
    .select('id, name, ziel, kanaele, tagesbudget, start_datum, end_datum, ueberschrift, text, ziel_url, medien_urls')
    .eq('id', kampagneId)
    .eq('owner_user_id', uid)
    .maybeSingle();
  const k = kd as KampagneRow | null;
  if (!k) return NextResponse.json({ ok: false, error: 'Kampagne nicht gefunden.' }, { status: 404 });

  const pageId = await facebookSeitenId(admin, uid);
  const probleme = metaSchaltProbleme({ kanaele: k.kanaele, ziel_url: k.ziel_url, pageId, tagesbudget: k.tagesbudget });
  if (probleme.length > 0) return NextResponse.json({ ok: false, error: probleme.join(' ') }, { status: 400 });

  const bildUrl = Array.isArray(k.medien_urls) && k.medien_urls[0] ? sichereMedienUrl(k.medien_urls[0]) : '';

  const erg = await schalteMetaKampagne({
    kontoId: zugang.kontoId, token: zugang.token, pageId,
    name: k.name, ziel: k.ziel, tagesbudget: k.tagesbudget,
    startIso: k.start_datum, endIso: k.end_datum,
    message: k.text || '', ueberschrift: k.ueberschrift, zielUrl: (k.ziel_url || '').trim(), bildUrl,
  });

  // Protokoll immer schreiben (auch Teil-Erfolg, damit verwaiste IDs sichtbar sind).
  await admin.from('ads_schaltung').insert({
    owner_user_id: uid, kampagne_id: k.id, plattform: 'meta',
    extern_campaign_id: erg.campaign_id ?? null, extern_adset_id: erg.adset_id ?? null,
    extern_ad_id: erg.ad_id ?? null, extern_creative_id: erg.creative_id ?? null,
    status: erg.ok ? 'pausiert' : 'fehler', fehler_text: erg.ok ? null : (erg.fehler ?? 'Unbekannter Fehler'),
  });

  if (!erg.ok) return NextResponse.json({ ok: false, error: erg.fehler || 'Schalten fehlgeschlagen.' }, { status: 502 });

  // Erfolgreich angelegt -> Kampagne ist bei Meta pausiert.
  await admin.from('ads_kampagne').update({ status: 'pausiert' }).eq('id', k.id).eq('owner_user_id', uid);

  return NextResponse.json({ ok: true, status: 'pausiert', campaign_id: erg.campaign_id });
}
