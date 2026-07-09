import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import {
  positionsBetrag, positionsMinuten, minutenZuStunden,
  type PositionBasis,
} from "@/app/dashboard/_components/leistungLogik";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · KFZ Block 1.2 · "Rechnung aus Werkstatt-Auftrag"
// Brücke werkstatt_auftraege/werkstatt_positionen -> rechnungen/rechnung_positionen.
// - Summen werden mit derselben leistungLogik gerechnet wie im Frontend
//   (eine Quelle der Wahrheit, keine doppelte Rechenlogik).
// - Werkstatt-Positionen werden in saubere Rechnungsposten übersetzt:
//     Zeit-Position -> Menge = Stunden (dezimal), Einheit "Std", Einzelpreis = Stundensatz
//     Material/Stück -> Menge * Einzelpreis direkt, Einheit "Stk"
//   So gilt immer: menge * einzelpreis = gesamt_netto.
// - kontakt_id bleibt null; kunde_name wandert in empfaenger_name (Freitext-Empfänger).
// - Doppel-Schutz: existiert bereits eine Rechnung zum Auftrag (rechnung_id gesetzt
//   und Rechnung existiert), wird deren ID zurückgegeben — keine zweite Rechnung.
// ============================================================

type WerkstattPositionRow = PositionBasis & {
  id: string;
  bezeichnung: string | null;
  extern_firma: string | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const auftragId: string = String(body?.auftragId || body?.auftrag_id || "").trim();
    if (!auftragId) {
      return NextResponse.json({ error: "Keine Auftrags-ID übergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // ---------- 1) Werkstatt-Auftrag laden (RLS schützt auf owner) ----------
    const { data: auftrag, error: auftragErr } = await supabase
      .from("werkstatt_auftraege")
      .select("id, titel, kunde_name, kennzeichen, rechnung_id, freigabe_status")
      .eq("id", auftragId)
      .single();

    if (auftragErr || !auftrag) {
      return NextResponse.json({ error: "Werkstatt-Auftrag nicht gefunden." }, { status: 404 });
    }

    // ---------- 2) Doppel-Schutz: bereits fakturiert? ----------
    if (auftrag.rechnung_id) {
      const { data: vorhanden } = await supabase
        .from("rechnungen")
        .select("id")
        .eq("id", auftrag.rechnung_id)
        .single();
      if (vorhanden?.id) {
        return NextResponse.json({ rechnungId: vorhanden.id, bereitsVorhanden: true });
      }
      // Verknüpfung war verwaist -> sauber neu anlegen (fällt unten durch)
    }

    // ---------- 3) Werkstatt-Positionen laden ----------
    const { data: positionenRaw, error: posErr } = await supabase
      .from("werkstatt_positionen")
      .select("*")
      .eq("auftrag_id", auftragId)
      .order("erstellt_am", { ascending: true });

    if (posErr) {
      return NextResponse.json({ error: "Positionen konnten nicht geladen werden." }, { status: 500 });
    }
    const positionen = (positionenRaw || []) as WerkstattPositionRow[];

    if (positionen.length === 0) {
      return NextResponse.json({ error: "Der Auftrag hat keine Positionen — keine Rechnung möglich." }, { status: 400 });
    }

    // ---------- 4) Positionen -> Rechnungsposten übersetzen (leistungLogik) ----------
    const mwstSatz = 19; // Standard; §19-Kleinunternehmer wird auf der Rechnung umgeschaltet
    let nettoSumme = 0;
    const rechnungsPosten = positionen.map((p, i) => {
      const betrag = positionsBetrag(p); // netto, kann null sein (Preis fehlt)
      const gesamtNetto = betrag ?? 0;
      nettoSumme += gesamtNetto;

      const istMaterial = p.art === "material" || p.erfassungsart === "stueck";
      let menge: number;
      let einheit: string;
      let einzelpreis: number;

      if (istMaterial) {
        menge = typeof p.menge === "number" ? p.menge : 1;
        einheit = "Stk";
        einzelpreis = typeof p.einzelpreis_netto === "number" ? p.einzelpreis_netto : 0;
      } else {
        // Zeit-Position: in Stunden umrechnen, Einzelpreis = Stundensatz
        const stunden = Math.round(minutenZuStunden(positionsMinuten(p)) * 100) / 100;
        menge = stunden;
        einheit = "Std";
        einzelpreis = typeof p.einzelpreis_netto === "number" ? p.einzelpreis_netto : 0;
      }

      const bez = (p.bezeichnung || "(ohne Bezeichnung)") +
        (p.extern ? ` (extern${p.extern_firma ? " · " + p.extern_firma : ""})` : "");

      return {
        owner_user_id: user.id,
        position: i + 1,
        bezeichnung: bez,
        menge,
        einheit,
        einzelpreis,
        mwst_satz: mwstSatz,
        gesamt_netto: Math.round(gesamtNetto * 100) / 100,
      };
    });

    nettoSumme = Math.round(nettoSumme * 100) / 100;
    const mwstSumme = Math.round(nettoSumme * (mwstSatz / 100) * 100) / 100;
    const bruttoSumme = Math.round((nettoSumme + mwstSumme) * 100) / 100;

    // ---------- 5) Rechnung anlegen (Nummer via Trigger) ----------
    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const zahlungszielTage = 14;
    const faellig = new Date(heute);
    faellig.setDate(faellig.getDate() + zahlungszielTage);
    const faelligkeitsdatum = faellig.toISOString().slice(0, 10);

    // Feinschliff 3: Empfänger separat führen (Werkstatt-Kunden sind Freitext,
    // kein CRM-Kontakt). Der Titel bleibt der Auftragstitel + Kennzeichen.
    const empfaengerName = auftrag.kunde_name?.trim() || null;
    const titel = auftrag.kennzeichen
      ? `${auftrag.titel || "Werkstatt-Auftrag"} · ${auftrag.kennzeichen}`
      : (auftrag.titel || "Werkstatt-Auftrag");

    const { data: neueRechnung, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: user.id,
        auftrag_id: null,          // kein US-CORE-Auftrag; Werkstatt-Verknüpfung läuft über werkstatt_auftraege.rechnung_id
        kontakt_id: null,          // Werkstatt-Kunde ist Freitext -> siehe empfaenger_name
        firma_id: null,
        titel,
        empfaenger_name: empfaengerName,
        zahlungsstatus: "offen",
        rechnungsdatum,
        leistungsdatum: rechnungsdatum,
        faelligkeitsdatum,
        zahlungsziel_tage: zahlungszielTage,
        netto_summe: nettoSumme,
        mwst_summe: mwstSumme,
        brutto_summe: bruttoSumme,
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
      // Rechnung existiert bereits — kein harter Abbruch
    }

    // ---------- 7) Nahtstelle zurückschreiben ----------
    const { error: updErr } = await supabase
      .from("werkstatt_auftraege")
      .update({ rechnung_id: rechnungId, aktualisiert_am: new Date().toISOString() })
      .eq("id", auftrag.id);
    if (updErr) {
      console.error("werkstatt_auftraege.rechnung_id konnte nicht gesetzt werden:", updErr.message);
      // Rechnung ist trotzdem erstellt — kein harter Abbruch
    }

    return NextResponse.json({ rechnungId, bereitsVorhanden: false });
  } catch (err: any) {
    console.error("Rechnung-aus-Werkstatt Fehler:", err?.message || err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
