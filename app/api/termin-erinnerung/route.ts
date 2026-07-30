// ============================================================
// ARGONAUT OS · app/api/termin-erinnerung/route.ts
// Täglicher Cron-Endpunkt: erinnert Kunden an MORGIGE Termine.
// - Geschützt per Geheim-Header (x-cron-secret == TERMIN_CRON_GEHEIM).
// - Läuft mit Service-Role (kein Login) über ALLE Betriebe hinweg.
// - "Morgen" wird in Europe/Berlin bestimmt (Sommer-/Winterzeit-sicher).
// - erinnerung_gesendet_am verhindert Doppel-Versand (idempotent).
// Branding: JEDE Mail im Namen DES jeweiligen BETRIEBS (kundenMailLayout +
// firma_akzentfarbe), pro Termin-Besitzer geladen (gecacht).
// Aufruf: n8n-Cron 1x täglich, POST mit Header x-cron-secret.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, kundenMailLayout, absenderBranding } from '@/lib/mail';

export const runtime = 'nodejs';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Kalendertag in Europe/Berlin als 'YYYY-MM-DD'. */
function berlinDatum(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Belegt/aktiv? (abgesagt/storniert/verschoben zählen nicht). */
function aktiv(status: string | null): boolean {
  const s = (status ?? '').toLowerCase();
  return !(s === 'abgesagt' || s === 'storniert' || s === 'verschoben');
}

type TerminZeile = {
  id: string; owner_user_id: string; titel: string | null; beginn_am: string; ende_am: string;
  kunde_name: string | null; kunde_email: string | null; status: string | null;
};

export async function POST(req: NextRequest) {
  // 1) Autorisierung per Geheim-Header
  const secret = process.env.TERMIN_CRON_GEHEIM;
  const gegeben = req.headers.get('x-cron-secret');
  if (!secret || gegeben !== secret) {
    return NextResponse.json({ ok: false, fehler: 'Nicht autorisiert.' }, { status: 401 });
  }

  // 2) Service-Role-Client (betriebsübergreifend)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );

  const now = new Date();
  const fensterBis = new Date(now.getTime() + 3 * 24 * 3600 * 1000); // grobes Fenster (3 Tage)
  const zielDatum = berlinDatum(new Date(now.getTime() + 24 * 3600 * 1000)); // morgen (Berlin)

  // 3) Kandidaten laden: künftig, noch nicht erinnert, mit E-Mail
  const { data, error } = await supabase
    .from('termine')
    .select('id, owner_user_id, titel, beginn_am, ende_am, kunde_name, kunde_email, status')
    .gte('beginn_am', now.toISOString())
    .lte('beginn_am', fensterBis.toISOString())
    .is('erinnerung_gesendet_am', null)
    .not('kunde_email', 'is', null);

  if (error) {
    return NextResponse.json({ ok: false, fehler: error.message }, { status: 500 });
  }

  // 4) Exakt auf "morgen" (Berlin) + aktiv filtern
  const faellig = ((data as TerminZeile[]) ?? []).filter(
    (t) => aktiv(t.status) && !!t.kunde_email && berlinDatum(new Date(t.beginn_am)) === zielDatum
  );

  // Branding je Betrieb cachen (mehrere Termine pro Betrieb -> nur einmal laden).
  const brandCache = new Map<string, { firma: string; akzent: string; email: string | undefined }>();
  async function ownerBrand(ownerId: string) {
    const treffer = brandCache.get(ownerId);
    if (treffer) return treffer;
    const b = await absenderBranding(supabase, ownerId);
    brandCache.set(ownerId, b);
    return b;
  }

  let gesendet = 0;
  const fehlerListe: string[] = [];

  for (const t of faellig) {
    const beginn = new Date(t.beginn_am);
    const ende = new Date(t.ende_am);
    const datumStr = beginn.toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin',
    });
    const zeitStr =
      `${beginn.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}` +
      `–${ende.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr`;
    const anrede = t.kunde_name ? `Guten Tag ${escapeHtml(t.kunde_name)},` : 'Guten Tag,';

    const brand = await ownerBrand(t.owner_user_id);

    const inhalt = `
      <p>${anrede}</p>
      <p>eine kurze Erinnerung — Ihr Termin findet <b>morgen</b> statt:</p>
      <div style="background:#f7f8fa;border-left:4px solid ${brand.akzent};border-radius:8px;padding:16px 20px;margin:16px 0;">
        <div style="font-size:16px;font-weight:700;color:#0A1628;">${escapeHtml(t.titel ?? 'Termin')}</div>
        <div style="margin-top:6px;color:#1a2332;">${datumStr}</div>
        <div style="color:#1a2332;">${zeitStr}</div>
      </div>
      <p>Sollten Sie den Termin nicht wahrnehmen können, antworten Sie einfach auf diese E-Mail.</p>
      <p>Wir freuen uns auf Sie.</p>`;

    const html = kundenMailLayout(brand.firma, brand.akzent, 'Terminerinnerung', inhalt);
    const betreff = `Erinnerung: ${t.titel ?? 'Ihr Termin'} morgen um ${beginn.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr`;

    const r = await sendeMail({ an: t.kunde_email as string, betreff, html, absenderName: brand.firma, antwortAn: brand.email });
    if (r.ok) {
      await supabase.from('termine').update({ erinnerung_gesendet_am: new Date().toISOString() }).eq('id', t.id);
      gesendet++;
    } else {
      fehlerListe.push(`${t.id}: ${r.fehler}`);
    }
  }

  return NextResponse.json({
    ok: true,
    zielDatum,
    gefunden: faellig.length,
    gesendet,
    fehler: fehlerListe,
  });
}
