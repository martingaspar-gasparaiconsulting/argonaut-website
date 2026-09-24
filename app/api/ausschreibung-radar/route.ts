// ============================================================================
// ARGONAUT OS · app/api/ausschreibung-radar/route.ts — Ausschreibungs-Radar (Paket PH · B12)
//
//   POST { modus: 'suche', profil }   -> { ok, funde, abfrage, gesamt }
//        TED (EU-Amtsblatt), offizielle Schnittstelle, ohne Schlüssel.
//   POST { modus: 'pruefen', text }   -> { ok, analyse }
//        Ausschreibungstext auswerten (Haiku, über kiFetch).
//
// Die Route SPEICHERT NICHTS. Gemerkt wird in der Seite (Tabelle
// ausschreibung). Nur eingeloggt.
// ============================================================================
import { NextResponse } from 'next/server';
import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { heuteIso } from '@/lib/sachbearbeiter';
import {
  leseProfil, tedAbfrage, TED_FELDER, TED_FELDER_EXTRA, leseTedFund, sortiereFunde,
  systemPrompt, leseAnalyse, MAX_TEXT, type Fund,
} from '@/lib/ausschreibung';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TED_URL = 'https://api.ted.europa.eu/v3/notices/search';
const MODELL = 'claude-haiku-4-5';

function fehler(meldung: string, status = 400) {
  return NextResponse.json({ ok: false, error: meldung }, { status });
}

async function ted(query: string, felder: string[]): Promise<Response> {
  return fetch(TED_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, fields: felder, limit: 100, scope: 'ACTIVE' }),
    signal: AbortSignal.timeout(25_000),
  });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fehler('Ungültige Anfrage.'); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fehler('Nicht eingeloggt.', 401);
  const heute = heuteIso(new Date());

  if (body.modus === 'suche') {
    const profil = leseProfil(body.profil);
    const query = tedAbfrage(profil, heute);
    if (!query) return fehler('Bitte mindestens ein Stichwort oder eine Leistungsgruppe (CPV) angeben.');
    try {
      // Erst mit Zusatzfeldern; lehnt TED ein Feld ab (400), ohne sie erneut.
      let res = await ted(query, [...TED_FELDER, ...TED_FELDER_EXTRA]);
      if (res.status === 400) res = await ted(query, TED_FELDER);
      if (res.status === 429) return fehler('Die EU-Ausschreibungsdatenbank bremst gerade — bitte in ein paar Minuten erneut.', 502);
      if (!res.ok) return fehler(`Die EU-Ausschreibungsdatenbank antwortet nicht (${res.status}).`, 502);
      const data = await res.json();
      const roh: unknown[] = Array.isArray(data?.notices) ? data.notices : [];
      const funde = sortiereFunde(roh.map((n) => leseTedFund(n, profil.region)).filter((f): f is Fund => !!f));
      try {
        await supabase.from('ausschreibung_profil').upsert({
          owner_user_id: user.id, suchwoerter: profil.suchwoerter, cpv: profil.cpv, region: profil.region,
          tage: profil.tage, letzte_suche_am: new Date().toISOString(), aktualisiert_am: new Date().toISOString(),
        });
      } catch { /* Profil speichern ist best effort */ }
      return NextResponse.json({ ok: true, funde, abfrage: query, gesamt: Number(data?.totalNoticeCount) || funde.length });
    } catch {
      return fehler('Die EU-Ausschreibungsdatenbank ist gerade nicht erreichbar.', 502);
    }
  }

  if (body.modus === 'pruefen') {
    const text = String(body.text ?? '').slice(0, MAX_TEXT).trim();
    if (text.length < 80) return fehler('Bitte den Ausschreibungstext einfügen (Bekanntmachung oder Leistungsbeschreibung).');
    if (!process.env.ANTHROPIC_API_KEY) return fehler('Die KI ist derzeit nicht eingerichtet.', 500);
    const res = await kiFetch('ausschreibung-pruefen', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELL, max_tokens: 2500, system: systemPrompt(), messages: [{ role: 'user', content: `Heute ist der ${heute}.\n\nAusschreibungstext:\n"""\n${text}\n"""` }] }),
    });
    if (!res.ok) return fehler(res.status === 429 ? 'Gerade zu viele Anfragen — bitte in einer Minute erneut.' : 'Die KI hat nicht geantwortet.', 502);
    const data = await res.json();
    const bloecke: Array<{ type?: string; text?: string }> = Array.isArray(data?.content) ? data.content : [];
    const analyse = leseAnalyse(bloecke.filter((b) => b.type === 'text').map((b) => b.text || '').join(''), text, heute);
    return NextResponse.json({ ok: true, analyse });
  }

  return fehler('Unbekannter Modus.');
}
