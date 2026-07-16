// app/api/crm-voice/route.ts
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C9 Voice-Memo -> KI-Notiz
// Roh-Transkript -> Claude (claude-sonnet-4-5) -> saubere Aktivität als JSON
// + erkannte Wiedervorlage (relative Angaben in konkretes Datum umgerechnet).
// Vorschlags-Prinzip: KI schlägt vor, Nutzer übernimmt.
// -----------------------------------------------------------------------------
import { kiFetch } from '@/lib/ki'
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const WOCHENTAGE = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

function istDatum(s: any): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const roh: string = typeof body?.roh === "string" ? body.roh : "";
    const heute: string = istDatum(body?.heute)
      ? body.heute
      : new Date().toISOString().slice(0, 10);
    if (!roh.trim()) {
      return NextResponse.json(
        { error: "Kein Text zum Aufbereiten." },
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

    const heuteWochentag = WOCHENTAGE[new Date(heute + "T12:00:00").getDay()];

    const SYSTEM_PROMPT =
      "Du bist ein Assistent, der aus einer gesprochenen, unstrukturierten Rohnotiz eines Verkäufers eine saubere " +
      "CRM-Aktivität macht. Aufgaben: (1) Erkenne den Aktivitätstyp: anruf, email, termin oder notiz. " +
      "(2) Formuliere eine knappe, sachliche Notiz in ganzen Sätzen (dritte Person oder neutral, keine Füllwörter, " +
      "korrigiere offensichtliche Transkriptionsfehler). Erfinde nichts dazu. " +
      "(3) Prüfe, ob eine Wiedervorlage bzw. ein Folgekontakt genannt wird (z. B. 'nächste Woche anrufen', " +
      "'in drei Tagen', 'am Montag melden'). Wenn ja, rechne das relativ zu HEUTE in ein konkretes Datum um " +
      "(Format YYYY-MM-DD) und nenne einen kurzen Grund. Wenn keine genannt wird, gib null zurück. " +
      "Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown, ohne Backticks, ohne Vor-/Nachtext, im Format: " +
      '{"typ":"anruf","notiz":"saubere Notiz","wiedervorlage_datum":"YYYY-MM-DD oder null","wiedervorlage_grund":"kurz oder null"}.';

    const userPrompt =
      "HEUTE ist " + heuteWochentag + ", der " + heute + ".\n\n" +
      "Roh-Notiz (gesprochen/transkribiert):\n\"" + roh.trim() + "\"\n\n" +
      "Gib nur das JSON zurück.";

    const claudeRes = await kiFetch("crm-voice", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      console.error("Claude Fehler:", t);
      return NextResponse.json(
        { error: "Aufbereitung fehlgeschlagen." },
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

    const erlaubtTyp = ["anruf", "email", "termin", "notiz"];
    const ergebnis = {
      typ: erlaubtTyp.includes(parsed?.typ) ? parsed.typ : "notiz",
      notiz:
        typeof parsed?.notiz === "string" && parsed.notiz.trim()
          ? parsed.notiz.trim()
          : roh.trim(),
      wiedervorlage_datum: istDatum(parsed?.wiedervorlage_datum)
        ? parsed.wiedervorlage_datum
        : null,
      wiedervorlage_grund:
        typeof parsed?.wiedervorlage_grund === "string" &&
        parsed.wiedervorlage_grund.trim()
          ? parsed.wiedervorlage_grund.trim()
          : null,
    };

    return NextResponse.json({ ergebnis });
  } catch (err: any) {
    console.error("CRM-Voice Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
