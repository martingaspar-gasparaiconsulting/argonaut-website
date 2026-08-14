"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { leseStandortCookie } from "@/lib/aktiverStandort";
import { konkreterStandort, standortOrFilter } from "@/lib/standortDaten";
import KiAuge from "../_components/KiAuge";
import { augeChargen } from "@/lib/auge";
import {
  CHARGE_STATUS,
  PRUEF_ART,
  VERWENDUNG_RICHTUNG,
  merkmalStatus,
  gesamtErgebnis,
  mhdStatus,
  offeneMenge,
  nioAnzahl,
  zaehleChargen,
  type MerkmalLite,
} from "@/lib/chargen";
import { chargenPdf } from "@/lib/chargenPdf";
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from '../_components/EigeneFelder';
import { NurVoll } from '../_components/Ansicht';
import type { EigenesFeld } from '@/lib/eigeneFelder';
const MODUL = 'charge_los';

// ---------------------------------------------------------------------
// ARGONAUT OS · L2-3 · Serien-/Chargen- & Prüfplan-Tiefe (Industrie)
// Chargen/Serien mit Status + MHD, Rückverfolgbarkeit (Ein-/Ausgänge,
// one up / one down) und Prüfplan (Soll ± Toleranz → i.O./n.i.O.).
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

const STATUS_LABEL: Record<string, { text: string; farbe: string }> = {
  freigegeben: { text: "✓ Freigegeben", farbe: C.green },
  quarantaene: { text: "⏳ Quarantäne", farbe: C.warn },
  gesperrt: { text: "⛔ Gesperrt", farbe: C.danger },
  verbraucht: { text: "· Verbraucht", farbe: C.textDim },
};
const ART_LABEL: Record<string, string> = { wareneingang: "Wareneingang", zwischen: "Zwischenprüfung", endpruefung: "Endprüfung" };

interface Los {
  id: string; artikel_id: string | null; charge_nr: string; typ: string; bezeichnung: string | null;
  menge: number | null; einheit: string | null; herstell_datum: string | null; mhd: string | null;
  herkunft: string | null; auftrag: string | null; status: string; bemerkung: string | null; created_at: string;
}
interface Verwendung { id: string; los_id: string; richtung: string; referenz: string | null; menge: number | null; datum: string | null; notiz: string | null; }
interface Pruefung { id: string; los_id: string; art: string; datum: string | null; pruefer: string | null; ergebnis: string | null; bemerkung: string | null; }
interface Merkmal { id: string; pruefung_id: string; merkmal: string; sollwert: number | null; toleranz_minus: number | null; toleranz_plus: number | null; istwert: number | null; einheit: string | null; }
interface ArtikelKurz { id: string; bezeichnung: string; }

type LosForm = {
  charge_nr: string; typ: string; bezeichnung: string; artikel_id: string; menge: string; einheit: string;
  herstell_datum: string; mhd: string; herkunft: string; auftrag: string; status: string; bemerkung: string;
};
const LEER_LOS: LosForm = { charge_nr: "", typ: "charge", bezeichnung: "", artikel_id: "", menge: "", einheit: "Stk", herstell_datum: "", mhd: "", herkunft: "", auftrag: "", status: "freigegeben", bemerkung: "" };

const heuteISO = () => new Date().toISOString().slice(0, 10);
function zahl(s: string): number | null { return s.trim() === "" ? null : Number(s.replace(",", ".")); }
function num(x: number | null): string { return (Number(x) || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 }); }
function dstr(s: string | null): string { return s ? new Date(s).toLocaleDateString("de-DE") : "—"; }

export default function ChargenSeite() {
  const [los, setLos] = useState<Los[]>([]);
  const [verwendungen, setVerwendungen] = useState<Verwendung[]>([]);
  const [pruefungen, setPruefungen] = useState<Pruefung[]>([]);
  const [merkmale, setMerkmale] = useState<Merkmal[]>([]);
  const [artikel, setArtikel] = useState<ArtikelKurz[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [offen, setOffen] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [hinweis, setHinweis] = useState<string | null>(null);

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<LosForm>(LEER_LOS);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichern, setSpeichern] = useState(false);

  // Inline-Formulare
  const [vw, setVw] = useState({ richtung: "eingang", referenz: "", menge: "", datum: heuteISO() });
  const [pf, setPf] = useState({ art: "endpruefung", datum: heuteISO(), pruefer: "" });
  const [selPruef, setSelPruef] = useState<string | null>(null);
  const [mk, setMk] = useState({ merkmal: "", sollwert: "", toleranz_minus: "", toleranz_plus: "", istwert: "", einheit: "" });

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
    // Filial-Zuschnitt (fail-open): aktiver Standort zeigt seine + Standort-lose Lose.
    const sid = konkreterStandort(leseStandortCookie());
    let lq = supabase.from("charge_los").select("*");
    if (sid) lq = lq.or(standortOrFilter(sid));
    const [l, v, p, m, a] = await Promise.all([
      lq.order("created_at", { ascending: false }),
      supabase.from("charge_verwendung").select("*").order("datum", { ascending: true }),
      supabase.from("charge_pruefung").select("*").order("datum", { ascending: true }),
      supabase.from("charge_merkmal").select("*").order("id", { ascending: true }),
      supabase.from("artikel").select("id, bezeichnung").eq("aktiv", true).order("bezeichnung", { ascending: true }),
    ]);
    const losRows = (l.data as Los[]) ?? [];
    const losIds = new Set(losRows.map((r) => r.id));
    if (!l.error) setLos(losRows);
    { setFelder(await ladeFelder(MODUL)); setWerteMap(await ladeWerte(MODUL, losRows.map((r) => r.id))); }
    // Kinder nur zu sichtbaren (Filial-)Losen — hält KPIs/Anzeige konsistent.
    const vwRows = ((v.data as Verwendung[]) ?? []).filter((x) => losIds.has(x.los_id));
    const pfRows = ((p.data as Pruefung[]) ?? []).filter((x) => losIds.has(x.los_id));
    const pfIds = new Set(pfRows.map((x) => x.id));
    if (!v.error) setVerwendungen(vwRows);
    if (!p.error) setPruefungen(pfRows);
    if (!m.error && m.data) setMerkmale((m.data as Merkmal[]).filter((x) => pfIds.has(x.pruefung_id)));
    if (!a.error && a.data) setArtikel(a.data as ArtikelKurz[]);
    setLaden(false);
  }

  const merkmaleByPruefung = useMemo(() => {
    const map: Record<string, Merkmal[]> = {};
    for (const m of merkmale) { (map[m.pruefung_id] ||= []).push(m); }
    return map;
  }, [merkmale]);

  const kpi = useMemo(() => zaehleChargen(los, pruefungen, merkmaleByPruefung as Record<string, MerkmalLite[]>, heuteISO()), [los, pruefungen, merkmaleByPruefung]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return los;
    return los.filter((l) => [l.charge_nr, l.bezeichnung, l.herkunft, l.auftrag].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [los, suche]);

  const artikelName = useMemo(() => { const m: Record<string, string> = {}; artikel.forEach((a) => (m[a.id] = a.bezeichnung)); return m; }, [artikel]);
  const vwByLos = useMemo(() => { const m: Record<string, Verwendung[]> = {}; verwendungen.forEach((v) => (m[v.los_id] ||= []).push(v)); return m; }, [verwendungen]);
  const pfByLos = useMemo(() => { const m: Record<string, Pruefung[]> = {}; pruefungen.forEach((p) => (m[p.los_id] ||= []).push(p)); return m; }, [pruefungen]);

  // ---------------- Charge CRUD ----------------
  function setF<K extends keyof LosForm>(k: K, w: LosForm[K]) { setForm((f) => ({ ...f, [k]: w })); }
  function oeffneNeu() { setEditId(null); setForm(LEER_LOS); setNmExtra({}); setFehler(null); setModal(true); }
  function oeffneBearbeiten(l: Los) {
    setEditId(l.id);
    setForm({
      charge_nr: l.charge_nr ?? "", typ: l.typ ?? "charge", bezeichnung: l.bezeichnung ?? "", artikel_id: l.artikel_id ?? "",
      menge: l.menge != null ? String(l.menge) : "", einheit: l.einheit ?? "Stk",
      herstell_datum: l.herstell_datum ?? "", mhd: l.mhd ?? "", herkunft: l.herkunft ?? "", auftrag: l.auftrag ?? "",
      status: l.status ?? "freigegeben", bemerkung: l.bemerkung ?? "",
    });
    setNmExtra(werteMap[l.id] ?? {});
    setFehler(null); setModal(true);
  }
  async function speichere() {
    if (!form.charge_nr.trim()) { setFehler("Chargen-/Seriennummer ist Pflicht."); return; }
    setSpeichern(true); setFehler(null);
    const payload = {
      charge_nr: form.charge_nr.trim(), typ: form.typ || "charge", bezeichnung: form.bezeichnung.trim() || null,
      artikel_id: form.artikel_id || null, menge: zahl(form.menge), einheit: form.einheit.trim() || null,
      herstell_datum: form.herstell_datum || null, mhd: form.mhd || null, herkunft: form.herkunft.trim() || null,
      auftrag: form.auftrag.trim() || null, status: form.status || "freigegeben", bemerkung: form.bemerkung.trim() || null,
    };
    let error = null as { message: string } | null;
    let datensatzId: string | null = editId;
    if (editId) { error = (await supabase.from("charge_los").update(payload).eq("id", editId)).error; }
    else {
      const ins = { ...payload, standort_id: konkreterStandort(leseStandortCookie()), ...(userId ? { owner_user_id: userId } : {}) };
      const res = await supabase.from("charge_los").insert(ins).select('id').single();
      error = res.error; datensatzId = res.data ? (res.data as { id: string }).id : null;
    }
    setSpeichern(false);
    if (error) { setFehler("Speichern fehlgeschlagen: " + error.message); return; }
    try { await speichereWerte(MODUL, datensatzId, userId, nmExtra); } catch { /* eigene Felder optional */ }
    setNmExtra({});
    setModal(false); await ladeAlles();
  }
  async function statusSetzen(l: Los, status: string) {
    const { error } = await supabase.from("charge_los").update({ status }).eq("id", l.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }
  async function loescheLos(l: Los) {
    if (!window.confirm(`Charge „${l.charge_nr}" samt Rückverfolgung und Prüfungen löschen?`)) return;
    const { error } = await supabase.from("charge_los").delete().eq("id", l.id);
    if (error) { window.alert("Löschen fehlgeschlagen: " + error.message); return; }
    await ladeAlles();
  }

  // ---------------- Verwendung (Rückverfolgbarkeit) ----------------
  async function addVerwendung(losId: string) {
    if (!vw.referenz.trim()) { setHinweis("Bitte eine Referenz (Auftrag/Lieferung/Rohstoff) angeben."); return; }
    const base = { los_id: losId, richtung: vw.richtung, referenz: vw.referenz.trim(), menge: zahl(vw.menge), datum: vw.datum || null, notiz: null };
    const ins = userId ? { ...base, owner_user_id: userId } : base;
    const { error } = await supabase.from("charge_verwendung").insert(ins);
    if (error) { window.alert("Fehler: " + error.message); return; }
    setVw({ richtung: vw.richtung, referenz: "", menge: "", datum: heuteISO() });
    await ladeAlles();
  }
  async function delVerwendung(id: string) {
    const { error } = await supabase.from("charge_verwendung").delete().eq("id", id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }

  // ---------------- Prüfung + Merkmal ----------------
  async function addPruefung(losId: string) {
    const base = { los_id: losId, art: pf.art, datum: pf.datum || null, pruefer: pf.pruefer.trim() || null, ergebnis: "offen", bemerkung: null };
    const ins = userId ? { ...base, owner_user_id: userId } : base;
    const { data, error } = await supabase.from("charge_pruefung").insert(ins).select("id").single();
    if (error) { window.alert("Fehler: " + error.message); return; }
    setPf({ art: pf.art, datum: heuteISO(), pruefer: pf.pruefer });
    if (data?.id) setSelPruef(data.id as string);
    await ladeAlles();
  }
  async function delPruefung(id: string) {
    if (!window.confirm("Diese Prüfung samt Merkmalen löschen?")) return;
    const { error } = await supabase.from("charge_pruefung").delete().eq("id", id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }
  async function addMerkmal(pruefungId: string) {
    if (!mk.merkmal.trim()) { setHinweis("Bitte ein Merkmal benennen (z. B. Durchmesser)."); return; }
    const base = { pruefung_id: pruefungId, merkmal: mk.merkmal.trim(), sollwert: zahl(mk.sollwert), toleranz_minus: zahl(mk.toleranz_minus), toleranz_plus: zahl(mk.toleranz_plus), istwert: zahl(mk.istwert), einheit: mk.einheit.trim() || null };
    const ins = userId ? { ...base, owner_user_id: userId } : base;
    const { error } = await supabase.from("charge_merkmal").insert(ins);
    if (error) { window.alert("Fehler: " + error.message); return; }
    setMk({ merkmal: "", sollwert: "", toleranz_minus: "", toleranz_plus: "", istwert: "", einheit: mk.einheit });
    await ladeAlles();
  }
  async function delMerkmal(id: string) {
    const { error } = await supabase.from("charge_merkmal").delete().eq("id", id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }

  // ---------------- PDF ----------------
  async function pdf(l: Los) {
    const { data: userData } = await supabase.auth.getUser();
    const meta = userData.user?.user_metadata ?? {};
    const aussteller = meta.firma || meta.firmenname || meta.name || "ARGONAUT OS";
    const vs = vwByLos[l.id] ?? [];
    const ps = pfByLos[l.id] ?? [];
    chargenPdf({
      aussteller: String(aussteller), chargeNr: l.charge_nr, bezeichnung: l.bezeichnung ?? "", typ: l.typ,
      artikel: l.artikel_id ? artikelName[l.artikel_id] ?? "" : "", datum: new Date().toLocaleDateString("de-DE"),
      status: STATUS_LABEL[l.status]?.text.replace(/^[^ ]+ /, "") ?? l.status,
      menge: l.menge != null ? `${num(l.menge)} ${l.einheit ?? ""}`.trim() : "—",
      herstellDatum: dstr(l.herstell_datum), mhd: dstr(l.mhd), herkunft: l.herkunft ?? "",
      eingaenge: vs.filter((v) => v.richtung === "eingang").map((v) => ({ referenz: v.referenz ?? "", menge: v.menge != null ? num(v.menge) : "", datum: dstr(v.datum) })),
      ausgaenge: vs.filter((v) => v.richtung === "ausgang").map((v) => ({ referenz: v.referenz ?? "", menge: v.menge != null ? num(v.menge) : "", datum: dstr(v.datum) })),
      pruefungen: ps.map((p) => {
        const ms = merkmaleByPruefung[p.id] ?? [];
        return {
          art: ART_LABEL[p.art] ?? p.art, datum: dstr(p.datum), pruefer: p.pruefer ?? "", ergebnis: gesamtErgebnis(ms),
          merkmale: ms.map((m) => ({
            merkmal: m.merkmal, soll: m.sollwert != null ? num(m.sollwert) : "—",
            tol: (m.toleranz_minus != null || m.toleranz_plus != null) ? `−${num(m.toleranz_minus)} / +${num(m.toleranz_plus)}` : "—",
            ist: m.istwert != null ? num(m.istwert) : "—", einheit: m.einheit ?? "", status: merkmalStatus(m),
          })),
        };
      }),
    });
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

  const mhdFarbe = (s: string) => (s === "abgelaufen" ? C.danger : s === "bald" ? C.warn : C.textDim);

  return (
    <div style={{ color: "#fff", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "clamp(26px,2.25vw,36px)", fontWeight: 800 }}>🔬 Chargen & Prüfplan</h1>
          <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: "clamp(14px,1.25vw,20px)" }}>
            Chargen/Serien mit Rückverfolgbarkeit (one up / one down) und Prüfplan (Soll ± Toleranz → i.O./n.i.O.)
          </p>
        </div>
        <button style={btnGold} onClick={oeffneNeu}>+ Charge / Serie</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={kachel}><div style={kLabel}>Chargen</div><div style={kWert}>{kpi.gesamt}</div></div>
        <div style={kachel}><div style={kLabel}>Gesperrt / Quar.</div><div style={{ ...kWert, color: kpi.gesperrt > 0 ? C.danger : C.green }}>{kpi.gesperrt}</div></div>
        <div style={kachel}><div style={kLabel}>n.i.O.-Prüfung</div><div style={{ ...kWert, color: kpi.nio > 0 ? C.danger : C.green }}>{kpi.nio}</div></div>
        <div style={kachel}><div style={kLabel}>Über MHD</div><div style={{ ...kWert, color: kpi.abgelaufen > 0 ? C.danger : C.green }}>{kpi.abgelaufen}</div></div>
        <div style={kachel}><div style={kLabel}>Ungeprüft</div><div style={{ ...kWert, color: kpi.ungeprueft > 0 ? C.warn : C.green }}>{kpi.ungeprueft}</div></div>
      </div>

      <KiAuge modul="Chargen & Prüfplan" regel={augeChargen({ gesperrt: kpi.gesperrt, abgelaufen: kpi.abgelaufen, nio: kpi.nio, ungeprueft: kpi.ungeprueft, gesamt: kpi.gesamt })} />

      {hinweis && (
        <div style={{ ...card, marginTop: 14, borderColor: "rgba(0,229,255,0.35)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ color: C.cyan }}>{hinweis}</span>
          <button style={btnGhost} onClick={() => setHinweis(null)}>OK</button>
        </div>
      )}

      {userId && <EigeneFelderManager modul={MODUL} ownerId={userId} onChange={ladeAlles} />}

      <div style={{ margin: "16px 0 14px" }}>
        <input style={{ ...input, maxWidth: 360 }} placeholder="Suche: Chargen-Nr., Bezeichnung, Auftrag…" value={suche} onChange={(e) => setSuche(e.target.value)} />
      </div>

      {laden ? (
        <div style={{ ...card, color: C.textDim }}>Lade Chargen…</div>
      ) : gefiltert.length === 0 ? (
        <div style={{ ...card, color: C.textDim }}>Noch keine Chargen. Lege oben rechts deine erste Charge/Serie an — dann Rückverfolgbarkeit und Prüfplan pflegen.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {gefiltert.map((l) => {
            const st = STATUS_LABEL[l.status] ?? { text: l.status, farbe: C.textDim };
            const ms = mhdStatus(l.mhd, heuteISO());
            const vs = vwByLos[l.id] ?? [];
            const ps = pfByLos[l.id] ?? [];
            const nioP = ps.filter((p) => gesamtErgebnis(merkmaleByPruefung[p.id] ?? []) === "nio").length;
            const rest = offeneMenge(l.menge, vs);
            const istOffen = offen === l.id;
            return (
              <div key={l.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: "clamp(17px,1.5vw,24px)", fontWeight: 800 }}>
                      {l.charge_nr}
                      <span style={{ marginLeft: 8, fontSize: "clamp(11px,0.9vw,15px)", color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 6px" }}>{l.typ === "serie" ? "Serie" : "Charge"}</span>
                      <span style={{ marginLeft: 8, ...pill(st.farbe) }}>{st.text}</span>
                      {nioP > 0 && <span style={{ marginLeft: 8, ...pill(C.danger) }}>n.i.O.</span>}
                    </div>
                    <div style={{ color: C.textDim, fontSize: "clamp(13px,1.13vw,18px)", marginTop: 5 }}>
                      {l.bezeichnung || (l.artikel_id ? artikelName[l.artikel_id] : "") || "—"}
                      {l.menge != null && <> · {num(l.menge)} {l.einheit} (offen {num(rest)})</>}
                      {l.mhd && <> · MHD <span style={{ color: mhdFarbe(ms), fontWeight: 700 }}>{dstr(l.mhd)}</span></>}
                    </div>
                    <EigeneFelderAnzeige felder={felder} werte={werteMap[l.id]} />
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button style={btnGhost} onClick={() => { setOffen(istOffen ? null : l.id); setSelPruef(null); }}>{istOffen ? "▲ Details" : "▼ Details"}</button>
                    <button style={btnGhost} onClick={() => pdf(l)}>📄 Nachweis</button>
                    <button style={btnGhost} onClick={() => oeffneBearbeiten(l)}>Bearbeiten</button>
                    <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loescheLos(l)}>Löschen</button>
                  </div>
                </div>

                {istOffen && (
                  <div style={{ marginTop: 14, display: "grid", gap: 16 }}>
                    {/* Status-Schnellwahl */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ color: C.textDim, fontSize: "clamp(12px,1vw,16px)" }}>Status setzen:</span>
                      {CHARGE_STATUS.map((s) => (
                        <button key={s} style={{ ...btnGhost, ...(l.status === s ? { borderColor: STATUS_LABEL[s].farbe, color: STATUS_LABEL[s].farbe } : {}) }} onClick={() => statusSetzen(l, s)}>{STATUS_LABEL[s].text}</button>
                      ))}
                    </div>

                    {/* Rückverfolgbarkeit */}
                    <div>
                      <div style={{ fontWeight: 800, marginBottom: 8 }}>🔗 Rückverfolgbarkeit (one up / one down)</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
                        <div><label style={label}>Richtung</label>
                          <select style={{ ...input, minWidth: 130 }} value={vw.richtung} onChange={(e) => setVw({ ...vw, richtung: e.target.value })}>
                            {VERWENDUNG_RICHTUNG.map((r) => <option key={r} value={r}>{r === "eingang" ? "Eingang (Rohstoff)" : "Ausgang (Auftrag)"}</option>)}
                          </select>
                        </div>
                        <div style={{ flex: 1, minWidth: 160 }}><label style={label}>Referenz</label><input style={input} value={vw.referenz} onChange={(e) => setVw({ ...vw, referenz: e.target.value })} placeholder="Auftrag / Lieferung / Rohstoff-Charge" /></div>
                        <div style={{ width: 90 }}><label style={label}>Menge</label><input style={input} value={vw.menge} onChange={(e) => setVw({ ...vw, menge: e.target.value })} inputMode="decimal" /></div>
                        <div><label style={label}>Datum</label><input type="date" style={input} value={vw.datum} onChange={(e) => setVw({ ...vw, datum: e.target.value })} /></div>
                        <button style={btnGold} onClick={() => addVerwendung(l.id)}>+ Eintrag</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {(["eingang", "ausgang"] as const).map((ri) => (
                          <div key={ri} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ color: C.textDim, fontWeight: 700, marginBottom: 6 }}>{ri === "eingang" ? "⬇ Eingänge" : "⬆ Ausgänge"}</div>
                            {vs.filter((v) => v.richtung === ri).length === 0 ? (
                              <div style={{ color: C.textDim, fontSize: "clamp(12px,1vw,16px)" }}>—</div>
                            ) : vs.filter((v) => v.richtung === ri).map((v) => (
                              <div key={v.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", fontSize: "clamp(13px,1.1vw,17px)" }}>
                                <span>{v.referenz}{v.menge != null ? ` · ${num(v.menge)}` : ""} <span style={{ color: C.textDim }}>{dstr(v.datum)}</span></span>
                                <button style={{ background: "none", border: "none", color: C.danger, cursor: "pointer" }} onClick={() => delVerwendung(v.id)}>✕</button>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Prüfplan */}
                    <div>
                      <div style={{ fontWeight: 800, marginBottom: 8 }}>🔬 Prüfplan</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
                        <div><label style={label}>Prüfart</label>
                          <select style={{ ...input, minWidth: 150 }} value={pf.art} onChange={(e) => setPf({ ...pf, art: e.target.value })}>
                            {PRUEF_ART.map((a) => <option key={a} value={a}>{ART_LABEL[a]}</option>)}
                          </select>
                        </div>
                        <div><label style={label}>Datum</label><input type="date" style={input} value={pf.datum} onChange={(e) => setPf({ ...pf, datum: e.target.value })} /></div>
                        <div style={{ flex: 1, minWidth: 130 }}><label style={label}>Prüfer</label><input style={input} value={pf.pruefer} onChange={(e) => setPf({ ...pf, pruefer: e.target.value })} /></div>
                        <button style={btnGold} onClick={() => addPruefung(l.id)}>+ Prüfung</button>
                      </div>

                      {ps.length === 0 ? (
                        <div style={{ color: C.textDim, fontSize: "clamp(12px,1vw,16px)" }}>Noch keine Prüfung. Lege oben eine an und trage die Merkmale ein.</div>
                      ) : ps.map((p) => {
                        const ms2 = merkmaleByPruefung[p.id] ?? [];
                        const erg = gesamtErgebnis(ms2);
                        const ergFarbe = erg === "io" ? C.green : erg === "nio" ? C.danger : C.textDim;
                        const sel = selPruef === p.id;
                        return (
                          <div key={p.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                              <div>
                                <b>{ART_LABEL[p.art] ?? p.art}</b> <span style={{ color: C.textDim }}>· {dstr(p.datum)}{p.pruefer ? ` · ${p.pruefer}` : ""}</span>
                                <span style={{ marginLeft: 8, ...pill(ergFarbe) }}>{erg === "io" ? "i.O." : erg === "nio" ? "n.i.O." : "offen"} ({nioAnzahl(ms2)} n.i.O. / {ms2.length})</span>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button style={btnGhost} onClick={() => setSelPruef(sel ? null : p.id)}>{sel ? "▲ Merkmale" : "▼ Merkmale"}</button>
                                <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => delPruefung(p.id)}>✕</button>
                              </div>
                            </div>
                            {sel && (
                              <div style={{ marginTop: 10 }}>
                                {ms2.length > 0 && (
                                  <div style={{ overflowX: "auto", marginBottom: 8 }}>
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "clamp(12px,1.05vw,16px)" }}>
                                      <thead><tr style={{ color: C.textDim, textAlign: "left" }}>
                                        <th style={{ padding: "4px 6px" }}>Merkmal</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Soll</th>
                                        <th style={{ padding: "4px 6px", textAlign: "right" }}>Toleranz</th><th style={{ padding: "4px 6px", textAlign: "right" }}>Ist</th>
                                        <th style={{ padding: "4px 6px", textAlign: "right" }}>Bew.</th><th></th>
                                      </tr></thead>
                                      <tbody>
                                        {ms2.map((m) => {
                                          const s = merkmalStatus(m);
                                          const f = s === "io" ? C.green : s === "nio" ? C.danger : C.textDim;
                                          return (
                                            <tr key={m.id} style={{ borderTop: `1px solid ${C.border}` }}>
                                              <td style={{ padding: "5px 6px" }}>{m.merkmal}</td>
                                              <td style={{ padding: "5px 6px", textAlign: "right" }}>{m.sollwert != null ? num(m.sollwert) : "—"}</td>
                                              <td style={{ padding: "5px 6px", textAlign: "right", color: C.textDim }}>{(m.toleranz_minus != null || m.toleranz_plus != null) ? `−${num(m.toleranz_minus)} / +${num(m.toleranz_plus)}` : "—"}</td>
                                              <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700 }}>{m.istwert != null ? num(m.istwert) : "—"} {m.einheit}</td>
                                              <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 800, color: f }}>{s === "io" ? "i.O." : s === "nio" ? "n.i.O." : "–"}</td>
                                              <td style={{ padding: "5px 6px", textAlign: "right" }}><button style={{ background: "none", border: "none", color: C.danger, cursor: "pointer" }} onClick={() => delMerkmal(m.id)}>✕</button></td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                                  <div style={{ flex: 1, minWidth: 130 }}><label style={label}>Merkmal</label><input style={input} value={mk.merkmal} onChange={(e) => setMk({ ...mk, merkmal: e.target.value })} placeholder="z. B. Durchmesser" /></div>
                                  <div style={{ width: 80 }}><label style={label}>Soll</label><input style={input} value={mk.sollwert} onChange={(e) => setMk({ ...mk, sollwert: e.target.value })} inputMode="decimal" /></div>
                                  <div style={{ width: 70 }}><label style={label}>Tol −</label><input style={input} value={mk.toleranz_minus} onChange={(e) => setMk({ ...mk, toleranz_minus: e.target.value })} inputMode="decimal" /></div>
                                  <div style={{ width: 70 }}><label style={label}>Tol +</label><input style={input} value={mk.toleranz_plus} onChange={(e) => setMk({ ...mk, toleranz_plus: e.target.value })} inputMode="decimal" /></div>
                                  <div style={{ width: 80 }}><label style={label}>Ist</label><input style={input} value={mk.istwert} onChange={(e) => setMk({ ...mk, istwert: e.target.value })} inputMode="decimal" /></div>
                                  <div style={{ width: 70 }}><label style={label}>Einheit</label><input style={input} value={mk.einheit} onChange={(e) => setMk({ ...mk, einheit: e.target.value })} placeholder="mm" /></div>
                                  <button style={btnGold} onClick={() => addMerkmal(p.id)}>+ Merkmal</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Charge-Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" }} onClick={() => setModal(false)}>
          <div style={{ ...card, width: "100%", maxWidth: 620, background: C.navy }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(20px,1.75vw,28px)", fontWeight: 800 }}>{editId ? "Charge bearbeiten" : "Neue Charge / Serie"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div><label style={label}>Chargen-/Seriennummer *</label><input style={input} value={form.charge_nr} onChange={(e) => setF("charge_nr", e.target.value)} placeholder="z. B. 2026-0428-A" /></div>
              <div><label style={label}>Typ</label><select style={input} value={form.typ} onChange={(e) => setF("typ", e.target.value)}><option value="charge">Charge (Los)</option><option value="serie">Seriennummer (Einzelstück)</option></select></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Bezeichnung</label><input style={input} value={form.bezeichnung} onChange={(e) => setF("bezeichnung", e.target.value)} placeholder="Produkt / Artikelbezeichnung" /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Basis-Artikel (optional)</label>
                <select style={input} value={form.artikel_id} onChange={(e) => setF("artikel_id", e.target.value)}><option value="">— keiner —</option>{artikel.map((a) => <option key={a.id} value={a.id}>{a.bezeichnung}</option>)}</select>
              </div>
              <div><label style={label}>Menge</label><input style={input} value={form.menge} onChange={(e) => setF("menge", e.target.value)} inputMode="decimal" /></div>
              <div><label style={label}>Einheit</label><input style={input} value={form.einheit} onChange={(e) => setF("einheit", e.target.value)} /></div>
              <div><label style={label}>Herstelldatum</label><input type="date" style={input} value={form.herstell_datum} onChange={(e) => setF("herstell_datum", e.target.value)} /></div>
              <NurVoll><div><label style={label}>MHD / Verfall (optional)</label><input type="date" style={input} value={form.mhd} onChange={(e) => setF("mhd", e.target.value)} /></div></NurVoll>
              <NurVoll><div><label style={label}>Herkunft (Lieferant/Vor-Charge)</label><input style={input} value={form.herkunft} onChange={(e) => setF("herkunft", e.target.value)} /></div></NurVoll>
              <NurVoll><div><label style={label}>Auftrag / Los</label><input style={input} value={form.auftrag} onChange={(e) => setF("auftrag", e.target.value)} /></div></NurVoll>
              <div><label style={label}>Status</label><select style={input} value={form.status} onChange={(e) => setF("status", e.target.value)}>{CHARGE_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s].text}</option>)}</select></div>
              <NurVoll><div style={{ gridColumn: "1 / -1" }}><label style={label}>Bemerkung</label><input style={input} value={form.bemerkung} onChange={(e) => setF("bemerkung", e.target.value)} /></div></NurVoll>
              <NurVoll><EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={input} labStyle={label} /></NurVoll>
            </div>
            {fehler && <div style={{ marginTop: 12, color: C.danger, fontWeight: 600 }}>{fehler}</div>}
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
