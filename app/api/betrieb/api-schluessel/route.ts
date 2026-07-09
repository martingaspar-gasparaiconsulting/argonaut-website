// app/api/betrieb/api-schluessel/route.ts
// ============================================================================
// ARGONAUT OS · Block 2 · Welle 1 · C4-3b
// Verwaltung der API-Schlüssel eines Betriebs (für n8n & Automatisierung).
//
//   GET    Liste der aktiven Schlüssel — nur Hinweis, Nutzung, Datum.
//   POST   Neuen Schlüssel erzeugen. Der Klartext kommt GENAU EINMAL zurück.
//   DELETE Schlüssel widerrufen (aktiv = false, kein Hard-Delete).
//
// Die Tabelle api_schluessel hat RLS ohne jede Policy und entzogene Grants.
// Nur der Service-Role-Client kommt heran. Deshalb createAdminClient().
//
// Auth über den NORMALEN Server-Client — der Admin-Client kennt keinen
// eingeloggten Nutzer und dürfte niemals ungeprüft schreiben.
// ============================================================================

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { erzeugeSchluessel } from "@/lib/apiSchluessel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Der Hash steht bewusst NICHT dabei. Er ist zwar unbrauchbar, aber uninteressant. */
const OEFFENTLICHE_FELDER =
  "id, hinweis, bezeichnung, aktiv, letzte_nutzung, nutzungen, erstellt_am";

/** Mehr braucht kein Betrieb. Verhindert, dass jemand versehentlich 200 anlegt. */
const MAX_AKTIVE = 5;

async function angemeldeterNutzer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ---------------------------------------------------------------------------
// GET — welche Schlüssel gibt es?
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const user = await angemeldeterNutzer();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("api_schluessel")
      .select(OEFFENTLICHE_FELDER)
      .eq("owner_user_id", user.id)
      .eq("aktiv", true)
      .order("erstellt_am", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ schluessel: data ?? [] });
  } catch (err: unknown) {
    console.error("API-Schluessel GET Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — neuen Schlüssel erzeugen
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    const user = await angemeldeterNutzer();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const bezeichnung = typeof body?.bezeichnung === "string" && body.bezeichnung.trim()
      ? body.bezeichnung.trim().slice(0, 60)
      : "n8n";

    const admin = createAdminClient();

    const { count, error: zaehlFehler } = await admin
      .from("api_schluessel")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", user.id)
      .eq("aktiv", true);
    if (zaehlFehler) throw zaehlFehler;

    if ((count ?? 0) >= MAX_AKTIVE) {
      return NextResponse.json(
        { error: `Es sind bereits ${MAX_AKTIVE} Schlüssel aktiv. Bitte einen alten widerrufen.` },
        { status: 400 },
      );
    }

    const neu = erzeugeSchluessel();

    const { data, error } = await admin
      .from("api_schluessel")
      .insert({
        owner_user_id: user.id,
        schluessel_hash: neu.hash,   // ⚠️ Nur der Hash. Nie der Klartext.
        hinweis: neu.hinweis,
        bezeichnung,
        aktiv: true,
      })
      .select(OEFFENTLICHE_FELDER)
      .single();

    if (error) throw error;

    // ⚠️ Das einzige Mal, dass der Klartext existiert. Danach ist er fort.
    return NextResponse.json({
      ...data,
      klartext: neu.klartext,
      warnung:
        "Dieser Schlüssel wird nur jetzt angezeigt. Kopiere ihn und bewahre ihn sicher auf. " +
        "Er lässt sich später nicht mehr anzeigen — auch nicht von ARGONAUT.",
    });
  } catch (err: unknown) {
    console.error("API-Schluessel POST Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — Schlüssel widerrufen
// ---------------------------------------------------------------------------
export async function DELETE(req: Request) {
  try {
    const user = await angemeldeterNutzer();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Keine ID übergeben." }, { status: 400 });

    const admin = createAdminClient();
    // Das .eq auf owner_user_id ist die einzige Absicherung gegen fremde IDs —
    // der Admin-Client umgeht RLS. Deshalb steht es hier und nicht woanders.
    const { data, error } = await admin
      .from("api_schluessel")
      .update({ aktiv: false })
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Schlüssel nicht gefunden." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("API-Schluessel DELETE Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
