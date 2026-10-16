import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { abrechnungPruefen } from "@/lib/nurGeschaeftsleitung";
import { quellSchreiber } from "@/lib/abrechnungServer";
import { ladeBetriebProfil } from "@/lib/betriebProfil";
import { reservierteZeiten } from "@/lib/objektzeitRechnung";
import { kopfSummen } from "@/lib/rechnungKopf";
import { sammelPosten, kundeSchluessel, type Leistung } from "@/lib/mengenAbrechnung";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · MO4 Mengen-Abrechnung (Paket 396, 16.10.2026)
// „Sammelrechnung aus Mengen": die ausgewählten, noch offenen Leistungen
// EINES Kunden werden zu einer Rechnung. Muster wie rechnung-aus-objektzeit:
//  · Abrechnen nur mit Recht (Chef oder „darf abrechnen"), Rechnung gehört dem Betrieb
//  · ZUERST reservieren (abgerechnet false -> true), nur Umgesprungenes zählt
//  · gleiche Leistung/Preis/Zuschlag/Satz = eine Position (lib/mengenAbrechnung)
//  · Summen über kopfSummen, Kleinunternehmer aus dem Betriebsprofil
//  · Nummer per DB-Trigger; Positionsfehler -> Rechnung stornieren + freigeben
// ============================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ids = Array.isArray(body?.ids) ? [...new Set((body.ids as unknown[]).map(String).filter((x) => UUID.test(x)))] : [];
    if (!ids.length) return NextResponse.json({ error: "Keine Leistungen ausgewählt." }, { status: 400 });
    if (ids.length > 2000) return NextResponse.json({ error: "Zu viele Leistungen auf einmal (höchstens 2000)." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    const abr = await abrechnungPruefen(supabase, user.id);
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });
    const betrieb = abr.betrieb;
    const schreiber = quellSchreiber(supabase, abr);

    const prof = await ladeBetriebProfil(supabase, user.id);
    const kleinunternehmer = !!prof?.kleinunternehmer;

    // Kandidaten laden (über den Schreiber, damit „darf abrechnen" auch fremde Erfassungen sieht) — nur dieser Betrieb.
    const { data: kRaw, error: kErr } = await schreiber.from("mengen_leistung")
      .select("id, datum, kontakt_id, empfaenger_name, bezeichnung, menge, einheit, einzelpreis, zuschlag_prozent, mwst_satz, abgerechnet, rechnung_id")
      .in("id", ids).eq("owner_user_id", betrieb).eq("abgerechnet", false);
    if (kErr) return NextResponse.json({ error: "Leistungen konnten nicht geladen werden." }, { status: 500 });
    const kandidaten = (kRaw || []) as (Leistung & { id: string })[];
    if (!kandidaten.length) return NextResponse.json({ error: "Keine offenen Leistungen gefunden." }, { status: 400 });
    const kunden = new Set(kandidaten.map(kundeSchluessel));
    if (kunden.size !== 1) return NextResponse.json({ error: "Eine Sammelrechnung geht immer an einen Kunden — bitte nur Leistungen eines Kunden wählen." }, { status: 400 });

    const erste = kandidaten[0];
    let empfaengerName = (erste.empfaenger_name || "").trim() || null;
    if (erste.kontakt_id) {
      const { data: k } = await supabase.from("kontakte").select("*").eq("id", erste.kontakt_id).maybeSingle();
      if (k) {
        const kr = k as Record<string, unknown>;
        const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");
        empfaengerName = t(kr.anzeigename) || [t(kr.vorname), t(kr.nachname)].filter(Boolean).join(" ") || t(kr.name) || t(kr.firmenname) || t(kr.firma) || empfaengerName;
      }
    }

    // Reservieren: nur Zeilen, die jetzt von false auf true springen.
    const { data: umgesprungen, error: resErr } = await schreiber.from("mengen_leistung")
      .update({ abgerechnet: true })
      .in("id", kandidaten.map((z) => z.id)).eq("abgerechnet", false).eq("owner_user_id", betrieb)
      .select("id");
    if (resErr) return NextResponse.json({ error: "Leistungen konnten nicht reserviert werden." }, { status: 500 });
    const reserviert = reservierteZeiten(kandidaten, umgesprungen as { id: string }[] | null);
    if (!reserviert.length) return NextResponse.json({ error: "Diese Leistungen werden gerade schon abgerechnet — bitte die Seite neu laden." }, { status: 409 });
    const freigeben = async () => {
      await schreiber.from("mengen_leistung").update({ abgerechnet: false, rechnung_id: null }).in("id", reserviert.map((z) => z.id)).eq("owner_user_id", betrieb);
    };

    const posten = sammelPosten(reserviert, kleinunternehmer);
    const summe = kopfSummen(posten.map((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })), { kleinunternehmer });
    const daten = reserviert.map((r) => r.datum).sort();
    const von = daten[0], bis = daten[daten.length - 1];
    const de = (iso: string) => iso.split("-").reverse().join(".");

    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + 14);
    const standortId = standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neueRechnung, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: betrieb, standort_id: standortId, auftrag_id: null, kontakt_id: erste.kontakt_id || null, firma_id: null,
        titel: von === bis ? `Leistungen vom ${de(von)}` : `Leistungen ${de(von)} – ${de(bis)}`,
        empfaenger_name: empfaengerName, zahlungsstatus: "offen", kleinunternehmer,
        rechnungsdatum, leistungsdatum: bis, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
        zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.mwst, brutto_summe: summe.brutto, waehrung: "EUR",
      })
      .select("id").single();
    if (rErr || !neueRechnung) {
      console.error("Sammelrechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      await freigeben();
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neueRechnung.id;

    const posMit = posten.map((p, i) => ({
      owner_user_id: betrieb, rechnung_id: rechnungId, position: i + 1,
      bezeichnung: p.bezeichnung, menge: p.menge, einheit: p.einheit, einzelpreis: p.einzelpreis,
      mwst_satz: p.mwst_satz, gesamt_netto: p.gesamt_netto,
    }));
    const { error: insPosErr } = await supabase.from("rechnung_positionen").insert(posMit);
    if (insPosErr) {
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: Leistungen konnten nicht übernommen werden.",
        updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      await freigeben();
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    const { error: updErr } = await schreiber.from("mengen_leistung")
      .update({ rechnung_id: rechnungId })
      .in("id", reserviert.map((z) => z.id))
      .eq("owner_user_id", betrieb);
    if (updErr) console.error("mengen_leistung Rechnung eintragen fehlgeschlagen:", updErr.message);

    return NextResponse.json({ rechnungId, anzahl: reserviert.length, positionen: posten.length });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Mengen Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
