// app/api/betrieb/schluessel/route.ts
// ============================================================================
// ARGONAUT OS · Block 2 · Welle 1 · B1-3b
// Verwaltung des OpenRouteService-Schlüssels je Betrieb.
//
// GRUNDSATZ: Das Geheimnis verlässt den Server nie.
//   GET   liefert nur Hinweis, Status und Restkontingent — nie den Schlüssel.
//   POST  prüft den Schlüssel GEGEN ORS, bevor er gespeichert wird.
//   PATCH prüft den gespeicherten Schlüssel erneut ("Verbindung testen").
//   DELETE deaktiviert ihn (kein Hard-Delete, Historie bleibt).
//
// Die Tabelle betriebs_geheimnisse hat RLS ohne jede Policy und entzogene
// Grants. Nur der Service-Role-Client kommt heran. Deshalb createAdminClient().
//
// Auth läuft über den NORMALEN Server-Client — der Admin-Client kennt keinen
// eingeloggten Nutzer und dürfte niemals ungeprüft schreiben.
// ============================================================================

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import { pruefeSchluessel, schluesselHinweis, schluesselPlausibel } from "@/lib/ors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ART = "ors";

/** Diese Felder dürfen nach außen. `geheimnis` steht bewusst NICHT dabei. */
const OEFFENTLICHE_FELDER =
  "id, hinweis, pruef_status, pruef_meldung, zuletzt_geprueft_am, kontingent_rest, kontingent_stand_am, erstellt_am";

async function angemeldeterNutzer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ---------------------------------------------------------------------------
// GET — Status des hinterlegten Schlüssels
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const user = await angemeldeterNutzer();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("betriebs_geheimnisse")
      .select(OEFFENTLICHE_FELDER)
      .eq("owner_user_id", user.id)
      .eq("art", ART)
      .eq("aktiv", true)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json({ vorhanden: false });
    }

    return NextResponse.json({ vorhanden: true, ...data });
  } catch (err: unknown) {
    console.error("Schluessel GET Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — Schlüssel setzen (nur wenn er wirklich funktioniert)
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    const user = await angemeldeterNutzer();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const schluessel = typeof body?.schluessel === "string" ? body.schluessel.trim() : "";

    if (!schluessel) {
      return NextResponse.json({ error: "Kein Schlüssel übergeben." }, { status: 400 });
    }
    if (!schluesselPlausibel(schluessel)) {
      return NextResponse.json(
        { error: "Der Schlüssel sieht nicht wie ein OpenRouteService-Schlüssel aus." },
        { status: 400 },
      );
    }

    // --- Erst testen, dann speichern -------------------------------------
    const pruefung = await pruefeSchluessel(schluessel);

    if (pruefung.status === "ungueltig") {
      // Wird NICHT gespeichert. Ein toter Schlüssel gehört nicht in die DB.
      return NextResponse.json({ error: pruefung.meldung, status: pruefung.status }, { status: 400 });
    }
    if (pruefung.status === "unbekannt") {
      return NextResponse.json(
        { error: pruefung.meldung + " Bitte später erneut versuchen.", status: pruefung.status },
        { status: 502 },
      );
    }
    // 'ok' oder 'kontingent' -> Schlüssel ist gültig, wird gespeichert.

    const admin = createAdminClient();
    const jetzt = new Date().toISOString();

    // Alten Schlüssel stilllegen, nicht löschen. Der Unique-Index greift nur
    // auf aktive Zeilen — so bleibt die Historie erhalten.
    const { error: aus } = await admin
      .from("betriebs_geheimnisse")
      .update({ aktiv: false })
      .eq("owner_user_id", user.id)
      .eq("art", ART)
      .eq("aktiv", true);
    if (aus) throw aus;

    const { data, error } = await admin
      .from("betriebs_geheimnisse")
      .insert({
        owner_user_id: user.id,
        art: ART,
        geheimnis: schluessel,
        hinweis: schluesselHinweis(schluessel),
        aktiv: true,
        pruef_status: pruefung.status,
        pruef_meldung: pruefung.meldung,
        zuletzt_geprueft_am: jetzt,
        kontingent_rest: pruefung.kontingentRest,
        kontingent_stand_am: pruefung.kontingentRest !== null ? jetzt : null,
      })
      .select(OEFFENTLICHE_FELDER)
      .single();

    if (error) throw error;

    return NextResponse.json({ vorhanden: true, ...data });
  } catch (err: unknown) {
    console.error("Schluessel POST Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH — "Verbindung testen" für den bereits hinterlegten Schlüssel
// ---------------------------------------------------------------------------
export async function PATCH() {
  try {
    const user = await angemeldeterNutzer();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const admin = createAdminClient();

    // Hier — und NUR hier — wird das Geheimnis gelesen. Es bleibt in dieser
    // Funktion und wird niemals Teil einer Antwort.
    const { data: zeile, error: lesen } = await admin
      .from("betriebs_geheimnisse")
      .select("id, geheimnis")
      .eq("owner_user_id", user.id)
      .eq("art", ART)
      .eq("aktiv", true)
      .maybeSingle();

    if (lesen) throw lesen;
    if (!zeile) return NextResponse.json({ vorhanden: false, error: "Kein Schlüssel hinterlegt." }, { status: 404 });

    const pruefung = await pruefeSchluessel(zeile.geheimnis as string);
    const jetzt = new Date().toISOString();

    const { data, error } = await admin
      .from("betriebs_geheimnisse")
      .update({
        pruef_status: pruefung.status,
        pruef_meldung: pruefung.meldung,
        zuletzt_geprueft_am: jetzt,
        kontingent_rest: pruefung.kontingentRest,
        kontingent_stand_am: pruefung.kontingentRest !== null ? jetzt : null,
      })
      .eq("id", zeile.id)
      .select(OEFFENTLICHE_FELDER)
      .single();

    if (error) throw error;

    return NextResponse.json({ vorhanden: true, ...data });
  } catch (err: unknown) {
    console.error("Schluessel PATCH Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — Schlüssel stilllegen
// ---------------------------------------------------------------------------
export async function DELETE() {
  try {
    const user = await angemeldeterNutzer();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const admin = createAdminClient();
    const { error } = await admin
      .from("betriebs_geheimnisse")
      .update({ aktiv: false })
      .eq("owner_user_id", user.id)
      .eq("art", ART)
      .eq("aktiv", true);

    if (error) throw error;

    return NextResponse.json({ vorhanden: false });
  } catch (err: unknown) {
    console.error("Schluessel DELETE Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
