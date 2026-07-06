"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiKlartext from "../../_components/KiKlartext";

// ---------------------------------------------------------------------
// ARGONAUT OS · ERP · Preisliste (Etappe 1: die "lebende Preistabelle")
// Alle Artikel mit EK/VK direkt in der Zelle editierbar, Marge live,
// Preis-Verlauf pro Artikel aufklappbar (aus preis_historie).
// Jede Preisaenderung schreibt der DB-Trigger automatisch in die Historie.
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

type Preisfeld = "einkaufspreis" | "verkaufspreis";

interface Artikel {
  id: string;
  artikelnummer: string | null;
  bezeichnung: string;
  kategorie: string | null;
  einheit: string;
  einkaufspreis: number | null;
  verkaufspreis: number | null;
  aktiv: boolean;
}

interface PreisHist {
  id: string;
  feld: Preisfeld;
  alt_wert: number | null;
  neu_wert: number | null;
  grund: string | null;
  geaendert_am: string;
}

function eur(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function prozent(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " %";
}

function datumZeit(s: string): string {
  const d = new Date(s);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

// Handelsspanne (bezogen auf den Verkaufspreis) + absolute Marge.
type MargeInfo =
  | { status: "ok"; absolut: number; spanne: number }
  | { status: "verlust"; absolut: number; spanne: number }
  | { status: "mini"; absolut: number; spanne: number }
  | { status: "kein_vk" }
  | { status: "kein_ek"; vk: number };

function margeInfo(ek: number | null, vk: number | null): MargeInfo {
  if (vk == null || vk === 0) return { status: "kein_vk" };
  if (ek == null) return { status: "kein_ek", vk };
  const absolut = vk - ek;
  const spanne = (absolut / vk) * 100;
  if (absolut < 0) return { status: "verlust", absolut, spanne };
  if (spanne < 10) return { status: "mini", absolut, spanne };
  return { status: "ok", absolut, spanne };
}

export default function PreislisteCockpit() {
  const [artikel, setArtikel] = useState<Artikel[]>([]);
  const [laden, setLaden] = useState(true);
  const [suche, setSuche] = useState("");
  const [katFilter, setKatFilter] = useState("");
  const [nurProbleme, setNurProbleme] = useState(false);

  // Inline-Edit
  const [editZelle, setEditZelle] = useState<{ id: string; feld: Preisfeld } | null>(null);
  const [editWert, setEditWert] = useState("");
  const [speicherId, setSpeicherId] = useState<string | null>(null);
  const abbruchRef = useRef(false);

  // Verlauf
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [historie, setHistorie] = useState<Record<string, PreisHist[]>>({});
  const [histLaden, setHistLaden] = useState<Set<string>>(new Set());

  const [hinweis, setHinweis] = useState<string | null>(null);

  useEffect(() => {
    lade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lade() {
    setLaden(true);
    const { data, error } = await supabase
      .from("artikel")
      .select(
        "id, artikelnummer, bezeichnung, kategorie, einheit, einkaufspreis, verkaufspreis, aktiv"
      )
      .eq("aktiv", true)
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
      if (nurProbleme) {
        const m = margeInfo(a.einkaufspreis, a.verkaufspreis);
        const problem =
          m.status === "verlust" ||
          m.status === "mini" ||
          m.status === "kein_vk" ||
          m.status === "kein_ek";
        if (!problem) return false;
      }
      if (q) {
        const hay = [a.bezeichnung, a.artikelnummer, a.kategorie]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [artikel, suche, katFilter, nurProbleme]);

  // KPIs
  const kpiGesamt = artikel.length;
  const kpiOhnePreis = artikel.filter(
    (a) => a.verkaufspreis == null || a.verkaufspreis === 0
  ).length;
  const kpiVerlust = artikel.filter(
    (a) =>
      a.einkaufspreis != null &&
      a.verkaufspreis != null &&
      a.verkaufspreis < a.einkaufspreis
  ).length;
  const kpiSchnitt = useMemo(() => {
    const werte: number[] = [];
    for (const a of artikel) {
      const m = margeInfo(a.einkaufspreis, a.verkaufspreis);
      if (m.status === "ok" || m.status === "mini" || m.status === "verlust")
        werte.push(m.spanne);
    }
    if (werte.length === 0) return null;
    return werte.reduce((s, x) => s + x, 0) / werte.length;
  }, [artikel]);

  // KI-Auge: priorisiert Verlust > fehlende Preise > Mini-Marge
  const preisKi = useMemo(() => {
    if (artikel.length === 0) return { text: "", akzent: C.gold, hatRot: false };
    const ohneEk = artikel.filter(
      (a) => a.verkaufspreis != null && a.verkaufspreis !== 0 && a.einkaufspreis == null
    ).length;
    const miniListe = artikel.filter((a) => {
      const m = margeInfo(a.einkaufspreis, a.verkaufspreis);
      return m.status === "mini";
    });
    const verlustListe = artikel.filter((a) => {
      const m = margeInfo(a.einkaufspreis, a.verkaufspreis);
      return m.status === "verlust";
    });

    const teile: string[] = [`${kpiGesamt} aktive Artikel im Sortiment.`];
    if (kpiVerlust > 0)
      teile.push(
        `${kpiVerlust} Artikel mit Verlust (Verkaufspreis unter Einkaufspreis).`
      );
    if (kpiOhnePreis > 0) teile.push(`${kpiOhnePreis} ohne Verkaufspreis.`);
    if (ohneEk > 0)
      teile.push(`${ohneEk} ohne Einkaufspreis (Marge nicht berechenbar).`);
    if (miniListe.length > 0)
      teile.push(`${miniListe.length} mit Handelsspanne unter 10 %.`);
    if (kpiSchnitt != null)
      teile.push(
        `Durchschnittliche Handelsspanne: ${kpiSchnitt.toLocaleString("de-DE", {
          maximumFractionDigits: 1,
        })} %.`
      );

    // konkrete Beispiele nennen (max 4), Verlust zuerst
    const beispiele = [...verlustListe, ...miniListe].slice(0, 4);
    if (beispiele.length > 0) {
      const zeilen = beispiele
        .map((a) => {
          const m = margeInfo(a.einkaufspreis, a.verkaufspreis);
          const nr = a.artikelnummer ? ` (${a.artikelnummer})` : "";
          if (m.status === "verlust")
            return `- ${a.bezeichnung}${nr}: Verlust ${eur(m.absolut)} pro Einheit`;
          if (m.status === "mini")
            return `- ${a.bezeichnung}${nr}: nur ${m.spanne.toLocaleString("de-DE", {
              maximumFractionDigits: 1,
            })} % Spanne`;
          return `- ${a.bezeichnung}${nr}`;
        })
        .join("\n");
      teile.push(`Am dringendsten:\n${zeilen}`);
    }

    const hatRot = kpiVerlust > 0;
    const akzent = hatRot ? C.danger : kpiOhnePreis > 0 ? C.warn : C.green;
    return { text: teile.join(" ").replace(" Am dringendsten:", "\nAm dringendsten:"), akzent, hatRot };
  }, [artikel, kpiGesamt, kpiVerlust, kpiOhnePreis, kpiSchnitt]);

  // ---------- Inline-Edit-Logik ----------
  function starteEdit(a: Artikel, feld: Preisfeld) {
    const wert = feld === "einkaufspreis" ? a.einkaufspreis : a.verkaufspreis;
    setEditZelle({ id: a.id, feld });
    setEditWert(wert == null ? "" : String(wert).replace(".", ","));
    abbruchRef.current = false;
  }

  async function commitEdit() {
    if (!editZelle) return;
    if (abbruchRef.current) {
      abbruchRef.current = false;
      setEditZelle(null);
      return;
    }
    const { id, feld } = editZelle;
    const roh = editWert.trim();
    const neu = roh === "" ? null : Number(roh.replace(",", "."));

    if (neu !== null && (isNaN(neu) || neu < 0)) {
      setHinweis("Bitte eine gültige Zahl ≥ 0 eingeben.");
      setEditZelle(null);
      return;
    }

    const aktuell = artikel.find((x) => x.id === id);
    const alt = aktuell ? aktuell[feld] : null;
    setEditZelle(null);

    // keine echte Änderung -> nichts tun
    if ((alt ?? null) === (neu ?? null)) return;

    setSpeicherId(id);
    const { error } = await supabase
      .from("artikel")
      .update({ [feld]: neu, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSpeicherId(null);

    if (error) {
      setHinweis("Speichern fehlgeschlagen: " + error.message);
      return;
    }

    // lokal aktualisieren (kein Neuladen -> kein Flackern)
    setArtikel((liste) =>
      liste.map((x) => (x.id === id ? { ...x, [feld]: neu } : x))
    );
    setHinweis(
      `${feld === "einkaufspreis" ? "Einkaufspreis" : "Verkaufspreis"} gespeichert.`
    );
    // Verlauf ggf. neu laden, falls offen
    if (offen.has(id)) ladeHistorie(id);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      abbruchRef.current = false;
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      abbruchRef.current = true;
      e.currentTarget.blur();
    }
  }

  // ---------- Verlauf ----------
  async function toggleHistorie(id: string) {
    const neu = new Set(offen);
    if (neu.has(id)) {
      neu.delete(id);
      setOffen(neu);
      return;
    }
    neu.add(id);
    setOffen(neu);
    if (!historie[id]) await ladeHistorie(id);
  }

  async function ladeHistorie(id: string) {
    setHistLaden((s) => new Set(s).add(id));
    const { data } = await supabase
      .from("preis_historie")
      .select("id, feld, alt_wert, neu_wert, grund, geaendert_am")
      .eq("artikel_id", id)
      .order("geaendert_am", { ascending: false });
    setHistorie((h) => ({ ...h, [id]: (data || []) as PreisHist[] }));
    setHistLaden((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
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
  const preisZelle: React.CSSProperties = {
    ...tdStil,
    textAlign: "right",
    whiteSpace: "nowrap",
    cursor: "pointer",
    fontVariantNumeric: "tabular-nums",
  };
  const editInput: React.CSSProperties = {
    width: 110,
    padding: "6px 8px",
    borderRadius: 6,
    border: `1px solid ${C.cyan}`,
    background: "rgba(0,229,255,0.06)",
    color: "#fff",
    fontSize: 14,
    textAlign: "right",
    boxSizing: "border-box",
  };

  function margeZelle(a: Artikel) {
    const m = margeInfo(a.einkaufspreis, a.verkaufspreis);
    if (m.status === "kein_vk")
      return <span style={{ color: C.textDim }}>kein VK</span>;
    if (m.status === "kein_ek")
      return <span style={{ color: C.textDim }}>EK fehlt</span>;
    const farbe =
      m.status === "verlust" ? C.danger : m.status === "mini" ? C.warn : C.green;
    return (
      <span style={{ color: farbe, fontWeight: 700 }}>
        {eur(m.absolut)} · {prozent(m.spanne)}
      </span>
    );
  }

  // Zelle rendern (Anzeige oder Edit-Input)
  function preisFeld(a: Artikel, feld: Preisfeld) {
    const wert = feld === "einkaufspreis" ? a.einkaufspreis : a.verkaufspreis;
    const inEdit = editZelle?.id === a.id && editZelle?.feld === feld;
    if (inEdit) {
      return (
        <input
          autoFocus
          value={editWert}
          onChange={(e) => setEditWert(e.target.value)}
          onKeyDown={onKey}
          onBlur={commitEdit}
          inputMode="decimal"
          placeholder="0,00"
          style={editInput}
        />
      );
    }
    const leer = wert == null;
    return (
      <span
        onClick={() => starteEdit(a, feld)}
        title="Klicken zum Ändern"
        style={{
          display: "inline-block",
          minWidth: 70,
          padding: "4px 8px",
          borderRadius: 6,
          border: `1px solid transparent`,
          background: leer ? "rgba(224,162,76,0.10)" : "transparent",
          color: leer ? C.warn : "#fff",
          opacity: speicherId === a.id ? 0.4 : 1,
        }}
      >
        {leer ? "setzen" : eur(wert)}
      </span>
    );
  }

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
            🏷️ Preisliste
          </h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: 14 }}>
            Deine lebende Preistabelle – Einkauf, Verkauf und Marge auf einen Blick.
            Preise direkt in der Zelle anklicken und ändern.
          </p>
        </div>
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
            Aktive Artikel
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
            {kpiGesamt}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Ohne Verkaufspreis
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 4,
              color: kpiOhnePreis > 0 ? C.warn : C.green,
            }}
          >
            {kpiOhnePreis}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Mit Verlust
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 4,
              color: kpiVerlust > 0 ? C.danger : C.green,
            }}
          >
            {kpiVerlust}
          </div>
        </div>
        <div style={card}>
          <div style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
            Ø Handelsspanne
          </div>
          <div
            style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: C.gold }}
          >
            {kpiSchnitt == null ? "—" : prozent(kpiSchnitt)}
          </div>
        </div>
      </div>

      {/* KI-Auge */}
      {!laden && preisKi.text !== "" && (
        <KiKlartext
          kontext={preisKi.text}
          modul="Preisliste / Marge"
          akzent={preisKi.akzent}
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
          placeholder="Suche: Bezeichnung, Artikelnr., Kategorie…"
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
            checked={nurProbleme}
            onChange={(e) => setNurProbleme(e.target.checked)}
          />
          Nur Problemfälle (Verlust / fehlt / Mini-Marge)
        </label>
      </div>

      {hinweis && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(0,229,255,0.08)",
            border: `1px solid ${C.border}`,
            color: C.cyan,
            fontSize: 13,
            fontWeight: 600,
          }}
          onClick={() => setHinweis(null)}
        >
          {hinweis}
        </div>
      )}

      {/* Tabelle */}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        {laden ? (
          <div style={{ padding: 30, color: C.textDim }}>Lade Preisliste…</div>
        ) : gefiltert.length === 0 ? (
          <div style={{ padding: 30, color: C.textDim }}>
            {artikel.length === 0
              ? "Noch keine Artikel angelegt. Artikel entstehen im ERP – später kannst du sie hier auch per Import einlesen."
              : "Keine Artikel für diese Filter gefunden."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStil, width: 32 }}></th>
                <th style={thStil}>Artikel</th>
                <th style={thStil}>Kategorie</th>
                <th style={thStil}>Einheit</th>
                <th style={{ ...thStil, textAlign: "right" }}>Einkauf</th>
                <th style={{ ...thStil, textAlign: "right" }}>Verkauf</th>
                <th style={{ ...thStil, textAlign: "right" }}>Marge / Spanne</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((a) => {
                const istOffen = offen.has(a.id);
                const hist = historie[a.id] || [];
                return (
                  <Fragment key={a.id}>
                    <tr>
                      <td style={{ ...tdStil, textAlign: "center" }}>
                        <button
                          onClick={() => toggleHistorie(a.id)}
                          title="Preis-Verlauf anzeigen"
                          style={{
                            background: "none",
                            border: "none",
                            color: istOffen ? C.cyan : C.textDim,
                            cursor: "pointer",
                            fontSize: 14,
                            lineHeight: 1,
                            transform: istOffen ? "rotate(90deg)" : "none",
                            transition: "transform 0.15s",
                          }}
                        >
                          ▶
                        </button>
                      </td>
                      <td style={tdStil}>
                        <div style={{ fontWeight: 600 }}>{a.bezeichnung}</div>
                        {a.artikelnummer && (
                          <div style={{ fontSize: 12, color: C.textDim }}>
                            Art.-Nr. {a.artikelnummer}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStil, color: C.textDim }}>
                        {a.kategorie || "—"}
                      </td>
                      <td style={{ ...tdStil, color: C.textDim }}>
                        {a.einheit}
                      </td>
                      <td style={preisZelle}>{preisFeld(a, "einkaufspreis")}</td>
                      <td style={preisZelle}>{preisFeld(a, "verkaufspreis")}</td>
                      <td style={{ ...tdStil, textAlign: "right" }}>
                        {margeZelle(a)}
                      </td>
                    </tr>
                    {istOffen && (
                      <tr>
                        <td></td>
                        <td colSpan={6} style={{ padding: "0 12px 14px" }}>
                          <div
                            style={{
                              background: "rgba(255,255,255,0.03)",
                              border: `1px solid ${C.border}`,
                              borderRadius: 10,
                              padding: "10px 14px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: 0.5,
                                textTransform: "uppercase",
                                color: C.textDim,
                                marginBottom: 8,
                              }}
                            >
                              Preis-Verlauf
                            </div>
                            {histLaden.has(a.id) ? (
                              <div style={{ color: C.textDim, fontSize: 13 }}>
                                Lade Verlauf…
                              </div>
                            ) : hist.length === 0 ? (
                              <div style={{ color: C.textDim, fontSize: 13 }}>
                                Noch keine Preisänderung protokolliert. Ab jetzt
                                wird jede Änderung automatisch festgehalten.
                              </div>
                            ) : (
                              <table
                                style={{
                                  width: "100%",
                                  borderCollapse: "collapse",
                                }}
                              >
                                <tbody>
                                  {hist.map((h) => (
                                    <tr key={h.id}>
                                      <td
                                        style={{
                                          padding: "6px 8px",
                                          fontSize: 12.5,
                                          color: C.textDim,
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {datumZeit(h.geaendert_am)}
                                      </td>
                                      <td
                                        style={{
                                          padding: "6px 8px",
                                          fontSize: 12.5,
                                          color: "#fff",
                                        }}
                                      >
                                        {h.feld === "einkaufspreis"
                                          ? "Einkauf"
                                          : "Verkauf"}
                                      </td>
                                      <td
                                        style={{
                                          padding: "6px 8px",
                                          fontSize: 12.5,
                                          color: C.textDim,
                                          textAlign: "right",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {h.alt_wert == null
                                          ? "—"
                                          : eur(h.alt_wert)}{" "}
                                        <span style={{ color: C.cyan }}>→</span>{" "}
                                        <span
                                          style={{ color: "#fff", fontWeight: 600 }}
                                        >
                                          {h.neu_wert == null
                                            ? "—"
                                            : eur(h.neu_wert)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ marginTop: 14, color: C.textDim, fontSize: 12.5 }}>
        Tipp: Preis anklicken, Wert eintippen, <b>Enter</b> zum Speichern oder{" "}
        <b>Esc</b> zum Abbrechen. Leeres Feld = kein Preis. Die Handelsspanne wird
        auf den Verkaufspreis bezogen berechnet.
      </p>
    </div>
  );
}
