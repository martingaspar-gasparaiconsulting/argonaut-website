"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";
import { augeItAssets } from "@/lib/auge";
import {
  ASSET_TYP,
  ASSET_STATUS,
  LIZENZ_TYP,
  ablaufStatus,
  freiePlaetze,
  istUeberbucht,
  kostenProMonat,
  zaehleItAssets,
  type AblaufStatus,
} from "@/lib/itassets";
import { itBerichtPdf, type Ampel } from "@/lib/itBerichtPdf";
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from "../_components/EigeneFelder";
import { NurVoll } from '../_components/Ansicht';
import type { EigenesFeld } from "@/lib/eigeneFelder";

const MODUL = "it_asset";

// ---------------------------------------------------------------------
// ARGONAUT OS · L2-4 · Lizenz-, Asset- & SLA-Verwaltung (IT/MSP)
// 3 Reiter: Assets (Garantie), Lizenzen (Plätze/Ablauf/Kosten), SLA.
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
const AMPEL_FARBE: Record<AblaufStatus, string> = { ok: C.green, bald: C.warn, abgelaufen: C.danger, kein: C.textDim };

interface Asset { id: string; kunde: string | null; bezeichnung: string; typ: string; hersteller: string | null; modell: string | null; seriennr: string | null; standort: string | null; status: string; anschaffung: string | null; garantie_bis: string | null; notiz: string | null; }
interface Lizenz { id: string; kunde: string | null; bezeichnung: string; hersteller: string | null; lizenztyp: string; plaetze: number | null; belegt: number | null; start: string | null; ablauf: string | null; kosten_jahr: number | null; schluessel: string | null; notiz: string | null; status: string; }
interface Sla { id: string; kunde: string | null; bezeichnung: string; reaktion_std: number | null; wiederherstell_std: number | null; servicezeit: string | null; verfuegbarkeit: number | null; gueltig_bis: string | null; notiz: string | null; }

const heute = () => new Date().toISOString().slice(0, 10);
function zahl(s: string): number | null { return s.trim() === "" ? null : Number(s.replace(",", ".")); }
function ganz(s: string): number | null { return s.trim() === "" ? null : Math.floor(Number(s.replace(",", "."))); }
function eur(n: number | null): string { return n == null ? "—" : (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" }); }
function dstr(s: string | null): string { return s ? new Date(s).toLocaleDateString("de-DE") : "—"; }

type AssetForm = { kunde: string; bezeichnung: string; typ: string; hersteller: string; modell: string; seriennr: string; standort: string; status: string; anschaffung: string; garantie_bis: string; notiz: string };
const LEER_A: AssetForm = { kunde: "", bezeichnung: "", typ: "hardware", hersteller: "", modell: "", seriennr: "", standort: "", status: "aktiv", anschaffung: "", garantie_bis: "", notiz: "" };
type LizenzForm = { kunde: string; bezeichnung: string; hersteller: string; lizenztyp: string; plaetze: string; belegt: string; start: string; ablauf: string; kosten_jahr: string; schluessel: string; notiz: string; status: string };
const LEER_L: LizenzForm = { kunde: "", bezeichnung: "", hersteller: "", lizenztyp: "abo", plaetze: "1", belegt: "0", start: "", ablauf: "", kosten_jahr: "", schluessel: "", notiz: "", status: "aktiv" };
type SlaForm = { kunde: string; bezeichnung: string; reaktion_std: string; wiederherstell_std: string; servicezeit: string; verfuegbarkeit: string; gueltig_bis: string; notiz: string };
const LEER_S: SlaForm = { kunde: "", bezeichnung: "", reaktion_std: "", wiederherstell_std: "", servicezeit: "Mo–Fr 8–17 Uhr", verfuegbarkeit: "", gueltig_bis: "", notiz: "" };

export default function ItAssetsSeite() {
  const [tab, setTab] = useState<"assets" | "lizenzen" | "sla">("assets");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [lizenzen, setLizenzen] = useState<Lizenz[]>([]);
  const [sla, setSla] = useState<Sla[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [suche, setSuche] = useState("");
  const [hinweis, setHinweis] = useState<string | null>(null);

  const [modal, setModal] = useState<null | "asset" | "lizenz" | "sla">(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [aForm, setAForm] = useState<AssetForm>(LEER_A);
  const [lForm, setLForm] = useState<LizenzForm>(LEER_L);
  const [sForm, setSForm] = useState<SlaForm>(LEER_S);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nmExtra, setNmExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

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
    const [a, l, s] = await Promise.all([
      supabase.from("it_asset").select("*").order("bezeichnung", { ascending: true }),
      supabase.from("it_lizenz").select("*").order("ablauf", { ascending: true }),
      supabase.from("it_sla").select("*").order("bezeichnung", { ascending: true }),
    ]);
    const rows = (!a.error && a.data ? (a.data as Asset[]) : []);
    if (!a.error && a.data) setAssets(rows);
    if (!l.error && l.data) setLizenzen(l.data as Lizenz[]);
    if (!s.error && s.data) setSla(s.data as Sla[]);
    setFelder(await ladeFelder(MODUL));
    setWerteMap(await ladeWerte(MODUL, rows.map((r) => r.id)));
    setLaden(false);
  }

  const kpi = useMemo(() => zaehleItAssets(assets, lizenzen, sla, heute()), [assets, lizenzen, sla]);

  const q = suche.trim().toLowerCase();
  const fAssets = useMemo(() => !q ? assets : assets.filter((a) => [a.bezeichnung, a.kunde, a.hersteller, a.seriennr].filter(Boolean).join(" ").toLowerCase().includes(q)), [assets, q]);
  const fLizenzen = useMemo(() => !q ? lizenzen : lizenzen.filter((l) => [l.bezeichnung, l.kunde, l.hersteller].filter(Boolean).join(" ").toLowerCase().includes(q)), [lizenzen, q]);
  const fSla = useMemo(() => !q ? sla : sla.filter((s) => [s.bezeichnung, s.kunde].filter(Boolean).join(" ").toLowerCase().includes(q)), [sla, q]);

  // ---------------- CRUD ----------------
  function openAsset(a?: Asset) {
    setEditId(a?.id ?? null);
    setAForm(a ? { kunde: a.kunde ?? "", bezeichnung: a.bezeichnung ?? "", typ: a.typ ?? "hardware", hersteller: a.hersteller ?? "", modell: a.modell ?? "", seriennr: a.seriennr ?? "", standort: a.standort ?? "", status: a.status ?? "aktiv", anschaffung: a.anschaffung ?? "", garantie_bis: a.garantie_bis ?? "", notiz: a.notiz ?? "" } : LEER_A);
    setNmExtra(a ? { ...(werteMap[a.id] ?? {}) } : {});
    setFehler(null); setModal("asset");
  }
  function openLizenz(l?: Lizenz) {
    setEditId(l?.id ?? null);
    setLForm(l ? { kunde: l.kunde ?? "", bezeichnung: l.bezeichnung ?? "", hersteller: l.hersteller ?? "", lizenztyp: l.lizenztyp ?? "abo", plaetze: l.plaetze != null ? String(l.plaetze) : "1", belegt: l.belegt != null ? String(l.belegt) : "0", start: l.start ?? "", ablauf: l.ablauf ?? "", kosten_jahr: l.kosten_jahr != null ? String(l.kosten_jahr) : "", schluessel: l.schluessel ?? "", notiz: l.notiz ?? "", status: l.status ?? "aktiv" } : LEER_L);
    setFehler(null); setModal("lizenz");
  }
  function openSla(s?: Sla) {
    setEditId(s?.id ?? null);
    setSForm(s ? { kunde: s.kunde ?? "", bezeichnung: s.bezeichnung ?? "", reaktion_std: s.reaktion_std != null ? String(s.reaktion_std) : "", wiederherstell_std: s.wiederherstell_std != null ? String(s.wiederherstell_std) : "", servicezeit: s.servicezeit ?? "", verfuegbarkeit: s.verfuegbarkeit != null ? String(s.verfuegbarkeit) : "", gueltig_bis: s.gueltig_bis ?? "", notiz: s.notiz ?? "" } : LEER_S);
    setFehler(null); setModal("sla");
  }

  async function speichere() {
    setBusy(true); setFehler(null);
    let error = null as { message: string } | null;
    if (modal === "asset") {
      if (!aForm.bezeichnung.trim()) { setBusy(false); setFehler("Bezeichnung ist Pflicht."); return; }
      const payload = { kunde: aForm.kunde.trim() || null, bezeichnung: aForm.bezeichnung.trim(), typ: aForm.typ, hersteller: aForm.hersteller.trim() || null, modell: aForm.modell.trim() || null, seriennr: aForm.seriennr.trim() || null, standort: aForm.standort.trim() || null, status: aForm.status, anschaffung: aForm.anschaffung || null, garantie_bis: aForm.garantie_bis || null, notiz: aForm.notiz.trim() || null };
      if (editId) {
        error = (await supabase.from("it_asset").update(payload).eq("id", editId)).error;
        if (!error) { try { await speichereWerte(MODUL, editId, userId, nmExtra); } catch { /* eigene Felder optional */ } }
      } else {
        const ins = userId ? { ...payload, owner_user_id: userId } : payload;
        const res = await supabase.from("it_asset").insert(ins).select("id").single();
        error = res.error;
        if (!error && res.data) { try { await speichereWerte(MODUL, (res.data as { id: string }).id, userId, nmExtra); } catch { /* eigene Felder optional */ } }
      }
      if (!error) setNmExtra({});
    } else if (modal === "lizenz") {
      if (!lForm.bezeichnung.trim()) { setBusy(false); setFehler("Bezeichnung ist Pflicht."); return; }
      const payload = { kunde: lForm.kunde.trim() || null, bezeichnung: lForm.bezeichnung.trim(), hersteller: lForm.hersteller.trim() || null, lizenztyp: lForm.lizenztyp, plaetze: ganz(lForm.plaetze) ?? 1, belegt: ganz(lForm.belegt) ?? 0, start: lForm.start || null, ablauf: lForm.ablauf || null, kosten_jahr: zahl(lForm.kosten_jahr), schluessel: lForm.schluessel.trim() || null, notiz: lForm.notiz.trim() || null, status: lForm.status };
      if (editId) error = (await supabase.from("it_lizenz").update(payload).eq("id", editId)).error;
      else { const ins = userId ? { ...payload, owner_user_id: userId } : payload; error = (await supabase.from("it_lizenz").insert(ins)).error; }
    } else if (modal === "sla") {
      if (!sForm.bezeichnung.trim()) { setBusy(false); setFehler("Bezeichnung ist Pflicht."); return; }
      const payload = { kunde: sForm.kunde.trim() || null, bezeichnung: sForm.bezeichnung.trim(), reaktion_std: zahl(sForm.reaktion_std), wiederherstell_std: zahl(sForm.wiederherstell_std), servicezeit: sForm.servicezeit.trim() || null, verfuegbarkeit: zahl(sForm.verfuegbarkeit), gueltig_bis: sForm.gueltig_bis || null, notiz: sForm.notiz.trim() || null };
      if (editId) error = (await supabase.from("it_sla").update(payload).eq("id", editId)).error;
      else { const ins = userId ? { ...payload, owner_user_id: userId } : payload; error = (await supabase.from("it_sla").insert(ins)).error; }
    }
    setBusy(false);
    if (error) { setFehler("Speichern fehlgeschlagen: " + error.message); return; }
    setModal(null); await ladeAlles();
  }
  async function loesche(tabelle: string, id: string, name: string) {
    if (!window.confirm(`„${name}" wirklich löschen?`)) return;
    const { error } = await supabase.from(tabelle).delete().eq("id", id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }

  function lizenzAmpel(l: Lizenz): Ampel { if (istUeberbucht(l.plaetze, l.belegt)) return "ueberbucht"; return ablaufStatus(l.ablauf, heute(), 60) as Ampel; }

  async function pdf() {
    const { data: userData } = await supabase.auth.getUser();
    const meta = userData.user?.user_metadata ?? {};
    const aussteller = meta.firma || meta.firmenname || meta.name || "ARGONAUT OS";
    itBerichtPdf({
      aussteller: String(aussteller), titel: "IT-Bestands- & Compliance-Bericht", datum: new Date().toLocaleDateString("de-DE"),
      assets: fAssets.map((a) => ({ bezeichnung: a.bezeichnung, kunde: a.kunde ?? "", typ: a.typ, hersteller: a.hersteller ?? "", seriennr: a.seriennr ?? "", status: a.status, garantie: dstr(a.garantie_bis), ampel: ablaufStatus(a.garantie_bis, heute()) as Ampel })),
      lizenzen: fLizenzen.map((l) => ({ bezeichnung: l.bezeichnung, kunde: l.kunde ?? "", typ: l.lizenztyp, plaetze: `${l.plaetze ?? 0} (${l.belegt ?? 0})`, ablauf: dstr(l.ablauf), kostenJahr: eur(l.kosten_jahr), ampel: lizenzAmpel(l) })),
      sla: fSla.map((s) => ({ bezeichnung: s.bezeichnung, kunde: s.kunde ?? "", reaktion: s.reaktion_std != null ? `${s.reaktion_std} h` : "—", wiederherstell: s.wiederherstell_std != null ? `${s.wiederherstell_std} h` : "—", verfuegbarkeit: s.verfuegbarkeit != null ? `${s.verfuegbarkeit} %` : "—", gueltigBis: dstr(s.gueltig_bis), ampel: ablaufStatus(s.gueltig_bis, heute(), 60) as Ampel })),
    });
  }

  async function importiereLizenzen(text: string) {
    const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
    if (zeilen.length < 2) { setHinweis("CSV enthält keine Datenzeilen."); return; }
    const kopf = zeilen[0].split(";").map((s) => s.trim().toLowerCase());
    const idx = (nme: string) => kopf.indexOf(nme);
    if (idx("bezeichnung") < 0) { setHinweis("CSV-Kopf braucht mindestens die Spalte bezeichnung."); return; }
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < zeilen.length; i++) {
      const sp = zeilen[i].split(";");
      const val = (nme: string) => { const k = idx(nme); return k >= 0 ? (sp[k] ?? "").trim() : ""; };
      if (!val("bezeichnung")) continue;
      const base: Record<string, unknown> = {
        kunde: val("kunde") || null, bezeichnung: val("bezeichnung"), hersteller: val("hersteller") || null,
        lizenztyp: val("lizenztyp") || "abo", plaetze: ganz(val("plaetze")) ?? 1, belegt: ganz(val("belegt")) ?? 0,
        start: val("start") || null, ablauf: val("ablauf") || null, kosten_jahr: zahl(val("kosten_jahr")),
        schluessel: val("schluessel") || null, status: "aktiv",
      };
      rows.push(userId ? { ...base, owner_user_id: userId } : base);
    }
    if (rows.length === 0) { setHinweis("Keine gültigen Zeilen gefunden."); return; }
    const { error } = await supabase.from("it_lizenz").insert(rows);
    if (error) { window.alert("Import fehlgeschlagen: " + error.message); return; }
    setHinweis(`${rows.length} Lizenz(en) importiert.`); await ladeAlles();
  }
  function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => importiereLizenzen(String(r.result || "")); r.readAsText(f, "utf-8"); e.target.value = "";
  }

  // ---------------- Styles ----------------
  const card: React.CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" };
  const input: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: "clamp(13px,1.15vw,18px)", boxSizing: "border-box" };
  const label: React.CSSProperties = { display: "block", fontSize: "clamp(12px,1.06vw,17px)", color: C.textDim, marginBottom: 5, fontWeight: 600 };
  const btnGold: React.CSSProperties = { padding: "9px 16px", borderRadius: 8, border: "none", background: C.gold, color: C.navy, fontWeight: 700, fontSize: "clamp(13px,1.15vw,18px)", cursor: "pointer" };
  const btnGhost: React.CSSProperties = { padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "clamp(12px,1.05vw,16px)", cursor: "pointer" };
  const kachel: React.CSSProperties = { ...card, padding: "13px 15px" };
  const kLabel: React.CSSProperties = { color: C.textDim, fontSize: "clamp(12px,1.02vw,16px)", fontWeight: 600 };
  const kWert: React.CSSProperties = { fontSize: "clamp(22px,2vw,32px)", fontWeight: 800, marginTop: 3 };
  const pill = (farbe: string): React.CSSProperties => ({ display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: "clamp(11px,0.95vw,15px)", fontWeight: 700, color: farbe, border: `1px solid ${farbe}55`, background: `${farbe}18` });
  const ampelPill = (s: AblaufStatus, txt: string) => <span style={pill(AMPEL_FARBE[s])}>{txt}</span>;

  return (
    <div style={{ color: "#fff", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: "clamp(26px,2.25vw,36px)", fontWeight: 800 }}>🖥️ Assets & Lizenzen</h1>
        <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: "clamp(14px,1.25vw,20px)" }}>IT-Assets mit Garantie, Lizenzen mit Plätzen & Ablauf und Service-Level-Agreements je Kunde</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={kachel}><div style={kLabel}>Assets</div><div style={kWert}>{kpi.assets}</div></div>
        <div style={kachel}><div style={kLabel}>Lizenzen</div><div style={kWert}>{kpi.lizenzen}</div></div>
        <div style={kachel}><div style={kLabel}>Bald fällig</div><div style={{ ...kWert, color: kpi.lizenzenBald > 0 ? C.warn : C.green }}>{kpi.lizenzenBald}</div></div>
        <div style={kachel}><div style={kLabel}>Abgel./überbucht</div><div style={{ ...kWert, color: (kpi.lizenzenAbgelaufen + kpi.ueberbucht) > 0 ? C.danger : C.green }}>{kpi.lizenzenAbgelaufen + kpi.ueberbucht}</div></div>
        <div style={kachel}><div style={kLabel}>Lizenzkosten/Jahr</div><div style={{ ...kWert, color: C.gold }}>{eur(kpi.kostenJahr)}</div></div>
      </div>

      <KiAuge modul="Assets & Lizenzen" regel={augeItAssets({ lizenzenAbgelaufen: kpi.lizenzenAbgelaufen, ueberbucht: kpi.ueberbucht, slaAbgelaufen: kpi.slaAbgelaufen, lizenzenBald: kpi.lizenzenBald, ohneGarantie: kpi.ohneGarantie, gesamt: kpi.gesamt })} />

      {hinweis && <div style={{ ...card, marginTop: 14, borderColor: "rgba(0,229,255,0.35)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><span style={{ color: C.cyan }}>{hinweis}</span><button style={btnGhost} onClick={() => setHinweis(null)}>OK</button></div>}

      <div style={{ display: "flex", gap: 8, margin: "16px 0 14px", flexWrap: "wrap", alignItems: "center" }}>
        <button style={tab === "assets" ? btnGold : btnGhost} onClick={() => setTab("assets")}>🖥 Assets</button>
        <button style={tab === "lizenzen" ? btnGold : btnGhost} onClick={() => setTab("lizenzen")}>🔑 Lizenzen</button>
        <button style={tab === "sla" ? btnGold : btnGhost} onClick={() => setTab("sla")}>📶 SLA</button>
        <input style={{ ...input, maxWidth: 260, marginLeft: "auto" }} placeholder="Suche Kunde / Bezeichnung…" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <button style={btnGhost} onClick={pdf}>📄 Bericht</button>
      </div>

      {laden ? (
        <div style={{ ...card, color: C.textDim }}>Lade…</div>
      ) : tab === "assets" ? (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button style={btnGold} onClick={() => openAsset()}>+ Asset</button></div>
          {fAssets.length === 0 ? <div style={{ ...card, color: C.textDim }}>Keine Assets.</div> : (
            <div style={{ display: "grid", gap: 8 }}>
              {fAssets.map((a) => { const g = ablaufStatus(a.garantie_bis, heute()); return (
                <div key={a.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <span style={{ fontSize: "clamp(15px,1.3vw,20px)", fontWeight: 700 }}>{a.bezeichnung}</span>
                    <span style={{ marginLeft: 8, ...pill(C.textDim) }}>{a.typ}</span>
                    {a.status !== "aktiv" && <span style={{ marginLeft: 6, ...pill(C.warn) }}>{a.status}</span>}
                    {a.garantie_bis && <span style={{ marginLeft: 8 }}>{ampelPill(g, `Garantie ${dstr(a.garantie_bis)}`)}</span>}
                    <div style={{ color: C.textDim, fontSize: "clamp(12px,1.05vw,16px)", marginTop: 4 }}>
                      {a.kunde ? `${a.kunde} · ` : ""}{[a.hersteller, a.modell].filter(Boolean).join(" ")}{a.seriennr ? ` · SN ${a.seriennr}` : ""}{a.standort ? ` · ${a.standort}` : ""}
                    </div>
                    <EigeneFelderAnzeige felder={felder} werte={werteMap[a.id]} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={btnGhost} onClick={() => openAsset(a)}>Bearbeiten</button>
                    <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loesche("it_asset", a.id, a.bezeichnung)}>✕</button>
                  </div>
                </div>
              ); })}
            </div>
          )}
          {userId && <EigeneFelderManager modul={MODUL} ownerId={userId} onChange={ladeAlles} />}
        </div>
      ) : tab === "lizenzen" ? (
        <div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 12 }}>
            <label style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6 }}>⤓ CSV importieren<input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onCsv} /></label>
            <button style={btnGold} onClick={() => openLizenz()}>+ Lizenz</button>
          </div>
          {fLizenzen.length === 0 ? <div style={{ ...card, color: C.textDim }}>Keine Lizenzen.</div> : (
            <div style={{ display: "grid", gap: 8 }}>
              {fLizenzen.map((l) => { const st = ablaufStatus(l.ablauf, heute(), 60); const ueb = istUeberbucht(l.plaetze, l.belegt); const frei = freiePlaetze(l.plaetze, l.belegt); return (
                <div key={l.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <span style={{ fontSize: "clamp(15px,1.3vw,20px)", fontWeight: 700 }}>{l.bezeichnung}</span>
                    <span style={{ marginLeft: 8, ...pill(C.textDim) }}>{l.lizenztyp}</span>
                    {ueb ? <span style={{ marginLeft: 8, ...pill(C.danger) }}>überbucht ({l.belegt}/{l.plaetze})</span> : <span style={{ marginLeft: 8, ...pill(C.green) }}>{l.belegt ?? 0}/{l.plaetze ?? 0} belegt · {frei} frei</span>}
                    {l.ablauf && <span style={{ marginLeft: 8 }}>{ampelPill(st, `Ablauf ${dstr(l.ablauf)}`)}</span>}
                    <div style={{ color: C.textDim, fontSize: "clamp(12px,1.05vw,16px)", marginTop: 4 }}>
                      {l.kunde ? `${l.kunde} · ` : ""}{l.hersteller ?? ""}{l.kosten_jahr != null ? ` · ${eur(l.kosten_jahr)}/Jahr (${eur(kostenProMonat(l.kosten_jahr))}/Mon.)` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={btnGhost} onClick={() => openLizenz(l)}>Bearbeiten</button>
                    <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loesche("it_lizenz", l.id, l.bezeichnung)}>✕</button>
                  </div>
                </div>
              ); })}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button style={btnGold} onClick={() => openSla()}>+ SLA</button></div>
          {fSla.length === 0 ? <div style={{ ...card, color: C.textDim }}>Keine SLA.</div> : (
            <div style={{ display: "grid", gap: 8 }}>
              {fSla.map((s) => { const st = ablaufStatus(s.gueltig_bis, heute(), 60); return (
                <div key={s.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <span style={{ fontSize: "clamp(15px,1.3vw,20px)", fontWeight: 700 }}>{s.bezeichnung}</span>
                    {s.gueltig_bis && <span style={{ marginLeft: 8 }}>{ampelPill(st, `gültig bis ${dstr(s.gueltig_bis)}`)}</span>}
                    <div style={{ color: C.textDim, fontSize: "clamp(12px,1.05vw,16px)", marginTop: 4 }}>
                      {s.kunde ? `${s.kunde} · ` : ""}Reaktion {s.reaktion_std != null ? `${s.reaktion_std} h` : "—"} · Wiederherstellung {s.wiederherstell_std != null ? `${s.wiederherstell_std} h` : "—"}{s.verfuegbarkeit != null ? ` · ${s.verfuegbarkeit} % Verfügbarkeit` : ""}{s.servicezeit ? ` · ${s.servicezeit}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={btnGhost} onClick={() => openSla(s)}>Bearbeiten</button>
                    <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loesche("it_sla", s.id, s.bezeichnung)}>✕</button>
                  </div>
                </div>
              ); })}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" }} onClick={() => setModal(null)}>
          <div style={{ ...card, width: "100%", maxWidth: 620, background: C.navy }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(20px,1.75vw,28px)", fontWeight: 800 }}>{editId ? "Bearbeiten" : "Neu anlegen"} · {modal === "asset" ? "Asset" : modal === "lizenz" ? "Lizenz" : "SLA"}</h2>

            {modal === "asset" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ gridColumn: "1 / -1" }}><label style={label}>Bezeichnung *</label><input style={input} value={aForm.bezeichnung} onChange={(e) => setAForm({ ...aForm, bezeichnung: e.target.value })} placeholder="z. B. ThinkPad T14 – Buchhaltung" /></div>
                <div><label style={label}>Kunde</label><input style={input} value={aForm.kunde} onChange={(e) => setAForm({ ...aForm, kunde: e.target.value })} /></div>
                <div><label style={label}>Typ</label><select style={input} value={aForm.typ} onChange={(e) => setAForm({ ...aForm, typ: e.target.value })}>{ASSET_TYP.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label style={label}>Hersteller</label><input style={input} value={aForm.hersteller} onChange={(e) => setAForm({ ...aForm, hersteller: e.target.value })} /></div>
                <div><label style={label}>Modell</label><input style={input} value={aForm.modell} onChange={(e) => setAForm({ ...aForm, modell: e.target.value })} /></div>
                <NurVoll><div><label style={label}>Seriennummer</label><input style={input} value={aForm.seriennr} onChange={(e) => setAForm({ ...aForm, seriennr: e.target.value })} /></div></NurVoll>
                <div><label style={label}>Standort</label><input style={input} value={aForm.standort} onChange={(e) => setAForm({ ...aForm, standort: e.target.value })} /></div>
                <div><label style={label}>Status</label><select style={input} value={aForm.status} onChange={(e) => setAForm({ ...aForm, status: e.target.value })}>{ASSET_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                <NurVoll><div><label style={label}>Anschaffung</label><input type="date" style={input} value={aForm.anschaffung} onChange={(e) => setAForm({ ...aForm, anschaffung: e.target.value })} /></div></NurVoll>
                <div><label style={label}>Garantie bis</label><input type="date" style={input} value={aForm.garantie_bis} onChange={(e) => setAForm({ ...aForm, garantie_bis: e.target.value })} /></div>
                <NurVoll><div style={{ gridColumn: "1 / -1" }}><label style={label}>Notiz</label><input style={input} value={aForm.notiz} onChange={(e) => setAForm({ ...aForm, notiz: e.target.value })} /></div></NurVoll>
                {felder.length > 0 && <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><NurVoll><EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={input} labStyle={label} /></NurVoll></div>}
              </div>
            )}

            {modal === "lizenz" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ gridColumn: "1 / -1" }}><label style={label}>Bezeichnung *</label><input style={input} value={lForm.bezeichnung} onChange={(e) => setLForm({ ...lForm, bezeichnung: e.target.value })} placeholder="z. B. Microsoft 365 Business" /></div>
                <div><label style={label}>Kunde</label><input style={input} value={lForm.kunde} onChange={(e) => setLForm({ ...lForm, kunde: e.target.value })} /></div>
                <div><label style={label}>Hersteller</label><input style={input} value={lForm.hersteller} onChange={(e) => setLForm({ ...lForm, hersteller: e.target.value })} /></div>
                <div><label style={label}>Lizenztyp</label><select style={input} value={lForm.lizenztyp} onChange={(e) => setLForm({ ...lForm, lizenztyp: e.target.value })}>{LIZENZ_TYP.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label style={label}>Status</label><input style={input} value={lForm.status} onChange={(e) => setLForm({ ...lForm, status: e.target.value })} /></div>
                <div><label style={label}>Plätze (Seats)</label><input style={input} value={lForm.plaetze} onChange={(e) => setLForm({ ...lForm, plaetze: e.target.value })} inputMode="numeric" /></div>
                <div><label style={label}>Belegt</label><input style={input} value={lForm.belegt} onChange={(e) => setLForm({ ...lForm, belegt: e.target.value })} inputMode="numeric" /></div>
                <NurVoll><div><label style={label}>Start</label><input type="date" style={input} value={lForm.start} onChange={(e) => setLForm({ ...lForm, start: e.target.value })} /></div></NurVoll>
                <div><label style={label}>Ablauf</label><input type="date" style={input} value={lForm.ablauf} onChange={(e) => setLForm({ ...lForm, ablauf: e.target.value })} /></div>
                <div><label style={label}>Kosten / Jahr (€)</label><input style={input} value={lForm.kosten_jahr} onChange={(e) => setLForm({ ...lForm, kosten_jahr: e.target.value })} inputMode="decimal" /></div>
                <NurVoll><div><label style={label}>Lizenzschlüssel</label><input style={input} value={lForm.schluessel} onChange={(e) => setLForm({ ...lForm, schluessel: e.target.value })} /></div></NurVoll>
                <NurVoll><div style={{ gridColumn: "1 / -1" }}><label style={label}>Notiz</label><input style={input} value={lForm.notiz} onChange={(e) => setLForm({ ...lForm, notiz: e.target.value })} /></div></NurVoll>
              </div>
            )}

            {modal === "sla" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ gridColumn: "1 / -1" }}><label style={label}>Bezeichnung *</label><input style={input} value={sForm.bezeichnung} onChange={(e) => setSForm({ ...sForm, bezeichnung: e.target.value })} placeholder="z. B. SLA Gold – Server-Support" /></div>
                <div><label style={label}>Kunde</label><input style={input} value={sForm.kunde} onChange={(e) => setSForm({ ...sForm, kunde: e.target.value })} /></div>
                <div><label style={label}>Servicezeit</label><input style={input} value={sForm.servicezeit} onChange={(e) => setSForm({ ...sForm, servicezeit: e.target.value })} /></div>
                <div><label style={label}>Reaktionszeit (Std.)</label><input style={input} value={sForm.reaktion_std} onChange={(e) => setSForm({ ...sForm, reaktion_std: e.target.value })} inputMode="decimal" placeholder="z. B. 4" /></div>
                <div><label style={label}>Wiederherstellung (Std.)</label><input style={input} value={sForm.wiederherstell_std} onChange={(e) => setSForm({ ...sForm, wiederherstell_std: e.target.value })} inputMode="decimal" placeholder="z. B. 24" /></div>
                <div><label style={label}>Verfügbarkeit (%)</label><input style={input} value={sForm.verfuegbarkeit} onChange={(e) => setSForm({ ...sForm, verfuegbarkeit: e.target.value })} inputMode="decimal" placeholder="z. B. 99,5" /></div>
                <div><label style={label}>Gültig bis</label><input type="date" style={input} value={sForm.gueltig_bis} onChange={(e) => setSForm({ ...sForm, gueltig_bis: e.target.value })} /></div>
                <NurVoll><div style={{ gridColumn: "1 / -1" }}><label style={label}>Notiz</label><input style={input} value={sForm.notiz} onChange={(e) => setSForm({ ...sForm, notiz: e.target.value })} /></div></NurVoll>
              </div>
            )}

            {fehler && <div style={{ marginTop: 12, color: C.danger, fontWeight: 600 }}>{fehler}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button style={btnGhost} onClick={() => setModal(null)}>Abbrechen</button>
              <button style={{ ...btnGold, opacity: busy ? 0.6 : 1 }} onClick={speichere} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
