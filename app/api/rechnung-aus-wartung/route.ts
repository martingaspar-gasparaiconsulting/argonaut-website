import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";
import { wartungPositionen, darfAbrechnen } from "@/lib/wiederkehr";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Baustein 1 · Block A · Schritt A3
// "Rechnung aus Wartungsvertrag" — erzeugt aus einem Wartungsvertrag die
// naechste echte Rechnung und schreibt "zuletzt abgerechnet am" fort.
//
// Gleiches sicheres Muster wie rechnung-aus-abo:
//  - MwSt je Satz ueber steuerGruppen,
//  - Storno der Rechnung, falls die Positionen nicht uebernommen werden koennen.
// Positionen + Doppel-Abrechnungs-Schutz kommen rein rechnerisch aus
// lib/wiederkehr (0 EUR, getestet). Der Schutz laesst sich mit { erzwingen:true }
// bewusst ueberstimmen — die UI fragt dann vorher nach.
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const wartungId = String(body?.wartungId || "").trim();
    const erzwingen = body?.erzwingen === true;
    if (!wartungId) {
      return NextResponse.json({ error: "Kein Wartungsvertrag uebergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    // RLS entscheidet, ob der Nutzer diesen Vertrag sehen darf (Chef/Mitarbeiter).
    const { data: v, error: vErr } = await supabase
      .from("wartungsvertraege")
      .select("*")
      .eq("id", wartungId)
      .maybeSingle();
    if (vErr || !v) {
      return NextResponse.json({ error: "Wartungsvertrag nicht gefunden." }, { status: 404 });
    }

    const heute = new Date().toISOString().slice(0, 10);

    // Doppel-Abrechnungs-Schutz — kann per erzwingen ueberstimmt werden.
    const pruef = darfAbrechnen(v, heute);
    if (!pruef.darf && !erzwingen) {
      return NextResponse.json(
        { error: pruef.grund, sperre: true, sperrBis: pruef.sperrBis ?? null },
        { status: 409 }
      );
    }

    // Positionen rein rechnerisch aus dem Vertrag (aktuell eine Pauschal-Position).
    const positionen = wartungPositionen(v);
    if (!positionen.length) {
      return NextResponse.json(
        { error: "Der Wartungsvertrag hat keinen abrechenbaren Betrag." },
        { status: 400 }
      );
    }

    const rechnungsPosten = positionen.map((p, i) => {
      const menge = cent(Number(p.menge) || 1);
      const einzelpreis = cent(Number(p.einzelpreis) || 0);
      return {
        owner_user_id: user.id,
        position: i + 1,
        bezeichnung: String(p.bezeichnung || "Wartung").slice(0, 300),
        menge,
        einheit: String(p.einheit || "Pauschal").slice(0, 20),
        einzelpreis,
        mwst_satz: Number(p.mwst_satz) || 19,
        gesamt_netto: cent(menge * einzelpreis),
      };
    });
    const summe = steuerGruppen(
      rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz }))
    );

    const rechnungsdatum = heute;
    const faellig = new Date();
    faellig.setDate(faellig.getDate() + 14);

    const { data: neueRechnung, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: user.id,
        auftrag_id: null,
        kontakt_id: v.kontakt_id || null,
        firma_id: null,
        titel: v.titel || "Wartungsvertrag",
        empfaenger_name: v.kunde_name || null,
        zahlungsstatus: "offen",
        rechnungsdatum,
        leistungsdatum: rechnungsdatum,
        faelligkeitsdatum: faellig.toISOString().slice(0, 10),
        zahlungsziel_tage: 14,
        netto_summe: summe.netto,
        mwst_summe: summe.steuer,
        brutto_summe: summe.brutto,
        waehrung: "EUR",
      })
      .select("id")
      .single();
    if (rErr || !neueRechnung) {
      console.error("Wartungs-Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neueRechnung.id;

    const posMit = rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId }));
    const { error: insPosErr } = await supabase.from("rechnung_positionen").insert(posMit);
    if (insPosErr) {
      await supabase
        .from("rechnungen")
        .update({
          zahlungsstatus: "storniert",
          netto_summe: 0,
          mwst_summe: 0,
          brutto_summe: 0,
          notizen: "Automatisch storniert: Positionen konnten nicht uebernommen werden.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", rechnungId);
      return NextResponse.json(
        { error: "Positionen konnten nicht uebernommen werden. Die Rechnung wurde storniert." },
        { status: 500 }
      );
    }

    // Vertrag fortschreiben: "zuletzt abgerechnet am" = heute.
    const { error: updErr } = await supabase
      .from("wartungsvertraege")
      .update({ letzte_abrechnung_am: rechnungsdatum, aktualisiert_am: new Date().toISOString() })
      .eq("id", wartungId);
    if (updErr) console.error("Wartungsvertrag fortschreiben fehlgeschlagen:", updErr.message);

    return NextResponse.json({ rechnungId, letzte_abrechnung_am: rechnungsdatum });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Wartung Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
