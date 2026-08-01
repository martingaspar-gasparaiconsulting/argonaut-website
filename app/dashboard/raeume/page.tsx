"use client";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import KiAuge from "../_components/KiAuge";
import Leerzustand from "../_components/Leerzustand";
import { augeRaeume } from "@/lib/auge";
import {
  RESSOURCE_TYP,
  BELEGUNG_STATUS,
  dauerStunden,
  konflikte,
  intervallGueltig,
  zaehleRaeume,
  type BelegungLite,
} from "@/lib/raeume";
import { belegungsplanPdf } from "@/lib/belegungsplanPdf";
import { EigeneFelderManager, EigeneFelderInputs, EigeneFelderAnzeige, ladeFelder, ladeWerte, speichereWerte } from "../_components/EigeneFelder";
import type { EigenesFeld } from "@/lib/eigeneFelder";

const MODUL = "raum_ressource";

// ---------------------------------------------------------------------
// ARGONAUT OS · L2-5 · Raum-/Ressourcenbelegung (Bildung/VHS/Coworking)
// Reiter 1: Ressourcen (Räume/Ausstattung, Kapazität). Reiter 2: Belegungsplan
// mit Doppelbuchungs-Schutz (DB btree_gist EXCLUDE + Client-Vorwarnung).
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
const STATUS_FARBE: Record<string, string> = { reserviert: C.warn, bestaetigt: C.green, abgesagt: C.textDim };

interface Ressource { id: string; bezeichnung: string; typ: string; kapazitaet: number | null; standort: string | null; ausstattung: string | null; buchbar: boolean; notiz: string | null; }
interface Belegung { id: string; ressource_id: string; titel: string; von: string; bis: string; verantwortlich: string | null; teilnehmer: number | null; kurs_id: string | null; status: string; notiz: string | null; }

const heuteISO = () => new Date().toISOString();
const heuteTag = () => new Date().toISOString().slice(0, 10);
function zahl(s: string): number | null { return s.trim() === "" ? null : Number(s.replace(",", ".")); }
function tag(iso: string | null): string { return String(iso ?? "").slice(0, 10); }
function dstr(iso: string | null): string { return iso ? new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "—"; }
function zeit(iso: string | null): string { return iso ? new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : ""; }

type RForm = { bezeichnung: string; typ: string; kapazitaet: string; standort: string; ausstattung: string; buchbar: boolean; notiz: string };
const LEER_R: RForm = { bezeichnung: "", typ: "raum", kapazitaet: "", standort: "", ausstattung: "", buchbar: true, notiz: "" };

export default function RaeumeSeite() {
  const [tab, setTab] = useState<"ressourcen" | "plan">("plan");
  const [ressourcen, setRessourcen] = useState<Ressource[]>([]);
  const [belegungen, setBelegungen] = useState<Belegung[]>([]);
  const [kurse, setKurse] = useState<{ id: string; label: string }[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [nurKommend, setNurKommend] = useState(true);
  const [hinweis, setHinweis] = useState<string | null>(null);

  const [rModal, setRModal] = useState(false);
  const [rEdit, setREdit] = useState<string | null>(null);
  const [rForm, setRForm] = useState<RForm>(LEER_R);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [felder, setFelder] = useState<EigenesFeld[]>([]);
  const [nmExtra, setNmExtra] = useState<Record<string, string>>({});
  const [werteMap, setWerteMap] = useState<Record<string, Record<string, string>>>({});

  // Belegungs-Buchung
  const [bEdit, setBEdit] = useState<string | null>(null);
  const [b, setB] = useState({ ressource_id: "", titel: "", datum: heuteTag(), vonZeit: "09:00", bisZeit: "10:30", verantwortlich: "", teilnehmer: "", kurs_id: "", status: "reserviert" });

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
    const [r, bl, ku] = await Promise.all([
      supabase.from("raum_ressource").select("*").order("bezeichnung", { ascending: true }),
      supabase.from("raum_belegung").select("*").order("von", { ascending: true }),
      supabase.from("bildung_kurse").select("*").limit(500),
    ]);
    if (!r.error && r.data) {
      const rows = r.data as Ressource[];
      setRessourcen(rows);
      setFelder(await ladeFelder(MODUL));
      setWerteMap(await ladeWerte(MODUL, rows.map((x) => x.id)));
    }
    if (!bl.error && bl.data) setBelegungen(bl.data as Belegung[]);
    if (!ku.error && ku.data) {
      setKurse((ku.data as Record<string, unknown>[]).map((k) => ({ id: String(k.id), label: String(k.titel ?? k.bezeichnung ?? k.name ?? "Kurs") })));
    }
    setLaden(false);
  }

  const kpi = useMemo(() => zaehleRaeume(ressourcen, belegungen as BelegungLite[], heuteISO()), [ressourcen, belegungen]);
  const ressourceById = useMemo(() => { const m: Record<string, Ressource> = {}; ressourcen.forEach((r) => (m[r.id] = r)); return m; }, [ressourcen]);

  const planBelegungen = useMemo(() => {
    const h = heuteTag();
    const list = belegungen.filter((x) => (nurKommend ? tag(x.von) >= h : true));
    return list;
  }, [belegungen, nurKommend]);

  const planTage = useMemo(() => {
    const map = new Map<string, Belegung[]>();
    for (const x of planBelegungen) { const d = tag(x.von); (map.get(d) ?? map.set(d, []).get(d)!).push(x); }
    return Array.from(map.entries()).sort((a, b2) => a[0].localeCompare(b2[0]));
  }, [planBelegungen]);

  // Live-Konfliktprüfung
  const vonISO = b.datum && b.vonZeit ? `${b.datum}T${b.vonZeit}` : "";
  const bisISO = b.datum && b.bisZeit ? `${b.datum}T${b.bisZeit}` : "";
  const gueltig = intervallGueltig(vonISO, bisISO);
  const konflikteAktuell = useMemo(() => (b.ressource_id && gueltig ? konflikte(vonISO, bisISO, b.ressource_id, belegungen as BelegungLite[], bEdit ?? undefined) : []), [b.ressource_id, vonISO, bisISO, gueltig, belegungen, bEdit]);

  // ---------- Ressourcen ----------
  function openRessource(r?: Ressource) {
    setREdit(r?.id ?? null);
    setRForm(r ? { bezeichnung: r.bezeichnung ?? "", typ: r.typ ?? "raum", kapazitaet: r.kapazitaet != null ? String(r.kapazitaet) : "", standort: r.standort ?? "", ausstattung: r.ausstattung ?? "", buchbar: r.buchbar, notiz: r.notiz ?? "" } : LEER_R);
    setNmExtra(r ? { ...(werteMap[r.id] ?? {}) } : {});
    setFehler(null); setRModal(true);
  }
  async function speichereRessource() {
    if (!rForm.bezeichnung.trim()) { setFehler("Bezeichnung ist Pflicht."); return; }
    setBusy(true); setFehler(null);
    const payload = { bezeichnung: rForm.bezeichnung.trim(), typ: rForm.typ, kapazitaet: zahl(rForm.kapazitaet), standort: rForm.standort.trim() || null, ausstattung: rForm.ausstattung.trim() || null, buchbar: rForm.buchbar, notiz: rForm.notiz.trim() || null };
    let error = null as { message: string } | null;
    let datensatzId: string | null = rEdit;
    if (rEdit) error = (await supabase.from("raum_ressource").update(payload).eq("id", rEdit)).error;
    else {
      const ins = userId ? { ...payload, owner_user_id: userId } : payload;
      const res = await supabase.from("raum_ressource").insert(ins).select("id").single();
      error = res.error;
      if (res.data) datensatzId = (res.data as { id: string }).id;
    }
    setBusy(false);
    if (error) { setFehler("Speichern fehlgeschlagen: " + error.message); return; }
    try { await speichereWerte(MODUL, datensatzId, userId, nmExtra); } catch { /* eigene Felder optional */ }
    setNmExtra({});
    setRModal(false); await ladeAlles();
  }
  async function loescheRessource(r: Ressource) {
    if (!window.confirm(`Ressource „${r.bezeichnung}" samt Belegungen löschen?`)) return;
    const { error } = await supabase.from("raum_ressource").delete().eq("id", r.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }

  // ---------- Belegung ----------
  function resetBuchung() { setBEdit(null); setB({ ressource_id: b.ressource_id, titel: "", datum: b.datum, vonZeit: "09:00", bisZeit: "10:30", verantwortlich: "", teilnehmer: "", kurs_id: "", status: "reserviert" }); }
  function editBelegung(x: Belegung) {
    setBEdit(x.id);
    setB({ ressource_id: x.ressource_id, titel: x.titel ?? "", datum: tag(x.von), vonZeit: zeit(x.von), bisZeit: zeit(x.bis), verantwortlich: x.verantwortlich ?? "", teilnehmer: x.teilnehmer != null ? String(x.teilnehmer) : "", kurs_id: x.kurs_id ?? "", status: x.status ?? "reserviert" });
    setTab("plan"); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function speichereBelegung() {
    if (!b.ressource_id) { setHinweis("Bitte eine Ressource wählen."); return; }
    if (!b.titel.trim()) { setHinweis("Bitte einen Titel angeben."); return; }
    if (!gueltig) { setHinweis("Endzeit muss nach der Startzeit liegen."); return; }
    if (konflikteAktuell.length > 0) { setHinweis("Diese Ressource ist im Zeitraum bereits belegt — bitte anderen Slot wählen."); return; }
    setBusy(true);
    const payload = { ressource_id: b.ressource_id, titel: b.titel.trim(), von: vonISO, bis: bisISO, verantwortlich: b.verantwortlich.trim() || null, teilnehmer: zahl(b.teilnehmer), kurs_id: b.kurs_id || null, status: b.status, notiz: null };
    let error = null as { message: string } | null;
    if (bEdit) error = (await supabase.from("raum_belegung").update(payload).eq("id", bEdit)).error;
    else { const ins = userId ? { ...payload, owner_user_id: userId } : payload; error = (await supabase.from("raum_belegung").insert(ins)).error; }
    setBusy(false);
    if (error) {
      const doppelt = /23P01|exclusion|overlap|conflicting/i.test(error.message);
      setHinweis(doppelt ? "Doppelbuchung verhindert — die Ressource ist in diesem Zeitraum schon belegt." : "Speichern fehlgeschlagen: " + error.message);
      return;
    }
    resetBuchung(); await ladeAlles();
  }
  async function belegungStatus(x: Belegung, status: string) {
    const { error } = await supabase.from("raum_belegung").update({ status }).eq("id", x.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }
  async function loescheBelegung(x: Belegung) {
    if (!window.confirm("Belegung löschen?")) return;
    const { error } = await supabase.from("raum_belegung").delete().eq("id", x.id);
    if (error) { window.alert("Fehler: " + error.message); return; }
    await ladeAlles();
  }

  async function pdf() {
    const { data: userData } = await supabase.auth.getUser();
    const meta = userData.user?.user_metadata ?? {};
    const aussteller = meta.firma || meta.firmenname || meta.name || "ARGONAUT OS";
    belegungsplanPdf({
      aussteller: String(aussteller), titel: "Belegungsplan", datum: new Date().toLocaleDateString("de-DE"),
      tage: planTage.map(([d, xs]) => ({
        datum: dstr(d + "T00:00"),
        posten: xs.filter((x) => x.status !== "abgesagt").sort((a, c) => a.von.localeCompare(c.von)).map((x) => ({
          zeit: `${zeit(x.von)}–${zeit(x.bis)}`, ressource: ressourceById[x.ressource_id]?.bezeichnung ?? "—",
          titel: x.titel, verantwortlich: x.verantwortlich ?? "", status: x.status,
        })),
      })).filter((t) => t.posten.length > 0),
    });
  }

  async function importiereRessourcen(text: string) {
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
        bezeichnung: val("bezeichnung"), typ: val("typ") || "raum", kapazitaet: zahl(val("kapazitaet")),
        standort: val("standort") || null, ausstattung: val("ausstattung") || null,
        buchbar: val("buchbar").toLowerCase() !== "nein" && val("buchbar") !== "0",
      };
      rows.push(userId ? { ...base, owner_user_id: userId } : base);
    }
    if (rows.length === 0) { setHinweis("Keine gültigen Zeilen gefunden."); return; }
    const { error } = await supabase.from("raum_ressource").insert(rows);
    if (error) { window.alert("Import fehlgeschlagen: " + error.message); return; }
    setHinweis(`${rows.length} Ressource(n) importiert.`); await ladeAlles();
  }
  function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => importiereRessourcen(String(r.result || "")); r.readAsText(f, "utf-8"); e.target.value = "";
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
        <h1 style={{ margin: 0, fontSize: "clamp(26px,2.25vw,36px)", fontWeight: 800 }}>🏫 Räume & Ressourcen</h1>
        <p style={{ margin: "4px 0 0", color: C.textDim, fontSize: "clamp(14px,1.25vw,20px)" }}>Räume und Ausstattung buchen — mit Doppelbuchungs-Schutz und Kurs-Andockung</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={kachel}><div style={kLabel}>Ressourcen</div><div style={kWert}>{kpi.ressourcen}</div></div>
        <div style={kachel}><div style={kLabel}>Buchbar</div><div style={kWert}>{kpi.buchbar}</div></div>
        <div style={kachel}><div style={kLabel}>Belegt heute</div><div style={{ ...kWert, color: kpi.belegungenHeute > 0 ? C.cyan : C.green }}>{kpi.belegungenHeute}</div></div>
        <div style={kachel}><div style={kLabel}>Kommend</div><div style={kWert}>{kpi.belegungenKommend}</div></div>
        <div style={kachel}><div style={kLabel}>Std. kommend</div><div style={{ ...kWert, color: C.gold }}>{kpi.belegungStundenKommend}</div></div>
      </div>

      <KiAuge modul="Räume & Ressourcen" regel={augeRaeume({ belegungenHeute: kpi.belegungenHeute, belegungenKommend: kpi.belegungenKommend, ressourcen: kpi.ressourcen, gesamt: kpi.gesamt })} />

      {hinweis && <div style={{ ...card, marginTop: 14, borderColor: "rgba(0,229,255,0.35)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><span style={{ color: C.cyan }}>{hinweis}</span><button style={btnGhost} onClick={() => setHinweis(null)}>OK</button></div>}

      <div style={{ display: "flex", gap: 8, margin: "16px 0 14px", flexWrap: "wrap" }}>
        <button style={tab === "plan" ? btnGold : btnGhost} onClick={() => setTab("plan")}>🗓 Belegungsplan</button>
        <button style={tab === "ressourcen" ? btnGold : btnGhost} onClick={() => setTab("ressourcen")}>🏫 Ressourcen</button>
      </div>

      {laden ? (
        <div style={{ ...card, color: C.textDim }}>Lade…</div>
      ) : tab === "ressourcen" ? (
        <div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 12, flexWrap: "wrap" }}>
            <label style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6 }}>⤓ CSV importieren<input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onCsv} /></label>
            <button style={btnGold} onClick={() => openRessource()}>+ Ressource</button>
          </div>
          {userId && <EigeneFelderManager modul={MODUL} ownerId={userId} onChange={ladeAlles} />}
          {ressourcen.length === 0 ? <Leerzustand icon="🏫" titel="Noch keine Ressourcen" text="Lege Räume und Ausstattung an, die belegt werden können." schritte={["Ressource oben anlegen", "Typ und Kapazität erfassen", "Im Belegungsplan buchen"]} /> : (
            <div style={{ display: "grid", gap: 8 }}>
              {ressourcen.map((r) => (
                <div key={r.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <span style={{ fontSize: "clamp(15px,1.3vw,20px)", fontWeight: 700 }}>{r.bezeichnung}</span>
                    <span style={{ marginLeft: 8, ...pill(C.textDim) }}>{r.typ}</span>
                    {r.kapazitaet != null && <span style={{ marginLeft: 6, ...pill(C.cyan) }}>{r.kapazitaet} Plätze</span>}
                    {!r.buchbar && <span style={{ marginLeft: 6, ...pill(C.warn) }}>nicht buchbar</span>}
                    <div style={{ color: C.textDim, fontSize: "clamp(12px,1.05vw,16px)", marginTop: 4 }}>
                      {[r.standort, r.ausstattung].filter(Boolean).join(" · ") || "—"}
                    </div>
                    <EigeneFelderAnzeige felder={felder} werte={werteMap[r.id]} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={btnGhost} onClick={() => openRessource(r)}>Bearbeiten</button>
                    <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loescheRessource(r)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // ============ BELEGUNGSPLAN ============
        <div>
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>{bEdit ? "Belegung bearbeiten" : "Belegung buchen"}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 160 }}><label style={label}>Ressource</label>
                <select style={input} value={b.ressource_id} onChange={(e) => setB({ ...b, ressource_id: e.target.value })}>
                  <option value="">— wählen —</option>
                  {ressourcen.filter((r) => r.buchbar).map((r) => <option key={r.id} value={r.id}>{r.bezeichnung}{r.kapazitaet != null ? ` (${r.kapazitaet} Pl.)` : ""}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}><label style={label}>Titel</label><input style={input} value={b.titel} onChange={(e) => setB({ ...b, titel: e.target.value })} placeholder="z. B. Excel-Kurs Modul 2" /></div>
              <div><label style={label}>Datum</label><input type="date" style={input} value={b.datum} onChange={(e) => setB({ ...b, datum: e.target.value })} /></div>
              <div style={{ width: 100 }}><label style={label}>Von</label><input type="time" style={input} value={b.vonZeit} onChange={(e) => setB({ ...b, vonZeit: e.target.value })} /></div>
              <div style={{ width: 100 }}><label style={label}>Bis</label><input type="time" style={input} value={b.bisZeit} onChange={(e) => setB({ ...b, bisZeit: e.target.value })} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
              <div style={{ minWidth: 150 }}><label style={label}>Verantwortlich</label><input style={input} value={b.verantwortlich} onChange={(e) => setB({ ...b, verantwortlich: e.target.value })} /></div>
              <div style={{ width: 110 }}><label style={label}>Teilnehmer</label><input style={input} value={b.teilnehmer} onChange={(e) => setB({ ...b, teilnehmer: e.target.value })} inputMode="numeric" /></div>
              {kurse.length > 0 && <div style={{ minWidth: 160 }}><label style={label}>Kurs (optional)</label><select style={input} value={b.kurs_id} onChange={(e) => setB({ ...b, kurs_id: e.target.value })}><option value="">—</option>{kurse.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></div>}
              <div><label style={label}>Status</label><select style={input} value={b.status} onChange={(e) => setB({ ...b, status: e.target.value })}>{BELEGUNG_STATUS.filter((s) => s !== "abgesagt").map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
              <button style={{ ...btnGold, opacity: busy ? 0.6 : 1 }} onClick={speichereBelegung} disabled={busy}>{bEdit ? "Speichern" : "+ Buchen"}</button>
              {bEdit && <button style={btnGhost} onClick={resetBuchung}>Abbrechen</button>}
            </div>
            {b.ressource_id && gueltig && (
              konflikteAktuell.length > 0
                ? <div style={{ marginTop: 10, color: C.danger, fontWeight: 700 }}>⛔ Konflikt: {ressourceById[b.ressource_id]?.bezeichnung} ist {zeit(konflikteAktuell[0].von ?? "")}–{zeit(konflikteAktuell[0].bis ?? "")} bereits belegt.</div>
                : <div style={{ marginTop: 10, color: C.green }}>✓ Slot frei · {dauerStunden(vonISO, bisISO)} Std.</div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: C.textDim, cursor: "pointer" }}>
              <input type="checkbox" checked={nurKommend} onChange={(e) => setNurKommend(e.target.checked)} /> nur ab heute
            </label>
            <button style={btnGhost} onClick={pdf}>📄 Belegungsplan</button>
          </div>

          {planTage.length === 0 ? <div style={{ ...card, color: C.textDim }}>Keine Belegungen{nurKommend ? " ab heute" : ""}.</div> : (
            <div style={{ display: "grid", gap: 12 }}>
              {planTage.map(([d, xs]) => (
                <div key={d} style={card}>
                  <div style={{ fontSize: "clamp(15px,1.3vw,20px)", fontWeight: 800, color: C.gold, marginBottom: 8 }}>{dstr(d + "T00:00")}</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {xs.slice().sort((a, c) => a.von.localeCompare(c.von)).map((x) => (
                      <div key={x.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 6, opacity: x.status === "abgesagt" ? 0.5 : 1 }}>
                        <div>
                          <b>{zeit(x.von)}–{zeit(x.bis)}</b> · {ressourceById[x.ressource_id]?.bezeichnung ?? "—"} · {x.titel}
                          <span style={{ marginLeft: 8, ...pill(STATUS_FARBE[x.status] ?? C.textDim) }}>{x.status}</span>
                          <span style={{ color: C.textDim, marginLeft: 8, fontSize: "clamp(12px,1vw,15px)" }}>{x.verantwortlich ?? ""}{x.teilnehmer != null ? ` · ${x.teilnehmer} TN` : ""}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {x.status === "reserviert" && <button style={btnGhost} onClick={() => belegungStatus(x, "bestaetigt")}>✓ bestätigen</button>}
                          {x.status !== "abgesagt" ? <button style={btnGhost} onClick={() => belegungStatus(x, "abgesagt")}>absagen</button> : <button style={btnGhost} onClick={() => belegungStatus(x, "reserviert")}>reaktivieren</button>}
                          <button style={btnGhost} onClick={() => editBelegung(x)}>Bearbeiten</button>
                          <button style={{ ...btnGhost, color: C.danger, borderColor: "rgba(224,102,102,0.4)" }} onClick={() => loescheBelegung(x)}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ressource-Modal */}
      {rModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" }} onClick={() => setRModal(false)}>
          <div style={{ ...card, width: "100%", maxWidth: 540, background: C.navy }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(20px,1.75vw,28px)", fontWeight: 800 }}>{rEdit ? "Ressource bearbeiten" : "Neue Ressource"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Bezeichnung *</label><input style={input} value={rForm.bezeichnung} onChange={(e) => setRForm({ ...rForm, bezeichnung: e.target.value })} placeholder="z. B. Seminarraum A" /></div>
              <div><label style={label}>Typ</label><select style={input} value={rForm.typ} onChange={(e) => setRForm({ ...rForm, typ: e.target.value })}>{RESSOURCE_TYP.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label style={label}>Kapazität (Plätze)</label><input style={input} value={rForm.kapazitaet} onChange={(e) => setRForm({ ...rForm, kapazitaet: e.target.value })} inputMode="numeric" /></div>
              <div><label style={label}>Standort</label><input style={input} value={rForm.standort} onChange={(e) => setRForm({ ...rForm, standort: e.target.value })} placeholder="z. B. 1. OG" /></div>
              <div><label style={label}>Ausstattung</label><input style={input} value={rForm.ausstattung} onChange={(e) => setRForm({ ...rForm, ausstattung: e.target.value })} placeholder="Beamer, Whiteboard…" /></div>
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}><label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={rForm.buchbar} onChange={(e) => setRForm({ ...rForm, buchbar: e.target.checked })} /> buchbar</label></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={label}>Notiz</label><input style={input} value={rForm.notiz} onChange={(e) => setRForm({ ...rForm, notiz: e.target.value })} /></div>
              <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <EigeneFelderInputs felder={felder} werte={nmExtra} setWert={(fid, w) => setNmExtra((s) => ({ ...s, [fid]: w }))} inpStyle={input} labStyle={label} />
              </div>
            </div>
            {fehler && <div style={{ marginTop: 12, color: C.danger, fontWeight: 600 }}>{fehler}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button style={btnGhost} onClick={() => setRModal(false)}>Abbrechen</button>
              <button style={{ ...btnGold, opacity: busy ? 0.6 : 1 }} onClick={speichereRessource} disabled={busy}>{busy ? "Speichere…" : "Speichern"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
