import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { kiFetch } from '@/lib/ki';
import {
  saeubereThema,
  bereinigeKanaele,
  baueSystemPrompt,
  baueNutzerPrompt,
  parseVorschlaege,
  type CIAngaben,
} from '@/lib/contentFliessband';

// ============================================================================
// ARGONAUT OS · app/api/marketing/content-fliessband/route.ts
// (Marketing-Ausbau · Punkt 3 — KI-Content-Fliessband)
//
// EIN Thema/Anlass + gewaehlte Kanaele -> die KI (haiku, ueber kiFetch mit
// Kosten-Protokoll) erzeugt je Kanal einen fertigen Beitrag im passenden Ton
// samt Bildvorschlag. Es wird NICHTS gespeichert und NICHTS erfunden — die
// Uebernahme in social_beitrag/Kalender passiert erst auf der Seite per Klick.
//   POST { thema, kanaele[], firma?, branche?, ton? }
//        -> { ok, vorschlaege } | { ok:false, error }
// Nur eingeloggt. RLS-neutral (liest keine Kundendaten, erzeugt nur Text).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });
  }

  const thema = saeubereThema((body as Record<string, unknown>).thema);
  const kanaele = bereinigeKanaele((body as Record<string, unknown>).kanaele);
  if (!thema) return NextResponse.json({ ok: false, error: 'Bitte ein Thema oder einen Anlass eingeben.' }, { status: 400 });
  if (kanaele.length === 0) return NextResponse.json({ ok: false, error: 'Bitte mindestens einen Kanal auswählen.' }, { status: 400 });

  const ci: CIAngaben = {
    firma: typeof (body as Record<string, unknown>).firma === 'string' ? ((body as Record<string, unknown>).firma as string).slice(0, 120) : null,
    branche: typeof (body as Record<string, unknown>).branche === 'string' ? ((body as Record<string, unknown>).branche as string).slice(0, 120) : null,
    ton: typeof (body as Record<string, unknown>).ton === 'string' ? ((body as Record<string, unknown>).ton as string).slice(0, 120) : null,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'Die KI ist gerade nicht verfügbar. Bitte später erneut versuchen.' }, { status: 503 });
  }

  const sys = baueSystemPrompt();
  const nutzer = baueNutzerPrompt(thema, kanaele, ci);

  let rohText = '';
  try {
    const kiRes = await kiFetch('marketing-content-fliessband', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2200,
        system: sys,
        messages: [{ role: 'user', content: [{ type: 'text', text: nutzer }] }],
      }),
    });
    if (!kiRes.ok) {
      // kiFetch reicht bei Limits/Fehlern eine sprechende Meldung durch.
      let msg = 'Die KI konnte gerade keine Vorschläge erzeugen. Bitte kurz warten und erneut versuchen.';
      try { const e = await kiRes.json(); if (e && typeof e.error === 'string') msg = e.error; } catch { /* egal */ }
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
    const d = await kiRes.json();
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(d.content) ? d.content : [];
    rohText = blocks.filter((x) => x.type === 'text').map((x) => x.text || '').join('').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Die KI ist gerade nicht erreichbar. Bitte später erneut versuchen.' }, { status: 502 });
  }

  const vorschlaege = parseVorschlaege(rohText, kanaele);
  if (vorschlaege.length === 0) {
    return NextResponse.json({ ok: false, error: 'Die Vorschläge konnten nicht verarbeitet werden. Bitte das Thema etwas konkreter formulieren und erneut versuchen.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, thema, vorschlaege });
}
