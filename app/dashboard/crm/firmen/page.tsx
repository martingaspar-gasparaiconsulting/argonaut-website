"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · MODUL 4 VERTRIEB+CRM · C6a Firmen-Liste
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

interface Firma {
  id: string;
  name: string;
  branche: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  website: string | null;
  telefon: string | null;
  email: string | null;
  notizen: string | null;
  updated_at: string | null;
}

interface FormState {
  name: string;
  branche: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  website: string;
  telefon: string;
  email: string;
  notizen: string;
}

const LEER_FORM: FormState = {
  name: "",
  branche: "",
  strasse: "",
  plz: "",
  ort: "",
  land: "Deutschland",
  website: "",
  telefon: "",
  email: "",
  notizen: "",
};

function webUrl(w: string): string {
  if (!w) return "";
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

export default function FirmenListePage() {
  const router = useRouter();

  const [firmen, setFirmen] = useState<Firma[]>([]);
  const [kontaktCount, setKontaktCount] = useState<Record<string, number>>({});
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState("");

  const [dialogOffen, setDialogOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<Firma | null>(null);
  const [form, setForm] = useState<FormState>(LEER_FORM);
  const [speichert, setSpeichert] = useState(false);
  const [loeschId, setLoeschId] = useState<string | null>(null);

  async function laden_() {
    setLaden(true);
    setFehler(null);

    const { data, error } = await supabase
      .from("firmen")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      setFehler(error.message);
      setFirmen([]);
      setLaden(false);
      return;
    }
    setFirmen((data as Firma[]) || []);

    const { data: kdata } = await supabase
      .from("kontakte")
      .select("firma_id");
    const map: Record<string, number> = {};
    ((kdata as { firma_id: string | null }[]) || []).forEach((k) => {
      if (k.firma_id) map[k.firma_id] = (map[k.firma_id] || 0) + 1;
    });
    setKontaktCount(map);

    setLaden(false);
  }

  useEffect(() => {
    laden_();
  }, []);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return firmen;
    return firmen.filter((f) =>
      [f.name, f.branche, f.ort, f.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [firmen, suche]);

  function dialogNeu() {
    setBearbeite(null);
    setForm(LEER_FORM);
    setDialogOffen(true);
  }

  function dialogBearbeiten(f: Firma) {
    setBearbeite(f);
    setForm({
      name: f.name || "",
      branche: f.branche || "",
      strasse: f.strasse || "",
      plz: f.plz || "",
      ort: f.ort || "",
      land: f.land || "Deutschland",
      website: f.website || "",
      telefon: f.telefon || "",
      email: f.email || "",
      notizen: f.notizen || "",
    });
    setDialogOffen(true);
  }

  function feld<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function speichern() {
    if (!form.name.trim()) {
      setFehler("Bitte einen Firmennamen angeben.");
      return;
    }
    setSpeichert(true);
    setFehler(null);
    const nutzlast = {
      name: form.name.trim(),
      branche: form.branche.trim() || null,
      strasse: form.strasse.trim() || null,
      plz: form.plz.trim() || null,
      ort: form.ort.trim() || null,
      land: form.land.trim() || null,
      website: form.website.trim() || null,
      telefon: form.telefon.trim() || null,
      email: form.email.trim() || null,
      notizen: form.notizen.trim() || null,
    };
    let error;
    if (bearbeite) {
      const res = await supabase
        .from("firmen")
        .update(nutzlast)
        .eq("id", bearbeite.id);
      error = res.error;
    } else {
      const res = await supabase.from("firmen").insert(nutzlast);
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
    const { error } = await supabase.from("firmen").delete().eq("id", id);
    setLoeschId(null);
    if (error) {
      setFehler(error.message);
      return;
    }
    laden_();
  }

  return (
    <div style={{ background: C.navy, minHeight: "100vh", padding: "32px 28px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
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
                fontFamily: "var(--font-dm-sans), sans-serif",
                color: C.gold,
                fontSize: 'clamp(30px, 2.63vw, 42px)',
                margin: 0,
                letterSpacing: 0.5,
              }}
            >
              🏢 Firmen
            </h1>
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                color: C.textDim,
                margin: "6px 0 0",
                fontSize: 'clamp(14px, 1.25vw, 20px)',
              }}
            >
              Deine Firmen &amp; Accounts – jeder Kontakt kann einer Firma zugeordnet werden.
            </p>
          </div>
          <button onClick={dialogNeu} style={goldBtnGross}>
            + Neue Firma
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
          <KpiKarte label="Firmen gesamt" wert={firmen.length} farbe={C.cyan} />
          <KpiKarte
            label="Mit Kontakten"
            wert={firmen.filter((f) => (kontaktCount[f.id] || 0) > 0).length}
            farbe={C.green}
          />
        </div>

        {/* Suche */}
        <input
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Suche: Name, Branche, Ort, E-Mail…"
          style={{ ...inp, marginBottom: 18 }}
        />

        {fehler && (
          <div style={fehlerBox}>{fehler}</div>
        )}

        {/* Tabelle */}
        <div
          style={{
            background: C.navy2,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {laden ? (
            <div style={leerBox}>Lade Firmen…</div>
          ) : gefiltert.length === 0 ? (
            <div style={leerBox}>
              {firmen.length === 0
                ? "Noch keine Firmen. Leg deine erste Firma an."
                : "Keine Treffer."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <thead>
                  <tr>
                    {["Firma", "Ort", "Kontakt", "Kontakte", ""].map((h, i) => (
                      <th key={i} style={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gefiltert.map((f) => (
                    <tr
                      key={f.id}
                      style={{
                        borderTop: `1px solid ${C.border}`,
                        cursor: "pointer",
                      }}
                      onClick={() => router.push(`/dashboard/crm/firmen/${f.id}`)}
                    >
                      <td style={td}>
                        <div style={{ color: "#fff", fontWeight: 600 }}>{f.name}</div>
                        {f.branche && (
                          <div style={{ color: C.textDim, fontSize: 'clamp(12px, 1.06vw, 17px)' }}>
                            {f.branche}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, color: C.textDim }}>
                        {[f.plz, f.ort].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {f.email && (
                            <a
                              href={`mailto:${f.email}`}
                              onClick={(e) => e.stopPropagation()}
                              style={linkCyan}
                            >
                              {f.email}
                            </a>
                          )}
                          {f.telefon && (
                            <a
                              href={`tel:${f.telefon}`}
                              onClick={(e) => e.stopPropagation()}
                              style={linkCyan}
                            >
                              {f.telefon}
                            </a>
                          )}
                          {f.website && (
                            <a
                              href={webUrl(f.website)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={linkCyan}
                            >
                              {f.website}
                            </a>
                          )}
                          {!f.email && !f.telefon && !f.website && (
                            <span style={{ color: C.textDim }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...td, color: C.textDim }}>
                        {kontaktCount[f.id] || 0}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dialogBearbeiten(f);
                          }}
                          style={miniBtn}
                        >
                          Bearbeiten
                        </button>
                        {loeschId === f.id ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                loeschen(f.id);
                              }}
                              style={{ ...miniBtn, color: C.danger, borderColor: C.danger }}
                            >
                              Wirklich?
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setLoeschId(null);
                              }}
                              style={miniBtn}
                            >
                              Abbrechen
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLoeschId(f.id);
                            }}
                            style={{ ...miniBtn, color: C.textDim }}
                          >
                            Löschen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Dialog */}
      {dialogOffen && (
        <div style={overlay} onClick={() => !speichert && setDialogOffen(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2
              style={{
                fontFamily: "var(--font-dm-sans), sans-serif",
                color: C.gold,
                fontSize: 'clamp(22px, 1.94vw, 31px)',
                margin: "0 0 18px",
              }}
            >
              {bearbeite ? "Firma bearbeiten" : "Neue Firma"}
            </h2>

            <Feld label="Firmenname *">
              <input style={inp} value={form.name} onChange={(e) => feld("name", e.target.value)} />
            </Feld>

            <div style={grid2}>
              <Feld label="Branche">
                <input style={inp} value={form.branche} onChange={(e) => feld("branche", e.target.value)} />
              </Feld>
              <Feld label="Website">
                <input style={inp} value={form.website} onChange={(e) => feld("website", e.target.value)} />
              </Feld>
              <Feld label="Straße">
                <input style={inp} value={form.strasse} onChange={(e) => feld("strasse", e.target.value)} />
              </Feld>
              <Feld label="PLZ / Ort">
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...inp, flex: "0 0 90px" }} value={form.plz} onChange={(e) => feld("plz", e.target.value)} placeholder="PLZ" />
                  <input style={inp} value={form.ort} onChange={(e) => feld("ort", e.target.value)} placeholder="Ort" />
                </div>
              </Feld>
              <Feld label="Land">
                <input style={inp} value={form.land} onChange={(e) => feld("land", e.target.value)} />
              </Feld>
              <Feld label="Telefon">
                <input style={inp} value={form.telefon} onChange={(e) => feld("telefon", e.target.value)} />
              </Feld>
              <Feld label="E-Mail">
                <input style={inp} value={form.email} onChange={(e) => feld("email", e.target.value)} />
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
                justifyContent: "flex-end",
                gap: 12,
                marginTop: 16,
              }}
            >
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
  wert: number;
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
          fontFamily: "var(--font-dm-sans), sans-serif",
          color: farbe,
          fontSize: 'clamp(30px, 2.63vw, 42px)',
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        {wert}
      </div>
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          color: C.textDim,
          fontSize: 'clamp(13px, 1.13vw, 18px)',
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
          fontSize: 'clamp(12px, 1.06vw, 17px)',
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
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  cursor: "pointer",
  padding: 0,
};

const goldBtn: React.CSSProperties = {
  background: C.gold,
  color: C.navy,
  border: "none",
  borderRadius: 10,
  padding: "11px 22px",
  fontFamily: "var(--font-dm-sans), sans-serif",
  fontWeight: 700,
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  cursor: "pointer",
};

const goldBtnGross: React.CSSProperties = {
  ...goldBtn,
  padding: "12px 20px",
  fontSize: 'clamp(15px, 1.31vw, 21px)',
};

const grauBtn: React.CSSProperties = {
  background: "transparent",
  color: C.textDim,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 22px",
  fontFamily: "var(--font-dm-sans), sans-serif",
  fontWeight: 600,
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  cursor: "pointer",
};

const miniBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "6px 12px",
  color: C.cyan,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 'clamp(13px, 1.13vw, 18px)',
  cursor: "pointer",
  marginLeft: 6,
};

const linkCyan: React.CSSProperties = {
  color: C.cyan,
  textDecoration: "none",
  fontSize: 'clamp(13px, 1.13vw, 18px)',
};

const inp: React.CSSProperties = {
  background: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 13px",
  color: "#fff",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 'clamp(14px, 1.25vw, 20px)',
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  color: C.textDim,
  fontSize: 'clamp(12px, 1.06vw, 17px)',
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const td: React.CSSProperties = {
  padding: "14px 16px",
  verticalAlign: "middle",
  color: "#fff",
  fontSize: 'clamp(14px, 1.25vw, 20px)',
};

const leerBox: React.CSSProperties = {
  padding: "48px 24px",
  textAlign: "center",
  color: C.textDim,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 'clamp(15px, 1.31vw, 21px)',
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
  fontSize: 'clamp(14px, 1.25vw, 20px)',
};
