// app/api/lieferanten-import/route.ts
// ============================================================
// ARGONAUT OS · ERP · Lieferanten-Import "KI räumt auf" (Punkt 1, L-1)
// Nimmt beliebigen ROHTEXT (aus CSV/Excel/PDF/Word/Visitenkarte kopiert)
// und liefert saubere Lieferanten-Kontakte zurück:
//   { lieferanten: [ { name, ansprechpartner, email, telefon,
//                      adresse, website, kundennummer } ] }
// Gleiches Muster wie /api/preis-import: direkter fetch, kein SDK,
// model claude-sonnet-5, Auth-Check, "die KI" = ARGONAUT (nie "Claude").
// Schreibt NICHTS in die DB - das macht die Vorschau im Client (L-2).
// ============================================================
import { kiFetch } from '@/lib/ki'
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function text(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Rohantwort der KI robust in ein Array von Objekten verwandeln.
function extrahiereJson(roh: string): any[] {
  let s = roh.trim();
  s = s.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  const parsed = JSON.parse(s);
  return Array.isArray(parsed) ? parsed : [];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rohtext = typeof body?.rohtext === "string" ? body.rohtext.trim() : "";

    if (!rohtext) {
      return NextResponse.json({ error: "Kein Text übergeben." }, { status: 400 });
    }
    if (rohtext.length > 20000) {
      return NextResponse.json(
        { error: "Text zu lang. Bitte in kleineren Portionen einlesen." },
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

    const SYSTEM_PROMPT = `Du bist ARGONAUT, ein Assistent, der unordentliche Lieferanten- und Kontaktlisten in saubere Daten verwandelt. Der Betriebsinhaber fügt dir eine Liste ein, die aus Excel, einer PDF, einem Word-Dokument, abgetippten Visitenkarten oder E-Mail-Signaturen stammen kann. Deine Aufgabe: erkenne die einzelnen Lieferanten/Firmen und gib sie sauber strukturiert zurück.

Gib AUSSCHLIESSLICH ein JSON-Array zurück. Kein Fließtext, keine Erklärung, keine Markdown-Zäune. Jedes Element hat exakt diese Felder:
- "name": der Firmen-/Lieferantenname als Text (Pflicht, niemals null).
- "ansprechpartner": Name der Kontaktperson, oder null.
- "email": E-Mail-Adresse, oder null.
- "telefon": Telefonnummer als Text (Schreibweise übernehmen), oder null.
- "adresse": vollständige Anschrift in einer Zeile (Straße, PLZ, Ort), oder null.
- "website": Web-Adresse, oder null.
- "kundennummer": die eigene Kundennummer beim Lieferanten, oder null.

Regeln:
- Erfinde nichts. Ist ein Wert nicht erkennbar, setze null (Ausnahme: "name" ist Pflicht).
- Kopf-/Titelzeilen, Spaltenüberschriften, Zwischensummen, Leerzeilen und offensichtlichen Fließtext ignorierst du.
- Wenn zu einer Firma mehrere Personen genannt sind, nimm die erste als "ansprechpartner".
- Trenne Firmenname und Ansprechpartner sauber: Der Firmenname gehört in "name", die Person in "ansprechpartner".
- Gib das Array auch dann zurück, wenn nur ein einziger Lieferant erkennbar ist. Ist gar kein Lieferant erkennbar, gib [] zurück.`;

    const kiRes = await kiFetch("lieferanten-import", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Hier ist die Liste:\n\n${rohtext}` }],
      }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error("Lieferanten-Import KI-Fehler:", t);
      return NextResponse.json({ error: "Aufbereitung fehlgeschlagen." }, { status: 500 });
    }

    const kiData = await kiRes.json();
    const blocks: any[] = Array.isArray(kiData.content) ? kiData.content : [];
    const roh = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("")
      .trim();

    let rohListe: any[] = [];
    try {
      rohListe = extrahiereJson(roh);
    } catch (e) {
      console.error("Lieferanten-Import JSON-Parsefehler:", e, "Rohantwort:", roh.slice(0, 500));
      return NextResponse.json(
        { error: "Die Liste konnte nicht sauber gelesen werden. Bitte Format prüfen." },
        { status: 422 }
      );
    }

    // Normalisieren + validieren (Name ist Pflicht)
    const lieferanten = rohListe
      .map((r) => {
        const name = text(r?.name);
        if (!name) return null;
        return {
          name,
          ansprechpartner: text(r?.ansprechpartner),
          email: text(r?.email),
          telefon: text(r?.telefon),
          adresse: text(r?.adresse),
          website: text(r?.website),
          kundennummer: text(r?.kundennummer),
        };
      })
      .filter((x) => x !== null);

    return NextResponse.json({ lieferanten });
  } catch (err: any) {
    console.error("Lieferanten-Import Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
