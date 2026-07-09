// app/api/kontakte/zusammenfuehren/rueckgaengig/route.ts
// ============================================================================
// ARGONAUT OS · Block 1 · I-1c-4b
// Eine Zusammenführung rückgängig machen.
//
// WAS WIEDERHERGESTELLT WIRD
//   - der gelöschte Kontakt, vollständig, mit seiner alten ID
//   - seine Aktivitäten (die inzwischen am Überlebenden hängen)
//   - seine Tags
//   - seine Verkaufschancen
//
// WAS NICHT WIEDERHERGESTELLT WIRD — und warum
//   Die Felder des Überlebenden. Er wurde beim Verschmelzen aktualisiert
//   ("Philipp" statt "P."), und seither können weitere Änderungen erfolgt sein.
//   Sie zurückzudrehen würde neuere Arbeit vernichten.
//
//   Das Rückgängigmachen stellt den GELÖSCHTEN wieder her. Es macht die
//   Verbesserung des Überlebenden nicht zunichte. Das ist Absicht und steht
//   in der Antwort.
//
// ⚠️ DIE FRIST
//   Nach `rueckgaengig_bis` (30 Tage) geht es nicht mehr. Danach ist das Netz
//   nur noch ein Protokoll.
//
// Body:    { zusammenfuehrung_id }
// Antwort: { ok, wiederhergestellt: { kontakt, aktivitaeten, tags, chancen } }
// ============================================================================

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Zeile = Record<string, unknown>;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.zusammenfuehrung_id === "string" ? body.zusammenfuehrung_id.trim() : "";
    if (!id) return NextResponse.json({ error: "Keine ID übergeben." }, { status: 400 });

    const admin = createAdminClient();

    // ---- Netz holen. Besitz prüfen. ------------------------------------
    const { data: netz, error: netzFehler } = await admin
      .from("zusammenfuehrungen")
      .select("*")
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (netzFehler) throw netzFehler;
    if (!netz) return NextResponse.json({ error: "Zusammenführung nicht gefunden." }, { status: 404 });

    if (netz.rueckgaengig_am) {
      return NextResponse.json({ error: "Diese Zusammenführung wurde bereits rückgängig gemacht." }, { status: 409 });
    }

    const frist = new Date(netz.rueckgaengig_bis as string);
    if (Number.isFinite(frist.getTime()) && frist.getTime() < Date.now()) {
      return NextResponse.json(
        {
          error:
            `Die Frist ist am ${frist.toLocaleDateString("de-DE")} abgelaufen. ` +
            "Die Zusammenführung lässt sich nicht mehr rückgängig machen.",
          code: "frist_abgelaufen",
        },
        { status: 409 },
      );
    }

    const daten = netz.entfernt_daten as Zeile;
    const anhang = (netz.entfernt_anhang ?? {}) as {
      aktivitaeten?: Zeile[]; tags?: Zeile[]; verkaufschancen?: Zeile[];
    };

    const entferntId = netz.entfernt_id as string;
    const behaltenId = netz.behalten_id as string;

    // ---- 1. Kontakt zurückschreiben, mit seiner alten ID ---------------
    const { error: insertFehler } = await admin.from("kontakte").insert(daten);
    if (insertFehler) {
      const doppelt = String(insertFehler.message).includes("duplicate key");
      return NextResponse.json(
        {
          error: doppelt
            ? "Der Kontakt existiert bereits wieder. Es wurde nichts verändert."
            : "Der Kontakt konnte nicht wiederhergestellt werden. Es wurde nichts verändert.",
        },
        { status: 500 },
      );
    }

    // ---- 2. Aktivitäten zurückhängen ------------------------------------
    // Sie hängen jetzt am Überlebenden. Nur die zurückholen, die vorher
    // dem Entfernten gehörten — an ihren IDs erkennbar.
    let aktZurueck = 0;
    const aktIds = (anhang.aktivitaeten ?? []).map((a) => a.id as string).filter(Boolean);
    if (aktIds.length > 0) {
      const { error } = await admin
        .from("kontakt_aktivitaeten")
        .update({ kontakt_id: entferntId })
        .in("id", aktIds)
        .eq("kontakt_id", behaltenId);
      if (!error) aktZurueck = aktIds.length;
    }

    // ---- 3. Tags zurückhängen ------------------------------------------
    // Manche wurden beim Zusammenführen gelöscht (Überlebender hatte sie schon).
    // Die legen wir neu an; die anderen hängen wir zurück.
    let tagsZurueck = 0;
    for (const t of anhang.tags ?? []) {
      const tId = t.id as string;
      const { data: vorhanden } = await admin
        .from("kontakt_tag_zuordnung").select("id").eq("id", tId).maybeSingle();

      if (vorhanden) {
        await admin.from("kontakt_tag_zuordnung").update({ kontakt_id: entferntId }).eq("id", tId);
      } else {
        await admin.from("kontakt_tag_zuordnung").insert(t);
      }
      tagsZurueck++;
    }

    // ---- 4. Verkaufschancen zurückhängen ---------------------------------
    let chancenZurueck = 0;
    const chanceIds = (anhang.verkaufschancen ?? []).map((c) => c.id as string).filter(Boolean);
    if (chanceIds.length > 0) {
      const { error } = await admin
        .from("verkaufschancen")
        .update({ kontakt_id: entferntId })
        .in("id", chanceIds);
      if (!error) chancenZurueck = chanceIds.length;
    }

    // ---- 5. Netz als verbraucht markieren --------------------------------
    await admin.from("zusammenfuehrungen")
      .update({ rueckgaengig_am: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      wiederhergestellt: {
        kontakt: entferntId,
        aktivitaeten: aktZurueck,
        tags: tagsZurueck,
        verkaufschancen: chancenZurueck,
      },
      hinweis:
        "Der gelöschte Kontakt ist wieder da. Die Felder des verbliebenen Kontakts wurden NICHT " +
        "zurückgesetzt — dort könnte seither weitergearbeitet worden sein. Bitte beide prüfen.",
    });
  } catch (err: unknown) {
    console.error("Rueckgaengig Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
