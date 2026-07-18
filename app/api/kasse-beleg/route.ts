// ============================================================
// ARGONAUT OS · Bündel 16 · app/api/kasse-beleg/route.ts
// Legt einen Kassenbeleg an: signiert über den TSE-Konnektor, schreibt
// Beleg + Positionen und bucht den Bestand aus dem ERP ab (+ lagerbewegung).
//   POST { positionen[], zahlart, gegeben, typ } -> { belegId, belegNr, tse }
//
// Owner-Auflösung: Chef -> eigene id; Kassierer (Mitarbeiter) -> Chef-id.
// Schreiben per Service-Role mit explizitem owner_user_id (RLS-sicher).
// ============================================================

import { createClient as createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { signiereBeleg } from '@/lib/kasse-tse';

export const runtime = 'nodejs';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

type PosIn = { artikel_id?: string | null; bezeichnung?: string; menge?: number; einzelpreis?: number; mwst_satz?: number };
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: Request) {
  try {
    const supabaseAuth = await createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const posIn = (Array.isArray(body?.positionen) ? body.positionen : []) as PosIn[];
    const zahlart = ['bar', 'karte', 'ec', 'ueberweisung'].includes(String(body?.zahlart)) ? String(body.zahlart) : 'bar';
    const typ = body?.typ === 'retoure' ? 'retoure' : 'verkauf';
    const gegeben = body?.gegeben != null ? Number(body.gegeben) : null;
    if (!posIn.length) return NextResponse.json({ error: 'Der Warenkorb ist leer.' }, { status: 400 });

    const db = admin();

    // 1) Owner (Betrieb) auflösen
    let ownerId = user.id;
    const { data: prof } = await db.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (!prof) {
      const { data: ma } = await db.from('mitarbeiter').select('owner_user_id').eq('auth_user_id', user.id).maybeSingle();
      if (ma?.owner_user_id) ownerId = String(ma.owner_user_id);
      else return NextResponse.json({ error: 'Betrieb konnte nicht ermittelt werden.' }, { status: 403 });
    }

    // 2) Positionen normalisieren + Summen (BRUTTO, je Steuersatz)
    const vz = typ === 'retoure' ? -1 : 1;
    const posten = posIn.map((p, i) => {
      const menge = Number(p.menge) || 0;
      const einzel = r2(Number(p.einzelpreis) || 0);
      const satz = Number(p.mwst_satz) || 19;
      const brutto = r2(menge * einzel * vz);
      return {
        owner_user_id: ownerId, position: i + 1,
        artikel_id: p.artikel_id || null,
        bezeichnung: (p.bezeichnung || '').trim() || 'Position',
        menge: menge * vz, einzelpreis: einzel, mwst_satz: satz, gesamt_brutto: brutto,
        _mengeAbs: menge,
      };
    });
    let bruttoSumme = 0; const nettoProSatz: Record<number, number> = {};
    for (const p of posten) {
      bruttoSumme += p.gesamt_brutto;
      const netto = p.gesamt_brutto / (1 + p.mwst_satz / 100);
      nettoProSatz[p.mwst_satz] = (nettoProSatz[p.mwst_satz] || 0) + netto;
    }
    bruttoSumme = r2(bruttoSumme);
    let nettoSumme = 0; for (const s of Object.keys(nettoProSatz)) nettoSumme += nettoProSatz[Number(s)];
    nettoSumme = r2(nettoSumme);
    const mwstSumme = r2(bruttoSumme - nettoSumme);
    const rueckgeld = gegeben != null && zahlart === 'bar' ? r2(gegeben - bruttoSumme) : null;

    // 3) Beleg-Nr (fortlaufend je Jahr/Betrieb)
    const jahr = new Date().getFullYear();
    const { count } = await db.from('kassen_belege').select('id', { count: 'exact', head: true })
      .eq('owner_user_id', ownerId).gte('erstellt_am', `${jahr}-01-01`);
    const belegNr = `B-${jahr}-${String((count || 0) + 1).padStart(4, '0')}`;

    // 4) Signieren (TSE-Konnektor)
    const tse = await signiereBeleg(db, ownerId, belegNr, bruttoSumme);

    // 5) Beleg anlegen
    const { data: beleg, error: bErr } = await db.from('kassen_belege').insert({
      owner_user_id: ownerId, beleg_nr: belegNr, typ, zahlart,
      netto_summe: nettoSumme, mwst_summe: mwstSumme, brutto_summe: bruttoSumme,
      gegeben, rueckgeld, tse_modus: tse.modus, tse_anbieter: tse.anbieter,
      tse_signatur: tse.signatur, tse_seriennummer: tse.seriennummer, tse_zeit: tse.zeit,
      kassierer_id: user.id,
    }).select('id').single();
    if (bErr || !beleg) {
      console.error('Beleg anlegen fehlgeschlagen:', bErr?.message || bErr);
      return NextResponse.json({ error: 'Beleg konnte nicht angelegt werden.' }, { status: 500 });
    }
    const belegId = beleg.id;

    // 6) Positionen schreiben
    const posRows = posten.map(({ _mengeAbs, ...p }) => ({ ...p, beleg_id: belegId }));
    const { error: pErr } = await db.from('kassen_positionen').insert(posRows);
    if (pErr) {
      await db.from('kassen_belege').update({ storniert: true }).eq('id', belegId);
      return NextResponse.json({ error: 'Positionen konnten nicht gespeichert werden. Beleg storniert.' }, { status: 500 });
    }

    // 7) Bestand abbuchen (nur Artikel-Positionen). Verkauf -> raus, Retoure -> rein.
    for (const p of posten) {
      if (!p.artikel_id || !p._mengeAbs) continue;
      const { data: art } = await db.from('artikel').select('aktueller_bestand').eq('id', p.artikel_id).eq('owner_user_id', ownerId).maybeSingle();
      if (!art) continue;
      const delta = typ === 'retoure' ? p._mengeAbs : -p._mengeAbs;
      const neuerBestand = r2((Number(art.aktueller_bestand) || 0) + delta);
      await db.from('artikel').update({ aktueller_bestand: neuerBestand, updated_at: new Date().toISOString() }).eq('id', p.artikel_id).eq('owner_user_id', ownerId);
      await db.from('lagerbewegungen').insert({
        owner_user_id: ownerId, artikel_id: p.artikel_id,
        typ: typ === 'retoure' ? 'eingang' : 'ausgang', menge: delta,
        grund: typ === 'retoure' ? 'Kassen-Retoure' : 'Kassenverkauf', referenz: belegNr,
      });
    }

    return NextResponse.json({ belegId, belegNr, tse, brutto: bruttoSumme, rueckgeld });
  } catch (e: unknown) {
    console.error('Kasse-Beleg Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
