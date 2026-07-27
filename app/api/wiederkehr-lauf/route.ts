import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { steuerGruppen, cent, type SteuerPosten } from "@/app/dashboard/_components/steuerLogik";
import { wartungPositionen, darfAbrechnen } from "@/lib/wiederkehr";

export const runtime = "nodejs";

// ============================================================
// ARGONAUT OS · Baustein 1 · Block C · Schritt C2 · Wiederkehr-Engine
// Ein Durchgang: alle FAELLIGEN Wartungen + Abos in echte Rechnungen wandeln.
//  - Wartung: Doppel-Abrechnungs-Schutz aus lib/wiederkehr (letzte_abrechnung_am).
//  - Abo:     naechste_faellig wird fortgeschrieben -> nicht erneut faellig.
//  => von sich aus idempotent. Jeder Lauf wird in wiederkehr_lauf protokolliert.
//  - body { vorschau:true } zaehlt nur (fuer die Nachfrage im Cockpit), erzeugt nichts.
// ============================================================

const MWST_STD = 19;

type Sb = Awaited<ReturnType<typeof createClient>>;
type Posten = { bezeichnung?: string; menge?: number; einheit?: string; einzelpreis?: number; mwst_satz?: number };
type Kopf = { titel: string; empfaenger_name?: string | null; kontakt_id?: string | null };
type AnlageErgebnis = { error?: string; rechnungId?: string; netto?: number };
type DetailEintrag = { quelle: "wartung" | "abo"; id: string; titel: string; rechnungId?: string; fehler?: string };

/** Naechstes Abo-Faelligkeitsdatum (monat/quartal/jahr). */
function naechstesAboDatum(iso: string, intervall: string): string {
  const d = new Date((iso || "").slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const add = intervall === "jahr" ? 12 : intervall === "quartal" ? 3 : 1;
  d.setMonth(d.getMonth() + add);
  return d.toISOString().slice(0, 10);
}

/** Legt eine Rechnung + Positionen sicher an (Storno bei Positionsfehler). */
async function rechnungAnlegen(supabase: Sb, userId: string, kopf: Kopf, posten: Posten[]): Promise<AnlageErgebnis> {
  const rechnungsPosten = posten.map((p, i) => {
    const menge = cent(Number(p.menge) || 1);
    const einzelpreis = cent(Number(p.einzelpreis) || 0);
    return {
      owner_user_id: userId,
      position: i + 1,
      bezeichnung: String(p.bezeichnung || "Leistung").slice(0, 300),
      menge,
      einheit: String(p.einheit || "Pauschal").slice(0, 20),
      einzelpreis,
      mwst_satz: Number(p.mwst_satz) || MWST_STD,
      gesamt_netto: cent(menge * einzelpreis),
    };
  });
  if (!rechnungsPosten.length) return { error: "Keine abrechenbaren Positionen." };

  const summe = steuerGruppen(rechnungsPosten.map<SteuerPosten>((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));

  const heute = new Date();
  const rechnungsdatum = heute.toISOString().slice(0, 10);
  const faellig = new Date(heute);
  faellig.setDate(faellig.getDate() + 14);

  const { data: neu, error: rErr } = await supabase
    .from("rechnungen")
    .insert({
      owner_user_id: userId,
      auftrag_id: null,
      kontakt_id: kopf.kontakt_id || null,
      firma_id: null,
      titel: kopf.titel,
      empfaenger_name: kopf.empfaenger_name || null,
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
  if (rErr || !neu) return { error: rErr?.message || "Rechnung konnte nicht erstellt werden." };

  const rechnungId = neu.id as string;
  const posMit = rechnungsPosten.map((p) => ({ ...p, rechnung_id: rechnungId }));
  const { error: pErr } = await supabase.from("rechnung_positionen").insert(posMit);
  if (pErr) {
    await supabase
      .from("rechnungen")
      .update({
        zahlungsstatus: "storniert",
        netto_summe: 0,
        mwst_summe: 0,
        brutto_summe: 0,
        notizen: "Automatisch storniert (Wiederkehr-Lauf): Positionen konnten nicht uebernommen werden.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", rechnungId);
    return { error: pErr.message };
  }
  return { rechnungId, netto: summe.netto };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const nurVorschau = body?.vorschau === true;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const heute = new Date().toISOString().slice(0, 10);

    // --- Faellige Wartungen (aktiv, nicht archiviert, Betrag > 0, Doppel-Schutz) ---
    const { data: wRows } = await supabase
      .from("wartungsvertraege")
      .select("*")
      .eq("archiviert", false)
      .eq("status", "aktiv")
      .lte("naechste_faelligkeit_am", heute);
    const faelligeWartung = ((wRows as Record<string, unknown>[]) ?? []).filter(
      (w) => (Number(w.betrag_netto) || 0) > 0 && darfAbrechnen(w, heute).darf
    );

    // --- Faellige Abos (aktiv, faellig, mind. eine Position mit Preis) ---
    const { data: aRows } = await supabase
      .from("abo_rechnungen")
      .select("*")
      .eq("aktiv", true)
      .lte("naechste_faellig", heute);
    const faelligeAbo = ((aRows as Record<string, unknown>[]) ?? []).filter((a) => {
      const pos = Array.isArray(a.positionen) ? (a.positionen as Posten[]) : [];
      return pos.some((p) => (Number(p?.einzelpreis) || 0) > 0);
    });

    // --- Vorschau: nur zaehlen, nichts erzeugen ---
    if (nurVorschau) {
      const summeW = faelligeWartung.reduce((s, w) => s + (Number(w.betrag_netto) || 0), 0);
      const summeA = faelligeAbo.reduce((s, a) => {
        const pos = Array.isArray(a.positionen) ? (a.positionen as Posten[]) : [];
        return s + pos.reduce((x, p) => x + (Number(p.menge) || 1) * (Number(p.einzelpreis) || 0), 0);
      }, 0);
      return NextResponse.json({
        vorschau: true,
        anzahl_wartung: faelligeWartung.length,
        anzahl_abo: faelligeAbo.length,
        summe_netto: summeW + summeA,
      });
    }

    const details: DetailEintrag[] = [];
    const rechnungIds: string[] = [];
    let anzahlWartung = 0, anzahlAbo = 0, anzahlFehler = 0, summeNetto = 0;

    // --- Wartungen abarbeiten ---
    for (const w of faelligeWartung) {
      const titel = String(w.titel || "Wartungsvertrag");
      const r = await rechnungAnlegen(
        supabase, user.id,
        { titel, empfaenger_name: (w.kunde_name as string) ?? null, kontakt_id: (w.kontakt_id as string) ?? null },
        wartungPositionen(w)
      );
      if (r.error || !r.rechnungId) {
        anzahlFehler++;
        details.push({ quelle: "wartung", id: String(w.id), titel, fehler: r.error || "Unbekannt" });
        continue;
      }
      await supabase.from("wartungsvertraege")
        .update({ letzte_abrechnung_am: heute, aktualisiert_am: new Date().toISOString() })
        .eq("id", w.id as string);
      anzahlWartung++; summeNetto += r.netto || 0; rechnungIds.push(r.rechnungId);
      details.push({ quelle: "wartung", id: String(w.id), titel, rechnungId: r.rechnungId });
    }

    // --- Abos abarbeiten ---
    for (const a of faelligeAbo) {
      const titel = String(a.titel || "Wiederkehrende Rechnung");
      const posRoh = Array.isArray(a.positionen) ? (a.positionen as Posten[]) : [];
      const pos = posRoh.filter((p) => (Number(p?.einzelpreis) || 0) > 0 || (Number(p?.menge) || 0) > 0);
      const r = await rechnungAnlegen(
        supabase, user.id,
        { titel, empfaenger_name: (a.empfaenger_name as string) ?? null, kontakt_id: (a.kontakt_id as string) ?? null },
        pos
      );
      if (r.error || !r.rechnungId) {
        anzahlFehler++;
        details.push({ quelle: "abo", id: String(a.id), titel, fehler: r.error || "Unbekannt" });
        continue;
      }
      const naechste = naechstesAboDatum(String(a.naechste_faellig), String(a.intervall || "monat"));
      await supabase.from("abo_rechnungen")
        .update({ naechste_faellig: naechste, zuletzt_erzeugt: heute, anzahl_erzeugt: (Number(a.anzahl_erzeugt) || 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", a.id as string);
      anzahlAbo++; summeNetto += r.netto || 0; rechnungIds.push(r.rechnungId);
      details.push({ quelle: "abo", id: String(a.id), titel, rechnungId: r.rechnungId });
    }

    // --- Lauf protokollieren (Audit) ---
    await supabase.from("wiederkehr_lauf").insert({
      owner_user_id: user.id,
      gestartet_von: user.id,
      anzahl_wartung: anzahlWartung,
      anzahl_abo: anzahlAbo,
      anzahl_fehler: anzahlFehler,
      summe_netto: summeNetto,
      rechnung_ids: rechnungIds,
      details,
    });

    return NextResponse.json({
      anzahl_wartung: anzahlWartung,
      anzahl_abo: anzahlAbo,
      anzahl_fehler: anzahlFehler,
      summe_netto: summeNetto,
      rechnung_ids: rechnungIds,
    });
  } catch (err: unknown) {
    console.error("Wiederkehr-Lauf Fehler:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Interner Fehler." }, { status: 500 });
  }
}
