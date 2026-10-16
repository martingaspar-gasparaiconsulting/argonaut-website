import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { abrechnungPruefen } from "@/lib/nurGeschaeftsleitung";
import { quellSchreiber } from "@/lib/abrechnungServer";
import { freigabePruefen, istUuid } from "@/lib/mengenWeiter";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · MO4 Teil 3 (16.10.2026)
// Leistungen einer STORNIERTEN Sammelrechnung wieder freigeben, damit sie
// neu abgerechnet werden können. Die stornierte Rechnung bleibt unverändert
// (GoBD) — nur die Leistungen lösen sich von ihr.
//  · nur mit Recht zum Abrechnen (Chef oder „darf abrechnen")
//  · nur Rechnungen des eigenen Betriebs, nur Status „storniert"
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rechnungId = String(body?.rechnungId ?? "");
    if (!istUuid(rechnungId)) return NextResponse.json({ error: "Rechnung fehlt." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    const abr = await abrechnungPruefen(supabase, user.id);
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });
    const betrieb = abr.betrieb;
    const schreiber = quellSchreiber(supabase, abr);

    const { data: r, error: rErr } = await schreiber.from("rechnungen")
      .select("id, owner_user_id, zahlungsstatus")
      .eq("id", rechnungId).eq("owner_user_id", betrieb).maybeSingle();
    if (rErr) return NextResponse.json({ error: "Rechnung konnte nicht geladen werden." }, { status: 500 });
    const fehler = freigabePruefen(r as { owner_user_id?: string; zahlungsstatus?: string } | null, betrieb);
    if (fehler) return NextResponse.json({ error: fehler }, { status: r ? 409 : 404 });

    const { data: frei, error: uErr } = await schreiber.from("mengen_leistung")
      .update({ abgerechnet: false, rechnung_id: null })
      .eq("rechnung_id", rechnungId).eq("owner_user_id", betrieb)
      .select("id");
    if (uErr) return NextResponse.json({ error: "Leistungen konnten nicht freigegeben werden." }, { status: 500 });

    return NextResponse.json({ freigegeben: (frei || []).length });
  } catch (err: unknown) {
    console.error("Mengen freigeben Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
