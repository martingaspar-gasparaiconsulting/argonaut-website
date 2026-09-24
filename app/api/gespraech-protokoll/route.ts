// ============================================================================
// ARGONAUT OS · app/api/gespraech-protokoll/route.ts — Gesprächsprotokoll (Paket PG · B13)
//
//   POST { art, datum, ort?, teilnehmer?, kontakt?, anrede?, roh }
//     -> { ok, protokoll, markdown, nachfass_am, mail, aufgaben }
//
// Die Route SCHLÄGT NUR VOR. Gespeichert wird in der Seite (Tabelle
// gespraech_protokoll), Aufgaben entstehen erst per Klick über
// /api/cockpit-action, die Nachfass-Mail verschickt der Mensch selbst.
//
// Was aus der KI-Antwort wird, entscheidet lib/gespraechsProtokoll.ts
// (getestet): Fristen nur mit Wortlaut und nie vor dem Besprechungstag,
// fremde Namen und fremde Beträge werden gemeldet.
//
// Modell: claude-haiku-4-5 über kiFetch (Firmen-Topf, Bremse, Protokoll).
// Nur eingeloggt.
// ============================================================================
import { NextResponse } from 'next/server';
import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { heuteIso, leseDatum } from '@/lib/sachbearbeiter';
import {
  artFuer, systemPrompt, nutzerPrompt, leseProtokoll, nachfassDatum,
  aufgabenFuerCockpit, protokollMarkdown, nachfassMail, MAX_ROH,
} from '@/lib/gespraechsProtokoll';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODELL = 'claude-haiku-4-5';

function fehler(meldung: string, status = 400) {
  return NextResponse.json({ ok: false, error: meldung }, { status });
}

function s(v: unknown, max: number): string {
  return String(v ?? '').slice(0, max).trim();
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fehler('Ungültige Anfrage.'); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fehler('Nicht eingeloggt.', 401);
  if (!process.env.ANTHROPIC_API_KEY) return fehler('Die KI ist derzeit nicht eingerichtet.', 500);

  const roh = s(body.roh, MAX_ROH);
  if (roh.length < 20) return fehler('Bitte das Gespräch etwas ausführlicher diktieren oder eintippen.');
  const heute = heuteIso(new Date());
  const datum = leseDatum(body.datum) ?? heute;
  const art = artFuer(body.art);
  const ort = s(body.ort, 160);

  let firma = '';
  try {
    const { data: p } = await supabase.from('profiles').select('firma_name').eq('id', user.id).maybeSingle();
    firma = String((p as { firma_name?: string } | null)?.firma_name ?? '').trim();
  } catch { /* egal */ }

  const res = await kiFetch('gespraech-protokoll', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELL,
      max_tokens: 3000,
      system: systemPrompt(art, firma),
      messages: [{ role: 'user', content: nutzerPrompt({ datum, ort, teilnehmer: s(body.teilnehmer, 400), kontakt: s(body.kontakt, 200), roh }) }],
    }),
  });
  if (!res.ok) {
    return fehler(res.status === 429 ? 'Gerade zu viele Anfragen — bitte in einer Minute erneut.' : 'Die KI hat nicht geantwortet.', 502);
  }
  const data = await res.json();
  const bloecke: Array<{ type?: string; text?: string }> = Array.isArray(data?.content) ? data.content : [];
  const text = bloecke.filter((b) => b.type === 'text').map((b) => b.text || '').join('');

  const protokoll = leseProtokoll(text, roh, datum);
  if (!protokoll.zusammenfassung && protokoll.themen.length === 0 && protokoll.aufgaben.length === 0) {
    return fehler('Aus dem Text ließ sich kein Protokoll erstellen. Bitte erneut versuchen.', 502);
  }

  return NextResponse.json({
    ok: true,
    datum,
    protokoll,
    markdown: protokollMarkdown(protokoll, { datum, ort, art }),
    nachfass_am: nachfassDatum(protokoll, datum, heute),
    mail: nachfassMail(protokoll, { datum, firma, anrede: s(body.anrede, 120) }),
    aufgaben: aufgabenFuerCockpit(protokoll, datum, heute),
    firma,
  });
}
