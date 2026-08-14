"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";
import Leerzustand from "../_components/Leerzustand";
import { augeHousekeeping } from "@/lib/auge";
import {
  HK_STATUS,
  HK_PRIO,
  naechsterHkStatus,
  zaehleHousekeeping,
  MENU_KATEGORIEN,
  ZUSATZSTOFFE,
  parseKeys,
  zusatzLabels,
  zaehleMenu,
  kategorieRang,
} from "@/lib/housekeeping";
import { ALLERGENE, parseAllergene, allergenNamen } from "@/lib/etiketten";
import { speisekartePdf } from "@/lib/speisekartePdf";
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from "../_components/EigeneFelder";
import { NurVoll } from '../_components/Ansicht';
import type { EigenesFeld } from "@/lib/eigeneFelder";

const MODUL = "hk_zimmer";

// ---------------------------------------------------------------------
// ARGONAUT OS · L2-7 · Housekeeping & Speisekarte/Menü (Gastro/Hotellerie)
// Reiter 1: Reinigungsstatus je Zimmer. Reiter 2: Speisekarte mit Preisen,
// 14 Allergenen (aus L2-2) und Zusatzstoff-Kenntlichmachung + Karten-PDF.
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

const HK_LABEL: Record<string, { text: string; farbe: string }> = {
  schmutzig: { text: "🔴 Schmutzig", farbe: C.danger },
  in_reinigung: { text: "🧹 In Reinigung", farbe: C.warn },
  sauber: { text: "✓ Sauber", farbe: C.green },
  geprueft: { text: "✓✓ Geprüft", farbe: C.cyan },
  gesperrt: { text: "⛔ Gesperrt", farbe: C.textDim },
};
const PRIO_LABEL: Record<string, string> = { abreise: "Abreise", bleibt: "Bleibt", blockiert: "Blockiert" };

interface Zimmer { id: string; bezeichnung: string; etage: string | null; kategorie: string | null; status: string; prio: string; zustaendig: string | null; letzte_reinigung: string | null; notiz: string | null; created_at: string; }
interface Gericht { id: string; name: string; kategorie: string | null; preis: number | null; beschreibung: string | null; allergene: string | null; zusatzstoffe: string | null; verfuegbar: boolean; hervorgehoben: boolean; reihenfolge: number | null; created_at: string; }

type ZForm = { bezeichnung: string; etage: string; kategorie: string; status: string; prio: string; zustaendig: string; notiz: string };
const LEER_Z: ZForm = { bezeichnung: "", etage: "", kategorie: "", status: "schmutzig", prio: "bleibt", zustaendig: "", notiz: "" };
type GForm = { name: string; kategorie: string; preis: string; beschreibung: string; allergene: string[]; zusatzstoffe: string[]; verfuegbar: boolean; hervorgehoben: boolean; reihenfolge: string };
const LEER_G: GForm = { name: "", kategorie: "Hauptgericht", preis: "", beschreibung: "", allergene: [], zusatzstoffe: [], verfuegbar: true, hervorgehoben: false, reihenfolge: "" };

const heute = () => new Date().toISOString().slice(0, 10);
function zahl(s: string): number | null { return s.trim() === "" ? null : Number(s.replace(",", ".")); }
function eur(n: number | null): string { return n == null ? "—" : (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" }); }

export default function HousekeepingSeite() {
  const [tab, setTab] = useState<"hk" | "menu">("hk");
  const [zimmer, setZimmer] = useState<Zimmer[]>([]);
  const [gerichte, setGerichte] = useState<Gericht[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [hinweis, setHinweis] = useState<string | null>(null);

  const [zModal, setZModal] = useState(false);
  const [zEdit, setZEdit] = useState<string | null>(null);
  const [zForm, setZForm] = useState<ZForm>(LEER_Z);
  const [gModal, setGModal] = useState(false);
  const [gEdit, setGEdit] = useState<string | null>(null);
  const [gForm, setGForm] = useState<GForm>(LEER_G);
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
    const [z, g] = await Promise.all([
      supabase.from("hk_zimmer").select("*").order("bezeichnung", { ascending: true }),
      supabase.from("menu_gericht").select("*").order("reihenfolge", { ascending: true }),
    ]);
    const zz = (!z.error && z.data ? (z.data as Zimmer[]) : []);
    if (!z.error && z.data) setZimmer(zz);
    if (!g.error && g.data) setGerichte(g.data as Gericht[]);
    setFelder(await ladeFelder(MODUL));
    setWerteMap(await ladeWerte(MODUL, zz.map((r) => r.id)));
    setLaden(false);
  }

  const hkKpi = useMemo(() => zaehleHousekeeping(zimmer), [zimmer]);
  const menuKpi = useMemo(() => zaehleMenu(gerichte), [gerichte]);

  const gerichteSortiert = useMemo(() => {
    return [...gerichte].sort((a, b) => {
      const r = kategorieRang(a.kategorie) - kategorieRang(b.kategorie);
      if (r !== 0) return r;
      return (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0) || a.name.localeCompare(b.name);
    });
  }, [gerichte]);

  const gruppiert = useMemo(() => {
    const map = new Map<string, Gericht[]>();
    for (const g of gerichteSortiert) { const k = g.kategorie || "Sonstiges"; (map.get(k) ?? map.set(k, []).get(k)!).push(g); }
    return Array.from(map.entries());
  }, [gerichteSortiert]);

  // ---------- Zimmer ----------
  function setZF<K extends keyof ZForm>(k: K, w: ZForm[K]) { setZForm((f) => ({ ...f, [k]: w })); }
  function neuZimmer() { setZEdit(null); setZForm(LEER_Z); setNmExtra({}); setFehler(null); setZModal(true); }
  function editZimmer(z: Zimmer) {
    setZEdit(z.id);
    setZForm({ bezeichnung: z.bezeichnung ?? "", etage: z.etage ?? "", kategorie: z.kategorie ?? "", status: z.status ?? "schmutzig", prio: z.prio ?? "bleibt", zustaendig: z.zustaendig ?? "", notiz: z.notiz ?? "" });
    setNmExtra(werteMap[z.id] ?? {});
    setFehler(null); setZModal(true);
  }
  async function speichereZimmer() {
    if (!zForm.bezeichnung.trim()) { setFehler("Bezeichnung ist Pflicht."); return; }
    setBusy(true); setFehler(null);
    const payload = { bezeichnung: zForm.bezeichnung.trim(), etage: zForm.etage.trim() || null, kategorie: zForm.kategorie.trim() || null, status: zForm.status, prio: zForm.prio, zustaendig: zForm.zustaendig.trim() || null, notiz: zForm.notiz.trim() || null };
    let error = null as { message: string } | null;
    if (zEdit) {
      error = (await supabase.from("hk_zimmer").update(payload).eq("id", zEdit)).error;
      if (!error) { try { await speichereWerte(MODUL, zEdit, userId, nmExtra); } catch { /* eigene Felder optional */ } }
    } else {
      const ins = userId ? { ...payload, owner_user_id: userId } : payload;
      const { data: neu, error: insErr } = await supabase.from("hk_zimmer").insert(ins).select("id").single();
      error = insErr;
      if (!error && neu) { try { await speichereWerte(MODUL, (neu as { id: string }).id, userId, nmExtra); } catch { /* eigene Felder optional */ } }
    }
    setBusy(false);
    if (error) { setFehler("Speichern fehlgeschlagen: " + error.message); return; }
    setNmExtra({}); setZModal(false); await ladeAlles();
  }
  async function hkWeiter(z: Zimmer) {
    const neu = naechsterHkStatus(z.status);
    const patch: Record<string, unknown> = { status: neu };
    if (neu === "sauber" || neu === "geprueft") patch.letzte_reinigung = heute();
    const { error } = await supabase.from("hk_zimmer").update(patch).eq("id", z.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }
  async function hkStatus(z: Zimmer, status: string) {
    const patch: Record<string, unknown> = { status };
    if (status === "sauber" || status === "geprueft") patch.letzte_reinigung = heute();
    const { error } = await supabase.from("hk_zimmer").update(patch).eq("id", z.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }
  async function loescheZimmer(z: Zimmer) {
    if (!window.confirm(`Zimmer „${z.bezeichnung}" löschen?`)) return;
    const { error } = await supabase.from("hk_zimmer").delete().eq("id", z.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }

  // ---------- Gericht ----------
  function setGF<K extends keyof GForm>(k: K, w: GForm[K]) { setGForm((f) => ({ ...f, [k]: w })); }
  function toggle(arr: keyof Pick<GForm, "allergene" | "zusatzstoffe">, key: string) {
    setGForm((f) => ({ ...f, [arr]: f[arr].includes(key) ? f[arr].filter((k) => k !== key) : [...f[arr], key] }));
  }
  function neuGericht() { setGEdit(null); setGForm(LEER_G); setFehler(null); setGModal(true); }
  function editGericht(g: Gericht) {
    setGEdit(g.id);
    setGForm({ name: g.name ?? "", kategorie: g.kategorie ?? "Hauptgericht", preis: g.preis != null ? String(g.preis) : "", beschreibung: g.beschreibung ?? "", allergene: parseAllergene(g.allergene), zusatzstoffe: parseKeys(g.zusatzstoffe), verfuegbar: g.verfuegbar, hervorgehoben: g.hervorgehoben, reihenfolge: g.reihenfolge != null ? String(g.reihenfolge) : "" });
    setFehler(null); setGModal(true);
  }
  async function speichereGericht() {
    if (!gForm.name.trim()) { setFehler("Name ist Pflicht."); return; }
    setBusy(true); setFehler(null);
    const payload = { name: gForm.name.trim(), kategorie: gForm.kategorie || "Sonstiges", preis: zahl(gForm.preis), beschreibung: gForm.beschreibung.trim() || null, allergene: gForm.allergene.join(";") || null, zusatzstoffe: gForm.zusatzstoffe.join(";") || null, verfuegbar: gForm.verfuegbar, hervorgehoben: gForm.hervorgehoben, reihenfolge: zahl(gForm.reihenfolge) ?? 0 };
    let error = null as { message: string } | null;
    if (gEdit) { error = (await supabase.from("menu_gericht").update(payload).eq("id", gEdit)).error; }
    else { const ins = userId ? { ...payload, owner_user_id: userId } : payload; error = (await supabase.from("menu_gericht").insert(ins)).error; }
    setBusy(false);
    if (error) { setFehler("Speichern fehlgeschlagen: " + error.message); return; }
    setGModal(false); await ladeAlles();
  }
  async function toggleVerfuegbar(g: Gericht) {
    const { error } = await supabase.from("menu_gericht").update({ verfuegbar: !g.verfuegbar }).eq("id", g.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }
  async function loescheGericht(g: Gericht) {
    if (!window.confirm(`Gericht „${g.name}" löschen?`)) return;
    const { error } = await supabase.from("menu_gericht").delete().eq("id", g.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }

  function pdf() {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const meta = userData.user?.user_metadata ?? {};
      const aussteller = meta.firma || meta.firmenname || meta.name || "ARGONAUT OS";
      speisekartePdf({
        aussteller: String(aussteller), titel: "Speisekarte", datum: new Date().toLocaleDateString("de-DE"),
        kategorien: gruppiert.map(([kategorie, gs]) => ({
          kategorie,
          gerichte: gs.filter((g) => g.verfuegbar).map((g) => ({
            name: g.name, preis: eur(g.preis), beschreibung: g.beschreibung ?? "",
            allergene: allergenNamen(parseAllergene(g.allergene)),
            zusatz: zusatzLabels(parseKeys(g.zusatzstoffe)),
            hervorgehoben: g.hervorgehoben,
          })),
        })).filter((k) => k.gerichte.length > 0),
      });
    })();
  }

  async function importiereCsv(text: string) {
    const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
    if (zeilen.length < 2) { setHinweis("CSV enthält keine Datenzeilen."); return; }
    const kopf = zeilen[0].split(";").map((s) => s.trim().toLowerCase());
    const idx = (nme: string) => kopf.indexOf(nme);
    if (idx("name") < 0) { setHinweis("CSV-Kopf braucht mindestens die Spalte name."); return; }
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < zeilen.length; i++) {
      const sp = zeilen[i].split(";");
      const val = (nme: string) => { const k = idx(nme); return k >= 0 ? (sp[k] ?? "").trim() : ""; };
      if (!val("name")) continue;
      const base: Record<string, unknown> = {
        name: val("name"), kategorie: val("kategorie") || "Sonstiges", preis: zahl(val("preis")), beschreibung: val("beschreibung") || null,
        allergene: parseAllergene(val("allergene")).join(";") || null, zusatzstoffe: parseKeys(val("zusatzstoffe")).join(";") || null,
        verfuegbar: val("verfuegbar").toLowerCase() !== "nein" && val("verfuegbar") !== "0", hervorgehoben: val("hervorgehoben").toLowerCase() === "ja" || val("hervorgehoben") === "1",
        reihenfolge: zahl(val("reihenfolge")) ?? 0,
      };
      rows.push(userId ? { ...base, owner_user_id: userId } : base);
    }
    if (rows.length === 0) { setHinweis("Keine gültigen Zeilen gefunden."); return; }
    const { error } = await supabase.from("menu_gericht").insert(rows);
    if (error) { window.alert("Import fehlgeschlagen: " + error.message); return; }
    setHinweis(`${rows.length} Gericht(e) importiert.`); await ladeAlles();
  }
  function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => importiereCsv(String(r.result || "")); r.readAsText(f, "utf-8"); e.target.value = "";
  }

  // ---------- Styles ----------
  const card: React.CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" };
  const input: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: "clamp(13px,1.15vw,18px)", boxSizing: "border-box" };
  const label: React.CSSProperties = { display: "block", fontSize: "clamp(12px,1.06vw,17px)", color: C.textDim, marginBottom: 5, fontWeight: 600 };
  const btnGold: React.CSSProperties = { padding: "9px 16px", borderRadius: 8, border: "none", background: C.gold, color: C.navy, fontWeight: 700, fontSize: "clamp(13px,1.15vw,18px)", cursor: "pointer" };
  const btnGhost: React.CSSProperties = { padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "clamp(12px,1.05vw,16px)", cursor: "pointer" };
  const kachel: React.CSSProperties = { ...card, padding: "13px 15px" };
  const kLabel: React.CSSProperties = { color: C.textDim, fontSize: "clamp(12px,1.02vw,16px)", fontWeight: 600 };
  const kWert: React.CSSProperties = { fontSize: "clamp(22px,2vw,32px)", fontWeight: 800, marginTop: 3 };
  const pill = (farbe: string): React.CSSProperties => ({ display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: "clamp(11px,0.95vw,15px)", fontWeight: 700, color: farbe, border: `1px solid ${farbe}55`, background: `${farbe}18` });

  return (
    <div style={{ color: "#fff", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: "clamp(26px,2.25vw,36px)", fontWeight: 800 }}>🛎️ Housekeeping & Karte</h1>
        <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: "clamp(14px,1.25vw,20px)" }}>Reinigungsstatus je Zimmer und Speisekarte mit Allergenen & Zusatzstoffen</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button style={tab === "hk" ? btnGold : btnGhost} onClick={() => setTab("hk")}>🛏 Housekeeping</button>
        <button style={tab === "menu" ? btnGold : btnGhost} onClick={() => setTab("menu")}>📋 Speisekarte</button>
      </div>

      {hinweis && (
        <div style={{ ...card, marginBottom: 14, borderColor: "rgba(0,229,255,0.35)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ color: C.cyan }}>{hinweis}</span>
          <button style={btnGhost} onClick={() => setHinweis(null)}>OK</button>
        </div>
      )}

      {laden ? (
        <div style={{ ...card, color: C.textDim }}>Lade…</div>
      ) : tab === "hk" ? (
        // ==================== HOUSEKEEPING ====================
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div style={kachel}><div style={kLabel}>Zimmer</div><div style={kWert}>{hkKpi.gesamt}</div></div>
            <div style={kachel}><div style={kLabel}>Schmutzig</div><div style={{ ...kWert, color: hkKpi.schmutzig > 0 ? C.danger : C.green }}>{hkKpi.schmutzig}</div></div>
            <div style={kachel}><div style={kLabel}>In Reinigung</div><div style={{ ...kWert, color: hkKpi.inReinigung > 0 ? C.warn : C.green }}>{hkKpi.inReinigung}</div></div>
            <div style={kachel}><div style={kLabel}>Abreisen offen</div><div style={{ ...kWert, color: hkKpi.abreisenOffen > 0 ? C.danger : C.green }}>{hkKpi.abreisenOffen}</div></div>
            <div style={kachel}><div style={kLabel}>Gesperrt</div><div style={kWert}>{hkKpi.gesperrt}</div></div>
          </div>
          <KiAuge modul="Housekeeping" regel={augeHousekeeping({ schmutzig: hkKpi.schmutzig, inReinigung: hkKpi.inReinigung, abreisenOffen: hkKpi.abreisenOffen, gesamt: hkKpi.gesamt })} />
          <div style={{ display: "flex", justifyContent: "flex-end", margin: "14px 0" }}><button style={btnGold} onClick={neuZimmer}>+ Zimmer / Einheit</button></div>
          {userId && <EigeneFelderManager modul={MODUL} ownerId={userId} onChange={ladeAlles} />}

          {zimmer.length === 0 ? (
            <Leerzustand icon="🛎️" titel="Noch keine Zimmer" text="Lege Zimmer/Einheiten an und pflege den Reinigungsstatus." schritte={["Zimmer oben anlegen", "Etage und Kategorie erfassen", "Reinigungsstatus durchschalten"]} />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {zimmer.map((z) => {
                const st = HK_LABEL[z.status] ?? { text: z.status, farbe: C.textDim };
                return (
                  <div key={z.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <span style={{ fontSize: "clamp(16px,1.4vw,22px)", fontWeight: 800 }}>{z.bezeichnung}</span>
                      {z.etage && <span style={{ color: C.textDim, marginLeft: 8 }}>· {z.etage}</span>}
                      {z.kategorie && <span style={{ color: C.textDim, marginLeft: 6 }}>· {z.kategorie}</span>}
                      <span style={{ marginLeft: 10, ...pill(st.farbe) }}>{st.text}</span>
                      {z.prio === "abreise" && <span style={{ marginLeft: 8, ...pill(C.warn) }}>Abreise</span>}
                      {z.prio === "blockiert" && <span style={{ marginLeft: 8, ...pill(C.textDim) }}>Blockiert</span>}
                      <div style={{ color: C.textDim, fontSize: "clamp(12px,1.05vw,16px)", marginTop: 4 }}>
                        {z.zustaendig ? `Zuständig: ${z.zustaendig}` : "Zuständig: —"}{z.letzte_reinigung ? ` · zuletzt gereinigt ${new Date(z.letzte_reinigung).toLocaleDateString("de-DE")}` : ""}{z.notiz ? ` · ${z.notiz}` : ""}
                      </div>
                      <EigeneFelderAnzeige felder={felder} werte={werteMap[z.id]} />
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {z.status !== "geprueft" && z.status !== "gesperrt" && <button style={btnGold} onClick={() => hkWeiter(z)}>{HK_LABEL[naechsterHkStatus(z.status)].text} →</button>}
                      {z.status !== "schmutzig" && <button style={btnGhost} onClick={() => hkStatus(z, "schmutzig")}>↺ schmutzig</button>}
                      {z.status !== "gesperrt" ? <button style={btnGhost} onClick={() => hkStatus(z, "gesperrt")}>⛔ sperren</button> : <button style={btnGhost} onClick={() => hkStatus(z, "schmutzig")}>freigeben</button>}
                      <button style={btnGhost} onClick={() => editZimmer(z)}>Bearbeiten</button>
                      <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loescheZimmer(z)}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // ==================== SPEISEKARTE ====================
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div style={kachel}><div style={kLabel}>Gerichte</div><div style={kWert}>{menuKpi.gesamt}</div></div>
            <div style={kachel}><div style={kLabel}>Verfügbar</div><div style={{ ...kWert, color: C.green }}>{menuKpi.verfuegbar}</div></div>
            <div style={kachel}><div style={kLabel}>Ausverkauft</div><div style={{ ...kWert, color: menuKpi.ausverkauft > 0 ? C.warn : C.green }}>{menuKpi.ausverkauft}</div></div>
            <div style={kachel}><div style={kLabel}>Ohne Preis</div><div style={{ ...kWert, color: menuKpi.ohnePreis > 0 ? C.warn : C.green }}>{menuKpi.ohnePreis}</div></div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", margin: "8px 0 14px", flexWrap: "wrap" }}>
            <label style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6 }}>⤓ CSV importieren<input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onCsv} /></label>
            <button style={btnGhost} onClick={pdf}>📄 Speisekarte-PDF</button>
            <button style={btnGold} onClick={neuGericht}>+ Gericht</button>
          </div>

          {gerichte.length === 0 ? (
            <Leerzustand icon="🍽️" titel="Noch keine Gerichte" text="Baue deine Speisekarte mit Preis, Allergenen und Zusatzstoffen." schritte={["Gericht oben anlegen", "Allergene und Zusatzstoffe ankreuzen", "Speisekarte als PDF ausgeben"]} />
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {gruppiert.map(([kat, gs]) => (
                <div key={kat}>
                  <div style={{ fontSize: "clamp(16px,1.4vw,22px)", fontWeight: 800, color: C.gold, marginBottom: 8 }}>{kat}</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {gs.map((g) => {
                      const aln = allergenNamen(parseAllergene(g.allergene));
                      const zzn = zusatzLabels(parseKeys(g.zusatzstoffe));
                      return (
                        <div key={g.id} style={{ ...card, opacity: g.verfuegbar ? 1 : 0.55 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 220 }}>
                              <span style={{ fontSize: "clamp(15px,1.3vw,20px)", fontWeight: 700 }}>{g.hervorgehoben ? "★ " : ""}{g.name}</span>
                              {!g.verfuegbar && <span style={{ marginLeft: 8, ...pill(C.warn) }}>ausverkauft</span>}
                              {g.beschreibung && <div style={{ color: C.textDim, fontSize: "clamp(12px,1.05vw,16px)", marginTop: 3 }}>{g.beschreibung}</div>}
                              {(aln.length > 0 || zzn.length > 0) && <div style={{ color: "#7d8ba3", fontSize: "clamp(11px,0.95vw,14px)", marginTop: 4, fontStyle: "italic" }}>{[...aln, ...zzn].join(", ")}</div>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: "clamp(15px,1.3vw,20px)", fontWeight: 800, color: C.gold }}>{eur(g.preis)}</span>
                              <button style={btnGhost} onClick={() => toggleVerfuegbar(g)}>{g.verfuegbar ? "ausverkauft" : "verfügbar"}</button>
                              <button style={btnGhost} onClick={() => editGericht(g)}>Bearbeiten</button>
                              <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loescheGericht(g)}>✕</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Zimmer-Modal */}
      {zModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" }} onClick={() => setZModal(false)}>
          <div style={{ ...card, width: "100%", maxWidth: 520, background: C.navy }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(20px,1.75vw,28px)", fontWeight: 800 }}>{zEdit ? "Zimmer bearbeiten" : "Neues Zimmer / Einheit"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Bezeichnung *</label><input style={input} value={zForm.bezeichnung} onChange={(e) => setZF("bezeichnung", e.target.value)} placeholder="z. B. Zimmer 101" /></div>
              <div><label style={label}>Etage / Bereich</label><input style={input} value={zForm.etage} onChange={(e) => setZF("etage", e.target.value)} /></div>
              <div><label style={label}>Kategorie</label><input style={input} value={zForm.kategorie} onChange={(e) => setZF("kategorie", e.target.value)} placeholder="Doppelzimmer / Suite" /></div>
              <div><label style={label}>Status</label><select style={input} value={zForm.status} onChange={(e) => setZF("status", e.target.value)}>{HK_STATUS.map((s) => <option key={s} value={s}>{HK_LABEL[s].text}</option>)}</select></div>
              <div><label style={label}>Priorität</label><select style={input} value={zForm.prio} onChange={(e) => setZF("prio", e.target.value)}>{HK_PRIO.map((p) => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}</select></div>
              <NurVoll><div style={{ gridColumn: "1 / -1" }}><label style={label}>Zuständig</label><input style={input} value={zForm.zustaendig} onChange={(e) => setZF("zustaendig", e.target.value)} /></div></NurVoll>
              <NurVoll><div style={{ gridColumn: "1 / -1" }}><label style={label}>Notiz</label><input style={input} value={zForm.notiz} onChange={(e) => setZF("notiz", e.target.value)} /></div></NurVoll>
              <NurVoll><div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 12 }}>
                <EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={input} labStyle={label} />
              </div></NurVoll>
            </div>
            {fehler && <div style={{ marginTop: 12, color: C.danger, fontWeight: 600 }}>{fehler}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button style={btnGhost} onClick={() => setZModal(false)}>Abbrechen</button>
              <button style={{ ...btnGold, opacity: busy ? 0.6 : 1 }} onClick={speichereZimmer} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Gericht-Modal */}
      {gModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" }} onClick={() => setGModal(false)}>
          <div style={{ ...card, width: "100%", maxWidth: 640, background: C.navy }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(20px,1.75vw,28px)", fontWeight: 800 }}>{gEdit ? "Gericht bearbeiten" : "Neues Gericht"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Name *</label><input style={input} value={gForm.name} onChange={(e) => setGF("name", e.target.value)} placeholder="z. B. Wiener Schnitzel" /></div>
              <div><label style={label}>Kategorie</label><select style={input} value={gForm.kategorie} onChange={(e) => setGF("kategorie", e.target.value)}>{MENU_KATEGORIEN.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
              <div><label style={label}>Preis (€)</label><input style={input} value={gForm.preis} onChange={(e) => setGF("preis", e.target.value)} inputMode="decimal" placeholder="0,00" /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Beschreibung</label><input style={input} value={gForm.beschreibung} onChange={(e) => setGF("beschreibung", e.target.value)} placeholder="mit Pommes und Salat" /></div>
              <NurVoll><div><label style={label}>Reihenfolge</label><input style={input} value={gForm.reihenfolge} onChange={(e) => setGF("reihenfolge", e.target.value)} inputMode="numeric" placeholder="0" /></div></NurVoll>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="checkbox" checked={gForm.verfuegbar} onChange={(e) => setGF("verfuegbar", e.target.checked)} /> verfügbar</label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="checkbox" checked={gForm.hervorgehoben} onChange={(e) => setGF("hervorgehoben", e.target.checked)} /> ★ Empfehlung</label>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={label}>Allergene (14 Pflichtallergene)</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 5 }}>
                {ALLERGENE.map((a) => { const an = gForm.allergene.includes(a.key); return (
                  <label key={a.key} title={a.beispiele} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 7px", borderRadius: 8, border: `1px solid ${an ? C.gold : C.border}`, background: an ? "rgba(201,168,76,0.12)" : "transparent", cursor: "pointer", fontSize: "clamp(11px,0.95vw,15px)" }}>
                    <input type="checkbox" checked={an} onChange={() => toggle("allergene", a.key)} />{a.name}
                  </label>); })}
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={label}>Zusatzstoffe (Kenntlichmachung)</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 5 }}>
                {ZUSATZSTOFFE.map((z) => { const an = gForm.zusatzstoffe.includes(z.key); return (
                  <label key={z.key} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 7px", borderRadius: 8, border: `1px solid ${an ? C.gold : C.border}`, background: an ? "rgba(201,168,76,0.12)" : "transparent", cursor: "pointer", fontSize: "clamp(11px,0.95vw,15px)" }}>
                    <input type="checkbox" checked={an} onChange={() => toggle("zusatzstoffe", z.key)} />{z.label}
                  </label>); })}
              </div>
            </div>
            {fehler && <div style={{ marginTop: 12, color: C.danger, fontWeight: 600 }}>{fehler}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button style={btnGhost} onClick={() => setGModal(false)}>Abbrechen</button>
              <button style={{ ...btnGold, opacity: busy ? 0.6 : 1 }} onClick={speichereGericht} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
