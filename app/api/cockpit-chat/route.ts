// app/api/cockpit-chat/route.ts
// ============================================================
// ARGONAUT OS · Chef-Cockpit · Etappe 2 + 3
// Etappe 2: beantwortet Rueckfragen des Chefs zu seinen Live-Kennzahlen.
// Etappe 3: erkennt ausserdem BEFEHLE ("Leg Thomas eine Aufgabe an", "Team-
//           Nachricht an die Gruppe", "Wiedervorlage fuer Kunde X") und gibt dann
//           statt einer Antwort einen strukturierten AKTIONS-VORSCHLAG zurueck.
//           Ausgefuehrt wird NICHTS hier — das passiert erst nach Bestaetigung
//           des Chefs ueber /api/cockpit-action.
// Muster identisch zu /api/dashboard-chat (direkter fetch an Anthropic).
//
// Body:    { kontext: string, messages: [{ role:'user'|'assistant', content }] }
// Antwort: { antwort: string }                      -> normale Rueckfrage (wird vorgelesen)
//     oder { aktion: {...}, klartext: string }       -> Befehl erkannt, Bestaetigung noetig
// ============================================================
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const kontext: string = typeof body?.kontext === "string" ? body.kontext : "";
    const roh: any[] = Array.isArray(body?.messages) ? body.messages : [];

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // Heutiges Datum fuer die KI (damit "naechsten Montag" -> echtes Datum wird)
    const jetzt = new Date();
    const heuteIso = jetzt.toISOString().slice(0, 10);
    const heuteText = jetzt.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

    const SYSTEM_PROMPT =
`Du bist der ARGONAUT-Assistent im Chef-Cockpit des Betriebsinhabers. Der Chef hat gerade seinen Tagesbericht gesehen. Er kann dir entweder eine FRAGE stellen oder einen BEFEHL geben.

Heute ist ${heuteText} (${heuteIso}).

Dir liegen die aktuellen Live-Kennzahlen seines Betriebs vor (siehe unten).

=== DEINE ZWEI MODI ===

MODUS A — FRAGE beantworten:
Wenn der Chef eine Information wissen will, antworte praezise, freundlich und auf Deutsch. Nenne konkrete Zahlen und Namen aus den Daten. Steht eine Information NICHT in den Kennzahlen, sage das ehrlich und weise auf das passende Modul hin (Rechnungen, Leads, Personal, Projekte, Mahnwesen).

MODUS B — BEFEHL ausfuehren lassen:
Wenn der Chef dich bittet, intern etwas ZU TUN, fuehre es NICHT selbst aus. Gib stattdessen einen Aktions-Vorschlag zurueck, den der Chef danach mit einem Klick bestaetigt. Es gibt genau drei erlaubte Aktionen:

1) aufgabe_anlegen  — eine Aufgabe/To-do anlegen (optional fuer einen Mitarbeiter, optional mit Faelligkeit)
2) team_nachricht   — eine Nachricht in einen Team-Chat-Kanal schreiben
3) wiedervorlage    — bei einem Kunden/Kontakt ein Wiedervorlage-Datum setzen ("naechster Kontakt")

=== ANTWORTFORMAT (streng) ===

Bei MODUS A antworte NUR mit diesem JSON (nichts davor, nichts danach):
{"modus":"frage","antwort":"<deine Antwort als natuerlicher Fliesstext ohne Sonderzeichen>"}

Bei MODUS B antworte NUR mit diesem JSON:
{"modus":"aktion","klartext":"<eine kurze, klare Bestaetigungsfrage an den Chef, z. B. 'Ich lege fuer Thomas die Aufgabe \\"Angebot Mueller pruefen\\" an. Ausfuehren?'>","aktion":{ ... }}

Die "aktion" hat je nach Typ diese Felder:
- aufgabe_anlegen: {"typ":"aufgabe_anlegen","titel":"<Pflicht>","beschreibung":"<optional>","mitarbeiter_name":"<optional, nur der genannte Name>","prioritaet":"<optional: normal|hoch|niedrig>","faellig_am":"<optional, Format YYYY-MM-DD>"}
- team_nachricht:  {"typ":"team_nachricht","text":"<Pflicht: der Nachrichtentext>","kanal_name":"<optional, falls der Chef einen Kanal nennt>"}
- wiedervorlage:   {"typ":"wiedervorlage","kontakt_name":"<Pflicht: Name oder Firma>","datum":"<Pflicht, Format YYYY-MM-DD>","notiz":"<optional>"}

REGELN fuer Befehle:
- Formuliere den "titel" einer Aufgabe IMMER als kurze, praegnante To-do-Ueberschrift (maximal ca. 6 Woerter) — NICHT den ganzen Satz des Chefs. Beispiel: aus "Kannst du bitte fuer Franz eine Aufgabe anlegen, dass er die ueberfaelligen Rechnungen prueft" wird der Titel "Ueberfaellige Rechnungen pruefen". Zusaetzlichen Kontext oder Details packst du in "beschreibung".
- Rechne relative Datumsangaben ("morgen", "naechsten Montag", "in 3 Tagen") immer in ein echtes Datum YYYY-MM-DD um, ausgehend von heute (${heuteIso}).
- Uebernimm Namen genau so, wie der Chef sie sagt (z. B. nur "Thomas"). Erfinde KEINE Nachnamen und KEINE Daten.
- Fehlt bei einem Befehl eine Pflichtangabe (z. B. der Nachrichtentext, das Datum oder der Kontaktname), dann nutze MODUS A und frage kurz nach, statt eine unvollstaendige Aktion zu bauen.
- Formuliere den "klartext" immer als kurze Ja/Nein-Ruecksicherung, damit der Chef genau sieht, was passieren wird.

WICHTIG — Formatierung im Feld "antwort": KEINE Markdown-Zeichen, keine Sternchen, keine Rauten, keine Backticks. Nur natuerlicher Fliesstext, da er teils laut vorgelesen wird. Nenne dich immer "ARGONAUT-Assistent".

Gib IMMER nur das reine JSON-Objekt zurueck, ohne Code-Bloecke, ohne Erklaerung drumherum.

AKTUELLE BETRIEBSDATEN (Live-Stand):
${kontext}`;

    // Nachrichtenverlauf Anthropic-konform aufbereiten
    let verlauf = roh
      .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.trim() }));
    while (verlauf.length && verlauf[0].role === "assistant") verlauf.shift();

    const messages: any[] = [];
    for (const m of verlauf) {
      if (messages.length && messages[messages.length - 1].role === m.role) {
        messages[messages.length - 1].content += "\n" + m.content;
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }
    if (messages.length === 0) {
      return NextResponse.json({ error: "Keine Nachricht uebergeben." }, { status: 400 });
    }

    const kiRes = await fetch("https://api.anthropic.com/v1/messages", {
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
        messages,
      }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error("Cockpit-Chat KI-Fehler:", t);
      return NextResponse.json({ error: "Antwort fehlgeschlagen." }, { status: 500 });
    }

    const kiData = await kiRes.json();
    const blocks: any[] = Array.isArray(kiData.content) ? kiData.content : [];
    const rohText = blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();

    // JSON robust aus der Antwort ziehen (wie in den anderen KI-Routen bewaehrt)
    const parsed = extrahiereJson(rohText);

    // Befehl erkannt -> Aktions-Vorschlag zurueckgeben (NICHTS wird ausgefuehrt)
    if (parsed && parsed.modus === "aktion" && parsed.aktion && typeof parsed.aktion.typ === "string") {
      const erlaubt = ["aufgabe_anlegen", "team_nachricht", "wiedervorlage"];
      if (erlaubt.includes(parsed.aktion.typ)) {
        const klartext = typeof parsed.klartext === "string" && parsed.klartext.trim()
          ? parsed.klartext.trim()
          : "Ich moechte eine Aktion ausfuehren. Soll ich?";
        return NextResponse.json({ aktion: parsed.aktion, klartext });
      }
    }

    // sonst normale Antwort (Frage-Modus oder Fallback)
    let antwort = "";
    if (parsed && typeof parsed.antwort === "string") {
      antwort = parsed.antwort.trim();
    } else {
      // Fallback: falls die KI doch kein sauberes JSON lieferte, nimm den Rohtext
      antwort = rohText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    }

    return NextResponse.json({ antwort: antwort || "Dazu habe ich gerade keine Antwort." });
  } catch (err: any) {
    console.error("Cockpit-Chat Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}

// Zieht das erste saubere JSON-Objekt aus einem KI-Text (toleriert Code-Bloecke / Text drumherum)
function extrahiereJson(text: string): any | null {
  if (!text) return null;
  let t = text.trim();
  // Code-Bloecke entfernen
  t = t.replace(/```json/gi, "").replace(/```/g, "").trim();
  // direkter Versuch
  try { return JSON.parse(t); } catch { /* weiter */ }
  // erstes {...} herausschneiden
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const kern = t.slice(start, end + 1);
    try { return JSON.parse(kern); } catch { /* nichts */ }
  }
  return null;
}
