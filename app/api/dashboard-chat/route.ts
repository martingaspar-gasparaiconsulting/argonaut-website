// app/api/dashboard-chat/route.ts
// ============================================================
// ARGONAUT OS · PULS-Chat Backend (Live-Daten-Draht)
// Holt die aktuellen Betriebs-Kennzahlen aus den Tabellen und
// gibt sie der KI als Kontext -> der Chat beantwortet Fragen wie
// "Wie viele Rechnungen sind offen?" mit echten Zahlen.
// Getrennt von /api/mitarbeiter-chat (das macht Dokumenten-RAG).
// Erwartet Body: { messages: [{ role:'user'|'assistant', content }] }
// Antwort: { antwort: string }
// ============================================================
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function eur(n: number): string {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `${Math.round(n || 0)} EUR`;
  }
}

const LEAD_ERLEDIGT = ["gewonnen", "verloren", "abgelehnt", "kunde", "archiviert", "closed"];
const CHANCE_ERLEDIGT = ["gewonnen", "verloren", "closed", "abgeschlossen"];
const AUFTRAG_ERLEDIGT = ["abgeschlossen", "storniert", "erledigt", "abgerechnet"];
const PROJEKT_ERLEDIGT = ["abgeschlossen", "archiviert", "fertig", "closed"];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const roh: any[] = Array.isArray(body?.messages) ? body.messages : [];

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // --- Live-Daten laden (parallel, defensiv) ---
    const [usageR, leadsR, chancenR, auftraegeR, rechnungenR, projekteR, abwR, zeitR, mitarbeiterR] = await Promise.all([
      supabase.from("usage_tracking").select("ki_calls_used, ki_calls_limit").eq("user_id", user.id).order("periode_start", { ascending: false }).limit(1).single(),
      supabase.from("leads").select("id, status"),
      supabase.from("verkaufschancen").select("id, phase, wert"),
      supabase.from("auftraege").select("id, status"),
      supabase.from("rechnungen").select("id, zahlungsstatus, faelligkeitsdatum, brutto_summe, bezahlter_betrag"),
      supabase.from("projekte").select("id, status, archiviert"),
      supabase.from("hr_abwesenheiten").select("id, mitarbeiter_id, typ, von, bis, status"),
      supabase.from("hr_zeiterfassung").select("id, mitarbeiter_id, datum, kommen_um, gehen_um"),
      supabase.from("mitarbeiter").select("id, vorname, nachname, status"),
    ]);

    const leads = leadsR.data || [];
    const chancen = chancenR.data || [];
    const auftraege = auftraegeR.data || [];
    const rechnungen = rechnungenR.data || [];
    const projekte = projekteR.data || [];
    const abwesenheiten = abwR.data || [];
    const zeiten = zeitR.data || [];
    const mitarbeiter = mitarbeiterR.data || [];

    const low = (s: any) => String(s || "").toLowerCase();
    const heute = new Date().toISOString().slice(0, 10);

    const maName: Record<string, string> = {};
    for (const m of mitarbeiter as any[]) {
      maName[m.id] = [m.vorname, m.nachname].filter(Boolean).join(" ") || "Mitarbeiter";
    }

    // Kennzahlen
    const leadsOffen = leads.filter((l: any) => !LEAD_ERLEDIGT.includes(low(l.status))).length;
    const chancenAktiv = chancen.filter((c: any) => !CHANCE_ERLEDIGT.includes(low(c.phase)));
    const chancenSumme = chancenAktiv.reduce((s: number, c: any) => s + (Number(c.wert) || 0), 0);
    const auftraegeOffen = auftraege.filter((a: any) => !AUFTRAG_ERLEDIGT.includes(low(a.status))).length;

    const rechnOffen = rechnungen.filter((r: any) => ["offen", "teilbezahlt"].includes(low(r.zahlungsstatus)));
    const rechnOffenSumme = rechnOffen.reduce((s: number, r: any) => s + ((Number(r.brutto_summe) || 0) - (Number(r.bezahlter_betrag) || 0)), 0);
    const rechnUeberfaellig = rechnOffen.filter((r: any) => r.faelligkeitsdatum && String(r.faelligkeitsdatum).slice(0, 10) < heute).length;
    const umsatzBezahlt = rechnungen.reduce((s: number, r: any) => s + (Number(r.bezahlter_betrag) || 0), 0);

    const projekteLaufend = projekte.filter((p: any) => !p.archiviert && !PROJEKT_ERLEDIGT.includes(low(p.status))).length;

    const kranke = abwesenheiten.filter((a: any) => {
      const istKrank = low(a.typ).includes("krank");
      const von = a.von ? String(a.von).slice(0, 10) : null;
      const bis = a.bis ? String(a.bis).slice(0, 10) : von;
      const aktiv = von && bis && von <= heute && heute <= bis;
      return istKrank && aktiv && !["abgelehnt", "storniert"].includes(low(a.status));
    });
    const krankeNamen = kranke.map((a: any) => maName[a.mitarbeiter_id] || "Mitarbeiter");
    const eingestempelt = zeiten.filter((z: any) => z.datum && String(z.datum).slice(0, 10) === heute && z.kommen_um && !z.gehen_um).length;

    const mitarbeiterAktiv = mitarbeiter.filter((m: any) => low(m.status) === "aktiv").length || mitarbeiter.length;

    const kiUsed = usageR.data?.ki_calls_used ?? 0;
    const kiLimit = usageR.data?.ki_calls_limit ?? 15000;

    // --- Live-Kontext fuer die KI ---
    const liveDaten =
`AKTUELLE BETRIEBSDATEN (Live-Stand, Datum ${heute}):
- Offene Leads: ${leadsOffen} (insgesamt ${leads.length} Leads erfasst)
- Aktive Verkaufschancen: ${chancenAktiv.length}, Pipeline-Wert: ${eur(chancenSumme)}
- Offene Aufträge: ${auftraegeOffen} (insgesamt ${auftraege.length})
- Offene Rechnungen: ${rechnOffen.length}, offener Betrag: ${eur(rechnOffenSumme)}
- Davon überfällig: ${rechnUeberfaellig}
- Bereits bezahlter Umsatz (Summe aller Zahlungseingänge): ${eur(umsatzBezahlt)}
- Laufende Projekte: ${projekteLaufend} (insgesamt ${projekte.length})
- Mitarbeiter: ${mitarbeiterAktiv} aktiv (insgesamt ${mitarbeiter.length} erfasst)
- Aktuell krankgemeldet: ${kranke.length}${krankeNamen.length ? " (" + krankeNamen.join(", ") + ")" : ""}
- Jetzt eingestempelt (im Dienst): ${eingestempelt}
- KI-Calls diesen Monat: ${kiUsed} von ${kiLimit}`;

    const SYSTEM_PROMPT =
`Du bist der ARGONAUT KI-Assistent im Dashboard des Betriebsinhabers. Du hilfst ihm, seinen Betrieb auf einen Blick zu verstehen und schnelle Antworten zu seinen aktuellen Zahlen zu geben.

Dir liegen die aktuellen Live-Kennzahlen aus seinem System vor (siehe unten). Beantworte Fragen dazu präzise, freundlich und auf Deutsch. Nenne konkrete Zahlen aus den Daten. Wenn eine gewünschte Information NICHT in den Kennzahlen steht, sage das ehrlich und weise ggf. auf das passende Modul im Dashboard hin (z. B. Rechnungen, Leads, Personal, Projekte).

Halte dich kurz und klar (in der Regel unter 120 Wörtern). Schreibe in einfachen, klaren Absätzen.

WICHTIG — Formatierung: Verwende KEINE Markdown-Zeichen. Keine Sternchen für Fettschrift (** oder *), keine Rauten (#), keine Backticks. Wenn du etwas aufzählst, schreibe jeden Punkt in eine eigene Zeile, die mit einem Spiegelstrich (–) beginnt. Trenne Gedanken durch normale Absätze (Leerzeile). Deine Antworten werden teils laut vorgelesen — schreibe deshalb ausschließlich natürlichen Fließtext ohne Sonderzeichen-Formatierung.

Nenne dich immer "ARGONAUT-Assistent" und niemals einen anderen Namen.

${liveDaten}`;

    // --- Nachrichtenverlauf fuer die KI aufbereiten (Anthropic-konform) ---
    let verlauf = roh
      .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.trim() }));
    // Fuehrende Assistant-Nachrichten entfernen (z. B. Willkommensgruss)
    while (verlauf.length && verlauf[0].role === "assistant") verlauf.shift();
    // Aufeinanderfolgende gleiche Rollen zusammenfassen (Alternierung erzwingen)
    const messages: any[] = [];
    for (const m of verlauf) {
      if (messages.length && messages[messages.length - 1].role === m.role) {
        messages[messages.length - 1].content += "\n" + m.content;
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }
    if (messages.length === 0) {
      return NextResponse.json({ error: "Keine Nachricht übergeben." }, { status: 400 });
    }

    // --- KI aufrufen ---
    const kiRes = await fetch("https://api.anthropic.com/v1/messages", {
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
        messages,
      }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error("Dashboard-Chat KI-Fehler:", t);
      return NextResponse.json({ error: "Antwort fehlgeschlagen." }, { status: 500 });
    }

    const kiData = await kiRes.json();
    const blocks: any[] = Array.isArray(kiData.content) ? kiData.content : [];
    const antwort = blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("").trim();

    return NextResponse.json({ antwort: antwort || "Dazu habe ich gerade keine Antwort." });
  } catch (err: any) {
    console.error("Dashboard-Chat Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
