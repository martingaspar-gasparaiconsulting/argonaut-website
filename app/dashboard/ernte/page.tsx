"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";
import { augeErnte } from "@/lib/auge";
import {
  ERNTE_STATUS,
  MARKT_KATEGORIEN,
  HERKUNFT,
  verkaufsWerte,
  gruppiereMarkttage,
  zaehleErnte,
} from "@/lib/ernte";
import { markttagPdf } from "@/lib/markttagPdf";
import { offeneBuchungen } from "@/lib/umsatzBuchung";
import { findeArtikelId, artikelStammAusErnte, neuerBestand } from "@/lib/lagerZugang";
import Leerzustand from "../_components/Leerzustand";

// ---------------------------------------------------------------------
// ARGONAUT OS · L2-6 · Ernte, Direktvermarktung & Marktstände
// 3 Reiter: Ernte (Menge/Qualität/Lager, dockt an Schlagkartei), Produkte
// (Marktstand-Katalog), Markttage (Verkäufe je Tag → Tageserlös + Abrechnung).
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

interface Ernte { id: string; schlag_id: string | null; kultur: string; datum: string | null; menge: number | null; einheit: string | null; qualitaet: string | null; lagerort: string | null; status: string; notiz: string | null; lager_gebucht: boolean; }
interface Produkt { id: string; bezeichnung: string; kategorie: string | null; einheit: string; preis: number | null; mwst_satz: number | null; bio: boolean; herkunft: string; verfuegbar: boolean; notiz: string | null; }
interface Verkauf { id: string; produkt_id: string | null; bezeichnung: string | null; datum: string | null; ort: string | null; menge: number | null; einzelpreis: number | null; mwst_satz: number | null; }
interface SchlagKurz { id: string; bezeichnung: string; }

const heute = () => new Date().toISOString().slice(0, 10);
function zahl(s: string): number | null { return s.trim() === "" ? null : Number(s.replace(",", ".")); }
function num(x: number | null): string { return (Number(x) || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 }); }
function eur(x: number | null): string { return (Number(x) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" }); }
function dstr(s: string | null): string { return s ? new Date(s).toLocaleDateString("de-DE") : "—"; }

type EForm = { schlag_id: string; kultur: string; datum: string; menge: string; einheit: string; qualitaet: string; lagerort: string; status: string; notiz: string };
const LEER_E: EForm = { schlag_id: "", kultur: "", datum: heute(), menge: "", einheit: "kg", qualitaet: "", lagerort: "", status: "gelagert", notiz: "" };
type PForm = { bezeichnung: string; kategorie: string; einheit: string; preis: string; mwst_satz: string; bio: boolean; herkunft: string; verfuegbar: boolean; notiz: string };
const LEER_P: PForm = { bezeichnung: "", kategorie: "Gemüse", einheit: "kg", preis: "", mwst_satz: "7", bio: false, herkunft: "eigen", verfuegbar: true, notiz: "" };

export default function ErnteSeite() {
  const [tab, setTab] = useState<"ernte" | "produkte" | "markt">("ernte");
  const [ernten, setErnten] = useState<Ernte[]>([]);
  const [produkte, setProdukte] = useState<Produkt[]>([]);
  const [verkaeufe, setVerkaeufe] = useState<Verkauf[]>([]);
  const [schlaege, setSchlaege] = useState<SchlagKurz[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [hinweis, setHinweis] = useState<string | null>(null);

  const [eModal, setEModal] = useState(false);
  const [eEdit, setEEdit] = useState<string | null>(null);
  const [eForm, setEForm] = useState<EForm>(LEER_E);
  const [pModal, setPModal] = useState(false);
  const [pEdit, setPEdit] = useState<string | null>(null);
  const [pForm, setPForm] = useState<PForm>(LEER_P);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finanzMeldung, setFinanzMeldung] = useState<string | null>(null);

  // Verkauf-Buchung
  const [vk, setVk] = useState({ datum: heute(), ort: "", produkt_id: "", menge: "", einzelpreis: "", mwst_satz: "7" });

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
    const [e, p, v, s] = await Promise.all([
      supabase.from("ernte_ernte").select("*").order("datum", { ascending: false }),
      supabase.from("markt_produkt").select("*").order("bezeichnung", { ascending: true }),
      supabase.from("markt_verkauf").select("*").order("datum", { ascending: false }),
      supabase.from("schlag").select("id, bezeichnung").order("bezeichnung", { ascending: true }),
    ]);
    if (!e.error && e.data) setErnten(e.data as Ernte[]);
    if (!p.error && p.data) setProdukte(p.data as Produkt[]);
    if (!v.error && v.data) setVerkaeufe(v.data as Verkauf[]);
    if (!s.error && s.data) setSchlaege(s.data as SchlagKurz[]); // Schlagkartei optional
    setLaden(false);
  }

  // Marktverkäufe als Einnahmen in die Finanzen (zahlungen) buchen — idempotent
  async function bucheInFinanzen() {
    setBusy(true); setFinanzMeldung(null); setFehler(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? userId;
      if (!uid) { setFehler("Nicht eingeloggt."); setBusy(false); return; }
      const { data: vorhanden } = await supabase.from("zahlungen").select("referenz");
      const refs = (vorhanden ?? []).map((z: { referenz: string | null }) => z.referenz || "").filter(Boolean);
      const roh = verkaeufe.map((v) => ({ id: v.id, betrag: verkaufsWerte(v.menge, v.einzelpreis, v.mwst_satz).brutto, datum: v.datum }));
      const payloads = offeneBuchungen(roh, "markt", refs, heute(), "Bar (Markt)");
      if (payloads.length === 0) { setFinanzMeldung("Alle Marktverkäufe sind bereits in den Finanzen gebucht."); setBusy(false); return; }
      const uidLocal = uid;
      const zeilen = payloads.map((p) => ({ ...p, owner_user_id: uidLocal }));
      const { error } = await supabase.from("zahlungen").insert(zeilen);
      if (error) { setFehler("Buchen fehlgeschlagen: " + error.message); setBusy(false); return; }
      setFinanzMeldung(`${payloads.length} Verkauf${payloads.length === 1 ? "" : "e"} in die Finanzen gebucht — sichtbar in EÜR & Finanz-Cockpit.`);
    } catch (e: any) {
      setFehler("Fehler: " + (e?.message || "unbekannt"));
    }
    setBusy(false);
  }

  // Ernte-Menge als Zugang ins Lager buchen (Artikel per Namen finden → Bestand
  // erhöhen, sonst neuen Artikel anlegen). Idempotent über ernte_ernte.lager_gebucht.
  async function bucheInsLager(e: Ernte) {
    const menge = Number(e.menge) || 0;
    if (menge <= 0) { setHinweis("Dieser Ernte-Posten hat keine Menge zum Einlagern."); return; }
    setBusy(true); setFehler(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? userId;
      if (!uid) { setFehler("Nicht eingeloggt."); setBusy(false); return; }
      const { data: artsRaw } = await supabase.from("artikel").select("id, bezeichnung, aktueller_bestand");
      const arts = (artsRaw ?? []) as { id: string; bezeichnung: string | null; aktueller_bestand: number | null }[];
      const treffer = findeArtikelId(e.kultur, arts);
      if (treffer) {
        const alt = arts.find((a) => a.id === treffer)?.aktueller_bestand ?? 0;
        const { error } = await supabase.from("artikel").update({ aktueller_bestand: neuerBestand(alt, menge) }).eq("id", treffer);
        if (error) { setFehler("Lager-Update fehlgeschlagen: " + error.message); setBusy(false); return; }
      } else {
        const stamm = artikelStammAusErnte(e.kultur, e.einheit);
        const ins = { ...stamm, aktueller_bestand: menge, owner_user_id: uid };
        const { error } = await supabase.from("artikel").insert(ins);
        if (error) { setFehler("Artikel anlegen fehlgeschlagen: " + error.message); setBusy(false); return; }
      }
      const { error: uErr } = await supabase.from("ernte_ernte").update({ lager_gebucht: true }).eq("id", e.id);
      if (uErr) { setFehler("Markieren fehlgeschlagen: " + uErr.message); setBusy(false); return; }
      setHinweis(`${num(menge)} ${e.einheit ?? ""} „${e.kultur}" ins Lager gebucht${treffer ? " (Bestand erhöht)" : " (neuer Artikel angelegt)"}.`);
      await ladeAlles();
    } catch (err: any) {
      setFehler("Fehler: " + (err?.message || "unbekannt"));
    }
    setBusy(false);
  }

  const kpi = useMemo(() => zaehleErnte(ernten, produkte, verkaeufe), [ernten, produkte, verkaeufe]);
  const markttage = useMemo(() => gruppiereMarkttage(verkaeufe), [verkaeufe]);
  const produktById = useMemo(() => { const m: Record<string, Produkt> = {}; produkte.forEach((p) => (m[p.id] = p)); return m; }, [produkte]);
  const schlagName = useMemo(() => { const m: Record<string, string> = {}; schlaege.forEach((s) => (m[s.id] = s.bezeichnung)); return m; }, [schlaege]);

  // ---------- Ernte ----------
  function openErnte(e?: Ernte) {
    setEEdit(e?.id ?? null);
    setEForm(e ? { schlag_id: e.schlag_id ?? "", kultur: e.kultur ?? "", datum: e.datum ?? heute(), menge: e.menge != null ? String(e.menge) : "", einheit: e.einheit ?? "kg", qualitaet: e.qualitaet ?? "", lagerort: e.lagerort ?? "", status: e.status ?? "gelagert", notiz: e.notiz ?? "" } : LEER_E);
    setFehler(null); setEModal(true);
  }
  async function speichereErnte() {
    if (!eForm.kultur.trim()) { setFehler("Kultur ist Pflicht."); return; }
    setBusy(true); setFehler(null);
    const payload = { schlag_id: eForm.schlag_id || null, kultur: eForm.kultur.trim(), datum: eForm.datum || null, menge: zahl(eForm.menge), einheit: eForm.einheit.trim() || null, qualitaet: eForm.qualitaet.trim() || null, lagerort: eForm.lagerort.trim() || null, status: eForm.status, notiz: eForm.notiz.trim() || null };
    let error = null as { message: string } | null;
    if (eEdit) error = (await supabase.from("ernte_ernte").update(payload).eq("id", eEdit)).error;
    else { const ins = userId ? { ...payload, owner_user_id: userId } : payload; error = (await supabase.from("ernte_ernte").insert(ins)).error; }
    setBusy(false);
    if (error) { setFehler("Speichern fehlgeschlagen: " + error.message); return; }
    setEModal(false); await ladeAlles();
  }
  async function ernteStatus(e: Ernte, status: string) {
    const { error } = await supabase.from("ernte_ernte").update({ status }).eq("id", e.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }
  async function loescheErnte(e: Ernte) {
    if (!window.confirm(`Ernte-Posten „${e.kultur}" löschen?`)) return;
    const { error } = await supabase.from("ernte_ernte").delete().eq("id", e.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }

  // ---------- Produkt ----------
  function openProdukt(p?: Produkt) {
    setPEdit(p?.id ?? null);
    setPForm(p ? { bezeichnung: p.bezeichnung ?? "", kategorie: p.kategorie ?? "Gemüse", einheit: p.einheit ?? "kg", preis: p.preis != null ? String(p.preis) : "", mwst_satz: p.mwst_satz != null ? String(p.mwst_satz) : "7", bio: p.bio, herkunft: p.herkunft ?? "eigen", verfuegbar: p.verfuegbar, notiz: p.notiz ?? "" } : LEER_P);
    setFehler(null); setPModal(true);
  }
  async function speichereProdukt() {
    if (!pForm.bezeichnung.trim()) { setFehler("Bezeichnung ist Pflicht."); return; }
    setBusy(true); setFehler(null);
    const payload = { bezeichnung: pForm.bezeichnung.trim(), kategorie: pForm.kategorie || "Sonstiges", einheit: pForm.einheit.trim() || "Stück", preis: zahl(pForm.preis), mwst_satz: zahl(pForm.mwst_satz) ?? 7, bio: pForm.bio, herkunft: pForm.herkunft, verfuegbar: pForm.verfuegbar, notiz: pForm.notiz.trim() || null };
    let error = null as { message: string } | null;
    if (pEdit) error = (await supabase.from("markt_produkt").update(payload).eq("id", pEdit)).error;
    else { const ins = userId ? { ...payload, owner_user_id: userId } : payload; error = (await supabase.from("markt_produkt").insert(ins)).error; }
    setBusy(false);
    if (error) { setFehler("Speichern fehlgeschlagen: " + error.message); return; }
    setPModal(false); await ladeAlles();
  }
  async function toggleProdukt(p: Produkt) {
    const { error } = await supabase.from("markt_produkt").update({ verfuegbar: !p.verfuegbar }).eq("id", p.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }
  async function loescheProdukt(p: Produkt) {
    if (!window.confirm(`Produkt „${p.bezeichnung}" löschen?`)) return;
    const { error } = await supabase.from("markt_produkt").delete().eq("id", p.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }

  // ---------- Verkauf ----------
  function waehleProdukt(id: string) {
    const p = produktById[id];
    setVk((v) => ({ ...v, produkt_id: id, einzelpreis: p?.preis != null ? String(p.preis) : v.einzelpreis, mwst_satz: p?.mwst_satz != null ? String(p.mwst_satz) : v.mwst_satz }));
  }
  async function bucheVerkauf() {
    if (!vk.produkt_id) { setHinweis("Bitte ein Produkt wählen."); return; }
    if (!vk.menge.trim()) { setHinweis("Bitte die Menge angeben."); return; }
    const p = produktById[vk.produkt_id];
    const base = { produkt_id: vk.produkt_id, bezeichnung: p?.bezeichnung ?? null, datum: vk.datum || null, ort: vk.ort.trim() || null, menge: zahl(vk.menge), einzelpreis: zahl(vk.einzelpreis), mwst_satz: zahl(vk.mwst_satz) ?? 7 };
    const ins = userId ? { ...base, owner_user_id: userId } : base;
    const { error } = await supabase.from("markt_verkauf").insert(ins);
    if (error) { window.alert("Fehler: " + error.message); return; }
    setVk({ datum: vk.datum, ort: vk.ort, produkt_id: "", menge: "", einzelpreis: "", mwst_satz: "7" });
    await ladeAlles();
  }
  async function loescheVerkauf(id: string) {
    const { error } = await supabase.from("markt_verkauf").delete().eq("id", id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }

  async function pdf(datum: string, ort: string) {
    const { data: userData } = await supabase.auth.getUser();
    const meta = userData.user?.user_metadata ?? {};
    const aussteller = meta.firma || meta.firmenname || meta.name || "ARGONAUT OS";
    const tag = markttage.find((t) => t.datum === datum && t.ort === ort);
    if (!tag) return;
    markttagPdf({
      aussteller: String(aussteller), ort: ort || "Markt", datum: dstr(datum),
      posten: tag.verkaeufe.map((v) => ({ produkt: (v as Verkauf).bezeichnung ?? "—", menge: `${num(v.menge ?? 0)}`, einzelpreis: eur(v.einzelpreis ?? 0), brutto: eur(verkaufsWerte(v.menge, v.einzelpreis, v.mwst_satz).brutto) })),
      summeNetto: eur(tag.netto), summeMwst: eur(tag.mwst), summeBrutto: eur(tag.brutto),
    });
  }

  async function importiereProdukte(text: string) {
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
        bezeichnung: val("bezeichnung"), kategorie: val("kategorie") || "Sonstiges", einheit: val("einheit") || "kg",
        preis: zahl(val("preis")), mwst_satz: zahl(val("mwst_satz")) ?? 7,
        bio: val("bio").toLowerCase() === "ja" || val("bio") === "1", herkunft: val("herkunft") || "eigen", verfuegbar: true,
      };
      rows.push(userId ? { ...base, owner_user_id: userId } : base);
    }
    if (rows.length === 0) { setHinweis("Keine gültigen Zeilen gefunden."); return; }
    const { error } = await supabase.from("markt_produkt").insert(rows);
    if (error) { window.alert("Import fehlgeschlagen: " + error.message); return; }
    setHinweis(`${rows.length} Produkt(e) importiert.`); await ladeAlles();
  }
  function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => importiereProdukte(String(r.result || "")); r.readAsText(f, "utf-8"); e.target.value = "";
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
        <h1 style={{ margin: 0, fontSize: "clamp(26px,2.25vw,36px)", fontWeight: 800 }}>🧺 Ernte & Direktvermarktung</h1>
        <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: "clamp(14px,1.25vw,20px)" }}>Ernte erfassen, Marktstand-Katalog pflegen und Markttage abrechnen</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={kachel}><div style={kLabel}>Ernte-Posten</div><div style={kWert}>{kpi.erntePosten}</div></div>
        <div style={kachel}><div style={kLabel}>Gelagert</div><div style={{ ...kWert, color: kpi.gelagert > 0 ? C.warn : C.green }}>{kpi.gelagert}</div></div>
        <div style={kachel}><div style={kLabel}>Produkte</div><div style={kWert}>{kpi.produkte}</div></div>
        <div style={kachel}><div style={kLabel}>Markttage</div><div style={kWert}>{kpi.markttage}</div></div>
        <div style={kachel}><div style={kLabel}>Umsatz (brutto)</div><div style={{ ...kWert, color: C.gold }}>{eur(kpi.umsatzBrutto)}</div></div>
      </div>

      <KiAuge modul="Ernte & Direktvermarktung" regel={augeErnte({ gelagert: kpi.gelagert, umsatzBrutto: kpi.umsatzBrutto, markttage: kpi.markttage, erntePosten: kpi.erntePosten, produkte: kpi.produkte, gesamt: kpi.gesamt })} />

      {hinweis && <div style={{ ...card, marginTop: 14, borderColor: "rgba(0,229,255,0.35)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><span style={{ color: C.cyan }}>{hinweis}</span><button style={btnGhost} onClick={() => setHinweis(null)}>OK</button></div>}

      <div style={{ display: "flex", gap: 8, margin: "16px 0 14px", flexWrap: "wrap" }}>
        <button style={tab === "ernte" ? btnGold : btnGhost} onClick={() => setTab("ernte")}>🌾 Ernte</button>
        <button style={tab === "produkte" ? btnGold : btnGhost} onClick={() => setTab("produkte")}>🥕 Produkte</button>
        <button style={tab === "markt" ? btnGold : btnGhost} onClick={() => setTab("markt")}>🧺 Markttage</button>
      </div>

      {laden ? (
        <div style={{ ...card, color: C.textDim }}>Lade…</div>
      ) : tab === "ernte" ? (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button style={btnGold} onClick={() => openErnte()}>+ Ernte erfassen</button></div>
          {ernten.length === 0 ? <Leerzustand icon="🌾" titel="Noch keine Ernte erfasst" text="Erfasse Erntemengen je Kultur — Basis für Lager und Direktvermarktung." schritte={["Ernte oben erfassen", "Kultur, Menge und Qualität eintragen", "Bei Bedarf ins Lager buchen"]} /> : (
            <div style={{ display: "grid", gap: 8 }}>
              {ernten.map((e) => (
                <div key={e.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <span style={{ fontSize: "clamp(15px,1.3vw,20px)", fontWeight: 700 }}>{e.kultur}</span>
                    {e.menge != null && <span style={{ marginLeft: 8, color: C.gold, fontWeight: 700 }}>{num(e.menge)} {e.einheit}</span>}
                    <span style={{ marginLeft: 8, ...pill(e.status === "gelagert" ? C.warn : e.status === "verkauft" ? C.green : C.textDim) }}>{e.status}</span>
                    <div style={{ color: C.textDim, fontSize: "clamp(12px,1.05vw,16px)", marginTop: 4 }}>
                      {dstr(e.datum)}{e.schlag_id && schlagName[e.schlag_id] ? ` · Schlag ${schlagName[e.schlag_id]}` : ""}{e.qualitaet ? ` · ${e.qualitaet}` : ""}{e.lagerort ? ` · Lager ${e.lagerort}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {e.menge != null && e.menge > 0 && (
                      e.lager_gebucht
                        ? <span style={{ ...pill(C.green) }}>✓ im Lager</span>
                        : <button style={{ ...btnGhost, color: C.cyan, borderColor: "rgba(0,229,255,0.4)" }} disabled={busy} onClick={() => bucheInsLager(e)}>📦 Ins Lager</button>
                    )}
                    {e.status === "gelagert" && <button style={btnGhost} onClick={() => ernteStatus(e, "verkauft")}>✓ verkauft</button>}
                    <button style={btnGhost} onClick={() => openErnte(e)}>Bearbeiten</button>
                    <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loescheErnte(e)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "produkte" ? (
        <div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 12, flexWrap: "wrap" }}>
            <label style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6 }}>⤓ CSV importieren<input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onCsv} /></label>
            <button style={btnGold} onClick={() => openProdukt()}>+ Produkt</button>
          </div>
          {produkte.length === 0 ? <Leerzustand icon="🥕" titel="Noch keine Produkte im Katalog" text="Lege deine Marktstand-Produkte mit Preis und MwSt an." schritte={["Produkt oben anlegen", "Preis (inkl. MwSt) und Kategorie setzen", "Beim Markttag verkaufen"]} /> : (
            <div style={{ display: "grid", gap: 8 }}>
              {produkte.map((p) => (
                <div key={p.id} style={{ ...card, opacity: p.verfuegbar ? 1 : 0.55, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <span style={{ fontSize: "clamp(15px,1.3vw,20px)", fontWeight: 700 }}>{p.bezeichnung}</span>
                    {p.bio && <span style={{ marginLeft: 8, ...pill(C.green) }}>Bio</span>}
                    <span style={{ marginLeft: 8, ...pill(C.textDim) }}>{p.kategorie}</span>
                    {!p.verfuegbar && <span style={{ marginLeft: 6, ...pill(C.warn) }}>nicht verfügbar</span>}
                    <div style={{ color: C.textDim, fontSize: "clamp(12px,1.05vw,16px)", marginTop: 4 }}>
                      {eur(p.preis)} / {p.einheit} · {p.mwst_satz}% MwSt · {p.herkunft === "eigen" ? "eigene Erzeugung" : "zugekauft"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={btnGhost} onClick={() => toggleProdukt(p)}>{p.verfuegbar ? "ausblenden" : "anbieten"}</button>
                    <button style={btnGhost} onClick={() => openProdukt(p)}>Bearbeiten</button>
                    <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loescheProdukt(p)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // ============ MARKTTAGE ============
        <div>
          <div style={{ ...card, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 800 }}>💶 Umsatz in die Finanzen buchen</div>
              <div style={{ color: C.textDim, fontSize: "clamp(12px,1.05vw,16px)", marginTop: 3 }}>Überträgt deine Marktverkäufe als Einnahmen in EÜR &amp; Finanz-Cockpit. Mehrfaches Klicken bucht nichts doppelt.</div>
              {finanzMeldung && <div style={{ color: C.cyan, fontSize: "clamp(12px,1.05vw,16px)", marginTop: 6 }}>{finanzMeldung}</div>}
            </div>
            <button style={{ ...btnGold, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={bucheInFinanzen}>{busy ? "…" : "In Finanzen buchen"}</button>
          </div>
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Verkauf buchen</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div><label style={label}>Datum</label><input type="date" style={input} value={vk.datum} onChange={(e) => setVk({ ...vk, datum: e.target.value })} /></div>
              <div style={{ minWidth: 140 }}><label style={label}>Markt / Ort</label><input style={input} value={vk.ort} onChange={(e) => setVk({ ...vk, ort: e.target.value })} placeholder="z. B. Wochenmarkt" /></div>
              <div style={{ flex: 1, minWidth: 170 }}><label style={label}>Produkt</label>
                <select style={input} value={vk.produkt_id} onChange={(e) => waehleProdukt(e.target.value)}>
                  <option value="">— wählen —</option>
                  {produkte.filter((p) => p.verfuegbar).map((p) => <option key={p.id} value={p.id}>{p.bezeichnung} ({eur(p.preis)}/{p.einheit})</option>)}
                </select>
              </div>
              <div style={{ width: 90 }}><label style={label}>Menge</label><input style={input} value={vk.menge} onChange={(e) => setVk({ ...vk, menge: e.target.value })} inputMode="decimal" /></div>
              <div style={{ width: 100 }}><label style={label}>Einzelpreis</label><input style={input} value={vk.einzelpreis} onChange={(e) => setVk({ ...vk, einzelpreis: e.target.value })} inputMode="decimal" /></div>
              <button style={btnGold} onClick={bucheVerkauf}>+ Verkauf</button>
            </div>
            {vk.produkt_id && vk.menge && <div style={{ marginTop: 8, color: C.cyan }}>Position: {eur(verkaufsWerte(zahl(vk.menge), zahl(vk.einzelpreis), zahl(vk.mwst_satz)).brutto)} brutto</div>}
          </div>

          {markttage.length === 0 ? <Leerzustand icon="🧺" titel="Noch keine Verkäufe gebucht" text="Buche Marktverkäufe — sie werden zu Markttagen mit Tageserlös gebündelt." schritte={["Produkt und Menge wählen", "Verkauf buchen", "Markttag-Abrechnung als PDF"]} /> : (
            <div style={{ display: "grid", gap: 12 }}>
              {markttage.map((t) => (
                <div key={`${t.datum}|${t.ort}`} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: "clamp(16px,1.4vw,22px)", fontWeight: 800 }}>{dstr(t.datum)} · {t.ort || "Markt"}</div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ color: C.textDim }}>netto {eur(t.netto)} · MwSt {eur(t.mwst)}</span>
                      <span style={{ fontWeight: 800, color: C.gold, fontSize: "clamp(15px,1.3vw,20px)" }}>{eur(t.brutto)}</span>
                      <button style={btnGhost} onClick={() => pdf(t.datum, t.ort)}>📄 Abrechnung</button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    {t.verkaeufe.map((v) => { const vv = v as Verkauf; return (
                      <div key={vv.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "clamp(13px,1.1vw,17px)", borderTop: `1px solid ${C.border}`, paddingTop: 4 }}>
                        <span>{vv.bezeichnung ?? "—"} · {num(vv.menge)} × {eur(vv.einzelpreis)}</span>
                        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <b style={{ color: C.gold }}>{eur(verkaufsWerte(vv.menge, vv.einzelpreis, vv.mwst_satz).brutto)}</b>
                          <button style={{ background: "none", border: "none", color: C.danger, cursor: "pointer" }} onClick={() => loescheVerkauf(vv.id)}>✕</button>
                        </span>
                      </div>
                    ); })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ernte-Modal */}
      {eModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" }} onClick={() => setEModal(false)}>
          <div style={{ ...card, width: "100%", maxWidth: 560, background: C.navy }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(20px,1.75vw,28px)", fontWeight: 800 }}>{eEdit ? "Ernte bearbeiten" : "Ernte erfassen"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={label}>Kultur *</label><input style={input} value={eForm.kultur} onChange={(e) => setEForm({ ...eForm, kultur: e.target.value })} placeholder="z. B. Kartoffeln" /></div>
              <div><label style={label}>Datum</label><input type="date" style={input} value={eForm.datum} onChange={(e) => setEForm({ ...eForm, datum: e.target.value })} /></div>
              <div><label style={label}>Menge</label><input style={input} value={eForm.menge} onChange={(e) => setEForm({ ...eForm, menge: e.target.value })} inputMode="decimal" /></div>
              <div><label style={label}>Einheit</label><input style={input} value={eForm.einheit} onChange={(e) => setEForm({ ...eForm, einheit: e.target.value })} /></div>
              <div><label style={label}>Qualität / Handelsklasse</label><input style={input} value={eForm.qualitaet} onChange={(e) => setEForm({ ...eForm, qualitaet: e.target.value })} placeholder="z. B. Klasse I" /></div>
              <div><label style={label}>Lagerort</label><input style={input} value={eForm.lagerort} onChange={(e) => setEForm({ ...eForm, lagerort: e.target.value })} /></div>
              <div><label style={label}>Schlag (aus Schlagkartei)</label>
                <select style={input} value={eForm.schlag_id} onChange={(e) => setEForm({ ...eForm, schlag_id: e.target.value })}><option value="">— optional —</option>{schlaege.map((s) => <option key={s.id} value={s.id}>{s.bezeichnung}</option>)}</select>
              </div>
              <div><label style={label}>Status</label><select style={input} value={eForm.status} onChange={(e) => setEForm({ ...eForm, status: e.target.value })}>{ERNTE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Notiz</label><input style={input} value={eForm.notiz} onChange={(e) => setEForm({ ...eForm, notiz: e.target.value })} /></div>
            </div>
            {fehler && <div style={{ marginTop: 12, color: C.danger, fontWeight: 600 }}>{fehler}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button style={btnGhost} onClick={() => setEModal(false)}>Abbrechen</button>
              <button style={{ ...btnGold, opacity: busy ? 0.6 : 1 }} onClick={speichereErnte} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Produkt-Modal */}
      {pModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" }} onClick={() => setPModal(false)}>
          <div style={{ ...card, width: "100%", maxWidth: 560, background: C.navy }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(20px,1.75vw,28px)", fontWeight: 800 }}>{pEdit ? "Produkt bearbeiten" : "Neues Produkt"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Bezeichnung *</label><input style={input} value={pForm.bezeichnung} onChange={(e) => setPForm({ ...pForm, bezeichnung: e.target.value })} placeholder="z. B. Kartoffeln festkochend" /></div>
              <div><label style={label}>Kategorie</label><select style={input} value={pForm.kategorie} onChange={(e) => setPForm({ ...pForm, kategorie: e.target.value })}>{MARKT_KATEGORIEN.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
              <div><label style={label}>Einheit</label><input style={input} value={pForm.einheit} onChange={(e) => setPForm({ ...pForm, einheit: e.target.value })} placeholder="kg / Stück / Bund" /></div>
              <div><label style={label}>Preis (€, inkl. MwSt)</label><input style={input} value={pForm.preis} onChange={(e) => setPForm({ ...pForm, preis: e.target.value })} inputMode="decimal" placeholder="0,00" /></div>
              <div><label style={label}>MwSt-Satz (%)</label><input style={input} value={pForm.mwst_satz} onChange={(e) => setPForm({ ...pForm, mwst_satz: e.target.value })} inputMode="decimal" placeholder="7" /></div>
              <div><label style={label}>Herkunft</label><select style={input} value={pForm.herkunft} onChange={(e) => setPForm({ ...pForm, herkunft: e.target.value })}>{HERKUNFT.map((h) => <option key={h} value={h}>{h === "eigen" ? "eigene Erzeugung" : "zugekauft"}</option>)}</select></div>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="checkbox" checked={pForm.bio} onChange={(e) => setPForm({ ...pForm, bio: e.target.checked })} /> Bio</label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="checkbox" checked={pForm.verfuegbar} onChange={(e) => setPForm({ ...pForm, verfuegbar: e.target.checked })} /> verfügbar</label>
              </div>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Notiz</label><input style={input} value={pForm.notiz} onChange={(e) => setPForm({ ...pForm, notiz: e.target.value })} /></div>
            </div>
            {fehler && <div style={{ marginTop: 12, color: C.danger, fontWeight: 600 }}>{fehler}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button style={btnGhost} onClick={() => setPModal(false)}>Abbrechen</button>
              <button style={{ ...btnGold, opacity: busy ? 0.6 : 1 }} onClick={speichereProdukt} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
