// ============================================================
// ARGONAUT OS · Paket 197 · app/api/rechnung-ablage/route.ts
// Verschickte Rechnungen fest ablegen (GoBD).
//
// POST (multipart: datei, rechnung_id)
//   Legt GENAU diese Datei (das PDF, das der Kunde bekommt) unverändert ab,
//   mit SHA-256-Prüfsumme, und schreibt die Rechnung fest. Nur wer abrechnen
//   darf (Chef oder „Darf abrechnen").
//
// GET ?id=<ablage-id>
//   Liefert die abgelegte Datei. Vorher: Eintrag mit der Sitzung lesen
//   (Datenbank-Regeln entscheiden, wer ihn sieht), Pfad muss zum Betrieb und
//   zur Rechnung passen, Prüfsumme wird neu gebildet und verglichen — weicht
//   sie ab, kommt die Datei NICHT, sondern eine Warnung.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { abrechnungPruefen } from '@/lib/nurGeschaeftsleitung';
import { legeRechnungAb, sha256Hex } from '@/lib/rechnungAblageServer';
import { ABLAGE_BUCKET, ABLAGE_MAX_BYTES, istUuid, pfadPasstZu } from '@/lib/rechnungAblage';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
    const abr = await abrechnungPruefen(supabase, user.id, 'Rechnungen schreibt die Geschäftsleitung fest oder wer das Recht „Darf abrechnen" hat.');
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });

    const laenge = Number(req.headers.get('content-length') || 0);
    if (laenge > ABLAGE_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: 'Die Datei ist größer als 10 MB.' }, { status: 413 });

    const form = await req.formData().catch(() => null);
    const datei = form?.get('datei');
    const rechnungId = String(form?.get('rechnung_id') || '');
    if (!istUuid(rechnungId)) return NextResponse.json({ error: 'Rechnung fehlt.' }, { status: 400 });
    if (!datei || typeof datei === 'string') return NextResponse.json({ error: 'Keine Datei erhalten.' }, { status: 400 });
    const f = datei as File;
    const bytes = new Uint8Array(await f.arrayBuffer());

    const erg = await legeRechnungAb({
      sitzung: supabase, betrieb: abr.betrieb, rechnungId, bytes,
      dateiname: f.name, typ: f.type || 'application/pdf', anlass: 'festgeschrieben', erstelltVon: user.id,
    });
    if (!erg.ok) return NextResponse.json({ error: erg.fehler }, { status: erg.status });
    return NextResponse.json({ ok: true, id: erg.id, hash: erg.hash, festgeschrieben_am: erg.festgeschriebenAm });
  } catch (e: unknown) {
    console.error('Rechnung-Ablage Fehler:', e instanceof Error ? e.message : 'unbekannt');
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

    // Mit der Sitzung lesen: nur Chef bzw. „Darf abrechnen" sehen Einträge ihres Betriebs.
    const { data: z } = await supabase.from('rechnung_ablage')
      .select('id, owner_user_id, rechnung_id, datei_pfad, datei_name, datei_typ, datei_hash').eq('id', id).maybeSingle();
    const zeile = z as { owner_user_id: string; rechnung_id: string; datei_pfad: string; datei_name: string; datei_typ: string; datei_hash: string } | null;
    if (!zeile) return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 });
    if (!pfadPasstZu(zeile.datei_pfad, zeile.owner_user_id, zeile.rechnung_id)) {
      return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 });
    }

    const { data: blob, error } = await createAdminClient().storage.from(ABLAGE_BUCKET).download(zeile.datei_pfad);
    if (error || !blob) return NextResponse.json({ error: 'Datei nicht gefunden.' }, { status: 404 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (sha256Hex(bytes) !== zeile.datei_hash) {
      console.error('[rechnung-ablage] Pruefsumme weicht ab:', id);
      return NextResponse.json({ error: 'Die Prüfsumme der abgelegten Datei stimmt nicht — die Datei wurde verändert. Bitte melden Sie sich beim Support.' }, { status: 409 });
    }
    const name = String(zeile.datei_name || 'Rechnung.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': zeile.datei_typ === 'application/xml' ? 'application/xml' : 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'X-Argonaut-Pruefsumme': zeile.datei_hash,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e: unknown) {
    console.error('Rechnung-Ablage GET Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
