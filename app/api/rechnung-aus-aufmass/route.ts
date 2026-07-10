import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import {
  positionsBetrag, positionsSteuersatz, aufmassSumme,
  type PositionBasis,
} from "@/app/dashboard/_components/aufmassLogik";
import { cent } from "@/app/dashboard/_components/steuerLogik";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Modul E · Block E.5 · "Rechnung aus Aufmaß"
// Brücke aufmasse/aufmass_positionen -> rechnungen/rechnung_positionen.
// Zwilling von /api/rechnung-aus-werkstatt — dieselben Regeln, andere Quelle.
//
//  - Summen über aufmassLogik/steuerLogik: je Steuersatz auf die Gruppensumme
//    (§14 Abs. 4 Nr. 7 + 8 UStG). Niemals netto × 19 % am Kopf.
//  - KEIN STILLER NULLPREIS: fehlt bei einer Position der Preis, bricht die
//    Route ab und nennt die Zeilen. Sie wird nicht als 0,00 € berechnet.
//  - INVARIANTE: menge × einzelpreis = gesamt_netto, ohne Ausnahme.
//    Eine Pauschale wird zu "1 Psch × Betrag", nicht zu "8 m² × 0,00 €".
//  - DOPPEL-SCHUTZ über aufmasse.rechnung_id.
//  - Das Aufmaß wird auf `abgerechnet` gesetzt und ist danach gesperrt (GoBD).
//  - kontakt_id bleibt null; kunde_name wandert in empfaenger_name.
// ============================================================

type AufmassPositionRow = PositionBasis & {
  id: string;
  position_nr: number | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const aufmassId: string = String(body?.aufmassId || body?.aufmass_id || "").trim();
    if (!aufmassId) {
      return NextResponse.json({ error: "Keine Aufmaß-ID übergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    // ---------- 1) Aufmaß laden (RLS schützt auf owner) ----------
    const { data: aufmass, error: aErr } = await supabase
      .from("aufmasse")
      .select("id, nummer, titel, kunde_name, projekt, ort, aufmass_datum, status, rechnung_id, notiz")
      .eq("id", aufmassId)
      .single();

    if (aErr || !aufmass) {
      return NextResponse.json({ error: "Aufmaß nicht gefunden." }, { status: 404 });
    }

    // ---------- 2) Doppel-Schutz ----------
    if (aufmass.rechnung_id) {
      const { data: vorhanden } = await supabase
        .from("rechnungen")
        .select("id")
        .eq("id", aufmass.rechnung_id)
        .single();
      if (vorhanden?.id) {
        return NextResponse.json({ rechnungId: vorhanden.id, bereitsVorhanden: true });
      }
      // Verknüpfung war verwaist -> unten sauber neu anlegen
    }

    // ---------- 3) Positionen laden ----------
    const { data: posRaw, error: pErr } = await supabase
      .from("aufmass_positionen")
      .select("*")
      .eq("aufmass_id", aufmassId)
      .order("erstellt_am", { ascending: true });

    if (pErr) {
      return NextResponse.json({ error: "Positionen konnten nicht geladen werden." }, { status: 500 });
    }
    const positionen = (posRaw || []) as AufmassPositionRow[];

    if (positionen.length === 0) {
      return NextResponse.json({ error: "Das Aufmaß hat keine Positionen — keine Rechnung möglich." }, { status: 400 });
    }

    // ---------- 4) Kein stiller Nullpreis ----------
    // Erst prüfen, dann bauen. Eine Position ohne Preis ist kein 0,00-€-Posten,
    // sondern ein Grund, die Rechnung NICHT zu erzeugen.
    const ohnePreis = positionen
      .filter((p) => positionsBetrag(p) == null)
      .map((p) => p.bezeichnung?.trim() || "(ohne Bezeichnung)");

    if (ohnePreis.length > 0) {
      return NextResponse.json(
        {
          error:
            `Für ${ohnePreis.length === 1 ? "eine Position" : `${ohnePreis.length} Positionen`} ist kein Preis hinterlegt. ` +
            `Bitte zuerst im Aufmaß ergänzen: ${ohnePreis.join(" · ")}`,
          ohnePreis,
        },
        { status: 400 }
      );
    }

    // ---------- 5) Positionen -> Rechnungsposten ----------
    const rechnungsPosten = positionen.map((p, i) => {
      const pauschal = p.festpreis_netto != null && p.festpreis_netto >= 0;

      // Pauschale: eine Einheit, voller Betrag. Sonst würde die Zeile lauten
      // "47,31 m² × 0,00 € = 800,00 €" und der Kunde könnte sie nicht nachrechnen.
      const menge = pauschal ? 1 : cent(p.menge ?? 0);
      const einheit = pauschal ? "Psch" : ((p.einheit || "").trim() || "Stk");
      const einzelpreis = pauschal ? cent(p.festpreis_netto as number) : cent(p.einzelpreis_netto ?? 0);

      // Der Rechenweg gehört auf die Rechnung — er belegt die Menge.
      const weg = (p.rechenweg || "").trim();
      const bez = (p.bezeichnung?.trim() || "(ohne Bezeichnung)") + (weg && !pauschal ? ` (${weg})` : "");

      return {
        owner_user_id: user.id,
        position: i + 1,
        bezeichnung: bez,
        menge,
        einheit,
        einzelpreis,
        mwst_satz: positionsSteuersatz(p),
        // Aus der gerundeten Menge gerechnet — damit die Zeile für den Kunden aufgeht.
        gesamt_netto: cent(menge * einzelpreis),
      };
    });

    // ---------- 6) Summen: je Steuersatz auf die Gruppensumme ----------
    // Bewusst über dieselbe Logik wie die Anzeige — eine Quelle der Wahrheit.
    const summe = aufmassSumme(
      rechnungsPosten.map((p) => ({
        menge: p.menge,
        einzelpreis_netto: p.einzelpreis,
        mwst_satz: p.mwst_satz,
      }))
    );

    // ---------- 7) Rechnung anlegen (Nummer via Trigger) ----------
    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const zahlungszielTage = 14;
    const faellig = new Date(heute);
    faellig.setDate(faellig.getDate() + zahlungszielTage);

    const empfaengerName = aufmass.kunde_name?.trim() || null;
    const titelTeile = [aufmass.titel || "Aufmaß", aufmass.projekt || null].filter(Boolean);
    const titel = titelTeile.join(" · ");

    const { data: neueRechnung, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: user.id,
        auftrag_id: null,
        kontakt_id: null,
        firma_id: null,
        titel,
        empfaenger_name: empfaengerName,
        zahlungsstatus: "offen",
        rechnungsdatum,
        leistungsdatum: aufmass.aufmass_datum || rechnungsdatum,
        faelligkeitsdatum: faellig.toISOString().slice(0, 10),
        zahlungsziel_tage: zahlungszielTage,
        netto_summe: summe.netto,
        mwst_summe: summe.steuer,
        brutto_summe: summe.brutto,
        waehrung: "EUR",
        notizen: aufmass.nummer ? `Aus Aufmaß ${aufmass.nummer}` : null,
      })
      .select("id")
      .single();

    if (rErr || !neueRechnung) {
      console.error("Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }

    const rechnungId = neueRechnung.id;

    // ---------- 8) Positionen schreiben ----------
    // Schlägt das fehl, trüge die Rechnung eine Summe ohne Positionen. Sie wird
    // deshalb STORNIERT, nicht gelöscht: die Nummer ist vergeben, und eine Lücke
    // in der Nummernfolge ist gegenüber dem Finanzamt schwerer zu erklären.
    const posMitRechnung = rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId }));
    const { error: insPosErr } = await supabase.from("rechnung_positionen").insert(posMitRechnung);
    if (insPosErr) {
      console.error("Positionen kopieren fehlgeschlagen:", insPosErr.message);
      await supabase
        .from("rechnungen")
        .update({
          zahlungsstatus: "storniert",
          netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
          notizen: "Automatisch storniert: die Positionen aus dem Aufmaß konnten nicht übernommen werden.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", rechnungId);
      return NextResponse.json(
        { error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." },
        { status: 500 }
      );
    }

    // ---------- 9) Aufmaß verknüpfen und sperren ----------
    // Erst jetzt. Scheitert es, ist die Rechnung trotzdem gültig — aber das
    // Aufmaß bliebe offen. Deshalb wird der Fehler protokolliert und gemeldet.
    const { error: updErr } = await supabase
      .from("aufmasse")
      .update({ rechnung_id: rechnungId, status: "abgerechnet" })
      .eq("id", aufmass.id);

    if (updErr) {
      console.error("aufmasse.rechnung_id konnte nicht gesetzt werden:", updErr.message);
      return NextResponse.json({
        rechnungId,
        bereitsVorhanden: false,
        warnung: "Die Rechnung wurde erstellt, das Aufmaß konnte aber nicht als abgerechnet markiert werden. Bitte den Status von Hand setzen.",
      });
    }

    return NextResponse.json({ rechnungId, bereitsVorhanden: false });
  } catch (err: any) {
    console.error("Rechnung-aus-Aufmaß Fehler:", err?.message || err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
