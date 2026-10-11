// app/api/rechnung-aus-shop/route.ts
// ============================================================================
// ARGONAUT OS · Shop-Verzahnung Stufe 1
// Brücke shop_bestellungen -> rechnungen/rechnung_positionen.
// Nach dem Muster von /api/rechnung-aus-reservierung (Doppel-Schutz via
// rechnung_id, Storno bei Positionsfehler, Nummer via Trigger).
//
// ⚠️ MwSt: Shop-Preise sind BRUTTO (der Kunde hat brutto bezahlt). Jede Position
//   trägt ihren eigenen Satz (Feld `mwst`: 7 für Lebensmittel, 19 für Getränke/
//   Non-Food, 0 steuerfrei). Fehlt der Satz -> Fallback 19 %. Geschäftskunden-
//   Positionen (Paket 317) tragen einzelpreis_netto und werden NICHT zurückgerechnet. Verschiedene Sätze in einer
//   Bestellung werden über steuerGruppen korrekt getrennt ausgewiesen. Wir rechnen
//   Netto je Position heraus, damit die Rechnungs-Bruttosumme dem Bezahlten
//   entspricht. (Kleinunternehmer = 0 % kommt mit der globalen Einstellung.)
//
// Body:    { bestellungId }
// Antwort: { rechnungId, bereitsVorhanden }
// ============================================================================

import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";
import { abrechnungPruefen } from "@/lib/nurGeschaeftsleitung";
import { quellSchreiber } from "@/lib/abrechnungServer";
import { ladeBetriebProfil } from "@/lib/betriebProfil";
import { rechnungsPosten as positionRechnen, zahlungsziel } from "@/lib/shopB2b";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZAHLUNGSZIEL_TAGE = 14;
// Standard-Satz 19 % steht jetzt in lib/shopB2b.rechnungsPosten (Paket 317).

type ShopPos = { bezeichnung?: string; menge?: number; einzelpreis?: number; einzelpreis_netto?: number; mwst?: number; einheit?: string };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const bestellungId = String(body?.bestellungId || body?.bestellung_id || "").trim();
    if (!bestellungId) return NextResponse.json({ error: "Keine Bestell-ID übergeben." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    // „Darf abrechnen" (27.09.26): Chef oder Mitarbeiter mit Haken. Die Rechnung gehört immer dem Betrieb.
    const abr = await abrechnungPruefen(supabase, user.id);
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });
    const betrieb = abr.betrieb;
    const schreiber = quellSchreiber(supabase, abr);

    // Kleinunternehmer-Einstellung (§19, global im Profil) → 0 % auf alles, Vorrang vor Positions-Sätzen.
    // Kleinunternehmer-Regel gilt für den BETRIEB, nicht für die Person, die klickt.
    const prof = await ladeBetriebProfil(supabase, user.id);
    const kleinunternehmer = !!prof?.kleinunternehmer;

    // ---- 1) Bestellung laden (RLS schützt auf owner) ----
    // Paket 317 (S3a): Geschäftskunde, Kontakt und Zahlart mitlesen; fehlen die Spalten (SQL p316 offen), ohne sie.
    type BestellZeile = {
      id: string; extern_id: string | null; besteller: string | null; email: string | null; status: string;
      brutto_summe: number; positionen: unknown; rechnung_id: string | null;
      kontakt_id?: string | null; shop_kunde_id?: string | null; zahlart?: string | null;
    };
    const GRUND = "id, extern_id, besteller, email, status, brutto_summe, positionen, rechnung_id";
    let antwortB = await supabase.from("shop_bestellungen").select(GRUND + ", kontakt_id, shop_kunde_id, zahlart").eq("id", bestellungId).single();
    if (antwortB.error && antwortB.error.code !== "PGRST116") antwortB = await supabase.from("shop_bestellungen").select(GRUND).eq("id", bestellungId).single();
    const b = antwortB.data as unknown as BestellZeile | null;
    if (antwortB.error || !b) return NextResponse.json({ error: "Bestellung nicht gefunden." }, { status: 404 });

    // Zahlungsziel: bei Kauf auf Rechnung das des Geschäftskunden, sonst wie bisher 14 Tage.
    let zielTage = ZAHLUNGSZIEL_TAGE;
    if (b.shop_kunde_id && b.zahlart === "rechnung") {
      const { data: sk } = await supabase.from("shop_kunde").select("zahlungsziel_tage").eq("id", b.shop_kunde_id).maybeSingle();
      zielTage = zahlungsziel((sk as { zahlungsziel_tage?: unknown } | null)?.zahlungsziel_tage);
    }

    // ---- 2) Doppel-Schutz: bereits fakturiert? ----
    if (b.rechnung_id) {
      const { data: vorhanden } = await supabase.from("rechnungen").select("id").eq("id", b.rechnung_id).single();
      if (vorhanden?.id) return NextResponse.json({ rechnungId: vorhanden.id, bereitsVorhanden: true });
      // Verwaiste Verknüpfung -> unten sauber neu anlegen.
    }
    // Paket 146 (freigegeben 28.09.2026): Archiv aus dem Altsystem wird nie abgerechnet.
    if (b.status === "abgeschlossen") {
      return NextResponse.json({ error: "Diese Bestellung stammt aus dem Altsystem (Archiv) und wird nicht abgerechnet." }, { status: 400 });
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
      // Paket 317: Satz und Netto je Position aus lib/shopB2b (Netto-Vorgabe der Geschäftskunden unverändert;
      // Claude-Befund: steuerfreie Shop-Artikel mit mwst 0 liefen hier mit 19 % — 0 bleibt jetzt 0).
      const { satz, nettoEinzel } = positionRechnen(p ?? {}, kleinunternehmer, cent);
      return {
        owner_user_id: betrieb,
        position: i + 1,
        bezeichnung: (p?.bezeichnung || "Position").toString().slice(0, 300),
        menge,
        einheit: (p?.einheit || "Stk").toString().slice(0, 20),
        einzelpreis: nettoEinzel,
        mwst_satz: satz,
        gesamt_netto: cent(menge * nettoEinzel),
      };
    });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    // ---- 4) Rechnung anlegen (Nummer via Trigger) ----
    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + zielTage);
    const titel = b.extern_id ? `Online-Bestellung ${b.extern_id}` : "Online-Bestellung";

    const standortId = standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neueRechnung, error: rErr } = await supabase.from("rechnungen").insert({
      owner_user_id: betrieb, standort_id: standortId, auftrag_id: null, kontakt_id: b.kontakt_id ?? null, firma_id: null,
      titel, empfaenger_name: b.besteller || null, zahlungsstatus: "offen", kleinunternehmer,
      rechnungsdatum, leistungsdatum: rechnungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: zielTage, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: "EUR",
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
    const { error: updErr } = await schreiber.from("shop_bestellungen").update({ rechnung_id: rechnungId }).eq("id", bestellungId).eq("owner_user_id", betrieb);
    if (updErr) console.error("shop_bestellungen.rechnung_id nicht gesetzt:", updErr.message);

    return NextResponse.json({ rechnungId, bereitsVorhanden: false });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Shop Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
