// app/api/marketing-content/route.ts
// ARGONAUT OS · MODUL 3 MARKETING · M5 KI-Content-Studio
// Briefing -> RAG (Voyage + match_document_chunks) -> Claude (claude-sonnet-4-5)
// -> Text-Varianten als JSON. Vorschlags-Prinzip: KI schlaegt vor, Nutzer gibt frei.
// RAG-Muster 1:1 aus mitarbeiter-chat/route.ts uebernommen.
// -----------------------------------------------------------------------------
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Briefing = {
  typ: string; // post | newsletter | anzeige | blog
  kanal: string; // email | instagram | ...
  ziel: string; // Thema / was der Inhalt erreichen soll
  tonalitaet: string; // professionell | locker | verkaeuferisch | ...
  laenge: string; // kurz | mittel | lang
  anzahl: number; // 1..3
};

const TYP_LABEL: Record<string, string> = {
  post: "Social-Media-Post",
  newsletter: "Newsletter",
  anzeige: "Werbeanzeige",
  blog: "Blog-Artikel",
};

function laengenHinweis(typ: string, laenge: string): string {
  const tabelle: Record<string, Record<string, string>> = {
    post: { kurz: "ca. 40-60 Woerter", mittel: "ca. 80-120 Woerter", lang: "ca. 150-220 Woerter" },
    newsletter: { kurz: "ca. 120 Woerter", mittel: "ca. 250 Woerter", lang: "ca. 450 Woerter" },
    anzeige: { kurz: "ca. 20-30 Woerter, sehr knackig", mittel: "ca. 50 Woerter", lang: "ca. 90 Woerter" },
    blog: { kurz: "ca. 250 Woerter", mittel: "ca. 500 Woerter", lang: "ca. 900 Woerter" },
  };
  return tabelle[typ]?.[laenge] ?? "angemessene Laenge";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const b: Briefing = {
      typ: typeof body?.typ === "string" ? body.typ : "post",
      kanal: typeof body?.kanal === "string" ? body.kanal : "email",
      ziel: typeof body?.ziel === "string" ? body.ziel : "",
      tonalitaet: typeof body?.tonalitaet === "string" ? body.tonalitaet : "professionell",
      laenge: typeof body?.laenge === "string" ? body.laenge : "mittel",
      anzahl: Math.min(3, Math.max(1, Number(body?.anzahl) || 1)),
    };
    if (!b.ziel.trim()) {
      return NextResponse.json({ error: "Bitte ein Thema / Ziel angeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // ---- RAG: Markenwissen aus Firmendokumenten (optional, kein Abbruch wenn leer) ----
    let kontext = "";
    let quellen: string[] = [];
    try {
      const ragQuery = `${b.ziel} ${TYP_LABEL[b.typ] ?? b.typ} ${b.kanal}`;
      const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.VOYAGE_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ input: [ragQuery], model: "voyage-4-lite", input_type: "query" }),
      });
      if (voyageRes.ok) {
        const voyageData = await voyageRes.json();
        const queryEmbedding = voyageData.data[0].embedding;
        const { data: chunks } = await supabase.rpc("match_document_chunks", {
          query_embedding: queryEmbedding,
          match_user_id: user.id,
          match_count: 5,
          match_threshold: 0.15,
        });
        if (chunks && chunks.length > 0) {
          const docIds = [...new Set(chunks.map((c: any) => c.document_id))];
          const { data: docs } = await supabase.from("documents").select("id, file_name").in("id", docIds);
          const docMap = new Map((docs || []).map((d: any) => [d.id, d.file_name]));
          kontext = chunks
            .map(
              (c: any, i: number) =>
                "[Quelle " + (i + 1) + ": " + (docMap.get(c.document_id) || "Unbekannt") + "]\n" + c.content,
            )
            .join("\n\n---\n\n");
          quellen = [...new Set(chunks.map((c: any) => docMap.get(c.document_id) || "Unbekannt"))] as string[];
        }
      }
    } catch (e) {
      console.error("RAG-Schritt uebersprungen:", e);
    }

    // ---- System-Prompt: Marken-Texter, kundenneutral, Spezifika aus RAG ----
    const SYSTEM_PROMPT =
      "Du bist ein erfahrener deutscher Marketing-Texter. Du schreibst ueberzeugende, professionelle Werbetexte " +
      "im Markenton des Unternehmens. Konkrete Fakten, Leistungen, Preise und Tonalitaet entnimmst du AUSSCHLIESSLICH " +
      "den bereitgestellten Firmen-Auszuegen - erfinde keine Fakten, Zahlen oder Versprechen, die dort nicht stehen. " +
      "Wenn keine Firmen-Auszuege vorliegen, schreibe allgemein und ohne erfundene Details. " +
      "Nenne niemals Mitbewerber namentlich. Schreibe auf Deutsch. " +
      "Antworte AUSSCHLIESSLICH mit gueltigem JSON in genau diesem Format, ohne Markdown, ohne Backticks, ohne Vor- oder Nachtext: " +
      '{"vorschlaege":[{"titel":"kurzer interner Titel","inhalt":"der fertige Text"}]}';

    const userPrompt =
      (kontext ? "Firmen-Auszuege (Markenwissen):\n\n" + kontext + "\n\n---\n\n" : "Keine Firmen-Auszuege vorhanden.\n\n") +
      "Erstelle " + b.anzahl + " unterschiedliche Variante(n) fuer folgenden Marketing-Inhalt:\n" +
      "- Format: " + (TYP_LABEL[b.typ] ?? b.typ) + "\n" +
      "- Kanal: " + b.kanal + "\n" +
      "- Thema / Ziel: " + b.ziel + "\n" +
      "- Tonalitaet: " + b.tonalitaet + "\n" +
      "- Laenge je Variante: " + laengenHinweis(b.typ, b.laenge) + "\n\n" +
      "Jede Variante soll eigenstaendig und sofort verwendbar sein. Gib nur das JSON zurueck.";

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      console.error("Claude Fehler:", t);
      return NextResponse.json({ error: "Generierung fehlgeschlagen." }, { status: 500 });
    }
    const claudeData = await claudeRes.json();
    const blocks: any[] = Array.isArray(claudeData.content) ? claudeData.content : [];
    const rohtext = blocks.filter((bl) => bl.type === "text").map((bl) => bl.text || "").join("").trim();

    // ---- Robustes JSON-Parsing ----
    let vorschlaege: { titel: string; inhalt: string }[] = [];
    try {
      let clean = rohtext.replace(/```json/gi, "").replace(/```/g, "").trim();
      const start = clean.indexOf("{");
      const ende = clean.lastIndexOf("}");
      if (start !== -1 && ende !== -1 && ende > start) {
        clean = clean.slice(start, ende + 1);
      }
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed?.vorschlaege)) {
        vorschlaege = parsed.vorschlaege
          .filter((v: any) => v && typeof v.inhalt === "string")
          .map((v: any) => ({
            titel: typeof v.titel === "string" && v.titel.trim() ? v.titel.trim() : "Vorschlag",
            inhalt: v.inhalt,
          }));
      }
    } catch (e) {
      console.error("JSON-Parsing fehlgeschlagen:", e);
    }

    // Fallback: roher Text als eine Variante
    if (vorschlaege.length === 0 && rohtext) {
      vorschlaege = [{ titel: "Vorschlag", inhalt: rohtext }];
    }
    if (vorschlaege.length === 0) {
      return NextResponse.json({ error: "Keine verwertbare Antwort erhalten." }, { status: 500 });
    }

    return NextResponse.json({ vorschlaege, quellen });
  } catch (err: any) {
    console.error("Marketing-Content Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
