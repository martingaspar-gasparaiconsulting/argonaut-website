// ============================================================================
// ARGONAUT OS · /api/oeffentlich/widerruf  (Webshop · elektronischer Widerruf)
// ÖFFENTLICH (login-frei). Nimmt einen elektronischen Widerruf von der Shop-Seite
// entgegen (B2C-Pflicht ab 19.06.2026, „Widerrufsbutton"). Inhaber sicher über
// oeffentlich_id aus web_seiten (status=live). Es wird KEINE Bestellung storniert
// — der Betrieb erhält den Widerruf per Mail und bestätigt/erledigt ihn. Der
// Verbraucher bekommt sofort eine Empfangsbestätigung (gesetzlich vorgesehen).
// Kein SQL. Muster wie web-anfrage (Service-Role, owner nie vom Client).
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, mailLayout } from '@/lib/mail';
import { escapeHtml } from '@/lib/newsletter';

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
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    const b = body as Record<string, unknown>;

    if (typeof b.firma_hp === 'string' && b.firma_hp.trim() !== '') return NextResponse.json({ ok: true });

    const seite = clean(b.seite, 100);
    const name = clean(b.name, 200);
    const anschrift = clean(b.anschrift, 400);
    const email = clean(b.email, 200);
    const bestellung = clean(b.bestellung, 120);
    const datum = clean(b.datum, 60);
    const ware = clean(b.ware, 2000);

    if (!seite) return NextResponse.json({ error: 'Seite nicht erkannt.' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'Bitte Ihren Namen angeben.' }, { status: 400 });
    if (!email) return NextResponse.json({ error: 'Bitte Ihre E-Mail-Adresse angeben.' }, { status: 400 });
    if (!ware) return NextResponse.json({ error: 'Bitte angeben, welche Bestellung / Ware Sie widerrufen.' }, { status: 400 });
    if (b.privacy !== true) return NextResponse.json({ error: 'Bitte der Datenschutzerklärung zustimmen.' }, { status: 400 });

    const db = admin();
    const { data: s } = await db.from('web_seiten').select('owner_user_id, status').eq('oeffentlich_id', seite).maybeSingle();
    const inh = s as { owner_user_id?: string; status?: string } | null;
    if (!inh || inh.status !== 'live' || !inh.owner_user_id) {
      return NextResponse.json({ error: 'Diese Seite nimmt gerade keine Widerrufe an.' }, { status: 404 });
    }
    const ownerId = inh.owner_user_id;

    const { data: ciRow } = await db.from('web_ci').select('firma, email').eq('owner_user_id', ownerId).maybeSingle();
    const ci = ciRow as { firma?: string; email?: string } | null;
    const firma = (ci?.firma || '').toString().trim();
    const betriebMail = (ci?.email || '').toString().trim();

    const zeilen: Array<[string, string | null]> = [
      ['Name', name],
      ['Anschrift', anschrift],
      ['E-Mail', email],
      ['Bestell-/Rechnungsnummer', bestellung],
      ['Bestellt/erhalten am', datum],
      ['Widerrufen wird', ware],
    ];
    const tab = zeilen.filter(([, v]) => v)
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7688;vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#1a2332;font-weight:600;">${escapeHtml(String(v)).replace(/\n/g, '<br>')}</td></tr>`)
      .join('');

    // 1) Widerruf an den Betrieb (Pflicht: der Unternehmer muss ihn erhalten).
    if (betriebMail) {
      const html = mailLayout(
        'Elektronischer Widerruf eingegangen',
        `<p style="margin:0 0 14px;">Über den Widerrufsbutton Ihrer Shop-Seite ist ein Widerruf eingegangen. Bitte bestätigen und bearbeiten Sie ihn fristgerecht.</p>
         <table style="border-collapse:collapse;font-size:14px;">${tab}</table>
         <p style="margin:16px 0 0;color:#6b7688;font-size:13px;">Auf diese E-Mail antworten geht direkt an den Verbraucher.</p>`,
      );
      const r = await sendeMail({ an: betriebMail, betreff: `Widerruf: ${name}`, html, ...(email ? { antwortAn: email } : {}) });
      if (!r.ok) console.error('widerruf Betriebs-Mail:', r.fehler);
    }

    // 2) Empfangsbestätigung an den Verbraucher (gesetzlich vorgesehen).
    const vorname = name.split(' ')[0];
    const htmlK = mailLayout(
      'Eingang Ihres Widerrufs bestätigt',
      `<p style="margin:0 0 14px;">Guten Tag${vorname ? ' ' + escapeHtml(vorname) : ''},</p>
       <p style="margin:0 0 14px;">wir bestätigen den Eingang Ihres Widerrufs${firma ? ' bei ' + escapeHtml(firma) : ''}. Ihr Anliegen wird bearbeitet; die Rückabwicklung erfolgt gemäß den gesetzlichen Fristen.</p>
       <table style="border-collapse:collapse;font-size:14px;margin:0 0 12px;">${tab}</table>
       <p style="margin:8px 0 0;">Beste Grüße${firma ? '<br>' + escapeHtml(firma) : ''}</p>`,
    );
    try {
      const r = await sendeMail({ an: email, betreff: `Eingangsbestätigung Ihres Widerrufs${firma ? ' bei ' + firma : ''}`, html: htmlK });
      if (!r.ok) console.error('widerruf Käufer-Mail:', r.fehler);
    } catch (e) { console.error('widerruf Käufer-Mail-Versand:', e); }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('widerruf Fehler:', err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
