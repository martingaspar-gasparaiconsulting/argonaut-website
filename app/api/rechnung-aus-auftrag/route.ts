import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · R3 — "Rechnung aus Auftrag"
// Nimmt eine Auftrags-ID, erzeugt daraus eine Rechnung:
//   - Positionen / Summen / Kontakt / Firma / Titel werden 1:1 uebernommen
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

    // ---------- 1) Auftrag laden (RLS schuetzt auf owner) ----------
    const { data: auftrag, error: auftragErr } = await supabase
      .from("auftraege")
      .select(
        "id, titel, kontakt_id, firma_id, netto_summe, mwst_summe, brutto_summe, waehrung, rechnung_id"
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

    // ---------- 4) Rechnung anlegen (Nummer via Trigger) ----------
    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10); // YYYY-MM-DD
    const zahlungszielTage = 14;
    const faellig = new Date(heute);
    faellig.setDate(faellig.getDate() + zahlungszielTage);
    const faelligkeitsdatum = faellig.toISOString().slice(0, 10);

    const { data: neueRechnung, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: user.id,
        auftrag_id: auftrag.id,
        kontakt_id: auftrag.kontakt_id ?? null,
        firma_id: auftrag.firma_id ?? null,
        titel: auftrag.titel ?? null,
        zahlungsstatus: "offen",
        rechnungsdatum,
        leistungsdatum: rechnungsdatum,
        faelligkeitsdatum,
        zahlungsziel_tage: zahlungszielTage,
        netto_summe: auftrag.netto_summe ?? 0,
        mwst_summe: auftrag.mwst_summe ?? 0,
        brutto_summe: auftrag.brutto_summe ?? 0,
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
    const posListe = (positionen || []).map((p: any, i: number) => ({
      owner_user_id: user.id,
      rechnung_id: rechnungId,
      position: p.position ?? i + 1,
      bezeichnung: p.bezeichnung ?? null,
      beschreibung: p.beschreibung ?? null,
      menge: p.menge ?? 1,
      einheit: p.einheit ?? "Stk",
      einzelpreis: p.einzelpreis ?? 0,
      mwst_satz: p.mwst_satz ?? 19,
      gesamt_netto: p.gesamt_netto ?? 0,
    }));

    if (posListe.length > 0) {
      const { error: insPosErr } = await supabase.from("rechnung_positionen").insert(posListe);
      if (insPosErr) {
        // Rechnung existiert bereits — Positionen-Fehler nicht verschweigen, aber Rechnung bleibt nutzbar
        console.error("Positionen kopieren fehlgeschlagen:", insPosErr.message);
      }
    }

    // ---------- 6) Nahtstelle zurueckschreiben ----------
    const { error: updErr } = await supabase
      .from("auftraege")
      .update({ rechnung_id: rechnungId })
      .eq("id", auftrag.id);

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
