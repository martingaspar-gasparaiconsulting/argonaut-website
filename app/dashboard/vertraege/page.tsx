"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 10 · V2 Verträge-Cockpit
// Modul-Kopf + KPIs + Kündigungsfrist-Ampel + Suche/Filter + CRUD.
// Ampel rechnet auf den Kündigungsstichtag (= ende - kuendigungsfrist_tage).
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
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

const KATEGORIEN = [
  "Miete",
  "Leasing",
  "Versicherung",
  "Wartung",
  "Abo/Lizenz",
  "Lieferant",
  "Sonstige",
];

const INTERVALL_LABEL: Record<string, string> = {
  monatlich: "monatlich",
  quartalsweise: "quartalsweise",
  jaehrlich: "jährlich",
  einmalig: "einmalig",
};
const STATUS_LABEL: Record<string, string> = {
  aktiv: "Aktiv",
  gekuendigt: "Gekündigt",
  beendet: "Beendet",
};

interface Vertrag {
  id: string;
  bezeichnung: string;
  kategorie: string | null;
  vertragspartner: string | null;
  vertragsnummer: string | null;
  beginn: string | null;
  ende: string | null;
  kuendigungsfrist_tage: number;
  auto_verlaengerung: boolean;
  verlaengerung_monate: number;
  kosten_betrag: number | null;
  kosten_intervall: string;
  status: string;
  notizen: string | null;
  created_at: string;
}

type FormState = {
  bezeichnung: string;
  kategorie: string;
  vertragspartner: string;
  vertragsnummer: string;
  beginn: string;
  ende: string;
  kuendigungsfrist_tage: string;
  auto_verlaengerung: boolean;
  verlaengerung_monate: string;
  kosten_betrag: string;
  kosten_intervall: string;
  status: string;
  notizen: string;
};

const LEER_FORM: FormState = {
  bezeichnung: "",
  kategorie: "",
  vertragspartner: "",
  vertragsnummer: "",
  beginn: "",
  ende: "",
  kuendigungsfrist_tage: "",
  auto_verlaengerung: false,
  verlaengerung_monate: "",
  kosten_betrag: "",
  kosten_intervall: "monatlich",
  status: "aktiv",
  notizen: "",
};

function tageBis(datum: string | null): number | null {
  if (!datum) return null;
  const d = new Date(datum);
  if (isNaN(d.getTime())) return null;
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - heute.getTime()) / 86400000);
}

function stichtag(v: Vertrag): string | null {
  if (!v.ende) return null;
  const d = new Date(v.ende);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - (Number(v.kuendigungsfrist_tage) || 0));
  return d.toISOString().slice(0, 10);
}

function fristAmpel(v: Vertrag): { farbe: string; text: string } {
  if (v.status !== "aktiv")
    return { farbe: C.textDim, text: STATUS_LABEL[v.status] ?? v.status };
  if (!v.ende) return { farbe: C.textDim, text: "unbefristet" };
  const t = tageBis(stichtag(v));
  if (t === null) return { farbe: C.textDim, text: "—" };
  if (t < 0) return { farbe: C.danger, text: `Frist verpasst (${-t} T.)` };
  if (t <= 14) return { farbe: C.danger, text: `noch ${t} T.` };
  if (t <= 60) return { farbe: C.warn, text: `noch ${t} T.` };
  return { farbe: C.green, text: `noch ${t} T.` };
}

function monatsKosten(v: Vertrag): number {
  const b = Number(v.kosten_betrag) || 0;
  switch (v.kosten_intervall) {
    case "monatlich":
      return b;
    case "quartalsweise":
      return b / 3;
    case "jaehrlich":
      return b / 12;
    default:
      return 0; // einmalig
  }
}

function eur(n: number | null): string {
  return (Number(n) || 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}
function datum(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE");
}

export default function VertraegeCockpit() {
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [laden, setLaden] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [katFilter, setKatFilter] = useState("");
  const [nurKritisch, setNurKritisch] = useState(false);

  const [modalOffen, setModalOffen] = useState(false);
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(LEER_FORM);
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setUserId(userData.user?.id ?? null);
      await lade();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lade() {
    setLaden(true);
    const { data, error } = await supabase
      .from("vertraege")
      .select("*")
      .order("bezeichnung", { ascending: true });
    if (!error && data) setVertraege(data as Vertrag[]);
    setLaden(false);
  }

  const kategorien = useMemo(() => {
    const s = new Set<string>();
    vertraege.forEach((v) => {
      if (v.kategorie) s.add(v.kategorie);
    });
    return Array.from(s).sort();
  }, [vertraege]);

  function istKritisch(v: Vertrag): boolean {
    if (v.status !== "aktiv" || !v.ende) return false;
    const t = tageBis(stichtag(v));
    return t !== null && t <= 60;
  }

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return vertraege.filter((v) => {
      if (katFilter && v.kategorie !== katFilter) return false;
      if (nurKritisch && !istKritisch(v)) return false;
      if (q) {
        const hay = [v.bezeichnung, v.vertragspartner, v.kategorie, v.vertragsnummer]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vertraege, suche, katFilter, nurKritisch]);

  const kpiGesamt = vertraege.length;
  const kpiKritisch = vertraege.filter(istKritisch).length;
  const kpiMonatskosten = vertraege
    .filter((v) => v.status === "aktiv")
    .reduce((s, v) => s + monatsKosten(v), 0);

  function oeffneNeu() {
    setBearbeiteId(null);
    setForm(LEER_FORM);
    setFehler(null);
    setModalOffen(true);
  }

  function oeffneBearbeiten(v: Vertrag) {
    setBearbeiteId(v.id);
    setForm({
      bezeichnung: v.bezeichnung ?? "",
      kategorie: v.kategorie ?? "",
      vertragspartner: v.vertragspartner ?? "",
      vertragsnummer: v.vertragsnummer ?? "",
      beginn: v.beginn ?? "",
      ende: v.ende ?? "",
      kuendigungsfrist_tage:
        v.kuendigungsfrist_tage != null ? String(v.kuendigungsfrist_tage) : "",
      auto_verlaengerung: v.auto_verlaengerung,
      verlaengerung_monate:
        v.verlaengerung_monate != null ? String(v.verlaengerung_monate) : "",
      kosten_betrag: v.kosten_betrag != null ? String(v.kosten_betrag) : "",
      kosten_intervall: v.kosten_intervall ?? "monatlich",
      status: v.status ?? "aktiv",
      notizen: v.notizen ?? "",
    });
    setFehler(null);
    setModalOffen(true);
  }

  function setF<K extends keyof FormState>(key: K, wert: FormState[K]) {
    setForm((f) => ({ ...f, [key]: wert }));
  }

  async function speichere() {
    if (!form.bezeichnung.trim()) {
      setFehler("Bezeichnung ist ein Pflichtfeld.");
      return;
    }
    setSpeichern(true);
    setFehler(null);
    const intOr0 = (s: string) =>
      s.trim() === "" ? 0 : Math.round(Number(s.replace(",", ".")) || 0);
    const payload = {
      bezeichnung: form.bezeichnung.trim(),
      kategorie: form.kategorie.trim() || null,
      vertragspartner: form.vertragspartner.trim() || null,
      vertragsnummer: form.vertragsnummer.trim() || null,
      beginn: form.beginn || null,
      ende: form.ende || null,
      kuendigungsfrist_tage: intOr0(form.kuendigungsfrist_tage),
      auto_verlaengerung: form.auto_verlaengerung,
      verlaengerung_monate: intOr0(form.verlaengerung_monate),
      kosten_betrag:
        form.kosten_betrag.trim() === ""
          ? 0
          : Number(form.kosten_betrag.replace(",", ".")),
      kosten_intervall: form.kosten_intervall || "monatlich",
      status: form.status || "aktiv",
      notizen: form.notizen.trim() || null,
    };
    let error = null as { message: string } | null;
    if (bearbeiteId) {
      const res = await supabase
        .from("vertraege")
        .update(payload)
        .eq("id", bearbeiteId);
      error = res.error;
    } else {
      const insertObj = userId ? { ...payload, owner_user_id: userId } : payload;
      const res = await supabase.from("vertraege").insert(insertObj);
      error = res.error;
    }
    setSpeichern(false);
    if (error) {
      setFehler("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    setModalOffen(false);
    await lade();
  }

  async function loesche(v: Vertrag) {
    if (!window.confirm(`Vertrag „${v.bezeichnung}" wirklich löschen?`)) return;
    const { error } = await supabase.from("vertraege").delete().eq("id", v.id);
    if (error) {
      window.alert("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    await lade();
  }

  // ---------- Styles ----------
  const card: React.CSSProperties = {
    background: C.navy2,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: "18px 20px",
  };
  const inputStil: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: 14,
    boxSizing: "border-box",
  };
  const labelStil: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    color: C.textDim,
    marginBottom: 6,
    fontWeight: 600,
  };
  const btnGold: React.CSSProperties = {
    padding: "10px 18px",
    borderRadius: 8,
    border: "none",
    background: C.gold,
    color: C.navy,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const btnGhost: React.CSSProperties = {
    padding: "9px 14px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
  };
  const thStil: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: C.textDim,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  };
  const tdStil: React.CSSProperties = {
    padding: "12px",
    fontSize: 14,
    color: "#fff",
    borderBottom: `1px solid ${C.border}`,
    verticalAlign: "middle",
  };

  return (
    <div style={{ color: "#fff", maxWidth: 1400, margin: "0 auto", paddingTop: 28 }}>
      {/* Modul-Kopf */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 22,
        }}
      >
        <div style={{ maxWidth: 760 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 800,
              color: C.gold,
              letterSpacing: "-0.01em",
            }}
          >
            📑 Verträge &amp; Fristen
          </h1>
          <p style={{ margin: "8px 0 0", color: C.textDim, fontSize: 15 }}>
            Alle Verträge mit Laufzeit und Kündigungsfrist an einem Ort. Die Ampel
            warnt rechtzeitig vor dem Kündigungsstichtag — damit sich nichts
            ungewollt (und teuer) automatisch verlängert.
          </p>
        </div>
        <button style={btnGold} onClick={oeffneNeu}>
          + Vertrag anlegen
        </button>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Verträge gesamt
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
            {kpiGesamt}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Kündigung fällig (≤ 60 T.)
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 4,
              color: kpiKritisch > 0 ? C.warn : C.green,
            }}
          >
            {kpiKritisch}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Laufende Kosten / Monat
          </div>
          <div
            style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: C.gold }}
          >
            {eur(kpiMonatskosten)}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <input
          style={{ ...inputStil, maxWidth: 320 }}
          placeholder="Suche: Bezeichnung, Partner, Kategorie, Nr.…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
        <select
          style={{ ...inputStil, maxWidth: 220 }}
          value={katFilter}
          onChange={(e) => setKatFilter(e.target.value)}
        >
          <option value="">Alle Kategorien</option>
          {kategorien.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: C.textDim,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={nurKritisch}
            onChange={(e) => setNurKritisch(e.target.checked)}
          />
          Nur fristkritische
        </label>
      </div>

      {/* Tabelle */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        {laden ? (
          <div style={{ padding: 30, color: C.textDim }}>Lade Verträge…</div>
        ) : gefiltert.length === 0 ? (
          <div style={{ padding: 30, color: C.textDim }}>
            {vertraege.length === 0
              ? "Noch keine Verträge angelegt. Lege oben rechts deinen ersten Vertrag an."
              : "Keine Verträge für diese Filter gefunden."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={thStil}></th>
                <th style={thStil}>Vertrag</th>
                <th style={thStil}>Kategorie</th>
                <th style={{ ...thStil, textAlign: "right" }}>Kosten</th>
                <th style={thStil}>Ende</th>
                <th style={thStil}>Kündigen bis</th>
                <th style={{ ...thStil, textAlign: "right" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((v) => {
                const am = fristAmpel(v);
                const st = stichtag(v);
                return (
                  <tr key={v.id}>
                    <td style={{ ...tdStil, width: 14 }}>
                      <span
                        title={am.text}
                        style={{
                          display: "inline-block",
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: am.farbe,
                          boxShadow: `0 0 8px ${am.farbe}`,
                        }}
                      />
                    </td>
                    <td style={tdStil}>
                      <div style={{ fontWeight: 600 }}>
                        {v.bezeichnung}
                        {v.auto_verlaengerung && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 11,
                              color: C.warn,
                              border: `1px solid ${C.warn}55`,
                              borderRadius: 6,
                              padding: "1px 6px",
                            }}
                            title="verlängert sich automatisch"
                          >
                            ↻ auto
                          </span>
                        )}
                      </div>
                      {v.vertragspartner && (
                        <div style={{ fontSize: 12, color: C.textDim }}>
                          {v.vertragspartner}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStil, color: C.textDim }}>
                      {v.kategorie || "—"}
                    </td>
                    <td style={{ ...tdStil, textAlign: "right", whiteSpace: "nowrap" }}>
                      {eur(v.kosten_betrag)}
                      <div style={{ fontSize: 11, color: C.textDim }}>
                        {INTERVALL_LABEL[v.kosten_intervall] ?? v.kosten_intervall}
                      </div>
                    </td>
                    <td style={{ ...tdStil, color: C.textDim }}>
                      {datum(v.ende)}
                    </td>
                    <td style={tdStil}>
                      <div style={{ color: am.farbe, fontWeight: 700 }}>
                        {datum(st)}
                      </div>
                      <div style={{ fontSize: 11, color: am.farbe }}>{am.text}</div>
                    </td>
                    <td style={{ ...tdStil, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        style={{ ...btnGhost, marginRight: 6 }}
                        onClick={() => oeffneBearbeiten(v)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        style={{
                          ...btnGhost,
                          color: C.danger,
                          borderColor: "rgba(224,102,102,0.4)",
                        }}
                        onClick={() => loesche(v)}
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalOffen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "40px 16px",
            zIndex: 1000,
            overflowY: "auto",
          }}
          onClick={() => setModalOffen(false)}
        >
          <div
            style={{ ...card, width: "100%", maxWidth: 580, background: C.navy }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 800 }}>
              {bearbeiteId ? "Vertrag bearbeiten" : "Neuer Vertrag"}
            </h2>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Bezeichnung *</label>
                <input
                  style={inputStil}
                  value={form.bezeichnung}
                  onChange={(e) => setF("bezeichnung", e.target.value)}
                  placeholder="z.B. Leasing Harvester John Deere"
                />
              </div>
              <div>
                <label style={labelStil}>Kategorie</label>
                <select
                  style={inputStil}
                  value={form.kategorie}
                  onChange={(e) => setF("kategorie", e.target.value)}
                >
                  <option value="">— wählen —</option>
                  {KATEGORIEN.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStil}>Vertragspartner</label>
                <input
                  style={inputStil}
                  value={form.vertragspartner}
                  onChange={(e) => setF("vertragspartner", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Vertragsnummer</label>
                <input
                  style={inputStil}
                  value={form.vertragsnummer}
                  onChange={(e) => setF("vertragsnummer", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Status</label>
                <select
                  style={inputStil}
                  value={form.status}
                  onChange={(e) => setF("status", e.target.value)}
                >
                  <option value="aktiv">Aktiv</option>
                  <option value="gekuendigt">Gekündigt</option>
                  <option value="beendet">Beendet</option>
                </select>
              </div>
              <div>
                <label style={labelStil}>Beginn</label>
                <input
                  type="date"
                  style={inputStil}
                  value={form.beginn}
                  onChange={(e) => setF("beginn", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Ende (leer = unbefristet)</label>
                <input
                  type="date"
                  style={inputStil}
                  value={form.ende}
                  onChange={(e) => setF("ende", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Kündigungsfrist (Tage vor Ende)</label>
                <input
                  style={inputStil}
                  value={form.kuendigungsfrist_tage}
                  onChange={(e) => setF("kuendigungsfrist_tage", e.target.value)}
                  inputMode="numeric"
                  placeholder="z.B. 90"
                />
              </div>
              <div>
                <label style={labelStil}>Kosten (€)</label>
                <input
                  style={inputStil}
                  value={form.kosten_betrag}
                  onChange={(e) => setF("kosten_betrag", e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label style={labelStil}>Zahlungsintervall</label>
                <select
                  style={inputStil}
                  value={form.kosten_intervall}
                  onChange={(e) => setF("kosten_intervall", e.target.value)}
                >
                  <option value="monatlich">monatlich</option>
                  <option value="quartalsweise">quartalsweise</option>
                  <option value="jaehrlich">jährlich</option>
                  <option value="einmalig">einmalig</option>
                </select>
              </div>

              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 14,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.auto_verlaengerung}
                    onChange={(e) => setF("auto_verlaengerung", e.target.checked)}
                  />
                  Verlängert sich automatisch
                </label>
                {form.auto_verlaengerung && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: C.textDim }}>um</span>
                    <input
                      style={{ ...inputStil, width: 80 }}
                      value={form.verlaengerung_monate}
                      onChange={(e) =>
                        setF("verlaengerung_monate", e.target.value)
                      }
                      inputMode="numeric"
                      placeholder="12"
                    />
                    <span style={{ fontSize: 13, color: C.textDim }}>Monate</span>
                  </div>
                )}
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Notizen</label>
                <textarea
                  style={{ ...inputStil, minHeight: 70, resize: "vertical" }}
                  value={form.notizen}
                  onChange={(e) => setF("notizen", e.target.value)}
                />
              </div>
            </div>

            {fehler && (
              <div
                style={{
                  marginTop: 14,
                  color: C.danger,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {fehler}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 20,
              }}
            >
              <button style={btnGhost} onClick={() => setModalOffen(false)}>
                Abbrechen
              </button>
              <button
                style={{ ...btnGold, opacity: speichern ? 0.6 : 1 }}
                onClick={speichere}
                disabled={speichern}
              >
                {speichern ? "Speichere…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
