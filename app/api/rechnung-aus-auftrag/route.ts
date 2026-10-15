import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { abrechnungPruefen } from "@/lib/nurGeschaeftsleitung";
import { quellSchreiber } from "@/lib/abrechnungServer";
import { auftragZuRechnung, abschlagAusAuftrag, rechnungsartLesen, leistungsstandLesen, gueltigeAbschlaege, abschlaegeNetto, type AbschlagRechnungZeile } from "@/lib/rechnungAusAuftrag";
import { satzAusBetraegen } from "@/lib/abschlagsrechnung";
import { doppelWarnung, trotzdemGewollt } from "@/lib/doppelabrechnung";

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
    // HW-9: normal | abschlag (mit Leistungsstand in %) | schluss
    const art = rechnungsartLesen(body?.art);
    const prozent = art === "abschlag" ? leistungsstandLesen(body?.prozent) : null;
    if (art === "abschlag" && prozent === null) {
      return NextResponse.json({ error: "Bitte den Leistungsstand in Prozent angeben (mehr als 0, höchstens 100)." }, { status: 400 });
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

    // ---------- 2) Doppel-Schutz: bereits (schluss-)fakturiert? ----------
    // Abschlaege duerfen neben einer offenen Endabrechnung nicht entstehen -> Warnung unten.
    if (auftrag.rechnung_id && art !== "abschlag") {
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

    // ---------- 2b) HW-8: andere Rechnungen zum selben Auftrag (z. B. aus Einsaetzen, Abschlaege)? ----------
    const { data: andere } = await supabase
      .from("rechnungen")
      .select("id, rechnungsnummer, rechnungsdatum, rechnungsart, zahlungsstatus, netto_summe, mwst_summe")
      .eq("auftrag_id", auftrag.id);
    const warnung = doppelWarnung(andere, "diesem Auftrag", art);
    if (warnung && !trotzdemGewollt(body)) {
      return NextResponse.json({ error: warnung, doppelt: true, warnung }, { status: 409 });
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
    const voll = auftragZuRechnung(positionen);
    const abschlagsZeilen = (andere || []) as AbschlagRechnungZeile[];
    let posten = voll.posten;
    let summen = voll.summen;
    if (art === "abschlag") {
      const ab = abschlagAusAuftrag(positionen, prozent as number);
      // Alle Abschlaege zusammen nie ueber den Auftragswert (netto)
      const bisher = abschlaegeNetto(abschlagsZeilen);
      if (bisher + ab.summen.netto > voll.summen.netto + 0.005) {
        return NextResponse.json({
          error: `Mit diesem Abschlag lägen alle Abschläge über dem Auftragswert (bisher ${bisher.toFixed(2).replace(".", ",")} € netto von ${voll.summen.netto.toFixed(2).replace(".", ",")} € netto). Bitte den Leistungsstand prüfen oder die Schlussrechnung stellen.`,
        }, { status: 400 });
      }
      posten = ab.posten;
      summen = ab.summen;
    }

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
        titel: art === "abschlag"
          ? `Abschlagsrechnung ${gueltigeAbschlaege(abschlagsZeilen).length + 1} – ${auftrag.titel ?? "Auftrag"}`
          : art === "schluss" ? `Schlussrechnung – ${auftrag.titel ?? "Auftrag"}` : (auftrag.titel ?? null),
        rechnungsart: art,
        gesamt_netto_vereinbart: art === "normal" ? null : voll.summen.netto,
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

    // ---------- 5b) HW-9: Schlussrechnung -> bisherige Abschlaege absetzen ----------
    if (art === "schluss") {
      const rows = gueltigeAbschlaege(abschlagsZeilen).map((a) => ({
        schlussrechnung_id: rechnungId,
        abschlagsrechnung_id: a.id,
        nummer_kopie: a.rechnungsnummer || null,
        datum_kopie: a.rechnungsdatum || null,
        netto: Number(a.netto_summe) || 0,
        steuersatz: satzAusBetraegen(a.netto_summe, a.mwst_summe).satz,
        steuer: Number(a.mwst_summe) || 0,
      }));
      if (rows.length) {
        const { error: abErr } = await supabase.from("rechnung_abschlaege").insert(rows);
        if (abErr) {
          // Ohne Absetzung waere die Schlussrechnung zu hoch -> stornieren statt falsch stehen lassen
          console.error("Abschlaege absetzen fehlgeschlagen:", abErr.message);
          await supabase.from("rechnungen").update({
            zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
            notizen: "Automatisch storniert: Die Abschläge konnten nicht abgesetzt werden.",
            updated_at: new Date().toISOString(),
          }).eq("id", rechnungId);
          return NextResponse.json({ error: "Die Abschläge konnten nicht abgesetzt werden. Die Schlussrechnung wurde storniert." }, { status: 500 });
        }
      }
    }

    // Zahlungsstatus sofort richtig (decken die Abschlaege schon alles ab -> bezahlt, SQL p369)
    if (art === "schluss") {
      await supabase.rpc("rechnung_zahlbetrag_neu_berechnen", { p_rechnung_id: rechnungId });
    }

    // ---------- 6) Nahtstelle zurueckschreiben (nicht bei Abschlaegen) ----------
    if (art === "abschlag") {
      return NextResponse.json({ rechnungId, bereitsVorhanden: false, art });
    }
    const { error: updErr } = await schreiber
      .from("auftraege")
      .update({ rechnung_id: rechnungId })
      .eq("id", auftrag.id)
      .eq("owner_user_id", betrieb);

    if (updErr) {
      console.error("auftraege.rechnung_id konnte nicht gesetzt werden:", updErr.message);
      // Rechnung ist trotzdem erstellt — kein harter Abbruch
    }

    return NextResponse.json({ rechnungId, bereitsVorhanden: false, art });
  } catch (err: any) {
    console.error("Rechnung-aus-Auftrag Fehler:", err?.message || err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
