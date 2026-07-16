// app/api/marketing-stratege/route.ts
// ARGONAUT OS · MODUL 3 MARKETING · M7 KI-Kampagnen-Stratege
// Ziel -> RAG (Voyage + match_document_chunks) -> Claude (claude-sonnet-5)
// -> kompletter Kampagnenplan als JSON (Kampagne, Botschaften, Zeitplan, Inhalte).
// Vorschlags-Prinzip: KI plant, Nutzer legt per Klick an.
// RAG-Muster 1:1 aus mitarbeiter-chat/route.ts.
// -----------------------------------------------------------------------------
import { kiFetch } from '@/lib/ki'
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Eingabe = {
  ziel: string;
  start_datum: string | null;
  end_datum: string | null;
  budget: number | null;
  tonalitaet: string;
};

function tageDazwischen(start: string | null, ende: string | null): number | null {
  if (!start || !ende) return null;
  const s = new Date(start);
  const e = new Date(ende);
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return diff > 0 ? diff : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const eingabe: Eingabe = {
      ziel: typeof body?.ziel === "string" ? body.ziel : "",
      start_datum: typeof body?.start_datum === "string" && body.start_datum ? body.start_datum : null,
      end_datum: typeof body?.end_datum === "string" && body.end_datum ? body.end_datum : null,
      budget: body?.budget != null && !isNaN(Number(body.budget)) ? Number(body.budget) : null,
      tonalitaet: typeof body?.tonalitaet === "string" ? body.tonalitaet : "professionell",
    };
    if (!eingabe.ziel.trim()) {
      return NextResponse.json({ error: "Bitte ein Kampagnen-Ziel angeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // ---- RAG: Markenwissen ----
    let kontext = "";
    let quellen: string[] = [];
    try {
      const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.VOYAGE_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ input: [eingabe.ziel], model: "voyage-4-lite", input_type: "query" }),
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

    const dauer = tageDazwischen(eingabe.start_datum, eingabe.end_datum);

    const SYSTEM_PROMPT =
      "Du bist ein erfahrener deutscher Marketing-Stratege. Du entwirfst vollstaendige, umsetzbare Kampagnenplaene fuer " +
      "kleine und mittlere Unternehmen. Konkrete Fakten, Leistungen, Preise und Tonalitaet entnimmst du AUSSCHLIESSLICH den " +
      "bereitgestellten Firmen-Auszuegen - erfinde keine Fakten, Zahlen oder Versprechen, die dort nicht stehen. " +
      "Liegen keine Auszuege vor, plane allgemein und ohne erfundene Details. Nenne niemals Mitbewerber namentlich. " +
      "Die Inhalte sollen sofort verwendbare, fertige Texte sein. Verteile die Inhalte sinnvoll ueber den Zeitraum (tag_offset = Tage ab Kampagnenstart, 0-basiert). " +
      "Antworte AUSSCHLIESSLICH mit gueltigem JSON, ohne Markdown, ohne Backticks, ohne Vor- oder Nachtext, in genau diesem Format: " +
      '{"name":"Kampagnenname","ziel":"praezises Ziel","beschreibung":"2-3 Saetze Strategie","kanaele":["instagram","email"],' +
      '"empfohlenes_budget":1500,"botschaften":["Kernbotschaft 1","Kernbotschaft 2"],' +
      '"zeitplan":[{"phase":"Woche 1","fokus":"...","aktivitaeten":["...","..."]}],' +
      '"inhalte":[{"titel":"interner Titel","typ":"post","kanal":"instagram","tag_offset":0,"inhalt":"fertiger Text"}]}. ' +
      "Erlaubte typ-Werte: post, newsletter, anzeige, blog. Erlaubte kanal-Werte: email, instagram, facebook, linkedin, google, website, print. " +
      "Erzeuge 4-7 Inhalte und 3-5 Zeitplan-Phasen.";

    const userPrompt =
      (kontext ? "Firmen-Auszuege (Markenwissen):\n\n" + kontext + "\n\n---\n\n" : "Keine Firmen-Auszuege vorhanden.\n\n") +
      "Entwirf einen kompletten Kampagnenplan:\n" +
      "- Ziel: " + eingabe.ziel + "\n" +
      "- Tonalitaet: " + eingabe.tonalitaet + "\n" +
      (dauer ? "- Kampagnendauer: ca. " + dauer + " Tage\n" : "- Kampagnendauer: nicht festgelegt (plane fuer ca. 4 Wochen)\n") +
      (eingabe.budget != null ? "- Budget-Rahmen: " + eingabe.budget + " EUR\n" : "- Budget: nicht festgelegt (empfiehl einen sinnvollen Rahmen)\n") +
      "\nGib nur das JSON zurueck.";

    const claudeRes = await kiFetch("marketing-stratege", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 3500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      console.error("Claude Fehler:", t);
      return NextResponse.json({ error: "Planung fehlgeschlagen." }, { status: 500 });
    }
    const claudeData = await claudeRes.json();
    const blocks: any[] = Array.isArray(claudeData.content) ? claudeData.content : [];
    const rohtext = blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();

    // ---- Robustes JSON-Parsing ----
    let plan: any = null;
    try {
      let clean = rohtext.replace(/```json/gi, "").replace(/```/g, "").trim();
      const start = clean.indexOf("{");
      const ende = clean.lastIndexOf("}");
      if (start !== -1 && ende !== -1 && ende > start) clean = clean.slice(start, ende + 1);
      plan = JSON.parse(clean);
    } catch (e) {
      console.error("JSON-Parsing fehlgeschlagen:", e);
      return NextResponse.json({ error: "Antwort konnte nicht verarbeitet werden. Bitte erneut versuchen." }, { status: 500 });
    }

    // ---- Normalisieren / absichern ----
    const erlaubtTyp = ["post", "newsletter", "anzeige", "blog"];
    const erlaubtKanal = ["email", "instagram", "facebook", "linkedin", "google", "website", "print"];
    const ergebnis = {
      name: typeof plan?.name === "string" && plan.name.trim() ? plan.name.trim() : "Neue Kampagne",
      ziel: typeof plan?.ziel === "string" ? plan.ziel : eingabe.ziel,
      beschreibung: typeof plan?.beschreibung === "string" ? plan.beschreibung : "",
      kanaele: Array.isArray(plan?.kanaele) ? plan.kanaele.filter((k: any) => erlaubtKanal.includes(k)) : [],
      empfohlenes_budget: plan?.empfohlenes_budget != null && !isNaN(Number(plan.empfohlenes_budget)) ? Number(plan.empfohlenes_budget) : null,
      botschaften: Array.isArray(plan?.botschaften) ? plan.botschaften.filter((b: any) => typeof b === "string") : [],
      zeitplan: Array.isArray(plan?.zeitplan)
        ? plan.zeitplan.map((p: any) => ({
            phase: typeof p?.phase === "string" ? p.phase : "",
            fokus: typeof p?.fokus === "string" ? p.fokus : "",
            aktivitaeten: Array.isArray(p?.aktivitaeten) ? p.aktivitaeten.filter((a: any) => typeof a === "string") : [],
          }))
        : [],
      inhalte: Array.isArray(plan?.inhalte)
        ? plan.inhalte
            .filter((i: any) => i && typeof i.inhalt === "string")
            .map((i: any) => ({
              titel: typeof i?.titel === "string" && i.titel.trim() ? i.titel.trim() : "Inhalt",
              typ: erlaubtTyp.includes(i?.typ) ? i.typ : "post",
              kanal: erlaubtKanal.includes(i?.kanal) ? i.kanal : "instagram",
              tag_offset: i?.tag_offset != null && !isNaN(Number(i.tag_offset)) ? Math.max(0, Math.round(Number(i.tag_offset))) : 0,
              inhalt: i.inhalt,
            }))
        : [],
    };

    if (ergebnis.inhalte.length === 0) {
      return NextResponse.json({ error: "Kein verwertbarer Plan erhalten. Bitte erneut versuchen." }, { status: 500 });
    }

    return NextResponse.json({ plan: ergebnis, quellen });
  } catch (err: any) {
    console.error("Marketing-Stratege Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
