import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";
import { abrechnungPruefen } from "@/lib/nurGeschaeftsleitung";
import { quellSchreiber } from "@/lib/abrechnungServer";
import { berlinTag } from "@/lib/fahrzeugMiete";
import { gebuehrPosten, wannText } from "@/lib/fahrzeugMieteV2";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Paket 293 · V2a „Rechnung aus Bußgeld-Vorgang"
// Bearbeitungsgebühr für eine Halteranfrage / einen Anhörungsbogen an den
// Mieter zum Tatzeitpunkt — als EIGENE Rechnung mit einem Posten.
//
// - Alles serverseitig gelesen: Gebühr und Steuersatz wurden beim Anlegen des
//   Vorgangs aus den Einstellungen des Betriebs eingefroren, den Mieter hat
//   die Datenbank aus Übergabe und Rückgabe bestimmt (miet_vorgang.buchung_id).
// - Das Bußgeld selbst steht NIE auf der Rechnung — das zahlt der Fahrer an
//   die Behörde.
// - Doppel-Schutz über miet_vorgang.gebuehr_rechnung_id; ist die Rechnung
//   storniert, darf eine neue entstehen.
// - Positionsfehler: Rechnung wird STORNIERT, nicht gelöscht (Nummernfolge).
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const vorgangId = String(body?.vorgangId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(vorgangId)) {
      return NextResponse.json({ error: "Kein gültiger Vorgang übergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    // „Darf abrechnen": Chef oder Mitarbeiter mit Haken. Die Rechnung gehört immer dem Betrieb.
    const abr = await abrechnungPruefen(supabase, user.id);
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });
    const betrieb = abr.betrieb;
    const schreiber = quellSchreiber(supabase, abr);

    // ---------- 1) Vorgang laden (RLS: nur was die Person sehen darf) ----------
    const { data: vRoh, error: vErr } = await supabase.from("miet_vorgang").select("*").eq("id", vorgangId).maybeSingle();
    if (vErr || !vRoh) return NextResponse.json({ error: "Vorgang nicht gefunden." }, { status: 404 });
    const v = vRoh as unknown as {
      id: string; owner_user_id: string; fahrzeug_id: string; buchung_id: string | null; zuordnung: string; art: string;
      behoerde: string; aktenzeichen: string; tatzeit: string; gebuehr_cent: number; gebuehr_ust_satz: number; gebuehr_rechnung_id: string | null;
    };
    if (v.owner_user_id !== betrieb) return NextResponse.json({ error: "Dieser Vorgang gehört nicht zu Ihrem Betrieb." }, { status: 403 });
    if (v.zuordnung !== "mieter" || !v.buchung_id) {
      return NextResponse.json({ error: "Zum Tatzeitpunkt war das Fahrzeug nicht eindeutig vermietet — es gibt keinen Mieter, dem die Gebühr berechnet werden kann." }, { status: 400 });
    }
    if (!(Number(v.gebuehr_cent) > 0)) return NextResponse.json({ error: "Für diesen Vorgang ist keine Bearbeitungsgebühr hinterlegt." }, { status: 400 });

    // ---------- 2) Doppel-Schutz ----------
    if (v.gebuehr_rechnung_id) {
      const { data: vorhanden } = await supabase.from("rechnungen").select("id, zahlungsstatus").eq("id", v.gebuehr_rechnung_id).maybeSingle();
      if (vorhanden?.id && vorhanden.zahlungsstatus !== "storniert") {
        return NextResponse.json({ error: "Für diesen Vorgang gibt es bereits eine Gebühren-Rechnung.", rechnungId: vorhanden.id }, { status: 409 });
      }
    }

    // ---------- 3) Mieter und Fahrzeug ----------
    const [bu, fz] = await Promise.all([
      supabase.from("miet_buchung").select("id, nummer, kontakt_id, mieter_name, mieter_anschrift").eq("id", v.buchung_id).maybeSingle(),
      supabase.from("miet_fahrzeug").select("bezeichnung, kennzeichen").eq("id", v.fahrzeug_id).maybeSingle(),
    ]);
    if (!bu.data) return NextResponse.json({ error: "Mietvertrag zum Vorgang nicht gefunden." }, { status: 404 });
    const b = bu.data as { id: string; nummer: string | null; kontakt_id: string | null; mieter_name: string; mieter_anschrift: string | null };
    const kennzeichen = (fz.data?.kennzeichen as string | null | undefined) ?? null;

    const p = gebuehrPosten(v, kennzeichen, wannText(v.tatzeit));
    if (!p) return NextResponse.json({ error: "Für diesen Vorgang ist keine Bearbeitungsgebühr hinterlegt." }, { status: 400 });
    const rechnungsPosten = [{
      owner_user_id: betrieb, position: 1, bezeichnung: p.bezeichnung, menge: 1, einheit: p.einheit,
      einzelpreis: cent(p.einzelpreis_cent / 100), mwst_satz: p.mwst_satz, gesamt_netto: cent(p.summe_cent / 100),
    }];
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((x) => ({ netto: x.gesamt_netto, satz: x.mwst_satz })));

    // ---------- 4) Rechnung anlegen (Nummer via Auslöser) ----------
    const heute = berlinTag(Date.now());
    const faellig = new Date();
    faellig.setDate(faellig.getDate() + 14);
    const standortId = standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neu, error: rErr } = await supabase.from("rechnungen").insert({
      owner_user_id: betrieb, standort_id: standortId, auftrag_id: null, kontakt_id: b.kontakt_id || null, firma_id: null,
      titel: `Bearbeitungsgebühr Az. ${v.aktenzeichen} · Mietvertrag ${b.nummer ?? ""}`.replace(/\s+/g, " ").slice(0, 200),
      empfaenger_name: b.mieter_name || null, empfaenger_anschrift: b.mieter_anschrift || null,
      zahlungsstatus: "offen", rechnungsdatum: heute, leistungsdatum: heute, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: "EUR",
      notizen: `Bearbeitung der Anfrage von ${v.behoerde} (Az. ${v.aktenzeichen}) zum Mietvertrag ${b.nummer ?? ""}. Das Verwarn- oder Bußgeld selbst ist nicht Teil dieser Rechnung.`.slice(0, 1000),
    }).select("id").single();
    if (rErr || !neu) {
      console.error("Gebühren-Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neu.id;

    // ---------- 5) Position ----------
    const { error: posErr } = await supabase.from("rechnung_positionen").insert(rechnungsPosten.map((x) => ({ ...x, rechnung_id: rechnungId })));
    if (posErr) {
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: Die Position aus dem Vorgang konnte nicht übernommen werden.", updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Position konnte nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    // ---------- 6) Vorgang mit der Rechnung verknüpfen ----------
    const { error: updErr } = await schreiber.from("miet_vorgang").update({ gebuehr_rechnung_id: rechnungId }).eq("id", v.id).eq("owner_user_id", betrieb);
    if (updErr) console.error("miet_vorgang.gebuehr_rechnung_id konnte nicht gesetzt werden:", updErr.message);

    return NextResponse.json({ rechnungId });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Bussgeld Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
