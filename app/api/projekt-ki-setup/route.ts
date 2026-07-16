import { kiFetch } from '@/lib/ki'
import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · MODUL PROJEKTE · P9 — KI-Projekt-Setup
// Beschreibung rein -> Claude erzeugt Projekt + Aufgabenliste (JSON).
// Vorschlags-Prinzip: Frontend zeigt editierbar, Nutzer gibt frei.
// ============================================================

const ERLAUBTE_STATUS = ['todo', 'in_arbeit', 'review', 'fertig'];
const ERLAUBTE_PRIO = ['niedrig', 'normal', 'hoch', 'dringend'];

const SYSTEM_PROMPT = `Du bist der Projekt-Setup-Assistent von ARGONAUT OS, einem Betriebssystem für den deutschen Mittelstand (Handwerk, Bau, Dienstleistung).

Aus einer kurzen Projektbeschreibung des Unternehmers erstellst du einen sinnvollen, praxisnahen Projektplan.

Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt, ohne Markdown, ohne Backticks, ohne Erklärung davor oder danach. Struktur exakt so:

{
  "name": "Kurzer, prägnanter Projektname",
  "beschreibung": "1-2 Sätze, worum es geht",
  "prioritaet": "niedrig|normal|hoch|dringend",
  "aufgaben": [
    { "titel": "Konkrete Aufgabe", "status": "todo|in_arbeit|review|fertig", "prioritaet": "niedrig|normal|hoch|dringend" }
  ]
}

Regeln:
- 5 bis 12 Aufgaben, in sinnvoller Reihenfolge (Vorbereitung -> Durchführung -> Abschluss).
- Aufgaben-Titel kurz und handwerklich konkret (z.B. "Material bestellen", "Baustelle einrichten", "Abnahme mit Kunde").
- Fast alle Aufgaben starten im Status "todo". Nur falls die Beschreibung klar sagt, dass etwas schon läuft/erledigt ist, anderen Status setzen.
- Priorität der einzelnen Aufgaben überlegt vergeben (kritische/zeitkritische Schritte "hoch").
- Sprache: Deutsch. Keine erfundenen Termine, Preise oder Namen.
- Wenn die Beschreibung zu vage ist, triff sinnvolle, branchenübliche Standard-Annahmen.`;

export async function POST(req: NextRequest) {
  try {
    const { beschreibung } = await req.json();
    if (!beschreibung || typeof beschreibung !== 'string' || beschreibung.trim().length < 3) {
      return NextResponse.json({ error: 'Bitte eine Projektbeschreibung angeben.' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'KI-Dienst nicht konfiguriert (kein API-Key).' }, { status: 500 });
    }

    const resp = await kiFetch("projekt-ki-setup", {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Projektbeschreibung:\n${beschreibung.trim()}` },
        ],
      }),
    });

    if (!resp.ok) {
      const fehlerText = await resp.text();
      console.error('KI-Projekt-Setup Claude Fehler:', resp.status, fehlerText.slice(0, 300));
      return NextResponse.json({ error: 'KI-Anfrage fehlgeschlagen. Bitte erneut versuchen.' }, { status: 502 });
    }

    const data = await resp.json();
    const textBlock = Array.isArray(data?.content)
      ? data.content.find((c: any) => c.type === 'text')?.text
      : '';
    if (!textBlock) {
      return NextResponse.json({ error: 'Leere Antwort von der KI.' }, { status: 502 });
    }

    // JSON robust extrahieren (falls doch Text drumherum kommt)
    let roh = String(textBlock).trim();
    const start = roh.indexOf('{');
    const ende = roh.lastIndexOf('}');
    if (start >= 0 && ende > start) roh = roh.slice(start, ende + 1);

    let vorschlag: any;
    try {
      vorschlag = JSON.parse(roh);
    } catch {
      console.error('KI-Projekt-Setup JSON-Parse-Fehler:', roh.slice(0, 200));
      return NextResponse.json({ error: 'KI-Antwort konnte nicht gelesen werden. Bitte erneut versuchen.' }, { status: 502 });
    }

    // Saeubern + absichern
    const name = String(vorschlag.name || '').trim().slice(0, 120) || 'Neues Projekt';
    const projektBeschreibung = String(vorschlag.beschreibung || '').trim().slice(0, 500);
    const prioritaet = ERLAUBTE_PRIO.includes(vorschlag.prioritaet) ? vorschlag.prioritaet : 'normal';
    const aufgabenRoh = Array.isArray(vorschlag.aufgaben) ? vorschlag.aufgaben : [];
    const aufgaben = aufgabenRoh
      .filter((a: any) => a && typeof a.titel === 'string' && a.titel.trim())
      .slice(0, 20)
      .map((a: any) => ({
        titel: String(a.titel).trim().slice(0, 200),
        status: ERLAUBTE_STATUS.includes(a.status) ? a.status : 'todo',
        prioritaet: ERLAUBTE_PRIO.includes(a.prioritaet) ? a.prioritaet : 'normal',
      }));

    return NextResponse.json({ name, beschreibung: projektBeschreibung, prioritaet, aufgaben });
  } catch (e: any) {
    console.error('KI-Projekt-Setup Fehler:', e?.message || e);
    return NextResponse.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
