// app/api/cockpit-chat/route.ts
// ============================================================
// ARGONAUT OS · Chef-Cockpit · Etappe 2 + 3
// Etappe 2: beantwortet Rueckfragen des Chefs zu seinen Live-Kennzahlen.
// Etappe 3: erkennt BEFEHLE und gibt einen strukturierten AKTIONS-VORSCHLAG zurueck.
//           Aufgaben koennen jetzt als LISTE kommen, je Aufgabe ein Empfaenger
//           (eine Person, eine ganze Abteilung oder alle). Ausgefuehrt wird NICHTS
//           hier — das passiert erst nach Bestaetigung ueber /api/cockpit-action.
//
// Body:    { kontext: string, messages: [{ role, content }] }
// Antwort: { antwort: string }                 -> Rueckfrage (wird vorgelesen)
//     oder { aktion: {...}, klartext: string }  -> Befehl erkannt, Bestaetigung noetig
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

    const jetzt = new Date();
    const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
    const isoVon = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const WT = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    const heuteIso = isoVon(jetzt);
    const heuteText = `${WT[jetzt.getDay()]}, ${pad(jetzt.getDate())}.${pad(jetzt.getMonth() + 1)}.${jetzt.getFullYear()}`;
    // Fertige Datumstabelle: die KI soll NICHT selbst rechnen, sondern hier ablesen.
    const datumsZeilen: string[] = [];
    for (let i = 0; i <= 16; i++) {
      const d = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + i);
      const label = i === 0 ? " (heute)" : i === 1 ? " (morgen)" : i === 2 ? " (uebermorgen)" : "";
      datumsZeilen.push(`${WT[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} = ${isoVon(d)}${label}`);
    }
    const datumsTabelle = datumsZeilen.join("\n");

    const SYSTEM_PROMPT =
`Du bist der ARGONAUT-Assistent im Chef-Cockpit des Betriebsinhabers. Der Chef kann dir eine FRAGE stellen oder einen BEFEHL geben.

Heute ist ${heuteText} (${heuteIso}).

DATUMS-TABELLE (nutze fuer JEDES Datum AUSSCHLIESSLICH diese Tabelle — rechne NIEMALS selbst):
${datumsTabelle}
Ein Wochentag ohne Wochenangabe (z. B. "bis Freitag", "am Montag") = der NAECHSTE passende Eintrag aus der Tabelle. "naechste Woche <Tag>" = der uebernaechste passende Eintrag. Liegt das gewuenschte Datum ausserhalb der Tabelle, frage lieber kurz nach.

Dir liegen die aktuellen Live-Kennzahlen seines Betriebs vor (siehe unten).

=== DEINE ZWEI MODI ===

MODUS A — FRAGE beantworten:
Antworte praezise, freundlich und auf Deutsch. Nenne konkrete Zahlen und Namen aus den Daten. Steht etwas NICHT in den Kennzahlen, sage das ehrlich und weise auf das passende Modul hin (Rechnungen, Leads, Personal, Projekte, Mahnwesen).

MODUS B — BEFEHL ausfuehren lassen:
Wenn der Chef dich bittet, intern etwas ZU TUN, fuehre es NICHT selbst aus. Gib einen Aktions-Vorschlag zurueck, den der Chef mit einem Klick bestaetigt. Es gibt drei erlaubte Aktionen:
1) aufgabe_anlegen  — eine ODER MEHRERE Aufgaben anlegen; je Aufgabe ein Empfaenger
2) team_nachricht   — eine Nachricht in einen Team-Chat-Kanal schreiben
3) wiedervorlage    — bei einem Kunden/Kontakt ein Wiedervorlage-Datum setzen

=== ANTWORTFORMAT (streng, nur reines JSON) ===

MODUS A:
{"modus":"frage","antwort":"<Fliesstext ohne Sonderzeichen>"}

MODUS B:
{"modus":"aktion","klartext":"<kurze Ja/Nein-Ruecksicherung, die JEDE geplante Aufgabe mit Empfaenger und Datum auflistet>","aktion":{ ... }}

Aktions-Felder je Typ:
- aufgabe_anlegen: {"typ":"aufgabe_anlegen","aufgaben":[ {"titel":"<Pflicht, kurz>","beschreibung":"<optional>","prioritaet":"<optional: normal|hoch|niedrig>","faellig_am":"<optional YYYY-MM-DD>","mitarbeiter_name":"<optional: EINE Person>","abteilung":"<optional: ganze Abteilung, z. B. Werkstatt, Buero>","an_alle":<optional true>} ] }
- team_nachricht:  {"typ":"team_nachricht","text":"<Pflicht>","kanal_name":"<optional>"}
- wiedervorlage:   {"typ":"wiedervorlage","kontakt_name":"<Pflicht>","datum":"<Pflicht, YYYY-MM-DD>","notiz":"<optional>"}

REGELN fuer aufgabe_anlegen:
- Baue IMMER das Array "aufgaben". Nennt der Chef mehrere Aufgaben, lege pro Aufgabe ein eigenes Objekt an.
- Empfaenger je Aufgabe: GENAU EINES von mitarbeiter_name (eine Person), abteilung (ganze Abteilung) oder an_alle:true (alle Mitarbeiter). Nennt der Chef keinen Empfaenger, lass alle drei Felder weg (Aufgabe ohne Zuweisung).
- Titel IMMER kurz und praegnant (max ca. 6 Woerter) — NICHT den ganzen Satz. Details gehoeren in "beschreibung".
- Uebernimm Namen/Abteilungen genau wie gesagt. Erfinde KEINE Nachnamen.

ALLGEMEINE REGELN fuer Befehle:
- Setze Datumsangaben (faellig_am / datum) IMMER als YYYY-MM-DD aus der DATUMS-TABELLE oben. Rechne Wochentage NIEMALS selbst — lies den passenden Eintrag ab.
- Fehlt eine Pflichtangabe (z. B. Nachrichtentext, Datum, Kontaktname), nutze MODUS A und frage kurz nach, statt eine unvollstaendige Aktion zu bauen.
- Der "klartext" ist deine Sicherheits-Rueckfrage: liste darin JEDE geplante Aufgabe knapp mit Empfaenger und (falls vorhanden) Datum, damit der Chef vor dem Ja genau sieht, was passiert. Beispiel: "Ich lege 2 Aufgaben an: 'Rechnungen pruefen' fuer Franz Gaspar bis Fr, 11.07., und 'Lager aufraeumen' fuer die Abteilung Werkstatt. Ausfuehren?"

WICHTIG — Formatierung im Feld "antwort": KEINE Markdown-Zeichen, keine Sternchen, keine Rauten, keine Backticks. Nur natuerlicher Fliesstext (wird teils vorgelesen). Nenne dich immer "ARGONAUT-Assistent".

Gib IMMER nur das reine JSON-Objekt zurueck, ohne Code-Bloecke und ohne Text drumherum.

AKTUELLE BETRIEBSDATEN (Live-Stand):
${kontext}`;

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
        max_tokens: 1200,
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

    const parsed = extrahiereJson(rohText);

    if (parsed && parsed.modus === "aktion" && parsed.aktion && typeof parsed.aktion.typ === "string") {
      const erlaubt = ["aufgabe_anlegen", "team_nachricht", "wiedervorlage"];
      if (erlaubt.includes(parsed.aktion.typ)) {
        const klartext = typeof parsed.klartext === "string" && parsed.klartext.trim()
          ? parsed.klartext.trim()
          : "Ich moechte eine Aktion ausfuehren. Soll ich?";
        return NextResponse.json({ aktion: parsed.aktion, klartext });
      }
    }

    let antwort = "";
    if (parsed && typeof parsed.antwort === "string") {
      antwort = parsed.antwort.trim();
    } else {
      antwort = rohText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    }

    return NextResponse.json({ antwort: antwort || "Dazu habe ich gerade keine Antwort." });
  } catch (err: any) {
    console.error("Cockpit-Chat Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}

function extrahiereJson(text: string): any | null {
  if (!text) return null;
  let t = text.trim();
  t = t.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(t); } catch { /* weiter */ }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const kern = t.slice(start, end + 1);
    try { return JSON.parse(kern); } catch { /* nichts */ }
  }
  return null;
}
