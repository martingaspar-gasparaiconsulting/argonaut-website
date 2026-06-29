// ============================================================
// ARGONAUT OS · HR/Personal — KI-Auswertung (echter Claude-Call)
// Empfängt NUR anonyme Eckdaten eines Mitarbeiters (keine Namen, keine
// Dokumente) und liefert eine kurze Einschätzung auf Deutsch zurück.
// Kein Supabase-/Service-Key-Zugriff nötig → minimale Angriffsfläche.
// Pfad: app/api/hr/ki-auswertung/route.ts
// ============================================================
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type SchulungEck = { kategorie: string; status: string; tageBis: number | null };
type Payload = {
  urlaubsanspruch: number;
  genommen: number;
  rest: number;
  krankTage: number;
  krankEintraege: number;
  wochenendNah: number;
  stammVollstaendig: boolean;
  schulungen: SchulungEck[];
};

type AnthropicBlock = { type: string; text?: string };

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'KI-Schlüssel ist serverseitig nicht hinterlegt.' }, { status: 500 });
    }

    const body = (await req.json()) as Partial<Payload>;
    const schulungen = Array.isArray(body.schulungen) ? body.schulungen : [];

    const schulText =
      schulungen.length === 0
        ? 'Keine Schulungen erfasst.'
        : schulungen
            .map((s) => {
              const t = s.tageBis;
              let frist = 'ohne Ablaufdatum';
              if (typeof t === 'number') frist = t < 0 ? `seit ${Math.abs(t)} Tagen abgelaufen` : `läuft in ${t} Tagen ab`;
              return `- ${s.kategorie} (Status: ${s.status}, ${frist})`;
            })
            .join('\n');

    const userText = [
      'Anonyme Eckdaten EINES Mitarbeiters (keine Namen):',
      `- Urlaubsanspruch: ${body.urlaubsanspruch ?? 0} Tage`,
      `- Bereits genehmigt genommen (laufendes Jahr): ${body.genommen ?? 0} Tage`,
      `- Resturlaub: ${body.rest ?? 0} Tage`,
      `- Krankheitstage (laufendes Jahr): ${body.krankTage ?? 0} Tage in ${body.krankEintraege ?? 0} Meldung(en), davon ${body.wochenendNah ?? 0} direkt an einem Wochenende (Mo-Beginn oder Fr-Ende)`,
      `- Stammdaten vollständig: ${body.stammVollstaendig ? 'ja' : 'nein'}`,
      '',
      'Schulungen:',
      schulText,
    ].join('\n');

    const system = `Du bist ein erfahrener Personalreferent und berätst einen kleinen Betrieb im deutschen Mittelstand. Du erhältst ausschließlich anonyme Eckdaten EINES Mitarbeiters (keine Namen, keine Dokumente).

Gib eine kurze, sachliche Einschätzung auf Deutsch:
- 3 bis 5 knappe Punkte, je ein Satz.
- Konkret und handlungsorientiert: Was sollte der Chef konkret tun?
- Priorisiere rechtlich/haftungsrelevante Themen zuerst (abgelaufene Pflicht-Schulungen, drohender Urlaubsverfall, fehlende Stammdaten).
- Auffällige Krankheitsmuster strikt sachlich-neutral formulieren — KEINE Verdächtigungen, kein Vorwurf, höchstens "im Blick behalten".
- Wenn alles in Ordnung ist, sage das klar und kurz.
- Keine Einleitung, keine Anrede, keine Schlussfloskel. Beginne direkt mit den Punkten und nutze "•" als Aufzählungszeichen.`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: userText }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return NextResponse.json(
        { error: `KI-Dienst nicht erreichbar (Status ${resp.status}).`, detail: detail.slice(0, 300) },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as { content?: AnthropicBlock[] };
    const text = Array.isArray(data.content)
      ? data.content
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text as string)
          .join('\n')
          .trim()
      : '';

    return NextResponse.json({ auswertung: text || 'Es wurde keine Einschätzung erzeugt.' });
  } catch {
    return NextResponse.json({ error: 'Unerwarteter Fehler bei der KI-Auswertung.' }, { status: 500 });
  }
}
