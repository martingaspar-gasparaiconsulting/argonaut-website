// ============================================================================
// ARGONAUT OS · app/api/baustelle-foto-ki/route.ts — Foto-KI Baustelle (Paket PK, B27)
//
//   POST { base64, mediaType, projekt?, plan?, notiz? }
//     -> { ok, vorschlag: { art, titel, beschreibung, gewerk, schwere, massnahme, aufmass, hinweise } }
//
// Die KI SCHLÄGT VOR, sie speichert nichts. Maße, Mengen und Preise liest sie
// nicht aus dem Foto (Prompt + Prüfung in lib/bauPlan.ts, getestet).
// Modell: Haiku (Alltag, günstig). Läuft durch kiFetch (Firmen-Topf,
// Minuten-Bremse, Kosten-Protokoll). Nur eingeloggt.
// ============================================================================
import { NextResponse } from 'next/server';
import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { fotoKiSystem, fotoKiNutzer, leseFotoVorschlag, FOTO_KI_MODELL, PLAN_BILDARTEN } from '@/lib/bauPlan';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BASE64 = 4_500_000;

function fehler(meldung: string, status = 400) {
  return NextResponse.json({ ok: false, error: meldung }, { status });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fehler('Ungültige Anfrage.'); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fehler('Nicht eingeloggt.', 401);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fehler('Die KI ist derzeit nicht eingerichtet.', 500);

  const base64 = typeof body.base64 === 'string' ? body.base64 : '';
  const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';
  if (!base64) return fehler('Bitte ein Foto wählen.');
  if (base64.length > MAX_BASE64) return fehler('Das Foto ist zu groß.');
  if (!PLAN_BILDARTEN.includes(mediaType)) return fehler('Bitte ein Foto (JPG, PNG oder WebP) wählen.');

  const nutzer = fotoKiNutzer({
    projekt: typeof body.projekt === 'string' ? body.projekt : null,
    plan: typeof body.plan === 'string' ? body.plan : null,
    notiz: typeof body.notiz === 'string' ? body.notiz : null,
  });

  try {
    const res = await kiFetch('baustelle-foto-ki', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: FOTO_KI_MODELL,
        max_tokens: 900,
        system: fotoKiSystem(),
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: nutzer },
        ] }],
      }),
    });
    if (!res.ok) return fehler(res.status === 429 ? 'Zu viele KI-Anfragen — bitte kurz warten.' : 'Das Foto konnte gerade nicht ausgewertet werden.', 502);
    const data = await res.json();
    const bloecke: Array<{ type?: string; text?: string }> = Array.isArray(data?.content) ? data.content : [];
    const roh = bloecke.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
    const vorschlag = leseFotoVorschlag(roh);
    if (!vorschlag) return fehler('Die KI-Antwort war nicht lesbar. Bitte selbst beschreiben oder erneut versuchen.', 502);
    return NextResponse.json({ ok: true, vorschlag });
  } catch (e) {
    console.error('[baustelle-foto-ki]', e instanceof Error ? e.message : e);
    return fehler('Interner Fehler.', 500);
  }
}
