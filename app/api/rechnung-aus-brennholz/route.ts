// app/api/rechnung-aus-brennholz/route.ts
// ============================================================================
// ARGONAUT OS · Block 1 · F1-2
// Brücke holz_auftraege/holz_auftrag_positionen -> rechnungen/rechnung_positionen.
//
// Nach dem Muster von /api/rechnung-aus-werkstatt. Gleicher Doppel-Schutz,
// gleiche Tabellen, gleiche Fehlerbehandlung.
//
// ⚠️ EIN UNTERSCHIED, DER ZÄHLT: ZWEI STEUERSÄTZE
//   Die Werkstatt rechnet mit 19 % auf alles. Brennholz nicht:
//     Holz     7 %   (ermäßigt)
//     Anfahrt 19 %   (Dienstleistung)
//
//   `rechnung_positionen.mwst_satz` trägt beides je Zeile.
//   `rechnungen.mwst_summe` ist EIN Feld — es bekommt die Summe der Steuer,
//   gerechnet je Steuergruppe auf die Gruppensumme, nicht je Position.
//
//   ⚠️ Zu prüfen nach dem ersten Test: Zeigt das Rechnungsmodul den
//      Steuerausweis zweizeilig? Falls es netto × 19 % nachrechnet, stimmt
//      die Anzeige nicht — die gespeicherten Werte aber schon.
//      (Keine Steuerberatung. Aber 7 % und 19 % zu einem Satz zu vermischen
//      ist falsch, das lässt sich sagen.)
//
// ⚠️ PREISE SIND EINGEFROREN
//   Die Positionen tragen ihren Preis. Diese Route liest ihn ab, sie schlägt
//   ihn NICHT in der Preisliste nach. Ein Auftrag von gestern wird mit den
//   Preisen von gestern abgerechnet.
//
// UNTERSCHIED ZUR WERKSTATT: der Kunde ist echt.
//   Brennholzkunden stehen im CRM. kontakt_id bzw. firma_id werden gesetzt,
//   empfaenger_name dient als Fallback und Belegtext.
//
// Body:    { auftragId }
// Antwort: { rechnungId, bereitsVorhanden }
// ============================================================================

import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { summiere, cent, type Position } from "@/app/dashboard/_components/positionsLogik";
import { istBearbeitbar, statusInfo } from "@/app/dashboard/_components/auftragLogik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PosRow = {
  id: string;
  position_nr: number | null;
  art: string;
  bezeichnung: string;
  detail: string | null;
  menge: number;
  einheit: string;
  einzelpreis_netto: number;
  steuersatz_prozent: number;
  rabatt_prozent: number | null;
};

const ZAHLUNGSZIEL_TAGE = 14;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const auftragId = String(body?.auftragId || body?.auftrag_id || "").trim();
    if (!auftragId) {
      return NextResponse.json({ error: "Keine Auftrags-ID übergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    // ---- 1) Auftrag laden (RLS schützt auf owner) ----------------------
    const { data: auftrag, error: aErr } = await supabase
      .from("holz_auftraege")
      .select("id, nummer, status, kontakt_id, ziel_firma_id, empfaenger_name, rechnung_id, restfeuchte_prozent, notiz")
      .eq("id", auftragId)
      .single();

    if (aErr || !auftrag) {
      return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
    }

    // ---- 2) Doppel-Schutz: bereits fakturiert? -------------------------
    if (auftrag.rechnung_id) {
      const { data: vorhanden } = await supabase
        .from("rechnungen").select("id").eq("id", auftrag.rechnung_id).single();
      if (vorhanden?.id) {
        return NextResponse.json({ rechnungId: vorhanden.id, bereitsVorhanden: true });
      }
      // Verwaiste Verknüpfung (Rechnung gelöscht) -> unten sauber neu anlegen.
    }

    // ---- 3) Status prüfen -----------------------------------------------
    // Abgerechnet wird, was geliefert ist. Ein Entwurf ist kein Beleg.
    if (auftrag.status === "storniert") {
      return NextResponse.json({ error: "Ein stornierter Auftrag wird nicht abgerechnet." }, { status: 400 });
    }
    if (istBearbeitbar(auftrag.status)) {
      return NextResponse.json(
        {
          error:
            `Der Auftrag steht auf „${statusInfo(auftrag.status).label}". ` +
            "Erst liefern, dann abrechnen — sonst ändern sich die Positionen nach der Rechnung.",
          code: "nicht_geliefert",
        },
        { status: 409 },
      );
    }

    // ---- 4) Positionen laden --------------------------------------------
    const { data: posRaw, error: pErr } = await supabase
      .from("holz_auftrag_positionen").select("*")
      .eq("auftrag_id", auftragId)
      .order("position_nr", { ascending: true });

    if (pErr) return NextResponse.json({ error: "Positionen konnten nicht geladen werden." }, { status: 500 });

    const rows = (posRaw ?? []) as PosRow[];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Der Auftrag hat keine Positionen — keine Rechnung möglich." }, { status: 400 });
    }

    // ---- 5) Rechnen — mit derselben Rechenstelle wie überall ------------
    // Die Preise sind eingefroren. Sie werden gelesen, nicht nachgeschlagen.
    const positionen: Position[] = rows.map((p) => ({
      art: (p.art as Position["art"]) ?? "freitext",
      bezeichnung: p.bezeichnung,
      detail: p.detail,
      menge: Number(p.menge),
      einheit: p.einheit,
      einzelpreis_netto: Number(p.einzelpreis_netto),
      steuersatz_prozent: Number(p.steuersatz_prozent),
      rabatt_prozent: p.rabatt_prozent !== null ? Number(p.rabatt_prozent) : null,
      position_nr: p.position_nr,
    }));

    const summe = summiere(positionen);
    if (!summe.ok) {
      return NextResponse.json({ error: "Die Positionen sind unvollständig: " + summe.fehler.join(" ") }, { status: 400 });
    }

    // ---- 6) Rechnung anlegen (Nummer via Trigger) ------------------------
    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute);
    faellig.setDate(faellig.getDate() + ZAHLUNGSZIEL_TAGE);

    const titel = auftrag.nummer
      ? `Brennholzlieferung · ${auftrag.nummer}`
      : "Brennholzlieferung";

    const { data: neueRechnung, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: user.id,
        auftrag_id: null,                       // kein US-CORE-Auftrag
        kontakt_id: auftrag.kontakt_id,         // ⚠️ anders als Werkstatt: echter CRM-Kunde
        firma_id: auftrag.ziel_firma_id,
        titel,
        empfaenger_name: auftrag.empfaenger_name ?? null,
        zahlungsstatus: "offen",
        rechnungsdatum,
        leistungsdatum: rechnungsdatum,
        faelligkeitsdatum: faellig.toISOString().slice(0, 10),
        zahlungsziel_tage: ZAHLUNGSZIEL_TAGE,
        netto_summe: summe.netto,
        mwst_summe: summe.steuerBetrag,         // Summe je Steuergruppe, nicht je Position
        brutto_summe: summe.brutto,
        waehrung: "EUR",
      })
      .select("id")
      .single();

    if (rErr || !neueRechnung) {
      console.error("Rechnung anlegen fehlgeschlagen:", rErr?.message ?? rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }

    const rechnungId = neueRechnung.id as string;

    // ---- 7) Positionen schreiben -----------------------------------------
    // menge × einzelpreis = gesamt_netto muss gelten. Der Rabatt wird deshalb
    // in den Einzelpreis eingerechnet — sonst rechnet das Rechnungsmodul anders
    // als der Auftrag, und die Summen laufen auseinander.
    const posten = positionen.map((p, i) => {
      const rabatt = p.rabatt_prozent ?? 0;
      const wirkPreis = rabatt > 0
        ? Math.round((p.einzelpreis_netto * (1 - rabatt / 100)) * 1e4) / 1e4
        : p.einzelpreis_netto;

      const bez = rabatt > 0
        ? `${p.bezeichnung} (abzgl. ${rabatt} % Mengenrabatt)`
        : p.bezeichnung;

      return {
        owner_user_id: user.id,
        rechnung_id: rechnungId,
        position: p.position_nr ?? i + 1,
        bezeichnung: bez,
        menge: p.menge,
        einheit: p.einheit,
        einzelpreis: wirkPreis,
        mwst_satz: p.steuersatz_prozent,
        gesamt_netto: cent(p.menge * wirkPreis),
      };
    });

    const { error: insErr } = await supabase.from("rechnung_positionen").insert(posten);
    if (insErr) {
      console.error("Positionen kopieren fehlgeschlagen:", insErr.message);
      // Die Rechnung existiert bereits — kein harter Abbruch.
    }

    // ---- 8) Nahtstelle zurückschreiben ------------------------------------
    const { error: updErr } = await supabase
      .from("holz_auftraege")
      .update({ rechnung_id: rechnungId, status: "abgerechnet" })
      .eq("id", auftrag.id);

    if (updErr) console.error("holz_auftraege.rechnung_id nicht gesetzt:", updErr.message);

    return NextResponse.json({
      rechnungId,
      bereitsVorhanden: false,
      steuerGruppen: summe.gruppen,
      netto: summe.netto,
      brutto: summe.brutto,
      hinweis: summe.gruppen.length > 1
        ? "Die Rechnung enthält zwei Steuersätze. Bitte den Steuerausweis auf dem Beleg prüfen."
        : null,
    });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Brennholz Fehler:", err instanceof Error ? err.message : "unbekannt");
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
