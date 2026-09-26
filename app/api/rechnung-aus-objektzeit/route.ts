import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";
import { pruefeEmpfaenger, reservierteZeiten } from "@/lib/objektzeitRechnung";
import { rechnungsRechtFehlt } from "@/lib/nurGeschaeftsleitung";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Baustein 3 · Block K · Schritt K3
// "Rechnung aus Objektzeiten" — schließt die Lücke: die OFFENEN, als
// abrechenbar markierten objekt_zeiten eines Objekts werden zur Rechnung.
// 1:1 dasselbe sichere Muster wie rechnung-aus-projekt:
//  · Dauer = stunden + minuten/60, Satz je Zeile (Fallback: Objekt-Satz).
//  · MwSt je Steuersatz (steuerLogik), Nummer via DB-Trigger.
//  · Positions-Insert scheitert -> Rechnung STORNIEREN (keine Nummernlücke).
//  · Danach werden die Zeiten als abgerechnet markiert (+ rechnung_id).
//
// G11 (26.09.2026): Die Zeiten werden jetzt ZUERST reserviert
// (abgerechnet false -> true in einem Schritt). Nur was dabei umspringt,
// kommt auf die Rechnung — ein zweiter Klick findet nichts mehr. Scheitert
// danach etwas, werden genau diese Zeiten wieder freigegeben. Und ohne
// Empfänger (Kontakt oder Name) entsteht keine Rechnung mehr.
// ============================================================

const MWST_STD = 19;

type Zeit = {
  id: string; datum: string | null; dauer_minuten: number | null;
  stundensatz_netto: number | null; taetigkeit: string | null; mwst_satz: number | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const objektId = String(body?.objektId || "").trim();
    if (!objektId) return NextResponse.json({ error: "Kein Objekt übergeben." }, { status: 400 });
    const empf = pruefeEmpfaenger({ kontaktId: body?.kontaktId, empfaengerName: body?.empfaengerName });
    if (!empf.ok) return NextResponse.json({ error: empf.fehler }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    // B1b-2 (26.09.26): Rechnungen erstellt nur die Geschäftsleitung.
    const nurChef = await rechnungsRechtFehlt(supabase);
    if (nurChef) return NextResponse.json({ error: nurChef }, { status: 403 });

    // Objekt für Titel + Fallback-Stundensatz.
    const { data: obj } = await supabase.from("objekte").select("bezeichnung, stundensatz_netto").eq("id", objektId).maybeSingle();
    const fallbackSatz = Number(obj?.stundensatz_netto) || 0;

    // Offene, abrechenbare Objektzeiten (RLS: nur eigene).
    const { data: zRaw, error: zErr } = await supabase
      .from("objekt_zeiten")
      .select("id, datum, dauer_minuten, stundensatz_netto, taetigkeit, mwst_satz")
      .eq("objekt_id", objektId).eq("abrechenbar", true).eq("abgerechnet", false)
      .order("datum", { ascending: true });
    if (zErr) return NextResponse.json({ error: "Objektzeiten konnten nicht geladen werden." }, { status: 500 });

    const zeiten = (zRaw || []) as Zeit[];
    const kandidaten = zeiten.filter((z) => (Number(z.dauer_minuten) || 0) > 0);
    if (!kandidaten.length) return NextResponse.json({ error: "Keine offenen abrechenbaren Objektzeiten." }, { status: 400 });

    // Empfänger: gewählter Kontakt (Name aus dem Kontakt) oder eingetragener Name.
    let empfaengerName = empf.name;
    if (empf.kontaktId && !empfaengerName) {
      const { data: k } = await supabase.from("kontakte").select("*").eq("id", empf.kontaktId).maybeSingle();
      if (!k) return NextResponse.json({ error: "Der gewählte Kontakt wurde nicht gefunden." }, { status: 400 });
      const kr = k as Record<string, unknown>;
      const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      empfaengerName = t(kr.anzeigename) || [t(kr.vorname), t(kr.nachname)].filter(Boolean).join(" ") || t(kr.name) || t(kr.firmenname) || t(kr.firma) || null;
    }

    // Erst reservieren: nur Zeilen, die jetzt von false auf true springen.
    const { data: umgesprungen, error: resErr } = await supabase.from("objekt_zeiten")
      .update({ abgerechnet: true })
      .in("id", kandidaten.map((z) => z.id)).eq("abgerechnet", false)
      .select("id");
    if (resErr) return NextResponse.json({ error: "Objektzeiten konnten nicht reserviert werden." }, { status: 500 });
    const abrechenbar = reservierteZeiten(kandidaten, umgesprungen as { id: string }[] | null);
    if (!abrechenbar.length) return NextResponse.json({ error: "Diese Zeiten werden gerade schon abgerechnet — bitte die Seite neu laden." }, { status: 409 });
    const freigeben = async () => {
      await supabase.from("objekt_zeiten").update({ abgerechnet: false, rechnung_id: null }).in("id", abrechenbar.map((z) => z.id));
    };

    const rechnungsPosten = abrechenbar.map((z, i) => {
      const std = (Number(z.dauer_minuten) || 0) / 60;
      const menge = cent(std);
      const satzRoh = Number(z.stundensatz_netto);
      const satz = Number.isFinite(satzRoh) && satzRoh > 0 ? satzRoh : fallbackSatz;
      const einzelpreis = cent(satz);
      const datumTxt = z.datum ? new Date(z.datum).toLocaleDateString("de-DE") : "";
      return {
        owner_user_id: user.id, position: i + 1,
        bezeichnung: (datumTxt ? `${datumTxt} · ` : "") + (z.taetigkeit || "Objektzeit"),
        menge, einheit: "Std", einzelpreis,
        mwst_satz: Number(z.mwst_satz) || MWST_STD,
        gesamt_netto: cent(menge * einzelpreis),
      };
    });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    const heute = new Date();
    const rechnungsdatum = heute.toISOString().slice(0, 10);
    const faellig = new Date(heute); faellig.setDate(faellig.getDate() + 14);
    const standortId = standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neueRechnung, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: user.id, standort_id: standortId, auftrag_id: null, kontakt_id: empf.kontaktId, firma_id: null,
        titel: obj?.bezeichnung ? `Objekt: ${obj.bezeichnung}` : "Objektzeiten-Abrechnung",
        empfaenger_name: empfaengerName, zahlungsstatus: "offen",
        rechnungsdatum, leistungsdatum: rechnungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
        zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: "EUR",
      })
      .select("id").single();
    if (rErr || !neueRechnung) {
      console.error("Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      await freigeben();
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neueRechnung.id;

    const posMit = rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId }));
    const { error: insPosErr } = await supabase.from("rechnung_positionen").insert(posMit);
    if (insPosErr) {
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: Objektzeiten konnten nicht übernommen werden.",
        updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      await freigeben();
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    // Die Zeiten sind schon reserviert (abgerechnet = true) — jetzt nur noch
    // die Rechnung dazuschreiben. Scheitert das, bleiben sie trotzdem gesperrt.
    const { error: updErr } = await supabase.from("objekt_zeiten")
      .update({ rechnung_id: rechnungId })
      .in("id", abrechenbar.map((z) => z.id));
    if (updErr) console.error("objekt_zeiten Rechnungsnummer eintragen fehlgeschlagen:", updErr.message);

    return NextResponse.json({ rechnungId, anzahl: abrechenbar.length });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Objektzeit Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
