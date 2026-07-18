// ============================================================
// ARGONAUT OS · Bündel 5 · app/api/rechnung-senden/route.ts
// Versendet eine bereits erzeugte E-Rechnung (XRechnung-/ZUGFeRD-XML oder
// ZUGFeRD-PDF) per E-Mail an den Kunden. Die ERZEUGUNG passiert unverändert
// über /api/rechnung-e bzw. /api/rechnung-zugferd im Client; diese Route ist
// bewusst ein reiner, sicherer Mail-Versand: Datei anhängen, abschicken.
//
// Body: { an, betreff?, nachricht?, rechnungsnummer?, dateiname, inhaltBase64, typ }
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
    // Nur eingeloggte Nutzer dürfen versenden.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const an = typeof body?.an === 'string' ? body.an.trim() : '';
    const inhaltBase64 = typeof body?.inhaltBase64 === 'string' ? body.inhaltBase64 : '';
    const dateiname = (typeof body?.dateiname === 'string' && body.dateiname.trim()) || 'Rechnung';
    const typ = typeof body?.typ === 'string' ? body.typ : 'application/octet-stream';
    const nummer = typeof body?.rechnungsnummer === 'string' ? body.rechnungsnummer : '';
    const nachricht = typeof body?.nachricht === 'string' ? body.nachricht : '';

    if (!istMail(an)) return NextResponse.json({ error: 'Keine gültige Empfänger-E-Mail.' }, { status: 400 });
    if (!inhaltBase64) return NextResponse.json({ error: 'Keine Datei zum Versenden übergeben.' }, { status: 400 });

    let anhangBuffer: Buffer;
    try {
      anhangBuffer = Buffer.from(inhaltBase64, 'base64');
    } catch {
      return NextResponse.json({ error: 'Anhang konnte nicht gelesen werden.' }, { status: 400 });
    }

    const betreff = (typeof body?.betreff === 'string' && body.betreff.trim())
      || `Ihre Rechnung${nummer ? ' ' + nummer : ''}`;

    const inhalt = `
      <p>Guten Tag,</p>
      <p>anbei erhalten Sie Ihre Rechnung${nummer ? ` <b>${escapeHtml(nummer)}</b>` : ''} als E-Rechnung im Anhang.</p>
      ${nachricht ? `<p>${escapeHtml(nachricht)}</p>` : ''}
      <p>Bei Fragen antworten Sie einfach auf diese E-Mail.</p>
      <p>Vielen Dank.</p>`;
    const html = mailLayout('Ihre Rechnung', inhalt);

    const r = await sendeMail({
      an,
      betreff,
      html,
      anhaenge: [{ dateiname, inhalt: anhangBuffer, typ }],
    });
    if (!r.ok) return NextResponse.json({ error: r.fehler }, { status: 500 });
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e: unknown) {
    console.error('Rechnung-senden Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Unerwarteter Fehler beim Versand.' }, { status: 500 });
  }
}
