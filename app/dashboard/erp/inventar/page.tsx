"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiKlartext from "../../_components/KiKlartext";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · E7 Inventar / Betriebsmittel
// Geräte/Werkzeuge/Maschinen mit Prüf-Ampel (überfällig/bald/ok), CRUD.
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

const ZUSTAND_OPTIONEN = ["neu", "gut", "gebraucht", "defekt", "ausgemustert"];

interface Inventar {
  id: string;
  bezeichnung: string;
  inventarnummer: string | null;
  kategorie: string | null;
  seriennummer: string | null;
  standort: string | null;
  zustand: string;
  anschaffungsdatum: string | null;
  anschaffungswert: number | null;
  naechste_pruefung_am: string | null;
  notizen: string | null;
  created_at: string;
}

type FormState = {
  bezeichnung: string;
  inventarnummer: string;
  kategorie: string;
  seriennummer: string;
  standort: string;
  zustand: string;
  anschaffungsdatum: string;
  anschaffungswert: string;
  naechste_pruefung_am: string;
  notizen: string;
};

const LEER_FORM: FormState = {
  bezeichnung: "",
  inventarnummer: "",
  kategorie: "",
  seriennummer: "",
  standort: "",
  zustand: "gut",
  anschaffungsdatum: "",
  anschaffungswert: "",
  naechste_pruefung_am: "",
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

function pruefAmpel(datum: string | null): { farbe: string; text: string } {
  const t = tageBis(datum);
  if (t === null) return { farbe: C.textDim, text: "keine Prüfung" };
  if (t < 0) return { farbe: C.danger, text: `überfällig (${-t} T.)` };
  if (t <= 30) return { farbe: C.warn, text: `fällig in ${t} T.` };
  return { farbe: C.green, text: `ok (${t} T.)` };
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

export default function InventarCockpit() {
  const [inventar, setInventar] = useState<Inventar[]>([]);
  const [laden, setLaden] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [katFilter, setKatFilter] = useState("");
  const [nurFaellig, setNurFaellig] = useState(false);

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
      .from("inventar")
      .select("*")
      .order("bezeichnung", { ascending: true });
    if (!error && data) setInventar(data as Inventar[]);
    setLaden(false);
  }

  const kategorien = useMemo(() => {
    const s = new Set<string>();
    inventar.forEach((i) => {
      if (i.kategorie) s.add(i.kategorie);
    });
    return Array.from(s).sort();
  }, [inventar]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return inventar.filter((i) => {
      if (katFilter && i.kategorie !== katFilter) return false;
      if (nurFaellig) {
        const t = tageBis(i.naechste_pruefung_am);
        if (t === null || t > 30) return false;
      }
      if (q) {
        const hay = [
          i.bezeichnung,
          i.inventarnummer,
          i.kategorie,
          i.seriennummer,
          i.standort,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [inventar, suche, katFilter, nurFaellig]);

  const kpiGesamt = inventar.length;
  const kpiFaellig = inventar.filter((i) => {
    const t = tageBis(i.naechste_pruefung_am);
    return t !== null && t <= 30;
  }).length;
  const kpiWert = inventar.reduce(
    (s, i) => s + (Number(i.anschaffungswert) || 0),
    0
  );

  // KI-Kontext: überfällige/bald fällige Prüffristen priorisieren
  const inventarKi = useMemo(() => {
    type Frist = { bez: string; nr: string; standort: string; tage: number; rang: number };
    const fristen: Frist[] = [];
    for (const i of inventar) {
      const t = tageBis(i.naechste_pruefung_am);
      if (t === null) continue;
      let rang: number;
      if (t < 0) rang = 3;
      else if (t <= 30) rang = 2;
      else continue;
      fristen.push({
        bez: i.bezeichnung,
        nr: i.inventarnummer || "",
        standort: i.standort || "",
        tage: t,
        rang,
      });
    }
    if (fristen.length === 0) return { text: "", hatRot: false };
    fristen.sort((a, b) => b.rang - a.rang || a.tage - b.tage);
    const rot = fristen.filter((x) => x.rang === 3).length;
    const gelb = fristen.filter((x) => x.rang === 2).length;
    const zeile = (x: Frist) => {
      const nr = x.nr ? ` (${x.nr})` : "";
      const ort = x.standort ? `, Standort: ${x.standort}` : "";
      const status = x.tage < 0 ? `${-x.tage} Tage überfällig` : `fällig in ${x.tage} Tagen`;
      return `- ${x.bez}${nr}: Prüfung ${status}${ort}`;
    };
    const top = fristen.slice(0, 4).map(zeile).join("\n");
    const text =
      `${rot} Prüfung(en) überfällig, ${gelb} bald fällig.\n` +
      `Am dringendsten:\n${top}`;
    return { text, hatRot: rot > 0 };
  }, [inventar]);

  function oeffneNeu() {
    setBearbeiteId(null);
    setForm(LEER_FORM);
    setFehler(null);
    setModalOffen(true);
  }

  function oeffneBearbeiten(i: Inventar) {
    setBearbeiteId(i.id);
    setForm({
      bezeichnung: i.bezeichnung ?? "",
      inventarnummer: i.inventarnummer ?? "",
      kategorie: i.kategorie ?? "",
      seriennummer: i.seriennummer ?? "",
      standort: i.standort ?? "",
      zustand: i.zustand ?? "gut",
      anschaffungsdatum: i.anschaffungsdatum ?? "",
      anschaffungswert:
        i.anschaffungswert != null ? String(i.anschaffungswert) : "",
      naechste_pruefung_am: i.naechste_pruefung_am ?? "",
      notizen: i.notizen ?? "",
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
    const payload = {
      bezeichnung: form.bezeichnung.trim(),
      inventarnummer: form.inventarnummer.trim() || null,
      kategorie: form.kategorie.trim() || null,
      seriennummer: form.seriennummer.trim() || null,
      standort: form.standort.trim() || null,
      zustand: form.zustand || "gut",
      anschaffungsdatum: form.anschaffungsdatum || null,
      anschaffungswert:
        form.anschaffungswert.trim() === ""
          ? 0
          : Number(form.anschaffungswert.replace(",", ".")),
      naechste_pruefung_am: form.naechste_pruefung_am || null,
      notizen: form.notizen.trim() || null,
    };
    let error = null as { message: string } | null;
    if (bearbeiteId) {
      const res = await supabase
        .from("inventar")
        .update(payload)
        .eq("id", bearbeiteId);
      error = res.error;
    } else {
      const insertObj = userId ? { ...payload, owner_user_id: userId } : payload;
      const res = await supabase.from("inventar").insert(insertObj);
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

  async function loesche(i: Inventar) {
    if (!window.confirm(`„${i.bezeichnung}" wirklich löschen?`)) return;
    const { error } = await supabase.from("inventar").delete().eq("id", i.id);
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
            🔧 Inventar & Betriebsmittel
          </h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 14 }}>
            Geräte, Werkzeuge und Maschinen mit Prüffristen
          </p>
        </div>
        <button style={btnGold} onClick={oeffneNeu}>
          + Betriebsmittel anlegen
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
            Betriebsmittel gesamt
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
            {kpiGesamt}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Prüfung fällig (≤ 30 T.)
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 4,
              color: kpiFaellig > 0 ? C.warn : C.green,
            }}
          >
            {kpiFaellig}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Anschaffungswert gesamt
          </div>
          <div
            style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: C.gold }}
          >
            {eur(kpiWert)}
          </div>
        </div>
      </div>

      {/* KI-Klartext: priorisiert überfällige/anstehende Prüffristen */}
      {!laden && inventarKi.text !== "" && (
        <KiKlartext
          kontext={inventarKi.text}
          modul="Inventar / Prüffristen"
          akzent={inventarKi.hatRot ? C.danger : C.warn}
          dunkel
          style={{ marginBottom: 20 }}
        />
      )}

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
          placeholder="Suche: Bezeichnung, Inventarnr., Serie, Standort…"
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
            checked={nurFaellig}
            onChange={(e) => setNurFaellig(e.target.checked)}
          />
          Nur Prüfung fällig/überfällig
        </label>
      </div>

      {/* Tabelle */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        {laden ? (
          <div style={{ padding: 30, color: C.textDim }}>Lade Inventar…</div>
        ) : gefiltert.length === 0 ? (
          <div style={{ padding: 30, color: C.textDim }}>
            {inventar.length === 0
              ? "Noch keine Betriebsmittel angelegt. Lege oben rechts dein erstes an."
              : "Keine Betriebsmittel für diese Filter gefunden."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStil}></th>
                <th style={thStil}>Bezeichnung</th>
                <th style={thStil}>Kategorie</th>
                <th style={thStil}>Standort</th>
                <th style={thStil}>Zustand</th>
                <th style={thStil}>Nächste Prüfung</th>
                <th style={{ ...thStil, textAlign: "right" }}>Wert</th>
                <th style={{ ...thStil, textAlign: "right" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((i) => {
                const am = pruefAmpel(i.naechste_pruefung_am);
                return (
                  <tr key={i.id}>
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
                      <div style={{ fontWeight: 600 }}>{i.bezeichnung}</div>
                      {i.inventarnummer && (
                        <div style={{ fontSize: 12, color: C.textDim }}>
                          Inv.-Nr. {i.inventarnummer}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStil, color: C.textDim }}>
                      {i.kategorie || "—"}
                    </td>
                    <td style={{ ...tdStil, color: C.textDim }}>
                      {i.standort || "—"}
                    </td>
                    <td style={tdStil}>{i.zustand}</td>
                    <td style={tdStil}>
                      <span style={{ color: am.farbe, fontWeight: 600 }}>
                        {datum(i.naechste_pruefung_am)}
                      </span>
                    </td>
                    <td style={{ ...tdStil, textAlign: "right" }}>
                      {eur(i.anschaffungswert)}
                    </td>
                    <td
                      style={{ ...tdStil, textAlign: "right", whiteSpace: "nowrap" }}
                    >
                      <button
                        style={{ ...btnGhost, marginRight: 6 }}
                        onClick={() => oeffneBearbeiten(i)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        style={{
                          ...btnGhost,
                          color: C.danger,
                          borderColor: "rgba(224,102,102,0.4)",
                        }}
                        onClick={() => loesche(i)}
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
            style={{ ...card, width: "100%", maxWidth: 560, background: C.navy }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 800 }}>
              {bearbeiteId ? "Betriebsmittel bearbeiten" : "Neues Betriebsmittel"}
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
                  placeholder="z.B. Motorsäge Stihl MS 500i"
                />
              </div>
              <div>
                <label style={labelStil}>Inventarnummer</label>
                <input
                  style={inputStil}
                  value={form.inventarnummer}
                  onChange={(e) => setF("inventarnummer", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Kategorie</label>
                <input
                  style={inputStil}
                  value={form.kategorie}
                  onChange={(e) => setF("kategorie", e.target.value)}
                  placeholder="z.B. Forstgeräte"
                />
              </div>
              <div>
                <label style={labelStil}>Seriennummer</label>
                <input
                  style={inputStil}
                  value={form.seriennummer}
                  onChange={(e) => setF("seriennummer", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Standort</label>
                <input
                  style={inputStil}
                  value={form.standort}
                  onChange={(e) => setF("standort", e.target.value)}
                  placeholder="z.B. Werkstatt / Fahrzeug 1"
                />
              </div>
              <div>
                <label style={labelStil}>Zustand</label>
                <select
                  style={inputStil}
                  value={form.zustand}
                  onChange={(e) => setF("zustand", e.target.value)}
                >
                  {ZUSTAND_OPTIONEN.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStil}>Nächste Prüfung am</label>
                <input
                  type="date"
                  style={inputStil}
                  value={form.naechste_pruefung_am}
                  onChange={(e) => setF("naechste_pruefung_am", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Anschaffungsdatum</label>
                <input
                  type="date"
                  style={inputStil}
                  value={form.anschaffungsdatum}
                  onChange={(e) => setF("anschaffungsdatum", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Anschaffungswert (€)</label>
                <input
                  style={inputStil}
                  value={form.anschaffungswert}
                  onChange={(e) => setF("anschaffungswert", e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
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
