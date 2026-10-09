import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";
import { abrechnungPruefen } from "@/lib/nurGeschaeftsleitung";
import { quellSchreiber } from "@/lib/abrechnungServer";
import { abrechnung, berlinTag, zeit, type MietBuchung } from "@/lib/fahrzeugMiete";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Paket 292 · V1 „Rechnung aus Fahrzeugvermietung"
// Brücke miet_buchung -> rechnungen/rechnung_positionen.
//
// - Nur zurückgegebene Mietverträge. Alles serverseitig gelesen: die bei der
//   Buchung eingefrorenen Preise, km und Tank aus Übergabe/Rückgabe,
//   Zusatzfahrer mit gültigem Prüfvermerk, Kulanz des Betriebs.
// - Posten aus lib/fahrzeugMiete.abrechnung (eine Quelle, node-getestet):
//   Miete, Zusatzfahrer, Mehrkilometer, Nachtanken. Kaution und Schäden
//   stehen NICHT auf der Rechnung.
// - Doppel-Schutz über miet_buchung.rechnung_id; ist die Rechnung storniert,
//   darf eine neue entstehen.
// - Positionsfehler: Rechnung wird STORNIERT, nicht gelöscht (Nummernfolge).
// ============================================================

const MWST_STD = 19;

function wannText(iso: string | null): string {
  const t = zeit(iso);
  return t === null ? "" : new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const buchungId = String(body?.buchungId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(buchungId)) {
      return NextResponse.json({ error: "Keine gültige Buchung übergeben." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    // „Darf abrechnen": Chef oder Mitarbeiter mit Haken. Die Rechnung gehört immer dem Betrieb.
    const abr = await abrechnungPruefen(supabase, user.id);
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });
    const betrieb = abr.betrieb;
    const schreiber = quellSchreiber(supabase, abr);

    // ---------- 1) Mietvertrag laden (RLS: nur was die Person sehen darf) ----------
    const { data: bRoh, error: bErr } = await supabase.from("miet_buchung").select("*").eq("id", buchungId).maybeSingle();
    if (bErr || !bRoh) return NextResponse.json({ error: "Mietvertrag nicht gefunden." }, { status: 404 });
    const b = bRoh as unknown as MietBuchung & {
      id: string; owner_user_id: string; nummer: string | null; status: string; fahrzeug_id: string; kontakt_id: string | null;
      mieter_name: string; mieter_anschrift: string | null; rechnung_id: string | null; uebergabe_am: string | null;
    };
    if (b.owner_user_id !== betrieb) return NextResponse.json({ error: "Dieser Mietvertrag gehört nicht zu Ihrem Betrieb." }, { status: 403 });
    if (b.status !== "zurueck") return NextResponse.json({ error: "Abgerechnet wird nach der Rückgabe des Fahrzeugs." }, { status: 400 });

    // ---------- 2) Doppel-Schutz ----------
    if (b.rechnung_id) {
      const { data: vorhanden } = await supabase.from("rechnungen").select("id, zahlungsstatus").eq("id", b.rechnung_id).maybeSingle();
      if (vorhanden?.id && vorhanden.zahlungsstatus !== "storniert") {
        return NextResponse.json({ error: "Für diesen Mietvertrag gibt es bereits eine Rechnung.", rechnungId: vorhanden.id }, { status: 409 });
      }
    }

    // ---------- 3) Fahrzeug, Zusatzfahrer, Kulanz ----------
    const [fz, zf, ei] = await Promise.all([
      supabase.from("miet_fahrzeug").select("bezeichnung, kennzeichen").eq("id", b.fahrzeug_id).maybeSingle(),
      supabase.from("miet_fahrer").select("id").eq("buchung_id", b.id).eq("rolle", "zusatz").eq("ergebnis", "ok"),
      supabase.from("miet_einstellung").select("kulanz_minuten").eq("owner_user_id", betrieb).maybeSingle(),
    ]);
    const fzText = [fz.data?.bezeichnung, fz.data?.kennzeichen].filter(Boolean).join(" · ") || "Fahrzeug";
    const zahl = (x: unknown) => (x === null || x === undefined ? null : Number(x));
    const r = abrechnung({
      abholung: b.abholung, rueckgabe_plan: b.rueckgabe_plan, rueckgabe_ist: b.rueckgabe_ist,
      tagessatz_cent: Number(b.tagessatz_cent) || 0, wochensatz_cent: zahl(b.wochensatz_cent), frei_km_tag: zahl(b.frei_km_tag),
      mehr_km_cent: Number(b.mehr_km_cent) || 0, zusatzfahrer_tag_cent: Number(b.zusatzfahrer_tag_cent) || 0, tank_achtel_cent: Number(b.tank_achtel_cent) || 0,
      km_start: zahl(b.km_start), km_ende: zahl(b.km_ende), tank_start: zahl(b.tank_start), tank_ende: zahl(b.tank_ende),
    }, (zf.data ?? []).length, Number(ei.data?.kulanz_minuten) || 0, fzText);
    if (!r.posten.length) return NextResponse.json({ error: "Kein abrechenbarer Betrag (Tagessatz ist 0)." }, { status: 400 });

    const rechnungsPosten = r.posten.map((p, i) => {
      const menge = cent(p.menge);
      const einzelpreis = cent(p.einzelpreis_cent / 100);
      return {
        owner_user_id: betrieb, position: i + 1,
        bezeichnung: p.bezeichnung.slice(0, 300),
        menge, einheit: p.einheit, einzelpreis,
        mwst_satz: MWST_STD, gesamt_netto: cent(p.summe_cent / 100),
      };
    });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

    // ---------- 4) Rechnung anlegen (Nummer via Auslöser) ----------
    const heute = berlinTag(Date.now());
    const faellig = new Date();
    faellig.setDate(faellig.getDate() + 14);
    const ruecktag = zeit(b.rueckgabe_ist);
    const leistung = ruecktag === null ? heute : berlinTag(ruecktag);
    const kmText = r.gefahren === null ? "" : `, ${r.gefahren.toLocaleString("de-DE")} km gefahren`;
    const standortId = standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neu, error: rErr } = await supabase.from("rechnungen").insert({
      owner_user_id: betrieb, standort_id: standortId, auftrag_id: null, kontakt_id: b.kontakt_id || null, firma_id: null,
      titel: `Fahrzeugmiete ${b.nummer ?? ""} · ${fzText}`.replace(/\s+/g, " ").slice(0, 200),
      empfaenger_name: b.mieter_name || null, empfaenger_anschrift: b.mieter_anschrift || null,
      zahlungsstatus: "offen", rechnungsdatum: heute, leistungsdatum: leistung, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: "EUR",
      notizen: `Mietvertrag ${b.nummer ?? ""}: Mietzeitraum ${wannText(b.uebergabe_am ?? b.abholung)} bis ${wannText(b.rueckgabe_ist)} (${r.tage} Miettag${r.tage === 1 ? "" : "e"}${kmText}). Die Kaution wird gesondert abgerechnet.`.slice(0, 1000),
    }).select("id").single();
    if (rErr || !neu) {
      console.error("Vermietung-Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neu.id;

    // ---------- 5) Positionen ----------
    const { error: posErr } = await supabase.from("rechnung_positionen").insert(rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId })));
    if (posErr) {
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: Positionen aus dem Mietvertrag konnten nicht übernommen werden.", updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    // ---------- 6) Mietvertrag mit der Rechnung verknüpfen ----------
    const { error: updErr } = await schreiber.from("miet_buchung").update({ rechnung_id: rechnungId }).eq("id", b.id).eq("owner_user_id", betrieb);
    if (updErr) console.error("miet_buchung.rechnung_id konnte nicht gesetzt werden:", updErr.message);

    return NextResponse.json({ rechnungId });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Vermietung Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
