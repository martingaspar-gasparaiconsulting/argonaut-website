// app/api/crm-visitenkarte/route.ts
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C12 Visitenkarte -> KI-Kontakt
// Bild (Base64) -> Claude Vision (claude-sonnet-4-5) -> Kontaktfelder als JSON.
// Vorschlags-Prinzip: KI liest aus, Nutzer bestätigt & legt an.
// -----------------------------------------------------------------------------
import { kiFetch } from '@/lib/ki'
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ERLAUBTE_MEDIA = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const media_type: string =
      typeof body?.media_type === "string" ? body.media_type : "";
    const base64: string = typeof body?.base64 === "string" ? body.base64 : "";
    if (!base64) {
      return NextResponse.json({ error: "Kein Bild übergeben." }, { status: 400 });
    }
    if (!ERLAUBTE_MEDIA.includes(media_type)) {
      return NextResponse.json(
        { error: "Bildformat nicht unterstützt (JPG, PNG, WEBP oder GIF)." },
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

    const SYSTEM_PROMPT =
      "Du liest Visitenkarten aus. Extrahiere die Kontaktdaten exakt so, wie sie auf der Karte stehen - " +
      "erfinde oder ergänze nichts. Trenne Vor- und Nachnamen sinnvoll. Wenn ein Feld nicht erkennbar ist, gib \"\" (leer) zurück. " +
      "Telefonnummern: bevorzuge Mobil, sonst die Hauptnummer. Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown, " +
      "ohne Backticks, ohne Vor-/Nachtext, im Format: " +
      '{"vorname":"","nachname":"","email":"","telefon":"","position":"","firma":"","website":""}. ' +
      "Wenn das Bild keine Visitenkarte ist oder nichts lesbar ist, gib alle Felder leer zurück.";

    const claudeRes = await kiFetch("crm-visitenkarte", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: media_type,
                  data: base64,
                },
              },
              {
                type: "text",
                text: "Lies diese Visitenkarte aus und gib die Kontaktdaten als JSON zurück.",
              },
            ],
          },
        ],
      }),
    });
    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      console.error("Claude Fehler:", t);
      return NextResponse.json(
        { error: "Auslesen fehlgeschlagen." },
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

    const s = (v: any): string =>
      typeof v === "string" ? v.trim() : "";
    const felder = {
      vorname: s(parsed?.vorname),
      nachname: s(parsed?.nachname),
      email: s(parsed?.email),
      telefon: s(parsed?.telefon),
      position: s(parsed?.position),
      firma: s(parsed?.firma),
      website: s(parsed?.website),
    };

    const leer =
      !felder.vorname &&
      !felder.nachname &&
      !felder.email &&
      !felder.telefon &&
      !felder.firma;

    return NextResponse.json({ felder, leer });
  } catch (err: any) {
    console.error("CRM-Visitenkarte Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
