// app/api/crm-nba/route.ts
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C11 KI-Next-Best-Action (Wochenfokus)
// Vorgefilterte Kandidaten (Server, RLS) -> Claude (claude-sonnet-4-5)
// -> priorisierte Wochenliste als JSON (wer, warum jetzt, empfohlene Aktion).
// Kein RAG nötig - arbeitet auf den CRM-Daten des Nutzers.
// -----------------------------------------------------------------------------
import { kiFetch } from '@/lib/ki'
import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function tageSeit(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function datumKurz(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export async function POST(_req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // ---- Kontakte laden (RLS) ----
    const { data: kontakteRaw } = await supabase
      .from("kontakte")
      .select(
        "id, vorname, nachname, firma, status, letzter_kontakt_am, naechster_kontakt_am, betreuungs_intervall_tage"
      );
    const kontakte = (kontakteRaw as any[]) || [];

    // ---- Offene Verkaufschancen je Kontakt ----
    const { data: chancenRaw } = await supabase
      .from("verkaufschancen")
      .select("kontakt_id, titel, phase, wert, wahrscheinlichkeit");
    const offenePhasen = ["erstkontakt", "qualifiziert", "angebot", "verhandlung"];
    const chancenMap: Record<string, any[]> = {};
    ((chancenRaw as any[]) || []).forEach((c) => {
      if (c.kontakt_id && offenePhasen.includes(c.phase)) {
        if (!chancenMap[c.kontakt_id]) chancenMap[c.kontakt_id] = [];
        chancenMap[c.kontakt_id].push(c);
      }
    });

    const jetzt = Date.now();

    // ---- Kandidaten bestimmen ----
    type Kandidat = {
      id: string;
      name: string;
      firma: string;
      status: string;
      grund: string[];
      score: number;
    };
    const kandidaten: Kandidat[] = [];

    for (const k of kontakte) {
      const name =
        [k.vorname, k.nachname].filter(Boolean).join(" ") || k.firma || "Unbenannt";
      const gruende: string[] = [];
      let score = 0;

      // Wiedervorlage fällig
      if (
        k.naechster_kontakt_am &&
        new Date(k.naechster_kontakt_am).getTime() <= jetzt
      ) {
        gruende.push("Wiedervorlage fällig seit " + datumKurz(k.naechster_kontakt_am));
        score += 50;
      }

      // Ampel (Betreuungs-Intervall überschritten)
      const tage = tageSeit(k.letzter_kontakt_am);
      const iv = k.betreuungs_intervall_tage || 30;
      if (tage === null) {
        gruende.push("Noch nie kontaktiert");
        score += 15;
      } else if (tage > iv * 2) {
        gruende.push("Überfällig – seit " + tage + " Tagen kein Kontakt");
        score += 40;
      } else if (tage > iv) {
        gruende.push("Bald fällig – seit " + tage + " Tagen kein Kontakt");
        score += 20;
      }

      // Offene Chancen
      const chancen = chancenMap[k.id] || [];
      if (chancen.length > 0) {
        const summe = chancen.reduce(
          (s: number, c: any) => s + (Number(c.wert) || 0),
          0
        );
        gruende.push(
          chancen.length +
            " offene Verkaufschance(n) im Wert von " +
            Math.round(summe) +
            " EUR"
        );
        score += 25 + Math.min(25, Math.round(summe / 1000));
      }

      if (gruende.length > 0) {
        kandidaten.push({
          id: k.id,
          name,
          firma: k.firma || "",
          status: k.status || "",
          grund: gruende,
          score,
        });
      }
    }

    // Nichts zu tun
    if (kandidaten.length === 0) {
      return NextResponse.json({ liste: [], leer: true });
    }

    // Vorsortieren + auf max. 15 begrenzen (Prompt-Größe)
    kandidaten.sort((a, b) => b.score - a.score);
    const top = kandidaten.slice(0, 15);

    const kandidatenText = top
      .map(
        (k, i) =>
          i +
          1 +
          ". [id:" +
          k.id +
          "] " +
          k.name +
          (k.firma ? " (" + k.firma + ")" : "") +
          (k.status ? " · Status: " + k.status : "") +
          "\n   Gründe: " +
          k.grund.join("; ")
      )
      .join("\n");

    const SYSTEM_PROMPT =
      "Du bist ein Vertriebs-Coach. Du erhältst eine Liste von Kontakten, bei denen aus CRM-Sicht Handlungsbedarf besteht, " +
      "jeweils mit einer id und den Gründen. Priorisiere sie zu einer Wochen-Fokusliste: Welche Kontakte sollte der Verkäufer " +
      "diese Woche zuerst angehen? Für jeden gibst du eine kurze, konkrete Handlungsempfehlung (z. B. 'anrufen und Angebot " +
      "nachfassen') und eine Dringlichkeit (hoch/mittel/niedrig). Erfinde keine Fakten über die Kontakte, nutze nur die Gründe. " +
      "Übernimm die id jedes Kontakts unverändert. Sortiere nach Priorität (wichtigste zuerst). " +
      "Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown, ohne Backticks, ohne Vor-/Nachtext, im Format: " +
      '{"liste":[{"id":"...","dringlichkeit":"hoch","warum":"1 kurzer Satz warum jetzt","aktion":"konkrete empfohlene Aktion"}]}.';

    const userPrompt =
      "Kontakte mit Handlungsbedarf:\n\n" +
      kandidatenText +
      "\n\nGib die priorisierte Wochen-Fokusliste als JSON zurück.";

    const claudeRes = await kiFetch("crm-nba", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      console.error("Claude Fehler:", t);
      return NextResponse.json(
        { error: "Priorisierung fehlgeschlagen." },
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

    const kandidatById = new Map(top.map((k) => [k.id, k]));
    const erlaubtDring = ["hoch", "mittel", "niedrig"];

    const liste = (Array.isArray(parsed?.liste) ? parsed.liste : [])
      .map((e: any) => {
        const kand = kandidatById.get(e?.id);
        if (!kand) return null;
        return {
          id: kand.id,
          name: kand.name,
          firma: kand.firma,
          status: kand.status,
          dringlichkeit: erlaubtDring.includes(e?.dringlichkeit)
            ? e.dringlichkeit
            : "mittel",
          warum: typeof e?.warum === "string" ? e.warum : kand.grund.join("; "),
          aktion: typeof e?.aktion === "string" ? e.aktion : "Kontakt aufnehmen",
          gruende: kand.grund,
        };
      })
      .filter(Boolean);

    // Fallback: falls Claude nichts Brauchbares lieferte, nimm die vorsortierten
    const finale =
      liste.length > 0
        ? liste
        : top.map((k) => ({
            id: k.id,
            name: k.name,
            firma: k.firma,
            status: k.status,
            dringlichkeit:
              k.score >= 50 ? "hoch" : k.score >= 25 ? "mittel" : "niedrig",
            warum: k.grund[0] || "Handlungsbedarf",
            aktion: "Kontakt aufnehmen",
            gruende: k.grund,
          }));

    return NextResponse.json({ liste: finale, leer: false });
  } catch (err: any) {
    console.error("CRM-NBA Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
