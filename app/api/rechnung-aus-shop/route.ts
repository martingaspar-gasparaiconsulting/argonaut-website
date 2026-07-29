// app/api/rechnung-aus-shop/route.ts
// ============================================================================
// ARGONAUT OS · Shop-Verzahnung Stufe 1
// Brücke shop_bestellungen -> rechnungen/rechnung_positionen.
// Nach dem Muster von /api/rechnung-aus-reservierung (Doppel-Schutz via
// rechnung_id, Storno bei Positionsfehler, Nummer via Trigger).
//
// ⚠️ MwSt: Shop-Positionen tragen KEINEN Steuersatz und die Preise sind BRUTTO
//   (der Kunde hat brutto bezahlt). Wir rechnen die Netto-Werte mit Standard
//   19 % heraus, damit die Rechnungs-Bruttosumme dem entspricht, was im Shop
//   bezahlt wurde. Für 7-%-Ware oder Kleinunternehmer später anpassbar.
//
// Body:    { bestellungId }
// Antwort: { rechnungId, bereitsVorhanden }
// ============================================================================

import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZAHLUNGSZIEL_TAGE = 14;
const STANDARD_MWST = 19;

type ShopPos = { bezeichnung?: string; menge?: number; einzelpreis?: number };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const bestellungId = String(body?.bestellungId || body?.bestellung_id || "").trim();
    if (!bestellungId) return NextResponse.json({ error: "Keine Bestell-ID übergeben." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    // ---- 1) Bestellung laden (RLS schützt auf owner) ----
    const { data: b, error: bErr } = await supabase
      .from("shop_bestellungen")
      .select("id, extern_id, besteller, email, status, brutto_summe, positionen, rechnung_id")
      .eq("id", bestellungId)
      .single();
    if (bErr || !b) return NextResponse.json({ error: "Bestellung nicht gefunden." }, { status: 404 });

    // ---- 2) Doppel-Schutz: bereits fakturiert? ----
    if (b.rechnung_id) {
      const { data: vorhanden } = await supabase.from("rechnungen").select("id").eq("id", b.rechnung_id).single();
      if (vorhanden?.id) return NextResponse.json({ rechnungId: vorhanden.id, bereitsVorhanden: true });
      // Verwaiste Verknüpfung -> unten sauber neu anlegen.
    }
    if (b.status === "storniert") {
      return NextResponse.json({ error: "Eine stornierte Bestellung wird nicht abgerechnet." }, { status: 400 });
    }

    // ---- 3) Positionen aufbereiten (BRUTTO -> NETTO, Standard 19 %) ----
    const posRaw = Array.isArray(b.positionen) ? (b.positionen as ShopPos[]) : [];
    if (posRaw.length === 0) {
      return NextResponse.json({ error: "Die Bestellung hat keine Positionen — keine Rechnung möglich." }, { status: 400 });
    }
    const rechnungsPosten = posRaw.map((p, i) => {
      const menge = Number(p?.menge) || 1;
      const bruttoEinzel = Number(p?.einzelpreis) || 0;
      const nettoEinzel = cent(bruttoEinzel / (1 + STANDARD_MWST / 100));
      return {
        owner_user_id: user.id,
        position: i + 1,
        bezeichnung: (p?.bezeichnung || "Position").toString().slice(0, 300),
        menge,
        einheit: "Stk",
        einzelpreis: nettoEinzel,
        mwst_satz: STANDARD_MWST,
        gesamt_netto: cent(menge * nettoEinzel),
      };
    });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    // ---- 4) Rechnung anlegen (Nummer via Trigger) ----
    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + ZAHLUNGSZIEL_TAGE);
    const titel = b.extern_id ? `Online-Bestellung ${b.extern_id}` : "Online-Bestellung";

    const { data: neueRechnung, error: rErr } = await supabase.from("rechnungen").insert({
      owner_user_id: user.id, auftrag_id: null, kontakt_id: null, firma_id: null,
      titel, empfaenger_name: b.besteller || null, zahlungsstatus: "offen",
      rechnungsdatum, leistungsdatum: rechnungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: ZAHLUNGSZIEL_TAGE, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: "EUR",
    }).select("id").single();
    if (rErr || !neueRechnung) {
      console.error("Shop-Rechnung anlegen fehlgeschlagen:", rErr?.message ?? rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neueRechnung.id as string;

    // ---- 5) Positionen schreiben (Storno bei Fehler) ----
    const posMit = rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId }));
    const { error: insErr } = await supabase.from("rechnung_positionen").insert(posMit);
    if (insErr) {
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: Positionen konnten nicht übernommen werden.", updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    // ---- 6) Nahtstelle zurückschreiben (verhindert Doppel-Rechnung) ----
    const { error: updErr } = await supabase.from("shop_bestellungen").update({ rechnung_id: rechnungId }).eq("id", bestellungId);
    if (updErr) console.error("shop_bestellungen.rechnung_id nicht gesetzt:", updErr.message);

    return NextResponse.json({ rechnungId, bereitsVorhanden: false });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Shop Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
