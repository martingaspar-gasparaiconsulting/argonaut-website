"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · E4 Lieferanten-Cockpit
// Liste, Suche, CRUD, tel:/mailto:-Links. Detail via Namensklick.
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

interface Lieferant {
  id: string;
  name: string;
  ansprechpartner: string | null;
  email: string | null;
  telefon: string | null;
  adresse: string | null;
  website: string | null;
  kundennummer: string | null;
  notizen: string | null;
  aktiv: boolean;
  created_at: string;
}

type FormState = {
  name: string;
  ansprechpartner: string;
  email: string;
  telefon: string;
  adresse: string;
  website: string;
  kundennummer: string;
  notizen: string;
  aktiv: boolean;
};

const LEER_FORM: FormState = {
  name: "",
  ansprechpartner: "",
  email: "",
  telefon: "",
  adresse: "",
  website: "",
  kundennummer: "",
  notizen: "",
  aktiv: true,
};

export default function LieferantenCockpit() {
  const [lieferanten, setLieferanten] = useState<Lieferant[]>([]);
  const [laden, setLaden] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [nurAktiv, setNurAktiv] = useState(false);

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
      .from("lieferanten")
      .select("*")
      .order("name", { ascending: true });
    if (!error && data) setLieferanten(data as Lieferant[]);
    setLaden(false);
  }

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return lieferanten.filter((l) => {
      if (nurAktiv && !l.aktiv) return false;
      if (q) {
        const hay = [l.name, l.ansprechpartner, l.email, l.telefon, l.kundennummer]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lieferanten, suche, nurAktiv]);

  function oeffneNeu() {
    setBearbeiteId(null);
    setForm(LEER_FORM);
    setFehler(null);
    setModalOffen(true);
  }

  function oeffneBearbeiten(l: Lieferant) {
    setBearbeiteId(l.id);
    setForm({
      name: l.name ?? "",
      ansprechpartner: l.ansprechpartner ?? "",
      email: l.email ?? "",
      telefon: l.telefon ?? "",
      adresse: l.adresse ?? "",
      website: l.website ?? "",
      kundennummer: l.kundennummer ?? "",
      notizen: l.notizen ?? "",
      aktiv: l.aktiv,
    });
    setFehler(null);
    setModalOffen(true);
  }

  function setF<K extends keyof FormState>(key: K, wert: FormState[K]) {
    setForm((f) => ({ ...f, [key]: wert }));
  }

  async function speichere() {
    if (!form.name.trim()) {
      setFehler("Name ist ein Pflichtfeld.");
      return;
    }
    setSpeichern(true);
    setFehler(null);
    const payload = {
      name: form.name.trim(),
      ansprechpartner: form.ansprechpartner.trim() || null,
      email: form.email.trim() || null,
      telefon: form.telefon.trim() || null,
      adresse: form.adresse.trim() || null,
      website: form.website.trim() || null,
      kundennummer: form.kundennummer.trim() || null,
      notizen: form.notizen.trim() || null,
      aktiv: form.aktiv,
    };
    let error = null as { message: string } | null;
    if (bearbeiteId) {
      const res = await supabase
        .from("lieferanten")
        .update(payload)
        .eq("id", bearbeiteId);
      error = res.error;
    } else {
      const insertObj = userId ? { ...payload, owner_user_id: userId } : payload;
      const res = await supabase.from("lieferanten").insert(insertObj);
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

  async function loesche(l: Lieferant) {
    if (!window.confirm(`Lieferant „${l.name}" wirklich löschen?`)) return;
    const { error } = await supabase.from("lieferanten").delete().eq("id", l.id);
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
  const linkStil: React.CSSProperties = { color: C.cyan, textDecoration: "none" };
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
    <div style={{ color: "#fff", maxWidth: 1400, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
            🚚 Lieferanten
          </h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 14 }}>
            Kontakte, Ansprechpartner und Bezugsquellen
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href="/dashboard/erp/lieferanten/import"
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${C.border}`,
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            🪄 KI-Import
          </a>
          <button style={btnGold} onClick={oeffneNeu}>
            + Lieferant anlegen
          </button>
        </div>
      </div>

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
          style={{ ...inputStil, maxWidth: 340 }}
          placeholder="Suche: Name, Ansprechpartner, E-Mail, Kundennr.…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
        />
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
            checked={nurAktiv}
            onChange={(e) => setNurAktiv(e.target.checked)}
          />
          Nur aktive
        </label>
      </div>

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        {laden ? (
          <div style={{ padding: 30, color: C.textDim }}>Lade Lieferanten…</div>
        ) : gefiltert.length === 0 ? (
          <div style={{ padding: 30, color: C.textDim }}>
            {lieferanten.length === 0
              ? "Noch keine Lieferanten angelegt. Lege oben rechts deinen ersten Lieferanten an."
              : "Keine Lieferanten für diese Suche gefunden."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStil}>Lieferant</th>
                <th style={thStil}>Ansprechpartner</th>
                <th style={thStil}>Telefon</th>
                <th style={thStil}>E-Mail</th>
                <th style={{ ...thStil, textAlign: "right" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((l) => (
                <tr key={l.id}>
                  <td style={tdStil}>
                    <div style={{ fontWeight: 600 }}>
                      <a
                        href={`/dashboard/erp/lieferanten/${l.id}`}
                        style={linkStil}
                      >
                        {l.name}
                      </a>
                      {!l.aktiv && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: C.textDim,
                            border: `1px solid ${C.border}`,
                            borderRadius: 6,
                            padding: "1px 6px",
                          }}
                        >
                          inaktiv
                        </span>
                      )}
                    </div>
                    {l.kundennummer && (
                      <div style={{ fontSize: 12, color: C.textDim }}>
                        Kundennr. {l.kundennummer}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStil, color: C.textDim }}>
                    {l.ansprechpartner || "—"}
                  </td>
                  <td style={tdStil}>
                    {l.telefon ? (
                      <a href={`tel:${l.telefon}`} style={linkStil}>
                        {l.telefon}
                      </a>
                    ) : (
                      <span style={{ color: C.textDim }}>—</span>
                    )}
                  </td>
                  <td style={tdStil}>
                    {l.email ? (
                      <a href={`mailto:${l.email}`} style={linkStil}>
                        {l.email}
                      </a>
                    ) : (
                      <span style={{ color: C.textDim }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tdStil, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      style={{ ...btnGhost, marginRight: 6 }}
                      onClick={() => oeffneBearbeiten(l)}
                    >
                      Bearbeiten
                    </button>
                    <button
                      style={{
                        ...btnGhost,
                        color: C.danger,
                        borderColor: "rgba(224,102,102,0.4)",
                      }}
                      onClick={() => loesche(l)}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
            style={{ ...card, width: "100%", maxWidth: 560, background: C.navy }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 800 }}>
              {bearbeiteId ? "Lieferant bearbeiten" : "Neuer Lieferant"}
            </h2>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Name *</label>
                <input
                  style={inputStil}
                  value={form.name}
                  onChange={(e) => setF("name", e.target.value)}
                  placeholder="z.B. Forsttechnik Müller GmbH"
                />
              </div>
              <div>
                <label style={labelStil}>Ansprechpartner</label>
                <input
                  style={inputStil}
                  value={form.ansprechpartner}
                  onChange={(e) => setF("ansprechpartner", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Kundennummer (bei uns)</label>
                <input
                  style={inputStil}
                  value={form.kundennummer}
                  onChange={(e) => setF("kundennummer", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Telefon</label>
                <input
                  style={inputStil}
                  value={form.telefon}
                  onChange={(e) => setF("telefon", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>E-Mail</label>
                <input
                  style={inputStil}
                  value={form.email}
                  onChange={(e) => setF("email", e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Website</label>
                <input
                  style={inputStil}
                  value={form.website}
                  onChange={(e) => setF("website", e.target.value)}
                  placeholder="z.B. www.forsttechnik-mueller.de"
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Adresse</label>
                <input
                  style={inputStil}
                  value={form.adresse}
                  onChange={(e) => setF("adresse", e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Notizen</label>
                <textarea
                  style={{ ...inputStil, minHeight: 70, resize: "vertical" }}
                  value={form.notizen}
                  onChange={(e) => setF("notizen", e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
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
                    checked={form.aktiv}
                    onChange={(e) => setF("aktiv", e.target.checked)}
                  />
                  Lieferant aktiv
                </label>
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
