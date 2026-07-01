"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C7 Pipeline-Kanban (Verkaufschancen)
// Drag&Drop über Phasen · Andock auftrag_id (→ Modul 5) NICHT verbunden
// ---------------------------------------------------------------------

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

const PHASEN: { wert: string; label: string; farbe: string }[] = [
  { wert: "erstkontakt", label: "Erstkontakt", farbe: C.cyan },
  { wert: "qualifiziert", label: "Qualifiziert", farbe: C.gold },
  { wert: "angebot", label: "Angebot", farbe: C.warn },
  { wert: "verhandlung", label: "Verhandlung", farbe: C.lila },
  { wert: "gewonnen", label: "Gewonnen", farbe: C.green },
  { wert: "verloren", label: "Verloren", farbe: C.danger },
];

const OFFENE_PHASEN = ["erstkontakt", "qualifiziert", "angebot", "verhandlung"];

interface Chance {
  id: string;
  titel: string;
  kontakt_id: string | null;
  firma_id: string | null;
  phase: string | null;
  wert: number | null;
  wahrscheinlichkeit: number | null;
  erwartetes_abschlussdatum: string | null;
  notizen: string | null;
  updated_at: string | null;
}

interface KontaktMini {
  id: string;
  vorname: string | null;
  nachname: string | null;
  firma_id: string | null;
}

interface FirmaMini {
  id: string;
  name: string;
}

interface FormState {
  titel: string;
  kontakt_id: string;
  firma_id: string;
  phase: string;
  wert: string;
  wahrscheinlichkeit: string;
  erwartetes_abschlussdatum: string;
  notizen: string;
}

const LEER_FORM: FormState = {
  titel: "",
  kontakt_id: "",
  firma_id: "",
  phase: "erstkontakt",
  wert: "",
  wahrscheinlichkeit: "10",
  erwartetes_abschlussdatum: "",
  notizen: "",
};

function eur(n: number | null): string {
  const v = n || 0;
  return v.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

function datumKurz(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function kName(k: KontaktMini): string {
  return [k.vorname, k.nachname].filter(Boolean).join(" ") || "Unbenannt";
}

export default function PipelinePage() {
  const router = useRouter();

  const [chancen, setChancen] = useState<Chance[]>([]);
  const [kontakte, setKontakte] = useState<KontaktMini[]>([]);
  const [firmen, setFirmen] = useState<FirmaMini[]>([]);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<Chance | null>(null);
  const [form, setForm] = useState<FormState>(LEER_FORM);
  const [speichert, setSpeichert] = useState(false);
  const [loeschId, setLoeschId] = useState<string | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragUeber, setDragUeber] = useState<string | null>(null);

  async function laden_() {
    setLaden(true);
    setFehler(null);

    const { data, error } = await supabase
      .from("verkaufschancen")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      setFehler(error.message);
      setChancen([]);
      setLaden(false);
      return;
    }
    setChancen((data as Chance[]) || []);

    const { data: kdata } = await supabase
      .from("kontakte")
      .select("id, vorname, nachname, firma_id")
      .order("nachname", { ascending: true });
    setKontakte((kdata as KontaktMini[]) || []);

    const { data: fdata } = await supabase
      .from("firmen")
      .select("id, name")
      .order("name", { ascending: true });
    setFirmen((fdata as FirmaMini[]) || []);

    setLaden(false);
  }

  useEffect(() => {
    laden_();
  }, []);

  const kontaktName = useMemo(() => {
    const m: Record<string, string> = {};
    kontakte.forEach((k) => (m[k.id] = kName(k)));
    return m;
  }, [kontakte]);

  const firmaName = useMemo(() => {
    const m: Record<string, string> = {};
    firmen.forEach((f) => (m[f.id] = f.name));
    return m;
  }, [firmen]);

  const kpi = useMemo(() => {
    const offen = chancen.filter((c) => OFFENE_PHASEN.includes(c.phase || ""));
    const offenWert = offen.reduce((s, c) => s + (c.wert || 0), 0);
    const gewichtet = offen.reduce(
      (s, c) => s + ((c.wert || 0) * (c.wahrscheinlichkeit || 0)) / 100,
      0
    );
    const gewonnenWert = chancen
      .filter((c) => c.phase === "gewonnen")
      .reduce((s, c) => s + (c.wert || 0), 0);
    return {
      offenAnzahl: offen.length,
      offenWert,
      gewichtet: Math.round(gewichtet),
      gewonnenWert,
    };
  }, [chancen]);

  function proPhase(phase: string): Chance[] {
    return chancen.filter((c) => (c.phase || "erstkontakt") === phase);
  }

  function dialogNeu() {
    setBearbeite(null);
    setForm(LEER_FORM);
    setDialogOffen(true);
  }

  function dialogBearbeiten(c: Chance) {
    setBearbeite(c);
    setForm({
      titel: c.titel || "",
      kontakt_id: c.kontakt_id || "",
      firma_id: c.firma_id || "",
      phase: c.phase || "erstkontakt",
      wert: c.wert != null ? String(c.wert) : "",
      wahrscheinlichkeit:
        c.wahrscheinlichkeit != null ? String(c.wahrscheinlichkeit) : "10",
      erwartetes_abschlussdatum: c.erwartetes_abschlussdatum
        ? c.erwartetes_abschlussdatum.slice(0, 10)
        : "",
      notizen: c.notizen || "",
    });
    setDialogOffen(true);
  }

  function feld<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function kontaktGewaehlt(kid: string) {
    const k = kontakte.find((x) => x.id === kid);
    setForm((f) => ({
      ...f,
      kontakt_id: kid,
      firma_id: k && k.firma_id ? k.firma_id : f.firma_id,
    }));
  }

  async function speichern() {
    if (!form.titel.trim()) {
      setFehler("Bitte einen Titel für die Chance angeben.");
      return;
    }
    setSpeichert(true);
    setFehler(null);
    const nutzlast = {
      titel: form.titel.trim(),
      kontakt_id: form.kontakt_id || null,
      firma_id: form.firma_id || null,
      phase: form.phase,
      wert: form.wert ? parseFloat(form.wert.replace(",", ".")) : 0,
      wahrscheinlichkeit: parseInt(form.wahrscheinlichkeit, 10) || 0,
      erwartetes_abschlussdatum: form.erwartetes_abschlussdatum || null,
      notizen: form.notizen.trim() || null,
    };
    let error;
    if (bearbeite) {
      const res = await supabase
        .from("verkaufschancen")
        .update(nutzlast)
        .eq("id", bearbeite.id);
      error = res.error;
    } else {
      const res = await supabase.from("verkaufschancen").insert(nutzlast);
      error = res.error;
    }
    setSpeichert(false);
    if (error) {
      setFehler(error.message);
      return;
    }
    setDialogOffen(false);
    laden_();
  }

  async function loeschen(id: string) {
    const { error } = await supabase
      .from("verkaufschancen")
      .delete()
      .eq("id", id);
    setLoeschId(null);
    if (error) {
      setFehler(error.message);
      return;
    }
    setDialogOffen(false);
    laden_();
  }

  async function phaseAendern(id: string, phase: string) {
    // optimistisch
    setChancen((prev) =>
      prev.map((c) => (c.id === id ? { ...c, phase } : c))
    );
    const { error } = await supabase
      .from("verkaufschancen")
      .update({ phase })
      .eq("id", id);
    if (error) {
      setFehler(error.message);
      laden_();
    }
  }

  function onDrop(phase: string) {
    if (dragId) {
      const c = chancen.find((x) => x.id === dragId);
      if (c && (c.phase || "erstkontakt") !== phase) {
        phaseAendern(dragId, phase);
      }
    }
    setDragId(null);
    setDragUeber(null);
  }

  return (
    <div style={{ background: C.navy, minHeight: "100vh", padding: "32px 28px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <button onClick={() => router.push("/dashboard/crm")} style={zurueckBtn}>
          ← Zurück zu Kontakten
        </button>

        {/* Kopf */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 16,
            margin: "16px 0 24px",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "Syne, sans-serif",
                color: C.gold,
                fontSize: 30,
                margin: 0,
                letterSpacing: 0.5,
              }}
            >
              📊 Vertriebs-Pipeline
            </h1>
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: C.textDim,
                margin: "6px 0 0",
                fontSize: 14,
              }}
            >
              Zieh deine Verkaufschancen per Drag&amp;Drop durch die Phasen.
            </p>
          </div>
          <button onClick={dialogNeu} style={goldBtnGross}>
            + Neue Chance
          </button>
        </div>

        {/* KPI */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <KpiKarte label="Offene Chancen" wert={String(kpi.offenAnzahl)} farbe={C.cyan} />
          <KpiKarte label="Pipeline-Wert (offen)" wert={eur(kpi.offenWert)} farbe={C.gold} />
          <KpiKarte label="Gewichteter Forecast" wert={eur(kpi.gewichtet)} farbe={C.warn} />
          <KpiKarte label="Gewonnen" wert={eur(kpi.gewonnenWert)} farbe={C.green} />
        </div>

        {fehler && <div style={fehlerBox}>{fehler}</div>}

        {/* Kanban */}
        {laden ? (
          <div style={{ color: C.textDim, padding: "40px 0" }}>Lade Pipeline…</div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: 14,
              overflowX: "auto",
              paddingBottom: 12,
            }}
          >
            {PHASEN.map((p) => {
              const karten = proPhase(p.wert);
              const summe = karten.reduce((s, c) => s + (c.wert || 0), 0);
              return (
                <div
                  key={p.wert}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragUeber(p.wert);
                  }}
                  onDragLeave={() => setDragUeber((u) => (u === p.wert ? null : u))}
                  onDrop={() => onDrop(p.wert)}
                  style={{
                    flex: "0 0 260px",
                    minWidth: 260,
                    background:
                      dragUeber === p.wert
                        ? "rgba(255,255,255,0.04)"
                        : C.navy2,
                    border: `1px solid ${
                      dragUeber === p.wert ? p.farbe : C.border
                    }`,
                    borderRadius: 14,
                    padding: 12,
                    transition: "border-color .15s",
                  }}
                >
                  {/* Spaltenkopf */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                      paddingBottom: 10,
                      borderBottom: `2px solid ${p.farbe}`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "Syne, sans-serif",
                        color: p.farbe,
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {p.label}
                    </span>
                    <span style={{ color: C.textDim, fontSize: 12 }}>
                      {karten.length} · {eur(summe)}
                    </span>
                  </div>

                  {/* Karten */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 40 }}>
                    {karten.map((c) => (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setDragUeber(null);
                        }}
                        onClick={() => dialogBearbeiten(c)}
                        style={{
                          background: C.navy,
                          border: `1px solid ${C.border}`,
                          borderLeft: `3px solid ${p.farbe}`,
                          borderRadius: 10,
                          padding: "12px 13px",
                          cursor: "grab",
                          opacity: dragId === c.id ? 0.5 : 1,
                        }}
                      >
                        <div
                          style={{
                            color: "#fff",
                            fontFamily: "Syne, sans-serif",
                            fontSize: 14,
                            fontWeight: 600,
                            marginBottom: 6,
                          }}
                        >
                          {c.titel}
                        </div>
                        {(c.kontakt_id || c.firma_id) && (
                          <div style={{ color: C.textDim, fontSize: 12, marginBottom: 6 }}>
                            {c.kontakt_id && kontaktName[c.kontakt_id]
                              ? kontaktName[c.kontakt_id]
                              : ""}
                            {c.kontakt_id && c.firma_id ? " · " : ""}
                            {c.firma_id && firmaName[c.firma_id]
                              ? firmaName[c.firma_id]
                              : ""}
                          </div>
                        )}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              color: C.gold,
                              fontFamily: "Syne, sans-serif",
                              fontWeight: 700,
                              fontSize: 14,
                            }}
                          >
                            {eur(c.wert)}
                          </span>
                          <span style={{ color: C.textDim, fontSize: 11 }}>
                            {c.wahrscheinlichkeit != null
                              ? `${c.wahrscheinlichkeit}%`
                              : ""}
                            {c.erwartetes_abschlussdatum
                              ? ` · ${datumKurz(c.erwartetes_abschlussdatum)}`
                              : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                    {karten.length === 0 && (
                      <div
                        style={{
                          color: C.textDim,
                          fontSize: 12,
                          textAlign: "center",
                          padding: "14px 0",
                          opacity: 0.6,
                        }}
                      >
                        hierher ziehen
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog */}
      {dialogOffen && (
        <div style={overlay} onClick={() => !speichert && setDialogOffen(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2
              style={{
                fontFamily: "Syne, sans-serif",
                color: C.gold,
                fontSize: 22,
                margin: "0 0 18px",
              }}
            >
              {bearbeite ? "Chance bearbeiten" : "Neue Verkaufschance"}
            </h2>

            <Feld label="Titel *">
              <input
                style={inp}
                value={form.titel}
                onChange={(e) => feld("titel", e.target.value)}
                placeholder="z. B. Angebot Holzernte Frühjahr"
              />
            </Feld>

            <div style={grid2}>
              <Feld label="Kontakt">
                <select
                  style={inp}
                  value={form.kontakt_id}
                  onChange={(e) => kontaktGewaehlt(e.target.value)}
                >
                  <option value="">— keiner —</option>
                  {kontakte.map((k) => (
                    <option key={k.id} value={k.id}>
                      {kName(k)}
                    </option>
                  ))}
                </select>
              </Feld>
              <Feld label="Firma">
                <select
                  style={inp}
                  value={form.firma_id}
                  onChange={(e) => feld("firma_id", e.target.value)}
                >
                  <option value="">— keine —</option>
                  {firmen.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Feld>
              <Feld label="Phase">
                <select style={inp} value={form.phase} onChange={(e) => feld("phase", e.target.value)}>
                  {PHASEN.map((p) => (
                    <option key={p.wert} value={p.wert}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Feld>
              <Feld label="Wert (€)">
                <input
                  style={inp}
                  value={form.wert}
                  onChange={(e) => feld("wert", e.target.value)}
                  placeholder="z. B. 4500"
                />
              </Feld>
              <Feld label="Wahrscheinlichkeit (%)">
                <input
                  style={inp}
                  type="number"
                  min={0}
                  max={100}
                  value={form.wahrscheinlichkeit}
                  onChange={(e) => feld("wahrscheinlichkeit", e.target.value)}
                />
              </Feld>
              <Feld label="Erwartetes Abschlussdatum">
                <input
                  style={inp}
                  type="date"
                  value={form.erwartetes_abschlussdatum}
                  onChange={(e) => feld("erwartetes_abschlussdatum", e.target.value)}
                />
              </Feld>
            </div>

            <Feld label="Notizen">
              <textarea
                style={{ ...inp, minHeight: 70, resize: "vertical" }}
                value={form.notizen}
                onChange={(e) => feld("notizen", e.target.value)}
              />
            </Feld>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 18,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                {bearbeite &&
                  (loeschId === bearbeite.id ? (
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        onClick={() => loeschen(bearbeite.id)}
                        style={{ ...grauBtn, color: C.danger, borderColor: C.danger }}
                      >
                        Wirklich löschen?
                      </button>
                      <button onClick={() => setLoeschId(null)} style={grauBtn}>
                        Abbrechen
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setLoeschId(bearbeite.id)}
                      style={{ ...grauBtn, color: C.textDim }}
                    >
                      Löschen
                    </button>
                  ))}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => setDialogOffen(false)} disabled={speichert} style={grauBtn}>
                  Abbrechen
                </button>
                <button
                  onClick={speichern}
                  disabled={speichert}
                  style={{ ...goldBtn, opacity: speichert ? 0.6 : 1 }}
                >
                  {speichert ? "Speichert…" : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------- Hilfs-Komponenten ---------------------------

function KpiKarte({
  label,
  wert,
  farbe,
}: {
  label: string;
  wert: string;
  farbe: string;
}) {
  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontFamily: "Syne, sans-serif",
          color: farbe,
          fontSize: 24,
          fontWeight: 800,
          lineHeight: 1.1,
        }}
      >
        {wert}
      </div>
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          color: C.textDim,
          fontSize: 13,
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          display: "block",
          fontFamily: "'DM Sans', sans-serif",
          color: C.textDim,
          fontSize: 12,
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// --------------------------- Style-Bausteine ---------------------------

const zurueckBtn: React.CSSProperties = {
  background: "transparent",
  color: C.textDim,
  border: "none",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  cursor: "pointer",
  padding: 0,
};

const goldBtn: React.CSSProperties = {
  background: C.gold,
  color: C.navy,
  border: "none",
  borderRadius: 10,
  padding: "11px 22px",
  fontFamily: "Syne, sans-serif",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const goldBtnGross: React.CSSProperties = {
  ...goldBtn,
  padding: "12px 20px",
  fontSize: 15,
};

const grauBtn: React.CSSProperties = {
  background: "transparent",
  color: C.textDim,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 20px",
  fontFamily: "Syne, sans-serif",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const inp: React.CSSProperties = {
  background: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 13px",
  color: "#fff",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "40px 16px",
  overflowY: "auto",
  zIndex: 1000,
};

const modal: React.CSSProperties = {
  background: C.navy2,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  padding: "26px 26px 22px",
  width: "100%",
  maxWidth: 620,
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0 16px",
};

const fehlerBox: React.CSSProperties = {
  background: "rgba(224,102,102,0.12)",
  border: `1px solid ${C.danger}`,
  color: C.danger,
  borderRadius: 10,
  padding: "12px 16px",
  marginBottom: 16,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
};
