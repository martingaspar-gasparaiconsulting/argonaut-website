// app/api/uebungswelt/route.ts
// ============================================================================
// ARGONAUT OS · Übungswelt / Demo-Beispieldaten — zentrale Route
//
// Aktionen (Body { aktion }):
//   · 'status'    → { geladen, anzahl }   (wie viele Beispiel-Zeilen im Register)
//   · 'laden'     → { angelegt }          (Seeder der Reihe nach; jede ID ins Register)
//   · 'entfernen' → { entfernt }          (exakt ueber Register, umgekehrte Reihenfolge)
//
// Sicherheit: laeuft in der Nutzer-Session (RLS schuetzt auf owner_user_id).
// Das Register `beispiel_datensatz` ist das Sicherheitsnetz — es werden NUR
// Zeilen geloescht, die diese Route selbst angelegt hat (plus als Netz die
// mit quelle='Beispiel' markierten Kontakte aus Stufe 1).
// ============================================================================

import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { aktiveSeeder, loeschReihenfolge, registerZeilen, REGISTER_TABELLE } from "@/lib/uebungswelt";
import { BEISPIEL_QUELLE } from "@/lib/beispielKatalog";
import { baueAngebotKopf, baueAngebotPositionen, baueBeispielZahlungen, type KontaktRef } from "@/lib/beispielBelege";
import { baueAssets, baueWartungAusAsset } from "@/lib/beispielModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const aktion = String(body?.aktion || "").trim();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    const uid = user.id;

    const zaehleRegister = async (): Promise<number> => {
      const { count } = await supabase.from(REGISTER_TABELLE).select("*", { count: "exact", head: true }).eq("owner_user_id", uid);
      return count || 0;
    };

    // ---- STATUS ----
    if (aktion === "status") {
      const anzahl = await zaehleRegister();
      return NextResponse.json({ geladen: anzahl > 0, anzahl });
    }

    // ---- LADEN ----
    if (aktion === "laden") {
      if ((await zaehleRegister()) > 0) {
        return NextResponse.json({ bereitsGeladen: true, angelegt: 0 });
      }
      // Alte, nicht-registrierte Beispiel-Kontakte (Stufe 1) wegraeumen -> keine Dubletten.
      await supabase.from("kontakte").delete().eq("owner_user_id", uid).eq("quelle", BEISPIEL_QUELLE);

      // Branche des Nutzers.
      const { data: prof } = await supabase.from("profiles").select("kategorie").eq("id", uid).maybeSingle();
      const kategorie = (prof?.kategorie && String(prof.kategorie).trim()) ? String(prof.kategorie).trim() : null;

      let angelegt = 0;
      const heuteLaden = new Date().toISOString().slice(0, 10);
      for (const s of aktiveSeeder(kategorie)) {
        const zeilen = s.baue(kategorie, uid, heuteLaden);
        if (!zeilen.length) continue;
        const { data, error } = await supabase.from(s.tabelle).insert(zeilen).select("id");
        if (error || !data) {
          // Eine Schicht darf die anderen nicht stoppen.
          console.error(`Übungswelt: Seeder '${s.key}' fehlgeschlagen:`, error?.message ?? error);
          continue;
        }
        const ids = (data as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
        if (ids.length) {
          const { error: regErr } = await supabase.from(REGISTER_TABELLE).insert(registerZeilen(s.tabelle, ids, uid));
          if (regErr) console.error(`Übungswelt: Register-Eintrag '${s.key}' fehlgeschlagen:`, regErr.message);
          angelegt += ids.length;
        }
      }

      // ---- Verzahnte Belege: Angebot + Zahlungen (ohne echte Rechnungsnummer) ----
      try {
        const { data: kdata } = await supabase
          .from("kontakte")
          .select("id, firma, vorname, nachname, email")
          .eq("owner_user_id", uid).eq("quelle", BEISPIEL_QUELLE).limit(1);
        const kontakt = (kdata && kdata[0]) as KontaktRef | undefined;
        if (kontakt?.id) {
          const heute = new Date().toISOString().slice(0, 10);
          const gueltig = new Date(); gueltig.setDate(gueltig.getDate() + 30);
          const gueltigBis = gueltig.toISOString().slice(0, 10);

          const { data: ang } = await supabase.from("angebote").insert(baueAngebotKopf(kontakt, uid, gueltigBis)).select("id").single();
          if (ang?.id) {
            await supabase.from(REGISTER_TABELLE).insert(registerZeilen("angebote", [ang.id as string], uid));
            angelegt += 1;
            const { data: pos } = await supabase.from("angebot_positionen").insert(baueAngebotPositionen(ang.id as string, uid)).select("id");
            const posIds = ((pos as Array<{ id: string }> | null) || []).map((r) => r.id).filter(Boolean);
            if (posIds.length) await supabase.from(REGISTER_TABELLE).insert(registerZeilen("angebot_positionen", posIds, uid));
          }

          const { data: zah } = await supabase.from("zahlungen").insert(baueBeispielZahlungen(uid, heute)).select("id");
          const zIds = ((zah as Array<{ id: string }> | null) || []).map((r) => r.id).filter(Boolean);
          if (zIds.length) {
            await supabase.from(REGISTER_TABELLE).insert(registerZeilen("zahlungen", zIds, uid));
            angelegt += zIds.length;
          }
        }
      } catch (e) {
        console.error("Übungswelt: Belege fehlgeschlagen:", e instanceof Error ? e.message : e);
      }

      // ---- Modulgruppe Objekte + Wartung (verzahnt, Kern-Modul) ----
      try {
        const heuteM = new Date().toISOString().slice(0, 10);
        const assetRows = baueAssets(uid, heuteM);
        const { data: aIns } = await supabase.from("assets").insert(assetRows).select("id");
        const assetIds = ((aIns as Array<{ id: string }> | null) || []).map((r) => r.id).filter(Boolean);
        if (assetIds.length) {
          await supabase.from(REGISTER_TABELLE).insert(registerZeilen("assets", assetIds, uid));
          angelegt += assetIds.length;
          // Erstes Objekt mit einem Wartungsvertrag verzahnen.
          const wartung = { ...baueWartungAusAsset(assetRows[0], uid), aktualisiert_am: new Date().toISOString() };
          const { data: wIns } = await supabase.from("wartungsvertraege").insert(wartung).select("id").single();
          if (wIns?.id) {
            await supabase.from(REGISTER_TABELLE).insert(registerZeilen("wartungsvertraege", [wIns.id as string], uid));
            angelegt += 1;
            await supabase.from("assets").update({ wartungsvertrag_id: wIns.id }).eq("id", assetIds[0]);
          }
        }
      } catch (e) {
        console.error("Übungswelt: Modulgruppe Objekte/Wartung fehlgeschlagen:", e instanceof Error ? e.message : e);
      }

      return NextResponse.json({ angelegt });
    }

    // ---- ENTFERNEN ----
    if (aktion === "entfernen") {
      const { data: reg } = await supabase.from(REGISTER_TABELLE).select("tabelle, datensatz_id").eq("owner_user_id", uid);
      const zeilen = (reg as Array<{ tabelle: string; datensatz_id: string }> | null) || [];

      const proTabelle = new Map<string, string[]>();
      for (const r of zeilen) {
        const arr = proTabelle.get(r.tabelle) || [];
        arr.push(r.datensatz_id);
        proTabelle.set(r.tabelle, arr);
      }

      // Zuerst die bekannte umgekehrte Reihenfolge, dann evtl. weitere Tabellen aus dem Register.
      const reihenfolge = [...new Set([...loeschReihenfolge(), ...proTabelle.keys()])];
      let entfernt = 0;
      for (const tab of reihenfolge) {
        const ids = proTabelle.get(tab);
        if (!ids || !ids.length) continue;
        const { error } = await supabase.from(tab).delete().in("id", ids);
        if (!error) entfernt += ids.length;
        else console.error(`Übungswelt: Löschen in '${tab}' fehlgeschlagen:`, error.message);
      }

      // Register leeren + Sicherheitsnetz fuer markierte Kontakte.
      await supabase.from(REGISTER_TABELLE).delete().eq("owner_user_id", uid);
      await supabase.from("kontakte").delete().eq("owner_user_id", uid).eq("quelle", BEISPIEL_QUELLE);

      return NextResponse.json({ entfernt });
    }

    return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  } catch (err: unknown) {
    console.error("Übungswelt-Route Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
