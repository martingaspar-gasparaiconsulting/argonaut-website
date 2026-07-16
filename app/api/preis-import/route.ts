// app/api/preis-import/route.ts
// ============================================================
// ARGONAUT OS · ERP · Preis-Import "KI räumt auf" (Etappe 2, Baustein 2a)
// Nimmt beliebigen ROHTEXT (aus CSV/Excel/PDF/Word/Zettel kopiert) und
// liefert saubere, rechenbare Artikel zurueck:
//   { artikel: [ { artikelnummer, bezeichnung, einheit,
//                  einkaufspreis, verkaufspreis, kategorie } ] }
// Gleiches Muster wie /api/ki-klartext: direkter fetch, kein SDK,
// model claude-sonnet-4-5, Auth-Check, "die KI" = ARGONAUT (nie "Claude").
// Schreibt NICHTS in die DB - das macht die Vorschau im Client (2a-2).
// ============================================================
import { kiFetch } from '@/lib/ki'
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Deutsche wie englische Zahlen robust zu number|null machen.
// "12,80" -> 12.8 · "1.234,56" -> 1234.56 · "12.80" -> 12.8 · "" -> null
function zahl(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s === "") return null;
  s = s.replace(/[€\s]/g, "");
  const hatKomma = s.includes(",");
  const hatPunkt = s.includes(".");
  if (hatKomma && hatPunkt) {
    // deutsches Format: Punkt = Tausender, Komma = Dezimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hatKomma) {
    // nur Komma -> Dezimaltrenner
    s = s.replace(",", ".");
  }
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : null;
}

function text(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Rohantwort der KI robust in ein Array von Objekten verwandeln.
function extrahiereJson(roh: string): any[] {
  let s = roh.trim();
  // ```json ... ``` Zaeune entfernen
  s = s.replace(/```json/gi, "").replace(/```/g, "").trim();
  // Nur den Teil vom ersten [ bis zum letzten ] nehmen
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

    const SYSTEM_PROMPT = `Du bist ARGONAUT, ein Assistent, der unordentliche Artikel- und Preislisten in saubere Daten verwandelt. Der Betriebsinhaber fügt dir eine Liste ein, die aus Excel, einer PDF, einem Word-Dokument oder handschriftlichen Notizen stammen kann. Deine Aufgabe: erkenne die einzelnen Artikel und gib sie sauber strukturiert zurück.

Gib AUSSCHLIESSLICH ein JSON-Array zurück. Kein Fließtext, keine Erklärung, keine Markdown-Zäune. Jedes Element hat exakt diese Felder:
- "artikelnummer": Artikel-/Bestellnummer als Text, oder null wenn keine erkennbar.
- "bezeichnung": der Name des Artikels als Text (Pflicht, niemals null).
- "einheit": Mengeneinheit als Text (z.B. "Stück", "Kanister", "Meter", "kg", "Ster"). Wenn nichts erkennbar, "Stück".
- "einkaufspreis": Einkaufs-/Netto-Einkaufspreis als Zahl, oder null. Punkt als Dezimaltrenner, keine Tausenderpunkte, kein Währungszeichen. Beispiel: 12.80
- "verkaufspreis": Verkaufspreis als Zahl, oder null. Gleiches Zahlenformat.
- "kategorie": eine sinnvolle Warengruppe als Text, oder null.

Regeln:
- Erfinde nichts. Ist ein Wert nicht erkennbar, setze null (bei "bezeichnung" und "einheit" gelten die Ausnahmen oben).
- Übernimm Preise exakt wie angegeben, nur ins Zahlenformat mit Punkt umgewandelt.
- Kopf-/Titelzeilen, Zwischensummen, Leerzeilen und offensichtlichen Fließtext ignorierst du.
- Wenn unklar ist, ob eine Zahl Einkauf oder Verkauf ist und nur ein Preis dasteht, ordne ihn dem Verkaufspreis zu.
- Gib das Array auch dann zurück, wenn nur ein einziger Artikel erkennbar ist. Ist gar kein Artikel erkennbar, gib [] zurück.`;

    const kiRes = await kiFetch("preis-import", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Hier ist die Liste:\n\n${rohtext}` }],
      }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error("Preis-Import KI-Fehler:", t);
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
      console.error("Preis-Import JSON-Parsefehler:", e, "Rohantwort:", roh.slice(0, 500));
      return NextResponse.json(
        { error: "Die Liste konnte nicht sauber gelesen werden. Bitte Format prüfen." },
        { status: 422 }
      );
    }

    // Normalisieren + validieren (Bezeichnung ist Pflicht)
    const artikel = rohListe
      .map((r) => {
        const bezeichnung = text(r?.bezeichnung);
        if (!bezeichnung) return null;
        return {
          artikelnummer: text(r?.artikelnummer),
          bezeichnung,
          einheit: text(r?.einheit) || "Stück",
          einkaufspreis: zahl(r?.einkaufspreis),
          verkaufspreis: zahl(r?.verkaufspreis),
          kategorie: text(r?.kategorie),
        };
      })
      .filter((x) => x !== null);

    return NextResponse.json({ artikel });
  } catch (err: any) {
    console.error("Preis-Import Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
