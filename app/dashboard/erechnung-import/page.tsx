"use client";

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · P35 + P36 — E-RECHNUNG IMPORT
// ------------------------------------------------------------
// Lädt eine eingehende E-Rechnung hoch (XML oder ZUGFeRD-PDF),
// liest sie über /api/erechnung-lesen aus, zeigt sie lesbar an
// UND archiviert sie automatisch GoBD-konform (/api/erechnung-
// archivieren) — die Datei bleibt unveränderbar erhalten.
// Doppelschutz per Hash: dieselbe Datei wird nicht zweimal abgelegt.
// ============================================================

import React, { useState, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";

const NAVY = "#0A1628";
const NAVY2 = "#0f1f38";
const GOLD = "#C9A84C";
const CYAN = "#00e5ff";
const GRUEN = "#00e676";
const LINE = "rgba(201,168,76,0.18)";
const TEXT = "#e8f0f8";
const DIM = "rgba(232,240,248,0.55)";

type Partei = {
  name: string; strasse: string; plz: string; ort: string; land: string;
  ust_idnr: string; steuernummer: string; email: string;
};
type Position = {
  bezeichnung: string; menge: number; einheit: string;
  einzelpreis: number; netto: number; mwst_satz: number;
};
type ERechnung = {
  format: string; rechnungsnummer: string; rechnungsdatum: string;
  faelligkeitsdatum: string; leistungsdatum: string; waehrung: string;
  verkaeufer: Partei; kaeufer: Partei; positionen: Position[];
  netto_summe: number; mwst_summe: number; brutto_summe: number;
  kleinunternehmer: boolean; notizen: string; warnungen: string[];
};

function geld(n: number, w = "EUR"): string {
  try { return new Intl.NumberFormat("de-DE", { style: "currency", currency: w || "EUR" }).format(Number(n) || 0); }
  catch { return (Number(n) || 0).toFixed(2) + " " + w; }
}
function datum(s: string): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

export default function ERechnungImport() {
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState<string>("");
  const [daten, setDaten] = useState<ERechnung | null>(null);
  const [dateiName, setDateiName] = useState<string>("");
  const [archivStatus, setArchivStatus] = useState<string>("");   // "" | "läuft" | "ok" | "schon" | "fehler"
  const [archivInfo, setArchivInfo] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function verarbeite(file: File) {
    setFehler("");
    setDaten(null);
    setArchivStatus("");
    setArchivInfo("");
    setDateiName(file.name);
    setLaden(true);
    try {
      // 1) Auslesen
      const fd = new FormData();
      fd.append("datei", file);
      const res = await fetch("/api/erechnung-lesen", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setFehler(j.error || "Konnte nicht ausgelesen werden.");
        if (j.details && Array.isArray(j.details)) setFehler((j.error || "") + " (" + j.details.join(", ") + ")");
        return;
      }
      const rechnung = j.rechnung as ERechnung;
      setDaten(rechnung);

      // 2) Automatisch GoBD-archivieren (Eingang)
      await archiviere(file, rechnung);
    } catch (e: any) {
      setFehler("Unerwarteter Fehler: " + (e?.message || String(e)));
    } finally {
      setLaden(false);
    }
  }

  async function archiviere(file: File, rechnung: ERechnung) {
    setArchivStatus("läuft");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setArchivStatus("fehler"); setArchivInfo("Nicht angemeldet."); return; }

      const fd = new FormData();
      fd.append("datei", file);
      fd.append("owner_user_id", user.id);
      fd.append("richtung", "eingang");
      fd.append("rechnungsnummer", rechnung.rechnungsnummer || "");
      fd.append("format", rechnung.format || "");
      fd.append("lieferant_name", rechnung.verkaeufer?.name || "");
      fd.append("empfaenger_name", rechnung.kaeufer?.name || "");
      fd.append("brutto_summe", String(rechnung.brutto_summe || 0));
      fd.append("waehrung", rechnung.waehrung || "EUR");
      fd.append("rechnungsdatum", rechnung.rechnungsdatum || "");

      const res = await fetch("/api/erechnung-archivieren", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        // "schon archiviert" ist KEIN echter Fehler — freundlich behandeln
        if (j.bereits) {
          setArchivStatus("schon");
          setArchivInfo("bereits archiviert am " + datum(j.bereits_am || ""));
        } else {
          setArchivStatus("fehler");
          setArchivInfo(j.error || "Archivierung fehlgeschlagen.");
        }
        return;
      }
      setArchivStatus("ok");
      setArchivInfo("revisionssicher archiviert" + (j.archiviert_am ? " am " + datum(String(j.archiviert_am).slice(0, 10)) : ""));
    } catch (e: any) {
      setArchivStatus("fehler");
      setArchivInfo(e?.message || String(e));
    }
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) verarbeite(f);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) verarbeite(f);
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px", color: TEXT }}>
      <div style={{ marginBottom: 8, fontSize: 'clamp(12px, 1.06vw, 17px)', letterSpacing: "0.15em", color: GOLD, textTransform: "uppercase" }}>
        Modul Rechnung · E-Rechnung
      </div>
      <h1 style={{ fontSize: 'clamp(28px, 2.44vw, 39px)', fontWeight: 900, margin: "0 0 6px", letterSpacing: "0.02em" }}>
        E-Rechnung einlesen
      </h1>
      <p style={{ color: DIM, margin: "0 0 24px", fontSize: 'clamp(14px, 1.25vw, 20px)', lineHeight: 1.6 }}>
        Eingehende E-Rechnung hochladen (XML nach EN 16931 oder ZUGFeRD-PDF). ARGONAUT liest die
        Daten automatisch aus, zeigt sie lesbar an und archiviert das Original GoBD-konform
        (unveränderbar, 10 Jahre) — egal von welchem Absender.
      </p>

      {/* Upload-Bereich */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${LINE}`, borderRadius: 14, padding: "38px 24px",
          textAlign: "center", cursor: "pointer", background: NAVY2, transition: "border-color .2s",
        }}
      >
        <div style={{ fontSize: 'clamp(40px, 3.5vw, 56px)', marginBottom: 10 }}>📥</div>
        <div style={{ fontSize: 'clamp(16px, 1.38vw, 22px)', fontWeight: 700, marginBottom: 4 }}>
          E-Rechnung hierher ziehen oder klicken
        </div>
        <div style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: DIM }}>
          Unterstützt: .xml (XRechnung / ZUGFeRD-CII / UBL) und .pdf (ZUGFeRD)
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xml,.pdf,application/xml,text/xml,application/pdf"
          onChange={onInput}
          style={{ display: "none" }}
        />
      </div>

      {dateiName && (
        <div style={{ marginTop: 12, fontSize: 'clamp(13px, 1.13vw, 18px)', color: DIM }}>
          Datei: <span style={{ color: TEXT }}>{dateiName}</span>
        </div>
      )}

      {laden && (
        <div style={{ marginTop: 20, color: CYAN, fontSize: 'clamp(14px, 1.25vw, 20px)' }}>▸ Rechnung wird ausgelesen…</div>
      )}

      {fehler && (
        <div style={{
          marginTop: 20, background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.3)",
          borderRadius: 10, padding: "14px 16px", color: "#ff9a9a", fontSize: 'clamp(14px, 1.25vw, 20px)',
        }}>
          ⚠ {fehler}
        </div>
      )}

      {daten && (
        <div style={{ marginTop: 28 }}>
          {/* Archivierungs-Status */}
          {archivStatus && (
            <div style={{
              marginBottom: 18, borderRadius: 10, padding: "12px 16px", fontSize: 'clamp(14px, 1.25vw, 20px)',
              background: archivStatus === "fehler" ? "rgba(255,82,82,0.08)" : "rgba(0,230,118,0.08)",
              border: `1px solid ${archivStatus === "fehler" ? "rgba(255,82,82,0.3)" : "rgba(0,230,118,0.3)"}`,
              color: archivStatus === "fehler" ? "#ff9a9a" : GRUEN,
            }}>
              {archivStatus === "läuft" && "▸ Wird revisionssicher archiviert…"}
              {archivStatus === "ok" && `✓ GoBD-Archiv: ${archivInfo}`}
              {archivStatus === "schon" && `✓ GoBD-Archiv: ${archivInfo}`}
              {archivStatus === "fehler" && `⚠ Archivierung: ${archivInfo}`}
            </div>
          )}

          {/* Kopfzeile */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 'clamp(22px, 1.94vw, 31px)', fontWeight: 900, color: GOLD }}>
                {daten.rechnungsnummer || "— ohne Nummer —"}
              </div>
              <div style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: DIM }}>
                Format erkannt: <span style={{ color: CYAN }}>{daten.format}</span>
                {daten.kleinunternehmer && <span style={{ color: GOLD }}> · Kleinunternehmer §19</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: DIM, textTransform: "uppercase", letterSpacing: "0.1em" }}>Gesamtbetrag</div>
              <div style={{ fontSize: 'clamp(24px, 2.13vw, 34px)', fontWeight: 900, color: TEXT }}>{geld(daten.brutto_summe, daten.waehrung)}</div>
            </div>
          </div>

          {daten.warnungen && daten.warnungen.length > 0 && (
            <div style={{
              marginBottom: 18, background: "rgba(201,168,76,0.08)", border: `1px solid ${LINE}`,
              borderRadius: 10, padding: "12px 16px", color: GOLD, fontSize: 'clamp(13px, 1.13vw, 18px)',
            }}>
              ⚠ Hinweise: {daten.warnungen.join(" · ")}
            </div>
          )}

          {/* Parteien */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <ParteiKarte titel="Lieferant (Rechnungssteller)" p={daten.verkaeufer} />
            <ParteiKarte titel="Empfänger" p={daten.kaeufer} />
          </div>

          {/* Eckdaten */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
            <Eck label="Rechnungsdatum" wert={datum(daten.rechnungsdatum)} />
            <Eck label="Leistungsdatum" wert={datum(daten.leistungsdatum)} />
            <Eck label="Fällig bis" wert={datum(daten.faelligkeitsdatum)} />
          </div>

          {/* Positionen */}
          <div style={{ background: NAVY2, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${LINE}`, fontSize: 'clamp(13px, 1.13vw, 18px)', fontWeight: 700, color: CYAN, letterSpacing: "0.05em" }}>
              POSITIONEN ({daten.positionen.length})
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
                <thead>
                  <tr style={{ color: DIM, textAlign: "left" }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Bezeichnung</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Menge</th>
                    <th style={thStyle}>Einheit</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Einzelpreis</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>MwSt</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Netto</th>
                  </tr>
                </thead>
                <tbody>
                  {daten.positionen.length === 0 ? (
                    <tr><td colSpan={7} style={{ ...tdStyle, color: DIM, textAlign: "center", padding: 18 }}>Keine Positionen im Dokument.</td></tr>
                  ) : daten.positionen.map((p, i) => (
                    <tr key={i}>
                      <td style={{ ...tdStyle, color: DIM }}>{i + 1}</td>
                      <td style={tdStyle}>{p.bezeichnung || "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{p.menge}</td>
                      <td style={tdStyle}>{p.einheit}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{geld(p.einzelpreis, daten.waehrung)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{p.mwst_satz} %</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{geld(p.netto, daten.waehrung)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summen */}
          <div style={{ maxWidth: 360, marginLeft: "auto", background: NAVY2, border: `1px solid ${LINE}`, borderRadius: 12, padding: "16px 20px" }}>
            <SummeZeile label="Netto" wert={geld(daten.netto_summe, daten.waehrung)} />
            <SummeZeile label="Umsatzsteuer" wert={geld(daten.mwst_summe, daten.waehrung)} />
            <div style={{ borderTop: `2px solid ${GOLD}`, marginTop: 8, paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 'clamp(18px, 1.56vw, 25px)', fontWeight: 900 }}>
              <span>Gesamt</span><span>{geld(daten.brutto_summe, daten.waehrung)}</span>
            </div>
          </div>

          {daten.notizen && (
            <div style={{ marginTop: 18, color: DIM, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>
              Notiz: {daten.notizen}
            </div>
          )}

          <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => { setDaten(null); setDateiName(""); setFehler(""); setArchivStatus(""); setArchivInfo(""); }}
              style={{ padding: "10px 18px", background: "transparent", color: CYAN, border: `1px solid ${CYAN}`, borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 'clamp(14px, 1.25vw, 20px)' }}
            >
              Weitere Rechnung einlesen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 'clamp(11px, 0.94vw, 15px)', textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${LINE}`, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid rgba(201,168,76,0.06)" };

function ParteiKarte({ titel, p }: { titel: string; p: Partei }) {
  const leer = !p.name && !p.ort && !p.strasse;
  return (
    <div style={{ background: NAVY2, border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', textTransform: "uppercase", letterSpacing: "0.08em", color: DIM, marginBottom: 8 }}>{titel}</div>
      {leer ? (
        <div style={{ color: DIM, fontSize: 'clamp(13px, 1.13vw, 18px)' }}>— keine Angaben —</div>
      ) : (
        <>
          <div style={{ fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 700, marginBottom: 2 }}>{p.name || "—"}</div>
          {p.strasse && <div style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: DIM }}>{p.strasse}</div>}
          {(p.plz || p.ort) && <div style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: DIM }}>{[p.plz, p.ort].filter(Boolean).join(" ")}{p.land ? `, ${p.land}` : ""}</div>}
          {p.ust_idnr && <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: DIM, marginTop: 4 }}>USt-IdNr.: {p.ust_idnr}</div>}
          {p.steuernummer && <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: DIM }}>Steuernr.: {p.steuernummer}</div>}
          {p.email && <div style={{ fontSize: 'clamp(12px, 1.06vw, 17px)', color: DIM }}>{p.email}</div>}
        </>
      )}
    </div>
  );
}

function Eck({ label, wert }: { label: string; wert: string }) {
  return (
    <div style={{ background: NAVY2, border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 'clamp(11px, 0.94vw, 15px)', textTransform: "uppercase", letterSpacing: "0.06em", color: DIM, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 'clamp(15px, 1.31vw, 21px)', fontWeight: 700 }}>{wert}</div>
    </div>
  );
}

function SummeZeile({ label, wert }: { label: string; wert: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 'clamp(14px, 1.25vw, 20px)' }}>
      <span style={{ color: DIM }}>{label}</span><span>{wert}</span>
    </div>
  );
}
