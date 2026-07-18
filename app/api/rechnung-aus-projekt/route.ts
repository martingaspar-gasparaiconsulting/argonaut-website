import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Bündel 10 · "Rechnung aus Projekt"
// Erzeugt aus den OFFENEN (nicht abgerechneten) projektleistungen eines
// Projekts eine Rechnung — 1:1 dasselbe Muster wie rechnung-aus-einsatz:
//  · MwSt je Steuersatz auf die Gruppensumme (steuerLogik).
//  · Positions-Insert scheitert -> Rechnung STORNIEREN (keine Nummernlücke).
//  · Danach werden die Leistungen als abgerechnet markiert (+ rechnung_id).
// ============================================================

const MWST_STD = 19;

type Leistung = {
  id: string; beschreibung: string | null; datum: string | null;
  stunden: number | null; stundensatz: number | null; mwst_satz: number | null; kunde_name: string | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const projektId = String(body?.projektId || "").trim();
    if (!projektId) return NextResponse.json({ error: "Kein Projekt übergeben." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    // 1) Offene Leistungen des Projekts (RLS: nur eigene)
    const { data: posRaw, error: pErr } = await supabase
      .from("projektleistungen")
      .select("id, beschreibung, datum, stunden, stundensatz, mwst_satz, kunde_name")
      .eq("projekt_id", projektId).eq("abgerechnet", false)
      .order("datum", { ascending: true });
    if (pErr) return NextResponse.json({ error: "Leistungen konnten nicht geladen werden." }, { status: 500 });
    const leistungen = (posRaw || []) as Leistung[];
    if (!leistungen.length) return NextResponse.json({ error: "Keine offenen Leistungen zum Abrechnen." }, { status: 400 });

    const { data: proj } = await supabase.from("projekte").select("name").eq("id", projektId).maybeSingle();
    const kunde = leistungen.find((l) => l.kunde_name)?.kunde_name || null;

    // 2) Positionen (Stunden × Stundensatz)
    const rechnungsPosten = leistungen.map((p, i) => {
      const menge = cent(Number(p.stunden) || 0);
      const einzelpreis = cent(Number(p.stundensatz) || 0);
      const datumTxt = p.datum ? new Date(p.datum).toLocaleDateString("de-DE") : "";
      return {
        owner_user_id: user.id, position: i + 1,
        bezeichnung: (datumTxt ? `${datumTxt} · ` : "") + (p.beschreibung || "Leistung"),
        menge, einheit: "Std", einzelpreis,
        mwst_satz: Number(p.mwst_satz) || MWST_STD,
        gesamt_netto: cent(menge * einzelpreis),
      };
    });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    // 3) Rechnung anlegen (Nummer via Trigger)
    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + 14);
    const { data: neueRechnung, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: user.id, auftrag_id: null, kontakt_id: null, firma_id: null,
        titel: proj?.name ? `Projekt: ${proj.name}` : "Projektabrechnung",
        empfaenger_name: kunde, zahlungsstatus: "offen",
        rechnungsdatum, leistungsdatum: rechnungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
        zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: "EUR",
      })
      .select("id").single();
    if (rErr || !neueRechnung) {
      console.error("Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neueRechnung.id;

    // 4) Positionen schreiben
    const posMit = rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId }));
    const { error: insPosErr } = await supabase.from("rechnung_positionen").insert(posMit);
    if (insPosErr) {
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: Projektleistungen konnten nicht übernommen werden.",
        updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    // 5) Leistungen als abgerechnet markieren
    const { error: updErr } = await supabase.from("projektleistungen")
      .update({ abgerechnet: true, rechnung_id: rechnungId })
      .in("id", leistungen.map((l) => l.id));
    if (updErr) console.error("projektleistungen markieren fehlgeschlagen:", updErr.message);

    return NextResponse.json({ rechnungId, anzahl: leistungen.length });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Projekt Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
