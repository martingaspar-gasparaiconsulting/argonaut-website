import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · Webshop · app/api/shop-produkt-text/route.ts
// Schreibt aus den ECHTEN Artikeldaten (Name/Kategorie/Preis/Einheit) einen
// kurzen, verkaufsfördernden Produkttext für den Shop. Nur eingeloggt, über
// kiFetch (Kosten protokolliert), Modell claude-haiku-4-5. Erfindet keine Fakten.
// Emoji-Schalter je Branche: seriös (ohne) oder lebendig (mit Emojis).
// Body: { bezeichnung, kategorie?, verkaufspreis?, einheit?, emoji?, branche? }
// Antwort: { text } | { error }
// ============================================================

export const runtime = 'nodejs';

const SYSTEM_BASE = `Du bist Verkaufstexter für Onlineshops deutscher Mittelstands-Betriebe. Du schreibst eine kurze, verkaufsfördernde Produktbeschreibung.
Regeln:
- Sprache: Deutsch, Sie-Ansprache, konkret und überzeugend, aber ehrlich.
- Nutze NUR die gegebenen Angaben. ERFINDE KEINE Fakten: keine Maße, Materialien, Mengen, Herkunft, Auszeichnungen, Garantien oder Eigenschaften, die nicht ausdrücklich genannt sind.
- 2 bis 4 Sätze. Betone Nutzen und Gefühl, nicht nur Aufzählung.
- Gib AUSSCHLIESSLICH den Beschreibungstext zurück — keine Überschrift, keine Anführungszeichen, kein Markdown.`;

function eur(n: number): string {
  return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const bezeichnung = (typeof body?.bezeichnung === 'string' ? body.bezeichnung : '').trim();
    const kategorie = (typeof body?.kategorie === 'string' ? body.kategorie : '').trim();
    const einheit = (typeof body?.einheit === 'string' ? body.einheit : '').trim();
    const branche = (typeof body?.branche === 'string' ? body.branche : '').trim();
    const preis = Number(body?.verkaufspreis);
    const emoji = body?.emoji === true;
    if (!bezeichnung) return NextResponse.json({ error: 'Kein Artikel übergeben.' }, { status: 400 });
    if (bezeichnung.length > 300) return NextResponse.json({ error: 'Name ist zu lang.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'KI nicht konfiguriert.' }, { status: 500 });

    const daten = [
      `Produktname: ${bezeichnung}`,
      kategorie ? `Kategorie/Branche: ${kategorie}` : '',
      branche && branche !== kategorie ? `Branche: ${branche}` : '',
      Number.isFinite(preis) && preis > 0 ? `Preis: ${eur(preis)}${einheit ? ' pro ' + einheit : ''}` : '',
      einheit && !(Number.isFinite(preis) && preis > 0) ? `Einheit: ${einheit}` : '',
    ].filter(Boolean).join('\n');

    const tonReg = emoji
      ? '- Ton: lebendig und einladend. Setze 1 bis 3 passende, dezente Emojis ein (branchenüblich), ohne zu übertreiben.'
      : '- Ton: sachlich-seriös. Verwende KEINE Emojis.';
    const system = SYSTEM_BASE + '\n' + tonReg;

    const kiRes = await kiFetch('shop-produkt-text', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: `Schreibe die Produktbeschreibung aus diesen Angaben:\n${daten}` }] }],
      }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error('shop-produkt-text Fehler:', kiRes.status, t.slice(0, 200));
      return NextResponse.json({ error: 'Die KI ist gerade nicht erreichbar. Bitte kurz später erneut.' }, { status: 502 });
    }

    const kiData = await kiRes.json();
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(kiData.content) ? kiData.content : [];
    const ergebnis = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
    if (!ergebnis) return NextResponse.json({ error: 'Die KI hat keinen Text geliefert. Bitte erneut versuchen.' }, { status: 502 });

    return NextResponse.json({ text: ergebnis.slice(0, 600) });
  } catch (e: unknown) {
    console.error('shop-produkt-text interner Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
