"use client";

// ============================================================
// ARGONAUT OS · Modul Termine · Anlege-Cockpit
// Termine anlegen, sehen, löschen. Einfach zeigt nur Wer/Wann/Titel,
// Voll ergänzt Ende, Ort, Erinnerung, Ressource, Notiz.
// Route: /dashboard/termine   ·   Tabelle: termine
// ============================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { leseStandortCookie } from "@/lib/aktiverStandort";
import { konkreterStandort, standortOrFilter } from "@/lib/standortDaten";
import { NurVoll } from "../_components/Ansicht";
import Leerzustand from "../_components/Leerzustand";
import KiAuge from "../_components/KiAuge";
import { augeTermine } from "@/lib/auge";
import { zaehleTermine } from "@/lib/augeZaehler";
import { vorbelegungLesen } from "@/lib/leadWeiter";
import { showRate, markierbar, einstellungLesen, rueckholTageBereinigen, type ShowEinstellung } from "@/lib/showUp";
import { leseZahl } from "@/lib/zahlen";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const C = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  green: "#4CAF7D",
  danger: "#E06666",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

type Termin = {
  id: string;
  titel: string | null;
  beginn_am: string | null;
  ende_am: string | null;
  ort: string | null;
  status: string | null;
  kunde_email: string | null;
  notiz: string | null;
  erinnerung_min: number | null;
  ressource: string | null;
  kontakt_id: string | null;
  // Paket VK3: zuständige Person (mitarbeiter.id)
  mitarbeiter_id: string | null;
};

// Paket VK3: Mitarbeiter für Anzeige, Filter „Kalender je Person" und Übertragen
type Ma = { id: string; name: string };
type Uebertragen = { ma: Ma[]; grund: Record<string, string>; aufUebertragen: (t: Termin, anId: string) => Promise<void> };
// Paket VK5: erschienen / nicht erschienen (Spalten aus SQL p411 — eigene Abfrage)
type Erscheinen = { wert: Record<string, boolean | null>; aufMarkieren: (t: Termin, w: boolean | null) => Promise<void> };

const ERINNERUNGEN: { wert: string; label: string }[] = [
  { wert: "", label: "Keine Erinnerung" },
  { wert: "10", label: "10 Minuten vorher" },
  { wert: "30", label: "30 Minuten vorher" },
  { wert: "60", label: "1 Stunde vorher" },
  { wert: "1440", label: "1 Tag vorher" },
];

function fmtDatum(iso: string | null): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function fmtZeit(iso: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function jetztLokalInput(): string {
  // liefert "YYYY-MM-DDTHH:mm" für <input type="datetime-local">, auf die nächste volle Stunde
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function TermineCockpit() {
  const [uid, setUid] = useState<string | null>(null);
  const [termine, setTermine] = useState<Termin[]>([]);
  const [loading, setLoading] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [modalOffen, setModalOffen] = useState(false);
  const [speichern, setSpeichern] = useState(false);

  const [titel, setTitel] = useState("");
  const [beginn, setBeginn] = useState(jetztLokalInput());
  const [wer, setWer] = useState("");
  // Kunde aus dem CRM: haengt den Termin fest an den Kontakt.
  const [kontaktId, setKontaktId] = useState("");
  const [kontakte, setKontakte] = useState<{ id: string; anzeigename: string | null; email: string | null }[]>([]);
  const [ende, setEnde] = useState("");
  const [ort, setOrt] = useState("");
  const [erinnerung, setErinnerung] = useState("");
  const [ressource, setRessource] = useState("");
  const [notiz, setNotiz] = useState("");

  const laden = useCallback(async () => {
    setLoading(true);
    setFehler(null);
    try {
      const sid = konkreterStandort(leseStandortCookie());
      let q = supabase
        .from("termine")
        .select(
          "id, titel, beginn_am, ende_am, ort, status, kunde_email, notiz, erinnerung_min, ressource, kontakt_id, mitarbeiter_id"
        );
      if (sid) q = q.or(standortOrFilter(sid));
      const { data, error } = await q.order("beginn_am", { ascending: true });
      if (error) throw error;
      setTermine((data as unknown as Termin[]) ?? []);
    } catch (e: unknown) {
      setFehler("Termine laden fehlgeschlagen: " + (e instanceof Error ? e.message : "Fehler"));
      setTermine([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Kunden-Namen fuer die Terminkarten. Bewusst aus der ohnehin geladenen
  // CRM-Liste aufgeloest und NICHT als Join in der Termin-Abfrage: ein
  // Problem am Kontakt wuerde sonst die komplette Terminliste leer machen.
  // Paket VK3: Mitarbeiter-Namen, Grund der Zuteilung (Spalte aus SQL p409 — eigene Abfrage,
  // damit die Terminliste ohne die Spalte nie leer bleibt) und Filter je Person.
  const [mitarbeiter, setMitarbeiter] = useState<Ma[]>([]);
  const [grunde, setGrunde] = useState<Record<string, string>>({});
  const [werFilter, setWerFilter] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const { data: m } = await supabase.from("mitarbeiter").select("id, vorname, nachname, status").limit(2000);
        setMitarbeiter(((m as { id: string; vorname: string | null; nachname: string | null; status: string | null }[] | null) ?? [])
          .filter((x) => !["ausgeschieden", "inaktiv", "gekuendigt", "gekündigt"].includes(String(x.status ?? "").toLowerCase()))
          .map((x) => ({ id: x.id, name: [x.vorname, x.nachname].filter(Boolean).join(" ") || "Mitarbeiter" }))
          .sort((a, b) => a.name.localeCompare(b.name, "de")));
      } catch { /* Anzeige ist Zugabe */ }
      try {
        const { data: g, error } = await supabase.from("termine").select("id, verteilt_grund").not("verteilt_grund", "is", null).limit(2000);
        if (!error) setGrunde(Object.fromEntries(((g as { id: string; verteilt_grund: string }[] | null) ?? []).map((x) => [x.id, x.verteilt_grund])));
      } catch { /* Spalte fehlt noch */ }
      try {
        const { data: e, error } = await supabase.from("termine").select("id, erschienen").not("erschienen", "is", null).limit(5000);
        if (!error) {
          setErschienen(Object.fromEntries(((e as { id: string; erschienen: boolean }[] | null) ?? []).map((x) => [x.id, x.erschienen])));
          setShowUpDa(true);
        }
      } catch { /* Spalte fehlt noch (SQL p411) */ }
    })();
  }, [termine]);

  // Paket VK5: Show-up markieren
  const [erschienen, setErschienen] = useState<Record<string, boolean | null>>({});
  const [showUpDa, setShowUpDa] = useState(false);
  async function markieren(t: Termin, w: boolean | null) {
    setFehler(null); setOk(null);
    const res = await fetch("/api/termin-erschienen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ termin_id: t.id, erschienen: w }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setFehler(d?.error || "Markieren fehlgeschlagen."); return; }
    setErschienen((alt) => ({ ...alt, [t.id]: w }));
    setOk(w === true ? (d?.lead ? "Als erschienen markiert — Lead auf „Termin gehalten“ gesetzt." : "Als erschienen markiert.") : w === false ? "Als nicht erschienen markiert." : "Markierung entfernt.");
  }
  const erscheinen: Erscheinen = { wert: erschienen, aufMarkieren: markieren };
  const rate = useMemo(() => showRate(termine.map((t) => ({ ...t, erschienen: erschienen[t.id] ?? null })), new Date(), 90), [termine, erschienen]);

  async function uebertragen(t: Termin, anId: string) {
    setFehler(null); setOk(null);
    const res = await fetch("/api/termin-uebertragen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ termin_id: t.id, an_mitarbeiter_id: anId }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setFehler(d?.error || "Übertragen fehlgeschlagen."); return; }
    setOk(`Termin an ${d?.name || "Kollegen"} übertragen.`);
    await laden();
  }
  const uebertragung: Uebertragen = { ma: mitarbeiter, grund: grunde, aufUebertragen: uebertragen };

  const kundenNamen = useMemo(() => {
    const m: Record<string, string> = {};
    for (const k of kontakte) m[k.id] = k.anzeigename || k.email || "Kunde im CRM";
    return m;
  }, [kontakte]);

  // HW-12: Aufmass-Termin vom Lead (?neu=1&titel=…&kontakt=…&email=…&notiz=…) — Formular oeffnet vorbelegt
  useEffect(() => {
    try {
      const v = vorbelegungLesen(window.location.search);
      if (!v) return;
      if (v.titel) setTitel(v.titel);
      if (v.email) setWer(v.email);
      if (v.kontakt) setKontaktId(v.kontakt);
      if (v.ort) setOrt(v.ort);
      if (v.notiz) setNotiz(v.notiz);
      setModalOffen(true);
    } catch { /* Vorbelegung ist Zugabe */ }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUid(data?.user?.id ?? null);
      await laden();
      // Kontakte nachladen — faellt das aus, bleibt der Termin trotzdem
      // anlegbar, nur ohne Kunden-Auswahl.
      try {
        const { data: k } = await supabase
          .from("kontakte")
          .select("id, anzeigename, email")
          .order("anzeigename", { ascending: true })
          .limit(500);
        setKontakte((k as { id: string; anzeigename: string | null; email: string | null }[]) ?? []);
      } catch { /* Auswahl ist optional */ }
    })();
  }, [laden]);

  function reset() {
    setTitel("");
    setBeginn(jetztLokalInput());
    setWer("");
    setKontaktId("");
    setEnde("");
    setOrt("");
    setErinnerung("");
    setRessource("");
    setNotiz("");
  }

  async function anlegen() {
    if (!titel.trim() || !beginn) return;
    setSpeichern(true);
    setFehler(null);
    setOk(null);
    try {
      // 165: Besitzer setzt die Datenbank (termine_set_owner: Betrieb, beim
      // Mitarbeiter die Kennung des Chefs) — vorher gehoerte der Termin dem Mitarbeiter.
      // Ende ist live Pflicht (ende_am NOT NULL, > Beginn): ohne Angabe 1 Stunde.
      const beginnD = new Date(beginn);
      const endeD = ende ? new Date(ende) : new Date(beginnD.getTime() + 60 * 60 * 1000);
      const payload = {
        titel: titel.trim(),
        beginn_am: beginnD.toISOString(),
        ende_am: (endeD > beginnD ? endeD : new Date(beginnD.getTime() + 60 * 60 * 1000)).toISOString(),
        ort: ort.trim() || null,
        status: "geplant",
        kunde_email: wer.trim() || null,
        // Am Kunden festmachen, wenn einer gewaehlt wurde — dann findet ihn
        // die Kunden-Akte auch, wenn er spaeter von einer anderen Adresse
        // schreibt.
        kontakt_id: kontaktId || null,
        notiz: notiz.trim() || null,
        erinnerung_min: erinnerung ? Number(erinnerung) : null,
        ressource: ressource.trim() || null,
        standort_id: konkreterStandort(leseStandortCookie()),
      };
      const { error } = await supabase.from("termine").insert(payload);
      if (error) throw error;
      setOk("Termin angelegt.");
      setModalOffen(false);
      reset();
      await laden();
    } catch (e: unknown) {
      setFehler("Termin anlegen: " + (e instanceof Error ? e.message : "Fehler"));
    } finally {
      setSpeichern(false);
    }
  }

  async function loeschen(t: Termin) {
    if (typeof window !== "undefined" && !window.confirm(`Termin „${t.titel || "ohne Titel"}" löschen?`)) return;
    try {
      const { error } = await supabase.from("termine").delete().eq("id", t.id);
      if (error) throw error;
      setTermine((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e: unknown) {
      setFehler("Löschen fehlgeschlagen: " + (e instanceof Error ? e.message : "Fehler"));
    }
  }

  // Punkt 6.5 — Wachendes Auge: zaehlt aus der schon geladenen Liste, laedt nichts nach.
  const augeZahlen = useMemo(() => zaehleTermine(termine, new Date()), [termine]);

  const { kommend, vergangen } = useMemo(() => {
    const now = Date.now();
    const kommend: Termin[] = [];
    const vergangen: Termin[] = [];
    for (const t of termine) {
      if (werFilter === "ohne" ? !!t.mitarbeiter_id : werFilter && t.mitarbeiter_id !== werFilter) continue;
      const ts = t.beginn_am ? new Date(t.beginn_am).getTime() : 0;
      if (ts >= now) kommend.push(t);
      else vergangen.push(t);
    }
    vergangen.reverse(); // jüngste vergangene zuerst
    return { kommend, vergangen };
  }, [termine, werFilter]);

  const kpi = useMemo(() => {
    const now = new Date();
    const heuteStr = now.toDateString();
    const in7 = now.getTime() + 7 * 24 * 3600 * 1000;
    let heute = 0;
    let woche = 0;
    for (const t of kommend) {
      if (!t.beginn_am) continue;
      const dt = new Date(t.beginn_am);
      if (dt.toDateString() === heuteStr) heute++;
      if (dt.getTime() <= in7) woche++;
    }
    return { heute, woche, kommend: kommend.length };
  }, [kommend]);

  return (
    <div style={{ color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-dm-sans), sans-serif",
              fontSize: "clamp(30px, 2.63vw, 42px)",
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.5px",
            }}
          >
            🗓 Termine
          </h1>
          <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: "clamp(14px, 1.25vw, 20px)" }}>
            Termine anlegen und im Blick behalten — Kundenbesuche, Anrufe, Einsätze.
          </p>
        </div>
        <button
          onClick={() => {
            reset();
            setModalOffen(true);
          }}
          style={{
            background: C.gold,
            color: C.navy,
            border: "none",
            borderRadius: 10,
            padding: "12px 20px",
            fontSize: "clamp(15px, 1.31vw, 21px)",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          + Neuer Termin
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <KpiKarte label="Heute" wert={String(kpi.heute)} hint="Termine heute" farbe={C.cyan} />
        <KpiKarte label="Diese Woche" wert={String(kpi.woche)} hint="in den nächsten 7 Tagen" farbe={C.green} />
        <KpiKarte label="Kommende" wert={String(kpi.kommend)} hint="alle bevorstehenden" farbe={C.gold} />
        {showUpDa && (
          <KpiKarte label="Show-Rate (90 Tage)" wert={rate.quote === null ? "—" : `${rate.quote} %`}
            hint={`${rate.erschienen} erschienen · ${rate.nicht} nicht · ${rate.offen} offen`} farbe={rate.quote !== null && rate.quote < 80 ? C.danger : C.green} />
        )}
      </div>

      {!loading && (
        <div style={{ marginBottom: 18 }}>
          <KiAuge modul="Termine" regel={augeTermine(augeZahlen)} />
        </div>
      )}

      {fehler && (
        <div
          style={{
            background: "rgba(224,102,102,0.12)",
            border: `1px solid ${C.danger}`,
            borderRadius: 10,
            padding: "12px 16px",
            color: C.danger,
            marginBottom: 18,
            fontSize: "clamp(14px, 1.25vw, 20px)",
          }}
        >
          ⚠️ {fehler}
        </div>
      )}
      {ok && (
        <div
          style={{
            background: "rgba(76,175,125,0.12)",
            border: `1px solid ${C.green}`,
            borderRadius: 10,
            padding: "12px 16px",
            color: C.green,
            marginBottom: 18,
            fontSize: "clamp(14px, 1.25vw, 20px)",
          }}
        >
          ✅ {ok}
        </div>
      )}

      {showUpDa && <ShowUpEinstellung />}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: C.textDim }}>ARGONAUT lädt die Termine…</div>
      ) : termine.length === 0 ? (
        <Leerzustand
          icon="🗓"
          titel="Noch keine Termine"
          text="Hier laufen alle Termine zusammen — selbst angelegte, aus Aufträgen entstandene und online gebuchte."
          schritte={["Oben rechts einen Termin anlegen", "Kunde und Uhrzeit eintragen", "Termin im Schichtplan wiederfinden"]}
        />
      ) : (
        <>
          {mitarbeiter.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
              <span style={{ color: C.textDim, fontSize: 14 }}>Kalender von</span>
              <select value={werFilter} onChange={(e) => setWerFilter(e.target.value)}
                style={{ background: C.navy2, color: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 10px", fontFamily: "inherit", fontSize: 14 }}>
                <option value="">allen</option>
                <option value="ohne">— ohne Zuständigen —</option>
                {mitarbeiter.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <TerminListe titel="Kommende Termine" liste={kommend} onDelete={loeschen} leer="Keine bevorstehenden Termine." kunden={kundenNamen} uebertragung={uebertragung} />
          {vergangen.length > 0 && (
            <TerminListe titel="Vergangen" liste={vergangen} onDelete={loeschen} leer="" gedimmt kunden={kundenNamen} erscheinen={showUpDa ? erscheinen : undefined} />
          )}
        </>
      )}

      {/* Modal: Neuer Termin */}
      {modalOffen && (
        <div
          onClick={() => setModalOffen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 480,
              maxHeight: "88vh",
              overflowY: "auto",
            }}
          >
            <h2 style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: "clamp(20px, 1.75vw, 28px)", fontWeight: 700, margin: "0 0 4px" }}>
              Neuer Termin
            </h2>
            <p style={{ color: C.textDim, fontSize: "clamp(13px, 1.13vw, 18px)", margin: "0 0 20px" }}>
              Titel und Zeit reichen — den Rest finden Sie im Voll-Modus.
            </p>

            <label style={labelStyle}>Titel *</label>
            <input
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="z. B. Besichtigung Baustelle Müller"
              autoFocus
              style={inputStyle}
            />

            <label style={labelStyle}>Beginn *</label>
            <input type="datetime-local" value={beginn} onChange={(e) => setBeginn(e.target.value)} style={inputStyle} />

            {kontakte.length > 0 && (
              <>
                <label style={labelStyle}>Kunde aus dem CRM (optional)</label>
                <select
                  value={kontaktId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setKontaktId(id);
                    const k = kontakte.find((x) => x.id === id);
                    if (k?.email) setWer(k.email);
                  }}
                  style={inputStyle}
                >
                  <option value="">— kein Kunde ausgewählt —</option>
                  {kontakte.map((k) => (
                    <option key={k.id} value={k.id}>
                      {(k.anzeigename || k.email || 'Ohne Namen') + (k.anzeigename && k.email ? ` · ${k.email}` : '')}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label style={labelStyle}>Mit wem (Kunden-E-Mail, optional)</label>
            <input
              value={wer}
              onChange={(e) => setWer(e.target.value)}
              placeholder="kunde@firma.de"
              inputMode="email"
              style={inputStyle}
            />

            <NurVoll>
              <label style={labelStyle}>Ende</label>
              <input type="datetime-local" value={ende} onChange={(e) => setEnde(e.target.value)} style={inputStyle} />

              <label style={labelStyle}>Ort</label>
              <input value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="z. B. Baustelle Nord / per Telefon" style={inputStyle} />

              <label style={labelStyle}>Erinnerung</label>
              <select value={erinnerung} onChange={(e) => setErinnerung(e.target.value)} style={inputStyle}>
                {ERINNERUNGEN.map((e2) => (
                  <option key={e2.wert} value={e2.wert} style={{ background: C.navy2 }}>
                    {e2.label}
                  </option>
                ))}
              </select>

              <label style={labelStyle}>Ressource (Mitarbeiter/Fahrzeug)</label>
              <input value={ressource} onChange={(e) => setRessource(e.target.value)} placeholder="z. B. Team A / Transporter" style={inputStyle} />

              <label style={labelStyle}>Notiz</label>
              <input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Interne Notiz" style={inputStyle} />
            </NurVoll>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
              <button
                onClick={() => setModalOffen(false)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textDim,
                  borderRadius: 10,
                  padding: "11px 18px",
                  fontSize: "clamp(14px, 1.25vw, 20px)",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={anlegen}
                disabled={!titel.trim() || !beginn || speichern}
                style={{
                  background: !titel.trim() || !beginn || speichern ? C.border : C.gold,
                  color: !titel.trim() || !beginn || speichern ? C.textDim : C.navy,
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 20px",
                  fontSize: "clamp(14px, 1.25vw, 20px)",
                  fontWeight: 700,
                  cursor: !titel.trim() || !beginn || speichern ? "not-allowed" : "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {speichern ? "Speichert…" : "Termin anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TerminListe({
  titel,
  liste,
  onDelete,
  leer,
  gedimmt,
  kunden,
  uebertragung,
  erscheinen,
}: {
  titel: string;
  liste: Termin[];
  onDelete: (t: Termin) => void;
  leer: string;
  gedimmt?: boolean;
  kunden: Record<string, string>;
  uebertragung?: Uebertragen;
  erscheinen?: Erscheinen;
}) {
  const [offenId, setOffenId] = useState<string | null>(null);
  const [ziel, setZiel] = useState("");
  const maName = (id: string | null) => (id ? uebertragung?.ma.find((m) => m.id === id)?.name ?? null : null);
  return (
    <div style={{ marginBottom: 22, opacity: gedimmt ? 0.7 : 1 }}>
      <div
        style={{
          color: C.textDim,
          fontSize: "clamp(12px, 1.06vw, 17px)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          margin: "0 2px 10px",
        }}
      >
        {titel}
      </div>
      {liste.length === 0 ? (
        leer ? <p style={{ color: C.textDim, fontSize: "clamp(14px, 1.25vw, 20px)", margin: "0 2px" }}>{leer}</p> : null
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {liste.map((t) => (
            <div
              key={t.id}
              style={{
                background: C.navy2,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex",
                gap: 14,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  flex: "0 0 auto",
                  textAlign: "center",
                  minWidth: 68,
                  borderRight: `1px solid ${C.border}`,
                  paddingRight: 12,
                }}
              >
                <div style={{ color: C.cyan, fontWeight: 700, fontSize: "clamp(14px, 1.25vw, 20px)" }}>{fmtZeit(t.beginn_am) || "—"}</div>
                <div style={{ color: C.textDim, fontSize: "clamp(11.5px, 1vw, 16px)" }}>{fmtDatum(t.beginn_am)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "clamp(15px, 1.31vw, 21px)", fontWeight: 600 }}>{t.titel || "Ohne Titel"}</div>
                <div style={{ color: C.textDim, fontSize: "clamp(12.5px, 1.13vw, 18px)", marginTop: 2 }}>
                  {[t.ort, t.ressource, t.kunde_email].filter(Boolean).join(" · ") || "—"}
                </div>
                {t.kontakt_id ? (
                  <a
                    href={`/dashboard/crm/${t.kontakt_id}`}
                    title="Zur Kunden-Akte"
                    style={{
                      display: "inline-block",
                      marginTop: 6,
                      padding: "2px 9px",
                      borderRadius: 999,
                      border: `1px solid ${C.border}`,
                      background: "rgba(0,229,255,0.08)",
                      color: C.cyan,
                      textDecoration: "none",
                      fontSize: "clamp(11.5px, 1vw, 16px)",
                      fontWeight: 600,
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    👤 {kunden[t.kontakt_id] || "Kunde im CRM"}
                  </a>
                ) : null}
                {/* Paket VK3: zuständige Person, Grund der Zuteilung, Übertragen */}
                {uebertragung && (maName(t.mitarbeiter_id) || uebertragung.ma.length > 0) ? (
                  <div style={{ marginTop: 6, fontSize: "clamp(12px, 1.06vw, 17px)", color: C.textDim, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span>🧑‍💼 {maName(t.mitarbeiter_id) ?? "ohne Zuständigen"}{uebertragung.grund[t.id] ? ` · ${uebertragung.grund[t.id]}` : ""}</span>
                    {offenId === t.id ? (
                      <>
                        <select value={ziel} onChange={(e) => setZiel(e.target.value)}
                          style={{ background: C.navy, color: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 8px", fontFamily: "inherit" }}>
                          <option value="">— an wen? —</option>
                          {uebertragung.ma.filter((m) => m.id !== t.mitarbeiter_id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        <button disabled={!ziel} onClick={async () => { await uebertragung.aufUebertragen(t, ziel); setOffenId(null); setZiel(""); }}
                          style={{ background: C.gold, color: C.navy, border: "none", borderRadius: 8, padding: "4px 10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>übertragen</button>
                        <button onClick={() => { setOffenId(null); setZiel(""); }} style={{ background: "transparent", color: C.textDim, border: "none", cursor: "pointer" }}>abbrechen</button>
                      </>
                    ) : (
                      <button onClick={() => { setOffenId(t.id); setZiel(""); }} title="An einen Kollegen übertragen"
                        style={{ background: "transparent", color: C.gold, border: `1px solid ${C.border}`, borderRadius: 8, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>⇄ übertragen</button>
                    )}
                  </div>
                ) : null}
                {/* Paket VK5: erschienen / nicht erschienen */}
                {erscheinen && markierbar(t, new Date()) ? (
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: "clamp(12px, 1.06vw, 17px)" }}>
                    {erscheinen.wert[t.id] === true ? <span style={{ color: C.green, fontWeight: 700 }}>✓ erschienen</span>
                      : erscheinen.wert[t.id] === false ? <span style={{ color: C.danger, fontWeight: 700 }}>✗ nicht erschienen</span>
                      : <span style={{ color: C.textDim }}>Erschienen?</span>}
                    {erscheinen.wert[t.id] !== true && (
                      <button onClick={() => erscheinen.aufMarkieren(t, true)}
                        style={{ background: "transparent", color: C.green, border: `1px solid ${C.border}`, borderRadius: 8, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>✓ erschienen</button>
                    )}
                    {erscheinen.wert[t.id] !== false && (
                      <button onClick={() => erscheinen.aufMarkieren(t, false)}
                        style={{ background: "transparent", color: C.danger, border: `1px solid ${C.border}`, borderRadius: 8, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>✗ nicht erschienen</button>
                    )}
                    {erscheinen.wert[t.id] != null && (
                      <button onClick={() => erscheinen.aufMarkieren(t, null)} title="Markierung entfernen"
                        style={{ background: "transparent", color: C.textDim, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit" }}>zurücksetzen</button>
                    )}
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => onDelete(t)}
                title="Löschen"
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.textDim,
                  cursor: "pointer",
                  fontSize: "clamp(16px, 1.38vw, 22px)",
                  padding: 4,
                  flex: "0 0 auto",
                }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Paket VK5 Teil 2: Erinnerung 1 Std. vorher + Rückhol-Folge nach „nicht erschienen" (je Betrieb, Voreinstellung AUS)
function ShowUpEinstellung() {
  const [offen, setOffen] = useState(false);
  const [e, setE] = useState<ShowEinstellung>(einstellungLesen(null));
  const [tageText, setTageText] = useState("1, 4");
  const [chef, setChef] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!offen || geladen) return;
    (async () => {
      try {
        const { data: c } = await supabase.rpc("mein_chef_id");
        setChef(!c);
        const { data, error } = await supabase.from("vk_showup").select("erinnerung_1h, rueckhol_an, rueckhol_tage").limit(1).maybeSingle();
        if (!error) {
          const w = einstellungLesen(data as Record<string, unknown> | null);
          setE(w);
          setTageText(w.rueckhol_tage.join(", "));
        }
      } catch { /* Voreinstellung bleibt */ }
      setGeladen(true);
    })();
  }, [offen, geladen]);

  async function sichern() {
    setBusy(true); setMeldung(null);
    try {
      const tage = rueckholTageBereinigen(tageText.split(/[,;\s]+/).map((x) => leseZahl(x)).filter((x): x is number => x !== null));
      if (!tage.length) { setMeldung("Bitte mindestens einen Tag zwischen 1 und 30 angeben."); return; }
      const { data: u } = await supabase.auth.getUser();
      const id = u?.user?.id;
      if (!id) { setMeldung("Nicht angemeldet."); return; }
      const { error } = await supabase.from("vk_showup").upsert(
        { owner_user_id: id, erinnerung_1h: e.erinnerung_1h, rueckhol_an: e.rueckhol_an, rueckhol_tage: tage, aktualisiert_am: new Date().toISOString() },
        { onConflict: "owner_user_id" });
      if (error) throw error;
      setTageText(tage.join(", "));
      setMeldung("Gespeichert.");
    } catch (x: unknown) {
      setMeldung("Speichern fehlgeschlagen: " + (x instanceof Error ? x.message : "Fehler"));
    } finally {
      setBusy(false);
    }
  }

  const box: React.CSSProperties = { background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px", marginBottom: 22 };
  return (
    <div style={box}>
      <button onClick={() => setOffen(!offen)}
        style={{ background: "transparent", border: "none", color: "#fff", fontWeight: 700, fontSize: "clamp(14px, 1.25vw, 20px)", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
        📣 Erinnerung &amp; Rückholung {offen ? "▴" : "▾"}
      </button>
      {offen && (
        <div style={{ marginTop: 12, color: C.textDim, fontSize: "clamp(13px, 1.13vw, 18px)", lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 10px" }}>
            Die Bestätigung nach der Online-Buchung und die Erinnerung am Vortag laufen immer. Zusätzlich lässt sich hier einschalten:
          </p>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "8px 0", color: "#fff" }}>
            <input type="checkbox" disabled={!chef} checked={e.erinnerung_1h} onChange={(x) => setE({ ...e, erinnerung_1h: x.target.checked })} />
            <span>Erinnerung <b>1 Stunde vorher</b> per E-Mail an den Kunden</span>
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "8px 0", color: "#fff" }}>
            <input type="checkbox" disabled={!chef} checked={e.rueckhol_an} onChange={(x) => setE({ ...e, rueckhol_an: x.target.checked })} />
            <span><b>Rückhol-Folge</b>: Wer als „nicht erschienen" markiert ist, bekommt eine freundliche Mail mit Link zur Online-Buchung (nur 9–18 Uhr, Schluss sobald neu gebucht)</span>
          </label>
          <label style={{ display: "block", margin: "10px 0 4px" }}>Rückhol-Mails an Tag … nach dem verpassten Termin (bis zu 3, je 1–30)</label>
          <input value={tageText} disabled={!chef} onChange={(x) => setTageText(x.target.value)} placeholder="1, 4" style={{ ...inputStyle, maxWidth: 200 }} />
          {chef ? (
            <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={sichern} disabled={busy}
                style={{ background: C.gold, color: C.navy, border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {busy ? "Speichert…" : "Speichern"}
              </button>
              {meldung && <span style={{ color: meldung === "Gespeichert." ? C.green : C.danger }}>{meldung}</span>}
            </div>
          ) : (
            <p style={{ marginTop: 10 }}>Nur die Geschäftsleitung ändert diese Einstellung.</p>
          )}
          <p style={{ margin: "10px 0 0", fontSize: "clamp(12px, 1.06vw, 17px)" }}>
            Ohne freigeschaltete Online-Buchung enthält die Rückhol-Mail keinen Link, sondern bittet um eine Antwort per E-Mail.
          </p>
        </div>
      )}
    </div>
  );
}

function KpiKarte({ label, wert, hint, farbe }: { label: string; wert: string; hint: string; farbe: string }) {
  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "18px 20px",
        borderLeft: `3px solid ${farbe}`,
      }}
    >
      <div style={{ color: C.textDim, fontSize: "clamp(12.5px, 1.13vw, 18px)", fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontFamily: "var(--font-dm-sans), sans-serif",
          fontSize: "clamp(26px, 2.25vw, 36px)",
          fontWeight: 700,
          margin: "6px 0 2px",
          color: farbe,
        }}
      >
        {wert}
      </div>
      <div style={{ color: C.textDim, fontSize: "clamp(11.5px, 1vw, 16px)" }}>{hint}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  color: C.textDim,
  fontSize: "clamp(13px, 1.13vw, 18px)",
  fontWeight: 600,
  margin: "14px 0 6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 14px",
  color: "#fff",
  fontSize: "clamp(14px, 1.25vw, 20px)",
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};
