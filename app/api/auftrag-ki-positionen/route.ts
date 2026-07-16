import { kiFetch } from '@/lib/ki'
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · MODUL 5 (Vertrag/Auftrag) · A8+ — KI-Positionsvorschläge mit RAG
// Freitext/Diktat -> RAG (echte Preise aus den EIGENEN Dokumenten des Betriebs)
//   -> Claude -> Positions-JSON. Preis gefunden = "dokument", sonst "geschaetzt".
// Herkunft ist NUR intern (Vorschlags-Anzeige) — nie gespeichert, nie im PDF.
// ============================================================

const EINHEITEN = ["Stk", "Std", "Tag", "m", "m²", "m³", "kg", "t", "lfm", "Psch"];

const SYSTEM_PROMPT =
  "Du bist der Auftrags-Assistent von ARGONAUT OS, einem Betriebssystem für den deutschen Mittelstand. " +
  "Ein Handwerker oder Dienstleister beschreibt dir in eigenen Worten (oft per Sprache diktiert, daher umgangssprachlich) einen Auftrag. Wandle das in konkrete, saubere Auftragspositionen um.\n\n" +
  "Du erhältst ggf. AUSZÜGE AUS DEN EIGENEN DOKUMENTEN DES BETRIEBS (Preislisten, frühere Angebote). Diese enthalten die ECHTEN, tatsächlichen Netto-Preise des Betriebs.\n\n" +
  "Preis-Regeln für jede Position:\n" +
  "- Findest du für die Leistung einen passenden Preis in den Dokument-Auszügen, übernimm GENAU diesen Netto-Preis und setze \"quelle\": \"dokument\" sowie \"quelle_datei\" auf den Dateinamen der Quelle.\n" +
  "- Findest du KEINEN passenden Preis in den Auszügen (neue/exotische Leistung), schätze einen marktüblichen Netto-Preis und setze \"quelle\": \"geschaetzt\" (quelle_datei bleibt leer).\n\n" +
  "Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt, ohne Markdown, ohne Backticks, ohne Erklärung. Struktur exakt:\n" +
  "{ \"positionen\": [ { \"bezeichnung\": \"...\", \"menge\": 1, \"einheit\": \"Stk\", \"einzelpreis\": 0, \"mwst_satz\": 19, \"quelle\": \"dokument\", \"quelle_datei\": \"\" } ] }\n\n" +
  "Weitere Regeln:\n" +
  "- bezeichnung: klare, geschäftstaugliche Leistungsbeschreibung — nicht der wörtliche Diktattext.\n" +
  "- menge: numerisch (Punkt als Dezimaltrenner), Standard 1.\n" +
  "- einheit: GENAU eine aus [Stk, Std, Tag, m, m², m³, kg, t, lfm, Psch]. Arbeitszeit = Std, Pauschale/Anfahrt = Psch, Längen = m oder lfm.\n" +
  "- einzelpreis: Netto pro Einheit, niemals 0 (außer wirklich kostenlos).\n" +
  "- mwst_satz: Prozent, Standard 19 (nur 7 bei eindeutig ermäßigten Leistungen).\n" +
  "- Trenne sinnvoll: Material, Arbeitszeit und Anfahrt jeweils als eigene Position.\n" +
  "- Erfinde keine Leistungen, die nicht genannt wurden.\n" +
  "- Sprache: professionelles Deutsch.";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text: string = String(body?.text || "").trim();
    const waehrung: string = body?.waehrung || "EUR";
    if (!text) {
      return NextResponse.json({ error: "Bitte den Auftrag beschreiben." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "KI-Dienst nicht konfiguriert." }, { status: 500 });

    // ---------- RAG: echte Preise aus eigenen Dokumenten (optional, kein Abbruch wenn leer) ----------
    let kontext = "";
    let hatDokumente = false;
    try {
      const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.VOYAGE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: [text], model: "voyage-4-lite", input_type: "query" }),
      });
      if (voyageRes.ok) {
        const voyageData = await voyageRes.json();
        const queryEmbedding = voyageData.data[0].embedding;
        const { data: chunks } = await supabase.rpc("match_document_chunks", {
          query_embedding: queryEmbedding,
          match_user_id: user.id,
          match_count: 8,
          match_threshold: 0.15,
        });
        if (chunks && chunks.length > 0) {
          const docIds = [...new Set(chunks.map((c: any) => c.document_id))];
          const { data: docs } = await supabase
            .from("documents")
            .select("id, file_name")
            .in("id", docIds);
          const docMap = new Map((docs || []).map((d: any) => [d.id, d.file_name]));
          kontext = chunks
            .map(
              (c: any, i: number) =>
                "[Quelle " + (i + 1) + ": " + (docMap.get(c.document_id) || "Unbekannt") + "]\n" + c.content
            )
            .join("\n\n---\n\n");
          hatDokumente = true;
        }
      }
    } catch (e) {
      console.error("RAG-Schritt übersprungen:", e);
    }

    const userInhalt =
      (kontext
        ? "AUSZÜGE AUS DEN EIGENEN DOKUMENTEN DES BETRIEBS (echte Preise):\n\n" + kontext + "\n\n---\n\n"
        : "Es liegen keine Preis-Dokumente vor — bitte alle Preise schätzen und mit \"geschaetzt\" markieren.\n\n") +
      "Auftragswährung: " + waehrung + "\n\nBeschreibung des Auftrags (ggf. diktiert):\n" + text;

    const claudeResp = await kiFetch("auftrag-ki-positionen", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userInhalt }],
      }),
    });

    if (!claudeResp.ok) {
      const t = await claudeResp.text();
      console.error("KI-Positionen Claude Fehler:", claudeResp.status, t.slice(0, 300));
      return NextResponse.json({ error: "KI-Anfrage fehlgeschlagen." }, { status: 502 });
    }

    const claudeData = await claudeResp.json();
    let roh =
      (Array.isArray(claudeData?.content)
        ? claudeData.content.find((c: any) => c.type === "text")?.text
        : "") || "";
    roh = roh.replace(/```json/gi, "").replace(/```/g, "");
    const s = roh.indexOf("{");
    const e = roh.lastIndexOf("}");
    if (s >= 0 && e > s) roh = roh.slice(s, e + 1);

    let parsed: any;
    try {
      parsed = JSON.parse(roh);
    } catch {
      return NextResponse.json({ error: "KI-Antwort konnte nicht gelesen werden." }, { status: 502 });
    }

    const rohListe: any[] = Array.isArray(parsed?.positionen) ? parsed.positionen : [];
    const positionen = rohListe
      .slice(0, 30)
      .map((p: any) => {
        const menge = Number(p?.menge);
        const preis = Number(p?.einzelpreis);
        const m = Number(p?.mwst_satz);
        const quelle = p?.quelle === "dokument" ? "dokument" : "geschaetzt";
        return {
          bezeichnung: String(p?.bezeichnung || "").slice(0, 200),
          menge: isNaN(menge) || menge <= 0 ? 1 : menge,
          einheit: EINHEITEN.includes(p?.einheit) ? p.einheit : "Stk",
          einzelpreis: isNaN(preis) || preis < 0 ? 0 : preis,
          mwst_satz: isNaN(m) || m < 0 || m > 100 ? 19 : m,
          quelle,
          quelle_datei: quelle === "dokument" ? String(p?.quelle_datei || "").slice(0, 120) : "",
        };
      })
      .filter((p) => p.bezeichnung);

    return NextResponse.json({ positionen, hatDokumente });
  } catch (err: any) {
    console.error("KI-Positionen Fehler:", err?.message || err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
