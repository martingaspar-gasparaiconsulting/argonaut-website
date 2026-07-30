import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { sendeMail, mailLayout } from '@/lib/mail';
import { abmeldeUrl, newsletterBodyHtml } from '@/lib/newsletter';

// ============================================================================
// ARGONAUT OS · app/api/newsletter-versand/route.ts  (Punkt 29b)
//
// POST { betreff, inhalt } — verschickt den Newsletter an alle AKTIVEN
// Abonnenten des Kontos (RLS liefert automatisch die eigene Liste bzw. die
// des Chefs). Jede Mail bekommt einen persönlichen Abmelde-Link (§7 UWG).
// Der Versand wird in newsletter_versand protokolliert (Owner via Trigger).
//
// Demo-Konten dürfen NICHT verschicken (Spam-/Kostenschutz).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sicherheits-Deckel v1: sehr große Listen erst per Stapel/Warteschlange
// (späterer Ausbau). Bis dahin harte Obergrenze pro Versand.
const MAX_EMPFAENGER = 500;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'nicht angemeldet' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const betreff = (body?.betreff || '').toString().trim();
    const inhalt = (body?.inhalt || '').toString().trim();
    if (!betreff || !inhalt) {
      return NextResponse.json({ ok: false, error: 'Bitte Betreff und Inhalt ausfüllen.' }, { status: 400 });
    }

    // Demo-Konto: kein echter Versand.
    const { data: profil } = await supabase.from('profiles').select('demo').eq('id', user.id).maybeSingle();
    if ((profil as { demo?: boolean } | null)?.demo) {
      return NextResponse.json(
        { ok: false, error: 'Im Demo-Modus ist der echte Newsletter-Versand deaktiviert.' },
        { status: 403 },
      );
    }

    // Aktive Abonnenten laden.
    const { data: abos, error: ladeFehler } = await supabase
      .from('newsletter_abonnenten')
      .select('email, abmelde_token')
      .eq('status', 'aktiv');
    if (ladeFehler) return NextResponse.json({ ok: false, error: ladeFehler.message }, { status: 500 });

    const empfaenger = (abos ?? []).filter((a) => a.email);
    if (empfaenger.length === 0) {
      return NextResponse.json({ ok: false, error: 'Es gibt keine aktiven Abonnenten.' }, { status: 400 });
    }
    if (empfaenger.length > MAX_EMPFAENGER) {
      return NextResponse.json(
        { ok: false, error: `Zu viele Empfänger auf einmal (max. ${MAX_EMPFAENGER}). Stapel-Versand folgt später.` },
        { status: 400 },
      );
    }

    const origin = new URL(req.url).origin;

    let erfolg = 0;
    let fehler = 0;
    for (const a of empfaenger) {
      const html = mailLayout(betreff, newsletterBodyHtml(inhalt, abmeldeUrl(origin, a.abmelde_token)));
      const r = await sendeMail({ an: a.email as string, betreff, html });
      if (r.ok) erfolg++;
      else fehler++;
    }

    // Protokoll schreiben (owner_user_id setzt der Trigger).
    await supabase.from('newsletter_versand').insert({
      betreff,
      inhalt,
      empfaenger_anzahl: empfaenger.length,
      erfolg_anzahl: erfolg,
      fehler_anzahl: fehler,
    });

    return NextResponse.json({ ok: true, gesendet: erfolg, fehler, gesamt: empfaenger.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Versand fehlgeschlagen.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
