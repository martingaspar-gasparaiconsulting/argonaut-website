import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import {
  positionsBetrag, positionsMinuten, minutenZuStunden, istMengenLeistung,
  type PositionBasis,
} from "@/app/dashboard/_components/leistungLogik";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · KFZ Block 1.2 · "Rechnung aus Werkstatt-Auftrag"
// Brücke werkstatt_auftraege/werkstatt_positionen -> rechnungen/rechnung_positionen.
//
// - Summen werden mit derselben leistungLogik gerechnet wie im Frontend
//   (eine Quelle der Wahrheit, keine doppelte Rechenlogik).
// - Die Umsatzsteuer läuft über steuerLogik: je Steuersatz auf die
//   Gruppensumme, nie netto × 19 % am Kopf (§14 Abs. 4 Nr. 7 + 8 UStG).
// - kontakt_id bleibt null; kunde_name wandert in empfaenger_name (Freitext-Empfänger).
// - Doppel-Schutz: existiert bereits eine Rechnung zum Auftrag (rechnung_id gesetzt
//   und Rechnung existiert), wird deren ID zurückgegeben — keine zweite Rechnung.
//
// D1 — Vier Korrekturen:
//
//   (1) KEIN STILLER NULLPREIS.  `positionsBetrag()` gibt null zurück, wenn kein
//       Preis hinterlegt ist. Bisher wurde daraus 0,00 € und die Position ging
//       kostenlos an den Kunden. Jetzt bricht die Route ab und nennt die Zeilen.
//
//   (2) PAUSCHALEN.  Eine Position mit `festpreis_netto` wird zu "1 Psch × Betrag".
//       Vorher landete der Pauschalpreis nirgends und die Zeile las sich
//       "0,5 Std × 0,00 € = 130,00 €".
//
//   (3) DIE INVARIANTE HÄLT.  `menge × einzelpreis = gesamt_netto`, immer.
//       Bei Zeit-Positionen wird `gesamt_netto` aus der GERUNDETEN Stundenzahl
//       gerechnet, nicht aus der ungerundeten. Sonst zeigt die Rechnung
//       "0,33 Std × 95,00 € = 31,67 €" — und die Detailseite schreibt beim
//       nächsten Speichern stillschweigend 31,35 € in die Datenbank.
//       Der Preis auf der Rechnung darf sich nach dem Versand nicht ändern.
//
//   (4) EINHEITEN BLEIBEN.  `werkstatt_positionen.einheit` wird übernommen.
//       Aus "8 Srm Buche" wurde vorher "8 Stk".
// ============================================================

type WerkstattPositionRow = PositionBasis & {
  id: string;
  bezeichnung: string | null;
  extern_firma: string | null;
};

/** Standard-Steuersatz. §19-Kleinunternehmer wird auf der Rechnung umgeschaltet. */
const MWST_SATZ = 19;

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
            `Bitte zuerst im Auftrag ergänzen: ${ohnePreis.join(" · ")}`,
          ohnePreis,
        },
        { status: 400 }
      );
    }

    const rechnungsPosten = positionen.map((p, i) => {
      let menge: number;
      let einheit: string;
      let einzelpreis: number;

      if (p.festpreis_netto != null && p.festpreis_netto >= 0) {
        // Pauschale: eine Einheit, voller Betrag. Die Arbeitszeit der Position
        // bleibt im Auftrag stehen, sie gehört nicht auf die Rechnungszeile.
        menge = 1;
        einheit = "Psch";
        einzelpreis = cent(p.festpreis_netto);
      } else if (p.art === "material" || istMengenLeistung(p.erfassungsart)) {
        // Menge × Preis je Einheit. Etikett kommt aus der Position (ha, Srm, l, Stk …).
        menge = cent(p.menge ?? 1);
        einheit = (p.einheit || "").trim() || "Stk";
        einzelpreis = cent(p.einzelpreis_netto ?? 0);
      } else {
        // Zeit-Position: in Stunden umrechnen, Einzelpreis = Stundensatz.
        menge = cent(minutenZuStunden(positionsMinuten(p)));
        einheit = "Std";
        einzelpreis = cent(p.einzelpreis_netto ?? 0);
      }

      const bez =
        (p.bezeichnung || "(ohne Bezeichnung)") +
        (p.extern ? ` (extern${p.extern_firma ? " · " + p.extern_firma : ""})` : "");

      return {
        owner_user_id: user.id,
        position: i + 1,
        bezeichnung: bez,
        menge,
        einheit,
        einzelpreis,
        mwst_satz: MWST_SATZ,
        // Aus der gerundeten Menge gerechnet — damit die Zeile für den Kunden aufgeht.
        gesamt_netto: cent(menge * einzelpreis),
      };
    });

    // ---------- 4b) Summen: je Steuersatz auf die Gruppensumme ----------
    const summe = steuerGruppen(
      rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz }))
    );
    const nettoSumme = summe.netto;
    const mwstSumme = summe.steuer;
    const bruttoSumme = summe.brutto;

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
    // Schlägt das fehl, trüge die Rechnung eine Summe ohne Positionen — ein
    // Rechnungsbetrag ohne Grundlage. Sie wird deshalb sofort STORNIERT,
    // nicht gelöscht: die Rechnungsnummer ist vergeben, und eine Lücke in der
    // Nummernfolge ist gegenüber dem Finanzamt schwerer zu erklären als ein
    // dokumentierter Storno.
    const posMitRechnung = rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId }));
    const { error: insPosErr } = await supabase.from("rechnung_positionen").insert(posMitRechnung);
    if (insPosErr) {
      console.error("Positionen kopieren fehlgeschlagen:", insPosErr.message);
      await supabase
        .from("rechnungen")
        .update({
          zahlungsstatus: "storniert",
          netto_summe: 0,
          mwst_summe: 0,
          brutto_summe: 0,
          notizen: "Automatisch storniert: die Positionen aus dem Werkstatt-Auftrag konnten nicht übernommen werden.",
          // Achtung: `rechnungen` heißt die Spalte updated_at, nicht aktualisiert_am.
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
