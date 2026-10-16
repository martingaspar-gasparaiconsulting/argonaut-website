import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { startFreiServer } from '@/lib/freigabeServer';
import { entscheidungPruefen, messungAktiv } from '@/lib/cookieEinwilligung';
import { drossel, drosselIp } from '@/lib/drossel';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/einwilligung — Paket C1 (16.10.2026)
// ÖFFENTLICH (Besucher einer Kunden-Webseite). Nimmt die Entscheidung aus dem
// Einwilligungs-Fenster als NACHWEIS entgegen: ja / nein / widerruf, Fassung
// des Fenster-Texts, Zeitpunkt, bei ja/widerruf die Zufalls-Kennung.
// Es wird KEINE IP gespeichert (nur gehasht für den Mengen-Deckel).
//
// Beim Widerruf wird die Kennung aus allen Messdaten des Betriebs entfernt
// (web_ereignisse.besucher_id = null) — Art. 17 Abs. 1 lit. b DSGVO.
//
// Wirkt nur mit Start-Schalter cookieMessung UND web_ci.cookie_messung des
// Betriebs; owner_user_id kommt immer aus web_seiten, nie vom Besucher.
// Antwortet Besuchern immer knapp und ohne interne Fehlertexte.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    if (!(await startFreiServer('cookieMessung'))) {
      return NextResponse.json({ ok: false, error: 'abgeschaltet' }, { status: 403 });
    }
    let roh: unknown = null;
    try { roh = await req.json(); } catch { roh = null; }
    const e = entscheidungPruefen(roh);
    if ('fehler' in e) return NextResponse.json({ ok: false, error: 'Ungültige Angabe.' }, { status: 400 });

    const db = createAdminClient();
    const zuViel = await drossel(db, 'oeffentlich/einwilligung', { ip: drosselIp(req.headers), ziel: e.seite });
    if (zuViel) return NextResponse.json({ ok: false, error: 'Zu viele Anfragen.' }, { status: 429 });

    const { data: seite } = await db
      .from('web_seiten')
      .select('owner_user_id, status')
      .eq('oeffentlich_id', e.seite)
      .maybeSingle();
    const s = seite as { owner_user_id?: string; status?: string } | null;
    if (!s || s.status !== 'live' || !s.owner_user_id) {
      return NextResponse.json({ ok: false, error: 'Unbekannte Seite.' }, { status: 404 });
    }
    const owner = s.owner_user_id;
    const { data: ci } = await db.from('web_ci').select('cookie_messung').eq('owner_user_id', owner).maybeSingle();
    if (!messungAktiv(true, ci as { cookie_messung?: boolean | null } | null)) {
      return NextResponse.json({ ok: false, error: 'abgeschaltet' }, { status: 403 });
    }

    const { error } = await db.from('web_einwilligung').insert({
      owner_user_id: owner,
      oeffentlich_id: e.seite,
      entscheidung: e.entscheidung,
      besucher_id: e.besucher_id,
      text_version: e.text_version,
    });
    if (error) {
      console.error('einwilligung: Nachweis nicht gespeichert');
      return NextResponse.json({ ok: false, error: 'Bitte später erneut.' }, { status: 503 });
    }

    if (e.entscheidung === 'widerruf' && e.besucher_id) {
      // Kennung aus den Messdaten entfernen — die Besuche bleiben als anonyme Zählung.
      await db.from('web_ereignisse').update({ besucher_id: null }).eq('owner_user_id', owner).eq('besucher_id', e.besucher_id);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Bitte später erneut.' }, { status: 503 });
  }
}
