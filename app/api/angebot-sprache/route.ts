// ============================================================================
// ARGONAUT OS · app/api/angebot-sprache/route.ts — Angebot per Sprache/Foto (G01)
//
// GEMEINSAM freigegeben 24.09.2026. Kern-Geld-Formular: diese Route LIEST nur
// und SCHLÄGT VOR. Sie speichert nichts, verschickt nichts und rechnet keine
// Summen — das macht weiterhin die Angebotsseite.
//
//   POST { text?: string, base64?: string, mediaType?: string }
//     -> { ok, titel, positionen[], hinweise[] }
//
// Preise NUR aus dem Leistungskatalog oder aus einem belegten Dokument
// (lib/angebotSprache.ts, getestet). Sonst bleibt der Preis leer.
// Modell: Sonnet 5 — hier geht es um Geld, Genauigkeit vor Preis.
// Läuft durch kiFetch (Firmen-Topf, Minuten-Bremse, Kosten-Protokoll).
// ============================================================================
import { NextResponse } from 'next/server';
import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { systemPrompt, nutzerPrompt, lesePositionen, type KatalogZeile, type DokAuszug } from '@/lib/angebotSprache';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODELL = 'claude-sonnet-5';
const BILDARTEN = ['image/jpeg', 'image/png', 'image/webp'];
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

  const text = String(body.text ?? '').trim().slice(0, 6000);
  const base64 = typeof body.base64 === 'string' ? body.base64 : '';
  const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';
  if (!text && !base64) return fehler('Bitte die Arbeiten beschreiben oder ein Foto wählen.');
  if (base64) {
    if (base64.length > MAX_BASE64) return fehler('Das Foto ist zu groß.');
    if (!BILDARTEN.includes(mediaType)) return fehler('Bitte ein Foto (JPG, PNG oder WebP) wählen.');
  }

  // --- Leistungskatalog (RLS scopt auf den eigenen Betrieb) -----------------
  let katalog: KatalogZeile[] = [];
  try {
    const { data } = await supabase.from('leistungskatalog').select('*').limit(500);
    katalog = ((data as KatalogZeile[]) ?? []).filter((k) => k && k.id);
  } catch { /* ohne Katalog geht es auch — dann bleiben Preise leer */ }

  // --- Eigene Preislisten (RAG), nur mit Text -------------------------------
  const auszuege: DokAuszug[] = [];
  if (text && process.env.VOYAGE_API_KEY) {
    try {
      const v = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.VOYAGE_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: [text], model: 'voyage-4-lite', input_type: 'query' }),
      });
      if (v.ok) {
        const vj = await v.json();
        const { data: chunks } = await supabase.rpc('match_document_chunks', {
          query_embedding: vj.data[0].embedding, match_user_id: user.id, match_count: 8, match_threshold: 0.15,
        });
        const liste = (chunks as Array<{ document_id: string; content: string }> | null) ?? [];
        if (liste.length) {
          const ids = [...new Set(liste.map((c) => c.document_id))];
          const { data: docs } = await supabase.from('documents').select('id, file_name').in('id', ids);
          const namen = new Map(((docs as Array<{ id: string; file_name: string }>) ?? []).map((d) => [d.id, d.file_name]));
          for (const c of liste) auszuege.push({ datei: namen.get(c.document_id) || 'Unbekannt', text: String(c.content || '') });
        }
      }
    } catch (e) {
      console.error('[angebot-sprache] Preislisten übersprungen:', e instanceof Error ? e.message : e);
    }
  }

  const nutzer = nutzerPrompt(text, katalog, auszuege);
  const content = base64
    ? [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }, { type: 'text', text: nutzer }]
    : nutzer;

  try {
    const res = await kiFetch('angebot-sprache', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELL, max_tokens: 3000, system: systemPrompt(), messages: [{ role: 'user', content }] }),
    });
    if (!res.ok) return fehler(res.status === 429 ? 'Zu viele KI-Anfragen — bitte kurz warten.' : 'Die Positionen konnten nicht erstellt werden.', 502);
    const data = await res.json();
    const bloecke: Array<{ type?: string; text?: string }> = Array.isArray(data?.content) ? data.content : [];
    const roh = bloecke.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
    const ausw = lesePositionen(roh, katalog, auszuege);
    if (!katalog.length) ausw.hinweise.push('Ihr Leistungskatalog ist leer — mit gepflegten Preisen dort füllt ARGONAUT die Preise künftig selbst.');
    return NextResponse.json({ ok: true, ...ausw });
  } catch (e) {
    console.error('[angebot-sprache]', e instanceof Error ? e.message : e);
    return fehler('Interner Fehler.', 500);
  }
}
