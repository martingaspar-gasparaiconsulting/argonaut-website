"use client";

import { centRunden } from "@/lib/zahlen";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import AuftraegeAuge from "./AuftraegeAuge";
import { leseStandortCookie } from "@/lib/aktiverStandort";
import { konkreterStandort, standortOrFilter } from "@/lib/standortDaten";
import { NurVoll } from "../_components/Ansicht";
import Leerzustand from "../_components/Leerzustand";
import AuftragAnsicht from "./AuftragAnsicht";
import { useAuftragVorlage } from "./useAuftragVorlage";
import { auftragAmpel, suchePasst, zaehlen, nichtAbgerechnet, type AmpelKey } from "@/lib/auftragVorlage";
import { steuersatz } from "@/lib/steuersatz";

// ============================================================
// ARGONAUT OS · Modul 5 (Vertrag/Auftrag) · Cockpit A2 + A5 + A6
// Auftrags-Cockpit MIT "Aus Verkaufschance" (frische Phase, Doppel-Schutz)
// Route: /dashboard/auftraege
// Paket 311 (BV2 Aufträge): Wörter, Status-Namen, Spalten, Termin-Ampel und
// gespeicherte Suchen nach Branchen-Vorlage (lib/branchenVorlage.ts,
// Modul „auftraege"); die Geschäftsleitung passt die Ansicht an.
// ============================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const C = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  green: "#4CAF7D",
  danger: "#E06666",
  warn: "#E0A24C",
  lila: "#A98CE0",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

type StatusKey =
  | "entwurf"
  | "beauftragt"
  | "in_bearbeitung"
  | "abgeschlossen"
  | "storniert";

const STATUS: Record<StatusKey, { label: string; farbe: string; icon: string }> =
  {
    entwurf: { label: "Entwurf", farbe: C.gold, icon: "📝" },
    beauftragt: { label: "Beauftragt", farbe: C.cyan, icon: "📩" },
    in_bearbeitung: { label: "In Bearbeitung", farbe: C.green, icon: "🔧" },
    abgeschlossen: { label: "Abgeschlossen", farbe: C.green, icon: "✅" },
    storniert: { label: "Storniert", farbe: C.textDim, icon: "⚪" },
  };

const STATUS_REIHENFOLGE: StatusKey[] = [
  "entwurf",
  "beauftragt",
  "in_bearbeitung",
  "abgeschlossen",
  "storniert",
];

const PHASE: Record<string, { label: string; farbe: string }> = {
  lead: { label: "Lead", farbe: C.textDim },
  erstkontakt: { label: "Erstkontakt", farbe: C.textDim },
  qualifiziert: { label: "Qualifiziert", farbe: C.cyan },
  angebot: { label: "Angebot", farbe: C.warn },
  verhandlung: { label: "Verhandlung", farbe: C.lila },
  gewonnen: { label: "Gewonnen", farbe: C.green },
  verloren: { label: "Verloren", farbe: C.danger },
};
const PHASE_RANG: Record<string, number> = {
  gewonnen: 0,
  verhandlung: 1,
  angebot: 2,
  qualifiziert: 3,
  erstkontakt: 4,
  lead: 5,
  verloren: 9,
};

type Auftrag = {
  id: string;
  auftragsnummer: string | null;
  titel: string;
  status: string;
  auftragsdatum: string | null;
  netto_summe: number | null;
  brutto_summe: number | null;
  waehrung: string | null;
  created_at: string;
  lieferdatum: string | null;
  kontakt_id: string | null;
  firma_id: string | null;
  rechnung_id: string | null;
};

const AMPEL_FARBE: Record<AmpelKey, string> = { rot: C.danger, gelb: C.warn, gruen: C.green, neutral: C.textDim };

function kontaktName(k: any): string {
  return k?.anzeigename || [k?.vorname, k?.nachname].filter(Boolean).join(" ").trim() || k?.name || k?.email || "";
}
function firmaName(f: any): string {
  return f?.name || f?.firmenname || f?.firma || "";
}
/** Namen nur für die Kunden der geladenen Aufträge holen — in Paketen, damit die Adresse kurz bleibt. */
async function ladeNamen(tabelle: "kontakte" | "firmen", ids: string[], name: (r: any) => string): Promise<Record<string, string>> {
  const aus: Record<string, string> = {};
  const eindeutig = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < eindeutig.length; i += 80) {
    const { data } = await supabase.from(tabelle).select("*").in("id", eindeutig.slice(i, i + 80));
    for (const r of (data as any[]) || []) aus[r.id] = name(r);
  }
  return aus;
}
function datumKurz(d: string | null | undefined): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return "—";
  return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
}

type Chance = {
  id: string;
  titel: string;
  wert: number | null;
  waehrung: string | null;
  kontakt_id: string | null;
  firma_id: string | null;
  phase: string;
};

function geld(n: number | null | undefined, waehrung = "EUR"): string {
  const wert = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: waehrung || "EUR",
  }).format(wert);
}
function r2(n: number): number {
  return centRunden(n); // Paket 191: fehlerfreie Cent-Rundung
}

export default function AuftraegeCockpit() {
  const router = useRouter();

  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alle" | StatusKey>("alle");
  // Paket 311: Branchen-Vorlage, gespeicherte Suche, Kundennamen, Ansicht-Panel
  const { vorlage, einstellung, setEinstellung, betrieb, istChef, fein, statusLabel, sichtbar, spaltenLabel } = useAuftragVorlage(supabase);
  const [schnell, setSchnell] = useState<string | null>(null);
  const [namen, setNamen] = useState<Record<string, string>>({});
  const [zeigeAnsicht, setZeigeAnsicht] = useState(false);
  const heuteTag = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const warnTage = vorlage.warnTage ?? 7;
  const terminWort = vorlage.terminWort ?? "Lieferdatum";

  const [modalOffen, setModalOffen] = useState(false);
  const [neuTitel, setNeuTitel] = useState("");
  const [neuStatus, setNeuStatus] = useState<StatusKey>("entwurf");
  const [neuDatum, setNeuDatum] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [speichern, setSpeichern] = useState(false);

  const [chanceModalOffen, setChanceModalOffen] = useState(false);
  const [chancen, setChancen] = useState<Chance[]>([]);
  const [chancenLoading, setChancenLoading] = useState(false);
  const [erstelltVon, setErstelltVon] = useState<string | null>(null);

  async function laden() {
    setLoading(true);
    setFehler(null);
    // Filial-Zuschnitt (fail-open): aktiver Standort zeigt seine + Standort-lose Aufträge.
    const sid = konkreterStandort(leseStandortCookie());
    let q = supabase
      .from("auftraege")
      .select(
        "id, auftragsnummer, titel, status, auftragsdatum, netto_summe, brutto_summe, waehrung, created_at, lieferdatum, kontakt_id, firma_id, rechnung_id"
      );
    if (sid) q = q.or(standortOrFilter(sid));
    const { data, error } = await q.order("created_at", { ascending: false });

    if (error) {
      setFehler(error.message);
      setAuftraege([]);
    } else {
      const liste = ((data as any) || []) as Auftrag[];
      setAuftraege(liste);
      // Kundennamen nachladen (fail-open: ohne Namen bleibt die Spalte leer)
      try {
        const [k, f] = await Promise.all([
          ladeNamen("kontakte", liste.map((a) => a.kontakt_id || ""), kontaktName),
          ladeNamen("firmen", liste.map((a) => a.firma_id || ""), firmaName),
        ]);
        setNamen({ ...k, ...f });
      } catch { /* ohne Namen */ }
    }
    setLoading(false);
  }

  useEffect(() => {
    laden();
  }, []);

  const kundeVon = (a: Auftrag): string => (a.firma_id && namen[a.firma_id]) || (a.kontakt_id && namen[a.kontakt_id]) || "";

  const kpi = useMemo(() => {
    let summeNetto = 0;
    for (const a of auftraege) if (a.status !== "storniert") summeNetto += Number(a.netto_summe) || 0;
    return { ...zaehlen(auftraege, heuteTag, warnTage), summeNetto: r2(summeNetto) };
  }, [auftraege, heuteTag, warnTage]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const regel = schnell ? vorlage.suchen.find((x) => x.key === schnell)?.regel ?? null : null;
    return auftraege.filter((a) => {
      if (statusFilter !== "alle" && a.status !== statusFilter) return false;
      if (regel && !suchePasst(regel, a, auftragAmpel(a, heuteTag, warnTage), heuteTag)) return false;
      if (!q) return true;
      const heu = `${a.titel} ${a.auftragsnummer || ""} ${kundeVon(a)}`.toLowerCase();
      return heu.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auftraege, suche, statusFilter, schnell, vorlage, heuteTag, warnTage, namen]);

  // Spalten der Liste: Titel und Status immer, der Rest nach Ansicht
  const SP_BREITE: Record<string, string> = { nummer: "130px", kunde: "minmax(140px, 1fr)", datum: "110px", termin: "130px", netto: "130px", abrechnung: "110px" };
  const extraSpalten = vorlage.spalten.filter((x) => x.sichtbar && SP_BREITE[x.key]).map((x) => x.key);
  const vorTitel = extraSpalten.filter((k) => k === "nummer");
  const nachStatus = extraSpalten.filter((k) => k !== "nummer");
  const raster = [...vorTitel.map((k) => SP_BREITE[k]), "minmax(180px, 2fr)", "160px", ...nachStatus.map((k) => SP_BREITE[k]), "44px"].join(" ");
  const rasterBreite = 180 + 160 + 44 + extraSpalten.reduce((n, k) => n + (k === "kunde" ? 140 : parseInt(SP_BREITE[k], 10)), 0) + 12 * (extraSpalten.length + 2) + 36;

  async function anlegen() {
    const titel = neuTitel.trim();
    if (!titel) return;
    setSpeichern(true);
    const { data, error } = await supabase
      .from("auftraege")
      .insert({ titel, status: neuStatus, auftragsdatum: neuDatum || null, standort_id: konkreterStandort(leseStandortCookie()) })
      .select("id")
      .single();
    setSpeichern(false);

    if (error) {
      setFehler(error.message);
      return;
    }
    setModalOffen(false);
    setNeuTitel("");
    setNeuStatus("entwurf");
    if (data && (data as any).id) {
      router.push(`/dashboard/auftraege/${(data as any).id}`);
    } else {
      laden();
    }
  }

  async function loeschen(id: string, titel: string) {
    if (
      !window.confirm(
        `Auftrag „${titel}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`
      )
    )
      return;
    const { error } = await supabase.from("auftraege").delete().eq("id", id);
    if (error) {
      setFehler(error.message);
      return;
    }
    setAuftraege((prev) => prev.filter((a) => a.id !== id));
  }

  async function chancenModalOeffnen() {
    setChanceModalOffen(true);
    setChancenLoading(true);
    setFehler(null);
    const { data, error } = await supabase
      .from("crm_deal")
      .select("id, titel, wert:wert_netto, kontakt_id, phase:stufe, auftrag_id")
      .is("auftrag_id", null)
      .neq("stufe", "verloren");

    if (error) {
      setFehler(error.message);
      setChancen([]);
    } else {
      const liste = ((data as any) || []) as Chance[];
      liste.sort((a, b) => {
        const ra = PHASE_RANG[a.phase] ?? 5;
        const rb = PHASE_RANG[b.phase] ?? 5;
        if (ra !== rb) return ra - rb;
        return (Number(b.wert) || 0) - (Number(a.wert) || 0);
      });
      setChancen(liste);
    }
    setChancenLoading(false);
  }

  // ---------- Auftrag aus Verkaufschance erzeugen (A6: frische Phase + Doppel-Schutz) ----------
  async function ausChanceErstellen(ch: Chance) {
    setErstelltVon(ch.id);
    setFehler(null);

    // Phase & Daten IM MOMENT DES KLICKS frisch laden — verhindert Timing-Fehler
    const { data: fresh, error: fErr } = await supabase
      .from("crm_deal")
      .select("id, titel, wert:wert_netto, kontakt_id, phase:stufe, auftrag_id")
      .eq("id", ch.id)
      .single();

    if (fErr || !fresh) {
      setErstelltVon(null);
      setFehler(
        "Verkaufschance konnte nicht geladen werden: " +
          (fErr?.message || "unbekannt")
      );
      return;
    }
    const f = fresh as any;

    // Doppel-Auftrag-Schutz: schon verknüpft?
    if (f.auftrag_id) {
      setErstelltVon(null);
      setFehler("Diese Verkaufschance hat bereits einen Auftrag.");
      setChancen((prev) => prev.filter((c) => c.id !== ch.id));
      return;
    }

    // HW-13: Steuersatz der ersten Position abfragen (0, 7 oder 19 %); leer/Abbruch = 19 %
    const satzEingabe = Number(f.wert) > 0
      ? window.prompt("Steuersatz für den Auftragswert in Prozent (0, 7 oder 19):", "19")
      : "19";
    if (satzEingabe === null) { setErstelltVon(null); return; }
    const mwstSatzDeal = steuersatz(satzEingabe);
    if (![0, 7, 19].includes(mwstSatzDeal)) { setErstelltVon(null); setFehler("Bitte 0, 7 oder 19 als Steuersatz angeben."); return; }

    const waehrung = f.waehrung || "EUR";
    const gewonnen = f.phase === "gewonnen";
    const wert = Number(f.wert) || 0;
    const titel = f.titel || "Auftrag aus Verkaufschance";

    // 1) Auftrag anlegen
    const { data: aData, error: aErr } = await supabase
      .from("auftraege")
      .insert({
        titel,
        status: gewonnen ? "beauftragt" : "entwurf",
        kontakt_id: f.kontakt_id || null,
        firma_id: f.firma_id || null,
        verkaufschance_id: f.id,
        waehrung,
        standort_id: konkreterStandort(leseStandortCookie()),
      })
      .select("id")
      .single();

    if (aErr || !aData) {
      setErstelltVon(null);
      setFehler("Auftrag anlegen: " + (aErr?.message || "unbekannt"));
      return;
    }
    const auftragId = (aData as any).id as string;

    // 2) Wert als erste Position übernehmen — HW-13: Steuersatz waehlen statt fest 19 %
    let netto = 0;
    let mwst = 0;
    if (wert > 0) {
      const mwstSatz = mwstSatzDeal;
      netto = r2(wert);
      mwst = r2(wert * (mwstSatz / 100));
      const { error: pErr } = await supabase.from("auftrag_positionen").insert({
        auftrag_id: auftragId,
        position: 1,
        bezeichnung: titel,
        menge: 1,
        einheit: "Psch",
        einzelpreis: netto,
        mwst_satz: mwstSatz,
        gesamt_netto: netto,
      });
      if (pErr) {
        setFehler(
          "Hinweis: Position konnte nicht übernommen werden: " + pErr.message
        );
      }
    }

    // 3) Summen festschreiben
    await supabase
      .from("auftraege")
      .update({
        netto_summe: netto,
        mwst_summe: mwst,
        brutto_summe: r2(netto + mwst),
      })
      .eq("id", auftragId);

    // 4) Chance verknüpfen
    await supabase
      .from("crm_deal")
      .update({ auftrag_id: auftragId })
      .eq("id", f.id);

    // 5) zur Detailseite
    router.push(`/dashboard/auftraege/${auftragId}`);
  }

  return (
    <div
      style={{
        color: "#fff",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* A4: Hintergrund, Höhe, Breite und Seitenabstand kommen aus der zentralen Seitenschale (layout.tsx). */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-dm-sans), sans-serif",
                fontSize: 'clamp(30px, 2.63vw, 42px)',
                fontWeight: 700,
                margin: 0,
                letterSpacing: "-0.5px",
              }}
            >
              📄 {vorlage.titel}
            </h1>
            <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
              {vorlage.einheitPlural} verwalten — von der Beauftragung bis zur Rechnung.
              {fein ? ` · Vorlage ${fein}` : ""}
            </p>
          </div>

          {/* KI-Auge: was heißt die Auftrags-Lage gerade für mich? */}
      <AuftraegeAuge />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={chancenModalOeffnen}
              style={{
                background: "transparent",
                color: C.cyan,
                border: `1px solid ${C.cyan}77`,
                borderRadius: 10,
                padding: "12px 18px",
                fontSize: 'clamp(14px, 1.25vw, 20px)',
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              📥 Aus Verkaufschance
            </button>
            <button
              onClick={() => setModalOffen(true)}
              style={{
                background: C.gold,
                color: C.navy,
                border: "none",
                borderRadius: 10,
                padding: "12px 20px",
                fontSize: 'clamp(15px, 1.31vw, 21px)',
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              + {vorlage.einheit} anlegen
            </button>
            <button
              onClick={() => setZeigeAnsicht((x) => !x)}
              title="Status-Namen, Spalten und Termin-Ampel"
              style={{
                background: "transparent",
                color: C.textDim,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 'clamp(14px, 1.25vw, 20px)',
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              ⚙️ Ansicht
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 28,
          }}
        >
          <KpiKarte label="Offen" wert={String(kpi.offen)} hint={`${statusLabel("entwurf")} + ${statusLabel("beauftragt")}`} farbe={C.cyan} />
          <KpiKarte label={statusLabel("in_bearbeitung")} wert={String(kpi.inArbeit)} hint={kpi.ueberfaellig > 0 ? `${kpi.ueberfaellig} mit ${terminWort} überschritten` : `laufende ${vorlage.einheitPlural}`} farbe={kpi.ueberfaellig > 0 ? C.danger : C.green} />
          <KpiKarte label={statusLabel("abgeschlossen")} wert={String(kpi.fertig)} hint={kpi.offenAbrechnung > 0 ? `davon ${kpi.offenAbrechnung} nicht abgerechnet` : "alle abgerechnet"} farbe={kpi.offenAbrechnung > 0 ? C.warn : C.gold} />
          <KpiKarte label="Auftragswert" wert={geld(kpi.summeNetto)} hint={`netto, ohne ${statusLabel("storniert").toLowerCase()}`} farbe={C.lila} />
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder={`🔍 Suche nach Titel, Nummer oder ${spaltenLabel("kunde")}…`}
            style={{
              flex: "1 1 260px",
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "11px 14px",
              color: "#fff",
              fontSize: 'clamp(14px, 1.25vw, 20px)',
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <FilterChip aktiv={statusFilter === "alle"} onClick={() => setStatusFilter("alle")} label="Alle" farbe={C.textDim} />
            {STATUS_REIHENFOLGE.map((s) => (
              <FilterChip key={s} aktiv={statusFilter === s} onClick={() => setStatusFilter(s)} label={statusLabel(s)} farbe={STATUS[s].farbe} />
            ))}
          </div>
        </div>

        {/* Paket 311: gespeicherte Suchen der Branchen-Vorlage */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
          <span style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>Schnellsuche:</span>
          {vorlage.suchen.map((x) => (
            <FilterChip key={x.key} aktiv={schnell === x.key} onClick={() => setSchnell(schnell === x.key ? null : x.key)} label={x.name} farbe={x.regel === "ampel=rot" ? C.danger : C.gold} />
          ))}
        </div>

        {zeigeAnsicht && betrieb && (
          <AuftragAnsicht vorlage={vorlage} einstellung={einstellung} betrieb={betrieb} istChef={istChef} fein={fein}
            onGespeichert={(e) => setEinstellung(e)} onSchliessen={() => setZeigeAnsicht(false)} />
        )}

        {fehler && (
          <div
            style={{
              background: "rgba(224,102,102,0.12)",
              border: `1px solid ${C.danger}`,
              borderRadius: 10,
              padding: "12px 16px",
              color: C.danger,
              marginBottom: 18,
              fontSize: 'clamp(14px, 1.25vw, 20px)',
            }}
          >
            ⚠️ {fehler}
          </div>
        )}

        <div
          style={{
            background: C.navy2,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            overflowX: "auto",
          }}
        >
          <div style={{ minWidth: rasterBreite }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: raster,
              gap: 12,
              padding: "14px 18px",
              borderBottom: `1px solid ${C.border}`,
              color: C.textDim,
              fontSize: 'clamp(12px, 1.06vw, 17px)',
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {vorTitel.map((k) => <div key={k}>{spaltenLabel(k)}</div>)}
            <div>Titel</div>
            <div>Status</div>
            {nachStatus.map((k) => (
              <div key={k} style={{ textAlign: k === "netto" ? "right" : "left" }}>{k === "termin" ? terminWort : spaltenLabel(k)}</div>
            ))}
            <div></div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: C.textDim }}>
              ARGONAUT lädt die Aufträge…
            </div>
          ) : gefiltert.length === 0 ? (
            auftraege.length === 0 ? (
              <Leerzustand
                icon="📄"
                titel={`Noch keine ${vorlage.einheitPlural}`}
                text="Der Auftrag ist die Mitte Ihres Betriebs: Aus ihm entstehen Termine, Material, Zeiten und am Ende die Rechnung."
                schritte={["Oben rechts einen Auftrag anlegen", "Kunde und Leistung eintragen", "Aus dem fertigen Auftrag die Rechnung erzeugen"]}
              />
            ) : (
              <div style={{ padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 'clamp(40px, 3.5vw, 56px)', marginBottom: 12 }}>🔍</div>
                <div style={{ color: C.textDim, fontSize: 'clamp(15px, 1.31vw, 21px)' }}>
                  Keine {vorlage.einheitPlural} passen zu Suche und Filter.
                </div>
              </div>
            )
          ) : (
            gefiltert.map((a) => {
              const s = (STATUS[a.status as StatusKey] || STATUS.entwurf) as (typeof STATUS)[StatusKey];
              const ampel = auftragAmpel(a, heuteTag, warnTage);
              const zelle = (k: string) => {
                if (k === "nummer") return <div key={k} style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', fontFamily: "monospace" }}>{a.auftragsnummer || "—"}</div>;
                if (k === "kunde") return <div key={k} style={{ color: kundeVon(a) ? "#fff" : C.textDim, fontSize: 'clamp(13.5px, 1.19vw, 19px)', overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kundeVon(a) || "—"}</div>;
                if (k === "datum") return <div key={k} style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>{datumKurz(a.auftragsdatum)}</div>;
                if (k === "termin") return (
                  <div key={k} style={{ color: a.lieferdatum ? AMPEL_FARBE[ampel] : C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', fontWeight: ampel === "rot" || ampel === "gelb" ? 700 : 400 }}
                    title={ampel === "rot" ? `${terminWort} überschritten` : ampel === "gelb" ? `${terminWort} bald` : undefined}>
                    {ampel === "rot" ? "● " : ampel === "gelb" ? "○ " : ""}{datumKurz(a.lieferdatum)}
                  </div>
                );
                if (k === "netto") return <div key={k} style={{ textAlign: "right", fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 600 }}>{geld(a.netto_summe, a.waehrung || "EUR")}</div>;
                if (k === "abrechnung") return (
                  <div key={k} style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: a.rechnung_id ? C.green : nichtAbgerechnet(a) ? C.warn : C.textDim, fontWeight: nichtAbgerechnet(a) ? 700 : 400 }}>
                    {a.rechnung_id ? "✓ Rechnung" : nichtAbgerechnet(a) ? "offen" : "—"}
                  </div>
                );
                return null;
              };
              return (
                <div
                  key={a.id}
                  onClick={() => router.push(`/dashboard/auftraege/${a.id}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: raster,
                    gap: 12,
                    padding: "16px 18px",
                    borderBottom: `1px solid ${C.border}`,
                    alignItems: "center",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {vorTitel.map(zelle)}
                  <div style={{ fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{a.titel}</div>
                  <div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: `${s.farbe}1f`,
                        color: s.farbe,
                        border: `1px solid ${s.farbe}55`,
                        borderRadius: 20,
                        padding: "4px 12px",
                        fontSize: 'clamp(12.5px, 1.13vw, 18px)',
                        fontWeight: 600,
                      }}
                    >
                      {s.icon} {statusLabel(a.status || "entwurf")}
                    </span>
                  </div>
                  {nachStatus.map(zelle)}
                  <div style={{ textAlign: "right" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        loeschen(a.id, a.titel);
                      }}
                      title="Löschen"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: C.textDim,
                        cursor: "pointer",
                        fontSize: 'clamp(16px, 1.38vw, 22px)',
                        padding: 4,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = C.danger)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = C.textDim)}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>

        <p style={{ color: C.textDim, fontSize: 'clamp(12.5px, 1.13vw, 18px)', marginTop: 14, textAlign: "center" }}>
          {gefiltert.length} von {auftraege.length} {vorlage.einheitPlural}
        </p>
      </div>

      {/* Modal: Neuer Auftrag */}
      {modalOffen && (
        <div
          onClick={() => setModalOffen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 460,
            }}
          >
            <h2 style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 700, margin: "0 0 4px" }}>
              {vorlage.einheit} anlegen
            </h2>
            <p style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', margin: "0 0 20px" }}>
              Kopf-Daten anlegen — Positionen fügen Sie danach auf der Detailseite hinzu.
            </p>

            <label style={labelStyle}>Titel *</label>
            <input
              value={neuTitel}
              onChange={(e) => setNeuTitel(e.target.value)}
              placeholder="z. B. Holzernte Waldstück Nord"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") anlegen();
              }}
              style={inputStyle}
            />

            <NurVoll>
              <label style={labelStyle}>Status</label>
              <select value={neuStatus} onChange={(e) => setNeuStatus(e.target.value as StatusKey)} style={inputStyle}>
                {STATUS_REIHENFOLGE.map((s) => (
                  <option key={s} value={s} style={{ background: C.navy2 }}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>

              <label style={labelStyle}>Auftragsdatum</label>
              <input type="date" value={neuDatum} onChange={(e) => setNeuDatum(e.target.value)} style={inputStyle} />
            </NurVoll>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
              <button
                onClick={() => setModalOffen(false)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textDim,
                  borderRadius: 10,
                  padding: "11px 18px",
                  fontSize: 'clamp(14px, 1.25vw, 20px)',
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={anlegen}
                disabled={!neuTitel.trim() || speichern}
                style={{
                  background: !neuTitel.trim() || speichern ? C.border : C.gold,
                  color: !neuTitel.trim() || speichern ? C.textDim : C.navy,
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 20px",
                  fontSize: 'clamp(14px, 1.25vw, 20px)',
                  fontWeight: 700,
                  cursor: !neuTitel.trim() || speichern ? "not-allowed" : "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {speichern ? "Speichert…" : "Anlegen & öffnen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Aus Verkaufschance */}
      {chanceModalOffen && (
        <div
          onClick={() => (erstelltVon ? null : setChanceModalOffen(false))}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 560,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <h2 style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 700, margin: "0 0 4px" }}>
              Auftrag aus Verkaufschance
            </h2>
            <p style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)', margin: "0 0 20px" }}>
              Titel, Kontakt, Firma und Wert der gewählten Chance werden übernommen. Gewonnene stehen oben.
            </p>

            <div style={{ overflowY: "auto", flex: 1, margin: "0 -4px" }}>
              {chancenLoading ? (
                <div style={{ padding: 30, textAlign: "center", color: C.textDim }}>
                  ARGONAUT lädt die Verkaufschancen…
                </div>
              ) : chancen.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
                  Keine offenen Verkaufschancen ohne Auftrag gefunden.
                  <br />
                  Eine im CRM als „gewonnen" markierte Chance erscheint hier.
                </div>
              ) : (
                chancen.map((ch) => {
                  const ph = PHASE[ch.phase] || { label: ch.phase, farbe: C.textDim };
                  const busy = erstelltVon === ch.id;
                  const disabled = erstelltVon !== null;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => !disabled && ausChanceErstellen(ch)}
                      disabled={disabled}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: C.navy,
                        border: `1px solid ${busy ? C.gold : C.border}`,
                        borderRadius: 12,
                        padding: "14px 16px",
                        margin: "0 4px 10px",
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled && !busy ? 0.5 : 1,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 600, color: "#fff" }}>{ch.titel || "Ohne Titel"}</span>
                        <span
                          style={{
                            background: `${ph.farbe}22`,
                            color: ph.farbe,
                            border: `1px solid ${ph.farbe}66`,
                            borderRadius: 20,
                            padding: "3px 10px",
                            fontSize: 'clamp(11.5px, 1vw, 16px)',
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ph.label}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
                        {busy ? "ARGONAUT erstellt den Auftrag…" : `Wert: ${geld(ch.wert, ch.waehrung || "EUR")}`}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={() => !erstelltVon && setChanceModalOffen(false)}
                disabled={erstelltVon !== null}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textDim,
                  borderRadius: 10,
                  padding: "11px 18px",
                  fontSize: 'clamp(14px, 1.25vw, 20px)',
                  fontWeight: 600,
                  cursor: erstelltVon !== null ? "not-allowed" : "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiKarte({ label, wert, hint, farbe }: { label: string; wert: string; hint: string; farbe: string }) {
  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "18px 20px",
        borderLeft: `3px solid ${farbe}`,
      }}
    >
      <div style={{ color: C.textDim, fontSize: 'clamp(12.5px, 1.13vw, 18px)', fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontFamily: "var(--font-dm-sans), sans-serif",
          fontSize: 'clamp(26px, 2.25vw, 36px)',
          fontWeight: 700,
          margin: "6px 0 2px",
          color: farbe,
        }}
      >
        {wert}
      </div>
      <div style={{ color: C.textDim, fontSize: 'clamp(11.5px, 1vw, 16px)' }}>{hint}</div>
    </div>
  );
}

function FilterChip({ aktiv, onClick, label, farbe }: { aktiv: boolean; onClick: () => void; label: string; farbe: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: aktiv ? `${farbe}22` : "transparent",
        color: aktiv ? farbe : C.textDim,
        border: `1px solid ${aktiv ? `${farbe}77` : C.border}`,
        borderRadius: 20,
        padding: "7px 14px",
        fontSize: 'clamp(13px, 1.13vw, 18px)',
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {label}
    </button>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  color: C.textDim,
  fontSize: 'clamp(13px, 1.13vw, 18px)',
  fontWeight: 600,
  margin: "14px 0 6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 14px",
  color: "#fff",
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};
