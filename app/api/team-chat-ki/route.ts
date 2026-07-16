import { kiFetch } from '@/lib/ki'
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// ARGONAUT OS · BLOCK 13 · TC3 — Team-Chat KI-Antwort (@ARGONAUT)
// Holt eine Antwort von ARGONAUT in den Kanal. Kein Versand nach aussen.
// Branding-Guardrail: identifiziert sich ausschliesslich als ARGONAUT.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs';

type VerlaufItem = { ist_ki: boolean; absender_name: string; text: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      frage?: string;
      verlauf?: VerlaufItem[];
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ fehler: 'API-Schlüssel fehlt.' }, { status: 500 });
    }

    const echteFrage = (body.frage || '').trim();
    if (!echteFrage) {
      return NextResponse.json({ fehler: 'Keine Frage übergeben.' }, { status: 400 });
    }

    const verlaufText = Array.isArray(body.verlauf)
      ? body.verlauf
          .map((m) => (m.ist_ki ? 'ARGONAUT' : m.absender_name) + ': ' + m.text)
          .join('\n')
      : '';

    const systemPrompt =
      'Du bist ARGONAUT, der eingebaute KI-Assistent im Team-Chat eines Unternehmens. ' +
      'Antworte immer auf Deutsch, hilfsbereit, sachlich und so knapp wie möglich. ' +
      'Du bist Teil des Teams und sprichst kollegial und freundlich. ' +
      'Nenne dich ausschließlich ARGONAUT. Erwähne niemals, dass du auf einem Modell ' +
      'eines Drittanbieters basierst, und nenne niemals Hersteller- oder Produktnamen ' +
      'anderer KI-Anbieter. Wenn dir Informationen fehlen, sage das ehrlich, statt zu raten.';

    const userInhalt =
      (verlaufText ? 'Bisheriger Chat-Verlauf:\n' + verlaufText + '\n\n' : '') +
      'Frage an dich (ARGONAUT):\n' + echteFrage;

    const res = await kiFetch("team-chat-ki", {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userInhalt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { fehler: 'ARGONAUT ist gerade nicht erreichbar.' },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text =
      Array.isArray(data?.content) && data.content[0]?.type === 'text'
        ? String(data.content[0].text || '').trim()
        : '';

    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ fehler: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
