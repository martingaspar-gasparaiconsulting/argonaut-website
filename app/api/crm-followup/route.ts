// app/api/crm-followup/route.ts
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C10 KI-Follow-up-Texter
// Kontakt + Timeline + Firma -> RAG (Voyage + match_document_chunks)
// -> Claude (claude-haiku-4-5) -> Follow-up-Mail (Betreff + Text) als JSON.
// Vorschlags-Prinzip: KI entwirft, Nutzer sendet manuell (kein Auto-Versand).
// RAG-Muster 1:1 aus marketing-content/route.ts.
// -----------------------------------------------------------------------------
import { kiFetch } from '@/lib/ki'
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TYP_LABEL: Record<string, string> = {
  anruf: "Anruf",
  email: "E-Mail",
  termin: "Termin",
  notiz: "Notiz",
  voice: "Sprachnotiz",
};

function datumKurz(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const kontaktId: string =
      typeof body?.kontakt_id === "string" ? body.kontakt_id : "";
    const anliegen: string =
      typeof body?.anliegen === "string" ? body.anliegen : "";
    const tonalitaet: string =
      typeof body?.tonalitaet === "string" ? body.tonalitaet : "professionell";
    if (!kontaktId) {
      return NextResponse.json(
        { error: "Kein Kontakt angegeben." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // ---- Kontakt (RLS sichert Eigentümer) ----
    const { data: kontakt } = await supabase
      .from("kontakte")
      .select("*")
      .eq("id", kontaktId)
      .single();
    if (!kontakt) {
      return NextResponse.json(
        { error: "Kontakt nicht gefunden." },
        { status: 404 }
      );
    }

    // ---- Timeline ----
    const { data: aktivitaeten } = await supabase
      .from("kontakt_aktivitaeten")
      .select("typ, inhalt, aktivitaet_am")
      .eq("kontakt_id", kontaktId)
      .order("aktivitaet_am", { ascending: false })
      .limit(15);

    // ---- Firma ----
    let firmaInfo = "";
    if (kontakt.firma_id) {
      const { data: f } = await supabase
        .from("firmen")
        .select("name, branche, ort")
        .eq("id", kontakt.firma_id)
        .single();
      if (f) firmaInfo = [f.name, f.branche, f.ort].filter(Boolean).join(" · ");
    }

    const name =
      [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ") ||
      kontakt.firma ||
      "Unbenannter Kontakt";
    const anrede =
      kontakt.nachname && kontakt.nachname.trim()
        ? "Herr/Frau " + kontakt.nachname.trim()
        : name;

    const timelineZeilen = ((aktivitaeten as any[]) || []).map((a) => {
      const label = TYP_LABEL[a.typ] || a.typ || "Notiz";
      return (
        "- [" + datumKurz(a.aktivitaet_am) + " · " + label + "] " + (a.inhalt || "")
      );
    });
    const timelineBlock =
      timelineZeilen.length > 0
        ? timelineZeilen.join("\n")
        : "(Noch keine Historie erfasst.)";

    // ---- RAG: Firmenwissen (optional) ----
    let kontext = "";
    let quellen: string[] = [];
    try {
      const ragQuery = [anliegen, name, kontakt.firma || firmaInfo, kontakt.position]
        .filter(Boolean)
        .join(" ");
      const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.VOYAGE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: [ragQuery || name],
          model: "voyage-4-lite",
          input_type: "query",
        }),
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
          const { data: docs } = await supabase
            .from("documents")
            .select("id, file_name")
            .in("id", docIds);
          const docMap = new Map(
            (docs || []).map((d: any) => [d.id, d.file_name])
          );
          kontext = chunks
            .map(
              (c: any, i: number) =>
                "[Quelle " +
                (i + 1) +
                ": " +
                (docMap.get(c.document_id) || "Unbekannt") +
                "]\n" +
                c.content
            )
            .join("\n\n---\n\n");
          quellen = [
            ...new Set(
              chunks.map((c: any) => docMap.get(c.document_id) || "Unbekannt")
            ),
          ] as string[];
        }
      }
    } catch (e) {
      console.error("RAG-Schritt uebersprungen:", e);
    }

    // ---- Prompt ----
    const SYSTEM_PROMPT =
      "Du bist ein erfahrener deutscher Vertriebstexter. Du schreibst eine kurze, überzeugende Follow-up-E-Mail " +
      "an einen Geschäftskontakt, passend zur bisherigen Historie. Konkrete Fakten, Leistungen und Preise entnimmst du " +
      "AUSSCHLIESSLICH den bereitgestellten Firmen-Auszügen - erfinde keine Zahlen, Absprachen oder Versprechen, die dort " +
      "nicht stehen. Nenne niemals Mitbewerber namentlich. Schreibe auf Deutsch, höflich, knapp (ca. 80-150 Wörter), mit " +
      "klarer Handlungsaufforderung. Verwende die Anrede passend, aber KEINE erfundenen Namen. Setze am Ende einen neutralen " +
      "Gruß-Platzhalter (z. B. 'Mit freundlichen Grüßen') ohne erfundenen Absendernamen. " +
      "Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown, ohne Backticks, ohne Vor-/Nachtext, im Format: " +
      '{"betreff":"prägnanter Betreff","text":"vollständiger Mailtext mit Zeilenumbrüchen als \\n"}.';

    const userPrompt =
      "EMPFÄNGER: " + name + (firmaInfo ? " (" + firmaInfo + ")" : "") + "\n" +
      "Anrede-Hinweis: " + anrede + "\n\n" +
      "BISHERIGE HISTORIE (neueste zuerst):\n" + timelineBlock + "\n\n" +
      (anliegen.trim()
        ? "ANLIEGEN / ZIEL DIESER MAIL: " + anliegen.trim() + "\n\n"
        : "ANLIEGEN: allgemeines, freundliches Nachfassen zum letzten Kontakt.\n\n") +
      "TONALITÄT: " + tonalitaet + "\n\n" +
      (kontext
        ? "FIRMEN-AUSZÜGE (für passende Argumente/Angebote):\n\n" + kontext + "\n\n"
        : "FIRMEN-AUSZÜGE: keine vorhanden.\n\n") +
      "Schreibe jetzt die Follow-up-Mail als JSON.";

    const claudeRes = await kiFetch("crm-followup", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      console.error("Claude Fehler:", t);
      return NextResponse.json(
        { error: "Entwurf fehlgeschlagen." },
        { status: 500 }
      );
    }
    const claudeData = await claudeRes.json();
    const blocks: any[] = Array.isArray(claudeData.content)
      ? claudeData.content
      : [];
    const rohtext = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("")
      .trim();

    let parsed: any = null;
    try {
      let clean = rohtext.replace(/```json/gi, "").replace(/```/g, "").trim();
      const start = clean.indexOf("{");
      const ende = clean.lastIndexOf("}");
      if (start !== -1 && ende !== -1 && ende > start)
        clean = clean.slice(start, ende + 1);
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error("JSON-Parsing fehlgeschlagen:", e);
      return NextResponse.json(
        { error: "Antwort konnte nicht verarbeitet werden. Bitte erneut versuchen." },
        { status: 500 }
      );
    }

    const entwurf = {
      betreff:
        typeof parsed?.betreff === "string" && parsed.betreff.trim()
          ? parsed.betreff.trim()
          : "Nachfassen zu unserem Kontakt",
      text:
        typeof parsed?.text === "string" && parsed.text.trim()
          ? parsed.text.trim()
          : "",
    };

    if (!entwurf.text) {
      return NextResponse.json(
        { error: "Kein verwertbarer Entwurf erhalten. Bitte erneut versuchen." },
        { status: 500 }
      );
    }

    return NextResponse.json({ entwurf, quellen });
  } catch (err: any) {
    console.error("CRM-Followup Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
