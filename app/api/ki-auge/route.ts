// app/api/ki-auge/route.ts
// ---------------------------------------------------------------------
// ARGONAUT OS · KI-AUGE · eigene Route (unabhängig von /api/ki-klartext)
// Nimmt { modul, kontext } → fragt die KI, was für den Chef JETZT wichtig
// ist → gibt { ok, klartext, punkte[], stimmung } zurück.
//
// Muster identisch zu den übrigen KI-Routen im System:
//  - direkter fetch an Anthropic (kein SDK)
//  - Modell claude-sonnet-4-5, runtime nodejs
//  - robuste JSON-Extraktion (Text vor/nach dem JSON wird toleriert)
// ---------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AugeAntwort = {
  klartext: string;
  punkte: string[];
  stimmung: "gut" | "neutral" | "achtung";
};

function extrahiereJson(text: string): AugeAntwort | null {
  // Findet das erste {...}-Objekt, auch wenn Text drumherum steht.
  const start = text.indexOf("{");
  const ende = text.lastIndexOf("}");
  if (start === -1 || ende === -1 || ende <= start) return null;
  const roh = text.slice(start, ende + 1);
  try {
    const obj = JSON.parse(roh);
    const klartext = typeof obj.klartext === "string" ? obj.klartext : "";
    const punkte = Array.isArray(obj.punkte)
      ? obj.punkte.filter((p: unknown) => typeof p === "string").slice(0, 6)
      : [];
    const stimmung: AugeAntwort["stimmung"] =
      obj.stimmung === "gut" || obj.stimmung === "achtung"
        ? obj.stimmung
        : "neutral";
    if (!klartext && punkte.length === 0) return null;
    return { klartext, punkte, stimmung };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const modul: string = (body?.modul || "").toString().trim();
    const kontext: string = (body?.kontext || "").toString().trim();

    if (!kontext) {
      return Response.json(
        { ok: false, error: "Kein Kontext übergeben." },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { ok: false, error: "KI ist derzeit nicht konfiguriert." },
        { status: 500 }
      );
    }

    const system = [
      "Du bist das wachende Auge von ARGONAUT OS, dem KI-Betriebssystem für",
      "den deutschen Mittelstand. Ein Unternehmer öffnet gerade eine Übersicht",
      "und will in EINEM Blick wissen, was er JETZT tun sollte.",
      "",
      "Regeln:",
      "- Antworte NUR mit gültigem JSON, kein Text davor/danach.",
      "- Schema: {\"klartext\": string, \"punkte\": string[], \"stimmung\": \"gut\"|\"neutral\"|\"achtung\"}.",
      "- 'klartext': 1 kurzer Satz, was insgesamt Sache ist (max ~20 Wörter).",
      "- 'punkte': 2-5 konkrete Handlungshinweise, jeweils kurz, das Wichtigste zuerst.",
      "- 'stimmung': 'achtung' bei dringenden Problemen, 'gut' wenn alles rund läuft, sonst 'neutral'.",
      "- Sprich den Unternehmer direkt an ('du'), sachlich, ohne Floskeln.",
      "- Nenne KEINE erfundenen Zahlen — nutze nur, was im Kontext steht.",
      "- Nenne dich niemals anders als 'ARGONAUT' oder 'die KI'.",
    ].join("\n");

    const userInhalt =
      `Modul: ${modul || "Übersicht"}\n\n` +
      `Aktuelle Lage (echte Kennzahlen):\n${kontext}\n\n` +
      `Sag mir als wachendes Auge: Was heißt das gerade für mich?`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 600,
        system,
        messages: [{ role: "user", content: userInhalt }],
      }),
    });

    if (!resp.ok) {
      return Response.json(
        { ok: false, error: "Die KI ist gerade nicht erreichbar." },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const text: string =
      Array.isArray(data?.content) && data.content[0]?.type === "text"
        ? data.content[0].text
        : "";

    const parsed = extrahiereJson(text);
    if (!parsed) {
      return Response.json(
        { ok: false, error: "Antwort konnte nicht gelesen werden." },
        { status: 502 }
      );
    }

    return Response.json({ ok: true, ...parsed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Interner Fehler.";
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
