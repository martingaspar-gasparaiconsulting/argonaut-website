// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · E9 KI-Bestellvorschlag (API-Route)
// Nimmt Artikel unter Mindestbestand entgegen, lässt die ARGONAUT-KI
// eine sinnvolle Nachbestellmenge + kurze Begründung vorschlagen.
// Antwort: { vorschlaege: [{ id, vorschlag_menge, begruendung }] }
// ---------------------------------------------------------------------

export const runtime = "nodejs";

type ArtikelInput = {
  id: string;
  bezeichnung: string;
  einheit: string;
  aktueller_bestand: number;
  mindestbestand: number;
};

// Deterministischer Fallback, falls die KI nicht antwortet
function fallback(artikel: ArtikelInput[]) {
  return artikel.map((a) => {
    const min = Number(a.mindestbestand) || 0;
    const ist = Number(a.aktueller_bestand) || 0;
    const ziel = min > 0 ? min * 2 : Math.max(1, ist);
    const menge = Math.max(1, Math.ceil(ziel - ist));
    return {
      id: a.id,
      vorschlag_menge: menge,
      begruendung: "Auffüllen auf das Doppelte des Mindestbestands.",
    };
  });
}

export async function POST(req: Request) {
  let artikel: ArtikelInput[] = [];
  try {
    const body = await req.json();
    artikel = Array.isArray(body?.artikel) ? body.artikel : [];
  } catch {
    return Response.json({ vorschlaege: [] });
  }

  if (artikel.length === 0) {
    return Response.json({ vorschlaege: [] });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Ohne Key: deterministischer Fallback
    return Response.json({ vorschlaege: fallback(artikel) });
  }

  const liste = artikel
    .map(
      (a) =>
        `- id=${a.id} | ${a.bezeichnung} | Bestand: ${a.aktueller_bestand} ${a.einheit} | Mindestbestand: ${a.mindestbestand} ${a.einheit}`
    )
    .join("\n");

  const prompt = `Du bist der Einkaufs-Assistent von ARGONAUT OS. Folgende Artikel liegen auf oder unter ihrem Mindestbestand. Schlage pro Artikel eine sinnvolle Nachbestellmenge vor, sodass der Bestand wieder komfortabel über dem Mindestbestand liegt (Richtwert: etwa das Doppelte des Mindestbestands, kaufmännisch auf sinnvolle ganze Mengen gerundet).

Artikel:
${liste}

Antworte AUSSCHLIESSLICH mit einem JSON-Array, ohne Erklärtext, ohne Markdown. Format pro Eintrag:
{"id": "<id>", "vorschlag_menge": <ganze Zahl > 0>, "begruendung": "<kurze deutsche Begründung, max. 12 Wörter>"}`;

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
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return Response.json({ vorschlaege: fallback(artikel) });
    }

    const data = await res.json();
    const text: string =
      data?.content?.[0]?.text ?? data?.content?.[0]?.input ?? "";

    // JSON aus der Antwort extrahieren (robust gegen Markdown-Fences)
    const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = clean.indexOf("[");
    const ende = clean.lastIndexOf("]");
    if (start === -1 || ende === -1) {
      return Response.json({ vorschlaege: fallback(artikel) });
    }

    const parsed = JSON.parse(clean.slice(start, ende + 1));
    const gueltigeIds = new Set(artikel.map((a) => a.id));
    const vorschlaege = (Array.isArray(parsed) ? parsed : [])
      .filter((v: any) => v && gueltigeIds.has(v.id))
      .map((v: any) => ({
        id: String(v.id),
        vorschlag_menge: Math.max(1, Math.round(Number(v.vorschlag_menge) || 1)),
        begruendung:
          typeof v.begruendung === "string" ? v.begruendung.slice(0, 120) : "",
      }));

    if (vorschlaege.length === 0) {
      return Response.json({ vorschlaege: fallback(artikel) });
    }

    return Response.json({ vorschlaege });
  } catch {
    return Response.json({ vorschlaege: fallback(artikel) });
  }
}
