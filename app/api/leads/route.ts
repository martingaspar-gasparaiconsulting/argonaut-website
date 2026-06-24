// app/api/leads/route.ts
// ARGONAUT OS - Vertriebswelle P2: Lead-Intake API
// -----------------------------------------------------------------------------
// Nimmt Daten vom oeffentlichen Lead-Formular an und speichert sie sicher in
// public.leads. Laeuft serverseitig mit dem Admin-Client (Einreicher ist NICHT
// eingeloggt). Der Lead wird sofort gespeichert; die Sofort-Reaktion (P3) loest
// danach separat ueber n8n aus - so geht kein Lead verloren.
// -----------------------------------------------------------------------------
import { createAdminClient } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// --- Besitzer der eingehenden Leads -----------------------------------------
// VORERST FEST: erster Kunde (Schaefer). Spaeter pro Kunde dynamisch machen.
// ANKER_OWNER_ID
const OWNER_USER_ID = "20dacbde-d2f2-43b8-9881-577ebce83639";
// ----------------------------------------------------------------------------

// Erlaubte Werte, damit nichts Unerwartetes in die DB kommt
const ERLAUBTE_DIENSTLEISTUNG = ["Holzernte", "Forstarbeiten", "Brennholz", "Baumfällung", "Sonstiges"];
const ERLAUBTE_EINHEIT = ["SRM", "FM", "RM", "ha", "Sonstiges"];

function sauber(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  return t.slice(0, max);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Ungueltige Anfrage." }, { status: 400 });
    }

    // Pflichtfelder
    const name = sauber((body as any).name, 200);
    const telefon = sauber((body as any).telefon, 60);
    if (!name || !telefon) {
      return NextResponse.json({ error: "Name und Telefonnummer sind erforderlich." }, { status: 400 });
    }

    // Datenschutz-Zustimmung muss vorliegen
    if ((body as any).privacy !== true) {
      return NextResponse.json({ error: "Bitte der Datenschutzerklaerung zustimmen." }, { status: 400 });
    }

    // Optionale Felder + Whitelisting
    const email = sauber((body as any).email, 200);
    let dienstleistung = sauber((body as any).dienstleistung, 60);
    if (dienstleistung && !ERLAUBTE_DIENSTLEISTUNG.includes(dienstleistung)) dienstleistung = "Sonstiges";
    const menge = sauber((body as any).menge, 60);
    let einheit = sauber((body as any).einheit, 20);
    if (einheit && !ERLAUBTE_EINHEIT.includes(einheit)) einheit = "Sonstiges";
    const nachricht = sauber((body as any).nachricht, 5000);

    // Wunschtermin: Freitext zulassen (z. B. "ab Mitte August", "im Herbst",
    // "30.08.2026"). Spalte ist text; KI interpretiert die Angabe spaeter.
    const wunschtermin = sauber((body as any).wunschtermin, 200);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("leads")
      .insert({
        owner_user_id: OWNER_USER_ID,
        name,
        telefon,
        email,
        dienstleistung,
        menge,
        einheit,
        wunschtermin,
        nachricht,
        quelle: "formular",
        status: "neu",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Lead-Insert Fehler:", error);
      return NextResponse.json({ error: "Speichern fehlgeschlagen." }, { status: 500 });
    }

    // --- P3: Sofort-Reaktion ueber n8n ausloesen ----------------------------
    // Fire-and-forget: Lead ist bereits gespeichert. Schlaegt der Webhook
    // fehl, wird der Fehler nur geloggt - der Lead-Empfang wird NIE gestoert.
    const N8N_SOFORT_REAKTION_URL =
      "https://n8n.srv1133627.hstgr.cloud/webhook/lead-sofort-reaktion";
    try {
      await fetch(N8N_SOFORT_REAKTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, telefon }),
      });
    } catch (webhookErr) {
      console.error("Sofort-Reaktion (n8n) fehlgeschlagen:", webhookErr);
    }
    // ------------------------------------------------------------------------

    // --- P4: Lead-Qualifizierung ueber n8n ausloesen ----------------------
    // Fire-and-forget: schickt den kompletten Lead an die KI-Bewertung.
    // Schlaegt der Webhook fehl, wird der Fehler nur geloggt.
    const N8N_QUALIFIZIERUNG_URL =
      "https://n8n.srv1133627.hstgr.cloud/webhook/lead-qualifizierung";
    try {
      await fetch(N8N_QUALIFIZIERUNG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: data.id,
          name,
          email,
          telefon,
          dienstleistung,
          menge,
          einheit,
          wunschtermin,
          nachricht,
        }),
      });
    } catch (qualiErr) {
      console.error("Lead-Qualifizierung (n8n) fehlgeschlagen:", qualiErr);
    }
    // ------------------------------------------------------------------------

    // --- V1: R\u00fcckfrage bei unvollst\u00e4ndigen Leads ueber n8n --------
    // Fire-and-forget: triggert eine R\u00fcckfrage-Mail, wenn dienstleistung
    // oder menge fehlt. Telefon ist bereits Pflichtfeld (siehe oben).
    const N8N_RUECKFRAGE_URL =
      "https://n8n.srv1133627.hstgr.cloud/webhook/lead-rueckfrage";
    try {
      await fetch(N8N_RUECKFRAGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: data.id,
          name,
          email,
          telefon,
          dienstleistung,
          menge,
        }),
      });
    } catch (rueckfrageErr) {
      console.error("R\u00fcckfrage (n8n) fehlgeschlagen:", rueckfrageErr);
    }
    // ------------------------------------------------------------------------

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error("Lead-Route Fehler:", err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
