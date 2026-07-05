// app/api/ki-klartext/route.ts
// ============================================================
// ARGONAUT OS · Baustein "KI-Klartext / nächste beste Aktion" (Etappe 1, Baustein 2)
// Nimmt eine kurze SITUATIONS-Beschreibung (mit echten Zahlen) und liefert:
//   klartext -> ein bis zwei Sätze "Was heißt das für mich?"
//   aktion   -> ein kurzer, konkreter Handlungs-Vorschlag (Imperativ)
// Gleiches Muster wie /api/dashboard-chat: direkter fetch, kein SDK,
// model claude-sonnet-4-5, Auth-Check, "die KI" = ARGONAUT (nie "Claude").
// Body:   { kontext: string, modul?: string }
// Antwort:{ klartext: string, aktion: string }
// ============================================================
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const kontext = typeof body?.kontext === "string" ? body.kontext.trim() : "";
    const modul = typeof body?.modul === "string" ? body.modul.trim() : "";

    if (!kontext) {
      return NextResponse.json({ error: "Kein Kontext übergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const SYSTEM_PROMPT =
`Du bist der ARGONAUT KI-Assistent im Dashboard des Betriebsinhabers. Deine Aufgabe: eine kurze Lage aus seinem Betrieb in einfache Worte fassen ("Was heißt das für mich?") und ihm die eine sinnvollste nächste Aktion nennen.

Antworte in GENAU zwei Zeilen, in exakt diesem Format:
KLARTEXT: <ein bis zwei kurze Sätze, was die Lage konkret für ihn bedeutet>
AKTION: <ein konkreter Handlungsvorschlag im Imperativ, höchstens 8 Wörter>

Regeln:
- Schreibe auf Deutsch, freundlich, klar und ohne Fachchinesisch.
- Nenne konkrete Zahlen aus der Lage, wenn vorhanden.
- Wenn die Lage entspannt ist, sage das ruhig und schlage eine leichte Aktion vor (z. B. "Nichts zu tun – Lage im grünen Bereich").
- Verwende KEINE Markdown-Zeichen (keine *, #, \`). Nur normalen Text.
- Nenne dich immer ARGONAUT und niemals einen anderen Namen.`;

    const userInhalt = `${modul ? "Bereich: " + modul + "\n" : ""}Aktuelle Lage:\n${kontext}`;

    const kiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userInhalt }],
      }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error("KI-Klartext KI-Fehler:", t);
      return NextResponse.json({ error: "Antwort fehlgeschlagen." }, { status: 500 });
    }

    const kiData = await kiRes.json();
    const blocks: any[] = Array.isArray(kiData.content) ? kiData.content : [];
    const roh = blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();

    // --- Robust in Klartext + Aktion zerlegen (zeilenbasiert) ---
    let klartext = "";
    let aktion = "";
    for (const zeileRoh of roh.split("\n")) {
      const zeile = zeileRoh.trim();
      if (!zeile) continue;
      if (/^KLARTEXT:/i.test(zeile)) {
        klartext = zeile.replace(/^KLARTEXT:\s*/i, "").trim();
      } else if (/^AKTION:/i.test(zeile)) {
        aktion = zeile.replace(/^AKTION:\s*/i, "").trim();
      } else if (!klartext) {
        // Fallback: erste sonstige Zeile als Klartext werten
        klartext = zeile;
      }
    }
    if (!klartext) klartext = roh;

    return NextResponse.json({
      klartext: klartext || "Dazu liegt gerade keine Einschätzung vor.",
      aktion,
    });
  } catch (err: any) {
    console.error("KI-Klartext Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
