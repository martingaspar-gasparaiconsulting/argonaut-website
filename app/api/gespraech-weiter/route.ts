import { NextResponse } from 'next/server';
import { nurAngemeldet } from '@/lib/nurAngemeldet';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendeMail, kundenMailLayout, absenderBranding } from '@/lib/mail';
import { istUebergabeZiel, uebergabePruefen, umsetzungTitel, uebergabeNotiz, willkommensText } from '@/lib/gespraechErgebnis';
import { berlinTag } from '@/lib/showUp';

// ============================================================================
// ARGONAUT OS · /api/gespraech-weiter — Paket VK6 Teil 2 (16.10.2026)
// Aus einem ABGESCHLOSSENEN Gespraech per Klick in die Umsetzung:
//   ziel 'auftrag' → Auftrag „beauftragt" am Kunden (ohne Positionen — Preise und
//                    Steuersatz traegt der Betrieb im Auftrag selbst ein)
//   ziel 'projekt' → Projekt „aktiv" ab heute, Notiz mit vereinbart/angezahlt
//   ziel 'portal'  → Kundenportal-Zugang (vorhandenen nutzen) + Willkommens-Mail
// Alles mit der Anmeldung des Nutzers (RLS = Rechte auf Auftraege/Projekte/Portal).
// Nur das Absender-Branding liest die Dienst-Rolle, fest auf den Betrieb.
// Jedes Ziel genau einmal je Gespraech (Kennung am Gespraech).
// Body: { gespraech_id, ziel } → { ok, id?, link? } | { error }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function POST(req: Request) {
  const absage = await nurAngemeldet();
  if (absage) return absage;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const gid = typeof body.gespraech_id === 'string' ? body.gespraech_id : '';
    const ziel = body.ziel;
    if (!UUID.test(gid) || !istUebergabeZiel(ziel)) return NextResponse.json({ error: 'Ungültige Angabe.' }, { status: 400 });

    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

    const { data: gr } = await sb.from('vk_gespraech')
      .select('id, owner_user_id, lead_id, ergebnis, gespraech_am, vereinbart_cent, anzahlung_cent, auftrag_id, projekt_id, portal_mail_am')
      .eq('id', gid).maybeSingle();
    const g = gr as {
      id: string; owner_user_id: string; lead_id: string; ergebnis: string; gespraech_am: string;
      vereinbart_cent: number | null; anzahlung_cent: number | null; auftrag_id: string | null; projekt_id: string | null; portal_mail_am: string | null;
    } | null;
    if (!g) return NextResponse.json({ error: 'Gespräch nicht gefunden.' }, { status: 404 });
    const sperre = uebergabePruefen(g, ziel);
    if (sperre) return NextResponse.json({ error: sperre }, { status: 409 });

    // Darf diese Person das Gespraech fortschreiben? (Erfasser oder Geschaeftsleitung — RLS p414)
    const { data: darf } = await sb.from('vk_gespraech').update({ aktualisiert_am: new Date().toISOString() }).eq('id', gid).select('id');
    if (!darf || darf.length === 0) return NextResponse.json({ error: 'Nur wer das Gespräch erfasst hat oder die Geschäftsleitung kann übergeben.' }, { status: 403 });

    const { data: l } = await sb.from('leads').select('id, name, email, dienstleistung, kontakt_id').eq('id', g.lead_id).maybeSingle();
    const lead = l as { id: string; name: string | null; email: string | null; dienstleistung: string | null; kontakt_id: string | null } | null;
    if (!lead) return NextResponse.json({ error: 'Lead nicht gefunden.' }, { status: 404 });

    if (ziel === 'auftrag') {
      const { data: a, error } = await sb.from('auftraege')
        .insert({ titel: umsetzungTitel('Auftrag', lead.name, lead.dienstleistung), status: 'beauftragt', kontakt_id: lead.kontakt_id, waehrung: 'EUR', owner_user_id: g.owner_user_id })
        .select('id').single();
      if (error || !a) return NextResponse.json({ error: 'Auftrag anlegen: ' + (error?.message || 'keine Berechtigung') }, { status: 403 });
      const id = (a as { id: string }).id;
      await sb.from('vk_gespraech').update({ auftrag_id: id }).eq('id', gid);
      return NextResponse.json({ ok: true, id, link: `/dashboard/auftraege/${id}` });
    }

    if (ziel === 'projekt') {
      const { data: p, error } = await sb.from('projekte')
        .insert({
          owner_user_id: g.owner_user_id, name: umsetzungTitel('Projekt', lead.name, lead.dienstleistung),
          beschreibung: uebergabeNotiz(g) || null, status: 'aktiv', prioritaet: 'normal', start_datum: berlinTag(new Date()),
        })
        .select('id').single();
      if (error || !p) return NextResponse.json({ error: 'Projekt anlegen: ' + (error?.message || 'keine Berechtigung') }, { status: 403 });
      const id = (p as { id: string }).id;
      await sb.from('vk_gespraech').update({ projekt_id: id }).eq('id', gid);
      return NextResponse.json({ ok: true, id, link: `/dashboard/projekte/${id}` });
    }

    // ziel === 'portal'
    if (!lead.kontakt_id) return NextResponse.json({ error: 'Den Lead bitte zuerst ins CRM übernehmen (Knopf „In CRM übernehmen").' }, { status: 400 });
    const { data: k } = await sb.from('kontakte').select('id, email').eq('id', lead.kontakt_id).maybeSingle();
    const an = String((k as { email: string | null } | null)?.email || lead.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(an)) return NextResponse.json({ error: 'Beim Kunden ist keine gültige E-Mail hinterlegt.' }, { status: 400 });

    let token: string | null = null;
    const { data: z } = await sb.from('portal_zugaenge').select('id, token, aktiv').eq('kontakt_id', lead.kontakt_id).maybeSingle();
    const zug = z as { id: string; token: string; aktiv: boolean } | null;
    if (zug && !zug.aktiv) return NextResponse.json({ error: 'Der Portal-Zugang dieses Kunden ist gesperrt — unter „Kunden-Portal" wieder freigeben.' }, { status: 409 });
    if (zug) token = zug.token;
    else {
      const { data: neu, error } = await sb.from('portal_zugaenge')
        .insert({ kontakt_id: lead.kontakt_id, owner_user_id: g.owner_user_id }).select('token').single();
      if (error || !neu) return NextResponse.json({ error: 'Portal-Zugang anlegen: ' + (error?.message || 'keine Berechtigung (Modul Kunden-Portal)') }, { status: 403 });
      token = (neu as { token: string }).token;
    }

    // Erst markieren, dann senden — so geht die Mail auch bei Doppelklick nur einmal raus.
    const jetzt = new Date().toISOString();
    const { data: beleg } = await sb.from('vk_gespraech').update({ portal_mail_am: jetzt }).eq('id', gid).is('portal_mail_am', null).select('id');
    if (!beleg || beleg.length === 0) return NextResponse.json({ error: 'Die Willkommens-Mail ist schon verschickt.' }, { status: 409 });

    const brand = await absenderBranding(createAdminClient(), g.owner_user_id);
    const link = `${BASIS_URL}/portal/${token}`;
    const txt = willkommensText(brand.firma, true);
    const inhalt = `
      <p>${lead.name ? `Guten Tag ${escapeHtml(lead.name)},` : 'Guten Tag,'}</p>
      ${txt.absaetze.map((a) => `<p>${escapeHtml(a)}</p>`).join('')}
      <p style="margin:20px 0;"><a href="${link}" style="background:${brand.akzent};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;display:inline-block;">Zu Ihrem Kundenportal</a></p>`;
    const r = await sendeMail({
      an, betreff: txt.betreff, html: kundenMailLayout(brand.firma, brand.akzent, 'Willkommen', inhalt),
      absenderName: brand.firma, antwortAn: brand.email, betriebId: brand.betriebId,
    });
    if (!r.ok) {
      await sb.from('vk_gespraech').update({ portal_mail_am: null }).eq('id', gid);
      return NextResponse.json({ error: 'Die Mail konnte nicht verschickt werden: ' + (r.fehler || 'unbekannt') }, { status: 502 });
    }
    return NextResponse.json({ ok: true, link: '/dashboard/portal' });
  } catch {
    return NextResponse.json({ error: 'Übergabe fehlgeschlagen.' }, { status: 500 });
  }
}
