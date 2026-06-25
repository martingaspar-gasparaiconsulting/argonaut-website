// app/api/mitarbeiter-chat/route.ts
// ARGONAUT OS — Schritt 3a: Mitarbeiter-Chat mit Tool-Use (document_generate)
// - Normale Fragen: RAG wie bisher -> { modus:'text', antwort, quellen }
// - Dokumentwunsch: Claude ruft Tool auf -> { modus:'vorschlag', vorschlag:{...} }
//   (Backend FUEHRT NICHT aus; Bestaetigung + Erzeugung passiert in der UI ueber
//    die bereits getestete Route /api/chat/generate-document)
// -----------------------------------------------------------------------------
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { DOCUMENT_TEMPLATES, getTemplate } from "@/lib/document-templates";
import { pflichtfelderFehlen } from "@/lib/document-render";

export const runtime = "nodejs";

type Verlauf = { rolle: "user" | "assistent"; text: string };

// Katalog der Templates fuer den System-Prompt (Feld-keys, * = Pflicht)
const KATALOG = DOCUMENT_TEMPLATES.map((t) => {
  const felder = t.felder.map((f) => f.key + (f.pflicht ? "*" : "")).join(", ");
  return `- ${t.id} (${t.name}, ${t.format}): ${felder}`;
}).join("\n");

const SYSTEM_PROMPT =
  "Du bist der kompetente Mitarbeiter-Assistent von ARGONAUT OS. Du hilfst dem Mitarbeiter, Informationen aus den Firmendokumenten zu finden, zu verstehen und aufzubereiten. " +
  "Bei Faktenfragen antwortest du nur auf Basis der bereitgestellten Dokument-Auszuege und erfindest nichts. Wenn eine Information nicht in den Auszuegen steht, sage es kurz. " +
  "Du kannst ausserdem Geschaeftsdokumente erstellen. Wenn der Mitarbeiter dich bittet, ein Dokument zu erstellen, zu erzeugen oder zu schreiben (z. B. Angebot, Rechnung, Mahnung, Vertrag), rufe das Tool 'document_generate' auf. " +
  "Waehle die passende templateId und fuelle 'data' mit den genannten Angaben (Schluessel = Feld-keys aus der Liste unten). Erfinde keine Pflichtangaben: Wenn Pflichtfelder fehlen, rufe das Tool trotzdem mit den vorhandenen Daten auf - das System fragt fehlende Felder anschliessend nach. " +
  "Antworte praezise auf Deutsch und strukturiere laengere Antworten mit Ueberschriften und Aufzaehlungen. Nenne am Ende keine Quellen-Nummern. " +
  "Verfuegbare Dokumente und ihre Felder (* = Pflichtfeld):\n" +
  KATALOG;

const TOOL = {
  name: "document_generate",
  description:
    "Erstellt ein Geschaeftsdokument (Angebot, Rechnung, Mahnung, Vertrag etc.) aus strukturierten Daten. Nutze dies, wenn der Mitarbeiter die Erstellung eines Dokuments wuenscht.",
  input_schema: {
    type: "object",
    properties: {
      templateId: {
        type: "string",
        enum: DOCUMENT_TEMPLATES.map((t) => t.id),
        description: "ID des Dokumenttyps.",
      },
      data: {
        type: "object",
        description: "Felder des Dokuments als Schluessel-Wert-Paare (Schluessel = Feld-keys des Templates).",
      },
    },
    required: ["templateId", "data"],
  },
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const frage: string = body?.frage;
    const verlauf: Verlauf[] = Array.isArray(body?.verlauf) ? body.verlauf : [];
    if (!frage || typeof frage !== "string") {
      return NextResponse.json({ error: "Keine Frage uebergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // RAG: Embedding + Suche (Kontext optional, kein Abbruch wenn leer)
    let kontext = "";
    let quellen: string[] = [];
    try {
      const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.VOYAGE_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ input: [frage], model: "voyage-4-lite", input_type: "query" }),
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

    // Nachrichtenverlauf fuer Claude
    const messages: any[] = verlauf
      .filter(
        (m) => m && (m.rolle === "user" || m.rolle === "assistent") && typeof m.text === "string" && m.text.trim() !== "",
      )
      .map((m) => ({ role: m.rolle === "user" ? "user" : "assistant", content: m.text }));

    const aktuelleFrage = kontext
      ? "Dokument-Auszuege:\n\n" + kontext + "\n\n---\n\nNachricht des Mitarbeiters: " + frage
      : "Nachricht des Mitarbeiters: " + frage;
    messages.push({ role: "user", content: aktuelleFrage });

    // Claude mit Tool-Use
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        messages,
      }),
    });
    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      console.error("Claude Fehler:", t);
      return NextResponse.json({ error: "Antwort fehlgeschlagen." }, { status: 500 });
    }
    const claudeData = await claudeRes.json();
    const blocks: any[] = Array.isArray(claudeData.content) ? claudeData.content : [];
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("");
    const toolUse = blocks.find((b) => b.type === "tool_use" && b.name === "document_generate");

    // Dokumentvorschlag?
    if (toolUse) {
      const templateId: string = toolUse.input?.templateId;
      const data: Record<string, any> = toolUse.input?.data ?? {};
      const tpl = getTemplate(templateId);
      if (!tpl) {
        return NextResponse.json({
          modus: "text",
          antwort: text || "Diesen Dokumenttyp kenne ich nicht. Moeglich sind z. B. Angebot, Rechnung, Mahnung.",
          quellen: [],
        });
      }
      const fehlend = pflichtfelderFehlen(templateId, data);
      return NextResponse.json({
        modus: "vorschlag",
        text,
        vorschlag: { templateId, name: tpl.name, agent: tpl.agent, format: tpl.format, data, fehlend },
        quellen: [],
      });
    }

    // Normale Textantwort (rueckwaertskompatibel)
    return NextResponse.json({ modus: "text", antwort: text, quellen });
  } catch (err: any) {
    console.error("Mitarbeiter-Chat Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}