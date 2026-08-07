import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { seoPruefungSeite } from '@/lib/seoCheck';
import { kiFetch } from '@/lib/ki';

// ============================================================================
// ARGONAUT OS · app/api/marketing/seo/route.ts
// (Marketing-Ausbau · Punkt 6 — SEO-Modul für organische Google-Leads)
//
// Liest RLS-scoped die eigenen Webseiten (web_seiten) + die Firmendaten
// (web_ci) und prüft jede Seite mechanisch gegen die On-Page-SEO-Faktoren
// (lib/seoCheck). Zusätzlich schlägt die KI passende lokale Keywords vor
// (best effort, haiku) — für den Kunden UND den Betreiber.
// GET -> { ok, seiten, gesamtScore, keywords }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
type Row = Record<string, unknown>;

async function hole(sb: Sb, tabelle: string, spalten: string): Promise<Row[]> {
  try {
    const { data, error } = await sb.from(tabelle).select(spalten).limit(500);
    if (error) return [];
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const seitenRoh = await hole(supabase, 'web_seiten', 'titel, slug, status, oeffentlich_id, bloecke');

  // Firmendaten (web_ci) — eine Zeile je Betrieb, defensiv.
  let ci: Row = {};
  try {
    const { data } = await supabase
      .from('web_ci')
      .select('firma, slogan, ueber_uns, strasse, plz, ort, telefon, oeffnungszeiten, branche')
      .maybeSingle();
    if (data) ci = data as Row;
  } catch { ci = {}; }

  const seiten = seitenRoh.map((s) => {
    const erg = seoPruefungSeite(s, ci);
    return {
      slug: typeof s.slug === 'string' ? s.slug : '',
      oeffentlich_id: typeof s.oeffentlich_id === 'string' ? s.oeffentlich_id : null,
      status: typeof s.status === 'string' ? s.status : 'entwurf',
      ...erg,
    };
  }).sort((a, b) => a.score - b.score); // schwächste zuerst — da ist am meisten zu holen

  const gesamtScore = seiten.length
    ? Math.round(seiten.reduce((sum, s) => sum + s.score, 0) / seiten.length)
    : null;

  // KI-Keyword-Ideen (best effort — lokale Suchbegriffe).
  let keywords: string[] = [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const firma = typeof ci.firma === 'string' ? ci.firma : '';
  const branche = typeof ci.branche === 'string' ? ci.branche : '';
  const ort = typeof ci.ort === 'string' ? ci.ort : '';
  if (apiKey && (firma || branche || ort)) {
    try {
      const sys = 'Du bist ein SEO-Experte für lokale deutsche Mittelstandsbetriebe. Nenne konkrete Google-Suchbegriffe (Keywords), nach denen potenzielle Kunden suchen. Kurze, realistische Suchphrasen, gern mit Ort. Antworte AUSSCHLIESSLICH mit einem JSON-Array aus 8–12 Strings, ohne Erklärung, ohne Markdown.';
      const nutzer = `Betrieb: ${firma || 'unbekannt'} · Branche: ${branche || 'unbekannt'} · Ort: ${ort || 'unbekannt'}. Liefere lokale Keyword-Ideen.`;
      const kiRes = await kiFetch('marketing-seo-keywords', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 400, system: sys, messages: [{ role: 'user', content: [{ type: 'text', text: nutzer }] }] }),
      });
      if (kiRes.ok) {
        const d = await kiRes.json();
        const blocks: Array<{ type?: string; text?: string }> = Array.isArray(d.content) ? d.content : [];
        const roh = blocks.filter((x) => x.type === 'text').map((x) => x.text || '').join('').trim();
        const a = roh.indexOf('['); const b = roh.lastIndexOf(']');
        if (a >= 0 && b > a) {
          const arr = JSON.parse(roh.slice(a, b + 1));
          if (Array.isArray(arr)) keywords = arr.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, 12);
        }
      }
    } catch { /* Keywords optional */ }
  }

  return NextResponse.json({ ok: true, seiten, gesamtScore, keywords, hatFirmendaten: !!(firma || ort || branche) });
}
