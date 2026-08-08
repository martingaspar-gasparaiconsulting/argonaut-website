// ============================================================================
// ARGONAUT OS · /api/oeffentlich/chat  (Webshop · KI-Verkaufs-Chatbot)
// ÖFFENTLICH (login-frei). Beantwortet Besucherfragen im Shop — kennt die
// freigeschalteten Produkte (Name/Preis/Kurztext/Bestand) und den Betrieb.
// Inhaber sicher über oeffentlich_id aus web_seiten (status=live). Läuft über
// kiFetch (Kosten protokolliert, haiku). Erfindet keine Produkte/Preise.
// Missbrauchs-Schutz: Frage ≤500 Zeichen, Verlauf ≤8, max_tokens klein.
// AI-Act: der Bot ist im Widget klar als KI gekennzeichnet.
// Body: { seite, frage, verlauf?: [{role:'user'|'assistant', text}] }
// Antwort: { antwort } | { error }
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { kiFetch } from '@/lib/ki';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}
function eur(n: number): string {
  return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

type ArtikelRow = { bezeichnung: string | null; verkaufspreis: number | null; shop_beschreibung: string | null; aktueller_bestand: number | null };
type VerlaufItem = { role?: string; text?: string };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const seite = (typeof body?.seite === 'string' ? body.seite : '').trim();
    const frage = (typeof body?.frage === 'string' ? body.frage : '').trim().slice(0, 500);
    const verlaufRoh: VerlaufItem[] = Array.isArray(body?.verlauf) ? body.verlauf : [];
    if (!seite || !frage) return NextResponse.json({ error: 'Bitte eine Frage stellen.' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Der Berater ist gerade nicht verfügbar.' }, { status: 500 });

    const db = admin();
    const { data: s } = await db.from('web_seiten').select('owner_user_id, status').eq('oeffentlich_id', seite).maybeSingle();
    const inh = s as { owner_user_id?: string; status?: string } | null;
    if (!inh || inh.status !== 'live' || !inh.owner_user_id) {
      return NextResponse.json({ error: 'Der Berater ist auf dieser Seite nicht aktiv.' }, { status: 404 });
    }
    const ownerId = inh.owner_user_id;

    const { data: ciRow } = await db.from('web_ci').select('firma, slogan, ueber_uns').eq('owner_user_id', ownerId).maybeSingle();
    const ci = ciRow as { firma?: string; slogan?: string; ueber_uns?: string } | null;
    const firma = (ci?.firma || 'unser Betrieb').toString().trim();

    const { data: artD } = await db
      .from('artikel')
      .select('bezeichnung, verkaufspreis, shop_beschreibung, aktueller_bestand')
      .eq('owner_user_id', ownerId).eq('im_shop', true)
      .order('bezeichnung', { ascending: true }).limit(40);
    const artikel = (artD as ArtikelRow[]) ?? [];

    const produktText = artikel.length
      ? artikel.map((a) => {
          const b = (a.bezeichnung || 'Produkt').toString();
          const p = Number(a.verkaufspreis) > 0 ? eur(Number(a.verkaufspreis)) : 'Preis auf Anfrage';
          const kurz = (a.shop_beschreibung || '').toString().replace(/\s+/g, ' ').slice(0, 140);
          const best = a.aktueller_bestand == null ? '' : `, Bestand ${a.aktueller_bestand}`;
          return `- ${b} — ${p}${best}${kurz ? ' — ' + kurz : ''}`;
        }).join('\n')
      : '(zurzeit keine Produkte im Shop hinterlegt)';

    const kontext = [ci?.slogan, ci?.ueber_uns].filter(Boolean).map((x) => String(x).slice(0, 300)).join(' ');

    const system = `Du bist ein freundlicher, ehrlicher Verkaufsberater im Onlineshop von ${firma}.${kontext ? ' Über den Betrieb: ' + kontext : ''}

Diese Produkte sind im Shop (Name — Preis — Bestand — Kurzinfo):
${produktText}

Regeln:
- Antworte KURZ und hilfreich, auf Deutsch, Sie-Ansprache.
- Empfiehl passende Produkte AUS DER LISTE mit Preis. ERFINDE KEINE Produkte, Preise oder Eigenschaften.
- Weißt du etwas nicht oder ist es nicht im Shop, sag es ehrlich und verweise freundlich auf das Kontaktformular der Seite.
- Du bist eine KI-Assistenz.`;

    // Verlauf (max. letzte 8) + aktuelle Frage in Anthropic-Nachrichten wandeln.
    const messages = verlaufRoh
      .slice(-8)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: [{ type: 'text', text: String(m.text).slice(0, 800) }] }));
    messages.push({ role: 'user', content: [{ type: 'text', text: frage }] });

    const kiRes = await kiFetch('oeffentlich-chat', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 500, system, messages }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error('oeffentlich/chat Fehler:', kiRes.status, t.slice(0, 200));
      return NextResponse.json({ error: 'Der Berater ist gerade überlastet. Bitte kurz später erneut.' }, { status: 502 });
    }

    const kiData = await kiRes.json();
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(kiData.content) ? kiData.content : [];
    const antwort = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
    if (!antwort) return NextResponse.json({ error: 'Keine Antwort erhalten. Bitte erneut versuchen.' }, { status: 502 });

    return NextResponse.json({ antwort });
  } catch (e: unknown) {
    console.error('oeffentlich/chat interner Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
