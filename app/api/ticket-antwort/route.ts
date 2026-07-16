import { kiFetch } from '@/lib/ki'
// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 11 · T4 KI-Antwortentwurf (API-Route)
// Erzeugt einen höflichen Antwort-ENTWURF auf ein Kundenservice-Ticket.
// Kein Versand — Text wird zur Bearbeitung/Kopie an die UI zurückgegeben.
// ---------------------------------------------------------------------

export const runtime = "nodejs";

type VerlaufInput = {
  typ?: string;
  inhalt?: string | null;
  alt_status?: string | null;
  neu_status?: string | null;
};

type TicketInput = {
  ticket_nummer?: string | null;
  betreff?: string;
  beschreibung?: string | null;
  status?: string | null;
  prioritaet?: string | null;
  kategorie?: string | null;
  kanal?: string | null;
  kunde_name?: string | null;
  verlauf?: VerlaufInput[];
};

const KATEGORIE_LABEL: Record<string, string> = {
  anfrage: "Anfrage",
  support: "Support-Anfrage",
  reklamation: "Reklamation",
  sonstiges: "Anliegen",
};

export async function POST(req: Request) {
  let t: TicketInput = {};
  try {
    const body = await req.json();
    t = (body?.ticket ?? {}) as TicketInput;
  } catch {
    return Response.json({ text: "", fehler: "Ungültige Anfrage." });
  }

  if (!t.betreff) {
    return Response.json({ text: "", fehler: "Ticket-Daten fehlen." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({
      text: "",
      fehler: "KI derzeit nicht verfügbar (kein API-Key konfiguriert).",
    });
  }

  // Verlauf (nur Kommentare/Notizen) als Kontext aufbereiten
  const verlaufText = Array.isArray(t.verlauf)
    ? t.verlauf
        .filter((v) => v.typ === "kommentar" || v.typ === "notiz")
        .map((v) => `- ${v.inhalt ?? ""}`)
        .filter((s) => s.trim() !== "-")
        .join("\n")
    : "";

  const kategorieText =
    KATEGORIE_LABEL[t.kategorie ?? "anfrage"] ?? "Anliegen";
  const istReklamation = t.kategorie === "reklamation";

  const prompt = `Du bist ARGONAUT, der freundliche Kundenservice-Assistent eines mittelständischen Unternehmens. Formuliere einen professionellen, empathischen Antwort-ENTWURF auf Deutsch, den ein Mitarbeiter an den Kunden senden könnte.

Ticket-Daten:
- Nummer: ${t.ticket_nummer ?? "—"}
- Betreff: ${t.betreff}
- Kategorie: ${kategorieText}
- Kunde: ${t.kunde_name ?? "der Kunde"}
- Beschreibung des Anliegens: ${t.beschreibung ?? "—"}
${verlaufText ? `- Bisherige interne Notizen/Kommentare:\n${verlaufText}` : ""}

Anforderungen an die Antwort:
- Beginne mit einer passenden Anrede (nutze den Kundennamen, falls vorhanden, sonst "Sehr geehrte Damen und Herren").
- ${istReklamation ? "Zeige echtes Verständnis für die Reklamation, entschuldige dich angemessen für die Unannehmlichkeiten und signalisiere klare Lösungsbereitschaft." : "Bedanke dich für die Anfrage und gehe freundlich und lösungsorientiert auf das Anliegen ein."}
- Fasse das Anliegen kurz in eigenen Worten zusammen, damit sich der Kunde verstanden fühlt.
- Beschreibe die nächsten Schritte oder biete konkrete Hilfe an. Wo konkrete Fakten fehlen, nutze neutrale Platzhalter in eckigen Klammern (z.B. [Liefertermin], [Ansprechpartner]).
- Höflicher, professioneller Abschluss mit Grußformel und Platzhalter [Ihr Name] / [Unternehmen].
- Sachlich, warm, nicht übertrieben. Keine erfundenen Zusagen oder Fakten.
- WICHTIG: Nenne dich im Text niemals "Claude" oder "KI" — der Brief kommt vom Unternehmen selbst.
- Gib NUR den fertigen Antworttext aus (keine Erklärungen oder Kommentare davor/danach).`;

  try {
    const res = await kiFetch("ticket-antwort", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return Response.json({
        text: "",
        fehler:
          "Die KI konnte den Entwurf nicht erstellen. Bitte erneut versuchen.",
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
