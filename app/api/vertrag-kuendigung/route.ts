import { kiFetch } from '@/lib/ki'
// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 10 · V4 KI-Kündigungsschreiben (API-Route)
// Erzeugt einen fristgerechten Kündigungsschreiben-ENTWURF (kein Versand).
// Nimmt die Vertrags-Eckdaten entgegen, gibt formatierten Brieftext zurück.
// ---------------------------------------------------------------------

export const runtime = "nodejs";

type VertragInput = {
  bezeichnung?: string;
  kategorie?: string | null;
  vertragspartner?: string | null;
  vertragsnummer?: string | null;
  ende?: string | null;
  kuendigungsfrist_tage?: number;
  kuendigungstermin?: string | null; // spätester Kündigungstermin (vorberechnet)
};

export async function POST(req: Request) {
  let v: VertragInput = {};
  try {
    const body = await req.json();
    v = (body?.vertrag ?? {}) as VertragInput;
  } catch {
    return Response.json({ text: "", fehler: "Ungültige Anfrage." });
  }

  if (!v.bezeichnung) {
    return Response.json({ text: "", fehler: "Vertragsdaten fehlen." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({
      text: "",
      fehler: "KI derzeit nicht verfügbar (kein API-Key konfiguriert).",
    });
  }

  const heute = new Date().toLocaleDateString("de-DE");

  const prompt = `Du bist ein Assistent für den deutschen Mittelstand und formulierst ein rechtssicheres, höfliches Kündigungsschreiben (ordentliche Kündigung zum nächstmöglichen Termin) auf Deutsch.

Vertragsdaten:
- Bezeichnung: ${v.bezeichnung}
- Kategorie: ${v.kategorie ?? "—"}
- Vertragspartner: ${v.vertragspartner ?? "—"}
- Vertragsnummer: ${v.vertragsnummer ?? "—"}
- Vertragsende: ${v.ende ?? "—"}
- Kündigungsfrist: ${v.kuendigungsfrist_tage ?? 0} Tage vor Ende
- Spätester Kündigungstermin: ${v.kuendigungstermin ?? "—"}
- Heutiges Datum: ${heute}

Anforderungen:
- Struktur nach DIN 5008 (Platzhalter in eckigen Klammern für Absender/Adresse, z.B. [Ihr Name], [Ihre Anschrift], [Anschrift des Vertragspartners]).
- Betreffzeile mit Vertragsbezeichnung und -nummer.
- Kündigung "zum nächstmöglichen Zeitpunkt, hilfsweise zum [Datum]".
- Bitte um schriftliche Kündigungsbestätigung mit Beendigungsdatum.
- Sachlich, höflich, kurz. Keine erfundenen Fakten. Fehlende Angaben als Platzhalter lassen.
- Gib NUR den fertigen Brieftext aus (keine Erklärungen davor/danach).`;

  try {
    const res = await kiFetch("vertrag-kuendigung", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return Response.json({
        text: "",
        fehler: "Die KI konnte den Entwurf nicht erstellen. Bitte erneut versuchen.",
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
