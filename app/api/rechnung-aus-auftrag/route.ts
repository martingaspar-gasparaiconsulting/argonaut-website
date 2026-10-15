import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { abrechnungPruefen } from "@/lib/nurGeschaeftsleitung";
import { quellSchreiber } from "@/lib/abrechnungServer";
import { auftragZuRechnung } from "@/lib/rechnungAusAuftrag";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · R3 — "Rechnung aus Auftrag"
// Nimmt eine Auftrags-ID, erzeugt daraus eine Rechnung:
//   - Positionen / Kontakt / Firma / Titel werden uebernommen; die Summen
//     werden aus den Positionen je Steuersatz NEU gerechnet (HW-7)
//   - Leistungsdatum = Lieferdatum des Auftrags (sonst Rechnungsdatum)
//   - Positionen scheitern -> Rechnung wird storniert (HW-7, wie Angebot)
//   - Rechnungsnummer kommt automatisch aus dem DB-Trigger (RE-JJJJ-XXXX)
//   - Faelligkeit = Rechnungsdatum + Zahlungsziel (Tage)
//   - schreibt die neue rechnung_id zurueck in auftraege
// Doppel-Schutz: existiert bereits eine Rechnung zum Auftrag,
//   wird deren ID zurueckgegeben (keine zweite Rechnung).
// ============================================================

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
    // „Darf abrechnen" (27.09.26): Chef oder Mitarbeiter mit Haken. Die Rechnung gehört immer dem Betrieb.
    const abr = await abrechnungPruefen(supabase, user.id);
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });
    const betrieb = abr.betrieb;
    const schreiber = quellSchreiber(supabase, abr);

    // ---------- 1) Auftrag laden (RLS schuetzt auf owner) ----------
    const { data: auftrag, error: auftragErr } = await supabase
      .from("auftraege")
      .select(
        "id, titel, kontakt_id, firma_id, waehrung, rechnung_id, standort_id, lieferdatum"
      )
      .eq("id", auftragId)
      .single();

    if (auftragErr || !auftrag) {
      return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
    }

    // ---------- 2) Doppel-Schutz: bereits fakturiert? ----------
    if (auftrag.rechnung_id) {
      // Sicherstellen, dass die verknuepfte Rechnung wirklich (noch) existiert
      const { data: vorhanden } = await supabase
        .from("rechnungen")
        .select("id")
        .eq("id", auftrag.rechnung_id)
        .single();
      if (vorhanden?.id) {
        return NextResponse.json({ rechnungId: vorhanden.id, bereitsVorhanden: true });
      }
      // Verknuepfung war verwaist -> wir legen sauber neu an (faellt unten durch)
    }

    // ---------- 3) Auftrags-Positionen laden ----------
    const { data: positionen, error: posErr } = await supabase
      .from("auftrag_positionen")
      .select("position, bezeichnung, beschreibung, menge, einheit, einzelpreis, mwst_satz, gesamt_netto")
      .eq("auftrag_id", auftragId)
      .order("position", { ascending: true });

    if (posErr) {
      return NextResponse.json({ error: "Positionen konnten nicht geladen werden." }, { status: 500 });
    }
    if (!positionen || positionen.length === 0) {
      return NextResponse.json({ error: "Der Auftrag hat keine Positionen. Bitte zuerst Positionen im Auftrag erfassen." }, { status: 400 });
    }
    // Kleinunternehmer setzt der Datenbank-Trigger (rechnung_ku_position/_kopf) wie bei allen Rechnungswegen
    const { posten, summen } = auftragZuRechnung(positionen);

    // ---------- 4) Rechnung anlegen (Nummer via Trigger) ----------
    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10); // YYYY-MM-DD
    const zahlungszielTage = 14;
    const faellig = new Date(heute);
    faellig.setDate(faellig.getDate() + zahlungszielTage);
    const faelligkeitsdatum = faellig.toISOString().slice(0, 10);

    // Filial-Stempel: bevorzugt der Standort des Auftrags, sonst der aktive Standort (Cookie). Fail-open: null.
    const standortId = auftrag.standort_id ?? standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neueRechnung, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: betrieb,
        standort_id: standortId,
        auftrag_id: auftrag.id,
        kontakt_id: auftrag.kontakt_id ?? null,
        firma_id: auftrag.firma_id ?? null,
        titel: auftrag.titel ?? null,
        zahlungsstatus: "offen",
        rechnungsdatum,
        leistungsdatum: (auftrag as { lieferdatum?: string | null }).lieferdatum || rechnungsdatum,
        faelligkeitsdatum,
        zahlungsziel_tage: zahlungszielTage,
        netto_summe: summen.netto,
        mwst_summe: summen.mwst,
        brutto_summe: summen.brutto,
        waehrung: auftrag.waehrung || "EUR",
      })
      .select("id")
      .single();

    if (rErr || !neueRechnung) {
      console.error("Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }

    const rechnungId = neueRechnung.id;

    // ---------- 5) Positionen 1:1 uebernehmen ----------
    const posListe = posten.map((p) => ({ ...p, owner_user_id: betrieb, rechnung_id: rechnungId }));
    const { error: insPosErr } = await supabase.from("rechnung_positionen").insert(posListe);
    if (insPosErr) {
      // HW-7: keine Rechnung ohne Positionen stehen lassen — stornieren (keine Nummernluecke)
      console.error("Positionen kopieren fehlgeschlagen:", insPosErr.message);
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: Auftragspositionen konnten nicht übernommen werden.",
        updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    // ---------- 6) Nahtstelle zurueckschreiben ----------
    const { error: updErr } = await schreiber
      .from("auftraege")
      .update({ rechnung_id: rechnungId })
      .eq("id", auftrag.id)
      .eq("owner_user_id", betrieb);

    if (updErr) {
      console.error("auftraege.rechnung_id konnte nicht gesetzt werden:", updErr.message);
      // Rechnung ist trotzdem erstellt — kein harter Abbruch
    }

    return NextResponse.json({ rechnungId, bereitsVorhanden: false });
  } catch (err: any) {
    console.error("Rechnung-aus-Auftrag Fehler:", err?.message || err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
