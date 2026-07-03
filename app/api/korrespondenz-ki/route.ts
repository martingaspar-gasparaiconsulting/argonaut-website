// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 12 · K4 KI-Brief-Assistent (API-Route)
// Formuliert aus Stichworten einen Geschäftsbrief-ENTWURF (kein Versand).
// Passt Ton/Struktur an die Brief-Art an. Gibt reinen Brieftext zurück.
// ---------------------------------------------------------------------

export const runtime = "nodejs";

type BriefInput = {
  brief_art?: string;
  betreff?: string;
  empfaenger_name?: string;
  stichworte?: string;
  absender_name?: string;
};

const ART_HINWEIS: Record<string, string> = {
  anschreiben:
    "ein allgemeines geschäftliches Anschreiben. Freundlich, klar, lösungsorientiert.",
  angebot:
    "ein Begleitschreiben zu einem Angebot. Wecke Interesse, betone den Nutzen, lade zur Rückmeldung ein. (Konkrete Preise/Positionen NICHT erfinden — dafür Platzhalter.)",
  mahnung:
    "eine höfliche, aber bestimmte Zahlungserinnerung / Mahnung. Sachlich, freundlich im Ton, klar in der Sache. Nenne Zahlungsziel als Platzhalter, falls nicht angegeben.",
  kuendigung:
    "ein sachliches Kündigungsschreiben. Höflich, eindeutig, mit Bitte um schriftliche Bestätigung.",
  allgemein: "ein professioneller Geschäftsbrief. Sachlich und höflich.",
};

export async function POST(req: Request) {
  let b: BriefInput = {};
  try {
    const body = await req.json();
    b = (body?.brief ?? {}) as BriefInput;
  } catch {
    return Response.json({ text: "", fehler: "Ungültige Anfrage." });
  }

  if (!b.stichworte || !b.stichworte.trim()) {
    return Response.json({
      text: "",
      fehler: "Bitte ein paar Stichworte zum Inhalt angeben.",
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({
      text: "",
      fehler: "KI derzeit nicht verfügbar (kein API-Key konfiguriert).",
    });
  }

  const artHinweis =
    ART_HINWEIS[b.brief_art ?? "allgemein"] ?? ART_HINWEIS.allgemein;

  const prompt = `Du bist ARGONAUT, der Schreibassistent eines mittelständischen Unternehmens. Formuliere auf Deutsch den FLIESSTEXT eines Geschäftsbriefs. Es soll ${artHinweis}

Kontext:
- Brief-Art: ${b.brief_art ?? "allgemein"}
- Betreff: ${b.betreff ?? "—"}
- Empfänger: ${b.empfaenger_name ?? "der Empfänger"}
- Stichworte / Inhalt des Anliegens: ${b.stichworte}

Anforderungen:
- Beginne mit einer passenden Anrede (nutze den Empfängernamen, falls sinnvoll, sonst "Sehr geehrte Damen und Herren").
- Formuliere einen vollständigen, gut lesbaren Fließtext in ganzen Sätzen und sinnvollen Absätzen.
- Schließe mit einer höflichen Grußformel und den Platzhaltern [Ihr Name] und ggf. [Unternehmen] ab.
- Wo konkrete Fakten fehlen (Beträge, Daten, Fristen, Nummern), nutze neutrale Platzhalter in eckigen Klammern (z.B. [Rechnungsnummer], [Betrag], [Zahlungsziel]). Erfinde KEINE Fakten.
- Ton passend zur Brief-Art, professionell und angemessen.
- WICHTIG: Nenne dich im Text niemals "Claude" oder "KI" — der Brief kommt vom Unternehmen selbst.
- Gib NUR den Brief-Fließtext aus (KEINE Betreffzeile, KEINE Absender-/Empfängeradresse, KEINE Erklärungen davor oder danach).`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return Response.json({
        text: "",
        fehler:
          "Die KI konnte den Brief nicht formulieren. Bitte erneut versuchen.",
      });
    }

    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    if (!text.trim()) {
      return Response.json({
        text: "",
        fehler: "Leere Antwort erhalten. Bitte erneut versuchen.",
      });
    }
    return Response.json({ text: text.trim() });
  } catch {
    return Response.json({
      text: "",
      fehler: "Verbindungsfehler zur KI. Bitte erneut versuchen.",
    });
  }
}
