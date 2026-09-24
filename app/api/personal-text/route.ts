// ============================================================================
// ARGONAUT OS · app/api/personal-text/route.ts — Personal-Texte (Paket PF · B10)
//
//   POST { art: 'zeugnis', ...ZeugnisEingabe }  -> { ok, text }
//   POST { art: 'stelle',  ...StellenEingabe }  -> { ok, text, agg }
//
// Nur ENTWÜRFE. Nichts wird gespeichert oder verschickt.
// Beim Zeugnis gibt der MENSCH die Note vor — die KI formuliert nur und
// bewertet niemanden. Die Stellenanzeige wird nach dem Entwurf noch einmal
// gegen die AGG-Muster geprüft (lib/personalDokumente.ts, getestet).
//
// Modell: claude-haiku-4-5, über kiFetch (Firmen-Topf, Bremse, Protokoll).
// Nur eingeloggt.
// ============================================================================
import { NextResponse } from 'next/server';
import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import {
  pruefeZeugnis, zeugnisPrompt, stellenPrompt, aggPruefung, saeubere,
  type ZeugnisEingabe, type StellenEingabe,
} from '@/lib/personalDokumente';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODELL = 'claude-haiku-4-5';

function fehler(meldung: string, status = 400) {
  return NextResponse.json({ ok: false, error: meldung }, { status });
}

function s(v: unknown, max = 3000): string {
  return String(v ?? '').slice(0, max).trim();
}

async function frage(system: string, nutzer: string, route: string): Promise<string> {
  const res = await kiFetch(route, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODELL, max_tokens: 2000, system, messages: [{ role: 'user', content: nutzer }] }),
  });
  if (!res.ok) throw new Error(res.status === 429 ? 'Gerade zu viele Anfragen — bitte in einer Minute erneut.' : 'Die KI hat nicht geantwortet.');
  const data = await res.json();
  const bloecke: Array<{ type?: string; text?: string }> = Array.isArray(data?.content) ? data.content : [];
  return saeubere(bloecke.filter((b) => b.type === 'text').map((b) => b.text || '').join(''));
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fehler('Ungültige Anfrage.'); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fehler('Nicht eingeloggt.', 401);
  if (!process.env.ANTHROPIC_API_KEY) return fehler('Die KI ist derzeit nicht eingerichtet.', 500);

  try {
    if (body.art === 'zeugnis') {
      const e: ZeugnisEingabe = {
        art: body.zeugnisArt === 'zwischen' ? 'zwischen' : 'end',
        qualifiziert: body.qualifiziert !== false,
        note: Number(body.note),
        name: s(body.name, 120),
        geschlecht: body.geschlecht === 'm' || body.geschlecht === 'w' ? body.geschlecht : 'd',
        position: s(body.position, 120),
        beginn: s(body.beginn, 10),
        ende: s(body.ende, 10) || null,
        aufgaben: s(body.aufgaben),
        staerken: s(body.staerken, 1500),
        austrittsgrund: (['eigener_wunsch', 'arbeitgeber', 'einvernehmlich', 'befristung'] as const).find((x) => x === body.austrittsgrund) ?? 'keine_angabe',
        firma: s(body.firma, 120),
      };
      const p = pruefeZeugnis(e);
      if (!p.ok) return fehler(p.fehler);
      const z = zeugnisPrompt(e);
      const text = await frage(z.system, z.nutzer, 'personal-zeugnis');
      if (!text) return fehler('Die KI hat keinen Text geliefert.', 502);
      return NextResponse.json({ ok: true, text });
    }

    if (body.art === 'stelle') {
      const e: StellenEingabe = {
        titel: s(body.titel, 120), firma: s(body.firma, 120), ort: s(body.ort, 120),
        aufgaben: s(body.aufgaben), anforderungen: s(body.anforderungen), angebot: s(body.angebot), umfang: s(body.umfang, 120),
      };
      if (!e.titel || e.aufgaben.length < 5) return fehler('Bitte Stellentitel und Aufgaben angeben.');
      const p = stellenPrompt(e);
      const text = await frage(p.system, p.nutzer, 'personal-stelle');
      if (!text) return fehler('Die KI hat keinen Text geliefert.', 502);
      return NextResponse.json({ ok: true, text, agg: aggPruefung(text) });
    }

    return fehler('Unbekannte Art.');
  } catch (err) {
    return fehler(err instanceof Error ? err.message : 'Fehler bei der KI.', 502);
  }
}
