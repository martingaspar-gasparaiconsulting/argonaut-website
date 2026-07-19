import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Welle 3 · "Rechnung aus Fachpaket" (generisch)
// EINE Brücke für alle Fachpakete (Wellness, Tier, Bildung …). Nimmt fertige
// Positionen + Empfänger entgegen und erzeugt daraus eine echte Rechnung —
// 1:1 dasselbe Muster wie rechnung-aus-projekt:
//  · MwSt je Steuersatz auf die Gruppensumme (steuerLogik).
//  · Positions-Insert scheitert -> Rechnung STORNIEREN (keine Nummernlücke).
//  · Kontakt-Verknüpfung: liegt die E-Mail des Empfängers als Kontakt vor,
//    wird kontakt_id gesetzt -> die Rechnung erscheint in der Kunde-360°-Akte.
//  · Quelle (z. B. wellness_behandlungen) wird – falls Spalten vorhanden –
//    als abgerechnet markiert (Doppel-Schutz). Nur erlaubte Tabellen.
// ============================================================

const MWST_STD = 19;

// Nur diese Tabellen dürfen als "abgerechnet" markiert werden (Sicherheit).
const ERLAUBTE_QUELLEN = new Set<string>([
  "wellness_behandlungen",
  "tier_behandlungen",
  "bildung_anmeldungen",
]);

type EingangsPosten = {
  bezeichnung?: string;
  menge?: number;
  einheit?: string;
  einzelpreis?: number;
  mwst_satz?: number;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const titel = String(body?.titel || "").trim() || "Rechnung";
    const empfaengerName = String(body?.empfaenger_name || "").trim() || null;
    const empfaengerEmail = String(body?.empfaenger_email || "").trim().toLowerCase();
    const eingang: EingangsPosten[] = Array.isArray(body?.positionen) ? body.positionen : [];
    const quelleTabelle = String(body?.quelle_tabelle || "").trim();
    const quelleIds: string[] = Array.isArray(body?.quelle_ids)
      ? body.quelle_ids.map((x: unknown) => String(x)).filter(Boolean)
      : [];

    // Nur Positionen mit echtem Preis übernehmen.
    const gefiltert = eingang.filter((p) => (Number(p?.einzelpreis) || 0) > 0 || (Number(p?.menge) || 0) > 0);
    if (!gefiltert.length) {
      return NextResponse.json({ error: "Keine abrechenbaren Positionen übergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    // 1) Positionen aufbauen (Menge × Einzelpreis)
    const rechnungsPosten = gefiltert.map((p, i) => {
      const menge = cent(Number(p.menge) || 1);
      const einzelpreis = cent(Number(p.einzelpreis) || 0);
      return {
        owner_user_id: user.id,
        position: i + 1,
        bezeichnung: String(p.bezeichnung || "Leistung").slice(0, 300),
        menge,
        einheit: String(p.einheit || "Leistung").slice(0, 20),
        einzelpreis,
        mwst_satz: Number(p.mwst_satz) || MWST_STD,
        gesamt_netto: cent(menge * einzelpreis),
      };
    });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    // 2) Kontakt über E-Mail verknüpfen (best effort, RLS = nur eigene)
    let kontaktId: string | null = null;
    if (empfaengerEmail) {
      const { data: k } = await supabase
        .from("kontakte").select("id").ilike("email", empfaengerEmail).limit(1).maybeSingle();
      if (k?.id) kontaktId = String(k.id);
    }

    // 3) Rechnung anlegen (Nummer via Trigger)
    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + 14);
    const { data: neueRechnung, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: user.id, auftrag_id: null, kontakt_id: kontaktId, firma_id: null,
        titel, empfaenger_name: empfaengerName, zahlungsstatus: "offen",
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
        notizen: "Automatisch storniert: Positionen konnten nicht übernommen werden.",
        updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    // 5) Quelle als abgerechnet markieren (nur erlaubte Tabellen, Fehler ignorieren)
    if (quelleTabelle && ERLAUBTE_QUELLEN.has(quelleTabelle) && quelleIds.length) {
      const { error: markErr } = await supabase.from(quelleTabelle)
        .update({ abgerechnet: true, rechnung_id: rechnungId }).in("id", quelleIds);
      if (markErr) console.error(`${quelleTabelle} markieren fehlgeschlagen:`, markErr.message);
    }

    return NextResponse.json({ rechnungId, anzahl: rechnungsPosten.length, kontaktVerknuepft: !!kontaktId });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Fachpaket Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
