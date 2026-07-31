"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { STANDARD_TOUR, begrenzeIndex, tourFortschritt, istLetzter, type TourSchritt } from "@/lib/gefuehrteTour";

// ---------------------------------------------------------------------
// ARGONAUT OS · GEFÜHRTE TOUR (Spotlight-Guide) · Stufe 2 des KI-Guides
//
// Martins Bild: Der Guide redet nicht nur — er ZEIGT. Ein Scheinwerfer legt
// sich über den Bildschirm, NUR das Ziel (z. B. der CRM-Menüpunkt) bleibt hell
// und bekommt einen leuchtenden Ring, eine 👉-Hand zeigt drauf, und die
// Sprechblase erklärt „Hier ist dein CRM …". „Weiter" springt zum nächsten Ziel.
//
// Kein Umbau der Navigation nötig: die Menüpunkte sind <a href="/dashboard/…">,
// die Tour trifft sie per href-Selektor (siehe lib/gefuehrteTour STANDARD_TOUR).
// Ziele, die es beim Kunden nicht gibt (nicht gebucht/ausgeblendet), werden
// automatisch übersprungen.
//
// EVOLUTION: dieselbe Persona wie <KiGuide>. Später kann die 👉-Hand Martins
// Hand und der Erklärtext Martins Stimme sein (TTS beim Schrittwechsel).
// ---------------------------------------------------------------------

const A = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  text: "#FFFFFF",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.12)",
};

type Rect = { top: number; left: number; width: number; height: number };

export type GefuehrteTourProps = {
  offen: boolean;
  onFertig: () => void;
  schritte?: TourSchritt[];
  /** Anzeigename in der Sprechblase. */
  name?: string;
};

const PAD = 8; // Rand um das Ziel im Scheinwerfer

export default function GefuehrteTour({ offen, onFertig, schritte = STANDARD_TOUR, name = "ARGONAUT" }: GefuehrteTourProps) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [fehlt, setFehlt] = useState(false);

  const n = schritte.length;
  const schritt = schritte[begrenzeIndex(idx, n)];

  // Ziel messen: Element per Selektor suchen, in den Blick scrollen, Position holen.
  const messen = useCallback(() => {
    if (!offen || !schritt) return;
    const el = document.querySelector(schritt.selector) as HTMLElement | null;
    if (!el) { setRect(null); setFehlt(true); return; }
    setFehlt(false);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [offen, schritt]);

  useEffect(() => {
    if (!offen) return;
    const el = schritt ? (document.querySelector(schritt.selector) as HTMLElement | null) : null;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    }
    // nach dem (evtl. sanften) Scrollen zweimal messen
    const t1 = setTimeout(messen, 60);
    const t2 = setTimeout(messen, 380);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [offen, idx, schritt, messen]);

  useEffect(() => {
    if (!offen) return;
    const h = () => messen();
    window.addEventListener("resize", h);
    window.addEventListener("scroll", h, true);
    return () => { window.removeEventListener("resize", h); window.removeEventListener("scroll", h, true); };
  }, [offen, messen]);

  // ESC beendet die Tour
  useEffect(() => {
    if (!offen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") beenden(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen]);

  const fortschritt = useMemo(() => tourFortschritt(idx, n), [idx, n]);
  const letzter = istLetzter(idx, n);

  function beenden() { setIdx(0); setRect(null); setFehlt(false); onFertig(); }
  function weiter() { if (letzter) { beenden(); return; } setIdx((i) => begrenzeIndex(i + 1, n)); }
  function zurueck() { setIdx((i) => begrenzeIndex(i - 1, n)); }

  if (!offen || !schritt) return null;

  // Sprechblasen-Position: unter dem Ziel, sonst darüber; horizontal im Fenster halten.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const bubbleBreite = Math.min(380, vw - 32);
  let bubbleTop = 24, bubbleLeft = Math.max(16, (vw - bubbleBreite) / 2);
  if (rect) {
    const untenPlatz = vh - (rect.top + rect.height);
    if (untenPlatz > 240) bubbleTop = rect.top + rect.height + PAD + 16;
    else bubbleTop = Math.max(16, rect.top - 220);
    bubbleLeft = Math.min(Math.max(rect.left, 16), vw - bubbleBreite - 16);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} aria-live="polite">
      <style>{`
        @keyframes argoTourRing {
          0%   { box-shadow: 0 0 0 0 ${A.cyan}88, 0 0 0 9999px rgba(10,22,40,0.82); }
          70%  { box-shadow: 0 0 0 10px ${A.cyan}00, 0 0 0 9999px rgba(10,22,40,0.82); }
          100% { box-shadow: 0 0 0 0 ${A.cyan}00, 0 0 0 9999px rgba(10,22,40,0.82); }
        }
        @keyframes argoTourHand { 0%,100% { transform: translateY(0); } 50% { transform: translateY(6px); } }
      `}</style>

      {/* Klick-Sperre für den abgedunkelten Bereich (verhindert versehentliches Wegklicken) */}
      <div style={{ position: "absolute", inset: 0, cursor: "default" }} onClick={(e) => e.stopPropagation()} />

      {/* Scheinwerfer: Loch + pulsierender Ring + Abdunklung ringsum (nur Optik) */}
      {rect && (
        <div
          style={{
            position: "absolute",
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 12,
            pointerEvents: "none",
            animation: "argoTourRing 2.2s ease-out infinite",
            transition: "top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease",
          }}
        />
      )}

      {/* Klickbares Ziel-Feld: „auf das Leuchten klicken" führt weiter */}
      {rect && (
        <div
          onClick={weiter}
          title="Weiter"
          style={{
            position: "absolute",
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 12,
            cursor: "pointer",
            zIndex: 10000,
          }}
        />
      )}

      {/* Zeigende Hand über dem Ziel */}
      {rect && (
        <div
          style={{
            position: "absolute",
            top: Math.max(2, rect.top - PAD - 34),
            left: rect.left + rect.width / 2 - 12,
            fontSize: 26,
            zIndex: 10000,
            pointerEvents: "none",
            animation: "argoTourHand 1.2s ease-in-out infinite",
          }}
          aria-hidden="true"
        >
          👇
        </div>
      )}

      {/* Sprechblase mit Erklärung + Steuerung */}
      <div
        style={{
          position: "absolute",
          top: bubbleTop,
          left: bubbleLeft,
          width: bubbleBreite,
          background: A.navy2,
          border: `1px solid ${A.gold}55`,
          borderRadius: 16,
          padding: "16px 18px",
          zIndex: 10001,
          boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
          fontFamily: "var(--font-dm-sans), sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span style={{ color: A.gold, fontWeight: 800, fontSize: "clamp(15px, 1.35vw, 21px)" }}>👋 {schritt.titel}</span>
          <span style={{ color: A.textDim, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
            {fortschritt.aktuell}/{fortschritt.gesamt}
          </span>
        </div>

        <p style={{ margin: "8px 0 0", color: A.text, fontSize: "clamp(14px, 1.2vw, 19px)", lineHeight: 1.5 }}>
          {schritt.text}
        </p>

        {fehlt && (
          <p style={{ margin: "8px 0 0", color: A.textDim, fontSize: 13 }}>
            Diesen Bereich hast du gerade nicht aktiv — mit „Weiter" geht’s zum nächsten.
          </p>
        )}

        {/* Fortschrittsbalken */}
        <div style={{ height: 5, borderRadius: 3, background: A.border, margin: "14px 0 12px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${fortschritt.prozent}%`, background: A.gold, transition: "width 0.25s ease" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <button onClick={beenden} style={btnGhost}>Überspringen</button>
          <div style={{ display: "flex", gap: 8 }}>
            {idx > 0 && <button onClick={zurueck} style={btnGhost}>Zurück</button>}
            <button onClick={weiter} style={btnGold}>{letzter ? "Fertig ✓" : "Weiter ›"}</button>
          </div>
        </div>

        <div style={{ marginTop: 8, color: A.textDim, fontSize: 11, textAlign: "right" }}>{name} führt dich · ESC beendet</div>
      </div>
    </div>
  );
}

const btnGold: React.CSSProperties = {
  background: A.gold, color: A.navy, border: "none", borderRadius: 9, padding: "9px 16px",
  fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
};
const btnGhost: React.CSSProperties = {
  background: "transparent", color: A.textDim, border: `1px solid ${A.border}`, borderRadius: 9,
  padding: "9px 14px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
};
