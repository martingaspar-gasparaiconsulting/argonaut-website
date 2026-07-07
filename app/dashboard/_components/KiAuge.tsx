"use client";
import { useState } from "react";

// ---------------------------------------------------------------------
// ARGONAUT OS · KI-AUGE (Übersichts-Auge) · eigenständiges Bauteil
// Wiederverwendbar in ALLEN Listen-/Übersichts-Modulen.
//
// Idee (Martins "wachendes Auge"): Der Chef klickt EINMAL oben auf das
// Auge → die KI liest die Kennzahlen der ganzen Übersicht → sagt in
// Klartext + Stichpunkten, worum er sich JETZT kümmern soll.
//
// UNABHÄNGIG: ruft die eigene Route /api/ki-auge (kein KiKlartext nötig).
// KOSTEN-BEWUSST: KI startet ERST beim Aufklappen, nicht bei jedem Laden.
//
// EINSATZ pro Modul (Beispiel Personal):
//   <KiAuge
//     modul="Personal"
//     kontext={`15 Mitarbeiter. 3 aktuell abwesend (krank/Urlaub).
//               2 Schulungen abgelaufen. 1 Checkliste offen.`}
//     aktionHref="/dashboard/personal"
//     aktionText="Zum Personal-Cockpit"
//   />
// ---------------------------------------------------------------------

const A = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  green: "#4CAF7D",
  warn: "#E0A24C",
  danger: "#E06666",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.10)",
};

type Stimmung = "gut" | "neutral" | "achtung";

type AugeErgebnis = {
  klartext: string;
  punkte: string[];
  stimmung: Stimmung;
};

export type KiAugeProps = {
  /** Anzeigename des Moduls, z.B. "Personal", "Lager", "Mahnwesen". */
  modul: string;
  /** Die Lage in Zahlen als kurzer Text — das füttert die KI. */
  kontext: string;
  /** Optional: Ziel-Link des Handlungs-Buttons unter der KI-Antwort. */
  aktionHref?: string;
  /** Optional: Beschriftung des Handlungs-Buttons. */
  aktionText?: string;
  /** Optional: eigener Text im Auge-Button. */
  label?: string;
};

function stimmungsFarbe(s: Stimmung): string {
  if (s === "achtung") return A.danger;
  if (s === "gut") return A.green;
  return A.cyan;
}

export default function KiAuge({
  modul,
  kontext,
  aktionHref,
  aktionText,
  label,
}: KiAugeProps) {
  const [offen, setOffen] = useState(false);
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<AugeErgebnis | null>(null);

  const buttonText = label || "Was heißt das gerade für mich?";

  async function starten() {
    setLaden(true);
    setFehler(null);
    try {
      const res = await fetch("/api/ki-auge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modul, kontext }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setFehler(data?.error || "Die KI ist gerade nicht erreichbar.");
        setLaden(false);
        return;
      }
      setErgebnis({
        klartext: data.klartext || "",
        punkte: Array.isArray(data.punkte) ? data.punkte : [],
        stimmung: (data.stimmung as Stimmung) || "neutral",
      });
    } catch {
      setFehler("Verbindung zur KI fehlgeschlagen.");
    } finally {
      setLaden(false);
    }
  }

  function umschalten() {
    const neu = !offen;
    setOffen(neu);
    // Beim ersten Öffnen automatisch die KI starten (nur wenn noch kein Ergebnis).
    if (neu && !ergebnis && !laden) {
      void starten();
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Dezent pulsierende Cyan-Umrandung als "klick mich"-Signal.
          Reine CSS-Animation → kostet keine Token. Pulsiert nur, solange
          das Auge geschlossen ist; beim Öffnen hört das Pulsieren auf. */}
      <style>{`
        @keyframes argoAugePuls {
          0%   { box-shadow: 0 0 0 0 rgba(0,229,255,0.45); }
          70%  { box-shadow: 0 0 0 8px rgba(0,229,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,229,255,0); }
        }
      `}</style>
      {/* Auslöser: das Auge */}
      <button
        onClick={umschalten}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderRadius: 10,
          border: `1px solid ${offen ? A.cyan : A.cyan}`,
          background: offen ? "rgba(0,229,255,0.10)" : "rgba(0,229,255,0.05)",
          color: offen ? A.cyan : "#fff",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          transition: "all 0.15s ease",
          animation: offen ? "none" : "argoAugePuls 2.4s ease-out infinite",
        }}
        title="Die KI liest die Übersicht und sagt dir, was jetzt wichtig ist"
      >
        <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">
          👁
        </span>
        <span>{buttonText}</span>
        <span style={{ fontSize: 11, color: A.textDim, fontWeight: 400 }}>
          {offen ? "▲" : "▼"}
        </span>
      </button>

      {/* Aufklapp-Bereich */}
      {offen && (
        <div
          style={{
            marginTop: 12,
            background: A.navy2,
            border: `1px solid ${A.border}`,
            borderRadius: 14,
            padding: "18px 20px",
          }}
        >
          {/* Kopfzeile */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              fontFamily: "Syne, sans-serif",
              fontSize: 14,
              fontWeight: 700,
              color: A.gold,
            }}
          >
            👁 ARGONAUT · Was heißt das gerade für mich?
          </div>

          {laden && (
            <div style={{ color: A.textDim, fontSize: 14, fontFamily: "DM Sans, sans-serif" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 16,
                  height: 16,
                  marginRight: 8,
                  verticalAlign: "middle",
                  border: `2px solid ${A.border}`,
                  borderTopColor: A.cyan,
                  borderRadius: "50%",
                  animation: "argoAugeSpin 0.8s linear infinite",
                }}
              />
              ARGONAUT liest die Übersicht …
              <style>{`@keyframes argoAugeSpin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {fehler && !laden && (
            <div style={{ fontFamily: "DM Sans, sans-serif" }}>
              <div style={{ color: A.danger, fontSize: 14, marginBottom: 10 }}>
                {fehler}
              </div>
              <button
                onClick={starten}
                style={{
                  background: "transparent",
                  color: A.cyan,
                  border: `1px solid ${A.cyan}`,
                  borderRadius: 8,
                  padding: "7px 14px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Erneut versuchen
              </button>
            </div>
          )}

          {ergebnis && !laden && !fehler && (
            <div style={{ fontFamily: "DM Sans, sans-serif" }}>
              {ergebnis.klartext && (
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#fff",
                    marginBottom: ergebnis.punkte.length > 0 ? 14 : 0,
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 10,
                      height: 10,
                      marginTop: 6,
                      borderRadius: "50%",
                      background: stimmungsFarbe(ergebnis.stimmung),
                      boxShadow: `0 0 8px ${stimmungsFarbe(ergebnis.stimmung)}`,
                    }}
                  />
                  <span>{ergebnis.klartext}</span>
                </div>
              )}

              {ergebnis.punkte.length > 0 && (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {ergebnis.punkte.map((p, i) => (
                    <li
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "7px 0",
                        borderTop: i === 0 ? "none" : `1px solid ${A.border}`,
                        fontSize: 14,
                        color: "#fff",
                      }}
                    >
                      <span style={{ color: A.cyan, flexShrink: 0 }}>→</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              )}

              {aktionHref && (
                <a
                  href={aktionHref}
                  style={{
                    display: "inline-block",
                    marginTop: 14,
                    background: A.gold,
                    color: A.navy,
                    borderRadius: 8,
                    padding: "9px 16px",
                    fontSize: 14,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  {aktionText || "Jetzt ansehen"}
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
