// app/api/crm-briefing/route.ts
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C8 KI-Kontakt-Briefing
// Kontakt + Timeline + Tags + Firma -> RAG (Voyage + match_document_chunks)
// -> Claude (claude-sonnet-4-5) -> Kurz-Dossier als JSON.
// Vorschlags-Prinzip: KI briefed, Nutzer entscheidet.
// RAG-Muster 1:1 aus marketing-stratege/route.ts.
// -----------------------------------------------------------------------------
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

    // ---- Kontakt laden (RLS sichert Eigentümer) ----
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
      .limit(25);

    // ---- Tags ----
    let tagNamen: string[] = [];
    const { data: tagz } = await supabase
      .from("kontakt_tag_zuordnung")
      .select("tag_id")
      .eq("kontakt_id", kontaktId);
    const tagIds = ((tagz as { tag_id: string }[]) || []).map((t) => t.tag_id);
    if (tagIds.length > 0) {
      const { data: tags } = await supabase
        .from("kontakt_tags")
        .select("name")
        .in("id", tagIds);
      tagNamen = ((tags as { name: string }[]) || []).map((t) => t.name);
    }

    // ---- Firma ----
    let firmaInfo = "";
    if (kontakt.firma_id) {
      const { data: f } = await supabase
        .from("firmen")
        .select("name, branche, ort")
        .eq("id", kontakt.firma_id)
        .single();
      if (f) {
        firmaInfo = [f.name, f.branche, f.ort].filter(Boolean).join(" · ");
      }
    }

    // ---- Historien-Block für den Prompt ----
    const name =
      [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ") ||
      kontakt.firma ||
      "Unbenannter Kontakt";

    const stammzeilen: string[] = [];
    stammzeilen.push("Name: " + name);
    if (kontakt.position) stammzeilen.push("Position: " + kontakt.position);
    if (kontakt.firma || firmaInfo)
      stammzeilen.push("Firma: " + (firmaInfo || kontakt.firma));
    if (kontakt.status) stammzeilen.push("Status: " + kontakt.status);
    if (kontakt.quelle) stammzeilen.push("Quelle: " + kontakt.quelle);
    if (tagNamen.length) stammzeilen.push("Tags: " + tagNamen.join(", "));
    if (kontakt.letzter_kontakt_am)
      stammzeilen.push(
        "Letzter Kontakt: " + datumKurz(kontakt.letzter_kontakt_am)
      );
    if (kontakt.naechster_kontakt_am)
      stammzeilen.push(
        "Nächste Wiedervorlage: " + datumKurz(kontakt.naechster_kontakt_am)
      );
    if (kontakt.notizen) stammzeilen.push("Notizen: " + kontakt.notizen);

    const timelineZeilen = ((aktivitaeten as any[]) || []).map((a) => {
      const label = TYP_LABEL[a.typ] || a.typ || "Notiz";
      return (
        "- [" + datumKurz(a.aktivitaet_am) + " · " + label + "] " + (a.inhalt || "")
      );
    });
    const timelineBlock =
      timelineZeilen.length > 0
        ? timelineZeilen.join("\n")
        : "(Noch keine Aktivitäten erfasst.)";

    // ---- RAG: Firmenwissen (optional) ----
    let kontext = "";
    let quellen: string[] = [];
    try {
      const ragQuery = [
        name,
        kontakt.firma || firmaInfo,
        kontakt.position,
        timelineZeilen.slice(0, 3).join(" "),
      ]
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
      "Du bist ein erfahrener deutscher Vertriebs-Assistent. Du erstellst ein knappes, praxisnahes Briefing, " +
      "das ein Verkäufer in 15 Sekunden vor einem Anruf oder Termin liest. Stütze dich AUSSCHLIESSLICH auf die " +
      "bereitgestellte Kontakthistorie und - falls vorhanden - die Firmen-Auszüge. Erfinde keine Fakten, Zahlen, " +
      "Absprachen oder Versprechen, die dort nicht stehen. Wenn Informationen fehlen, sage das offen statt zu raten. " +
      "Nenne niemals Mitbewerber namentlich. Schreibe auf Deutsch, konkret und ohne Floskeln. " +
      "Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown, ohne Backticks, ohne Vor- oder Nachtext, in genau diesem Format: " +
      '{"zusammenfassung":"2-3 Sätze: wo steht die Beziehung, worum ging es zuletzt",' +
      '"beziehungsstatus":"kalt | warm | heiß","status_begruendung":"1 kurzer Satz",' +
      '"offene_punkte":["offener Punkt 1","offener Punkt 2"],' +
      '"naechste_schritte":["konkreter Vorschlag 1","konkreter Vorschlag 2","konkreter Vorschlag 3"],' +
      '"gespraechseinstieg":"1 Satz als Aufhänger fürs Gespräch"}. ' +
      "offene_punkte und naechste_schritte je 2-4 Einträge. Wenn die Historie leer ist, gib sinnvolle Erstkontakt-Vorschläge.";

    const userPrompt =
      "KONTAKT-STAMMDATEN:\n" +
      stammzeilen.join("\n") +
      "\n\nKONTAKT-HISTORIE (neueste zuerst):\n" +
      timelineBlock +
      "\n\n" +
      (kontext
        ? "FIRMEN-AUSZÜGE (Wissen aus Dokumenten, für passende Angebote/Argumente):\n\n" +
          kontext +
          "\n\n"
        : "FIRMEN-AUSZÜGE: keine vorhanden.\n\n") +
      "Erstelle jetzt das Briefing als JSON.";

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      console.error("Claude Fehler:", t);
      return NextResponse.json(
        { error: "Briefing fehlgeschlagen." },
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

    // ---- Robustes JSON-Parsing ----
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

    const erlaubtStatus = ["kalt", "warm", "heiß", "heiss"];
    const briefing = {
      zusammenfassung:
        typeof parsed?.zusammenfassung === "string" ? parsed.zusammenfassung : "",
      beziehungsstatus: erlaubtStatus.includes(
        String(parsed?.beziehungsstatus || "").toLowerCase()
      )
        ? String(parsed.beziehungsstatus).toLowerCase().replace("heiss", "heiß")
        : "warm",
      status_begruendung:
        typeof parsed?.status_begruendung === "string"
          ? parsed.status_begruendung
          : "",
      offene_punkte: Array.isArray(parsed?.offene_punkte)
        ? parsed.offene_punkte.filter((x: any) => typeof x === "string")
        : [],
      naechste_schritte: Array.isArray(parsed?.naechste_schritte)
        ? parsed.naechste_schritte.filter((x: any) => typeof x === "string")
        : [],
      gespraechseinstieg:
        typeof parsed?.gespraechseinstieg === "string"
          ? parsed.gespraechseinstieg
          : "",
    };

    if (!briefing.zusammenfassung && briefing.naechste_schritte.length === 0) {
      return NextResponse.json(
        { error: "Kein verwertbares Briefing erhalten. Bitte erneut versuchen." },
        { status: 500 }
      );
    }

    return NextResponse.json({ briefing, quellen });
  } catch (err: any) {
    console.error("CRM-Briefing Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
