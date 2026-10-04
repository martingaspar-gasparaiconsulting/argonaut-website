// ============================================================
// ARGONAUT OS · Paket 198 · app/api/beleg-ablage/route.ts
// Mahnungen und Angebots-Zusagen fest ablegen (GoBD / Nachweis).
//
// POST (multipart: datei, rechnung_id, stufe)
//   Legt das Mahnungs-PDF, das der Kunde bekommt, unverändert ab (SHA-256).
//   Nur wer abrechnen darf (Chef oder „Darf abrechnen"). Die Rechnung wird mit
//   der Sitzung gelesen und muss zum Betrieb gehören.
//   (Zusagen legt die öffentliche Angebots-Route selbst ab — dort gibt es
//   keinen Login, nur den Link.)
//
// GET ?id=<beleg-id>
//   Liefert die abgelegte Datei. Eintrag mit der Sitzung lesen (Datenbank-
//   Regeln entscheiden), Pfad muss passen, Prüfsumme wird neu gebildet — weicht
//   sie ab, kommt die Datei NICHT.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { abrechnungPruefen } from '@/lib/nurGeschaeftsleitung';
import { ABLAGE_BUCKET, istUuid } from '@/lib/rechnungAblage';
import { BELEG_MAX_BYTES, belegPfadPasstZu, mahnungDateiname } from '@/lib/belegAblage';
import { legeBelegAb, sha256Hex } from '@/lib/belegAblageServer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
    const abr = await abrechnungPruefen(supabase, user.id, 'Mahnungen legt die Geschäftsleitung ab oder wer das Recht „Darf abrechnen" hat.');
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });

    const laenge = Number(req.headers.get('content-length') || 0);
    if (laenge > BELEG_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: 'Die Datei ist größer als 10 MB.' }, { status: 413 });

    const form = await req.formData().catch(() => null);
    const datei = form?.get('datei');
    const rechnungId = String(form?.get('rechnung_id') || '');
    const stufe = Math.floor(Number(form?.get('stufe') || 0));
    if (!istUuid(rechnungId)) return NextResponse.json({ error: 'Rechnung fehlt.' }, { status: 400 });
    if (!(stufe >= 1 && stufe <= 4)) return NextResponse.json({ error: 'Mahnstufe fehlt.' }, { status: 400 });
    if (!datei || typeof datei === 'string') return NextResponse.json({ error: 'Keine Datei erhalten.' }, { status: 400 });

    // Rechnung mit der Sitzung lesen — sieht die Person sie nicht, gibt es nichts abzulegen.
    const { data: r } = await supabase.from('rechnungen').select('id, owner_user_id, rechnungsnummer').eq('id', rechnungId).maybeSingle();
    const rechnung = r as { id: string; owner_user_id: string; rechnungsnummer: string | null } | null;
    if (!rechnung) return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 });
    if (String(rechnung.owner_user_id) !== abr.betrieb) return NextResponse.json({ error: 'Diese Rechnung gehört nicht zu Ihrem Betrieb.' }, { status: 403 });

    const bytes = new Uint8Array(await (datei as File).arrayBuffer());
    const erg = await legeBelegAb({
      betrieb: abr.betrieb, art: 'mahnung', bezugId: rechnungId, bezugNummer: rechnung.rechnungsnummer,
      stufe, bytes, dateiname: mahnungDateiname(stufe, rechnung.rechnungsnummer), erstelltVon: user.id,
    });
    if (!erg.ok) return NextResponse.json({ error: erg.fehler }, { status: erg.status });
    return NextResponse.json({ ok: true, id: erg.id, hash: erg.hash });
  } catch (e: unknown) {
    console.error('Beleg-Ablage Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Unerwarteter Fehler beim Ablegen.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!istUuid(id)) return NextResponse.json({ error: 'Ungültige Angabe.' }, { status: 400 });

    const { data: z } = await supabase.from('beleg_ablage')
      .select('id, owner_user_id, art, bezug_id, datei_pfad, datei_name, datei_typ, datei_hash').eq('id', id).maybeSingle();
    const zeile = z as { owner_user_id: string; art: string; bezug_id: string; datei_pfad: string; datei_name: string; datei_typ: string; datei_hash: string } | null;
    if (!zeile || !belegPfadPasstZu(zeile.datei_pfad, zeile.owner_user_id, zeile.art, zeile.bezug_id)) {
      return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 });
    }

    const { data: blob, error } = await createAdminClient().storage.from(ABLAGE_BUCKET).download(zeile.datei_pfad);
    if (error || !blob) return NextResponse.json({ error: 'Datei nicht gefunden.' }, { status: 404 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (sha256Hex(bytes) !== zeile.datei_hash) {
      console.error('[beleg-ablage] Pruefsumme weicht ab:', id);
      return NextResponse.json({ error: 'Die Prüfsumme der abgelegten Datei stimmt nicht — die Datei wurde verändert. Bitte melden Sie sich beim Support.' }, { status: 409 });
    }
    const name = String(zeile.datei_name || 'Beleg').replace(/[^a-zA-Z0-9._-]/g, '_');
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': zeile.datei_typ === 'application/json' ? 'application/json; charset=utf-8' : 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'X-Argonaut-Pruefsumme': zeile.datei_hash,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e: unknown) {
    console.error('Beleg-Ablage GET Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
