// ============================================================
// ARGONAUT OS · HR/Personal — KI-Auswertung (echter Claude-Call)
// Empfängt NUR anonyme Eckdaten eines Mitarbeiters (keine Namen, keine
// Dokumente) und liefert eine kurze Einschätzung auf Deutsch zurück.
// Kein Supabase-/Service-Key-Zugriff nötig → minimale Angriffsfläche.
// Pfad: app/api/hr/ki-auswertung/route.ts
// ============================================================
import { nurAngemeldet } from '@/lib/nurAngemeldet';
import { kiFetch } from '@/lib/ki'
import { NextRequest, NextResponse } from 'next/server';
import { modellFuer as kiModell } from '@/lib/kiModelle';

export const runtime = 'nodejs';

function zahlOder0(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0;
}

/** Ohne KI: ab mehr als 6 Wochen (30 Arbeitstage) im Jahr ist ein BEM anzubieten (§ 167 Abs. 2 SGB IX). */
function bemHinweis(krankTage: unknown): string {
  return zahlOder0(krankTage) > 30
    ? '• Mehr als sechs Wochen Arbeitsunfähigkeit in zwölf Monaten: Betriebliches Eingliederungsmanagement anbieten (§ 167 Abs. 2 SGB IX) — Einladung schriftlich, Teilnahme freiwillig.'
    : '';
}

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
  // Paket S0: nur mit Login — interne Arbeit wird nie von außen angestoßen.
  const absage = await nurAngemeldet();
  if (absage) return absage;
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

    // Paket 176 (Befund H12): KEINE Krankheitsdaten an die KI. Krankheitstage und
    // erst recht „Muster" (Krankmeldungen am Wochenende) sind Gesundheitsdaten
    // (Art. 9 DSGVO) und Verhaltensauswertung (§ 26 BDSG, KI-VO Anhang III Nr. 4).
    // Der einzige Hinweis dazu — Eingliederungsmanagement ab 6 Wochen — wird
    // unten OHNE KI aus der Zahl gebildet.
    const userText = [
      'Anonyme Eckdaten EINES Mitarbeiters (keine Namen):',
      `- Urlaubsanspruch: ${zahlOder0(body.urlaubsanspruch)} Tage`,
      `- Bereits genehmigt genommen (laufendes Jahr): ${zahlOder0(body.genommen)} Tage`,
      `- Resturlaub: ${zahlOder0(body.rest)} Tage`,
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
- Zu Krankheit und Fehlzeiten erhältst du bewusst KEINE Angaben — äußere dich dazu nicht.
- Wenn alles in Ordnung ist, sage das klar und kurz.
- Keine Einleitung, keine Anrede, keine Schlussfloskel. Beginne direkt mit den Punkten und nutze "•" als Aufzählungszeichen.`;

    const resp = await kiFetch("hr/ki-auswertung", {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: kiModell('hr.auswertung'),
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

    const bem = bemHinweis(body.krankTage);
    const auswertung = [text || 'Es wurde keine Einschätzung erzeugt.', bem].filter(Boolean).join('\n');
    return NextResponse.json({ auswertung });
  } catch {
    return NextResponse.json({ error: 'Unerwarteter Fehler bei der KI-Auswertung.' }, { status: 500 });
  }
}
