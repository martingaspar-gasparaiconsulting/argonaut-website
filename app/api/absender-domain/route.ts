import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { nurAngemeldet } from '@/lib/nurAngemeldet';
import { pruefenErlaubt, absenderAdresse, statusText, type AbsenderZeile } from '@/lib/absenderDomain';
import { absenderCacheLeeren, resendDomainPruefen } from '@/lib/absenderDomainServer';

// ============================================================================
// ARGONAUT OS · /api/absender-domain   (Paket 210, 05.10.2026 · B7)
//
// Der Chef sieht in den Einstellungen, von welcher Adresse die Mails seines
// Betriebs an Kunden gehen, und — falls eine eigene Domain eingerichtet
// wird — die DNS-Einträge für seinen Domain-Anbieter bzw. IT-Dienstleister.
//   GET              -> Stand (nur Chef)
//   POST { aktion: 'pruefen' } -> DNS bei Resend prüfen (höchstens 1× je Minute)
// Anlegen, Einschalten und Entfernen macht nur der Betreiber (Command Center).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SPALTEN = 'owner_user_id, domain, lokalteil, resend_id, status, dns, aktiv, geprueft_am, verifiziert_am';

type Zeile = AbsenderZeile & { resend_id?: string | null; dns?: unknown; geprueft_am?: string | null; verifiziert_am?: string | null };

function antwort(ok: boolean, text: string, status = 200, extra: Record<string, unknown> = {}) {
  return NextResponse.json(ok ? { ok: true, hinweis: text, ...extra } : { ok: false, error: text, ...extra }, { status });
}

async function chef(): Promise<string | null | 'mitarbeiter'> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: c } = await supabase.rpc('mein_chef_id');
  if (typeof c === 'string' && c && c !== user.id) return 'mitarbeiter';
  return user.id;
}

function stand(z: Zeile | null) {
  const sichtbar = z && z.status !== 'entfernt' ? z : null;
  return {
    zeile: sichtbar ? {
      domain: sichtbar.domain, lokalteil: sichtbar.lokalteil, status: sichtbar.status, aktiv: sichtbar.aktiv,
      dns: sichtbar.dns ?? [], geprueft_am: sichtbar.geprueft_am ?? null, adresse: absenderAdresse(sichtbar),
    } : null,
    text: statusText(sichtbar),
  };
}

export async function GET() {
  const absage = await nurAngemeldet();
  if (absage) return absage;
  const id = await chef();
  if (!id) return antwort(false, 'Bitte anmelden.', 401);
  if (id === 'mitarbeiter') return antwort(false, 'Nur die Geschäftsleitung sieht die Absender-Einstellung.', 403);
  const { data, error } = await createAdminClient().from('absender_domain').select(SPALTEN).eq('owner_user_id', id).maybeSingle();
  if (error) return antwort(true, '', 200, stand(null));
  return antwort(true, '', 200, stand((data ?? null) as Zeile | null));
}

export async function POST(req: Request) {
  const absage = await nurAngemeldet();
  if (absage) return absage;
  const id = await chef();
  if (!id) return antwort(false, 'Bitte anmelden.', 401);
  if (id === 'mitarbeiter') return antwort(false, 'Nur die Geschäftsleitung.', 403);
  const body = await req.json().catch(() => null) as { aktion?: string } | null;
  if (body?.aktion !== 'pruefen') return antwort(false, 'Unbekannte Aktion.', 400);
  const db = createAdminClient();
  const { data, error } = await db.from('absender_domain').select(SPALTEN).eq('owner_user_id', id).maybeSingle();
  const z = (data ?? null) as Zeile | null;
  if (error || !z || z.status === 'entfernt' || !z.resend_id) return antwort(false, 'Für Ihren Betrieb ist keine eigene Domain eingerichtet.', 404);
  if (!pruefenErlaubt(z.geprueft_am, new Date())) return antwort(false, 'Bitte eine Minute warten, dann erneut prüfen.', 429);
  const jetzt = new Date().toISOString();
  const r = await resendDomainPruefen(z.resend_id, String(z.domain));
  if (!r.ok) {
    await db.from('absender_domain').update({ geprueft_am: jetzt, geaendert_am: jetzt }).eq('owner_user_id', id);
    return antwort(false, 'Die Prüfung ist gerade nicht möglich. Bitte später erneut versuchen.', 502);
  }
  const aktiv = r.status === 'verifiziert' ? !!z.aktiv : false;
  await db.from('absender_domain').update({
    status: r.status, dns: r.dns, aktiv, geprueft_am: jetzt, geaendert_am: jetzt,
    verifiziert_am: r.status === 'verifiziert' ? (z.verifiziert_am || jetzt) : z.verifiziert_am ?? null,
  }).eq('owner_user_id', id);
  absenderCacheLeeren();
  const neu = { ...z, status: r.status, dns: r.dns, aktiv, geprueft_am: jetzt };
  return antwort(true, r.status === 'verifiziert'
    ? (aktiv ? 'Bestätigt und aktiv.' : 'Bestätigt. ARGONAUT schaltet die Adresse für Sie frei.')
    : 'Noch nicht bestätigt — DNS-Einträge brauchen manchmal einige Stunden.', 200, stand(neu));
}
