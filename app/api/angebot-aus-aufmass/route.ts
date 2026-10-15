import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { betriebsKennung } from "@/lib/betriebBesitzer";
import { aufmassZuPosten, kontaktLabel, type KontaktKurz } from "@/lib/aufmassZuAngebot";
import type { PositionBasis } from "@/app/dashboard/_components/aufmassLogik";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · HW-11 (15.10.2026) · "Angebot aus Aufmass"
// Aus einem Aufmass entsteht ein Angebots-ENTWURF mit allen Positionen
// (Menge und Rechenweg, Pauschalen als 1 Psch, Steuersatz je Position) und
// dem Kunden des Aufmasses. Doppel-Schutz ueber aufmasse.angebot_id (SQL p374).
// Position ohne Preis -> kein Angebot. Positionsfehler -> kein halbes Angebot.
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const aufmassId = String(body?.aufmassId || "").trim();
    if (!aufmassId) return NextResponse.json({ error: "Kein Aufmaß übergeben." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    const { data: chef } = await supabase.rpc("mein_chef_id");
    const betrieb = betriebsKennung(chef, user.id);
    if (!betrieb) return NextResponse.json({ error: "Betrieb nicht gefunden." }, { status: 403 });

    const { data: aufmass, error: aErr } = await supabase.from("aufmasse")
      .select("id, nummer, titel, kunde_name, projekt, ort, kontakt_id, angebot_id, standort_id")
      .eq("id", aufmassId).maybeSingle();
    if (aErr) return NextResponse.json({ error: "Aufmaß konnte nicht geladen werden." }, { status: 500 });
    if (!aufmass) return NextResponse.json({ error: "Aufmaß nicht gefunden." }, { status: 404 });

    if (aufmass.angebot_id) {
      const { data: vorhanden } = await supabase.from("angebote").select("id").eq("id", aufmass.angebot_id).maybeSingle();
      if (vorhanden?.id) return NextResponse.json({ angebotId: vorhanden.id, bereitsVorhanden: true });
    }

    const { data: posRaw, error: pErr } = await supabase.from("aufmass_positionen")
      .select("*").eq("aufmass_id", aufmassId).order("erstellt_am", { ascending: true });
    if (pErr) return NextResponse.json({ error: "Positionen konnten nicht geladen werden." }, { status: 500 });
    const positionen = (posRaw || []) as PositionBasis[];
    if (!positionen.length) return NextResponse.json({ error: "Das Aufmaß hat keine Positionen." }, { status: 400 });

    const { posten, summen, ohnePreis } = aufmassZuPosten(positionen);
    if (ohnePreis.length) {
      return NextResponse.json({
        error: `Für ${ohnePreis.length === 1 ? "eine Position" : `${ohnePreis.length} Positionen`} ist kein Preis hinterlegt. Bitte zuerst im Aufmaß ergänzen: ${ohnePreis.join(" · ")}`,
        ohnePreis,
      }, { status: 400 });
    }

    // Kunde: Kontakt des Aufmasses (Name und E-Mail aus dem Kontakt)
    let kunde: KontaktKurz | null = null;
    if (aufmass.kontakt_id) {
      const { data: k } = await supabase.from("kontakte").select("*").eq("id", aufmass.kontakt_id).maybeSingle();
      kunde = (k as KontaktKurz | null) ?? null;
    }
    const kundeName = (kunde ? kontaktLabel(kunde) : "") || aufmass.kunde_name?.trim() || "Kunde";

    const gueltig = new Date(); gueltig.setDate(gueltig.getDate() + 30);
    const titel = [aufmass.titel || "Angebot", aufmass.projekt || null].filter(Boolean).join(" · ");
    const { data: ang, error: insErr } = await supabase.from("angebote").insert({
      owner_user_id: betrieb,
      standort_id: aufmass.standort_id ?? standortAusCookieHeader(req.headers.get("cookie")),
      kontakt_id: aufmass.kontakt_id ?? null,
      kunde_name: kundeName,
      kunde_email: kunde?.email || null,
      titel,
      status: "entwurf",
      gueltig_bis: gueltig.toISOString().slice(0, 10),
      netto_summe: summen.netto,
      mwst_summe: summen.mwst,
      brutto_summe: summen.brutto,
      notiz: [aufmass.nummer ? `Aus Aufmaß ${aufmass.nummer}` : "Aus Aufmaß", aufmass.ort || null].filter(Boolean).join(" · "),
    }).select("id").single();
    if (insErr || !ang) return NextResponse.json({ error: "Angebot konnte nicht angelegt werden." }, { status: 500 });

    const { error: posErr } = await supabase.from("angebot_positionen")
      .insert(posten.map((p) => ({ ...p, owner_user_id: betrieb, angebot_id: ang.id })));
    if (posErr) {
      await supabase.from("angebote").delete().eq("id", ang.id);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden — es wurde kein Angebot angelegt." }, { status: 500 });
    }

    await supabase.from("aufmasse").update({ angebot_id: ang.id }).eq("id", aufmass.id);
    return NextResponse.json({ angebotId: ang.id, bereitsVorhanden: false });
  } catch (err: unknown) {
    console.error("Angebot-aus-Aufmass Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
