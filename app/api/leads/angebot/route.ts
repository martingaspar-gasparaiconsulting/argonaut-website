// app/api/leads/angebot/route.ts
// ARGONAUT OS - Vertrieb V2: KI-Angebotsentwurf
// -----------------------------------------------------------------------------
// POST  -> erzeugt aus den Lead-Daten + RAG (Preise/Leistungen des Kunden) einen
//          Angebotsentwurf via Claude, speichert ihn und gibt ihn zurueck.
// PATCH -> speichert einen (ggf. editierten) Entwurf und/oder setzt den Status
//          (z. B. "Freigegeben").
//
// Mandantenfaehig: RAG nutzt match_user_id = user.id; der Lead wird zusaetzlich
// gegen owner_user_id des eingeloggten Users abgesichert. Einmal gebaut, laeuft
// fuer alle Kunden. Es wird NICHTS automatisch versendet.
//
// Muster uebernommen aus /api/mitarbeiter-chat (Anthropic-Call, RAG, Supabase).
// -----------------------------------------------------------------------------
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "Du bist der Vertriebs-Assistent von ARGONAUT OS und formulierst professionelle, freundliche Angebotsentwuerfe fuer Handwerks- und Dienstleistungsbetriebe auf Deutsch. " +
  "Du erstellst einen klar strukturierten Angebotsentwurf auf Basis der Anfrage-Daten des Interessenten und - falls vorhanden - der bereitgestellten Auszuege aus den Firmendokumenten (Leistungen, Preise, Konditionen). " +
  "Struktur: kurze persoenliche Anrede, ein bis zwei einleitende Saetze, eine uebersichtliche Auflistung der angefragten Leistung(en) mit Mengen, dann Preis-Positionen. " +
  "WICHTIG zu Preisen: Verwende ausschliesslich Preise, die in den bereitgestellten Dokument-Auszuegen stehen. Erfinde NIEMALS Preise. " +
  "Wenn fuer eine Position kein Preis in den Auszuegen vorliegt, setze einen klar erkennbaren Platzhalter im Format [Preis bitte ergaenzen] ein - so sieht der Bearbeiter sofort, was er noch eintragen muss. " +
  "Schliesse mit einem freundlichen Schlusssatz und Platzhaltern fuer Gueltigkeit/Unterschrift. Halte den Ton serioes und vertrauenswuerdig. Gib NUR den Angebotstext aus, keine Vorbemerkungen, keine Erklaerungen.";

// --- Lead-Daten zu einem Anfrage-Block formatieren --------------------------
function anfrageText(lead: any): string {
  const zeilen = [
    "Name des Interessenten: " + (lead.name || "unbekannt"),
    lead.telefon ? "Telefon: " + lead.telefon : null,
    lead.email ? "E-Mail: " + lead.email : null,
    "Angefragte Dienstleistung: " + (lead.dienstleistung || "nicht angegeben"),
    "Menge/Umfang: " + ([lead.menge, lead.einheit].filter(Boolean).join(" ") || "nicht angegeben"),
    lead.wunschtermin ? "Wunschtermin: " + lead.wunschtermin : null,
    lead.nachricht ? "Freitext des Interessenten: " + lead.nachricht : null,
  ].filter(Boolean);
  return zeilen.join("\n");
}

// =============================== POST =======================================
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const id: string = body?.id;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Keine Lead-ID uebergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // Lead laden + Besitz pruefen
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, owner_user_id, name, telefon, email, dienstleistung, menge, einheit, wunschtermin, nachricht")
      .eq("id", id)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }
    if (lead.owner_user_id !== user.id) {
      return NextResponse.json({ error: "Kein Zugriff auf diesen Lead." }, { status: 403 });
    }

    // RAG: passende Preise/Leistungen des Kunden suchen (optional, kein Abbruch)
    let kontext = "";
    try {
      const suchtext =
        "Preise und Leistungen fuer: " +
        [lead.dienstleistung, lead.menge, lead.einheit].filter(Boolean).join(" ");
      const voyageRes = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.VOYAGE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: [suchtext], model: "voyage-4-lite", input_type: "query" }),
      });
      if (voyageRes.ok) {
        const voyageData = await voyageRes.json();
        const queryEmbedding = voyageData.data[0].embedding;
        const { data: chunks } = await supabase.rpc("match_document_chunks", {
          query_embedding: queryEmbedding,
          match_user_id: user.id,
          match_count: 6,
          match_threshold: 0.15,
        });
        if (chunks && chunks.length > 0) {
          kontext = chunks
            .map((c: any, i: number) => "[Auszug " + (i + 1) + "]\n" + c.content)
            .join("\n\n---\n\n");
        }
      }
    } catch (e) {
      console.error("RAG-Schritt uebersprungen:", e);
    }

    const userText = kontext
      ? "Auszuege aus den Firmendokumenten (Leistungen/Preise):\n\n" + kontext +
        "\n\n---\n\nAnfrage des Interessenten:\n" + anfrageText(lead) +
        "\n\nErstelle daraus einen Angebotsentwurf."
      : "Es liegen keine Firmendokumente mit Preisen vor. Erstelle einen Angebotsentwurf mit klarer Struktur und setze fuer alle Preise den Platzhalter [Preis bitte ergaenzen] ein.\n\n" +
        "Anfrage des Interessenten:\n" + anfrageText(lead) +
        "\n\nErstelle daraus einen Angebotsentwurf.";

    // Claude aufrufen (gleiches Muster wie Mitarbeiter-Chat)
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
        messages: [{ role: "user", content: userText }],
      }),
    });
    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      console.error("Claude Fehler:", t);
      return NextResponse.json({ error: "Entwurf konnte nicht erzeugt werden." }, { status: 500 });
    }
    const claudeData = await claudeRes.json();
    const blocks: any[] = Array.isArray(claudeData.content) ? claudeData.content : [];
    const entwurf = blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();

    if (!entwurf) {
      return NextResponse.json({ error: "Leerer Entwurf erhalten." }, { status: 500 });
    }

    const jetzt = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("leads")
      .update({
        angebot_entwurf: entwurf,
        angebot_status: "Entwurf",
        angebot_erstellt_am: jetzt,
      })
      .eq("id", id);

    if (updErr) {
      console.error("Speichern fehlgeschlagen:", updErr);
      return NextResponse.json({ error: "Entwurf erzeugt, aber Speichern fehlgeschlagen." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      angebot_entwurf: entwurf,
      angebot_status: "Entwurf",
      angebot_erstellt_am: jetzt,
    });
  } catch (err) {
    console.error("Angebot POST Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}

// =============================== PATCH ======================================
export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const id: string = body?.id;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Keine Lead-ID uebergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // Besitz pruefen
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, owner_user_id")
      .eq("id", id)
      .single();
    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }
    if (lead.owner_user_id !== user.id) {
      return NextResponse.json({ error: "Kein Zugriff auf diesen Lead." }, { status: 403 });
    }

    const update: Record<string, any> = {};
    if (typeof body.angebot_entwurf === "string") update.angebot_entwurf = body.angebot_entwurf;
    if (typeof body.angebot_status === "string") update.angebot_status = body.angebot_status;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Keine Aenderungen uebergeben." }, { status: 400 });
    }

    const { error: updErr } = await supabase.from("leads").update(update).eq("id", id);
    if (updErr) {
      console.error("Speichern fehlgeschlagen:", updErr);
      return NextResponse.json({ error: "Speichern fehlgeschlagen." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ...update });
  } catch (err) {
    console.error("Angebot PATCH Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
