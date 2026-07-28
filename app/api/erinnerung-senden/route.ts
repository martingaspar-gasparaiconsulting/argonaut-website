import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { sendeMail, mailLayout } from "@/lib/mail";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · B-III · "Erinnerung senden" (Mini-Paket 3)
// Verschickt eine Erinnerung mit Kanal = E-Mail über lib/mail (Resend).
// Baut aus Titel/Termin/Notiz eine markenkonforme Mail (mailLayout) und
// setzt die Erinnerung danach auf erledigt + gesendet_am. sendeMail wirft
// nie — Fehler werden sauber zurückgegeben (Erinnerung bleibt offen).
// Voraussetzung: RESEND_API_KEY in Vercel gesetzt (Mail-Infra steht laut Setup).
// ============================================================

function fmt(iso: string | null): string {
  if (!iso) return '';
  const s = String(iso);
  const d = s.slice(0, 10).split('-');
  const t = s.length >= 16 ? s.slice(11, 16) : '';
  return d.length === 3 ? `${d[2]}.${d[1]}.${d[0]}${t ? ` ${t} Uhr` : ''}` : s;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body?.erinnerungId || '').trim();
    if (!id) return NextResponse.json({ error: 'Keine Erinnerung übergeben.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: e, error } = await supabase.from('erinnerung').select('*').eq('id', id).maybeSingle();
    if (error || !e) return NextResponse.json({ error: 'Erinnerung nicht gefunden.' }, { status: 404 });
    if (e.kanal !== 'email') return NextResponse.json({ error: 'Diese Erinnerung ist nicht auf den Kanal E-Mail gesetzt.' }, { status: 400 });

    const an = String(e.email || '').trim();
    if (!an || !an.includes('@')) return NextResponse.json({ error: 'Keine gültige Empfänger-E-Mail hinterlegt.' }, { status: 400 });

    const name = String(e.kunde_name || '').trim();
    const titel = String(e.titel || 'Erinnerung').trim() || 'Erinnerung';
    const teile: string[] = [];
    teile.push(`<p>Guten Tag${name ? ` ${name}` : ''},</p>`);
    teile.push(`<p>dies ist eine freundliche Erinnerung${e.termin_am ? ` an Ihren Termin am <b>${fmt(e.termin_am)}</b>` : ''}.</p>`);
    if (e.notiz) teile.push(`<p>${String(e.notiz)}</p>`);
    teile.push(`<p>Mit freundlichen Grüßen</p>`);
    const html = mailLayout(titel, teile.join(''));

    const r = await sendeMail({ an, betreff: titel, html });
    if (!r.ok) return NextResponse.json({ error: 'Mailversand fehlgeschlagen: ' + r.fehler }, { status: 502 });

    const jetzt = new Date().toISOString();
    const { error: updErr } = await supabase.from('erinnerung')
      .update({ status: 'erledigt', erledigt_am: jetzt, gesendet_am: jetzt }).eq('id', id);
    if (updErr) console.error('Erinnerung-Status nach Versand fehlgeschlagen:', updErr.message);

    return NextResponse.json({ ok: true, id: r.id });
  } catch (err: unknown) {
    console.error('Erinnerung-senden Fehler:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
