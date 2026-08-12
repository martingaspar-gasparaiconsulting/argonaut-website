"use client";

// ============================================================
// ARGONAUT OS · Modul Termine · Anlege-Cockpit
// Termine anlegen, sehen, löschen. Einfach zeigt nur Wer/Wann/Titel,
// Voll ergänzt Ende, Ort, Erinnerung, Ressource, Notiz.
// Route: /dashboard/termine   ·   Tabelle: termine
// ============================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { leseStandortCookie } from "@/lib/aktiverStandort";
import { konkreterStandort, standortOrFilter } from "@/lib/standortDaten";
import { NurVoll } from "../_components/Ansicht";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  green: "#4CAF7D",
  danger: "#E06666",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

type Termin = {
  id: string;
  titel: string | null;
  beginn_am: string | null;
  ende_am: string | null;
  ort: string | null;
  status: string | null;
  kunde_email: string | null;
  notiz: string | null;
  erinnerung_min: number | null;
  ressource: string | null;
};

const ERINNERUNGEN: { wert: string; label: string }[] = [
  { wert: "", label: "Keine Erinnerung" },
  { wert: "10", label: "10 Minuten vorher" },
  { wert: "30", label: "30 Minuten vorher" },
  { wert: "60", label: "1 Stunde vorher" },
  { wert: "1440", label: "1 Tag vorher" },
];

function fmtDatum(iso: string | null): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function fmtZeit(iso: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function jetztLokalInput(): string {
  // liefert "YYYY-MM-DDTHH:mm" für <input type="datetime-local">, auf die nächste volle Stunde
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function TermineCockpit() {
  const [uid, setUid] = useState<string | null>(null);
  const [termine, setTermine] = useState<Termin[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [modalOffen, setModalOffen] = useState(false);
  const [speichern, setSpeichern] = useState(false);

  const [titel, setTitel] = useState("");
  const [beginn, setBeginn] = useState(jetztLokalInput());
  const [wer, setWer] = useState("");
  const [ende, setEnde] = useState("");
  const [ort, setOrt] = useState("");
  const [erinnerung, setErinnerung] = useState("");
  const [ressource, setRessource] = useState("");
  const [notiz, setNotiz] = useState("");

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const sid = konkreterStandort(leseStandortCookie());
      let q = supabase
        .from("termine")
        .select(
          "id, titel, beginn_am, ende_am, ort, status, kunde_email, notiz, erinnerung_min, ressource"
        );
      if (sid) q = q.or(standortOrFilter(sid));
      const { data, error } = await q.order("beginn_am", { ascending: true });
      if (error) throw error;
      setTermine((data as unknown as Termin[]) ?? []);
    } catch (e: unknown) {
      setFehler("Termine laden fehlgeschlagen: " + (e instanceof Error ? e.message : "Fehler"));
      setTermine([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUid(data?.user?.id ?? null);
      await laden();
    })();
  }, [laden]);

  function reset() {
    setTitel("");
    setBeginn(jetztLokalInput());
    setWer("");
    setEnde("");
    setOrt("");
    setErinnerung("");
    setRessource("");
    setNotiz("");
  }

  async function anlegen() {
    if (!titel.trim() || !beginn) return;
    setSpeichern(true);
    setFehler(null);
    setOk(null);
    try {
      const payload = {
        owner_user_id: uid,
        titel: titel.trim(),
        beginn_am: new Date(beginn).toISOString(),
        ende_am: ende ? new Date(ende).toISOString() : null,
        ort: ort.trim() || null,
        status: "geplant",
        kunde_email: wer.trim() || null,
        notiz: notiz.trim() || null,
        erinnerung_min: erinnerung ? Number(erinnerung) : null,
        ressource: ressource.trim() || null,
        standort_id: konkreterStandort(leseStandortCookie()),
      };
      const { error } = await supabase.from("termine").insert(payload);
      if (error) throw error;
      setOk("Termin angelegt.");
      setModalOffen(false);
      reset();
      await laden();
    } catch (e: unknown) {
      setFehler("Termin anlegen: " + (e instanceof Error ? e.message : "Fehler"));
    } finally {
      setSpeichern(false);
    }
  }

  async function loeschen(t: Termin) {
    if (typeof window !== "undefined" && !window.confirm(`Termin „${t.titel || "ohne Titel"}" löschen?`)) return;
    try {
      const { error } = await supabase.from("termine").delete().eq("id", t.id);
      if (error) throw error;
      setTermine((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e: unknown) {
      setFehler("Löschen fehlgeschlagen: " + (e instanceof Error ? e.message : "Fehler"));
    }
  }

  const { kommend, vergangen } = useMemo(() => {
    const now = Date.now();
    const kommend: Termin[] = [];
    const vergangen: Termin[] = [];
    for (const t of termine) {
      const ts = t.beginn_am ? new Date(t.beginn_am).getTime() : 0;
      if (ts >= now) kommend.push(t);
      else vergangen.push(t);
    }
    vergangen.reverse(); // jüngste vergangene zuerst
    return { kommend, vergangen };
  }, [termine]);

  const kpi = useMemo(() => {
    const now = new Date();
    const heuteStr = now.toDateString();
    const in7 = now.getTime() + 7 * 24 * 3600 * 1000;
    let heute = 0;
    let woche = 0;
    for (const t of kommend) {
      if (!t.beginn_am) continue;
      const dt = new Date(t.beginn_am);
      if (dt.toDateString() === heuteStr) heute++;
      if (dt.getTime() <= in7) woche++;
    }
    return { heute, woche, kommend: kommend.length };
  }, [kommend]);

  return (
    <div style={{ color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-dm-sans), sans-serif",
              fontSize: "clamp(30px, 2.63vw, 42px)",
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.5px",
            }}
          >
            🗓 Termine
          </h1>
          <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: "clamp(14px, 1.25vw, 20px)" }}>
            Termine anlegen und im Blick behalten — Kundenbesuche, Anrufe, Einsätze.
          </p>
        </div>
        <button
          onClick={() => {
            reset();
            setModalOffen(true);
          }}
          style={{
            background: C.gold,
            color: C.navy,
            border: "none",
            borderRadius: 10,
            padding: "12px 20px",
            fontSize: "clamp(15px, 1.31vw, 21px)",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          + Neuer Termin
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <KpiKarte label="Heute" wert={String(kpi.heute)} hint="Termine heute" farbe={C.cyan} />
        <KpiKarte label="Diese Woche" wert={String(kpi.woche)} hint="in den nächsten 7 Tagen" farbe={C.green} />
        <KpiKarte label="Kommende" wert={String(kpi.kommend)} hint="alle bevorstehenden" farbe={C.gold} />
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
            fontSize: "clamp(14px, 1.25vw, 20px)",
          }}
        >
          ⚠️ {fehler}
        </div>
      )}
      {ok && (
        <div
          style={{
            background: "rgba(76,175,125,0.12)",
            border: `1px solid ${C.green}`,
            borderRadius: 10,
            padding: "12px 16px",
            color: C.green,
            marginBottom: 18,
            fontSize: "clamp(14px, 1.25vw, 20px)",
          }}
        >
          ✅ {ok}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: C.textDim }}>ARGONAUT lädt die Termine…</div>
      ) : termine.length === 0 ? (
        <div
          style={{
            background: C.navy2,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: 48,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "clamp(40px, 3.5vw, 56px)", marginBottom: 12 }}>🗓</div>
          <div style={{ color: C.textDim, fontSize: "clamp(15px, 1.31vw, 21px)" }}>
            Noch keine Termine. Leg oben rechts deinen ersten an.
          </div>
        </div>
      ) : (
        <>
          <TerminListe titel="Kommende Termine" liste={kommend} onDelete={loeschen} leer="Keine bevorstehenden Termine." />
          {vergangen.length > 0 && (
            <TerminListe titel="Vergangen" liste={vergangen} onDelete={loeschen} leer="" gedimmt />
          )}
        </>
      )}

      {/* Modal: Neuer Termin */}
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
              maxWidth: 480,
              maxHeight: "88vh",
              overflowY: "auto",
            }}
          >
            <h2 style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: "clamp(20px, 1.75vw, 28px)", fontWeight: 700, margin: "0 0 4px" }}>
              Neuer Termin
            </h2>
            <p style={{ color: C.textDim, fontSize: "clamp(13px, 1.13vw, 18px)", margin: "0 0 20px" }}>
              Titel und Zeit reichen — den Rest findest du im Voll-Modus.
            </p>

            <label style={labelStyle}>Titel *</label>
            <input
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="z. B. Besichtigung Baustelle Müller"
              autoFocus
              style={inputStyle}
            />

            <label style={labelStyle}>Beginn *</label>
            <input type="datetime-local" value={beginn} onChange={(e) => setBeginn(e.target.value)} style={inputStyle} />

            <label style={labelStyle}>Mit wem (Kunden-E-Mail, optional)</label>
            <input
              value={wer}
              onChange={(e) => setWer(e.target.value)}
              placeholder="kunde@firma.de"
              inputMode="email"
              style={inputStyle}
            />

            <NurVoll>
              <label style={labelStyle}>Ende</label>
              <input type="datetime-local" value={ende} onChange={(e) => setEnde(e.target.value)} style={inputStyle} />

              <label style={labelStyle}>Ort</label>
              <input value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="z. B. Baustelle Nord / per Telefon" style={inputStyle} />

              <label style={labelStyle}>Erinnerung</label>
              <select value={erinnerung} onChange={(e) => setErinnerung(e.target.value)} style={inputStyle}>
                {ERINNERUNGEN.map((e2) => (
                  <option key={e2.wert} value={e2.wert} style={{ background: C.navy2 }}>
                    {e2.label}
                  </option>
                ))}
              </select>

              <label style={labelStyle}>Ressource (Mitarbeiter/Fahrzeug)</label>
              <input value={ressource} onChange={(e) => setRessource(e.target.value)} placeholder="z. B. Team A / Transporter" style={inputStyle} />

              <label style={labelStyle}>Notiz</label>
              <input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Interne Notiz" style={inputStyle} />
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
                  fontSize: "clamp(14px, 1.25vw, 20px)",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={anlegen}
                disabled={!titel.trim() || !beginn || speichern}
                style={{
                  background: !titel.trim() || !beginn || speichern ? C.border : C.gold,
                  color: !titel.trim() || !beginn || speichern ? C.textDim : C.navy,
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 20px",
                  fontSize: "clamp(14px, 1.25vw, 20px)",
                  fontWeight: 700,
                  cursor: !titel.trim() || !beginn || speichern ? "not-allowed" : "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {speichern ? "Speichert…" : "Termin anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TerminListe({
  titel,
  liste,
  onDelete,
  leer,
  gedimmt,
}: {
  titel: string;
  liste: Termin[];
  onDelete: (t: Termin) => void;
  leer: string;
  gedimmt?: boolean;
}) {
  return (
    <div style={{ marginBottom: 22, opacity: gedimmt ? 0.7 : 1 }}>
      <div
        style={{
          color: C.textDim,
          fontSize: "clamp(12px, 1.06vw, 17px)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          margin: "0 2px 10px",
        }}
      >
        {titel}
      </div>
      {liste.length === 0 ? (
        leer ? <p style={{ color: C.textDim, fontSize: "clamp(14px, 1.25vw, 20px)", margin: "0 2px" }}>{leer}</p> : null
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {liste.map((t) => (
            <div
              key={t.id}
              style={{
                background: C.navy2,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex",
                gap: 14,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  flex: "0 0 auto",
                  textAlign: "center",
                  minWidth: 68,
                  borderRight: `1px solid ${C.border}`,
                  paddingRight: 12,
                }}
              >
                <div style={{ color: C.cyan, fontWeight: 700, fontSize: "clamp(14px, 1.25vw, 20px)" }}>{fmtZeit(t.beginn_am) || "—"}</div>
                <div style={{ color: C.textDim, fontSize: "clamp(11.5px, 1vw, 16px)" }}>{fmtDatum(t.beginn_am)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "clamp(15px, 1.31vw, 21px)", fontWeight: 600 }}>{t.titel || "Ohne Titel"}</div>
                <div style={{ color: C.textDim, fontSize: "clamp(12.5px, 1.13vw, 18px)", marginTop: 2 }}>
                  {[t.ort, t.ressource, t.kunde_email].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <button
                onClick={() => onDelete(t)}
                title="Löschen"
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.textDim,
                  cursor: "pointer",
                  fontSize: "clamp(16px, 1.38vw, 22px)",
                  padding: 4,
                  flex: "0 0 auto",
                }}
              >
                🗑
              </button>
            </div>
          ))}
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
      <div style={{ color: C.textDim, fontSize: "clamp(12.5px, 1.13vw, 18px)", fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontFamily: "var(--font-dm-sans), sans-serif",
          fontSize: "clamp(26px, 2.25vw, 36px)",
          fontWeight: 700,
          margin: "6px 0 2px",
          color: farbe,
        }}
      >
        {wert}
      </div>
      <div style={{ color: C.textDim, fontSize: "clamp(11.5px, 1vw, 16px)" }}>{hint}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  color: C.textDim,
  fontSize: "clamp(13px, 1.13vw, 18px)",
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
  fontSize: "clamp(14px, 1.25vw, 20px)",
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};
