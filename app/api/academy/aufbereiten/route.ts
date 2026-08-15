import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { kiFetch } from '@/lib/ki';
import { pruefeText, zaehleWoerter } from '@/lib/academyText';

// ============================================================================
// ARGONAUT OS · /api/academy/aufbereiten
//
// Macht aus rohem Text einen brauchbaren Schulungstext: geglaettet,
// gegliedert, mit Zusammenfassung und Lernzielen. Untertitel und Zeitmarken
// entstehen daraus anschliessend in lib/academyText (ohne KI, rein gerechnet).
//
// WAS DIESE ROUTE NICHT KANN — und auch nicht vorgibt zu koennen:
// Sie hoert sich das Video nicht an. Die Anthropic-Schnittstelle nimmt Text
// und Bilder, keinen Ton. Wer den gesprochenen Text automatisch aus der
// Datei gewinnen will, braucht einen Transkriptionsdienst (Whisper,
// Deepgram o.ae.) — das ist eine Konto- und Kostenfrage. Der Andockpunkt
// dafuer waere genau hier: statt `rohtext` aus dem Formular kaeme er dann
// aus dem Dienst, der Rest der Kette bleibt unveraendert.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ZEICHEN = 24000;

const SYSTEM = `Du bereitest den Text einer betrieblichen Schulung auf. Der Text stammt aus einem Erklärvideo eines deutschen Handwerks- oder Mittelstandsbetriebs — oft abgetippt, mit Versprechern, Wiederholungen und Füllwörtern.

Deine Aufgabe: den Text so aufbereiten, dass er als Untertitel und zum Nachlesen taugt.

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück, ohne Vorrede und ohne Code-Zaun:

{
  "text": "der aufbereitete Fließtext",
  "zusammenfassung": "3 bis 5 Sätze, worum es geht",
  "lernziele": ["Was der Kollege danach kann", "..."],
  "kapitel": [{"titel": "Kurzer Kapitelname", "beginnt_mit": "die ersten Wörter des Kapitels aus dem aufbereiteten Text"}]
}

Regeln für "text":
- Sinn, Reihenfolge und Fachbegriffe bleiben EXAKT erhalten. Du fasst nicht zusammen und lässt nichts weg.
- Füllwörter ("äh", "also ja", "sozusagen"), Versprecher und doppelte Satzanfänge entfernst du.
- Du setzt Satzzeichen und teilst Bandwurmsätze in verständliche Sätze.
- Du ERFINDEST NICHTS. Keine Erklärung, kein Sicherheitshinweis, kein Schritt, der nicht im Original steht. Wenn eine Stelle unverständlich ist, übernimmst du sie so wörtlich wie möglich.
- Die Anrede bleibt wie im Original (meist "Sie" oder direktes Du unter Kollegen).
- Umgangssprache aus der Werkstatt darf bleiben, wenn sie den Sinn trägt.

Regeln für "lernziele": 2 bis 5 Stück, jeweils ein knapper Satz, beginnend mit einem Verb.
Regeln für "kapitel": 2 bis 6 Stück, nur wenn der Text lang genug ist; sonst leeres Array. "beginnt_mit" muss WÖRTLICH im aufbereiteten Text vorkommen.`;

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });

  let rohtext = '';
  let titel = '';
  let laenge = 0;
  try {
    const koerper = await req.json();
    rohtext = String(koerper?.text ?? '').trim();
    titel = String(koerper?.titel ?? '').trim();
    laenge = Number(koerper?.laenge_sekunden ?? 0) || 0;
  } catch {
    return NextResponse.json({ ok: false, error: 'Die Anfrage war unlesbar.' }, { status: 400 });
  }

  if (!rohtext) return NextResponse.json({ ok: false, error: 'Es wurde kein Text mitgeschickt.' }, { status: 400 });
  if (rohtext.length > MAX_ZEICHEN) {
    return NextResponse.json({
      ok: false,
      error: `Der Text ist länger als ${MAX_ZEICHEN} Zeichen. Bitte das Video in Kapitel teilen.`,
    }, { status: 400 });
  }

  const probe = pruefeText(rohtext, laenge);
  if (probe.fehler.length > 0) {
    return NextResponse.json({ ok: false, error: probe.fehler.join(' ') }, { status: 400 });
  }

  try {
    const kiRes = await kiFetch('academy-aufbereiten', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `Schulung: ${titel || 'ohne Titel'}${laenge > 0 ? `\nVideolänge: ${Math.round(laenge / 60)} Minuten` : ''}\n\nText:\n\n${rohtext}`,
        }],
      }),
    });

    if (kiRes.status === 429) {
      return NextResponse.json({ ok: false, error: 'Zu viele Anfragen in kurzer Zeit. Bitte einen Moment warten.' }, { status: 429 });
    }
    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error('Academy-Aufbereitung KI-Fehler:', t);
      return NextResponse.json({ ok: false, error: 'Die Aufbereitung ist fehlgeschlagen.' }, { status: 500 });
    }

    const daten = await kiRes.json();
    const bloecke: Array<{ type?: string; text?: string }> = Array.isArray(daten?.content) ? daten.content : [];
    const roh = bloecke.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();

    // Der Code-Zaun ist zwar verboten, kommt aber trotzdem manchmal — abfangen
    // statt daran zu scheitern.
    const ohneZaun = roh.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    let ergebnis: { text?: string; zusammenfassung?: string; lernziele?: string[]; kapitel?: Array<{ titel?: string; beginnt_mit?: string }> };
    try {
      ergebnis = JSON.parse(ohneZaun);
    } catch {
      // Lieber der Rohtext des Betriebs als gar nichts: die Untertitel
      // entstehen ohnehin daraus, die KI hat ihn nur glaetten sollen.
      return NextResponse.json({
        ok: true,
        text: rohtext,
        zusammenfassung: '',
        lernziele: [],
        kapitel: [],
        hinweis: 'Die Aufbereitung war nicht auswertbar — Ihr eingegebener Text wurde unverändert übernommen.',
      });
    }

    const aufbereitet = String(ergebnis.text ?? '').trim() || rohtext;

    // Sicherheitsnetz gegen ausufernde oder zusammengestrichene Ergebnisse:
    // der aufbereitete Text darf nicht die Haelfte verlieren oder sich verdoppeln.
    const vorher = zaehleWoerter(rohtext);
    const nachher = zaehleWoerter(aufbereitet);
    const verdaechtig = vorher > 30 && (nachher < vorher * 0.5 || nachher > vorher * 1.8);

    return NextResponse.json({
      ok: true,
      text: verdaechtig ? rohtext : aufbereitet,
      zusammenfassung: String(ergebnis.zusammenfassung ?? '').trim(),
      lernziele: Array.isArray(ergebnis.lernziele) ? ergebnis.lernziele.map((z) => String(z)).slice(0, 6) : [],
      kapitel: Array.isArray(ergebnis.kapitel)
        ? ergebnis.kapitel.map((k) => ({ titel: String(k?.titel ?? ''), beginnt_mit: String(k?.beginnt_mit ?? '') })).slice(0, 8)
        : [],
      hinweise: probe.hinweise,
      ...(verdaechtig ? { hinweis: 'Die Aufbereitung wich stark vom Original ab — Ihr eingegebener Text wurde unverändert übernommen.' } : {}),
    });
  } catch (err: unknown) {
    console.error('Academy-Aufbereitung:', err);
    return NextResponse.json({ ok: false, error: 'Die Aufbereitung ist fehlgeschlagen.' }, { status: 500 });
  }
}
