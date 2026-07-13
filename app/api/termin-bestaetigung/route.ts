// ============================================================
// ARGONAUT OS · app/api/termin-bestaetigung/route.ts
// Verschickt die Terminbestätigung an den Kunden.
// SICHERHEIT: Lädt den Termin serverseitig mit der Session des Nutzers
// (RLS -> nur eigene Termine). Nimmt die E-Mail AUS DER DB, nie vom Browser.
// Setzt bestaetigung_gesendet_am, damit man sieht/steuern kann, was raus ist.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendeMail, mailLayout } from '@/lib/mail';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function POST(req: NextRequest) {
  let terminId: string | null = null;
  try {
    const body = await req.json();
    terminId = typeof body?.terminId === 'string' ? body.terminId : null;
  } catch {
    terminId = null;
  }
  if (!terminId) {
    return NextResponse.json({ ok: false, fehler: 'terminId fehlt.' }, { status: 400 });
  }

  // Supabase-Client mit der Session des angemeldeten Nutzers (Cookies).
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => { /* Route liest nur — kein Session-Refresh nötig */ },
      },
    }
  );

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ ok: false, fehler: 'Nicht angemeldet.' }, { status: 401 });
  }

  // Termin laden — RLS stellt sicher, dass nur eigene Termine sichtbar sind.
  const { data: termin, error } = await supabase
    .from('termine')
    .select('id, titel, beginn_am, ende_am, kunde_name, kunde_email')
    .eq('id', terminId)
    .single();

  if (error || !termin) {
    return NextResponse.json({ ok: false, fehler: 'Termin nicht gefunden.' }, { status: 404 });
  }
  if (!termin.kunde_email) {
    return NextResponse.json({ ok: false, uebersprungen: true, fehler: 'Keine Kunden-E-Mail hinterlegt.' });
  }

  // Mail-Inhalt bauen (deutsche Datums-/Zeitformatierung).
  const beginn = new Date(termin.beginn_am);
  const ende = new Date(termin.ende_am);
  const datumStr = beginn.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const zeitStr = `${beginn.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}–${ende.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
  const anrede = termin.kunde_name ? `Guten Tag ${escapeHtml(termin.kunde_name)},` : 'Guten Tag,';

  const inhalt = `
    <p>${anrede}</p>
    <p>vielen Dank — Ihr Termin ist bestätigt:</p>
    <div style="background:#F4F1E8;border-left:4px solid #C9A84C;border-radius:8px;padding:16px 20px;margin:16px 0;">
      <div style="font-size:16px;font-weight:700;color:#0A1628;">${escapeHtml(termin.titel ?? 'Termin')}</div>
      <div style="margin-top:6px;color:#1a2332;">${datumStr}</div>
      <div style="color:#1a2332;">${zeitStr}</div>
    </div>
    <p>Sollten Sie den Termin nicht wahrnehmen können, antworten Sie einfach auf diese E-Mail.</p>
    <p>Wir freuen uns auf Sie.</p>`;

  const html = mailLayout('Terminbestätigung', inhalt);
  const betreff = `Terminbestätigung: ${termin.titel ?? 'Ihr Termin'} am ${beginn.toLocaleDateString('de-DE')}`;

  const r = await sendeMail({ an: termin.kunde_email, betreff, html });
  if (!r.ok) {
    return NextResponse.json({ ok: false, fehler: r.fehler });
  }

  // Zeitstempel setzen (RLS: eigener Termin -> Update erlaubt).
  await supabase.from('termine').update({ bestaetigung_gesendet_am: new Date().toISOString() }).eq('id', terminId);

  return NextResponse.json({ ok: true, id: r.id });
}
