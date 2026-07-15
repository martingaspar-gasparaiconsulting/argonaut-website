"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 10 · V3 Vertrag-Detailseite
// Eckdaten · Kosten · Fristen (Ampel + Kündigungsstichtag) · Notizen.
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
  if (t <= 14) return { farbe: C.danger, text: `noch ${t} Tage` };
  if (t <= 60) return { farbe: C.warn, text: `noch ${t} Tage` };
  return { farbe: C.green, text: `noch ${t} Tage` };
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
      return 0;
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

export default function VertragDetail() {
  const params = useParams();
  const vertragId = Array.isArray(params.id)
    ? params.id[0]
    : (params.id as string);

  const [vertrag, setVertrag] = useState<Vertrag | null>(null);
  const [laden, setLaden] = useState(true);

  const [modalOffen, setModalOffen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // KI-Kündigungsentwurf
  const [kiOffen, setKiOffen] = useState(false);
  const [kiLaden, setKiLaden] = useState(false);
  const [kiText, setKiText] = useState("");
  const [kiFehler, setKiFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    lade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertragId]);

  async function lade() {
    setLaden(true);
    const { data } = await supabase
      .from("vertraege")
      .select("*")
      .eq("id", vertragId)
      .maybeSingle();
    setVertrag((data as Vertrag) ?? null);
    setLaden(false);
  }

  function oeffneBearbeiten() {
    if (!vertrag) return;
    setForm({
      bezeichnung: vertrag.bezeichnung ?? "",
      kategorie: vertrag.kategorie ?? "",
      vertragspartner: vertrag.vertragspartner ?? "",
      vertragsnummer: vertrag.vertragsnummer ?? "",
      beginn: vertrag.beginn ?? "",
      ende: vertrag.ende ?? "",
      kuendigungsfrist_tage:
        vertrag.kuendigungsfrist_tage != null
          ? String(vertrag.kuendigungsfrist_tage)
          : "",
      auto_verlaengerung: vertrag.auto_verlaengerung,
      verlaengerung_monate:
        vertrag.verlaengerung_monate != null
          ? String(vertrag.verlaengerung_monate)
          : "",
      kosten_betrag:
        vertrag.kosten_betrag != null ? String(vertrag.kosten_betrag) : "",
      kosten_intervall: vertrag.kosten_intervall ?? "monatlich",
      status: vertrag.status ?? "aktiv",
      notizen: vertrag.notizen ?? "",
    });
    setFehler(null);
    setModalOffen(true);
  }

  function setF<K extends keyof FormState>(key: K, wert: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: wert } : f));
  }

  async function speichere() {
    if (!form || !vertrag) return;
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
    const { error } = await supabase
      .from("vertraege")
      .update(payload)
      .eq("id", vertrag.id);
    setSpeichern(false);
    if (error) {
      setFehler("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    setModalOffen(false);
    await lade();
  }

  async function loesche() {
    if (!vertrag) return;
    if (!window.confirm(`Vertrag „${vertrag.bezeichnung}" wirklich löschen?`))
      return;
    const { error } = await supabase
      .from("vertraege")
      .delete()
      .eq("id", vertrag.id);
    if (error) {
      window.alert("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    window.location.href = "/dashboard/vertraege";
  }

  async function erstelleKuendigung() {
    if (!vertrag) return;
    setKiOffen(true);
    setKiLaden(true);
    setKiText("");
    setKiFehler(null);
    setKopiert(false);
    try {
      const res = await fetch("/api/vertrag-kuendigung", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vertrag: {
            bezeichnung: vertrag.bezeichnung,
            kategorie: vertrag.kategorie,
            vertragspartner: vertrag.vertragspartner,
            vertragsnummer: vertrag.vertragsnummer,
            ende: vertrag.ende,
            kuendigungsfrist_tage: vertrag.kuendigungsfrist_tage,
            kuendigungstermin: stichtag(vertrag),
          },
        }),
      });
      const j = await res.json();
      if (j?.fehler) setKiFehler(j.fehler);
      else setKiText(j?.text ?? "");
    } catch {
      setKiFehler("Verbindungsfehler. Bitte erneut versuchen.");
    }
    setKiLaden(false);
  }

  async function kopiereText() {
    try {
      await navigator.clipboard.writeText(kiText);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      setKopiert(false);
    }
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
    fontSize: 'clamp(14px, 1.25vw, 20px)',
    boxSizing: "border-box",
  };
  const labelStil: React.CSSProperties = {
    display: "block",
    fontSize: 'clamp(12px, 1.06vw, 17px)',
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
    fontSize: 'clamp(14px, 1.25vw, 20px)',
    cursor: "pointer",
  };
  const btnGhost: React.CSSProperties = {
    padding: "9px 14px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    fontSize: 'clamp(13px, 1.13vw, 18px)',
    cursor: "pointer",
  };
  const infoZeile = (
    label: string,
    wert: React.ReactNode
  ): React.ReactElement => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <span style={{ color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>{label}</span>
      <span style={{ fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 600, textAlign: "right" }}>
        {wert}
      </span>
    </div>
  );

  if (laden) {
    return <div style={{ color: C.textDim, padding: 30 }}>Lade Vertrag…</div>;
  }
  if (!vertrag) {
    return (
      <div style={{ color: "#fff", maxWidth: 700, margin: "0 auto", paddingTop: 28 }}>
        <a href="/dashboard/vertraege" style={{ color: C.cyan, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
          ← Zurück zu Verträge
        </a>
        <div style={{ ...card, marginTop: 16, color: C.textDim }}>
          Vertrag nicht gefunden.
        </div>
      </div>
    );
  }

  const am = fristAmpel(vertrag);
  const st = stichtag(vertrag);

  return (
    <div style={{ color: "#fff", maxWidth: 1000, margin: "0 auto", paddingTop: 28 }}>
      <a href="/dashboard/vertraege" style={{ color: C.cyan, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
        ← Zurück zu Verträge
      </a>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
          margin: "14px 0 20px",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(26px, 2.25vw, 36px)',
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              title={am.text}
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: am.farbe,
                boxShadow: `0 0 10px ${am.farbe}`,
              }}
            />
            {vertrag.bezeichnung}
          </h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
            {vertrag.kategorie || "Ohne Kategorie"}
            {vertrag.vertragspartner ? ` · ${vertrag.vertragspartner}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            style={{
              padding: "9px 14px",
              borderRadius: 8,
              border: `1px solid ${C.gold}`,
              background: "rgba(201,168,76,0.12)",
              color: C.gold,
              fontWeight: 700,
              fontSize: 'clamp(13px, 1.13vw, 18px)',
              cursor: "pointer",
            }}
            onClick={erstelleKuendigung}
          >
            🤖 Kündigung entwerfen
          </button>
          <button style={btnGhost} onClick={oeffneBearbeiten}>
            Bearbeiten
          </button>
          <button
            style={{
              ...btnGhost,
              color: C.danger,
              borderColor: "rgba(224,102,102,0.4)",
            }}
            onClick={loesche}
          >
            Löschen
          </button>
        </div>
      </div>

      {/* Fristen-Banner */}
      <div
        style={{
          ...card,
          marginBottom: 16,
          borderColor: `${am.farbe}55`,
          background: `${am.farbe}12`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, fontWeight: 600 }}>
            Spätester Kündigungstermin
          </div>
          <div style={{ fontSize: 'clamp(24px, 2.13vw, 34px)', fontWeight: 800, color: am.farbe }}>
            {datum(st)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.textDim, fontWeight: 600 }}>
            Status der Frist
          </div>
          <div style={{ fontSize: 'clamp(18px, 1.56vw, 25px)', fontWeight: 800, color: am.farbe }}>
            {am.text}
          </div>
          {vertrag.auto_verlaengerung && (
            <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: C.warn, marginTop: 2 }}>
              ↻ verlängert sich automatisch
              {vertrag.verlaengerung_monate
                ? ` um ${vertrag.verlaengerung_monate} Monate`
                : ""}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Eckdaten */}
        <div style={card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 'clamp(16px, 1.38vw, 22px)' }}>Eckdaten</h3>
          {infoZeile("Status", STATUS_LABEL[vertrag.status] ?? vertrag.status)}
          {infoZeile("Vertragspartner", vertrag.vertragspartner || "—")}
          {infoZeile("Vertragsnummer", vertrag.vertragsnummer || "—")}
          {infoZeile("Beginn", datum(vertrag.beginn))}
          {infoZeile("Ende", vertrag.ende ? datum(vertrag.ende) : "unbefristet")}
          {infoZeile(
            "Kündigungsfrist",
            `${vertrag.kuendigungsfrist_tage || 0} Tage vor Ende`
          )}
        </div>

        {/* Kosten */}
        <div style={card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 'clamp(16px, 1.38vw, 22px)' }}>Kosten</h3>
          {infoZeile(
            "Betrag",
            `${eur(vertrag.kosten_betrag)} ${
              INTERVALL_LABEL[vertrag.kosten_intervall] ??
              vertrag.kosten_intervall
            }`
          )}
          {infoZeile(
            "Umgerechnet / Monat",
            <span style={{ color: C.gold }}>{eur(monatsKosten(vertrag))}</span>
          )}
          {infoZeile(
            "Umgerechnet / Jahr",
            <span style={{ color: C.gold }}>
              {eur(monatsKosten(vertrag) * 12)}
            </span>
          )}
        </div>
      </div>

      {/* Notizen */}
      <div style={card}>
        <h3 style={{ margin: "0 0 10px", fontSize: 'clamp(16px, 1.38vw, 22px)' }}>Notizen</h3>
        <div
          style={{
            fontSize: 'clamp(14px, 1.25vw, 20px)',
            lineHeight: 1.6,
            color: vertrag.notizen ? "#fff" : C.textDim,
            whiteSpace: "pre-wrap",
          }}
        >
          {vertrag.notizen || "Keine Notizen hinterlegt."}
        </div>
      </div>

      {/* KI-Kündigungsentwurf-Modal */}
      {kiOffen && (
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
          onClick={() => setKiOffen(false)}
        >
          <div
            style={{ ...card, width: "100%", maxWidth: 680, background: C.navy }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 800 }}>
              🤖 Kündigungsschreiben-Entwurf
            </h2>
            <p style={{ margin: "0 0 16px", color: C.textDim, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
              Vorschlag der ARGONAUT-KI. Bitte die Platzhalter in eckigen Klammern
              [ ] ausfüllen, prüfen und selbst versenden. Kein automatischer
              Versand, keine Rechtsberatung.
            </p>

            {kiLaden ? (
              <div style={{ padding: "24px 0", color: C.textDim }}>
                Die ARGONAUT-KI formuliert deinen Entwurf…
              </div>
            ) : kiFehler ? (
              <div
                style={{ color: C.danger, fontSize: 'clamp(14px, 1.25vw, 20px)', fontWeight: 600, padding: "12px 0" }}
              >
                {kiFehler}
              </div>
            ) : (
              <>
                <textarea
                  style={{
                    width: "100%",
                    minHeight: 320,
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: `1px solid ${C.border}`,
                    background: "rgba(255,255,255,0.04)",
                    color: "#fff",
                    fontSize: 'clamp(14px, 1.25vw, 20px)',
                    lineHeight: 1.6,
                    resize: "vertical",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                  value={kiText}
                  onChange={(e) => setKiText(e.target.value)}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    marginTop: 14,
                  }}
                >
                  <button style={btnGhost} onClick={() => setKiOffen(false)}>
                    Schließen
                  </button>
                  <button style={btnGold} onClick={kopiereText}>
                    {kopiert ? "✓ Kopiert!" : "In Zwischenablage kopieren"}
                  </button>
                </div>
              </>
            )}

            {(kiLaden || kiFehler) && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 14,
                }}
              >
                <button style={btnGhost} onClick={() => setKiOffen(false)}>
                  Schließen
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bearbeiten-Modal */}
      {modalOffen && form && (
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
            <h2 style={{ margin: "0 0 16px", fontSize: 'clamp(20px, 1.75vw, 28px)', fontWeight: 800 }}>
              Vertrag bearbeiten
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
                    fontSize: 'clamp(14px, 1.25vw, 20px)',
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
                    <span style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.textDim }}>um</span>
                    <input
                      style={{ ...inputStil, width: 80 }}
                      value={form.verlaengerung_monate}
                      onChange={(e) =>
                        setF("verlaengerung_monate", e.target.value)
                      }
                      inputMode="numeric"
                      placeholder="12"
                    />
                    <span style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: C.textDim }}>Monate</span>
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
                  fontSize: 'clamp(13px, 1.13vw, 18px)',
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
