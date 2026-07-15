"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import FinanzTabs from "../_components/FinanzTabs";

// ============================================================
// ARGONAUT OS · BLOCK D (Finanzen) · D-2 — AUSGABEN-COCKPIT
// /dashboard/finanzen/ausgaben
// Ausgaben erfassen/bearbeiten/löschen, kategorisieren, Beleg hochladen.
// Quelle der Ausgaben für EÜR (D-3) und BWA (D-4).
// ============================================================

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
  lila: "#A98CE0",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

const KATEGORIEN = [
  "Wareneinkauf",
  "Büromaterial",
  "Miete & Nebenkosten",
  "Software & IT",
  "Werkzeug & Maschinen",
  "Fahrzeug & Tanken",
  "Reisekosten",
  "Marketing & Werbung",
  "Versicherungen",
  "Telefon & Internet",
  "Fortbildung",
  "Beratung & Steuer",
  "Löhne & Gehälter",
  "Sonstiges",
];

const ZAHLUNGSARTEN = ["Überweisung", "Bar", "Karte", "Lastschrift", "PayPal", "Sonstige"];
const MWST_SAETZE = [19, 7, 0];

type Ausgabe = {
  id: string;
  bezeichnung: string;
  kategorie: string;
  betrag_brutto: number;
  mwst_satz: number;
  ausgabedatum: string;
  lieferant: string | null;
  zahlungsart: string;
  beleg_pfad: string | null;
  notiz: string | null;
};

function eur(n: number | null | undefined): string {
  const v = typeof n === "number" ? n : 0;
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
  } catch {
    return `${v.toFixed(2)} €`;
  }
}
function datumDe(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return d;
  }
}
function parseZahl(s: string): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function heuteStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AusgabenCockpit() {
  const router = useRouter();

  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ausgaben, setAusgaben] = useState<Ausgabe[]>([]);

  const [suche, setSuche] = useState("");
  const [katFilter, setKatFilter] = useState<string>("alle");

  // Formular
  const [formOffen, setFormOffen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState("");
  const [kategorie, setKategorie] = useState("Sonstiges");
  const [betrag, setBetrag] = useState("");
  const [mwstSatz, setMwstSatz] = useState("19");
  const [datum, setDatum] = useState(heuteStr());
  const [lieferant, setLieferant] = useState("");
  const [zahlungsart, setZahlungsart] = useState("Überweisung");
  const [notiz, setNotiz] = useState("");
  const [belegFile, setBelegFile] = useState<File | null>(null);
  const [belegVorhanden, setBelegVorhanden] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function laden_() {
    setLaden(true);
    setFehler(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    const { data, error } = await supabase
      .from("ausgaben")
      .select("*")
      .order("ausgabedatum", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      setFehler(error.message);
      setLaden(false);
      return;
    }
    setAusgaben((data as Ausgabe[]) || []);
    setLaden(false);
  }

  useEffect(() => {
    laden_();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formLeeren() {
    setEditId(null);
    setBezeichnung("");
    setKategorie("Sonstiges");
    setBetrag("");
    setMwstSatz("19");
    setDatum(heuteStr());
    setLieferant("");
    setZahlungsart("Überweisung");
    setNotiz("");
    setBelegFile(null);
    setBelegVorhanden(null);
  }

  function neueAusgabe() {
    formLeeren();
    setFormOffen(true);
  }

  function bearbeiten(a: Ausgabe) {
    setEditId(a.id);
    setBezeichnung(a.bezeichnung || "");
    setKategorie(a.kategorie || "Sonstiges");
    setBetrag(String(a.betrag_brutto ?? "").replace(".", ","));
    setMwstSatz(String(a.mwst_satz ?? 19));
    setDatum(a.ausgabedatum || heuteStr());
    setLieferant(a.lieferant || "");
    setZahlungsart(a.zahlungsart || "Überweisung");
    setNotiz(a.notiz || "");
    setBelegFile(null);
    setBelegVorhanden(a.beleg_pfad || null);
    setFormOffen(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function belegHochladen(file: File, userId: string): Promise<string> {
    const sicher = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-60);
    const pfad = `${userId}/${Date.now()}-${sicher}`;
    const { error } = await supabase.storage.from("belege").upload(pfad, file, { upsert: false });
    if (error) throw new Error("Beleg-Upload fehlgeschlagen: " + error.message);
    return pfad;
  }

  async function speichern() {
    if (busy) return;
    if (!bezeichnung.trim()) {
      setFehler("Bitte eine Bezeichnung eingeben.");
      return;
    }
    if (parseZahl(betrag) <= 0) {
      setFehler("Bitte einen Betrag größer als 0 eingeben.");
      return;
    }
    if (!datum) {
      setFehler("Bitte ein Ausgabedatum wählen.");
      return;
    }
    setBusy(true);
    setFehler(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setFehler("Nicht eingeloggt.");
        setBusy(false);
        return;
      }

      // Beleg ggf. hochladen
      let belegPfad = belegVorhanden;
      if (belegFile) {
        belegPfad = await belegHochladen(belegFile, user.id);
      }

      const datensatz: any = {
        owner_user_id: user.id,
        bezeichnung: bezeichnung.trim(),
        kategorie,
        betrag_brutto: parseZahl(betrag),
        mwst_satz: parseZahl(mwstSatz),
        ausgabedatum: datum,
        lieferant: lieferant.trim() || null,
        zahlungsart,
        beleg_pfad: belegPfad,
        notiz: notiz.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (editId) {
        const { error } = await supabase.from("ausgaben").update(datensatz).eq("id", editId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("ausgaben").insert(datensatz);
        if (error) throw new Error(error.message);
      }

      formLeeren();
      setFormOffen(false);
      await laden_();
    } catch (e: any) {
      setFehler("Speichern fehlgeschlagen: " + (e?.message || "unbekannt"));
    }
    setBusy(false);
  }

  async function loeschen(a: Ausgabe) {
    if (!window.confirm(`Ausgabe „${a.bezeichnung}" wirklich löschen?`)) return;
    setFehler(null);
    // Beleg-Datei mitlöschen (best effort)
    if (a.beleg_pfad) {
      await supabase.storage.from("belege").remove([a.beleg_pfad]);
    }
    const { error } = await supabase.from("ausgaben").delete().eq("id", a.id);
    if (error) {
      setFehler("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    await laden_();
  }

  async function belegOeffnen(pfad: string) {
    const { data, error } = await supabase.storage.from("belege").createSignedUrl(pfad, 120);
    if (error || !data?.signedUrl) {
      setFehler("Beleg konnte nicht geöffnet werden.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  // KPIs
  const kpis = useMemo(() => {
    const jetzt = new Date();
    const jahr = jetzt.getFullYear();
    const monat = jetzt.getMonth();
    let summeMonat = 0;
    let summeJahr = 0;
    let ohneBeleg = 0;
    for (const a of ausgaben) {
      const d = a.ausgabedatum ? new Date(a.ausgabedatum) : null;
      const b = Number(a.betrag_brutto) || 0;
      if (d && d.getFullYear() === jahr) {
        summeJahr += b;
        if (d.getMonth() === monat) summeMonat += b;
      }
      if (!a.beleg_pfad) ohneBeleg += 1;
    }
    return { summeMonat, summeJahr, anzahl: ausgaben.length, ohneBeleg };
  }, [ausgaben]);

  // Gefilterte Liste
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return ausgaben.filter((a) => {
      if (katFilter !== "alle" && a.kategorie !== katFilter) return false;
      if (!q) return true;
      const hay = [a.bezeichnung, a.kategorie, a.lieferant || "", a.notiz || ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [ausgaben, suche, katFilter]);

  const spalten = "110px 1fr 170px 130px 90px 90px";

  return (
    <div
      style={{
        background: C.navy,
        minHeight: "100vh",
        padding: "32px 24px 64px",
        color: "#fff",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <FinanzTabs />
        {/* Kopfzeile */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-dm-sans), sans-serif",
                fontSize: 30,
                fontWeight: 800,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              💶 Ausgaben
            </h1>
            <p style={{ color: C.textDim, margin: "6px 0 0", fontSize: 15 }}>
              Betriebsausgaben erfassen, kategorisieren und Belege ablegen
            </p>
          </div>
          {!formOffen && (
            <button onClick={neueAusgabe} style={btnGold}>
              + Neue Ausgabe
            </button>
          )}
        </div>

        {/* FORMULAR */}
        {formOffen && (
          <div
            style={{
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "20px 22px",
              marginBottom: 24,
            }}
          >
            <div style={sektionLabel}>{editId ? "Ausgabe bearbeiten" : "Neue Ausgabe erfassen"}</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Bezeichnung *</label>
                <input
                  value={bezeichnung}
                  onChange={(e) => setBezeichnung(e.target.value)}
                  placeholder="z. B. Büromaterial Staples"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Kategorie</label>
                <select value={kategorie} onChange={(e) => setKategorie(e.target.value)} style={inputStyle}>
                  {KATEGORIEN.map((k) => (
                    <option key={k} value={k} style={{ background: C.navy2 }}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Betrag (brutto, €) *</label>
                <input
                  value={betrag}
                  onChange={(e) => setBetrag(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>MwSt-Satz</label>
                <select value={mwstSatz} onChange={(e) => setMwstSatz(e.target.value)} style={inputStyle}>
                  {MWST_SAETZE.map((s) => (
                    <option key={s} value={String(s)} style={{ background: C.navy2 }}>
                      {s} %
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Ausgabedatum *</label>
                <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Lieferant (optional)</label>
                <input
                  value={lieferant}
                  onChange={(e) => setLieferant(e.target.value)}
                  placeholder="von wem"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Zahlungsart</label>
                <select value={zahlungsart} onChange={(e) => setZahlungsart(e.target.value)} style={inputStyle}>
                  {ZAHLUNGSARTEN.map((z) => (
                    <option key={z} value={z} style={{ background: C.navy2 }}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Beleg (Bild oder PDF, optional)</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setBelegFile(e.target.files?.[0] || null)}
                  style={{ ...inputStyle, padding: "9px 12px" }}
                />
                {belegVorhanden && !belegFile && (
                  <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 6 }}>
                    Aktueller Beleg vorhanden.{" "}
                    <button
                      onClick={() => belegOeffnen(belegVorhanden)}
                      style={{ background: "none", border: "none", color: C.cyan, cursor: "pointer", padding: 0, textDecoration: "underline", fontSize: 12.5 }}
                    >
                      ansehen
                    </button>{" "}
                    – neue Datei ersetzt ihn.
                  </div>
                )}
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Notiz (optional)</label>
                <textarea
                  value={notiz}
                  onChange={(e) => setNotiz(e.target.value)}
                  rows={2}
                  placeholder="interne Anmerkung…"
                  style={{ ...inputStyle, resize: "vertical", minHeight: 60, lineHeight: 1.5 }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button
                onClick={() => {
                  formLeeren();
                  setFormOffen(false);
                }}
                style={btnGhost}
              >
                Abbrechen
              </button>
              <button
                onClick={speichern}
                disabled={busy}
                style={{ ...btnGold, opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}
              >
                {busy ? "Speichert…" : editId ? "✓ Änderungen speichern" : "＋ Ausgabe buchen"}
              </button>
            </div>
          </div>
        )}

        {/* KPI-Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <KpiCard label="Ausgaben (dieser Monat)" wert={eur(kpis.summeMonat)} farbe={C.warn} />
          <KpiCard label="Ausgaben (dieses Jahr)" wert={eur(kpis.summeJahr)} farbe={C.gold} />
          <KpiCard label="Anzahl Ausgaben" wert={String(kpis.anzahl)} farbe={C.cyan} />
          <KpiCard label="Ohne Beleg" wert={String(kpis.ohneBeleg)} farbe={kpis.ohneBeleg > 0 ? C.danger : C.green} />
        </div>

        {/* Suche + Filter */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Suche nach Bezeichnung, Lieferant, Notiz…"
            style={{
              flex: "1 1 320px",
              minWidth: 240,
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "12px 16px",
              color: "#fff",
              fontSize: 15,
              outline: "none",
            }}
          />
          <select
            value={katFilter}
            onChange={(e) => setKatFilter(e.target.value)}
            style={{
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "12px 16px",
              color: "#fff",
              fontSize: 14,
              outline: "none",
            }}
          >
            <option value="alle" style={{ background: C.navy2 }}>
              Alle Kategorien
            </option>
            {KATEGORIEN.map((k) => (
              <option key={k} value={k} style={{ background: C.navy2 }}>
                {k}
              </option>
            ))}
          </select>
        </div>

        {/* Inhalt */}
        {laden ? (
          <div style={{ color: C.textDim, padding: "40px 0", textAlign: "center" }}>
            ARGONAUT lädt die Ausgaben…
          </div>
        ) : fehler ? (
          <div
            style={{
              background: "rgba(224,102,102,0.1)",
              border: `1px solid ${C.danger}`,
              borderRadius: 12,
              padding: 16,
              color: C.danger,
            }}
          >
            ⚠️ {fehler}
          </div>
        ) : gefiltert.length === 0 ? (
          <div
            style={{
              background: C.navy2,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "48px 24px",
              textAlign: "center",
              color: C.textDim,
            }}
          >
            {ausgaben.length === 0 ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💶</div>
                <div style={{ fontSize: 17, color: "#fff", marginBottom: 6 }}>Noch keine Ausgaben</div>
                <div style={{ fontSize: 14 }}>Klicke oben rechts auf „+ Neue Ausgabe".</div>
              </>
            ) : (
              "Keine Ausgaben passen zu Suche/Filter."
            )}
          </div>
        ) : (
          <div style={{ background: C.navy2, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              {/* Kopf */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: spalten,
                  gap: 12,
                  padding: "14px 18px",
                  borderBottom: `1px solid ${C.border}`,
                  color: C.textDim,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  minWidth: 760,
                }}
              >
                <div>Datum</div>
                <div>Bezeichnung / Kategorie</div>
                <div>Lieferant</div>
                <div style={{ textAlign: "right" }}>Betrag</div>
                <div style={{ textAlign: "center" }}>Beleg</div>
                <div style={{ textAlign: "right" }}>Aktion</div>
              </div>

              {gefiltert.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: spalten,
                    gap: 12,
                    padding: "14px 18px",
                    borderBottom: `1px solid ${C.border}`,
                    alignItems: "center",
                    minWidth: 760,
                  }}
                >
                  <div style={{ color: C.textDim, fontSize: 13.5 }}>{datumDe(a.ausgabedatum)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14.5,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {a.bezeichnung || "—"}
                    </div>
                    <div style={{ color: C.textDim, fontSize: 12.5 }}>{a.kategorie}</div>
                  </div>
                  <div
                    style={{
                      color: C.textDim,
                      fontSize: 13.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {a.lieferant || "—"}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 700, fontSize: 14.5 }}>{eur(a.betrag_brutto)}</div>
                  <div style={{ textAlign: "center" }}>
                    {a.beleg_pfad ? (
                      <button
                        onClick={() => belegOeffnen(a.beleg_pfad as string)}
                        title="Beleg ansehen"
                        style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16 }}
                      >
                        📎
                      </button>
                    ) : (
                      <span style={{ color: C.textDim, fontSize: 13 }}>—</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => bearbeiten(a)}
                      title="Bearbeiten"
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 9px", color: C.textDim, cursor: "pointer", fontSize: 13 }}
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => loeschen(a)}
                      title="Löschen"
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 9px", color: C.textDim, cursor: "pointer", fontSize: 13 }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!laden && !fehler && gefiltert.length > 0 && (
          <div style={{ marginTop: 14, color: C.textDim, fontSize: 13, textAlign: "right" }}>
            {gefiltert.length} von {ausgaben.length} Ausgaben
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, wert, farbe }: { label: string; wert: string; farbe: string }) {
  return (
    <div
      style={{
        background: C.navy2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "18px 18px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: farbe }} />
      <div style={{ color: C.textDim, fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-dm-sans), sans-serif", fontSize: 24, fontWeight: 800, color: farbe }}>{wert}</div>
    </div>
  );
}

const sektionLabel: React.CSSProperties = {
  color: C.textDim,
  fontSize: 12.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: C.textDim,
  fontSize: 13,
  fontWeight: 600,
  margin: "0 0 6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 14px",
  color: "#fff",
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  boxSizing: "border-box",
};

const btnGold: React.CSSProperties = {
  background: C.gold,
  color: C.navy,
  border: "none",
  borderRadius: 10,
  padding: "11px 20px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: C.textDim,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "11px 18px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};
