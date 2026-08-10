// ============================================================================
// ARGONAUT OS · /api/oeffentlich/branchen-chat  (Branchen-KI-Dialog, 13.3)
// ÖFFENTLICH (login-frei). Beantwortet Besucherfragen auf den Branchen-Seiten:
// „Was kann ARGONAUT für [Branche]?" — gespeist aus den ECHTEN Branchen-Daten
// (Schmerzen, Ergebnisse, Module). Läuft über kiFetch (Kosten protokolliert,
// Haiku = günstig). Erfindet nichts, verweist auf Termin/Test.
// Missbrauchs-Schutz: gültige Branche nötig, Frage ≤500, Verlauf ≤6, max_tokens klein.
// AI-Act: klar als KI gekennzeichnet. Body: { slug, frage, verlauf? }.
// ============================================================================

import { NextResponse } from 'next/server';
import { kiFetch } from '@/lib/ki';
import { websiteBrancheBySlug } from '../../../vorschau/_lib/branchen-web';
import { baukastenFor } from '../../../vorschau/_lib/branchen-bausteine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VerlaufItem = { role?: string; text?: string };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug = (typeof body?.slug === 'string' ? body.slug : '').trim();
    const frage = (typeof body?.frage === 'string' ? body.frage : '').trim().slice(0, 500);
    const verlaufRoh: VerlaufItem[] = Array.isArray(body?.verlauf) ? body.verlauf : [];
    if (!slug || !frage) return NextResponse.json({ error: 'Bitte eine Frage stellen.' }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Der Berater ist gerade nicht verfügbar.' }, { status: 500 });

    const b = websiteBrancheBySlug(slug);
    if (!b) return NextResponse.json({ error: 'Branche nicht gefunden.' }, { status: 404 });

    const bau = baukastenFor(b.kategorie);
    const module = [...bau.stack, ...bau.spezial]
      .filter((m) => !/KI[- ]?Crew|Agent/i.test(m.name))
      .map((m) => m.name);

    const system = `Du bist ein freundlicher, ehrlicher KI-Berater von ARGONAUT OS — dem KI-Betriebssystem für den deutschen Mittelstand — für die Branche „${b.name}".

Womit ${b.name} typischerweise kämpfen:
${(b.schmerzen || []).map((s) => `- ${s}`).join('\n') || '- (keine Angabe)'}

Was ARGONAUT für ${b.name} erreicht:
${(b.ergebnisse || []).map((e) => `- ${e}`).join('\n') || '- (keine Angabe)'}

Module/Programme, die der Betrieb ab Tag 1 bekommt (ein System statt zwölf, ein Login):
${module.map((m) => `- ${m}`).join('\n')}

Preis-Anker: ab 499 €/Monat (SOLO, all-in), DSGVO-konform auf EU-Servern.

Regeln:
- Antworte KURZ (2–5 Sätze), hilfreich, auf Deutsch, in Sie-Ansprache.
- Bleib bei ARGONAUT und dieser Branche. ERFINDE KEINE Funktionen, Preise oder Zahlen — nutze nur die Angaben oben.
- Weißt du etwas nicht, sag es ehrlich und lade zu einem kostenlosen Erstgespräch (Termin) oder zum 7-Tage-Test ein.
- Schließe passende Antworten mit einer sanften Einladung zum Termin oder Test.
- Du bist eine KI-Assistenz.`;

    const messages = verlaufRoh
      .slice(-6)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: [{ type: 'text', text: String(m.text).slice(0, 800) }] }));
    messages.push({ role: 'user', content: [{ type: 'text', text: frage }] });

    const kiRes = await kiFetch('branchen-chat', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 400, system, messages }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error('branchen-chat Fehler:', kiRes.status, t.slice(0, 200));
      return NextResponse.json({ error: 'Der Berater ist gerade überlastet. Bitte kurz später erneut.' }, { status: 502 });
    }

    const kiData = await kiRes.json();
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(kiData.content) ? kiData.content : [];
    const antwort = blocks.filter((x) => x.type === 'text').map((x) => x.text || '').join('').trim();
    if (!antwort) return NextResponse.json({ error: 'Keine Antwort erhalten. Bitte erneut versuchen.' }, { status: 502 });

    return NextResponse.json({ antwort });
  } catch (e: unknown) {
    console.error('branchen-chat interner Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
