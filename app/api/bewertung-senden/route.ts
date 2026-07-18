// ============================================================
// ARGONAUT OS · Bündel 7 · app/api/bewertung-senden/route.ts
// Verschickt die Bewertungs-Einladung per E-Mail an den Kunden.
// Reiner, sicherer Mail-Versand (nur eingeloggte Nutzer). Der Datensatz
// selbst wird im Client über RLS angelegt; hier geht nur die Mail raus.
// Body: { an, kundeName?, betrieb?, link }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { sendeMail, mailLayout } from '@/lib/mail';

export const runtime = 'nodejs';

function escapeHtml(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function istMail(s: unknown): s is string {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const an = typeof body?.an === 'string' ? body.an.trim() : '';
    const kundeName = (typeof body?.kundeName === 'string' ? body.kundeName : '').trim();
    const betrieb = (typeof body?.betrieb === 'string' ? body.betrieb : '').trim() || 'unser Betrieb';
    const link = typeof body?.link === 'string' ? body.link.trim() : '';

    if (!istMail(an)) return NextResponse.json({ error: 'Keine gültige E-Mail.' }, { status: 400 });
    if (!/^https?:\/\//i.test(link)) return NextResponse.json({ error: 'Kein gültiger Bewertungs-Link.' }, { status: 400 });

    const anrede = kundeName ? `Guten Tag ${escapeHtml(kundeName)},` : 'Guten Tag,';
    const inhalt = `
      <p>${anrede}</p>
      <p>vielen Dank für Ihr Vertrauen in <b>${escapeHtml(betrieb)}</b>. Über eine kurze Bewertung
         würden wir uns sehr freuen — sie dauert keine Minute:</p>
      <p style="margin:22px 0;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#C9A84C;color:#0A1628;font-weight:700;
           text-decoration:none;padding:13px 26px;border-radius:8px;">★ Jetzt bewerten</a>
      </p>
      <p style="color:#5b6b7d;font-size:13px;">Falls der Knopf nicht funktioniert: ${escapeHtml(link)}</p>`;
    const html = mailLayout('Ihre Meinung zählt', inhalt);

    const r = await sendeMail({ an, betreff: `Wie war's bei ${betrieb}? Ihre kurze Bewertung`, html });
    if (!r.ok) return NextResponse.json({ error: r.fehler }, { status: 500 });
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e: unknown) {
    console.error('Bewertung-senden Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Versand fehlgeschlagen.' }, { status: 500 });
  }
}
