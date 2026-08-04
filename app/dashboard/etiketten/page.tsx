"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";
import { augeEtiketten } from "@/lib/auge";
import {
  ALLERGENE,
  parseAllergene,
  allergenNamen,
  findeAllergene,
  fehlendePflichtangaben,
  naehrwertVollstaendig,
  energiePlausibel,
  kcalAusKj,
  zutatenSegmente,
  zaehleEtiketten,
  type EtikettLite,
} from "@/lib/etiketten";
import { etikettPdf } from "@/lib/etikettPdf";

// ---------------------------------------------------------------------
// ARGONAUT OS · L2-2 · Etiketten & Kennzeichnung nach LMIV (EU 1169/2011)
// Zutaten mit hervorgehobenen Allergenen (14 Pflichtallergene), Nährwerte
// je 100 g/ml, Pflichtangaben-Prüfung und Etiketten-PDF. Lose = nur Allergene.
// ---------------------------------------------------------------------

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const C = {
  navy: "#0A1628", navy2: "#0F1F33", gold: "#C9A84C", cyan: "#00e5ff",
  green: "#4CAF7D", danger: "#E06666", warn: "#E0A24C", textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

interface Produkt {
  id: string;
  artikel_id: string | null;
  bezeichnung: string;
  art: string;
  zutaten: string | null;
  allergene: string | null;
  spuren: string | null;
  nettomenge: string | null;
  mhd: string | null;
  aufbewahrung: string | null;
  verantwortlicher: string | null;
  ursprung: string | null;
  alkohol: number | null;
  charge: string | null;
  energie_kj: number | null;
  energie_kcal: number | null;
  fett: number | null;
  gesaettigt: number | null;
  kohlenhydrate: number | null;
  zucker: number | null;
  eiweiss: number | null;
  salz: number | null;
  naehrwert_basis: string | null;
  status: string;
  created_at: string;
}
interface ArtikelKurz { id: string; bezeichnung: string; }

const NW: { key: keyof FormState; label: string; einheit: string; unter?: boolean }[] = [
  { key: "energie_kj", label: "Brennwert", einheit: "kJ" },
  { key: "energie_kcal", label: "Brennwert", einheit: "kcal" },
  { key: "fett", label: "Fett", einheit: "g" },
  { key: "gesaettigt", label: "davon gesättigte Fettsäuren", einheit: "g", unter: true },
  { key: "kohlenhydrate", label: "Kohlenhydrate", einheit: "g" },
  { key: "zucker", label: "davon Zucker", einheit: "g", unter: true },
  { key: "eiweiss", label: "Eiweiß", einheit: "g" },
  { key: "salz", label: "Salz", einheit: "g" },
];

type FormState = {
  bezeichnung: string; art: string; artikel_id: string;
  zutaten: string; allergene: string[]; spuren: string;
  nettomenge: string; mhd: string; aufbewahrung: string; verantwortlicher: string;
  ursprung: string; alkohol: string; charge: string;
  energie_kj: string; energie_kcal: string; fett: string; gesaettigt: string;
  kohlenhydrate: string; zucker: string; eiweiss: string; salz: string;
  naehrwert_basis: string; status: string;
};
const LEER: FormState = {
  bezeichnung: "", art: "verpackt", artikel_id: "",
  zutaten: "", allergene: [], spuren: "",
  nettomenge: "", mhd: "", aufbewahrung: "", verantwortlicher: "",
  ursprung: "", alkohol: "", charge: "",
  energie_kj: "", energie_kcal: "", fett: "", gesaettigt: "",
  kohlenhydrate: "", zucker: "", eiweiss: "", salz: "",
  naehrwert_basis: "100 g", status: "aktiv",
};

function zahl(s: string): number | null { return s.trim() === "" ? null : Number(s.replace(",", ".")); }
function num(n: number | null): string { return (Number(n) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 }); }

export default function EtikettenSeite() {
  const [produkte, setProdukte] = useState<Produkt[]>([]);
  const [artikel, setArtikel] = useState<ArtikelKurz[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [suche, setSuche] = useState("");
  const [artFilter, setArtFilter] = useState("");
  const [hinweis, setHinweis] = useState<string | null>(null);

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(LEER);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichern, setSpeichern] = useState(false);

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
    const [p, a] = await Promise.all([
      supabase.from("etikett_produkt").select("*").order("bezeichnung", { ascending: true }),
      supabase.from("artikel").select("id, bezeichnung").eq("aktiv", true).order("bezeichnung", { ascending: true }),
    ]);
    if (!p.error && p.data) setProdukte(p.data as Produkt[]);
    if (!a.error && a.data) setArtikel(a.data as ArtikelKurz[]);
    setLaden(false);
  }

  const kpi = useMemo(() => zaehleEtiketten(produkte), [produkte]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return produkte.filter((p) => {
      if (artFilter && p.art !== artFilter) return false;
      if (q) {
        const hay = [p.bezeichnung, p.zutaten, p.verantwortlicher].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [produkte, suche, artFilter]);

  function setF<K extends keyof FormState>(k: K, w: FormState[K]) { setForm((f) => ({ ...f, [k]: w })); }
  function toggleAllergen(key: string) {
    setForm((f) => ({ ...f, allergene: f.allergene.includes(key) ? f.allergene.filter((k) => k !== key) : [...f.allergene, key] }));
  }

  function oeffneNeu() { setEditId(null); setForm(LEER); setFehler(null); setModal(true); }
  function oeffneBearbeiten(p: Produkt) {
    setEditId(p.id);
    setForm({
      bezeichnung: p.bezeichnung ?? "", art: p.art ?? "verpackt", artikel_id: p.artikel_id ?? "",
      zutaten: p.zutaten ?? "", allergene: parseAllergene(p.allergene), spuren: p.spuren ?? "",
      nettomenge: p.nettomenge ?? "", mhd: p.mhd ?? "", aufbewahrung: p.aufbewahrung ?? "", verantwortlicher: p.verantwortlicher ?? "",
      ursprung: p.ursprung ?? "", alkohol: p.alkohol != null ? String(p.alkohol) : "", charge: p.charge ?? "",
      energie_kj: p.energie_kj != null ? String(p.energie_kj) : "", energie_kcal: p.energie_kcal != null ? String(p.energie_kcal) : "",
      fett: p.fett != null ? String(p.fett) : "", gesaettigt: p.gesaettigt != null ? String(p.gesaettigt) : "",
      kohlenhydrate: p.kohlenhydrate != null ? String(p.kohlenhydrate) : "", zucker: p.zucker != null ? String(p.zucker) : "",
      eiweiss: p.eiweiss != null ? String(p.eiweiss) : "", salz: p.salz != null ? String(p.salz) : "",
      naehrwert_basis: p.naehrwert_basis ?? "100 g", status: p.status ?? "aktiv",
    });
    setFehler(null); setModal(true);
  }

  function formAlsLite(): EtikettLite {
    return {
      art: form.art, bezeichnung: form.bezeichnung, zutaten: form.zutaten,
      nettomenge: form.nettomenge, mhd: form.mhd, verantwortlicher: form.verantwortlicher,
      allergene: form.allergene.join(";"),
      energie_kj: zahl(form.energie_kj), energie_kcal: zahl(form.energie_kcal), fett: zahl(form.fett), gesaettigt: zahl(form.gesaettigt),
      kohlenhydrate: zahl(form.kohlenhydrate), zucker: zahl(form.zucker), eiweiss: zahl(form.eiweiss), salz: zahl(form.salz),
    };
  }

  async function speichere() {
    if (!form.bezeichnung.trim()) { setFehler("Verkehrsbezeichnung ist Pflicht."); return; }
    setSpeichern(true); setFehler(null);
    const payload = {
      artikel_id: form.artikel_id || null,
      bezeichnung: form.bezeichnung.trim(), art: form.art || "verpackt",
      zutaten: form.zutaten.trim() || null, allergene: form.allergene.join(";") || null, spuren: form.spuren.trim() || null,
      nettomenge: form.nettomenge.trim() || null, mhd: form.mhd.trim() || null, aufbewahrung: form.aufbewahrung.trim() || null,
      verantwortlicher: form.verantwortlicher.trim() || null, ursprung: form.ursprung.trim() || null,
      alkohol: zahl(form.alkohol), charge: form.charge.trim() || null,
      energie_kj: zahl(form.energie_kj), energie_kcal: zahl(form.energie_kcal), fett: zahl(form.fett), gesaettigt: zahl(form.gesaettigt),
      kohlenhydrate: zahl(form.kohlenhydrate), zucker: zahl(form.zucker), eiweiss: zahl(form.eiweiss), salz: zahl(form.salz),
      naehrwert_basis: form.naehrwert_basis || "100 g", status: form.status || "aktiv",
    };
    let error = null as { message: string } | null;
    if (editId) {
      const res = await supabase.from("etikett_produkt").update(payload).eq("id", editId);
      error = res.error;
    } else {
      const insertObj = userId ? { ...payload, owner_user_id: userId } : payload;
      const res = await supabase.from("etikett_produkt").insert(insertObj);
      error = res.error;
    }
    setSpeichern(false);
    if (error) { setFehler("Speichern fehlgeschlagen: " + error.message); return; }
    setModal(false); await ladeAlles();
  }

  async function loesche(p: Produkt) {
    if (!window.confirm(`Etikett „${p.bezeichnung}" wirklich löschen?`)) return;
    const { error } = await supabase.from("etikett_produkt").delete().eq("id", p.id);
    if (error) { window.alert("Löschen fehlgeschlagen: " + error.message); return; }
    await ladeAlles();
  }

  function vorschlagAllergene() {
    const gefunden = findeAllergene(form.zutaten);
    if (gefunden.length === 0) { setHinweis("Keine bekannten Allergene im Zutatentext erkannt — bitte manuell prüfen."); return; }
    setForm((f) => ({ ...f, allergene: [...new Set([...f.allergene, ...gefunden])] }));
    setHinweis(`${gefunden.length} Allergen(e) aus den Zutaten übernommen — bitte gegenprüfen.`);
  }

  async function pdf(p: Produkt) {
    const { data: userData } = await supabase.auth.getUser();
    const meta = userData.user?.user_metadata ?? {};
    const aussteller = meta.firma || meta.firmenname || meta.name || "ARGONAUT OS";
    const keys = parseAllergene(p.allergene);
    const nwRows = [
      { key: "energie_kj", label: "Brennwert", einheit: "kJ", wert: p.energie_kj },
      { key: "energie_kcal", label: "Brennwert", einheit: "kcal", wert: p.energie_kcal },
      { key: "fett", label: "Fett", einheit: "g", wert: p.fett },
      { key: "gesaettigt", label: "davon gesättigte Fettsäuren", einheit: "g", wert: p.gesaettigt, unter: true },
      { key: "kohlenhydrate", label: "Kohlenhydrate", einheit: "g", wert: p.kohlenhydrate },
      { key: "zucker", label: "davon Zucker", einheit: "g", wert: p.zucker, unter: true },
      { key: "eiweiss", label: "Eiweiß", einheit: "g", wert: p.eiweiss },
      { key: "salz", label: "Salz", einheit: "g", wert: p.salz },
    ].filter((r) => r.wert != null).map((r) => ({ label: r.label, einheit: r.einheit, wert: num(r.wert), unter: r.unter }));
    etikettPdf({
      aussteller: String(aussteller), bezeichnung: p.bezeichnung, art: p.art,
      datum: new Date().toLocaleDateString("de-DE"),
      zutatenSegmente: zutatenSegmente(p.zutaten, keys),
      allergene: allergenNamen(keys),
      spuren: p.spuren ?? undefined,
      nettomenge: p.nettomenge ?? undefined, mhd: p.mhd ?? undefined, aufbewahrung: p.aufbewahrung ?? undefined,
      verantwortlicher: p.verantwortlicher ?? undefined, ursprung: p.ursprung ?? undefined,
      alkohol: p.alkohol != null ? `${num(p.alkohol)} % vol` : undefined, charge: p.charge ?? undefined,
      naehrwertBasis: p.naehrwert_basis ?? "100 g", naehrwert: nwRows,
    });
  }

  async function importiereCsv(text: string) {
    const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
    if (zeilen.length < 2) { setHinweis("CSV enthält keine Datenzeilen."); return; }
    const kopf = zeilen[0].split(";").map((s) => s.trim().toLowerCase());
    const idx = (n: string) => kopf.indexOf(n);
    if (idx("bezeichnung") < 0) { setHinweis("CSV-Kopf braucht mindestens die Spalte bezeichnung."); return; }
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < zeilen.length; i++) {
      const sp = zeilen[i].split(";");
      const val = (n: string) => { const k = idx(n); return k >= 0 ? (sp[k] ?? "").trim() : ""; };
      const znum = (n: string) => { const v = val(n); return v === "" ? null : Number(v.replace(",", ".")); };
      if (!val("bezeichnung")) continue;
      const base: Record<string, unknown> = {
        bezeichnung: val("bezeichnung"), art: val("art") || "verpackt",
        zutaten: val("zutaten") || null, allergene: parseAllergene(val("allergene")).join(";") || null,
        nettomenge: val("nettomenge") || null, mhd: val("mhd") || null, aufbewahrung: val("aufbewahrung") || null,
        verantwortlicher: val("verantwortlicher") || null,
        energie_kj: znum("energie_kj"), energie_kcal: znum("energie_kcal"), fett: znum("fett"), gesaettigt: znum("gesaettigt"),
        kohlenhydrate: znum("kohlenhydrate"), zucker: znum("zucker"), eiweiss: znum("eiweiss"), salz: znum("salz"),
        naehrwert_basis: "100 g", status: "aktiv",
      };
      rows.push(userId ? { ...base, owner_user_id: userId } : base);
    }
    if (rows.length === 0) { setHinweis("Keine gültigen Zeilen gefunden."); return; }
    const { error } = await supabase.from("etikett_produkt").insert(rows);
    if (error) { window.alert("Import fehlgeschlagen: " + error.message); return; }
    setHinweis(`${rows.length} Etikett(en) importiert.`); await ladeAlles();
  }
  function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => importiereCsv(String(r.result || "")); r.readAsText(f, "utf-8"); e.target.value = "";
  }

  // Live-Berechnungen im Modal
  const lite = formAlsLite();
  const fehlend = fehlendePflichtangaben(lite);
  const nwVoll = naehrwertVollstaendig(lite);
  const energieOk = energiePlausibel(zahl(form.energie_kj), zahl(form.energie_kcal));
  const enthaeltNamen = allergenNamen(form.allergene);

  // ---------------- Styles ----------------
  const card: React.CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px" };
  const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: "clamp(14px,1.25vw,20px)", boxSizing: "border-box" };
  const label: React.CSSProperties = { display: "block", fontSize: "clamp(12px,1.06vw,17px)", color: C.textDim, marginBottom: 6, fontWeight: 600 };
  const btnGold: React.CSSProperties = { padding: "10px 18px", borderRadius: 8, border: "none", background: C.gold, color: C.navy, fontWeight: 700, fontSize: "clamp(14px,1.25vw,20px)", cursor: "pointer" };
  const btnGhost: React.CSSProperties = { padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "clamp(13px,1.13vw,18px)", cursor: "pointer" };
  const kachel: React.CSSProperties = { ...card, padding: "14px 16px" };
  const kLabel: React.CSSProperties = { color: C.textDim, fontSize: "clamp(12px,1.06vw,17px)", fontWeight: 600 };
  const kWert: React.CSSProperties = { fontSize: "clamp(24px,2.1vw,34px)", fontWeight: 800, marginTop: 4 };

  return (
    <div style={{ color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "clamp(26px,2.25vw,36px)", fontWeight: 800 }}>🏷️ Etiketten & LMIV</h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: "clamp(14px,1.25vw,20px)" }}>
            Zutaten mit hervorgehobenen Allergenen, Nährwerte je 100 g und rechtssicheres Etikett
          </p>
        </div>
        <button style={btnGold} onClick={oeffneNeu}>+ Etikett anlegen</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 18 }}>
        <div style={kachel}><div style={kLabel}>Etiketten</div><div style={kWert}>{kpi.gesamt}</div></div>
        <div style={kachel}><div style={kLabel}>Unvollständig</div><div style={{ ...kWert, color: kpi.unvollstaendig > 0 ? C.danger : C.green }}>{kpi.unvollstaendig}</div></div>
        <div style={kachel}><div style={kLabel}>Ohne Nährwerte</div><div style={{ ...kWert, color: kpi.ohneNaehrwert > 0 ? C.warn : C.green }}>{kpi.ohneNaehrwert}</div></div>
        <div style={kachel}><div style={kLabel}>Fertigverpackt</div><div style={kWert}>{kpi.verpackt}</div></div>
      </div>

      <KiAuge modul="Etiketten & LMIV" regel={augeEtiketten({ unvollstaendig: kpi.unvollstaendig, ohneNaehrwert: kpi.ohneNaehrwert, gesamt: kpi.gesamt })} />

      {hinweis && (
        <div style={{ ...card, marginTop: 14, borderColor: "rgba(0,229,255,0.35)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ color: C.cyan }}>{hinweis}</span>
          <button style={btnGhost} onClick={() => setHinweis(null)}>OK</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "18px 0 14px" }}>
        <input style={{ ...input, maxWidth: 320 }} placeholder="Suche: Bezeichnung, Zutaten…" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <select style={{ ...input, maxWidth: 220 }} value={artFilter} onChange={(e) => setArtFilter(e.target.value)}>
          <option value="">Alle Arten</option>
          <option value="verpackt">Fertigverpackt</option>
          <option value="lose">Lose Ware / Gastro</option>
        </select>
        <label style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6 }}>
          ⤓ CSV importieren
          <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onCsv} />
        </label>
      </div>

      {laden ? (
        <div style={{ ...card, color: C.textDim }}>Lade Etiketten…</div>
      ) : gefiltert.length === 0 ? (
        <div style={{ ...card, color: C.textDim }}>Noch keine Etiketten. Lege oben rechts dein erstes Produkt an — Allergene ankreuzen, Nährwerte eintragen, Etikett drucken.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {gefiltert.map((p) => {
            const keys = parseAllergene(p.allergene);
            const fehltP = fehlendePflichtangaben(p);
            const namen = allergenNamen(keys);
            return (
              <div key={p.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: "clamp(17px,1.5vw,24px)", fontWeight: 800 }}>
                      {p.bezeichnung}
                      <span style={{ marginLeft: 8, fontSize: "clamp(11px,0.9vw,15px)", color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 6px" }}>
                        {p.art === "lose" ? "lose" : "verpackt"}
                      </span>
                      {fehltP.length === 0 ? (
                        <span style={{ marginLeft: 8, color: C.green, fontSize: "clamp(12px,1vw,16px)", fontWeight: 700 }}>✓ LMIV-vollständig</span>
                      ) : (
                        <span style={{ marginLeft: 8, color: C.danger, fontSize: "clamp(12px,1vw,16px)", fontWeight: 700 }}>⚠ fehlt: {fehltP.join(", ")}</span>
                      )}
                    </div>
                    {namen.length > 0 && (
                      <div style={{ color: C.textDim, fontSize: "clamp(13px,1.13vw,18px)", marginTop: 6 }}>
                        <span style={{ color: C.warn, fontWeight: 700 }}>Enthält:</span> {namen.join(", ")}
                      </div>
                    )}
                    {p.zutaten && <div style={{ color: C.textDim, fontSize: "clamp(12px,1.06vw,16px)", marginTop: 4, opacity: 0.8 }}>{p.zutaten.slice(0, 140)}{p.zutaten.length > 140 ? "…" : ""}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button style={btnGhost} onClick={() => pdf(p)}>📄 Etikett</button>
                    <button style={btnGhost} onClick={() => oeffneBearbeiten(p)}>Bearbeiten</button>
                    <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loesche(p)}>Löschen</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" }} onClick={() => setModal(false)}>
          <div style={{ ...card, width: "100%", maxWidth: 680, background: C.navy }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(20px,1.75vw,28px)", fontWeight: 800 }}>{editId ? "Etikett bearbeiten" : "Neues Etikett"}</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Verkehrsbezeichnung *</label>
                <input style={input} value={form.bezeichnung} onChange={(e) => setF("bezeichnung", e.target.value)} placeholder="z. B. Butterkeks" />
              </div>
              <div>
                <label style={label}>Art</label>
                <select style={input} value={form.art} onChange={(e) => setF("art", e.target.value)}>
                  <option value="verpackt">Fertigverpackt (volle LMIV)</option>
                  <option value="lose">Lose Ware / Gastro (nur Allergene)</option>
                </select>
              </div>
              <div>
                <label style={label}>Basis-Artikel (optional)</label>
                <select style={input} value={form.artikel_id} onChange={(e) => setF("artikel_id", e.target.value)}>
                  <option value="">— keiner —</option>
                  {artikel.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Zutatenverzeichnis (absteigende Reihenfolge)</label>
                <textarea style={{ ...input, minHeight: 70, resize: "vertical" }} value={form.zutaten} onChange={(e) => setF("zutaten", e.target.value)} placeholder="Weizenmehl, Zucker, Butter (Milch), Eier, …" />
                <button style={{ ...btnGhost, marginTop: 8 }} onClick={vorschlagAllergene}>🔎 Allergene aus Zutaten vorschlagen</button>
              </div>
            </div>

            {/* Allergen-Häkchen */}
            <div style={{ marginTop: 16 }}>
              <label style={label}>Allergene (14 Pflichtallergene · im Etikett fett)</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 6 }}>
                {ALLERGENE.map((a) => {
                  const an = form.allergene.includes(a.key);
                  return (
                    <label key={a.key} title={a.beispiele} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, border: `1px solid ${an ? C.gold : C.border}`, background: an ? "rgba(201,168,76,0.12)" : "transparent", cursor: "pointer", fontSize: "clamp(12px,1vw,16px)" }}>
                      <input type="checkbox" checked={an} onChange={() => toggleAllergen(a.key)} />
                      {a.name}
                    </label>
                  );
                })}
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={label}>Spuren von (optional)</label>
                <input style={input} value={form.spuren} onChange={(e) => setF("spuren", e.target.value)} placeholder="z. B. Schalenfrüchte, Sesam" />
              </div>
            </div>

            {/* Nährwerte */}
            {form.art !== "lose" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <label style={{ ...label, marginBottom: 0 }}>Nährwerte je</label>
                  <select style={{ ...input, maxWidth: 140 }} value={form.naehrwert_basis} onChange={(e) => setF("naehrwert_basis", e.target.value)}>
                    <option value="100 g">100 g</option>
                    <option value="100 ml">100 ml</option>
                  </select>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 8 }}>
                  {NW.map((f) => (
                    <div key={f.key}>
                      <label style={{ ...label, marginBottom: 4, paddingLeft: f.unter ? 10 : 0 }}>{f.label} ({f.einheit})</label>
                      <input style={input} value={form[f.key] as string} onChange={(e) => setF(f.key, e.target.value)} inputMode="decimal" placeholder="0" />
                    </div>
                  ))}
                </div>
                {!energieOk && <div style={{ marginTop: 8, color: C.warn, fontSize: "clamp(12px,1vw,16px)" }}>⚠ Brennwert kJ/kcal passen nicht zusammen (≈ {num(kcalAusKj(zahl(form.energie_kj) ?? 0))} kcal erwartet).</div>}
              </div>
            )}

            {/* Pflicht-Infos */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
              <div><label style={label}>Nettofüllmenge</label><input style={input} value={form.nettomenge} onChange={(e) => setF("nettomenge", e.target.value)} placeholder="z. B. 200 g" /></div>
              <div><label style={label}>Mindesthaltbarkeitsdatum</label><input style={input} value={form.mhd} onChange={(e) => setF("mhd", e.target.value)} placeholder="z. B. siehe Deckel" /></div>
              <div><label style={label}>Aufbewahrung</label><input style={input} value={form.aufbewahrung} onChange={(e) => setF("aufbewahrung", e.target.value)} placeholder="z. B. kühl & trocken" /></div>
              <div><label style={label}>Ursprungsland (optional)</label><input style={input} value={form.ursprung} onChange={(e) => setF("ursprung", e.target.value)} /></div>
              <div><label style={label}>Alkohol (% vol, optional)</label><input style={input} value={form.alkohol} onChange={(e) => setF("alkohol", e.target.value)} inputMode="decimal" /></div>
              <div><label style={label}>Los-/Chargennummer (optional)</label><input style={input} value={form.charge} onChange={(e) => setF("charge", e.target.value)} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Verantwortlicher Lebensmittelunternehmer (Name + Anschrift)</label><input style={input} value={form.verantwortlicher} onChange={(e) => setF("verantwortlicher", e.target.value)} placeholder="Firma, Straße, PLZ Ort" /></div>
            </div>

            {/* Live-Prüfung */}
            <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, border: `1px solid ${fehlend.length ? "rgba(224,102,102,0.4)" : "rgba(76,175,125,0.4)"}`, background: fehlend.length ? "rgba(224,102,102,0.08)" : "rgba(76,175,125,0.08)" }}>
              {fehlend.length === 0 ? (
                <span style={{ color: C.green, fontWeight: 700 }}>✓ Alle LMIV-Pflichtangaben vorhanden{form.art !== "lose" && nwVoll ? " (inkl. Nährwerte)" : ""}.</span>
              ) : (
                <span style={{ color: C.danger }}><b>Es fehlt noch:</b> {fehlend.join(", ")}</span>
              )}
              {enthaeltNamen.length > 0 && <div style={{ marginTop: 6, color: C.textDim, fontSize: "clamp(12px,1vw,16px)" }}><b style={{ color: C.warn }}>Enthält:</b> {enthaeltNamen.join(", ")}</div>}
            </div>

            {fehler && <div style={{ marginTop: 12, color: C.danger, fontWeight: 600, fontSize: "clamp(13px,1.13vw,18px)" }}>{fehler}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button style={btnGhost} onClick={() => setModal(false)}>Abbrechen</button>
              <button style={{ ...btnGold, opacity: speichern ? 0.6 : 1 }} onClick={speichere} disabled={speichern}>{speichern ? "Speichere…" : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
