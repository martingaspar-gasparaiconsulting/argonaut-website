"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · E2 Lager-Cockpit
// Artikelliste, Bestand, Mindestbestand-Ampel, Suche, Filter, CRUD.
// Platzhalter firma_id/kunde_id sind in der DB gesetzt, hier bewusst
// NICHT verbunden (erst im Finale).
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

const EINHEIT_OPTIONEN = ["Stk", "kg", "g", "m", "m²", "m³", "l", "h", "Pauschal"];

interface Artikel {
  id: string;
  artikelnummer: string | null;
  bezeichnung: string;
  beschreibung: string | null;
  kategorie: string | null;
  einheit: string;
  einkaufspreis: number | null;
  verkaufspreis: number | null;
  mindestbestand: number;
  aktueller_bestand: number;
  lagerort: string | null;
  aktiv: boolean;
  created_at: string;
}

type FormState = {
  artikelnummer: string;
  bezeichnung: string;
  beschreibung: string;
  kategorie: string;
  einheit: string;
  einkaufspreis: string;
  verkaufspreis: string;
  mindestbestand: string;
  aktueller_bestand: string;
  lagerort: string;
  aktiv: boolean;
};

const LEER_FORM: FormState = {
  artikelnummer: "",
  bezeichnung: "",
  beschreibung: "",
  kategorie: "",
  einheit: "Stk",
  einkaufspreis: "",
  verkaufspreis: "",
  mindestbestand: "",
  aktueller_bestand: "",
  lagerort: "",
  aktiv: true,
};

// Ampel: rot = leer/kritisch, gelb = knapp, grün = ok
function ampel(a: Artikel): { farbe: string; text: string } {
  const bestand = Number(a.aktueller_bestand) || 0;
  const min = Number(a.mindestbestand) || 0;
  if (bestand <= 0) return { farbe: C.danger, text: "Leer" };
  if (min > 0 && bestand <= min) return { farbe: C.danger, text: "Kritisch" };
  if (min > 0 && bestand <= min * 1.5) return { farbe: C.warn, text: "Knapp" };
  return { farbe: C.green, text: "OK" };
}

function eur(n: number | null): string {
  return (Number(n) || 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function num(n: number | null): string {
  return (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

export default function LagerCockpit() {
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [laden, setLaden] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [suche, setSuche] = useState("");
  const [katFilter, setKatFilter] = useState("");
  const [nurKnapp, setNurKnapp] = useState(false);

  const [modalOffen, setModalOffen] = useState(false);
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(LEER_FORM);
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setUserId(userData.user?.id ?? null);
      await ladeArtikel();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ladeArtikel() {
    setLaden(true);
    const { data, error } = await supabase
      .from("artikel")
      .select("*")
      .order("bezeichnung", { ascending: true });
    if (!error && data) setArtikel(data as Artikel[]);
    setLaden(false);
  }

  const kategorien = useMemo(() => {
    const s = new Set<string>();
    artikel.forEach((a) => {
      if (a.kategorie) s.add(a.kategorie);
    });
    return Array.from(s).sort();
  }, [artikel]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return artikel.filter((a) => {
      if (katFilter && a.kategorie !== katFilter) return false;
      if (nurKnapp) {
        const bestand = Number(a.aktueller_bestand) || 0;
        const min = Number(a.mindestbestand) || 0;
        const knapp = bestand <= 0 || (min > 0 && bestand <= min * 1.5);
        if (!knapp) return false;
      }
      if (q) {
        const hay = [a.bezeichnung, a.artikelnummer, a.kategorie, a.lagerort]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [artikel, suche, katFilter, nurKnapp]);

  const kpiGesamt = artikel.length;
  const kpiUnterMin = artikel.filter((a) => {
    const bestand = Number(a.aktueller_bestand) || 0;
    const min = Number(a.mindestbestand) || 0;
    return bestand <= 0 || (min > 0 && bestand <= min);
  }).length;
  const kpiLagerwert = artikel.reduce(
    (sum, a) =>
      sum + (Number(a.aktueller_bestand) || 0) * (Number(a.einkaufspreis) || 0),
    0
  );

  function oeffneNeu() {
    setBearbeiteId(null);
    setForm(LEER_FORM);
    setFehler(null);
    setModalOffen(true);
  }

  function oeffneBearbeiten(a: Artikel) {
    setBearbeiteId(a.id);
    setForm({
      artikelnummer: a.artikelnummer ?? "",
      bezeichnung: a.bezeichnung ?? "",
      beschreibung: a.beschreibung ?? "",
      kategorie: a.kategorie ?? "",
      einheit: a.einheit ?? "Stk",
      einkaufspreis: a.einkaufspreis != null ? String(a.einkaufspreis) : "",
      verkaufspreis: a.verkaufspreis != null ? String(a.verkaufspreis) : "",
      mindestbestand: a.mindestbestand != null ? String(a.mindestbestand) : "",
      aktueller_bestand:
        a.aktueller_bestand != null ? String(a.aktueller_bestand) : "",
      lagerort: a.lagerort ?? "",
      aktiv: a.aktiv,
    });
    setFehler(null);
    setModalOffen(true);
  }

  function setF<K extends keyof FormState>(key: K, wert: FormState[K]) {
    setForm((f) => ({ ...f, [key]: wert }));
  }

  async function speichereArtikel() {
    if (!form.bezeichnung.trim()) {
      setFehler("Bezeichnung ist ein Pflichtfeld.");
      return;
    }
    setSpeichern(true);
    setFehler(null);

    const zahl = (s: string) =>
      s.trim() === "" ? 0 : Number(s.replace(",", "."));

    const payload = {
      artikelnummer: form.artikelnummer.trim() || null,
      bezeichnung: form.bezeichnung.trim(),
      beschreibung: form.beschreibung.trim() || null,
      kategorie: form.kategorie.trim() || null,
      einheit: form.einheit || "Stk",
      einkaufspreis: zahl(form.einkaufspreis),
      verkaufspreis: zahl(form.verkaufspreis),
      mindestbestand: zahl(form.mindestbestand),
      aktueller_bestand: zahl(form.aktueller_bestand),
      lagerort: form.lagerort.trim() || null,
      aktiv: form.aktiv,
    };

    let error = null as { message: string } | null;
    if (bearbeiteId) {
      const res = await supabase
        .from("artikel")
        .update(payload)
        .eq("id", bearbeiteId);
      error = res.error;
    } else {
      const insertObj = userId
        ? { ...payload, owner_user_id: userId }
        : payload; // sonst füllt DB-Default auth.uid()
      const res = await supabase.from("artikel").insert(insertObj);
      error = res.error;
    }

    setSpeichern(false);
    if (error) {
      setFehler("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    setModalOffen(false);
    await ladeArtikel();
  }

  async function loescheArtikel(a: Artikel) {
    if (!window.confirm(`Artikel „${a.bezeichnung}" wirklich löschen?`)) return;
    const { error } = await supabase.from("artikel").delete().eq("id", a.id);
    if (error) {
      window.alert("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    await ladeArtikel();
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
      {/* Kopf */}
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
            📦 Lager
          </h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 14 }}>
            Artikel, Bestände und Mindestbestand-Ampel
          </p>
        </div>
        <button style={btnGold} onClick={oeffneNeu}>
          + Artikel anlegen
        </button>
      </div>

      {/* KPI-Kacheln */}
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
            Artikel gesamt
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
            {kpiGesamt}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Unter Mindestbestand
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 4,
              color: kpiUnterMin > 0 ? C.danger : C.green,
            }}
          >
            {kpiUnterMin}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Lagerwert (EK)
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 4,
              color: C.gold,
            }}
          >
            {eur(kpiLagerwert)}
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
          placeholder="Suche: Bezeichnung, Nr., Kategorie, Lagerort…"
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
            checked={nurKnapp}
            onChange={(e) => setNurKnapp(e.target.checked)}
          />
          Nur knappe/leere Artikel
        </label>
      </div>

      {/* Tabelle */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        {laden ? (
          <div style={{ padding: 30, color: C.textDim }}>Lade Artikel…</div>
        ) : gefiltert.length === 0 ? (
          <div style={{ padding: 30, color: C.textDim }}>
            {artikel.length === 0
              ? "Noch keine Artikel angelegt. Lege oben rechts deinen ersten Artikel an."
              : "Keine Artikel für diese Filter gefunden."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStil}></th>
                <th style={thStil}>Artikel</th>
                <th style={thStil}>Kategorie</th>
                <th style={{ ...thStil, textAlign: "right" }}>Bestand</th>
                <th style={{ ...thStil, textAlign: "right" }}>Mindest</th>
                <th style={{ ...thStil, textAlign: "right" }}>EK-Preis</th>
                <th style={thStil}>Lagerort</th>
                <th style={{ ...thStil, textAlign: "right" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((a) => {
                const am = ampel(a);
                return (
                  <tr key={a.id}>
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
                        <a
                          href={`/dashboard/erp/${a.id}`}
                          style={{ color: C.cyan, textDecoration: "none" }}
                        >
                          {a.bezeichnung}
                        </a>
                        {!a.aktiv && (
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
                      {a.artikelnummer && (
                        <div style={{ fontSize: 12, color: C.textDim }}>
                          Nr. {a.artikelnummer}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStil, color: C.textDim }}>
                      {a.kategorie || "—"}
                    </td>
                    <td
                      style={{
                        ...tdStil,
                        textAlign: "right",
                        fontWeight: 700,
                        color: am.farbe,
                      }}
                    >
                      {num(a.aktueller_bestand)}{" "}
                      <span style={{ color: C.textDim, fontWeight: 400 }}>
                        {a.einheit}
                      </span>
                    </td>
                    <td
                      style={{
                        ...tdStil,
                        textAlign: "right",
                        color: C.textDim,
                      }}
                    >
                      {num(a.mindestbestand)}
                    </td>
                    <td style={{ ...tdStil, textAlign: "right" }}>
                      {eur(a.einkaufspreis)}
                    </td>
                    <td style={{ ...tdStil, color: C.textDim }}>
                      {a.lagerort || "—"}
                    </td>
                    <td style={{ ...tdStil, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        style={{ ...btnGhost, marginRight: 6 }}
                        onClick={() => oeffneBearbeiten(a)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        style={{
                          ...btnGhost,
                          color: C.danger,
                          borderColor: "rgba(224,102,102,0.4)",
                        }}
                        onClick={() => loescheArtikel(a)}
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
            style={{
              ...card,
              width: "100%",
              maxWidth: 560,
              background: C.navy,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 800 }}>
              {bearbeiteId ? "Artikel bearbeiten" : "Neuer Artikel"}
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Bezeichnung *</label>
                <input
                  style={inputStil}
                  value={form.bezeichnung}
                  onChange={(e) => setF("bezeichnung", e.target.value)}
                  placeholder="z.B. Sägekette 3/8″"
                />
              </div>

              <div>
                <label style={labelStil}>Artikelnummer</label>
                <input
                  style={inputStil}
                  value={form.artikelnummer}
                  onChange={(e) => setF("artikelnummer", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Kategorie</label>
                <input
                  style={inputStil}
                  value={form.kategorie}
                  onChange={(e) => setF("kategorie", e.target.value)}
                  placeholder="z.B. Verschleißteile"
                />
              </div>

              <div>
                <label style={labelStil}>Aktueller Bestand</label>
                <input
                  style={inputStil}
                  value={form.aktueller_bestand}
                  onChange={(e) => setF("aktueller_bestand", e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
              <div>
                <label style={labelStil}>Mindestbestand</label>
                <input
                  style={inputStil}
                  value={form.mindestbestand}
                  onChange={(e) => setF("mindestbestand", e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>

              <div>
                <label style={labelStil}>Einheit</label>
                <select
                  style={inputStil}
                  value={form.einheit}
                  onChange={(e) => setF("einheit", e.target.value)}
                >
                  {EINHEIT_OPTIONEN.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStil}>Lagerort</label>
                <input
                  style={inputStil}
                  value={form.lagerort}
                  onChange={(e) => setF("lagerort", e.target.value)}
                  placeholder="z.B. Halle A / Regal 3"
                />
              </div>

              <div>
                <label style={labelStil}>Einkaufspreis (€)</label>
                <input
                  style={inputStil}
                  value={form.einkaufspreis}
                  onChange={(e) => setF("einkaufspreis", e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label style={labelStil}>Verkaufspreis (€)</label>
                <input
                  style={inputStil}
                  value={form.verkaufspreis}
                  onChange={(e) => setF("verkaufspreis", e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Beschreibung</label>
                <textarea
                  style={{ ...inputStil, minHeight: 70, resize: "vertical" }}
                  value={form.beschreibung}
                  onChange={(e) => setF("beschreibung", e.target.value)}
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
                  Artikel aktiv
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
                onClick={speichereArtikel}
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
