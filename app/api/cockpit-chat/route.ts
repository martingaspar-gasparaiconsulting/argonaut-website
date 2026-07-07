// app/api/cockpit-chat/route.ts
// ============================================================
// ARGONAUT OS · Chef-Cockpit · Etappe 2: Sprach-/Text-Rueckfragen
// Nimmt den bereits im Cockpit gebauten Kennzahlen-Kontext + den
// Gespraechsverlauf entgegen und beantwortet Rueckfragen des Chefs
// als "ARGONAUT-Assistent".
// Muster identisch zu /api/dashboard-chat (bewaehrt).
// Body: { kontext: string, messages: [{ role:'user'|'assistant', content }] }
// Antwort: { antwort: string }
// ============================================================
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const kontext: string = typeof body?.kontext === "string" ? body.kontext : "";
    const roh: any[] = Array.isArray(body?.messages) ? body.messages : [];

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const SYSTEM_PROMPT =
`Du bist der ARGONAUT-Assistent im Chef-Cockpit des Betriebsinhabers. Der Chef hat gerade seinen Tagesbericht gesehen und stellt dazu Rueckfragen.

Dir liegen die aktuellen Live-Kennzahlen seines Betriebs vor (siehe unten). Beantworte seine Fragen praezise, freundlich und auf Deutsch. Nenne konkrete Zahlen und Namen aus den Daten. Wenn eine gewuenschte Information NICHT in den Kennzahlen steht, sage das ehrlich und weise auf das passende Modul im Dashboard hin (z. B. Rechnungen, Leads, Personal, Projekte, Mahnwesen).

Halte dich kurz und klar (in der Regel unter 120 Woertern). 

WICHTIG — Formatierung: Verwende KEINE Markdown-Zeichen. Keine Sternchen (** oder *), keine Rauten (#), keine Backticks. Wenn du etwas aufzaehlst, schreibe jeden Punkt in eine eigene Zeile, die mit einem Spiegelstrich (–) beginnt. Trenne Gedanken durch normale Absaetze. Deine Antworten werden teils laut vorgelesen — schreibe deshalb ausschliesslich natuerlichen Fliesstext ohne Sonderzeichen-Formatierung.

Nenne dich immer "ARGONAUT-Assistent" und niemals einen anderen Namen.

AKTUELLE BETRIEBSDATEN (Live-Stand):
${kontext}`;

    // Nachrichtenverlauf Anthropic-konform aufbereiten
    let verlauf = roh
      .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.trim() }));
    while (verlauf.length && verlauf[0].role === "assistant") verlauf.shift();

    const messages: any[] = [];
    for (const m of verlauf) {
      if (messages.length && messages[messages.length - 1].role === m.role) {
        messages[messages.length - 1].content += "\n" + m.content;
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }
    if (messages.length === 0) {
      return NextResponse.json({ error: "Keine Nachricht uebergeben." }, { status: 400 });
    }

    const kiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error("Cockpit-Chat KI-Fehler:", t);
      return NextResponse.json({ error: "Antwort fehlgeschlagen." }, { status: 500 });
    }

    const kiData = await kiRes.json();
    const blocks: any[] = Array.isArray(kiData.content) ? kiData.content : [];
    const antwort = blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();

    return NextResponse.json({ antwort: antwort || "Dazu habe ich gerade keine Antwort." });
  } catch (err: any) {
    console.error("Cockpit-Chat Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
