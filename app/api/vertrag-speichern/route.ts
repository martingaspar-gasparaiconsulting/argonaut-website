import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

// ============================================================================
// ARGONAUT OS · Command Center · app/api/vertrag-speichern/route.ts  (Block C3)
// Vertrag anlegen, bearbeiten oder aktiv/inaktiv schalten. NUR Martin
// (Betreiber-Sperre), nur eigene Zeilen. Nicht-destruktiv: statt Löschen wird
// 'aktiv=false' gesetzt (bleibt in der Historie). USt-befreit → netto=brutto
// wird nicht gespeichert (Verträge führen nur 'betrag'); privat → 0 % absetzbar.
//
// POST JSON:
//   • Nur umschalten:  { id, aktiv: boolean }
//   • Anlegen:         { felder: {...} }
//   • Bearbeiten:      { id, felder: {...} }
// Antwort: { ok, vertrag } | { error }
// ============================================================================

export const runtime = 'nodejs';

type Felder = Record<string, unknown>;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const betreiber = process.env.ANALYSE_BETREIBER_ID;
    if (betreiber && user.id !== betreiber) {
      return NextResponse.json({ error: 'Kein Zugriff.' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body?.id === 'string' ? body.id : '';
    const db = createAdminClient();

    // ── Nur aktiv/inaktiv umschalten ────────────────────────────────────────
    if (id && typeof body?.aktiv === 'boolean' && !body?.felder) {
      const { data: neu, error } = await db
        .from('vertraege')
        .update({ aktiv: body.aktiv })
        .eq('id', id)
        .eq('owner_user_id', user.id)
        .select()
        .single();
      if (error) {
        console.error('vertrag-speichern Toggle-Fehler:', error.message);
        return NextResponse.json({ error: 'Konnte nicht umgeschaltet werden.' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, vertrag: neu });
    }

    // ── Anlegen / Bearbeiten ────────────────────────────────────────────────
    const felder: Felder = (body?.felder && typeof body.felder === 'object') ? body.felder as Felder : {};
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

    const art: 'geschaeftlich' | 'privat' = felder.art === 'privat' ? 'privat' : 'geschaeftlich';
    const intervall: 'monat' | 'jahr' = felder.intervall === 'jahr' ? 'jahr' : 'monat';
    let absetzbar = num(felder.absetzbar_prozent);
    absetzbar = absetzbar === null ? (art === 'privat' ? 0 : 100) : Math.max(0, Math.min(100, absetzbar));
    if (art === 'privat') absetzbar = 0;

    const daten = {
      anbieter: str(felder.anbieter),
      bezeichnung: str(felder.bezeichnung),
      kategorie: str(felder.kategorie),
      art,
      betrag: num(felder.betrag),
      intervall,
      absetzbar_prozent: absetzbar,
      start_datum: str(felder.start_datum),
      ende_datum: str(felder.ende_datum),
      notiz: str(felder.notiz),
    };

    if (id) {
      const { data: neu, error } = await db
        .from('vertraege')
        .update(daten)
        .eq('id', id)
        .eq('owner_user_id', user.id)
        .select()
        .single();
      if (error) {
        console.error('vertrag-speichern Update-Fehler:', error.message);
        return NextResponse.json({ error: 'Vertrag konnte nicht gespeichert werden.' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, vertrag: neu });
    }

    const { data: neu, error } = await db
      .from('vertraege')
      .insert({ ...daten, owner_user_id: user.id, aktiv: true })
      .select()
      .single();
    if (error) {
      console.error('vertrag-speichern Insert-Fehler:', error.message);
      return NextResponse.json({ error: 'Vertrag konnte nicht angelegt werden.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, vertrag: neu });
  } catch (e: unknown) {
    console.error('vertrag-speichern interner Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
