import { createClient } from "@/lib/supabase-server";
import { standortAusCookieHeader } from "@/lib/standortDaten";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";
import { abrechnungPruefen } from "@/lib/nurGeschaeftsleitung";
import { quellSchreiber } from "@/lib/abrechnungServer";
import { ladeBetriebProfil } from "@/lib/betriebProfil";
import { berlinTagVon, istUuid, tnPosten, tnRechnungMoeglich } from "@/lib/motorsport";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Paket 296 · T1 „Rechnung aus Motorsport-Anmeldung"
// Startplatz (Gruppe, Startnummer) und Leihfahrzeug als Positionen,
// netto aus der Anmeldung (bei der Anmeldung eingefroren), 19 % bzw.
// Kleinunternehmer 0 %. Empfänger ist der Teilnehmer (bei Minderjährigen
// die sorgeberechtigte Person). Leistungsdatum = Tag des Events.
//
// - Alles serverseitig gelesen (RLS gilt), nichts vom Browser übernommen.
// - Doppel-Schutz über ms_teilnehmer.rechnung_id; ist die Rechnung
//   storniert, darf eine neue entstehen.
// - Positionsfehler: Rechnung wird STORNIERT, nicht gelöscht (Nummernfolge).
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const teilnehmerId = String(body?.teilnehmerId || "").trim();
    if (!istUuid(teilnehmerId)) return NextResponse.json({ error: "Keine gültige Anmeldung übergeben." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    // „Darf abrechnen": Chef oder Mitarbeiter mit Haken. Die Rechnung gehört immer dem Betrieb.
    const abr = await abrechnungPruefen(supabase, user.id);
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });
    const betrieb = abr.betrieb;
    const schreiber = quellSchreiber(supabase, abr);

    // ---------- 1) Anmeldung, Event, Gruppe ----------
    const { data: tRoh, error: tErr } = await supabase.from("ms_teilnehmer").select("*").eq("id", teilnehmerId).maybeSingle();
    if (tErr || !tRoh) return NextResponse.json({ error: "Anmeldung nicht gefunden." }, { status: 404 });
    const t = tRoh as unknown as {
      id: string; owner_user_id: string; event_id: string; gruppe_id: string; status: string; name: string; kontakt_id: string | null;
      minderjaehrig: boolean; sorgeberechtigt_name: string | null; startnummer: number | null; miet_fahrzeug_id: string | null;
      startgeld_netto_cent: number; leih_netto_cent: number; rechnung_id: string | null;
    };
    if (t.owner_user_id !== betrieb) return NextResponse.json({ error: "Diese Anmeldung gehört nicht zu Ihrem Betrieb." }, { status: 403 });
    const moeglich = tnRechnungMoeglich(t);
    if (!moeglich.ok) return NextResponse.json({ error: moeglich.grund }, { status: 400 });

    // ---------- 2) Doppel-Schutz ----------
    if (t.rechnung_id) {
      const { data: vorhanden } = await supabase.from("rechnungen").select("id, zahlungsstatus").eq("id", t.rechnung_id).maybeSingle();
      if (vorhanden?.id && vorhanden.zahlungsstatus !== "storniert") {
        return NextResponse.json({ error: "Für diese Anmeldung gibt es bereits eine Rechnung.", rechnungId: vorhanden.id }, { status: 409 });
      }
    }

    const [ev, gr, fz, ko] = await Promise.all([
      supabase.from("ms_event").select("titel, beginn, strecke").eq("id", t.event_id).maybeSingle(),
      supabase.from("ms_gruppe").select("name").eq("id", t.gruppe_id).maybeSingle(),
      t.miet_fahrzeug_id ? supabase.from("miet_fahrzeug").select("bezeichnung").eq("id", t.miet_fahrzeug_id).maybeSingle() : Promise.resolve({ data: null }),
      t.kontakt_id ? supabase.from("kontakte").select("*").eq("id", t.kontakt_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!ev.data) return NextResponse.json({ error: "Event nicht gefunden." }, { status: 404 });
    const event = ev.data as { titel: string; beginn: string; strecke: string | null };

    // Kleinunternehmer-Regel gilt für den BETRIEB, nicht für die Person, die klickt.
    const prof = await ladeBetriebProfil(supabase, user.id);
    const klein = !!prof?.kleinunternehmer;
    const satz = klein ? 0 : 19;

    const leihName = (fz.data as { bezeichnung?: string } | null)?.bezeichnung ?? null;
    const rechnungsPosten = tnPosten(t, event, String((gr.data as { name?: string } | null)?.name || "—"), leihName).map((p, i) => ({
      owner_user_id: betrieb, position: i + 1, bezeichnung: p.bezeichnung, menge: p.menge, einheit: p.einheit,
      einzelpreis: cent(p.einzelpreis_cent / 100), mwst_satz: satz, gesamt_netto: cent(p.summe_cent / 100),
    }));
    if (rechnungsPosten.length === 0) return NextResponse.json({ error: "Kein abrechenbarer Betrag." }, { status: 400 });
    const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((x) => ({ netto: x.gesamt_netto, satz: x.mwst_satz })));

    // Empfänger: bei Minderjährigen die sorgeberechtigte Person
    const k = (ko.data ?? null) as Record<string, unknown> | null;
    const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const anschrift = k ? ([s(k.strasse), [s(k.plz), s(k.ort)].filter(Boolean).join(" ")].filter(Boolean).join("\n") || s(k.adresse) || null) : null;
    const empfaenger = t.minderjaehrig && t.sorgeberechtigt_name ? t.sorgeberechtigt_name : t.name;

    // ---------- 3) Rechnung anlegen (Nummer via Auslöser) ----------
    const heute = new Date();
    const rechnungsdatum = berlinTagVon(heute.toISOString());
    const leistungsdatum = berlinTagVon(event.beginn) || rechnungsdatum;
    const faellig = new Date(heute);
    faellig.setDate(faellig.getDate() + 14);
    const standortId = standortAusCookieHeader(req.headers.get("cookie"));
    const { data: neu, error: rErr } = await supabase.from("rechnungen").insert({
      owner_user_id: betrieb, standort_id: standortId, auftrag_id: null, kontakt_id: t.kontakt_id || null, firma_id: null,
      titel: `${event.titel} — ${t.name}`.slice(0, 300),
      empfaenger_name: empfaenger, empfaenger_anschrift: anschrift,
      zahlungsstatus: "offen", rechnungsdatum, leistungsdatum, faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      zahlungsziel_tage: 14, netto_summe: summe.netto, mwst_summe: summe.steuer, brutto_summe: summe.brutto, waehrung: "EUR",
      kleinunternehmer: klein,
      notizen: t.minderjaehrig ? `Teilnehmer: ${t.name} (minderjährig)` : null,
    }).select("id").single();
    if (rErr || !neu) {
      console.error("Motorsport-Rechnung anlegen fehlgeschlagen:", rErr?.message || rErr);
      return NextResponse.json({ error: "Rechnung konnte nicht erstellt werden." }, { status: 500 });
    }
    const rechnungId = neu.id;

    // ---------- 4) Positionen ----------
    const { error: posErr } = await supabase.from("rechnung_positionen").insert(rechnungsPosten.map((x) => ({ ...x, rechnung_id: rechnungId })));
    if (posErr) {
      await supabase.from("rechnungen").update({
        zahlungsstatus: "storniert", netto_summe: 0, mwst_summe: 0, brutto_summe: 0,
        notizen: "Automatisch storniert: Die Positionen aus der Motorsport-Anmeldung konnten nicht übernommen werden.", updated_at: new Date().toISOString(),
      }).eq("id", rechnungId);
      return NextResponse.json({ error: "Positionen konnten nicht übernommen werden. Die Rechnung wurde storniert." }, { status: 500 });
    }

    // ---------- 5) Anmeldung mit der Rechnung verknüpfen ----------
    const { error: updErr } = await schreiber.from("ms_teilnehmer").update({ rechnung_id: rechnungId }).eq("id", t.id).eq("owner_user_id", betrieb);
    if (updErr) console.error("ms_teilnehmer.rechnung_id konnte nicht gesetzt werden:", updErr.message);

    return NextResponse.json({ rechnungId });
  } catch (err: unknown) {
    console.error("Rechnung-aus-Trackday Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
