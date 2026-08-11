import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { kiFetch } from '@/lib/ki';
import {
  saeubereThema,
  saeubereDauer,
  saeubereAnzahl,
  saeubereModus,
  bereinigeVideoKanaele,
  videoKanalFuer,
  baueVideoSystemPrompt,
  baueVideoNutzerPrompt,
  parseVideoSkripte,
  baueVariantenSystemPrompt,
  baueVariantenNutzerPrompt,
  parseVarianten,
  type CIAngaben,
  type VariantenGruppe,
} from '@/lib/videoSkript';

// ============================================================================
// ARGONAUT OS · app/api/marketing/video-skript/route.ts
// (Marketing-Tiefe · Abschnitt 14 — "Kanaele + Video")
//
// EIN Thema/Anlass -> je Kanal Kurzvideo-Skript(e), ueber kiFetch (haiku,
// Kosten-Protokoll). Zwei Modi:
//   · "detail"    -> 1 ausfuehrliches Skript je Kanal (EIN KI-Aufruf).
//   · "varianten" -> je Kanal N Kurz-Skript-Varianten, auf Dauer/Woerter
//                    getrimmt (EIN KI-Aufruf JE KANAL, parallel; robust bei
//                    Teil-Ausfall). Deckel 30 je Kanal.
// Es wird NICHTS gespeichert und NICHTS erfunden — der Kunde kopiert das Skript.
//   POST { thema, kanaele[], dauer?, modus?, anzahl?, firma?, branche?, ton? }
// Nur eingeloggt. RLS-neutral (liest keine Kundendaten, erzeugt nur Text).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Text-Bloecke aus einer Anthropic-Antwort zusammenfuegen. */
function textAus(d: unknown): string {
  const blocks = Array.isArray((d as { content?: unknown }).content)
    ? ((d as { content: Array<{ type?: string; text?: string }> }).content)
    : [];
  return blocks.filter((x) => x.type === 'text').map((x) => x.text || '').join('').trim();
}

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
  const modus = saeubereModus(roh.modus);
  const anzahl = saeubereAnzahl(roh.anzahl);
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
  const kopf = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };

  // -------------------------------------------------------------- VARIANTEN --
  if (modus === 'varianten' && anzahl >= 2) {
    // Je Kanal ein eigener, schlanker Aufruf — parallel, robust bei Teil-Ausfall.
    const sys = baueVariantenSystemPrompt();
    const maxTok = Math.min(8000, 500 + anzahl * 260);

    const gruppen = await Promise.all(kanaele.map(async (id): Promise<VariantenGruppe | null> => {
      const k = videoKanalFuer(id)!;
      const zielSek = saeubereDauer(dauer, k);
      const nutzer = baueVariantenNutzerPrompt(thema, id, anzahl, dauer, ci);
      try {
        const kiRes = await kiFetch('marketing-video-skript-varianten', {
          method: 'POST', headers: kopf,
          body: JSON.stringify({
            model: 'claude-haiku-4-5', max_tokens: maxTok, system: sys,
            messages: [{ role: 'user', content: [{ type: 'text', text: nutzer }] }],
          }),
        });
        if (!kiRes.ok) return null;
        const varianten = parseVarianten(textAus(await kiRes.json()), anzahl, zielSek);
        if (varianten.length === 0) return null;
        return {
          kanal: k.id, name: k.name, icon: k.icon, plattform: k.plattform, format: k.format,
          dauerSekunden: zielSek, varianten,
        };
      } catch {
        return null;
      }
    }));

    const fertig = gruppen.filter((g): g is VariantenGruppe => g !== null);
    if (fertig.length === 0) {
      return NextResponse.json({ ok: false, error: 'Die Varianten konnten gerade nicht erzeugt werden. Bitte das Thema etwas konkreter formulieren oder in einem Moment erneut versuchen.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, modus: 'varianten', thema, dauer, anzahl, gruppen: fertig });
  }

  // ----------------------------------------------------------------- DETAIL --
  const sys = baueVideoSystemPrompt();
  const nutzer = baueVideoNutzerPrompt(thema, kanaele, dauer, ci);

  let rohText = '';
  try {
    const kiRes = await kiFetch('marketing-video-skript', {
      method: 'POST', headers: kopf,
      body: JSON.stringify({
        model: 'claude-haiku-4-5', max_tokens: 2600, system: sys,
        messages: [{ role: 'user', content: [{ type: 'text', text: nutzer }] }],
      }),
    });
    if (!kiRes.ok) {
      let msg = 'Die KI konnte gerade keine Skripte erzeugen. Bitte kurz warten und erneut versuchen.';
      try { const e = await kiRes.json(); if (e && typeof e.error === 'string') msg = e.error; } catch { /* egal */ }
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
    rohText = textAus(await kiRes.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'Die KI ist gerade nicht erreichbar. Bitte später erneut versuchen.' }, { status: 502 });
  }

  const skripte = parseVideoSkripte(rohText, kanaele, dauer);
  if (skripte.length === 0) {
    return NextResponse.json({ ok: false, error: 'Die Skripte konnten nicht verarbeitet werden. Bitte das Thema etwas konkreter formulieren und erneut versuchen.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, modus: 'detail', thema, dauer, skripte });
}
