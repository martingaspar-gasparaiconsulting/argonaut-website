import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · Website-Bauer · app/api/webseite-text-ki/route.ts
// Überarbeitet EINEN Text-Abschnitt des Website-Bauers per KI (verbessern /
// kürzen / umschreiben / ausführlicher). Nur eingeloggt. Läuft über kiFetch
// (Kosten protokolliert), Modell claude-haiku-4-5. Erfindet keine Fakten.
// Body: { text: string, modus?: 'verbessern'|'kuerzen'|'umschreiben'|'laenger' }
// Antwort: { text } | { error }
// ============================================================

export const runtime = 'nodejs';

const MODI: Record<string, string> = {
  verbessern: 'Verbessere den Text sprachlich: klar, überzeugend und fehlerfrei. Inhalt und Länge etwa gleich lassen.',
  kuerzen: 'Kürze den Text auf das Wesentliche, ohne wichtige Aussagen zu verlieren.',
  umschreiben: 'Schreibe den Text frisch um — gleiche Aussage, neue Formulierung.',
  laenger: 'Formuliere den Text etwas ausführlicher und konkreter, ohne Fakten zu erfinden.',
};

const SYSTEM = `Du bist Texter für Webseiten deutscher Mittelstands-Betriebe. Du überarbeitest einen einzelnen Text-Abschnitt.
Regeln:
- Sprache: Deutsch, Sie-Ansprache, warm und überzeugend, aber ehrlich.
- ERFINDE KEINE Fakten: keine Preise, Zahlen, Auszeichnungen, Namen oder Referenzen, die nicht im Text stehen.
- Gib AUSSCHLIESSLICH den überarbeiteten Text zurück — keine Anführungszeichen, keine Erklärung, kein Markdown.`;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = (typeof body?.text === 'string' ? body.text : '').trim();
    const modusKey = typeof body?.modus === 'string' ? body.modus : 'verbessern';
    const auftrag = MODI[modusKey] || MODI.verbessern;
    if (!text) return NextResponse.json({ error: 'Kein Text übergeben.' }, { status: 400 });
    if (text.length > 4000) return NextResponse.json({ error: 'Text ist zu lang (max. 4000 Zeichen).' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'KI nicht konfiguriert.' }, { status: 500 });

    const nutzer = `Aufgabe: ${auftrag}\n\nText:\n${text}`;
    const kiRes = await kiFetch('webseite-text-ki', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: nutzer }] }],
      }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error('webseite-text-ki Fehler:', kiRes.status, t.slice(0, 200));
      return NextResponse.json({ error: 'Die KI ist gerade nicht erreichbar. Bitte kurz später erneut.' }, { status: 502 });
    }

    const kiData = await kiRes.json();
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(kiData.content) ? kiData.content : [];
    const ergebnis = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
    if (!ergebnis) {
      return NextResponse.json({ error: 'Die KI hat keinen Text geliefert. Bitte erneut versuchen.' }, { status: 502 });
    }
    return NextResponse.json({ text: ergebnis });
  } catch (e: unknown) {
    console.error('webseite-text-ki interner Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
