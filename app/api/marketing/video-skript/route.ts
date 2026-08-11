import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { kiFetch } from '@/lib/ki';
import {
  saeubereThema,
  saeubereDauer,
  bereinigeVideoKanaele,
  baueVideoSystemPrompt,
  baueVideoNutzerPrompt,
  parseVideoSkripte,
  type CIAngaben,
} from '@/lib/videoSkript';

// ============================================================================
// ARGONAUT OS · app/api/marketing/video-skript/route.ts
// (Marketing-Tiefe · Abschnitt 14 — "Kanaele + Video")
//
// EIN Thema/Anlass + gewaehlte Video-Kanaele + Zieldauer -> die KI (haiku, ueber
// kiFetch mit Kosten-Protokoll) erzeugt je Kanal ein drehreifes Kurzvideo-Skript
// (Hook, Shotlist, On-Screen-Text, Untertitel, CTA, Hashtags). Es wird NICHTS
// gespeichert und NICHTS erfunden — der Kunde kopiert das fertige Skript.
//   POST { thema, kanaele[], dauer?, firma?, branche?, ton? }
//        -> { ok, thema, dauer, skripte } | { ok:false, error }
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

  const roh = body as Record<string, unknown>;
  const thema = saeubereThema(roh.thema);
  const kanaele = bereinigeVideoKanaele(roh.kanaele);
  const dauer = saeubereDauer(roh.dauer);
  if (!thema) return NextResponse.json({ ok: false, error: 'Bitte ein Thema oder einen Anlass eingeben.' }, { status: 400 });
  if (kanaele.length === 0) return NextResponse.json({ ok: false, error: 'Bitte mindestens einen Video-Kanal auswählen.' }, { status: 400 });

  const ci: CIAngaben = {
    firma: typeof roh.firma === 'string' ? (roh.firma as string).slice(0, 120) : null,
    branche: typeof roh.branche === 'string' ? (roh.branche as string).slice(0, 120) : null,
    ton: typeof roh.ton === 'string' ? (roh.ton as string).slice(0, 120) : null,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'Die KI ist gerade nicht verfügbar. Bitte später erneut versuchen.' }, { status: 503 });
  }

  const sys = baueVideoSystemPrompt();
  const nutzer = baueVideoNutzerPrompt(thema, kanaele, dauer, ci);

  let rohText = '';
  try {
    const kiRes = await kiFetch('marketing-video-skript', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2600,
        system: sys,
        messages: [{ role: 'user', content: [{ type: 'text', text: nutzer }] }],
      }),
    });
    if (!kiRes.ok) {
      let msg = 'Die KI konnte gerade keine Skripte erzeugen. Bitte kurz warten und erneut versuchen.';
      try { const e = await kiRes.json(); if (e && typeof e.error === 'string') msg = e.error; } catch { /* egal */ }
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
    const d = await kiRes.json();
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(d.content) ? d.content : [];
    rohText = blocks.filter((x) => x.type === 'text').map((x) => x.text || '').join('').trim();
  } catch {
    return NextResponse.json({ ok: false, error: 'Die KI ist gerade nicht erreichbar. Bitte später erneut versuchen.' }, { status: 502 });
  }

  const skripte = parseVideoSkripte(rohText, kanaele, dauer);
  if (skripte.length === 0) {
    return NextResponse.json({ ok: false, error: 'Die Skripte konnten nicht verarbeitet werden. Bitte das Thema etwas konkreter formulieren und erneut versuchen.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, thema, dauer, skripte });
}
