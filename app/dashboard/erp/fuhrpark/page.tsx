"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiKlartext from "../../_components/KiKlartext";

// ---------------------------------------------------------------------
// ARGONAUT OS · BLOCK 8 ERP · E8 Fuhrpark
// Fahrzeuge mit TÜV-/Wartungs-/Versicherungs-Ampel (überfällig/bald/ok), CRUD.
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

const KRAFTSTOFF_OPTIONEN = [
  "Diesel",
  "Benzin",
  "Elektro",
  "Hybrid",
  "Gas",
  "Sonstige",
];

interface Fahrzeug {
  id: string;
  bezeichnung: string;
  kennzeichen: string | null;
  fahrzeugtyp: string | null;
  fahrgestellnummer: string | null;
  erstzulassung: string | null;
  tuev_bis: string | null;
  wartung_bis: string | null;
  versicherung_bis: string | null;
  km_stand: number | null;
  kraftstoff: string | null;
  notizen: string | null;
  aktiv: boolean;
  created_at: string;
}

type FormState = {
  bezeichnung: string;
  kennzeichen: string;
  fahrzeugtyp: string;
  fahrgestellnummer: string;
  erstzulassung: string;
  tuev_bis: string;
  wartung_bis: string;
  versicherung_bis: string;
  km_stand: string;
  kraftstoff: string;
  notizen: string;
  aktiv: boolean;
};

const LEER_FORM: FormState = {
  bezeichnung: "",
  kennzeichen: "",
  fahrzeugtyp: "",
  fahrgestellnummer: "",
  erstzulassung: "",
  tuev_bis: "",
  wartung_bis: "",
  versicherung_bis: "",
  km_stand: "",
  kraftstoff: "Diesel",
  notizen: "",
  aktiv: true,
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

// Rang: 3=rot, 2=gelb, 1=grün, 0=keine Frist
function ampelRang(datum: string | null): number {
  const t = tageBis(datum);
  if (t === null) return 0;
  if (t < 0) return 3;
  if (t <= 30) return 2;
  return 1;
}
function rangFarbe(rang: number): string {
  if (rang === 3) return C.danger;
  if (rang === 2) return C.warn;
  if (rang === 1) return C.green;
  return C.textDim;
}
function fristText(datum: string | null): string {
  const t = tageBis(datum);
  if (t === null) return "keine Frist";
  if (t < 0) return `überfällig (${-t} T.)`;
  if (t <= 30) return `fällig in ${t} T.`;
  return `ok (${t} T.)`;
}

function datum(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE");
}
function km(n: number | null): string {
  if (n == null) return "—";
  return (Number(n) || 0).toLocaleString("de-DE") + " km";
}

export default function FuhrparkCockpit() {
  const [fahrzeuge, setFahrzeuge] = useState<Fahrzeug[]>([]);
  const [laden, setLaden] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
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
      .from("fahrzeuge")
      .select("*")
      .order("bezeichnung", { ascending: true });
    if (!error && data) setFahrzeuge(data as Fahrzeug[]);
    setLaden(false);
  }

  function schlimmsterRang(f: Fahrzeug): number {
    return Math.max(
      ampelRang(f.tuev_bis),
      ampelRang(f.wartung_bis),
      ampelRang(f.versicherung_bis)
    );
  }

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return fahrzeuge.filter((f) => {
      if (nurFaellig && schlimmsterRang(f) < 2) return false;
      if (q) {
        const hay = [f.bezeichnung, f.kennzeichen, f.fahrzeugtyp]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [fahrzeuge, suche, nurFaellig]);

  const kpiGesamt = fahrzeuge.length;
  const kpiTuev = fahrzeuge.filter((f) => ampelRang(f.tuev_bis) >= 2).length;
  const kpiWartung = fahrzeuge.filter(
    (f) => ampelRang(f.wartung_bis) >= 2
  ).length;

  // KI-Kontext: alle anstehenden/überfälligen Fristen über alle aktiven Fahrzeuge
  const fuhrparkKi = useMemo(() => {
    type Frist = { bez: string; kennz: string; art: string; tage: number; rang: number };
    const fristen: Frist[] = [];
    const add = (f: Fahrzeug, art: string, d: string | null) => {
      const r = ampelRang(d);
      const t = tageBis(d);
      if (r >= 2 && t !== null) {
        fristen.push({ bez: f.bezeichnung, kennz: f.kennzeichen || "", art, tage: t, rang: r });
      }
    };
    for (const f of fahrzeuge) {
      if (!f.aktiv) continue;
      add(f, "TÜV/HU", f.tuev_bis);
      add(f, "Wartung", f.wartung_bis);
      add(f, "Versicherung", f.versicherung_bis);
    }
    if (fristen.length === 0) return { text: "", hatRot: false };
    fristen.sort((a, b) => b.rang - a.rang || a.tage - b.tage);
    const rot = fristen.filter((x) => x.rang === 3).length;
    const gelb = fristen.filter((x) => x.rang === 2).length;
    const zeile = (x: Frist) => {
      const wagen = x.kennz ? `${x.bez} (${x.kennz})` : x.bez;
      const status = x.tage < 0 ? `${-x.tage} Tage überfällig` : `fällig in ${x.tage} Tagen`;
      return `- ${wagen}: ${x.art} ${status}`;
    };
    const top = fristen.slice(0, 4).map(zeile).join("\n");
    const text =
      `${rot} Frist(en) überfällig, ${gelb} bald fällig im Fuhrpark.\n` +
      `Am dringendsten:\n${top}`;
    return { text, hatRot: rot > 0 };
  }, [fahrzeuge]);

  function oeffneNeu() {
    setBearbeiteId(null);
    setForm(LEER_FORM);
    setFehler(null);
    setModalOffen(true);
  }

  function oeffneBearbeiten(f: Fahrzeug) {
    setBearbeiteId(f.id);
    setForm({
      bezeichnung: f.bezeichnung ?? "",
      kennzeichen: f.kennzeichen ?? "",
      fahrzeugtyp: f.fahrzeugtyp ?? "",
      fahrgestellnummer: f.fahrgestellnummer ?? "",
      erstzulassung: f.erstzulassung ?? "",
      tuev_bis: f.tuev_bis ?? "",
      wartung_bis: f.wartung_bis ?? "",
      versicherung_bis: f.versicherung_bis ?? "",
      km_stand: f.km_stand != null ? String(f.km_stand) : "",
      kraftstoff: f.kraftstoff ?? "Diesel",
      notizen: f.notizen ?? "",
      aktiv: f.aktiv,
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
      kennzeichen: form.kennzeichen.trim() || null,
      fahrzeugtyp: form.fahrzeugtyp.trim() || null,
      fahrgestellnummer: form.fahrgestellnummer.trim() || null,
      erstzulassung: form.erstzulassung || null,
      tuev_bis: form.tuev_bis || null,
      wartung_bis: form.wartung_bis || null,
      versicherung_bis: form.versicherung_bis || null,
      km_stand:
        form.km_stand.trim() === ""
          ? null
          : Math.round(Number(form.km_stand.replace(/[.,]/g, ""))),
      kraftstoff: form.kraftstoff || null,
      notizen: form.notizen.trim() || null,
      aktiv: form.aktiv,
    };
    let error = null as { message: string } | null;
    if (bearbeiteId) {
      const res = await supabase
        .from("fahrzeuge")
        .update(payload)
        .eq("id", bearbeiteId);
      error = res.error;
    } else {
      const insertObj = userId ? { ...payload, owner_user_id: userId } : payload;
      const res = await supabase.from("fahrzeuge").insert(insertObj);
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

  async function loesche(f: Fahrzeug) {
    if (!window.confirm(`Fahrzeug „${f.bezeichnung}" wirklich löschen?`)) return;
    const { error } = await supabase.from("fahrzeuge").delete().eq("id", f.id);
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
  const fristZelle = (d: string | null): React.ReactElement => (
    <span style={{ color: rangFarbe(ampelRang(d)), fontWeight: 600 }} title={fristText(d)}>
      {datum(d)}
    </span>
  );

  return (
    <div style={{ color: "#fff", maxWidth: 1400, margin: "0 auto", paddingBottom: 80 }}>
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
            🚜 Fuhrpark
          </h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 14 }}>
            Fahrzeuge & Maschinen mit TÜV-, Wartungs- und Versicherungsfristen
          </p>
        </div>
        <button style={btnGold} onClick={oeffneNeu}>
          + Fahrzeug anlegen
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
            Fahrzeuge gesamt
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
            {kpiGesamt}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            TÜV fällig (≤ 30 T.)
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 4,
              color: kpiTuev > 0 ? C.warn : C.green,
            }}
          >
            {kpiTuev}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Wartung fällig (≤ 30 T.)
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 4,
              color: kpiWartung > 0 ? C.warn : C.green,
            }}
          >
            {kpiWartung}
          </div>
        </div>
      </div>

      {/* KI-Klartext: priorisiert anstehende Fahrzeug-Fristen */}
      {!laden && fuhrparkKi.text !== "" && (
        <KiKlartext
          kontext={fuhrparkKi.text}
          modul="Fuhrpark / Fahrzeug-Fristen"
          akzent={fuhrparkKi.hatRot ? C.danger : C.warn}
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
          placeholder="Suche: Bezeichnung, Kennzeichen, Typ…"
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
            checked={nurFaellig}
            onChange={(e) => setNurFaellig(e.target.checked)}
          />
          Nur Fristen fällig/überfällig
        </label>
      </div>

      {/* Tabelle */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        {laden ? (
          <div style={{ padding: 30, color: C.textDim }}>Lade Fuhrpark…</div>
        ) : gefiltert.length === 0 ? (
          <div style={{ padding: 30, color: C.textDim }}>
            {fahrzeuge.length === 0
              ? "Noch keine Fahrzeuge angelegt. Lege oben rechts dein erstes Fahrzeug an."
              : "Keine Fahrzeuge für diese Filter gefunden."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={thStil}></th>
                <th style={thStil}>Fahrzeug</th>
                <th style={thStil}>Typ</th>
                <th style={thStil}>TÜV bis</th>
                <th style={thStil}>Wartung bis</th>
                <th style={thStil}>Versich. bis</th>
                <th style={{ ...thStil, textAlign: "right" }}>km-Stand</th>
                <th style={{ ...thStil, textAlign: "right" }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((f) => {
                const rang = schlimmsterRang(f);
                const farbe = rangFarbe(rang);
                return (
                  <tr key={f.id}>
                    <td style={{ ...tdStil, width: 14 }}>
                      <span
                        title={
                          rang === 0
                            ? "keine Fristen hinterlegt"
                            : "schlimmste Frist"
                        }
                        style={{
                          display: "inline-block",
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: farbe,
                          boxShadow: `0 0 8px ${farbe}`,
                        }}
                      />
                    </td>
                    <td style={tdStil}>
                      <div style={{ fontWeight: 600 }}>
                        {f.bezeichnung}
                        {!f.aktiv && (
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
                      {f.kennzeichen && (
                        <div style={{ fontSize: 12, color: C.textDim }}>
                          {f.kennzeichen}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStil, color: C.textDim }}>
                      {f.fahrzeugtyp || "—"}
                    </td>
                    <td style={tdStil}>{fristZelle(f.tuev_bis)}</td>
                    <td style={tdStil}>{fristZelle(f.wartung_bis)}</td>
                    <td style={tdStil}>{fristZelle(f.versicherung_bis)}</td>
                    <td style={{ ...tdStil, textAlign: "right", color: C.textDim }}>
                      {km(f.km_stand)}
                    </td>
                    <td
                      style={{ ...tdStil, textAlign: "right", whiteSpace: "nowrap" }}
                    >
                      <button
                        style={{ ...btnGhost, marginRight: 6 }}
                        onClick={() => oeffneBearbeiten(f)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        style={{
                          ...btnGhost,
                          color: C.danger,
                          borderColor: "rgba(224,102,102,0.4)",
                        }}
                        onClick={() => loesche(f)}
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
              {bearbeiteId ? "Fahrzeug bearbeiten" : "Neues Fahrzeug"}
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
                  placeholder="z.B. John Deere Harvester 1270G"
                />
              </div>
              <div>
                <label style={labelStil}>Kennzeichen</label>
                <input
                  style={inputStil}
                  value={form.kennzeichen}
                  onChange={(e) => setF("kennzeichen", e.target.value)}
                  placeholder="z.B. BB-XY 123"
                />
              </div>
              <div>
                <label style={labelStil}>Fahrzeugtyp</label>
                <input
                  style={inputStil}
                  value={form.fahrzeugtyp}
                  onChange={(e) => setF("fahrzeugtyp", e.target.value)}
                  placeholder="z.B. Harvester, LKW, PKW, Anhänger"
                />
              </div>
              <div>
                <label style={labelStil}>Kraftstoff</label>
                <select
                  style={inputStil}
                  value={form.kraftstoff}
                  onChange={(e) => setF("kraftstoff", e.target.value)}
                >
                  {KRAFTSTOFF_OPTIONEN.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStil}>km-Stand</label>
                <input
                  style={inputStil}
                  value={form.km_stand}
                  onChange={(e) => setF("km_stand", e.target.value)}
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
              <div>
                <label style={labelStil}>TÜV/HU bis</label>
                <input
                  type="date"
                  style={inputStil}
                  value={form.tuev_bis}
                  onChange={(e) => setF("tuev_bis", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Wartung bis</label>
                <input
                  type="date"
                  style={inputStil}
                  value={form.wartung_bis}
                  onChange={(e) => setF("wartung_bis", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Versicherung bis</label>
                <input
                  type="date"
                  style={inputStil}
                  value={form.versicherung_bis}
                  onChange={(e) => setF("versicherung_bis", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStil}>Erstzulassung</label>
                <input
                  type="date"
                  style={inputStil}
                  value={form.erstzulassung}
                  onChange={(e) => setF("erstzulassung", e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Fahrgestellnummer (FIN)</label>
                <input
                  style={inputStil}
                  value={form.fahrgestellnummer}
                  onChange={(e) => setF("fahrgestellnummer", e.target.value)}
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
                  Fahrzeug aktiv (im Einsatz)
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
