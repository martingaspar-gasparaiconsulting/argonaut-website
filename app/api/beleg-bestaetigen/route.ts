import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

// ============================================================================
// ARGONAUT OS · Command Center · app/api/beleg-bestaetigen/route.ts  (Block B3c)
// Einen Beleg bestätigen und/oder korrigieren. NUR Martin (Betreiber-Sperre),
// und nur eigene Zeilen (owner_user_id). Lädt die aktuelle Zeile, mischt die
// übergebenen Felder dazu, wendet dieselben Steuer-Guards an wie beim Upload
// (privat → 0 %, GWG ≤ 800 € netto → sofort, sofort → keine AfA-Jahre,
// USt-befreit → netto = brutto) und schreibt zurück. Standard: bestaetigt=true.
//
// POST JSON: { id: string, bestaetigt?: boolean, felder?: {...} }
// Antwort: { ok, beleg } | { error }
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
    if (!id) return NextResponse.json({ error: 'Keine Beleg-ID.' }, { status: 400 });
    const felder: Felder = (body?.felder && typeof body.felder === 'object') ? body.felder as Felder : {};
    const bestaetigen = body?.bestaetigt !== false; // Standard: bestätigen

    const db = createAdminClient();

    // Aktuelle Zeile holen (nur eigene) — dient als Basis fürs Zusammenmischen.
    const { data: alt, error: ladeErr } = await db
      .from('belege')
      .select('*')
      .eq('id', id)
      .eq('owner_user_id', user.id)
      .maybeSingle();
    if (ladeErr) {
      console.error('beleg-bestaetigen Ladefehler:', ladeErr.message);
      return NextResponse.json({ error: 'Beleg konnte nicht geladen werden.' }, { status: 500 });
    }
    if (!alt) return NextResponse.json({ error: 'Beleg nicht gefunden.' }, { status: 404 });

    const row = alt as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    const hat = (k: string) => Object.prototype.hasOwnProperty.call(felder, k);

    // Feld für Feld: übergebenen Wert nehmen, sonst den bestehenden behalten.
    const art: 'geschaeftlich' | 'privat' =
      (hat('art') ? felder.art : row.art) === 'privat' ? 'privat' : 'geschaeftlich';
    const richtung: 'ausgabe' | 'einnahme' =
      (hat('richtung') ? felder.richtung : row.richtung) === 'einnahme' ? 'einnahme' : 'ausgabe';
    const brutto = hat('betrag_brutto') ? num(felder.betrag_brutto) : num(row.betrag_brutto);
    const netto = brutto; // USt-befreit → netto = brutto
    let absetzbar = hat('absetzbar_prozent') ? num(felder.absetzbar_prozent) : num(row.absetzbar_prozent);
    absetzbar = absetzbar === null ? (art === 'privat' ? 0 : 100) : Math.max(0, Math.min(100, absetzbar));
    if (art === 'privat') absetzbar = 0;
    let abschreibung: 'sofort' | 'afa' =
      (hat('abschreibung') ? felder.abschreibung : row.abschreibung) === 'afa' ? 'afa' : 'sofort';
    if (netto !== null && netto <= 800) abschreibung = 'sofort'; // GWG-Grenze
    const afaJahre = abschreibung === 'afa' ? (hat('afa_jahre') ? num(felder.afa_jahre) : num(row.afa_jahre)) : null;

    const update = {
      art,
      richtung,
      datum: hat('datum') ? str(felder.datum) : (row.datum ?? null),
      haendler: hat('haendler') ? str(felder.haendler) : (row.haendler ?? null),
      beschreibung: hat('beschreibung') ? str(felder.beschreibung) : (row.beschreibung ?? null),
      kategorie: hat('kategorie') ? str(felder.kategorie) : (row.kategorie ?? null),
      betrag_brutto: brutto,
      betrag_netto: netto,
      absetzbar_prozent: absetzbar,
      abschreibung,
      afa_jahre: afaJahre,
      bestaetigt: bestaetigen ? true : (row.bestaetigt === true),
    };

    const { data: neu, error: updErr } = await db
      .from('belege')
      .update(update)
      .eq('id', id)
      .eq('owner_user_id', user.id)
      .select()
      .single();
    if (updErr) {
      console.error('beleg-bestaetigen Updatefehler:', updErr.message);
      return NextResponse.json({ error: 'Beleg konnte nicht gespeichert werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, beleg: neu });
  } catch (e: unknown) {
    console.error('beleg-bestaetigen interner Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
