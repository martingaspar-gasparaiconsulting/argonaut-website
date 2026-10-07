import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { abrechnungPruefen } from "@/lib/nurGeschaeftsleitung";
import { quellSchreiber } from "@/lib/abrechnungServer";
import { ladeBetriebProfil } from "@/lib/betriebProfil";
import { steuerfall, rechnungBauen, startStatus, empfaenger, lieferungLesen } from "@/lib/kfzRechnung";
import type { Verkauf, FahrzeugFuerVerkauf } from "@/lib/kfzVerkauf";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Paket 268 · K7 „Rechnung aus Fahrzeugverkauf"
// Brücke kfz_verkauf (+ kfz_bestand) -> rechnungen/rechnung_positionen.
//
// - Steuerfall und Posten kommen aus lib/kfzRechnung.ts (eine Quelle der
//   Wahrheit, node-getestet): § 25a ohne Steuerausweis, Regelsteuer mit 19 %,
//   EU-Unternehmer / Ausfuhr steuerfrei mit Pflichthinweis.
// - Inzahlungnahme mindert die Rechnung NICHT; sie und die Anzahlung stehen
//   als „vorab verrechnet" (vorab_bezahlt) und mindern den Zahlbetrag.
// - Differenzsteuer (§ 25a) nur intern (diff_bemessung/diff_steuer).
// - Doppel-Schutz: kfz_verkauf.rechnung_id (eindeutig). Gibt es schon eine
//   gültige Rechnung, kommt deren ID zurück. Wurde sie storniert, darf eine
//   neue entstehen.
// - Positionsfehler: Rechnung wird STORNIERT, nicht gelöscht (Nummernfolge).
// - Alles serverseitig gelesen (Preis, Einkaufspreis, Besteuerung) — der
//   Browser schickt nur die Verkaufs-ID und den Lieferort.
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const verkaufId = String(body?.verkaufId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(verkaufId)) {
      return NextResponse.json({ error: "Keine gültige Verkaufs-ID übergeben." }, { status: 400 });
    }
    const lieferung = lieferungLesen(body?.lieferung);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    // „Darf abrechnen": Chef oder Mitarbeiter mit Haken. Die Rechnung gehört immer dem Betrieb.
    const abr = await abrechnungPruefen(supabase, user.id);
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });
    const betrieb = abr.betrieb;
    const schreiber = quellSchreiber(supabase, abr);

    // ---------- 1) Verkauf + Fahrzeug laden (RLS: nur was die Person sehen darf) ----------
    const { data: vRoh, error: vErr } = await supabase.from("kfz_verkauf").select("*").eq("id", verkaufId).single();
    if (vErr || !vRoh) return NextResponse.json({ error: "Verkaufsvorgang nicht gefunden." }, { status: 404 });
    const v = vRoh as unknown as Verkauf & { id: string; owner_user_id: string; bestand_id: string; kontakt_id: string | null; rechnung_id: string | null };
    if (v.owner_user_id !== betrieb) return NextResponse.json({ error: "Dieser Verkauf gehört nicht zu Ihrem Betrieb." }, { status: 403 });

    // ---------- 2) Doppel-Schutz ----------
    if (v.rechnung_id) {
      const { data: vorhanden } = await supabase.from("rechnungen").select("id, zahlungsstatus").eq("id", v.rechnung_id).maybeSingle();
      if (vorhanden?.id && vorhanden.zahlungsstatus !== "storniert") {
        return NextResponse.json({ rechnungId: vorhanden.id, bereitsVorhanden: true });
      }
    }

    const { data: fRoh, error: fErr } = await supabase.from("kfz_bestand").select("*").eq("id", v.bestand_id).single();
    if (fErr || !fRoh) return NextResponse.json({ error: "Fahrzeug nicht gefunden." }, { status: 404 });
    const fz = fRoh as unknown as FahrzeugFuerVerkauf & { ek_netto: number | null };

    let inzText: string | null = null;
    if (v.inzahlung_ankauf_id) {
      const { data: a } = await supabase.from("kfz_ankauf").select("marke, modell, fin").eq("id", v.inzahlung_ankauf_id).maybeSingle();
      if (a) inzText = [[a.marke, a.modell].filter(Boolean).join(" "), a.fin ? `FIN ${a.fin}` : null].filter(Boolean).join(", ") || null;
    }

    // ---------- 3) Steuerfall + Posten ----------
    const profil = await ladeBetriebProfil(supabase, user.id);
    const eigeneUstId = typeof profil.firma_ust_id === "string" ? profil.firma_ust_id : null;
    const heute = new Date().toISOString().slice(0, 10);
    const fall = steuerfall(fz.besteuerung, lieferung, v, eigeneUstId, fz, heute);
    if (fall.fehler.length) return NextResponse.json({ error: fall.fehler.join(" "), fehler: fall.fehler }, { status: 400 });
    const ek = fz.ek_netto !== null && fz.ek_netto !== undefined ? Number(fz.ek_netto) : null;
    const r = rechnungBauen(v, fz, fall.sonderfall, ek, inzText);
    if (r.fehler.length) return NextResponse.json({ error: r.fehler.join(" "), fehler: r.fehler }, { status: 400 });

    // ---------- 4) Rechnung anlegen (Nummer via Auslöser) ----------
    const zahlungszielTage = 14;
    const faellig = new Date();
    faellig.setDate(faellig.getDate() + zahlungszielTage);
    const status = startStatus(r.brutto, r.vorab);
    const emp = empfaenger(v);
    const titel = `Fahrzeugverkauf ${v.nr ?? ""} · ${[fz.marke, fz.modell].filter(Boolean).join(" ")}`.replace(/\s+·\s*$/, "").trim().slice(0, 200);
    const standortId = standortAusCookieHeader(req.headers.get("cookie"));

    const { data: neu, error: rErr } = await supabase
      .from("rechnungen")
      .insert({
        owner_user_id: betrieb,
        standort_id: standortId,
        auftrag_id: null,
        kontakt_id: v.kontakt_id ?? null,
        firma_id: null,
        titel,
        empfaenger_name: emp.name,
        empfaenger_anschrift: emp.anschrift,
        ust_id_kunde: v.kaeufer_art === "unternehmer" && v.kaeufer_ustid ? v.kaeufer_ustid : null,
        steuer_sonderfall: fall.sonderfall,
        vorab_bezahlt: r.vorab > 0 ? r.vorab : null,
        bezahlter_betrag: r.vorab,
        bezahlt_am: status === "bezahlt" ? heute : null,
        diff_bemessung: r.diffBemessung,
        diff_steuer: r.diffSteuer,
        zahlungsstatus: status,
        rechnungsdatum: heute,
        leistungsdatum: v.uebergabe_am || v.vertrag_am || heute,
        faelligkeitsdatum: faellig.toISOString().slice(0, 10),
        zahlungsziel_tage: zahlungszielTage,
        netto_summe: r.netto,
        mwst_summe: r.steuer,
        brutto_summe: r.brutto,
        waehrung: "EUR",
        notizen: r.zahlungsText,
      })
      .select("id")
      .single();
    if (rErr || !neu) {
      console.error("Kfz-Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      const ohneSql = /steuer_sonderfall|vorab_bezahlt|empfaenger_anschrift|diff_/.test(String(rErr?.message || ""));
      return NextResponse.json({ error: ohneSql ? "Rechnung konnte nicht erstellt werden — ist SQL Paket 268 ausgeführt?" : "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neu.id;

    // ---------- 5) Positionen ----------
    const pos = r.posten.map((p, i) => ({ ...p, owner_user_id: betrieb, rechnung_id: rechnungId, position: i + 1 }));
    const { error: posErr } = await supabase.from("rechnung_positionen").insert(pos);
    if (posErr) {
      console.error("Kfz-Rechnung Positionen fehlgeschlagen:", posErr.message);
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0, bezahlter_betrag: 0, vorab_bezahlt: null,
        notizen: "Automatisch storniert: die Positionen aus dem Fahrzeugverkauf konnten nicht übernommen werden.",
        updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    // ---------- 6) Nahtstelle zurückschreiben ----------
    const { error: updErr } = await schreiber
      .from("kfz_verkauf")
      .update({ rechnung_id: rechnungId, lieferung, aktualisiert_am: new Date().toISOString() })
      .eq("id", v.id)
      .eq("owner_user_id", betrieb);
    if (updErr) console.error("kfz_verkauf.rechnung_id konnte nicht gesetzt werden:", updErr.message);

    return NextResponse.json({ rechnungId, bereitsVorhanden: false, hinweise: [...fall.hinweise, ...r.hinweise] });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Kfz-Verkauf Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
