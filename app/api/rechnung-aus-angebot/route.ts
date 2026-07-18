import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Bündel 14 · "Rechnung aus Angebot"
// Aus einem ANGENOMMENEN Angebot entsteht eine Rechnung (bestehende Pipeline).
//  · MwSt je Steuersatz auf die Gruppensumme (steuerLogik).
//  · Doppel-Schutz: hat das Angebot schon eine rechnung_id -> diese zurueckgeben.
//  · Positions-Insert scheitert -> Rechnung STORNIEREN (keine Nummernluecke).
//  · Nur angenommene Angebote sind fakturierbar.
// ============================================================

const MWST_STD = 19;

type AngPos = { bezeichnung: string | null; menge: number | null; einheit: string | null; einzelpreis: number | null; mwst_satz: number | null };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const angebotId = String(body?.angebotId || "").trim();
    if (!angebotId) return NextResponse.json({ error: "Kein Angebot übergeben." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    // 1) Angebot laden (RLS: nur eigene)
    const { data: ang, error: aErr } = await supabase.from("angebote")
      .select("id, titel, kunde_name, kontakt_id, status, rechnung_id").eq("id", angebotId).single();
    if (aErr || !ang) return NextResponse.json({ error: "Angebot nicht gefunden." }, { status: 404 });

    // 2) Doppel-Schutz
    if (ang.rechnung_id) {
      const { data: vorhanden } = await supabase.from("rechnungen").select("id").eq("id", ang.rechnung_id).maybeSingle();
      if (vorhanden?.id) return NextResponse.json({ rechnungId: vorhanden.id, bereitsVorhanden: true });
    }
    if (ang.status !== "angenommen") {
      return NextResponse.json({ error: "Nur angenommene Angebote können in eine Rechnung umgewandelt werden." }, { status: 400 });
    }

    // 3) Positionen laden
    const { data: posRaw, error: pErr } = await supabase.from("angebot_positionen")
      .select("bezeichnung, menge, einheit, einzelpreis, mwst_satz").eq("angebot_id", angebotId).order("position", { ascending: true });
    if (pErr) return NextResponse.json({ error: "Positionen konnten nicht geladen werden." }, { status: 500 });
    const positionen = (posRaw || []) as AngPos[];
    if (!positionen.length) return NextResponse.json({ error: "Das Angebot hat keine Positionen." }, { status: 400 });

    // 4) Positionen -> Rechnungsposten
    const rechnungsPosten = positionen.map((p, i) => {
      const menge = cent(Number(p.menge) || 0);
      const einzelpreis = cent(Number(p.einzelpreis) || 0);
      return {
        owner_user_id: user.id, position: i + 1,
        bezeichnung: p.bezeichnung || "(ohne Bezeichnung)",
        menge, einheit: (p.einheit || "").trim() || "Stk", einzelpreis,
        mwst_satz: Number(p.mwst_satz) || MWST_STD,
        gesamt_netto: cent(menge * einzelpreis),
      };
    });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    // 5) Rechnung anlegen (Nummer via Trigger)
    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + 14);
    const { data: neueRechnung, error: rErr } = await supabase.from("rechnungen").insert({
      owner_user_id: user.id, auftrag_id: null, kontakt_id: ang.kontakt_id ?? null, firma_id: null,
      titel: ang.titel || "Angebot", empfaenger_name: ang.kunde_name?.trim() || null, zahlungsstatus: "offen",
      rechnungsdatum, leistungsdatum: rechnungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: "EUR",
    }).select("id").single();
    if (rErr || !neueRechnung) {
      console.error("Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neueRechnung.id;

    // 6) Positionen schreiben
    const posMit = rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId }));
    const { error: insPosErr } = await supabase.from("rechnung_positionen").insert(posMit);
    if (insPosErr) {
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: Angebotspositionen konnten nicht übernommen werden.",
        updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    // 7) Nahtstelle zurueckschreiben
    await supabase.from("angebote").update({ rechnung_id: rechnungId, aktualisiert_am: new Date().toISOString() }).eq("id", ang.id);

    return NextResponse.json({ rechnungId, bereitsVorhanden: false });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Angebot Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
