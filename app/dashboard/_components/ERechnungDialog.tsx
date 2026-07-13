"use client";

// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · P33 — E-RECHNUNG DIALOG
// ------------------------------------------------------------
// Kapselt das Erzeugen der E-Rechnung mit Auswahl:
//   · Profil: XRechnung (Behörde) oder ZUGFeRD (Firma)
//   · Leitweg-ID (nur bei Behörden-Rechnung nötig)
// Ersetzt den bisherigen Sofort-Download durch einen kleinen
// Dialog mit Kontrolle. Eigenständige Komponente -> die große
// rechnungen/[id]/page.tsx muss nur importieren + einbinden.
//
// Nutzung in page.tsx:
//   import ERechnungDialog from "../../_components/ERechnungDialog";
//   ...
//   <ERechnungDialog rechnung={rechnung} zeilen={zeilen}
//     kontakt={kontakt} firma={firma} supabase={supabase}
//     zeileNetto={zeileNetto} />
// ============================================================

import React, { useState } from "react";
import { validiereERechnung, type ValidierErgebnis } from "../../../lib/erechnung-validator";

const GOLD = "#C9A84C";
const CYAN = "#00e5ff";
const NAVY2 = "#0f1f38";
const LINE = "rgba(201,168,76,0.25)";
const TEXT = "#e8f0f8";
const DIM = "rgba(232,240,248,0.6)";

type Props = {
  rechnung: any;
  zeilen: any[];
  kontakt: any;
  firma: any;
  supabase: any;
  zeileNetto: (z: any) => number;
};

function feldWert(obj: any, ...namen: string[]): string {
  if (!obj) return "";
  for (const n of namen) {
    const v = obj[n];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

export default function ERechnungDialog({ rechnung, zeilen, kontakt, firma, supabase, zeileNetto }: Props) {
  const [offen, setOffen] = useState(false);
  const [profil, setProfil] = useState<"xrechnung" | "zugferd">("zugferd");
  const [leitweg, setLeitweg] = useState("");
  const [laden, setLaden] = useState(false);
  const [hinweis, setHinweis] = useState("");
  const [pruefung, setPruefung] = useState<ValidierErgebnis | null>(null);

  function baueEmpfaenger(): any {
    const q: any = firma || kontakt || {};
    const name =
      feldWert(firma, "name", "firmenname", "firma") ||
      feldWert(kontakt, "name") ||
      [feldWert(kontakt, "vorname"), feldWert(kontakt, "nachname")].filter(Boolean).join(" ") ||
      (rechnung?.empfaenger_name || "");
    const strasse = feldWert(q, "strasse", "straße", "adresse", "anschrift", "street");
    const plz = feldWert(q, "plz", "postleitzahl", "zip");
    const ort = feldWert(q, "ort", "stadt", "city");
    const land = feldWert(q, "land", "country") || "DE";
    const ust = feldWert(q, "ust_id", "ust_idnr", "ust_id_nr", "umsatzsteuer_id", "vat");
    const email = feldWert(q, "email", "e_mail", "mail");
    const anschrift = [strasse, [plz, ort].filter(Boolean).join(" ")].filter(Boolean).join("\n");
    return { name, adresse: { strasse, plz, ort, land }, ust_idnr: ust, email, anschrift };
  }

  function baueAussteller(prof: any) {
    return {
      name: prof.firma_name || "",
      adresse: { strasse: prof.firma_strasse || "", plz: prof.firma_plz || "", ort: prof.firma_ort || "", land: "DE" },
      ust_idnr: prof.firma_ust_id || "",
      steuernummer: prof.firma_steuernummer || "",
      email: prof.firma_email || "",
    };
  }

  async function pruefeVor() {
    setHinweis("");
    setPruefung(null);
    try {
      const { data: p } = await supabase
        .from("profiles")
        .select("firma_name, firma_strasse, firma_plz, firma_ort, firma_email, firma_ust_id, firma_steuernummer")
        .single();
      const aussteller = baueAussteller(p || {});
      const erg = validiereERechnung({
        rechnung,
        positionen: (zeilen || []).map((z: any) => ({
          bezeichnung: z.bezeichnung, menge: z.menge, einheit: z.einheit,
          einzelpreis: z.einzelpreis, mwst_satz: z.mwst_satz, gesamt_netto: zeileNetto(z),
        })),
        aussteller,
        empfaenger: baueEmpfaenger(),
        profil,
        leitweg_id: profil === "xrechnung" ? leitweg.trim() : undefined,
      });
      setPruefung(erg);
    } catch (e: any) {
      setHinweis("Prüfung fehlgeschlagen: " + (e?.message || String(e)));
    }
  }

  async function erzeuge() {
    if (!rechnung) return;
    setLaden(true);
    setHinweis("");
    try {
      const { data: p } = await supabase
        .from("profiles")
        .select("firma_name, firma_strasse, firma_plz, firma_ort, firma_email, firma_ust_id, firma_steuernummer")
        .single();
      const prof: any = p || {};
      const aussteller = {
        name: prof.firma_name || "",
        adresse: { strasse: prof.firma_strasse || "", plz: prof.firma_plz || "", ort: prof.firma_ort || "", land: "DE" },
        ust_idnr: prof.firma_ust_id || "",
        steuernummer: prof.firma_steuernummer || "",
        email: prof.firma_email || "",
      };

      const body: any = {
        rechnung,
        positionen: (zeilen || []).map((z: any) => ({
          bezeichnung: z.bezeichnung, menge: z.menge, einheit: z.einheit,
          einzelpreis: z.einzelpreis, mwst_satz: z.mwst_satz, gesamt_netto: zeileNetto(z),
        })),
        aussteller,
        empfaenger: baueEmpfaenger(),
        profil,
      };
      if (profil === "xrechnung" && leitweg.trim()) body.leitweg_id = leitweg.trim();

      const res = await fetch("/api/rechnung-e", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setHinweis("E-Rechnung konnte nicht erstellt werden."); return; }

      const warn = res.headers.get("x-argonaut-warnungen");
      if (warn) {
        const txt = decodeURIComponent(warn);
        if (txt) setHinweis("Hinweise: " + txt);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const endung = profil === "xrechnung" ? "XRechnung" : "ZUGFeRD";
      a.download = endung + "_" + ((rechnung && rechnung.rechnungsnummer) || "Rechnung") + ".xml";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (!warn) setOffen(false);
    } catch (e: any) {
      setHinweis("Unerwarteter Fehler: " + (e?.message || String(e)));
    } finally {
      setLaden(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setOffen(true); setPruefung(null); setTimeout(() => pruefeVor(), 50); }}
        style={{ padding: "10px 16px", background: "transparent", color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
        title="E-Rechnung als XRechnung- oder ZUGFeRD-XML (EN 16931) erzeugen"
      >
        E-Rechnung (XML)
      </button>

      {offen && (
        <div
          onClick={() => !laden && setOffen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(4,10,20,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}
        >
          <div
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{ background: NAVY2, border: `1px solid ${LINE}`, borderRadius: 14, padding: "24px 26px", maxWidth: 460, width: "100%", color: TEXT }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 4, color: GOLD }}>E-Rechnung erzeugen</div>
            <div style={{ fontSize: 13, color: DIM, marginBottom: 20 }}>
              Wähle das Format. XRechnung für Behörden, ZUGFeRD für Firmenkunden.
            </div>

            {/* Profil-Wahl */}
            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              <ProfilBtn aktiv={profil === "zugferd"} onClick={() => { setProfil("zugferd"); setTimeout(() => pruefeVor(), 30); }} titel="ZUGFeRD" sub="Firmenkunden" />
              <ProfilBtn aktiv={profil === "xrechnung"} onClick={() => { setProfil("xrechnung"); setTimeout(() => pruefeVor(), 30); }} titel="XRechnung" sub="Behörden / B2G" />
            </div>

            {/* Leitweg-ID nur bei XRechnung */}
            {profil === "xrechnung" && (
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12, color: DIM, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Leitweg-ID (von der Behörde) — optional
                </label>
                <input
                  value={leitweg}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeitweg(e.target.value)}
                  placeholder="z. B. 04011000-1234512345-06"
                  style={{ width: "100%", background: "rgba(0,229,255,0.04)", border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 12px", color: TEXT, fontSize: 14, outline: "none" }}
                />
                <div style={{ fontSize: 11, color: DIM, marginTop: 6 }}>
                  Leer lassen, wenn keine Behörden-Rechnung. Die ID gibt dir die jeweilige Behörde.
                </div>
              </div>
            )}

            {hinweis && (
              <div style={{ marginBottom: 16, fontSize: 12, color: GOLD, background: "rgba(201,168,76,0.08)", border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 12px" }}>
                {hinweis}
              </div>
            )}

            {/* P34: Validierungs-Ergebnis */}
            {pruefung && (
              <div style={{ marginBottom: 18 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: pruefung.punkte.length ? 8 : 0,
                  fontSize: 14, fontWeight: 700,
                  color: pruefung.konform ? "#00e676" : "#ff6b6b",
                }}>
                  {pruefung.konform
                    ? "✓ EN 16931 – konform"
                    : `✗ ${pruefung.fehlerAnzahl} Fehler gefunden`}
                  {pruefung.konform && pruefung.warnungAnzahl > 0 && (
                    <span style={{ color: GOLD, fontWeight: 500 }}>· {pruefung.warnungAnzahl} Hinweis(e)</span>
                  )}
                </div>
                {pruefung.punkte.length > 0 && (
                  <div style={{ maxHeight: 160, overflowY: "auto", border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", background: "rgba(0,0,0,0.15)" }}>
                    {pruefung.punkte.map((pt: { regel: string; stufe: string; text: string }, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: DIM, padding: "3px 0", lineHeight: 1.4 }}>
                        <span style={{ marginRight: 6 }}>
                          {pt.stufe === "fehler" ? "🔴" : pt.stufe === "warnung" ? "🟡" : "🔵"}
                        </span>
                        {pt.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => !laden && setOffen(false)}
                style={{ padding: "9px 16px", background: "transparent", color: DIM, border: `1px solid ${LINE}`, borderRadius: 8, cursor: "pointer", fontSize: 14 }}
              >
                Abbrechen
              </button>
              <button
                onClick={erzeuge}
                disabled={laden}
                style={{
                  padding: "9px 18px",
                  background: pruefung && !pruefung.konform ? "transparent" : GOLD,
                  color: pruefung && !pruefung.konform ? "#ff6b6b" : "#0A1628",
                  border: pruefung && !pruefung.konform ? "1px solid #ff6b6b" : "none",
                  borderRadius: 8, fontWeight: 700, cursor: laden ? "default" : "pointer",
                  fontSize: 14, opacity: laden ? 0.6 : 1,
                }}
              >
                {laden ? "Erzeuge…" : (pruefung && !pruefung.konform ? "Trotzdem herunterladen" : "Herunterladen")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProfilBtn({ aktiv, onClick, titel, sub }: { aktiv: boolean; onClick: () => void; titel: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "12px 10px", borderRadius: 10, cursor: "pointer", textAlign: "center",
        background: aktiv ? "rgba(201,168,76,0.12)" : "transparent",
        border: `1px solid ${aktiv ? GOLD : "rgba(201,168,76,0.2)"}`,
        color: aktiv ? GOLD : DIM,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 800 }}>{titel}</div>
      <div style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>
    </button>
  );
}
