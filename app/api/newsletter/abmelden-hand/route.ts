import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { modulRechtPruefen } from '@/lib/modulRecht';
import { widerspruchEintragen } from '@/lib/werbeErlaubnisServer';
import { istMail, normMail } from '@/lib/werbeErlaubnis';

// ============================================================================
// ARGONAUT OS · app/api/newsletter/abmelden-hand/route.ts  (Paket 205 · S1)
//
// POST { id } — „Abmelden" im Newsletter-Dashboard.
// Claude-Befund 04.10.2026: Der Knopf setzte nur den Newsletter-Status; die
// Adresse landete NICHT in der Sperrliste. Serien, Rückholung, Abläufe und
// Werbe-Mails aus dem CRM konnten sie danach weiter anschreiben. Jetzt läuft
// der Knopf über widerspruchEintragen — wie Abmeldelink und CRM-Widerspruch:
// eine Abmeldung wirkt in ALLEN Kanälen.
// Modulrecht Marketing „ändern". Schreiben mit dem Server-Schlüssel, hart auf
// den eigenen Betrieb gefiltert.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ABMELDE_QUELLE = 'newsletter_dashboard';

function antwort(ok: boolean, text: string, status = 200, extra: Record<string, unknown> = {}) {
  return NextResponse.json(ok ? { ok: true, hinweis: text, ...extra } : { ok: false, error: text, ...extra }, { status });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const recht = await modulRechtPruefen(supabase, user?.id ?? null, 'marketing', 'aendern');
    if (!recht.ok) return antwort(false, recht.fehler, recht.status);
    const betrieb = recht.betrieb;

    const body = await req.json().catch(() => null);
    const id = String(body?.id ?? '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return antwort(false, 'Kein Eintrag angegeben.', 400);

    const db = createAdminClient();
    const { data: roh, error } = await db
      .from('newsletter_abonnenten')
      .select('id, email, status')
      .eq('id', id)
      .eq('owner_user_id', betrieb)
      .maybeSingle();
    if (error) {
      console.error('abmelden-hand lesen:', error.message);
      return antwort(false, 'Eintrag konnte nicht geladen werden.', 500);
    }
    const abo = roh as { id: string; email: string | null; status: string | null } | null;
    if (!abo) return antwort(false, 'Eintrag nicht gefunden.', 404);

    const email = normMail(abo.email);
    let sperrliste = false;
    if (istMail(email)) {
      sperrliste = await widerspruchEintragen(db, betrieb, email, ABMELDE_QUELLE);
    }

    // Den Eintrag selbst immer abmelden (auch bei ungültiger Adresse oder wenn
    // ein Schritt oben scheiterte) — genau dieser, im eigenen Betrieb.
    const { error: upErr } = await db
      .from('newsletter_abonnenten')
      .update({ status: 'abgemeldet', abgemeldet_am: new Date().toISOString() })
      .eq('id', abo.id)
      .eq('owner_user_id', betrieb)
      .neq('status', 'abgemeldet');
    if (upErr) {
      console.error('abmelden-hand Status:', upErr.message);
      return antwort(false, 'Abmelden fehlgeschlagen.', 500);
    }

    return antwort(
      true,
      sperrliste
        ? 'Abgemeldet — die Adresse steht jetzt in der Sperrliste und bekommt aus keinem Kanal mehr Werbung.'
        : 'Abgemeldet. Die Sperrliste konnte nicht beschrieben werden — bitte später erneut versuchen oder im CRM „Widerspruch" setzen.',
      200,
      { sperrliste },
    );
  } catch (e) {
    console.error('abmelden-hand:', e instanceof Error ? e.message : e);
    return antwort(false, 'Interner Fehler.', 500);
  }
}
