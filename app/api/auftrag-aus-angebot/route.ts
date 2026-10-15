import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { betriebsKennung } from "@/lib/betriebBesitzer";
import { auftragAusAngebot } from "@/lib/auftragAusAngebotServer";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · HW-10 (15.10.2026) · "Auftrag aus Angebot"
// Aus einem ANGENOMMENEN Angebot entsteht ein Auftrag mit allen Positionen
// (Rabatt, Steuersatz, Einheit), Kontakt und Standort. Doppel-Schutz ueber
// angebote.auftrag_id. Logik: lib/auftragAusAngebotServer.ts.
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const angebotId = String(body?.angebotId || "").trim();
    if (!angebotId) return NextResponse.json({ error: "Kein Angebot übergeben." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const { data: chef } = await supabase.rpc("mein_chef_id");
    const betrieb = betriebsKennung(chef, user.id);
    if (!betrieb) return NextResponse.json({ error: "Betrieb nicht gefunden." }, { status: 403 });

    const r = await auftragAusAngebot(supabase, angebotId, {
      betrieb,
      standortId: standortAusCookieHeader(req.headers.get("cookie")),
    });
    if (!r.ok) return NextResponse.json({ error: r.fehler }, { status: r.code });
    return NextResponse.json({ auftragId: r.auftragId, bereitsVorhanden: r.bereitsVorhanden });
  } catch (err: unknown) {
    console.error("Auftrag-aus-Angebot Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
