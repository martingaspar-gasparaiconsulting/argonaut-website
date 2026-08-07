import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, mailLayout } from '@/lib/mail';
import { escapeHtml } from '@/lib/newsletter';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/web-anfrage  (Website-Bauer · Anfrage → CRM)
// ÖFFENTLICH. Nimmt eine Anfrage von einer veröffentlichten Kundenseite
// (/p/[id] oder eigene Domain) entgegen, ordnet sie über die oeffentlich_id
// dem Seiten-Inhaber zu und legt einen Lead in dessen CRM an (Tabelle leads,
// gleiches Muster wie /api/leads/manuell). Zusätzlich best effort: interne
// Benachrichtigung an den Betrieb + Bestätigung an den Interessenten.
// Service-Role umgeht RLS; owner_user_id kommt sicher aus web_seiten, NIE vom
// Client. Kein n8n, alles über den eigenen Resend-Versand (lib/mail.ts).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, max);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    // Spam-Falle: ist das versteckte Honeypot-Feld gefüllt, tun wir stumm „ok"
    // und speichern nichts (Bots füllen es aus, echte Besucher sehen es nicht).
    if (typeof b.firma_hp === 'string' && b.firma_hp.trim() !== '') {
      return NextResponse.json({ ok: true });
    }

    const seite = clean(b.seite, 100);
    const name = clean(b.name, 200);
    const email = clean(b.email, 200);
    const telefon = clean(b.telefon, 60);
    const nachricht = clean(b.nachricht, 5000);
    const plz = clean(b.plz, 10);
    const ort = clean(b.ort, 120);

    if (!seite) return NextResponse.json({ error: 'Seite nicht erkannt.' }, { status: 400 });
    if (!name || (!email && !telefon)) {
      return NextResponse.json({ error: 'Bitte Name und E-Mail oder Telefon angeben.' }, { status: 400 });
    }
    if (b.privacy !== true) {
      return NextResponse.json({ error: 'Bitte der Datenschutzerklärung zustimmen.' }, { status: 400 });
    }

    const db = admin();

    // Seiten-Inhaber sicher bestimmen — nur veröffentlichte Seiten nehmen an.
    const { data: seiteRow } = await db
      .from('web_seiten')
      .select('owner_user_id, status')
      .eq('oeffentlich_id', seite)
      .maybeSingle();
    const inhaber = seiteRow as { owner_user_id?: string; status?: string } | null;
    if (!inhaber || inhaber.status !== 'live' || !inhaber.owner_user_id) {
      return NextResponse.json({ error: 'Diese Seite nimmt gerade keine Anfragen an.' }, { status: 404 });
    }
    const ownerId = inhaber.owner_user_id;

    // Lead ins CRM des Inhabers (Tabelle leads, wie /api/leads/manuell).
    const { error: leadErr } = await db.from('leads').insert({
      owner_user_id: ownerId,
      name,
      email,
      telefon,
      nachricht,
      plz,
      ort,
      ist_bestand: false,
      werbung_einwilligung: false,
      status: 'neu',
      quelle: 'Website',
    });
    if (leadErr) {
      console.error('web-anfrage Lead-Insert fehlgeschlagen:', leadErr);
      return NextResponse.json({ error: 'Anfrage konnte nicht gespeichert werden.' }, { status: 500 });
    }

    // Firmenname + Benachrichtigungs-Adresse aus dem CI des Inhabers.
    const { data: ciRow } = await db
      .from('web_ci')
      .select('firma, email')
      .eq('owner_user_id', ownerId)
      .maybeSingle();
    const ci = ciRow as { firma?: string; email?: string } | null;
    const firma = (ci?.firma || '').toString().trim();
    const betriebMail = (ci?.email || '').toString().trim();

    // 1) Benachrichtigung an den Betrieb (best effort — Lead liegt schon sicher).
    if (betriebMail) {
      const zeilen: Array<[string, string | null]> = [
        ['Name', name],
        ['E-Mail', email],
        ['Telefon', telefon],
        ['Nachricht', nachricht],
      ];
      const tab = zeilen
        .filter(([, v]) => v)
        .map(([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#6b7688;vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#1a2332;font-weight:600;">${escapeHtml(String(v)).replace(/\n/g, '<br>')}</td></tr>`)
        .join('');
      const html = mailLayout(
        'Neue Anfrage über Ihre Website',
        `<p style="margin:0 0 14px;">Über Ihre Website ist eine neue Anfrage eingegangen — sie liegt bereits als Lead in Ihrem CRM.</p>
         <table style="border-collapse:collapse;font-size:14px;">${tab}</table>
         <p style="margin:16px 0 0;color:#6b7688;font-size:13px;">Auf diese E-Mail antworten geht direkt an den Interessenten.</p>`,
      );
      const r = await sendeMail({
        an: betriebMail,
        betreff: `Neue Website-Anfrage: ${name}`,
        html,
        ...(email ? { antwortAn: email } : {}),
      });
      if (!r.ok) console.error('web-anfrage Betriebs-Mail fehlgeschlagen:', r.fehler);
    }

    // 2) Bestätigung an den Interessenten (best effort).
    if (email) {
      const vorname = (name || '').split(' ')[0];
      const html = mailLayout(
        'Ihre Anfrage ist eingegangen',
        `<p style="margin:0 0 14px;">Guten Tag${vorname ? ' ' + escapeHtml(vorname) : ''},</p>
         <p style="margin:0 0 14px;">vielen Dank für Ihre Nachricht${firma ? ' an ' + escapeHtml(firma) : ''}. Wir haben Ihre Anfrage erhalten und melden uns zeitnah bei Ihnen.</p>
         <p style="margin:16px 0 0;">Beste Grüße${firma ? '<br>' + escapeHtml(firma) : ''}</p>`,
      );
      try {
        const r = await sendeMail({ an: email, betreff: `Ihre Anfrage${firma ? ' bei ' + firma : ''}`, html });
        if (!r.ok) console.error('web-anfrage Bestätigungsmail fehlgeschlagen:', r.fehler);
      } catch (e) {
        console.error('web-anfrage Bestätigungsmail-Versand fehlgeschlagen:', e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('web-anfrage Fehler:', err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
