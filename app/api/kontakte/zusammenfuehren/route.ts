// app/api/kontakte/zusammenfuehren/route.ts
// ============================================================================
// ARGONAUT OS · Block 1 · I-1c-4
// Zwei Kontakte zu einem verschmelzen.
//
// ⚠️ DER EINZIGE ORT IN BLOCK 1, AN DEM DATEN GELÖSCHT WERDEN.
//
// WARUM DAS AUF DEM SERVER LÄUFT
//   Im Browser könnte die Verbindung mitten im Ablauf abbrechen: Netz weg,
//   Kontakt gelöscht, Aktivitäten verwaist. Hier läuft es in fester Reihenfolge
//   und bricht beim ersten Fehler ab — bevor irgendetwas verschwindet.
//
// ⚠️ WAS AN `kontakte` HÄNGT (geprüft, nicht geraten):
//   kontakt_aktivitaeten   kontakt_id   ON DELETE CASCADE   <- Historie wäre weg
//   kontakt_tag_zuordnung  kontakt_id   ON DELETE CASCADE   <- Tags wären weg
//   verkaufschancen        kontakt_id   ON DELETE SET NULL  <- Deal ohne Kunde
//
//   Ein naives DELETE hätte die komplette Gesprächshistorie des Doppelten
//   mitgerissen. Ohne Fehlermeldung. Deshalb wird ALLES umgehängt, bevor
//   gelöscht wird.
//
// ⚠️ UND EINE FALLE:
//   kontakt_tag_zuordnung hat UNIQUE (kontakt_id, tag_id).
//   Trägt der Überlebende einen Tag bereits, bricht ein blindes Umhängen ab.
//   Deshalb: einzeln umhängen, Doppelte löschen statt anlegen.
//
// DIE REIHENFOLGE IST ZWINGEND
//   1 Beide laden, Besitz prüfen
//   2 Sicherheitsnetz schreiben (Kopie + Anhänge als JSON)
//   3 Aktivitäten umhängen
//   4 Tags umhängen, Doppelte überspringen
//   5 Verkaufschancen umhängen
//   6 Notizen verbinden + verworfene Werte anhängen
//   7 Überlebenden aktualisieren
//   8 Erst JETZT löschen
//
// Bricht Schritt 3 ab, wird nichts gelöscht. Netz steht, beide Kontakte stehen.
//
// Body:    { behalten_id, entfernt_id, wahl?: { feld: 'a' | 'b' } }
// Antwort: { ok, zusammenfuehrung_id, rueckgaengig_bis }
// ============================================================================

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";
import {
  fuehreZusammen, verworfeneWerte,
  type Kandidat, type Feldname,
} from "@/app/dashboard/_components/dublettenLogik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Zeile = Record<string, unknown>;

/** Aus einer kontakte-Zeile den Vergleichs-Kandidaten bauen. */
function alsKandidat(z: Zeile): Kandidat {
  return {
    id: z.id as string,
    vorname: (z.vorname as string) ?? null,
    nachname: (z.nachname as string) ?? null,
    firmenname: (z.firma as string) ?? null,
    email: (z.email as string) ?? null,
    telefon: (z.telefon as string) ?? null,
    strasse: (z.strasse as string) ?? null,
    plz: (z.plz as string) ?? null,
    ort: (z.ort as string) ?? null,
  };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const behaltenId = typeof body?.behalten_id === "string" ? body.behalten_id.trim() : "";
    const entferntId = typeof body?.entfernt_id === "string" ? body.entfernt_id.trim() : "";
    const wahl = (body?.wahl ?? {}) as Partial<Record<Feldname, "a" | "b">>;

    if (!behaltenId || !entferntId) {
      return NextResponse.json({ error: "Beide IDs werden gebraucht." }, { status: 400 });
    }
    if (behaltenId === entferntId) {
      return NextResponse.json({ error: "Ein Datensatz kann nicht mit sich selbst zusammengeführt werden." }, { status: 400 });
    }

    const admin = createAdminClient();

    // ---- 1. Beide laden. Besitz prüfen. --------------------------------
    // Der Admin-Client umgeht RLS — diese Prüfung ist die einzige Absicherung.
    const { data: zeilen, error: ladeFehler } = await admin
      .from("kontakte").select("*").in("id", [behaltenId, entferntId]).eq("owner_user_id", user.id);

    if (ladeFehler) throw ladeFehler;
    if (!zeilen || zeilen.length !== 2) {
      return NextResponse.json({ error: "Einer der Kontakte wurde nicht gefunden." }, { status: 404 });
    }

    const behalten = zeilen.find((z) => z.id === behaltenId) as Zeile;
    const entfernt = zeilen.find((z) => z.id === entferntId) as Zeile;

    // ---- 2. Sicherheitsnetz. Vor allem anderen. -------------------------
    const [aktRes, tagRes, chanceRes] = await Promise.all([
      admin.from("kontakt_aktivitaeten").select("*").eq("kontakt_id", entferntId),
      admin.from("kontakt_tag_zuordnung").select("*").eq("kontakt_id", entferntId),
      admin.from("verkaufschancen").select("*").eq("kontakt_id", entferntId),
    ]);

    const aktivitaeten = aktRes.data ?? [];
    const tags = tagRes.data ?? [];
    const chancen = chanceRes.data ?? [];

    const { data: netz, error: netzFehler } = await admin
      .from("zusammenfuehrungen")
      .insert({
        owner_user_id: user.id,
        tabelle: "kontakte",
        behalten_id: behaltenId,
        entfernt_id: entferntId,
        entfernt_daten: entfernt,
        entfernt_anhang: { aktivitaeten, tags, verkaufschancen: chancen },
      })
      .select("id, rueckgaengig_bis")
      .single();

    if (netzFehler || !netz) {
      // Ohne Netz wird nicht gelöscht. Punkt.
      return NextResponse.json(
        { error: "Das Sicherheitsnetz konnte nicht angelegt werden. Es wurde nichts verändert." },
        { status: 500 },
      );
    }

    // ---- 3. Aktivitäten umhängen. VOR dem Löschen — sonst CASCADE. -----
    if (aktivitaeten.length > 0) {
      const { error } = await admin
        .from("kontakt_aktivitaeten")
        .update({ kontakt_id: behaltenId })
        .eq("kontakt_id", entferntId);
      if (error) {
        return NextResponse.json(
          { error: "Die Aktivitäten konnten nicht übertragen werden. Es wurde nichts gelöscht." },
          { status: 500 },
        );
      }
    }

    // ---- 4. Tags umhängen. UNIQUE (kontakt_id, tag_id) beachten. -------
    if (tags.length > 0) {
      const { data: vorhanden } = await admin
        .from("kontakt_tag_zuordnung").select("tag_id").eq("kontakt_id", behaltenId);
      const schon = new Set((vorhanden ?? []).map((t) => t.tag_id as string));

      for (const t of tags) {
        const tagId = t.tag_id as string;
        if (schon.has(tagId)) {
          // Der Überlebende hat den Tag bereits. Die Zuordnung des anderen
          // ist überflüssig — löschen statt umhängen, sonst bricht der Index.
          await admin.from("kontakt_tag_zuordnung").delete().eq("id", t.id as string);
        } else {
          const { error } = await admin
            .from("kontakt_tag_zuordnung").update({ kontakt_id: behaltenId }).eq("id", t.id as string);
          if (error) {
            return NextResponse.json(
              { error: "Die Tags konnten nicht übertragen werden. Es wurde nichts gelöscht." },
              { status: 500 },
            );
          }
          schon.add(tagId);
        }
      }
    }

    // ---- 5. Verkaufschancen umhängen. Sonst SET NULL. -------------------
    if (chancen.length > 0) {
      const { error } = await admin
        .from("verkaufschancen").update({ kontakt_id: behaltenId }).eq("kontakt_id", entferntId);
      if (error) {
        return NextResponse.json(
          { error: "Die Verkaufschancen konnten nicht übertragen werden. Es wurde nichts gelöscht." },
          { status: 500 },
        );
      }
    }

    // ---- 6. Felder verschmelzen. Nichts geht still verloren. ------------
    const a = alsKandidat(behalten);
    const b = alsKandidat(entfernt);
    const verschmolzen = fuehreZusammen(a, b, wahl);
    const verworfen = verworfeneWerte(a, b, wahl);

    const notizTeile: string[] = [];
    const notizA = (behalten.notizen as string) ?? "";
    const notizB = (entfernt.notizen as string) ?? "";
    if (notizA.trim()) notizTeile.push(notizA.trim());
    if (notizB.trim() && notizB.trim() !== notizA.trim()) notizTeile.push(notizB.trim());
    if (verworfen.length > 0) {
      notizTeile.push(
        `— Aus Zusammenführung vom ${new Date().toLocaleDateString("de-DE")} —\n` + verworfen.join("\n"),
      );
    }

    // ---- 7. Überlebenden aktualisieren ----------------------------------
    const { error: updateFehler } = await admin.from("kontakte").update({
      vorname: verschmolzen.vorname ?? null,
      nachname: verschmolzen.nachname ?? null,
      firma: verschmolzen.firmenname ?? null,
      email: verschmolzen.email ?? null,
      telefon: verschmolzen.telefon ?? null,
      strasse: verschmolzen.strasse ?? null,
      plz: verschmolzen.plz ?? null,
      ort: verschmolzen.ort ?? null,
      notizen: notizTeile.length > 0 ? notizTeile.join("\n\n") : null,
      zusammengefuehrt_am: new Date().toISOString(),
      // Adressfelder können sich geändert haben — Koordinaten wären dann falsch.
      // Der Wächter aus empfaengerLogik erkennt das über geocode_adresse.
    }).eq("id", behaltenId);

    if (updateFehler) {
      return NextResponse.json(
        { error: "Der verbleibende Kontakt konnte nicht aktualisiert werden. Es wurde nichts gelöscht." },
        { status: 500 },
      );
    }

    // ---- 8. Erst jetzt löschen. Alles hängt woanders. -------------------
    const { error: loeschFehler } = await admin
      .from("kontakte").delete().eq("id", entferntId).eq("owner_user_id", user.id);

    if (loeschFehler) {
      return NextResponse.json(
        {
          error:
            "Zusammenführung erfolgt, aber der doppelte Datensatz konnte nicht entfernt werden. " +
            "Bitte manuell prüfen.",
          teilweise: true,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      zusammenfuehrung_id: netz.id,
      rueckgaengig_bis: netz.rueckgaengig_bis,
      uebertragen: {
        aktivitaeten: aktivitaeten.length,
        tags: tags.length,
        verkaufschancen: chancen.length,
      },
      verworfen,
    });
  } catch (err: unknown) {
    console.error("Zusammenfuehren Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
