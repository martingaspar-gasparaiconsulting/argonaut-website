import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { betreiberPruefung } from '@/lib/betreiberGuard';
import {
  kanalAus, istHelferArt, gueltigBis, sitzungAktiv, grundSaeubern, darfBeitreten, darfBeenden,
  MAX_OFFENE_JE_PERSON, type Sitzung,
} from '@/lib/fernhilfe';

// ============================================================================
// ARGONAUT OS · app/api/fernhilfe/route.ts  (Paket 209 · Stufe 3 B10 Fernhilfe)
//
// GET  ?id=…                               -> Stand der Sitzung (nur Beteiligte)
// POST { aktion:'anfordern', helfer, grund } -> neue Sitzung (30 Min.), liefert
//                                              Kanal + Link für den Helfer
// POST { aktion:'beitreten', id }          -> Helfer: Rechte-Prüfung, dann Kanal
// POST { aktion:'beenden', id }            -> beide Seiten
//
// Die Tabelle fernhilfe_sitzung ist nur für den Server (SQL p209, keine
// Nutzer-Regel). Der Kanal (Geheimnis für den Bild-Austausch) steht NIE im
// Link — der Helfer bekommt ihn erst nach darfBeitreten.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SPALTEN = 'id, owner_user_id, angefordert_von, angefordert_name, helfer_art, status, gueltig_bis, helfer_id, helfer_name, kanal, grund, erstellt_am';

function antwort(ok: boolean, text: string, status = 200, extra: Record<string, unknown> = {}) {
  return NextResponse.json(ok ? { ok: true, hinweis: text, ...extra } : { ok: false, error: text, ...extra }, { status });
}

async function person() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: chef }, { data: ma }, { data: prof }] = await Promise.all([
    supabase.rpc('mein_chef_id'),
    supabase.from('mitarbeiter').select('vorname, nachname').eq('auth_user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ]);
  const maName = [(ma as { vorname?: string } | null)?.vorname, (ma as { nachname?: string } | null)?.nachname].filter(Boolean).join(' ').trim();
  const name = (maName || (prof as { full_name?: string } | null)?.full_name || user.email?.split('@')[0] || 'Nutzer').slice(0, 120);
  const betrieb = typeof chef === 'string' && chef ? chef : user.id;
  return { id: user.id, name, betrieb };
}

async function istBetreiber(): Promise<boolean> {
  try { return (await betreiberPruefung()).absage === null; } catch { return false; }
}

async function lade(db: ReturnType<typeof createAdminClient>, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db.from('fernhilfe_sitzung').select(SPALTEN).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as (Sitzung & { angefordert_name: string; helfer_name: string | null; kanal: string; grund: string | null; erstellt_am: string }) | null;
}

function oeffentlich(s: NonNullable<Awaited<ReturnType<typeof lade>>>) {
  return {
    id: s.id, status: s.status, helfer_art: s.helfer_art, gueltig_bis: s.gueltig_bis,
    angefordert_name: s.angefordert_name, helfer_name: s.helfer_name, grund: s.grund, erstellt_am: s.erstellt_am,
  };
}

export async function GET(req: Request) {
  try {
    const p = await person();
    if (!p) return antwort(false, 'Bitte anmelden.', 401);
    const id = (new URL(req.url).searchParams.get('id') || '').trim();
    const db = createAdminClient();
    const s = await lade(db, id);
    if (!s) return antwort(false, 'Diese Hilfe-Sitzung gibt es nicht.', 404);
    const beteiligt = s.angefordert_von === p.id || s.helfer_id === p.id || darfBeitreten(s, { userId: p.id, istBetreiber: await istBetreiber(), jetzt: new Date() }).ok;
    if (!beteiligt) return antwort(false, 'Kein Zugriff.', 403);
    return antwort(true, '', 200, { sitzung: { ...oeffentlich(s), aktiv: sitzungAktiv(s, new Date()) } });
  } catch (e) {
    console.error('fernhilfe GET:', e instanceof Error ? e.message : e);
    return antwort(false, 'Fernhilfe ist gerade nicht verfügbar.', 503);
  }
}

export async function POST(req: Request) {
  try {
    const p = await person();
    if (!p) return antwort(false, 'Bitte anmelden.', 401);
    const body = await req.json().catch(() => null);
    const aktion = String(body?.aktion ?? '');
    const db = createAdminClient();
    const jetzt = new Date();

    if (aktion === 'anfordern') {
      if (!istHelferArt(body?.helfer)) return antwort(false, 'Bitte wählen, wer helfen soll.', 400);
      // Geschäftsleitung braucht keine Hilfe aus dem eigenen Betrieb von sich selbst.
      if (body.helfer === 'betrieb' && p.betrieb === p.id) return antwort(false, 'Sie sind selbst die Geschäftsleitung — wählen Sie „ARGONAUT-Support".', 400);
      const { count } = await db.from('fernhilfe_sitzung').select('id', { count: 'exact', head: true })
        .eq('angefordert_von', p.id).neq('status', 'beendet').gt('gueltig_bis', jetzt.toISOString());
      if ((count ?? 0) >= MAX_OFFENE_JE_PERSON) return antwort(false, 'Sie haben schon offene Hilfe-Anfragen. Bitte beenden Sie diese zuerst.', 429);
      const kanal = kanalAus(new Uint8Array(randomBytes(24)));
      const { data, error } = await db.from('fernhilfe_sitzung').insert({
        owner_user_id: p.betrieb,
        angefordert_von: p.id,
        angefordert_name: p.name,
        helfer_art: body.helfer,
        status: 'wartet',
        kanal,
        grund: grundSaeubern(body?.grund) || null,
        gueltig_bis: gueltigBis(jetzt),
      }).select('id').single();
      if (error) {
        console.error('fernhilfe anfordern:', error.message);
        return antwort(false, /fernhilfe_sitzung/.test(error.message) ? 'Fernhilfe wird gerade eingerichtet (SQL p209 fehlt).' : 'Hilfe-Anfrage konnte nicht angelegt werden.', 503);
      }
      const id = (data as { id: string }).id;
      return antwort(true, 'Hilfe-Anfrage angelegt.', 200, { id, kanal, pfad: `/dashboard/fernhilfe/${id}` });
    }

    const id = String(body?.id ?? '').trim();
    const s = await lade(db, id);

    if (aktion === 'beitreten') {
      const darf = darfBeitreten(s, { userId: p.id, istBetreiber: await istBetreiber(), jetzt });
      if (!darf.ok) return antwort(false, darf.fehler, darf.status);
      const { error } = await db.from('fernhilfe_sitzung')
        .update({ status: 'verbunden', helfer_id: p.id, helfer_name: p.name })
        .eq('id', s!.id).neq('status', 'beendet');
      if (error) return antwort(false, 'Beitreten fehlgeschlagen.', 500);
      return antwort(true, '', 200, { kanal: s!.kanal, sitzung: oeffentlich({ ...s!, helfer_name: p.name }) });
    }

    if (aktion === 'beenden') {
      if (!darfBeenden(s, p.id, await istBetreiber())) return antwort(false, 'Kein Zugriff.', 403);
      await db.from('fernhilfe_sitzung')
        .update({ status: 'beendet', beendet_am: jetzt.toISOString(), beendet_von: s!.angefordert_von === p.id ? 'teiler' : 'helfer' })
        .eq('id', s!.id).neq('status', 'beendet');
      return antwort(true, 'Fernhilfe beendet.');
    }

    return antwort(false, 'Unbekannte Aktion.', 400);
  } catch (e) {
    console.error('fernhilfe POST:', e instanceof Error ? e.message : e);
    return antwort(false, 'Fernhilfe ist gerade nicht verfügbar.', 503);
  }
}
