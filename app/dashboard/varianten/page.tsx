"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";
import { augeVarianten } from "@/lib/auge";
import {
  parseWerte,
  matrixZellen,
  zelleKey,
  skuFor,
  variantePreis,
  bestandStufe,
  fehlendeZellen,
  zaehleVarianten,
  artikelStammAusVariante,
  type BestandStufe,
} from "@/lib/varianten";
import { variantenMatrixPdf } from "@/lib/variantenMatrixPdf";

// ---------------------------------------------------------------------
// ARGONAUT OS · L2-1 · Artikel-Varianten & Matrix
// Eine Matrix (Achse1 × Achse2, z. B. Größe × Farbe) erzeugt auf einen
// Schlag alle Varianten-SKUs mit eigenem Bestand, EAN und Aufpreis.
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

const STUFE_FARBE: Record<BestandStufe, string> = {
  leer: C.danger,
  kritisch: C.danger,
  knapp: C.warn,
  ok: C.green,
};

interface Gruppe {
  id: string;
  artikel_id: string | null;
  bezeichnung: string;
  sku_basis: string | null;
  achse1_name: string;
  achse1_werte: string | null;
  achse2_name: string | null;
  achse2_werte: string | null;
  basis_vk: number | null;
  mwst_satz: number | null;
  status: string;
  created_at: string;
}

interface Variante {
  id: string;
  gruppe_id: string;
  achse1_wert: string;
  achse2_wert: string;
  sku: string | null;
  ean: string | null;
  aufpreis: number | null;
  bestand: number | null;
  mindestbestand: number | null;
  aktiv: boolean;
  artikel_id: string | null;
  created_at: string;
}

interface ArtikelKurz {
  id: string;
  bezeichnung: string;
}

type GruppeForm = {
  bezeichnung: string;
  artikel_id: string;
  sku_basis: string;
  achse1_name: string;
  achse1_werte: string;
  achse2_name: string;
  achse2_werte: string;
  basis_vk: string;
  mwst_satz: string;
  status: string;
};

const LEER_GRUPPE: GruppeForm = {
  bezeichnung: "",
  artikel_id: "",
  sku_basis: "",
  achse1_name: "Größe",
  achse1_werte: "",
  achse2_name: "Farbe",
  achse2_werte: "",
  basis_vk: "",
  mwst_satz: "19",
  status: "aktiv",
};

type VarianteForm = {
  achse1_wert: string;
  achse2_wert: string;
  sku: string;
  ean: string;
  aufpreis: string;
  bestand: string;
  mindestbestand: string;
  aktiv: boolean;
};

function eur(n: number | null): string {
  return (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
function num(n: number | null): string {
  return (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}
function zahl(s: string): number {
  return s.trim() === "" ? 0 : Number(s.replace(",", "."));
}

export default function VariantenSeite() {
  const [gruppen, setGruppen] = useState<Gruppe[]>([]);
  const [varianten, setVarianten] = useState<Variante[]>([]);
  const [artikel, setArtikel] = useState<ArtikelKurz[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [tab, setTab] = useState<"matrizen" | "varianten">("matrizen");
  const [offeneGruppe, setOffeneGruppe] = useState<string | null>(null);
  const [varFilter, setVarFilter] = useState<string>("");
  const [hinweis, setHinweis] = useState<string | null>(null);

  // Gruppen-Modal
  const [gModal, setGModal] = useState(false);
  const [gEditId, setGEditId] = useState<string | null>(null);
  const [gForm, setGForm] = useState<GruppeForm>(LEER_GRUPPE);
  const [gFehler, setGFehler] = useState<string | null>(null);
  const [gSpeichern, setGSpeichern] = useState(false);

  // Varianten-Modal
  const [vModal, setVModal] = useState(false);
  const [vEditId, setVEditId] = useState<string | null>(null);
  const [vGruppeId, setVGruppeId] = useState<string | null>(null);
  const [vForm, setVForm] = useState<VarianteForm>({
    achse1_wert: "", achse2_wert: "", sku: "", ean: "", aufpreis: "", bestand: "", mindestbestand: "", aktiv: true,
  });
  const [vFehler, setVFehler] = useState<string | null>(null);
  const [vSpeichern, setVSpeichern] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setUserId(userData.user?.id ?? null);
      await ladeAlles();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ladeAlles() {
    setLaden(true);
    const [g, v, a] = await Promise.all([
      supabase.from("variante_gruppe").select("*").order("bezeichnung", { ascending: true }),
      supabase.from("variante_artikel").select("*").order("created_at", { ascending: true }),
      supabase.from("artikel").select("id, bezeichnung").eq("aktiv", true).order("bezeichnung", { ascending: true }),
    ]);
    if (!g.error && g.data) setGruppen(g.data as Gruppe[]);
    if (!v.error && v.data) setVarianten(v.data as Variante[]);
    if (!a.error && a.data) setArtikel(a.data as ArtikelKurz[]);
    setLaden(false);
  }

  const kpi = useMemo(() => zaehleVarianten(gruppen, varianten), [gruppen, varianten]);

  const variantenByGruppe = useMemo(() => {
    const m = new Map<string, Variante[]>();
    for (const v of varianten) {
      if (!m.has(v.gruppe_id)) m.set(v.gruppe_id, []);
      m.get(v.gruppe_id)!.push(v);
    }
    return m;
  }, [varianten]);

  const gefilterteVarianten = useMemo(() => {
    const list = varFilter ? varianten.filter((v) => v.gruppe_id === varFilter) : varianten;
    return list;
  }, [varianten, varFilter]);

  const gruppeById = useMemo(() => {
    const m = new Map<string, Gruppe>();
    gruppen.forEach((g) => m.set(g.id, g));
    return m;
  }, [gruppen]);

  // ---------------- Gruppen CRUD ----------------
  function oeffneNeueGruppe() {
    setGEditId(null);
    setGForm(LEER_GRUPPE);
    setGFehler(null);
    setGModal(true);
  }
  function oeffneGruppeBearbeiten(g: Gruppe) {
    setGEditId(g.id);
    setGForm({
      bezeichnung: g.bezeichnung ?? "",
      artikel_id: g.artikel_id ?? "",
      sku_basis: g.sku_basis ?? "",
      achse1_name: g.achse1_name ?? "Größe",
      achse1_werte: g.achse1_werte ?? "",
      achse2_name: g.achse2_name ?? "",
      achse2_werte: g.achse2_werte ?? "",
      basis_vk: g.basis_vk != null ? String(g.basis_vk) : "",
      mwst_satz: g.mwst_satz != null ? String(g.mwst_satz) : "19",
      status: g.status ?? "aktiv",
    });
    setGFehler(null);
    setGModal(true);
  }
  function setGF<K extends keyof GruppeForm>(k: K, w: GruppeForm[K]) {
    setGForm((f) => ({ ...f, [k]: w }));
  }

  async function speichereGruppe() {
    if (!gForm.bezeichnung.trim()) { setGFehler("Bezeichnung ist ein Pflichtfeld."); return; }
    if (parseWerte(gForm.achse1_werte).length === 0) { setGFehler(`Bitte mindestens einen Wert für „${gForm.achse1_name || "Achse 1"}" angeben.`); return; }
    setGSpeichern(true); setGFehler(null);
    const payload = {
      bezeichnung: gForm.bezeichnung.trim(),
      artikel_id: gForm.artikel_id || null,
      sku_basis: gForm.sku_basis.trim() || null,
      achse1_name: gForm.achse1_name.trim() || "Größe",
      achse1_werte: gForm.achse1_werte.trim() || null,
      achse2_name: gForm.achse2_name.trim() || null,
      achse2_werte: gForm.achse2_werte.trim() || null,
      basis_vk: zahl(gForm.basis_vk),
      mwst_satz: zahl(gForm.mwst_satz) || 19,
      status: gForm.status || "aktiv",
    };
    let error = null as { message: string } | null;
    if (gEditId) {
      const res = await supabase.from("variante_gruppe").update(payload).eq("id", gEditId);
      error = res.error;
    } else {
      const insertObj = userId ? { ...payload, owner_user_id: userId } : payload;
      const res = await supabase.from("variante_gruppe").insert(insertObj);
      error = res.error;
    }
    setGSpeichern(false);
    if (error) { setGFehler("Speichern fehlgeschlagen: " + error.message); return; }
    setGModal(false);
    await ladeAlles();
  }

  async function loescheGruppe(g: Gruppe) {
    if (!window.confirm(`Matrix „${g.bezeichnung}" samt allen Varianten wirklich löschen?`)) return;
    const { error } = await supabase.from("variante_gruppe").delete().eq("id", g.id);
    if (error) { window.alert("Löschen fehlgeschlagen: " + error.message); return; }
    await ladeAlles();
  }

  // ---------------- Matrix erzeugen ----------------
  async function erzeugeMatrix(g: Gruppe) {
    const vorhanden = new Set((variantenByGruppe.get(g.id) ?? []).map((v) => zelleKey(v.achse1_wert, v.achse2_wert)));
    const fehlt = fehlendeZellen({ achse1_werte: g.achse1_werte, achse2_werte: g.achse2_werte }, vorhanden);
    if (fehlt.length === 0) { setHinweis(`„${g.bezeichnung}": Matrix ist bereits vollständig.`); return; }
    const rows = fehlt.map((z) => {
      const base = {
        gruppe_id: g.id,
        achse1_wert: z.a1,
        achse2_wert: z.a2,
        sku: skuFor(g.sku_basis, z.a1, z.a2),
        ean: null as string | null,
        aufpreis: 0,
        bestand: 0,
        mindestbestand: 0,
        aktiv: true,
      };
      return userId ? { ...base, owner_user_id: userId } : base;
    });
    const { error } = await supabase.from("variante_artikel").insert(rows);
    if (error) { window.alert("Erzeugen fehlgeschlagen: " + error.message); return; }
    setHinweis(`„${g.bezeichnung}": ${fehlt.length} Variante${fehlt.length === 1 ? "" : "n"} erzeugt.`);
    await ladeAlles();
  }

  // ---------------- Ins Lager übernehmen (Option B: jede SKU = Lager-Artikel) ----------------
  async function variantenInsLager(g: Gruppe) {
    const vs = variantenByGruppe.get(g.id) ?? [];
    if (vs.length === 0) { setHinweis(`„${g.bezeichnung}": keine Varianten zum Übernehmen.`); return; }
    let erstellt = 0, aktualisiert = 0, fehler = 0;
    for (const v of vs) {
      const stamm = artikelStammAusVariante(
        { bezeichnung: g.bezeichnung, sku_basis: g.sku_basis, basis_vk: g.basis_vk },
        { achse1_wert: v.achse1_wert, achse2_wert: v.achse2_wert, sku: v.sku, aufpreis: v.aufpreis, mindestbestand: v.mindestbestand },
      );
      if (v.artikel_id) {
        const { error } = await supabase.from("artikel").update(stamm).eq("id", v.artikel_id);
        if (error) fehler++; else aktualisiert++;
      } else {
        const base = { ...stamm, aktueller_bestand: Number(v.bestand) || 0 };
        const insertObj = userId ? { ...base, owner_user_id: userId } : base;
        const { data, error } = await supabase.from("artikel").insert(insertObj).select("id").single();
        if (error || !data) { fehler++; continue; }
        await supabase.from("variante_artikel").update({ artikel_id: (data as { id: string }).id }).eq("id", v.id);
        erstellt++;
      }
    }
    setHinweis(`„${g.bezeichnung}": ${erstellt} im Lager neu angelegt, ${aktualisiert} aktualisiert${fehler ? `, ${fehler} Fehler` : ""}.`);
    await ladeAlles();
  }

  // ---------------- Varianten CRUD ----------------
  function oeffneNeueVariante(gruppeId: string) {
    setVEditId(null);
    setVGruppeId(gruppeId);
    setVForm({ achse1_wert: "", achse2_wert: "", sku: "", ean: "", aufpreis: "", bestand: "", mindestbestand: "", aktiv: true });
    setVFehler(null);
    setVModal(true);
  }
  function oeffneVarianteBearbeiten(v: Variante) {
    setVEditId(v.id);
    setVGruppeId(v.gruppe_id);
    setVForm({
      achse1_wert: v.achse1_wert ?? "",
      achse2_wert: v.achse2_wert ?? "",
      sku: v.sku ?? "",
      ean: v.ean ?? "",
      aufpreis: v.aufpreis != null ? String(v.aufpreis) : "",
      bestand: v.bestand != null ? String(v.bestand) : "",
      mindestbestand: v.mindestbestand != null ? String(v.mindestbestand) : "",
      aktiv: v.aktiv,
    });
    setVFehler(null);
    setVModal(true);
  }
  function setVF<K extends keyof VarianteForm>(k: K, w: VarianteForm[K]) {
    setVForm((f) => ({ ...f, [k]: w }));
  }

  async function speichereVariante() {
    if (!vGruppeId) return;
    if (!vForm.achse1_wert.trim()) { setVFehler("Der erste Achsen-Wert ist ein Pflichtfeld."); return; }
    setVSpeichern(true); setVFehler(null);
    const g = gruppeById.get(vGruppeId);
    const payload = {
      gruppe_id: vGruppeId,
      achse1_wert: vForm.achse1_wert.trim(),
      achse2_wert: vForm.achse2_wert.trim(),
      sku: vForm.sku.trim() || skuFor(g?.sku_basis, vForm.achse1_wert, vForm.achse2_wert),
      ean: vForm.ean.trim() || null,
      aufpreis: zahl(vForm.aufpreis),
      bestand: zahl(vForm.bestand),
      mindestbestand: zahl(vForm.mindestbestand),
      aktiv: vForm.aktiv,
    };
    let error = null as { message: string } | null;
    if (vEditId) {
      const res = await supabase.from("variante_artikel").update(payload).eq("id", vEditId);
      error = res.error;
    } else {
      const insertObj = userId ? { ...payload, owner_user_id: userId } : payload;
      const res = await supabase.from("variante_artikel").insert(insertObj);
      error = res.error;
    }
    setVSpeichern(false);
    if (error) {
      const doppelt = /duplicate|unique|23505/i.test(error.message);
      setVFehler(doppelt ? "Diese Kombination gibt es in dieser Matrix schon." : "Speichern fehlgeschlagen: " + error.message);
      return;
    }
    setVModal(false);
    await ladeAlles();
  }

  async function loescheVariante(v: Variante) {
    if (!window.confirm(`Variante „${v.sku || v.achse1_wert}" wirklich löschen?`)) return;
    const { error } = await supabase.from("variante_artikel").delete().eq("id", v.id);
    if (error) { window.alert("Löschen fehlgeschlagen: " + error.message); return; }
    await ladeAlles();
  }

  // ---------------- PDF ----------------
  async function pdfFuerGruppe(g: Gruppe) {
    const { data: userData } = await supabase.auth.getUser();
    const meta = userData.user?.user_metadata ?? {};
    const aussteller = meta.firma || meta.firmenname || meta.name || "ARGONAUT OS";
    const list = (variantenByGruppe.get(g.id) ?? []).filter((v) => v.aktiv);
    const zweiAchsen = parseWerte(g.achse2_werte).length > 0;
    variantenMatrixPdf({
      aussteller: String(aussteller),
      titel: g.bezeichnung,
      datum: new Date().toLocaleDateString("de-DE"),
      achse1Name: g.achse1_name || "Achse 1",
      achse2Name: zweiAchsen ? (g.achse2_name || "Achse 2") : "",
      basisVk: eur(g.basis_vk),
      summeBestand: num(list.reduce((s, v) => s + (Number(v.bestand) || 0), 0)),
      zeilen: list.map((v) => ({
        sku: v.sku || "—",
        a1: v.achse1_wert,
        a2: v.achse2_wert,
        aufpreis: (Number(v.aufpreis) || 0) === 0 ? "—" : eur(v.aufpreis),
        vk: eur(variantePreis(g.basis_vk, v.aufpreis)),
        bestand: num(v.bestand),
      })),
    });
  }

  // ---------------- CSV-Import (Matrizen-Ebene) ----------------
  async function importiereCsv(text: string) {
    const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
    if (zeilen.length < 2) { setHinweis("CSV enthält keine Datenzeilen."); return; }
    const kopf = zeilen[0].split(";").map((s) => s.trim().toLowerCase());
    const idx = (name: string) => kopf.indexOf(name);
    const iBez = idx("bezeichnung");
    if (iBez < 0) { setHinweis("CSV-Kopf braucht mindestens die Spalte bezeichnung."); return; }
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < zeilen.length; i++) {
      const sp = zeilen[i].split(";");
      const val = (name: string) => { const k = idx(name); return k >= 0 ? (sp[k] ?? "").trim() : ""; };
      if (!val("bezeichnung")) continue;
      const base: Record<string, unknown> = {
        bezeichnung: val("bezeichnung"),
        sku_basis: val("sku_basis") || null,
        achse1_name: val("achse1_name") || "Größe",
        achse1_werte: val("achse1_werte") || null,
        achse2_name: val("achse2_name") || null,
        achse2_werte: val("achse2_werte") || null,
        basis_vk: zahl(val("basis_vk")),
        mwst_satz: zahl(val("mwst_satz")) || 19,
        status: "aktiv",
      };
      rows.push(userId ? { ...base, owner_user_id: userId } : base);
    }
    if (rows.length === 0) { setHinweis("Keine gültigen Zeilen gefunden."); return; }
    const { error } = await supabase.from("variante_gruppe").insert(rows);
    if (error) { window.alert("Import fehlgeschlagen: " + error.message); return; }
    setHinweis(`${rows.length} Matri${rows.length === 1 ? "x" : "zen"} importiert.`);
    await ladeAlles();
  }
  function onCsvDatei(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => importiereCsv(String(reader.result || ""));
    reader.readAsText(f, "utf-8");
    e.target.value = "";
  }

  // ---------------- Styles ----------------
  const card: React.CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px" };
  const inputStil: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: "clamp(14px, 1.25vw, 20px)", boxSizing: "border-box" };
  const labelStil: React.CSSProperties = { display: "block", fontSize: "clamp(12px, 1.06vw, 17px)", color: C.textDim, marginBottom: 6, fontWeight: 600 };
  const btnGold: React.CSSProperties = { padding: "10px 18px", borderRadius: 8, border: "none", background: C.gold, color: C.navy, fontWeight: 700, fontSize: "clamp(14px, 1.25vw, 20px)", cursor: "pointer" };
  const btnGhost: React.CSSProperties = { padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "clamp(13px, 1.13vw, 18px)", cursor: "pointer" };
  const thStil: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: "clamp(11px, 0.94vw, 15px)", letterSpacing: 0.5, textTransform: "uppercase", color: C.textDim, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const tdStil: React.CSSProperties = { padding: "12px", fontSize: "clamp(14px, 1.25vw, 20px)", color: "#fff", borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" };
  const kachel: React.CSSProperties = { ...card, padding: "14px 16px" };
  const kachelLabel: React.CSSProperties = { color: C.textDim, fontSize: "clamp(12px, 1.06vw, 17px)", fontWeight: 600 };
  const kachelWert: React.CSSProperties = { fontSize: "clamp(24px, 2.1vw, 34px)", fontWeight: 800, marginTop: 4 };

  return (
    <div style={{ color: "#fff", maxWidth: 1400, margin: "0 auto" }}>
      {/* Kopf */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "clamp(26px, 2.25vw, 36px)", fontWeight: 800 }}>🧩 Varianten & Matrix</h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: "clamp(14px, 1.25vw, 20px)" }}>
            Größen, Farben & Ausführungen als Matrix — jede Kombination eine eigene SKU mit Bestand
          </p>
        </div>
        <button style={btnGold} onClick={oeffneNeueGruppe}>+ Matrix anlegen</button>
      </div>

      {/* KPI-Kacheln */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 18 }}>
        <div style={kachel}><div style={kachelLabel}>Matrizen</div><div style={kachelWert}>{kpi.gruppen}</div></div>
        <div style={kachel}><div style={kachelLabel}>Varianten</div><div style={kachelWert}>{kpi.varianten}</div></div>
        <div style={kachel}><div style={kachelLabel}>Matrix-Lücken</div><div style={{ ...kachelWert, color: kpi.luecken > 0 ? C.warn : C.green }}>{kpi.luecken}</div></div>
        <div style={kachel}><div style={kachelLabel}>Unter Mindest</div><div style={{ ...kachelWert, color: kpi.unterMindest > 0 ? C.danger : C.green }}>{kpi.unterMindest}</div></div>
        <div style={kachel}><div style={kachelLabel}>Lagerwert (VK)</div><div style={{ ...kachelWert, color: C.gold }}>{eur(kpi.lagerwert)}</div></div>
      </div>

      {/* KI-Auge */}
      <KiAuge modul="Varianten & Matrix" regel={augeVarianten({ luecken: kpi.luecken, unterMindest: kpi.unterMindest, varianten: kpi.varianten, gruppen: kpi.gruppen })} />

      {hinweis && (
        <div style={{ ...card, marginTop: 14, borderColor: "rgba(0,229,255,0.35)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ color: C.cyan }}>{hinweis}</span>
          <button style={btnGhost} onClick={() => setHinweis(null)}>OK</button>
        </div>
      )}

      {/* Reiter */}
      <div style={{ display: "flex", gap: 8, margin: "18px 0 16px", flexWrap: "wrap" }}>
        <button style={tab === "matrizen" ? btnGold : btnGhost} onClick={() => setTab("matrizen")}>Matrizen</button>
        <button style={tab === "varianten" ? btnGold : btnGhost} onClick={() => setTab("varianten")}>Varianten</button>
        <label style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6 }}>
          ⤓ CSV importieren
          <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onCsvDatei} />
        </label>
      </div>

      {laden ? (
        <div style={{ ...card, color: C.textDim }}>Lade Daten…</div>
      ) : tab === "matrizen" ? (
        // ============ MATRIZEN ============
        gruppen.length === 0 ? (
          <div style={{ ...card, color: C.textDim }}>Noch keine Matrix angelegt. Lege oben rechts deine erste Varianten-Matrix an (z. B. Größe × Farbe).</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {gruppen.map((g) => {
              const vs = variantenByGruppe.get(g.id) ?? [];
              const vorhanden = new Set(vs.map((v) => zelleKey(v.achse1_wert, v.achse2_wert)));
              const fehlt = fehlendeZellen({ achse1_werte: g.achse1_werte, achse2_werte: g.achse2_werte }, vorhanden);
              const w1 = parseWerte(g.achse1_werte);
              const w2 = parseWerte(g.achse2_werte);
              const zweiAchsen = w2.length > 0;
              const offen = offeneGruppe === g.id;
              const varByCell = new Map(vs.map((v) => [zelleKey(v.achse1_wert, v.achse2_wert), v]));
              const imLager = vs.filter((v) => v.artikel_id).length;
              return (
                <div key={g.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: "clamp(18px, 1.6vw, 26px)", fontWeight: 800 }}>
                        {g.bezeichnung}
                        {g.status === "archiviert" && <span style={{ marginLeft: 8, fontSize: "clamp(11px,0.9vw,15px)", color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 6px" }}>archiviert</span>}
                      </div>
                      <div style={{ color: C.textDim, fontSize: "clamp(13px, 1.13vw, 18px)", marginTop: 4 }}>
                        {g.achse1_name}: {w1.join(", ") || "—"}{zweiAchsen ? `  ·  ${g.achse2_name}: ${w2.join(", ")}` : ""}
                      </div>
                      <div style={{ color: C.textDim, fontSize: "clamp(12px, 1.06vw, 17px)", marginTop: 4 }}>
                        Basis-VK {eur(g.basis_vk)} · {vs.length} Variante{vs.length === 1 ? "" : "n"}
                        {fehlt.length > 0 && <span style={{ color: C.warn, fontWeight: 700 }}> · {fehlt.length} Lücke{fehlt.length === 1 ? "" : "n"}</span>}
                        {fehlt.length === 0 && vs.length > 0 && <span style={{ color: C.green, fontWeight: 700 }}> · vollständig</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {fehlt.length > 0 && <button style={btnGold} onClick={() => erzeugeMatrix(g)}>⚡ Matrix erzeugen ({fehlt.length})</button>}
                      {vs.length > 0 && <button style={btnGhost} onClick={() => variantenInsLager(g)} title="Jede Variante als Lager-Artikel anlegen/aktualisieren">🏬 Ins Lager ({imLager}/{vs.length})</button>}
                      <button style={btnGhost} onClick={() => setOffeneGruppe(offen ? null : g.id)}>{offen ? "▲ Matrix" : "▼ Matrix"}</button>
                      <button style={btnGhost} onClick={() => { setVarFilter(g.id); setTab("varianten"); }}>Varianten ›</button>
                      <button style={btnGhost} onClick={() => pdfFuerGruppe(g)}>📄 PDF</button>
                      <button style={btnGhost} onClick={() => oeffneGruppeBearbeiten(g)}>Bearbeiten</button>
                      <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loescheGruppe(g)}>Löschen</button>
                    </div>
                  </div>

                  {/* Matrix-Gitter */}
                  {offen && w1.length > 0 && (
                    <div style={{ marginTop: 14, overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", minWidth: 320 }}>
                        <thead>
                          <tr>
                            <th style={{ ...thStil }}>{g.achse1_name} ↓ {zweiAchsen ? `/ ${g.achse2_name} →` : ""}</th>
                            {(zweiAchsen ? w2 : [""]).map((c, i) => (
                              <th key={i} style={{ ...thStil, textAlign: "center" }}>{c || "—"}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {w1.map((r) => (
                            <tr key={r}>
                              <td style={{ ...tdStil, fontWeight: 700 }}>{r}</td>
                              {(zweiAchsen ? w2 : [""]).map((c, i) => {
                                const v = varByCell.get(zelleKey(r, c));
                                if (!v) return <td key={i} style={{ ...tdStil, textAlign: "center", color: C.textDim }}>—</td>;
                                const st = bestandStufe(v.bestand, v.mindestbestand);
                                return (
                                  <td key={i} style={{ ...tdStil, textAlign: "center", cursor: "pointer" }} onClick={() => oeffneVarianteBearbeiten(v)}>
                                    <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: STUFE_FARBE[st], marginRight: 6 }} />
                                    <span style={{ fontWeight: 700 }}>{num(v.bestand)}</span>
                                    <div style={{ fontSize: "clamp(10px,0.85vw,13px)", color: C.textDim }}>{v.sku || ""}</div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ marginTop: 8 }}>
                        <button style={btnGhost} onClick={() => oeffneNeueVariante(g.id)}>+ Einzelne Variante</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        // ============ VARIANTEN ============
        <div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <select style={{ ...inputStil, maxWidth: 320 }} value={varFilter} onChange={(e) => setVarFilter(e.target.value)}>
              <option value="">Alle Matrizen</option>
              {gruppen.map((g) => <option key={g.id} value={g.id}>{g.bezeichnung}</option>)}
            </select>
            {varFilter && <button style={btnGhost} onClick={() => oeffneNeueVariante(varFilter)}>+ Variante</button>}
          </div>
          <div style={{ ...card, padding: 0, overflowX: "auto" }}>
            {gefilterteVarianten.length === 0 ? (
              <div style={{ padding: 30, color: C.textDim }}>Keine Varianten. Lege eine Matrix an und erzeuge die Varianten auf einen Schlag.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStil}></th>
                    <th style={thStil}>SKU</th>
                    <th style={thStil}>Matrix</th>
                    <th style={thStil}>Merkmale</th>
                    <th style={{ ...thStil, textAlign: "right" }}>Aufpreis</th>
                    <th style={{ ...thStil, textAlign: "right" }}>VK</th>
                    <th style={{ ...thStil, textAlign: "right" }}>Bestand</th>
                    <th style={{ ...thStil, textAlign: "right" }}>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {gefilterteVarianten.map((v) => {
                    const g = gruppeById.get(v.gruppe_id);
                    const st = bestandStufe(v.bestand, v.mindestbestand);
                    const merkmale = [v.achse1_wert, v.achse2_wert].filter(Boolean).join(" · ");
                    return (
                      <tr key={v.id} style={{ opacity: v.aktiv ? 1 : 0.5 }}>
                        <td style={{ ...tdStil, width: 14 }}>
                          <span title={st} style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: STUFE_FARBE[st], boxShadow: `0 0 8px ${STUFE_FARBE[st]}` }} />
                        </td>
                        <td style={tdStil}>
                          <span style={{ fontWeight: 600 }}>{v.sku || "—"}</span>
                          {v.ean && <div style={{ fontSize: "clamp(11px,0.94vw,15px)", color: C.textDim }}>EAN {v.ean}</div>}
                        </td>
                        <td style={{ ...tdStil, color: C.textDim }}>{g?.bezeichnung || "—"}</td>
                        <td style={tdStil}>{merkmale || "—"}</td>
                        <td style={{ ...tdStil, textAlign: "right", color: C.textDim }}>{(Number(v.aufpreis) || 0) === 0 ? "—" : eur(v.aufpreis)}</td>
                        <td style={{ ...tdStil, textAlign: "right", fontWeight: 700, color: C.gold }}>{eur(variantePreis(g?.basis_vk ?? 0, v.aufpreis))}</td>
                        <td style={{ ...tdStil, textAlign: "right", fontWeight: 700, color: STUFE_FARBE[st] }}>{num(v.bestand)}</td>
                        <td style={{ ...tdStil, textAlign: "right", whiteSpace: "nowrap" }}>
                          <button style={{ ...btnGhost, marginRight: 6 }} onClick={() => oeffneVarianteBearbeiten(v)}>Bearbeiten</button>
                          <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loescheVariante(v)}>Löschen</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Gruppen-Modal */}
      {gModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" }} onClick={() => setGModal(false)}>
          <div style={{ ...card, width: "100%", maxWidth: 620, background: C.navy }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(20px, 1.75vw, 28px)", fontWeight: 800 }}>{gEditId ? "Matrix bearbeiten" : "Neue Varianten-Matrix"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Bezeichnung *</label>
                <input style={inputStil} value={gForm.bezeichnung} onChange={(e) => setGF("bezeichnung", e.target.value)} placeholder="z. B. T-Shirt Basic" />
              </div>
              <div>
                <label style={labelStil}>SKU-Basis</label>
                <input style={inputStil} value={gForm.sku_basis} onChange={(e) => setGF("sku_basis", e.target.value)} placeholder="z. B. TSH" />
              </div>
              <div>
                <label style={labelStil}>Basis-Verkaufspreis (€)</label>
                <input style={inputStil} value={gForm.basis_vk} onChange={(e) => setGF("basis_vk", e.target.value)} inputMode="decimal" placeholder="0,00" />
              </div>
              <div>
                <label style={labelStil}>{gForm.achse1_name || "Achse 1"} — Name</label>
                <input style={inputStil} value={gForm.achse1_name} onChange={(e) => setGF("achse1_name", e.target.value)} placeholder="Größe" />
              </div>
              <div>
                <label style={labelStil}>{gForm.achse1_name || "Achse 1"} — Werte *</label>
                <input style={inputStil} value={gForm.achse1_werte} onChange={(e) => setGF("achse1_werte", e.target.value)} placeholder="S, M, L, XL" />
              </div>
              <div>
                <label style={labelStil}>Achse 2 — Name (optional)</label>
                <input style={inputStil} value={gForm.achse2_name} onChange={(e) => setGF("achse2_name", e.target.value)} placeholder="Farbe" />
              </div>
              <div>
                <label style={labelStil}>Achse 2 — Werte (optional)</label>
                <input style={inputStil} value={gForm.achse2_werte} onChange={(e) => setGF("achse2_werte", e.target.value)} placeholder="Schwarz, Weiß, Rot" />
              </div>
              <div>
                <label style={labelStil}>MwSt-Satz (%)</label>
                <input style={inputStil} value={gForm.mwst_satz} onChange={(e) => setGF("mwst_satz", e.target.value)} inputMode="decimal" placeholder="19" />
              </div>
              <div>
                <label style={labelStil}>Status</label>
                <select style={inputStil} value={gForm.status} onChange={(e) => setGF("status", e.target.value)}>
                  <option value="aktiv">aktiv</option>
                  <option value="archiviert">archiviert</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStil}>Basis-Artikel (optional, aus Lager)</label>
                <select style={inputStil} value={gForm.artikel_id} onChange={(e) => setGF("artikel_id", e.target.value)}>
                  <option value="">— kein Basis-Artikel —</option>
                  {artikel.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}</option>)}
                </select>
              </div>
            </div>
            {(() => {
              const anzahl = matrixZellen(parseWerte(gForm.achse1_werte), parseWerte(gForm.achse2_werte)).length;
              return <div style={{ marginTop: 14, color: C.cyan, fontSize: "clamp(13px,1.13vw,18px)" }}>Diese Matrix ergibt {anzahl} Variante{anzahl === 1 ? "" : "n"}.</div>;
            })()}
            {gFehler && <div style={{ marginTop: 12, color: C.danger, fontWeight: 600, fontSize: "clamp(13px,1.13vw,18px)" }}>{gFehler}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button style={btnGhost} onClick={() => setGModal(false)}>Abbrechen</button>
              <button style={{ ...btnGold, opacity: gSpeichern ? 0.6 : 1 }} onClick={speichereGruppe} disabled={gSpeichern}>{gSpeichern ? "Speichere…" : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Varianten-Modal */}
      {vModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" }} onClick={() => setVModal(false)}>
          <div style={{ ...card, width: "100%", maxWidth: 520, background: C.navy }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(20px, 1.75vw, 28px)", fontWeight: 800 }}>{vEditId ? "Variante bearbeiten" : "Neue Variante"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStil}>{gruppeById.get(vGruppeId ?? "")?.achse1_name || "Achse 1"} *</label>
                <input style={inputStil} value={vForm.achse1_wert} onChange={(e) => setVF("achse1_wert", e.target.value)} placeholder="z. B. M" />
              </div>
              <div>
                <label style={labelStil}>{gruppeById.get(vGruppeId ?? "")?.achse2_name || "Achse 2"}</label>
                <input style={inputStil} value={vForm.achse2_wert} onChange={(e) => setVF("achse2_wert", e.target.value)} placeholder="z. B. Rot" />
              </div>
              <div>
                <label style={labelStil}>SKU (leer = automatisch)</label>
                <input style={inputStil} value={vForm.sku} onChange={(e) => setVF("sku", e.target.value)} placeholder="automatisch" />
              </div>
              <div>
                <label style={labelStil}>EAN / Barcode</label>
                <input style={inputStil} value={vForm.ean} onChange={(e) => setVF("ean", e.target.value)} />
              </div>
              <div>
                <label style={labelStil}>Aufpreis auf Basis-VK (€)</label>
                <input style={inputStil} value={vForm.aufpreis} onChange={(e) => setVF("aufpreis", e.target.value)} inputMode="decimal" placeholder="0,00" />
              </div>
              <div>
                <label style={labelStil}>Bestand</label>
                <input style={inputStil} value={vForm.bestand} onChange={(e) => setVF("bestand", e.target.value)} inputMode="decimal" placeholder="0" />
              </div>
              <div>
                <label style={labelStil}>Mindestbestand</label>
                <input style={inputStil} value={vForm.mindestbestand} onChange={(e) => setVF("mindestbestand", e.target.value)} inputMode="decimal" placeholder="0" />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "clamp(14px,1.25vw,20px)", cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={vForm.aktiv} onChange={(e) => setVF("aktiv", e.target.checked)} /> aktiv
                </label>
              </div>
            </div>
            {vGruppeId && (
              <div style={{ marginTop: 12, color: C.textDim, fontSize: "clamp(13px,1.13vw,18px)" }}>
                Verkaufspreis: <span style={{ color: C.gold, fontWeight: 700 }}>{eur(variantePreis(gruppeById.get(vGruppeId)?.basis_vk ?? 0, zahl(vForm.aufpreis)))}</span>
              </div>
            )}
            {vFehler && <div style={{ marginTop: 12, color: C.danger, fontWeight: 600, fontSize: "clamp(13px,1.13vw,18px)" }}>{vFehler}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button style={btnGhost} onClick={() => setVModal(false)}>Abbrechen</button>
              <button style={{ ...btnGold, opacity: vSpeichern ? 0.6 : 1 }} onClick={speichereVariante} disabled={vSpeichern}>{vSpeichern ? "Speichere…" : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
