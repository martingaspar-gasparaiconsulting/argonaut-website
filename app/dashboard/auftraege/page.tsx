"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ============================================================
// ARGONAUT OS · Modul 5 (Vertrag/Auftrag) · Cockpit A2 + A5 + A6
// Auftrags-Cockpit MIT "Aus Verkaufschance" (frische Phase, Doppel-Schutz)
// Route: /dashboard/auftraege
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
};

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
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export default function AuftraegeCockpit() {
  const router = useRouter();

  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alle" | StatusKey>("alle");

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
    const { data, error } = await supabase
      .from("auftraege")
      .select(
        "id, auftragsnummer, titel, status, auftragsdatum, netto_summe, brutto_summe, waehrung, created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setFehler(error.message);
      setAuftraege([]);
    } else {
      setAuftraege((data as any) || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    laden();
  }, []);

  const kpi = useMemo(() => {
    let offen = 0;
    let inArbeit = 0;
    let fertig = 0;
    let summeNetto = 0;
    for (const a of auftraege) {
      const s = a.status as StatusKey;
      if (s === "entwurf" || s === "beauftragt") offen++;
      if (s === "in_bearbeitung") inArbeit++;
      if (s === "abgeschlossen") fertig++;
      if (s !== "storniert") summeNetto += Number(a.netto_summe) || 0;
    }
    return { offen, inArbeit, fertig, summeNetto };
  }, [auftraege]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return auftraege.filter((a) => {
      if (statusFilter !== "alle" && a.status !== statusFilter) return false;
      if (!q) return true;
      const heu = `${a.titel} ${a.auftragsnummer || ""}`.toLowerCase();
      return heu.includes(q);
    });
  }, [auftraege, suche, statusFilter]);

  async function anlegen() {
    const titel = neuTitel.trim();
    if (!titel) return;
    setSpeichern(true);
    const { data, error } = await supabase
      .from("auftraege")
      .insert({ titel, status: neuStatus, auftragsdatum: neuDatum || null })
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
      .from("verkaufschancen")
      .select("id, titel, wert, waehrung, kontakt_id, firma_id, phase")
      .is("auftrag_id", null)
      .neq("phase", "verloren");

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
      .from("verkaufschancen")
      .select("id, titel, wert, waehrung, kontakt_id, firma_id, phase, auftrag_id")
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
      })
      .select("id")
      .single();

    if (aErr || !aData) {
      setErstelltVon(null);
      setFehler("Auftrag anlegen: " + (aErr?.message || "unbekannt"));
      return;
    }
    const auftragId = (aData as any).id as string;

    // 2) Wert als erste Position übernehmen
    let netto = 0;
    let mwst = 0;
    if (wert > 0) {
      const mwstSatz = 19;
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
      .from("verkaufschancen")
      .update({ auftrag_id: auftragId })
      .eq("id", f.id);

    // 5) zur Detailseite
    router.push(`/dashboard/auftraege/${auftragId}`);
  }

  return (
    <div
      style={{
        background: C.navy,
        minHeight: "100vh",
        padding: "32px 24px 80px",
        color: "#fff",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
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
                fontFamily: "'Syne', sans-serif",
                fontSize: 30,
                fontWeight: 700,
                margin: 0,
                letterSpacing: "-0.5px",
              }}
            >
              📄 Aufträge
            </h1>
            <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 14 }}>
              Verträge & Aufträge verwalten — von der Beauftragung bis zum
              Abschluss.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={chancenModalOeffnen}
              style={{
                background: "transparent",
                color: C.cyan,
                border: `1px solid ${C.cyan}77`,
                borderRadius: 10,
                padding: "12px 18px",
                fontSize: 14,
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
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              + Neuer Auftrag
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
          <KpiKarte label="Offen" wert={String(kpi.offen)} hint="Entwurf + Beauftragt" farbe={C.cyan} />
          <KpiKarte label="In Bearbeitung" wert={String(kpi.inArbeit)} hint="laufende Aufträge" farbe={C.green} />
          <KpiKarte label="Abgeschlossen" wert={String(kpi.fertig)} hint="fertige Aufträge" farbe={C.gold} />
          <KpiKarte label="Auftragswert" wert={geld(kpi.summeNetto)} hint="netto, ohne stornierte" farbe={C.lila} />
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
            placeholder="🔍 Suche nach Titel oder Auftragsnummer…"
            style={{
              flex: "1 1 260px",
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "11px 14px",
              color: "#fff",
              fontSize: 14,
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <FilterChip aktiv={statusFilter === "alle"} onClick={() => setStatusFilter("alle")} label="Alle" farbe={C.textDim} />
            {STATUS_REIHENFOLGE.map((s) => (
              <FilterChip key={s} aktiv={statusFilter === s} onClick={() => setStatusFilter(s)} label={STATUS[s].label} farbe={STATUS[s].farbe} />
            ))}
          </div>
        </div>

        {fehler && (
          <div
            style={{
              background: "rgba(224,102,102,0.12)",
              border: `1px solid ${C.danger}`,
              borderRadius: 10,
              padding: "12px 16px",
              color: C.danger,
              marginBottom: 18,
              fontSize: 14,
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
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr 160px 150px 44px",
              gap: 12,
              padding: "14px 18px",
              borderBottom: `1px solid ${C.border}`,
              color: C.textDim,
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            <div>Nummer</div>
            <div>Titel</div>
            <div>Status</div>
            <div style={{ textAlign: "right" }}>Netto</div>
            <div></div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: C.textDim }}>
              ARGONAUT lädt die Aufträge…
            </div>
          ) : gefiltert.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
              <div style={{ color: C.textDim, fontSize: 15 }}>
                {auftraege.length === 0
                  ? "Noch keine Aufträge. Leg oben rechts deinen ersten an."
                  : "Keine Aufträge passen zu Suche/Filter."}
              </div>
            </div>
          ) : (
            gefiltert.map((a) => {
              const s = (STATUS[a.status as StatusKey] || STATUS.entwurf) as (typeof STATUS)[StatusKey];
              return (
                <div
                  key={a.id}
                  onClick={() => router.push(`/dashboard/auftraege/${a.id}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px 1fr 160px 150px 44px",
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
                  <div style={{ color: C.textDim, fontSize: 13, fontFamily: "monospace" }}>
                    {a.auftragsnummer || "—"}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{a.titel}</div>
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
                        fontSize: 12.5,
                        fontWeight: 600,
                      }}
                    >
                      {s.icon} {s.label}
                    </span>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 14, fontWeight: 600 }}>
                    {geld(a.netto_summe, a.waehrung || "EUR")}
                  </div>
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
                        fontSize: 16,
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

        <p style={{ color: C.textDim, fontSize: 12.5, marginTop: 14, textAlign: "center" }}>
          {gefiltert.length} von {auftraege.length} Aufträgen
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
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
              Neuer Auftrag
            </h2>
            <p style={{ color: C.textDim, fontSize: 13, margin: "0 0 20px" }}>
              Kopf-Daten anlegen — Positionen fügst du danach auf der Detailseite hinzu.
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

            <label style={labelStyle}>Status</label>
            <select value={neuStatus} onChange={(e) => setNeuStatus(e.target.value as StatusKey)} style={inputStyle}>
              {STATUS_REIHENFOLGE.map((s) => (
                <option key={s} value={s} style={{ background: C.navy2 }}>
                  {STATUS[s].label}
                </option>
              ))}
            </select>

            <label style={labelStyle}>Auftragsdatum</label>
            <input type="date" value={neuDatum} onChange={(e) => setNeuDatum(e.target.value)} style={inputStyle} />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
              <button
                onClick={() => setModalOffen(false)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textDim,
                  borderRadius: 10,
                  padding: "11px 18px",
                  fontSize: 14,
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
                  fontSize: 14,
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
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
              Auftrag aus Verkaufschance
            </h2>
            <p style={{ color: C.textDim, fontSize: 13, margin: "0 0 20px" }}>
              Wähle eine Chance — Titel, Kontakt, Firma & Wert werden übernommen. Gewonnene stehen oben.
            </p>

            <div style={{ overflowY: "auto", flex: 1, margin: "0 -4px" }}>
              {chancenLoading ? (
                <div style={{ padding: 30, textAlign: "center", color: C.textDim }}>
                  ARGONAUT lädt die Verkaufschancen…
                </div>
              ) : chancen.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: C.textDim, fontSize: 14 }}>
                  Keine offenen Verkaufschancen ohne Auftrag gefunden.
                  <br />
                  Markiere im CRM eine Chance als „gewonnen" — dann taucht sie hier auf.
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
                        <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{ch.titel || "Ohne Titel"}</span>
                        <span
                          style={{
                            background: `${ph.farbe}22`,
                            color: ph.farbe,
                            border: `1px solid ${ph.farbe}66`,
                            borderRadius: 20,
                            padding: "3px 10px",
                            fontSize: 11.5,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ph.label}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, color: C.textDim, fontSize: 13 }}>
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
                  fontSize: 14,
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
      <div style={{ color: C.textDim, fontSize: 12.5, fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 26,
          fontWeight: 700,
          margin: "6px 0 2px",
          color: farbe,
        }}
      >
        {wert}
      </div>
      <div style={{ color: C.textDim, fontSize: 11.5 }}>{hint}</div>
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
        fontSize: 13,
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
  fontSize: 13,
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
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};
