// ============================================================================
// ARGONAUT OS · Komponente "KiKlartext" (Etappe 1, Baustein 2)
// Die "Was heißt das für mich?"-Zeile für jeden Reiter.
// Zeigt einen KI-Klartext + die nächste beste Aktion.
//
// Zwei Betriebsarten:
//   1) KI-Modus  – "kontext" setzen -> holt Einschätzung von /api/ki-klartext
//   2) Statik    – "staticKlartext" (+ optional "staticAktion") setzen ->
//                  kein KI-Aufruf, zeigt festen Text (spart KI-Calls)
//
// Inline-Styles (kein Tailwind). Branding: ARGONAUT / "die KI" – nie "Claude".
// ============================================================================
"use client";

import { useEffect, useRef, useState } from "react";

const NAVY = "#0A1628";
const GOLD = "#C9A84C";
const CYAN = "#00e5ff";

export interface KiKlartextProps {
  /** KI-Modus: kurze Lage mit echten Zahlen, z. B. "3 Rechnungen überfällig, 4.200 € offen". */
  kontext?: string;
  /** Optionaler Bereichsname für den Prompt, z. B. "Rechnungen". */
  modul?: string;
  /** Ziel-Link für den Aktions-Button (kennt nur der jeweilige Reiter). */
  aktionHref?: string;
  /** Statik-Modus: fester Klartext ohne KI-Aufruf. */
  staticKlartext?: string;
  /** Statik-Modus: fester Aktions-Text. */
  staticAktion?: string;
  /** Akzentfarbe des linken Balkens (z. B. an die Ampel gekoppelt). Default Gold. */
  akzent?: string;
  /** Weißer Text + dunkle Box für Navy-Hintergründe (z. B. Leads-Seite). */
  dunkel?: boolean;
  /** Zusätzlicher Style am äußeren Container. */
  style?: React.CSSProperties;
}

export default function KiKlartext({
  kontext,
  modul,
  aktionHref,
  staticKlartext,
  staticAktion,
  akzent = GOLD,
  dunkel = false,
  style,
}: KiKlartextProps) {
  const statisch = typeof staticKlartext === "string" && staticKlartext.length > 0;

  // Farbschema je nach Hintergrund
  const boxBg = dunkel
    ? "rgba(255,255,255,0.04)"
    : "linear-gradient(180deg, rgba(10,22,40,0.04), rgba(10,22,40,0.02))";
  const boxBorder = dunkel ? "rgba(255,255,255,0.12)" : "rgba(10,22,40,0.10)";
  const textHaupt = dunkel ? "rgba(255,255,255,0.88)" : NAVY;
  const textKopf = dunkel ? "rgba(255,255,255,0.92)" : NAVY;
  const skeletonBg = dunkel ? "rgba(255,255,255,0.10)" : "rgba(10,22,40,0.12)";
  const textFehler = dunkel ? "rgba(255,255,255,0.55)" : "#64748b";
  const aktionBtnBg = dunkel ? GOLD : NAVY;
  const aktionBtnText = dunkel ? NAVY : GOLD;

  const [laden, setLaden] = useState<boolean>(!statisch);
  const [fehler, setFehler] = useState<boolean>(false);
  const [klartext, setKlartext] = useState<string>(statisch ? (staticKlartext as string) : "");
  const [aktion, setAktion] = useState<string>(statisch ? (staticAktion || "") : "");
  const abbruch = useRef<AbortController | null>(null);

  async function laden_() {
    if (!kontext || !kontext.trim()) {
      setLaden(false);
      return;
    }
    abbruch.current?.abort();
    const ctrl = new AbortController();
    abbruch.current = ctrl;

    setLaden(true);
    setFehler(false);
    try {
      const res = await fetch("/api/ki-klartext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kontext, modul }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("http " + res.status);
      const data = await res.json();
      setKlartext(String(data?.klartext || "").trim());
      setAktion(String(data?.aktion || "").trim());
    } catch (e: any) {
      if (e?.name === "AbortError") return; // absichtlich abgebrochen
      setFehler(true);
    } finally {
      if (abbruch.current === ctrl) setLaden(false);
    }
  }

  useEffect(() => {
    if (statisch) return;
    laden_();
    return () => abbruch.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kontext, modul, statisch]);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 12,
        background: boxBg,
        border: `1px solid ${boxBorder}`,
        borderLeft: `4px solid ${akzent}`,
        ...style,
      }}
    >
      {/* Keyframes lokal (eindeutiger Name -> keine Kollision) */}
      <style>{`@keyframes argKiPuls{0%,100%{opacity:.45}50%{opacity:.9}}`}</style>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Kopf-Label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: CYAN,
              boxShadow: `0 0 8px ${CYAN}`,
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: textKopf,
              fontFamily: "'Syne', sans-serif",
            }}
          >
            ARGONAUT · Was heißt das für mich?
          </span>
        </div>

        {/* Lade-Zustand (Skeleton) */}
        {laden && (
          <div aria-label="Einschätzung wird geladen">
            {[92, 74].map((w, i) => (
              <div
                key={i}
                style={{
                  height: 11,
                  width: `${w}%`,
                  borderRadius: 6,
                  background: skeletonBg,
                  marginBottom: 8,
                  animation: "argKiPuls 1.2s ease-in-out infinite",
                }}
              />
            ))}
          </div>
        )}

        {/* Fehler-Zustand (dezent, mit Wiederholen) */}
        {!laden && fehler && (
          <div style={{ fontSize: 14, color: textFehler, fontFamily: "'DM Sans', sans-serif" }}>
            Einschätzung gerade nicht verfügbar.{" "}
            <button
              onClick={laden_}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: textKopf,
                fontWeight: 600,
                textDecoration: "underline",
                cursor: "pointer",
                fontSize: 14,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Erneut versuchen
            </button>
          </div>
        )}

        {/* Ergebnis */}
        {!laden && !fehler && klartext && (
          <>
            <p
              style={{
                margin: 0,
                fontSize: 14.5,
                lineHeight: 1.55,
                color: textHaupt,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {klartext}
            </p>

            {aktion && (
              <div style={{ marginTop: 10 }}>
                {aktionHref ? (
                  <a
                    href={aktionHref}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px",
                      borderRadius: 8,
                      background: aktionBtnBg,
                      color: aktionBtnText,
                      fontSize: 13.5,
                      fontWeight: 700,
                      textDecoration: "none",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {aktion}
                    <span aria-hidden style={{ color: CYAN }}>→</span>
                  </a>
                ) : (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: textHaupt,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <span aria-hidden style={{ color: GOLD }}>➜</span>
                    {aktion}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
