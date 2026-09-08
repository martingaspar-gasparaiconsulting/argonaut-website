import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { seitenUrl, STATUS_ABGEMELDET } from '@/lib/freebie';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/freebie-abmelden   (D3)
//
// ÖFFENTLICH. GET ?token=... — ein Klick, fertig. Keine Rückfrage, kein
// Anmeldeformular, kein „Sind Sie sicher?". Eine Abmeldung, die noch einen
// zweiten Schritt verlangt, ist keine Abmeldung mit einem Klick — und genau
// das schuldet man dem Empfaenger.
//
// Die Zeile wird NICHT geloescht: Sie ist der Nachweis, dass abgemeldet
// wurde, und sie verhindert, dass eine neue Eintragung denselben Menschen
// wieder in die Strecke holt.
//
// ▄▄▄ SERVICE-ROLLE ▄▄▄ Umgeht RLS — der Klickende ist nicht eingeloggt.
// Es wird ausschliesslich die eine Zeile zu genau diesem Token angefasst.
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

function ursprung(req: Request): string {
  const gesetzt = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (gesetzt) return gesetzt.replace(/\/+$/, '');
  try { return new URL(req.url).origin; } catch { return ''; }
}

export async function GET(req: Request) {
  const basis = ursprung(req);
  const token = (new URL(req.url).searchParams.get('token') || '').trim();
  if (!token) return NextResponse.redirect(`${basis}/?fehler=1`);

  try {
    const db = admin();
    const { data } = await db
      .from('freebie_lead')
      .select('id, freebie_id, status')
      .eq('abmelde_token', token)
      .maybeSingle();
    const l = (data as { id: string; freebie_id: string; status: string } | null) ?? null;

    // Unbekanntes Token: trotzdem freundlich bestaetigen. Wer abmelden will,
    // soll nie eine Fehlermeldung sehen und es nochmal versuchen muessen.
    if (!l) return NextResponse.redirect(`${basis}/?abgemeldet=1`);

    let key: string | null = null;
    const { data: f } = await db.from('freebie').select('oeffentlich_key').eq('id', l.freebie_id).maybeSingle();
    if (f) key = String((f as { oeffentlich_key: string }).oeffentlich_key);

    if (l.status !== STATUS_ABGEMELDET) {
      await db.from('freebie_lead').update({
        status: STATUS_ABGEMELDET,
        abgemeldet_am: new Date().toISOString(),
        // Termin loeschen: Selbst wenn irgendwo eine Pruefung vergessen
        // wuerde, hat der Cron nichts mehr, woran er anknuepfen koennte.
        faellig_am: null,
      }).eq('id', l.id);
    }

    return NextResponse.redirect(key ? `${seitenUrl(basis, key)}?abgemeldet=1` : `${basis}/?abgemeldet=1`);
  } catch (e: unknown) {
    console.error('freebie-abmelden fehlgeschlagen:', e instanceof Error ? e.message : e);
    // Auch im Fehlerfall NICHT „hat nicht geklappt" anzeigen — der Mensch
    // kann nichts dafuer. Der Fehler steht im Protokoll.
    return NextResponse.redirect(`${basis}/?abgemeldet=1`);
  }
}
