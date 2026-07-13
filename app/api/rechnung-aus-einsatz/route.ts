import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Field Service · P30 — "Rechnung aus Einsatz"
// Brücke einsaetze/einsatz_positionen -> rechnungen/rechnung_positionen.
// Muster 1:1 wie rechnung-aus-werkstatt, aber schlanker: die
// einsatz_positionen sind bereits menge × einzelpreis_netto (keine
// Zeit-/Pauschal-Umrechnung nötig).
//
// - Umsatzsteuer über steuerLogik: je Steuersatz auf die Gruppensumme
//   (§14 Abs. 4 Nr. 7 + 8 UStG), nie netto × 19 % am Kopf.
// - Doppel-Schutz: existiert schon eine Rechnung zum Einsatz -> deren ID
//   zurückgeben, keine zweite anlegen.
// - Positions-Insert schlägt fehl -> Rechnung wird STORNIERT (nicht gelöscht),
//   damit keine Lücke im Nummernkreis entsteht.
// - Rückverweis: einsaetze.rechnung_id wird gesetzt.
// Pfad: app/api/rechnung-aus-einsatz/route.ts
// ============================================================

type EinsatzPos = {
  bezeichnung: string | null;
  menge: number | null;
  einheit: string | null;
  einzelpreis_netto: number | null;
  mwst_satz: number | null;
};

const MWST_STD = 19;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const einsatzId: string = String(body?.einsatzId || body?.einsatz_id || "").trim();
    if (!einsatzId) {
      return NextResponse.json({ error: "Keine Einsatz-ID übergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // ---------- 1) Einsatz laden (RLS: owner_all schützt auf Chef) ----------
    const { data: einsatz, error: eErr } = await supabase
      .from("einsaetze")
      .select("id, titel, kunde_name, rechnung_id, owner_user_id")
      .eq("id", einsatzId)
      .single();
    if (eErr || !einsatz) {
      return NextResponse.json({ error: "Einsatz nicht gefunden." }, { status: 404 });
    }

    // ---------- 2) Doppel-Schutz: bereits fakturiert? ----------
    if (einsatz.rechnung_id) {
      const { data: vorhanden } = await supabase
        .from("rechnungen").select("id").eq("id", einsatz.rechnung_id).single();
      if (vorhanden?.id) {
        return NextResponse.json({ rechnungId: vorhanden.id, bereitsVorhanden: true });
      }
      // Verknüpfung war verwaist -> sauber neu anlegen (fällt unten durch)
    }

    // ---------- 3) Erfasste Leistungen laden ----------
    const { data: posRaw, error: pErr } = await supabase
      .from("einsatz_positionen")
      .select("bezeichnung, menge, einheit, einzelpreis_netto, mwst_satz")
      .eq("einsatz_id", einsatzId)
      .order("created_at", { ascending: true });
    if (pErr) {
      return NextResponse.json({ error: "Leistungen konnten nicht geladen werden." }, { status: 500 });
    }
    const positionen = (posRaw || []) as EinsatzPos[];
    if (positionen.length === 0) {
      return NextResponse.json({ error: "Der Einsatz hat keine erfassten Leistungen — keine Rechnung möglich." }, { status: 400 });
    }

    // ---------- 4) Positionen -> Rechnungsposten (menge × einzelpreis) ----------
    const rechnungsPosten = positionen.map((p, i) => {
      const menge = cent(Number(p.menge) || 0);
      const einzelpreis = cent(Number(p.einzelpreis_netto) || 0);
      return {
        owner_user_id: user.id,
        position: i + 1,
        bezeichnung: p.bezeichnung || "(ohne Bezeichnung)",
        menge,
        einheit: (p.einheit || "").trim() || "Stk",
        einzelpreis,
        mwst_satz: Number(p.mwst_satz) || MWST_STD,
        gesamt_netto: cent(menge * einzelpreis),
      };
    });

    // ---------- 4b) Summen: je Steuersatz auf die Gruppensumme ----------
    const summe = steuerGruppen(
      rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz }))
    );

    // ---------- 5) Rechnung anlegen (Nummer via Trigger) ----------
    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const zahlungszielTage = 14;
    const faellig = new Date(heute);
    faellig.setDate(faellig.getDate() + zahlungszielTage);
    const faelligkeitsdatum = faellig.toISOString().slice(0, 10);

    const { data: neueRechnung, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: user.id,
        auftrag_id: null,
        kontakt_id: null,
        firma_id: null,
        titel: einsatz.titel || "Einsatz",
        empfaenger_name: einsatz.kunde_name?.trim() || null,
        zahlungsstatus: "offen",
        rechnungsdatum,
        leistungsdatum: rechnungsdatum,
        faelligkeitsdatum,
        zahlungsziel_tage: zahlungszielTage,
        netto_summe: summe.netto,
        mwst_summe: summe.steuer,
        brutto_summe: summe.brutto,
        waehrung: "EUR",
      })
      .select("id")
      .single();

    if (rErr || !neueRechnung) {
      console.error("Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neueRechnung.id;

    // ---------- 6) Positionen schreiben ----------
    const posMitRechnung = rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId }));
    const { error: insPosErr } = await supabase.from("rechnung_positionen").insert(posMitRechnung);
    if (insPosErr) {
      console.error("Positionen kopieren fehlgeschlagen:", insPosErr.message);
      await supabase
        .from("rechnungen")
        .update({
          zahlungsstatus: "storniert",
          netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
          notizen: "Automatisch storniert: die Leistungen aus dem Einsatz konnten nicht übernommen werden.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", rechnungId);
      return NextResponse.json(
        { error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." },
        { status: 500 }
      );
    }

    // ---------- 7) Nahtstelle zurückschreiben ----------
    const { error: updErr } = await supabase
      .from("einsaetze")
      .update({ rechnung_id: rechnungId })
      .eq("id", einsatz.id);
    if (updErr) {
      console.error("einsaetze.rechnung_id konnte nicht gesetzt werden:", updErr.message);
      // Rechnung ist trotzdem erstellt — kein harter Abbruch
    }

    return NextResponse.json({ rechnungId, bereitsVorhanden: false });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Einsatz Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
