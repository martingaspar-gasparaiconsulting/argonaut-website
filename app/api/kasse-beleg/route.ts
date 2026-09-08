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
import { standortAusCookieHeader } from '@/lib/standortDaten';
import { standortFuerBuchung, buchenArgumente, RPC_BUCHEN } from '@/lib/lagerBuchung';

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

    // 2) Auf WELCHE Filiale wird gebucht? Bewusst hier, VOR dem ersten
    //    Schreibvorgang — noch ist nichts passiert, also darf abgebrochen
    //    werden. Nach der TSE-Signatur waere das nicht mehr sauber: dann
    //    gaebe es einen Beleg, dessen Ware nirgends abgebucht ist.
    //
    //    Betriebe ohne Filiale (am 08.09.26 waren das ALLE) buchen wie
    //    bisher auf einen einzigen Topf — standortId bleibt null.
    const { data: standorte } = await db.from('standorte')
      .select('id').eq('owner_user_id', ownerId).eq('aktiv', true);
    const wahl = standortFuerBuchung(standortAusCookieHeader(req.headers.get('cookie')), standorte);
    if (!wahl.ok) {
      return NextResponse.json({ error: wahl.fehler }, { status: 400 });
    }
    const standortId = wahl.standortId;

    // 3) Positionen normalisieren + Summen (BRUTTO, je Steuersatz)
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

    // 4) Beleg-Nr (fortlaufend je Jahr/Betrieb)
    const jahr = new Date().getFullYear();
    const { count } = await db.from('kassen_belege').select('id', { count: 'exact', head: true })
      .eq('owner_user_id', ownerId).gte('erstellt_am', `${jahr}-01-01`);
    const belegNr = `B-${jahr}-${String((count || 0) + 1).padStart(4, '0')}`;

    // 5) Signieren (TSE-Konnektor)
    const tse = await signiereBeleg(db, ownerId, belegNr, bruttoSumme);

    // 6) Beleg anlegen
    const { data: beleg, error: bErr } = await db.from('kassen_belege').insert({
      owner_user_id: ownerId, standort_id: standortId, beleg_nr: belegNr, typ, zahlart,
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

    // 7) Positionen schreiben
    const posRows = posten.map(({ _mengeAbs, ...p }) => ({ ...p, beleg_id: belegId }));
    const { error: pErr } = await db.from('kassen_positionen').insert(posRows);
    if (pErr) {
      await db.from('kassen_belege').update({ storniert: true }).eq('id', belegId);
      return NextResponse.json({ error: 'Positionen konnten nicht gespeichert werden. Beleg storniert.' }, { status: 500 });
    }

    // 8) Bestand abbuchen (nur Artikel-Positionen). Verkauf -> raus, Retoure -> rein.
    //
    // ▄▄▄ WAS SICH AM 08.09.26 HIER GEAENDERT HAT (D1) ▄▄▄
    // Vorher waren das drei einzelne Schreibvorgaenge je Position: Bestand
    // lesen, Bestand schreiben, Bewegung schreiben. Bricht die Verbindung
    // dazwischen ab, ist der Bestand veraendert, aber kein Nachweis da —
    // oder umgekehrt. Ausserdem lief alles auf EINE globale Zahl: Zwei
    // Filialen konnten sich gegenseitig ueberschreiben.
    //
    // Jetzt macht `lager_buchen` alles drei in einem einzigen Vorgang, je
    // Filiale, und setzt `artikel.aktueller_bestand` auf die SUMME. Was
    // schiefgeht, geht ganz schief — nicht halb.
    //
    // Ein Abgang wird NIE blockiert: Was an der Kasse verkauft wurde, ist
    // verkauft. Schlaegt eine Buchung dennoch fehl, wird das protokolliert
    // und im Ergebnis gemeldet — der Beleg selbst bleibt gueltig, denn er
    // ist bereits signiert und darf nicht verschwinden.
    const bestandsFehler: string[] = [];
    for (const p of posten) {
      if (!p.artikel_id || !p._mengeAbs) continue;
      const { error: lErr } = await db.rpc(RPC_BUCHEN, buchenArgumente({
        artikelId: p.artikel_id,
        standortId,
        art: typ === 'retoure' ? 'zugang' : 'abgang',
        menge: p._mengeAbs,
        herkunft: 'kasse',
        notiz: `${typ === 'retoure' ? 'Kassen-Retoure' : 'Kassenverkauf'} ${belegNr}`,
      }));
      if (lErr) {
        console.error('Lagerbuchung fehlgeschlagen:', p.artikel_id, lErr.message);
        bestandsFehler.push(p.bezeichnung);
      }
    }

    return NextResponse.json({
      belegId, belegNr, tse, brutto: bruttoSumme, rueckgeld,
      // Nur gesetzt, wenn wirklich etwas schiefging — die Kasse zeigt es an,
      // damit niemand erst bei der Inventur davon erfaehrt.
      bestandsHinweis: bestandsFehler.length
        ? `Der Beleg ist gebucht. Der Lagerbestand konnte für ${bestandsFehler.join(', ')} `
          + 'nicht fortgeschrieben werden — bitte später nachzählen.'
        : undefined,
    });
  } catch (e: unknown) {
    console.error('Kasse-Beleg Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
