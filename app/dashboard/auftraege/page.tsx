"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ============================================================
// ARGONAUT OS · Modul 5 (Vertrag/Auftrag) · Block A2: Auftrags-Cockpit
// Route: /dashboard/auftraege
// ============================================================

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ---------- Brand-Farben ----------
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

// ---------- Status-Definitionen (Ampel) ----------
type StatusKey =
  | "entwurf"
  | "beauftragt"
  | "in_bearbeitung"
  | "abgeschlossen"
  | "storniert";

const STATUS: Record<
  StatusKey,
  { label: string; farbe: string; icon: string }
> = {
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

// ---------- Typ eines Auftrags (locker, data = any aus Supabase) ----------
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

// ---------- Geld formatieren ----------
function geld(n: number | null | undefined, waehrung = "EUR"): string {
  const wert = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: waehrung || "EUR",
  }).format(wert);
}

export default function AuftraegeCockpit() {
  const router = useRouter();

  const [auftraege, setAuftraege] = useState<Auftrag[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alle" | StatusKey>("alle");

  // Modal "Neu anlegen"
  const [modalOffen, setModalOffen] = useState(false);
  const [neuTitel, setNeuTitel] = useState("");
  const [neuStatus, setNeuStatus] = useState<StatusKey>("entwurf");
  const [neuDatum, setNeuDatum] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [speichern, setSpeichern] = useState(false);

  // ---------- Laden ----------
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

  // ---------- KPI ----------
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

  // ---------- Gefilterte Liste ----------
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return auftraege.filter((a) => {
      if (statusFilter !== "alle" && a.status !== statusFilter) return false;
      if (!q) return true;
      const heu = `${a.titel} ${a.auftragsnummer || ""}`.toLowerCase();
      return heu.includes(q);
    });
  }, [auftraege, suche, statusFilter]);

  // ---------- Neu anlegen (nur Kopf-Daten) ----------
  async function anlegen() {
    const titel = neuTitel.trim();
    if (!titel) return;
    setSpeichern(true);
    const { data, error } = await supabase
      .from("auftraege")
      .insert({
        titel,
        status: neuStatus,
        auftragsdatum: neuDatum || null,
      })
      .select("id")
      .single();
    setSpeichern(false);

    if (error) {
      setFehler(error.message);
      return;
    }
    // direkt weiter — Positionen kommen auf der Detailseite (A4)
    setModalOffen(false);
    setNeuTitel("");
    setNeuStatus("entwurf");
    if (data && (data as any).id) {
      router.push(`/dashboard/auftraege/${(data as any).id}`);
    } else {
      laden();
    }
  }

  // ---------- Löschen ----------
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

  // ============================================================
  // Render
  // ============================================================
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
        {/* Kopf */}
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

        {/* KPI-Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 28,
          }}
        >
          <KpiKarte
            label="Offen"
            wert={String(kpi.offen)}
            hint="Entwurf + Beauftragt"
            farbe={C.cyan}
          />
          <KpiKarte
            label="In Bearbeitung"
            wert={String(kpi.inArbeit)}
            hint="laufende Aufträge"
            farbe={C.green}
          />
          <KpiKarte
            label="Abgeschlossen"
            wert={String(kpi.fertig)}
            hint="fertige Aufträge"
            farbe={C.gold}
          />
          <KpiKarte
            label="Auftragswert"
            wert={geld(kpi.summeNetto)}
            hint="netto, ohne stornierte"
            farbe={C.lila}
          />
        </div>

        {/* Such- & Filterleiste */}
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
            <FilterChip
              aktiv={statusFilter === "alle"}
              onClick={() => setStatusFilter("alle")}
              label="Alle"
              farbe={C.textDim}
            />
            {STATUS_REIHENFOLGE.map((s) => (
              <FilterChip
                key={s}
                aktiv={statusFilter === s}
                onClick={() => setStatusFilter(s)}
                label={STATUS[s].label}
                farbe={STATUS[s].farbe}
              />
            ))}
          </div>
        </div>

        {/* Fehler */}
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

        {/* Liste */}
        <div
          style={{
            background: C.navy2,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {/* Tabellenkopf */}
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
              const s = (STATUS[a.status as StatusKey] ||
                STATUS.entwurf) as (typeof STATUS)[StatusKey];
              return (
                <div
                  key={a.id}
                  onClick={() =>
                    router.push(`/dashboard/auftraege/${a.id}`)
                  }
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
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.03)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <div
                    style={{
                      color: C.textDim,
                      fontSize: 13,
                      fontFamily: "monospace",
                    }}
                  >
                    {a.auftragsnummer || "—"}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
                    {a.titel}
                  </div>
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
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
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
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = C.danger)
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = C.textDim)
                      }
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <p
          style={{
            color: C.textDim,
            fontSize: 12.5,
            marginTop: 14,
            textAlign: "center",
          }}
        >
          {gefiltert.length} von {auftraege.length} Aufträgen
        </p>
      </div>

      {/* ---------- Modal: Neuer Auftrag ---------- */}
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
            <h2
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 20,
                fontWeight: 700,
                margin: "0 0 4px",
              }}
            >
              Neuer Auftrag
            </h2>
            <p style={{ color: C.textDim, fontSize: 13, margin: "0 0 20px" }}>
              Kopf-Daten anlegen — Positionen fügst du danach auf der
              Detailseite hinzu.
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
            <select
              value={neuStatus}
              onChange={(e) => setNeuStatus(e.target.value as StatusKey)}
              style={inputStyle}
            >
              {STATUS_REIHENFOLGE.map((s) => (
                <option key={s} value={s} style={{ background: C.navy2 }}>
                  {STATUS[s].label}
                </option>
              ))}
            </select>

            <label style={labelStyle}>Auftragsdatum</label>
            <input
              type="date"
              value={neuDatum}
              onChange={(e) => setNeuDatum(e.target.value)}
              style={inputStyle}
            />

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 24,
              }}
            >
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
                  background:
                    !neuTitel.trim() || speichern ? C.border : C.gold,
                  color:
                    !neuTitel.trim() || speichern ? C.textDim : C.navy,
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 20px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor:
                    !neuTitel.trim() || speichern ? "not-allowed" : "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {speichern ? "Speichert…" : "Anlegen & öffnen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Kleine Unterkomponenten
// ============================================================
function KpiKarte({
  label,
  wert,
  hint,
  farbe,
}: {
  label: string;
  wert: string;
  hint: string;
  farbe: string;
}) {
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
      <div style={{ color: C.textDim, fontSize: 12.5, fontWeight: 600 }}>
        {label}
      </div>
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

function FilterChip({
  aktiv,
  onClick,
  label,
  farbe,
}: {
  aktiv: boolean;
  onClick: () => void;
  label: string;
  farbe: string;
}) {
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
