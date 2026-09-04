"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import KiGuide from "./KiGuide";
import { NAV_LINKS } from "@/lib/rechte";
import { modulGuide } from "@/lib/kiGuideModule";
import { istVorlesenMoeglich, sprich, stoppeVorlesen, baueVorleseText } from "@/lib/vorlesen";

// ---------------------------------------------------------------------
// ARGONAUT OS · KI-GUIDE STUFE 3 — der Begleiter, der mitwandert
//
// Stufe 2 sass auf der Einrichtungsseite und blieb dort. Stufe 3 haengt im
// Dashboard-LAYOUT: der Guide liest den aktuellen Pfad und sagt zu JEDEM
// Baustein etwas — ohne dass eine der rund 130 Modulseiten angefasst wird.
//
// ZURUECKHALTEND, NICHT AUFDRINGLICH
// Standard ist ZU: unten links ein runder Knopf. Erst ein Klick klappt die
// Sprechblase auf. Der Zustand wird im Browser gemerkt (localStorage) — wer
// ihn zumacht, hat ihn beim naechsten Aufruf wieder zu. Kein Server, keine
// Datenbank, keine Spalte.
//
// PLATZWAHL: links unten, aber ueber dem Praesentations-Knopf (der sitzt auf
// left 16 / bottom 16). Rechts unten liegt der PULS-Chat. Deshalb 16/84.
//
// STIMME: der 🔊-Knopf erscheint nur, wenn der Browser wirklich vorlesen kann
// (istVorlesenMoeglich). Beim Seitenwechsel wird das Vorlesen gestoppt —
// sonst redet der Guide ueber die alte Seite weiter.
// ---------------------------------------------------------------------

const SPEICHER_SCHLUESSEL = "argonaut_guide_offen";

const A = {
  navy: "#0A1628",
  navy2: "#0F1F33",
  gold: "#C9A84C",
  cyan: "#00e5ff",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.10)",
};

export default function KiGuideBegleiter() {
  const pfad = usePathname();
  const [offen, setOffen] = useState(false);
  const [kannVorlesen, setKannVorlesen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  // Erst nach dem ersten Zeichnen: auf dem Server gibt es weder window noch
  // localStorage, und ein Unterschied zwischen Server- und Browser-Ausgabe
  // waere ein Hydrations-Fehler.
  useEffect(() => {
    setKannVorlesen(istVorlesenMoeglich());
    try {
      if (window.localStorage.getItem(SPEICHER_SCHLUESSEL) === "1") setOffen(true);
    } catch {
      // Privater Modus oder gesperrte Speicherung: dann bleibt er einfach zu.
    }
    return () => stoppeVorlesen();
  }, []);

  // Seitenwechsel: Stimme aus, damit nicht der Text der vorigen Seite
  // weiterlaeuft.
  useEffect(() => {
    stoppeVorlesen();
    setLaeuft(false);
  }, [pfad]);

  const inhalt = useMemo(() => modulGuide(pfad || "/dashboard", NAV_LINKS), [pfad]);

  function umschalten() {
    setOffen((v) => {
      const neu = !v;
      try {
        window.localStorage.setItem(SPEICHER_SCHLUESSEL, neu ? "1" : "0");
      } catch {
        // Nicht speichern zu koennen ist kein Grund, den Knopf nicht zu bedienen.
      }
      if (!neu) {
        stoppeVorlesen();
        setLaeuft(false);
      }
      return neu;
    });
  }

  function vorlesen() {
    if (laeuft) {
      stoppeVorlesen();
      setLaeuft(false);
      return;
    }
    const text = baueVorleseText({
      begruessung: inhalt.begruessung,
      nachricht: inhalt.nachricht,
      schritte: inhalt.schritte,
    });
    setLaeuft(sprich(text));
  }

  if (!offen) {
    return (
      <button
        type="button"
        onClick={umschalten}
        title="ARGONAUT-Guide zu dieser Seite"
        aria-label="ARGONAUT-Guide öffnen"
        style={knopf}
      >
        <svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true" style={{ display: "block" }}>
          <path
            d="M50 8 L58 38 L88 46 L58 54 L50 84 L42 54 L12 46 L42 38 Z"
            fill={A.gold}
            opacity="0.95"
          />
        </svg>
      </button>
    );
  }

  return (
    <div style={panel}>
      <div style={panelKopf}>
        <span style={{ color: A.textDim, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
          Ihr Guide
        </span>
        <button type="button" onClick={umschalten} style={schliessenBtn} title="Guide schließen">
          ✕
        </button>
      </div>
      <KiGuide
        begruessung={inhalt.begruessung}
        nachricht={inhalt.nachricht}
        schritte={inhalt.schritte}
        aktionText={inhalt.aktionText}
        aktionHref={inhalt.aktionHref}
        stimmung={inhalt.stimmung}
        fortschritt={inhalt.fortschritt}
        onVorlesen={kannVorlesen ? vorlesen : undefined}
      />
    </div>
  );
}

const knopf: React.CSSProperties = {
  position: "fixed",
  left: 16,
  bottom: 84,
  zIndex: 9997,
  width: 52,
  height: 52,
  borderRadius: "50%",
  background: A.navy2,
  border: `1px solid ${A.gold}55`,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
};

const panel: React.CSSProperties = {
  position: "fixed",
  left: 16,
  bottom: 84,
  zIndex: 9997,
  width: "min(400px, calc(100vw - 32px))",
  maxHeight: "min(70vh, 620px)",
  overflowY: "auto",
  background: A.navy,
  border: `1px solid ${A.border}`,
  borderRadius: 18,
  padding: "12px 12px 0",
  boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
};

const panelKopf: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "2px 4px 8px",
};

const schliessenBtn: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${A.border}`,
  borderRadius: 8,
  padding: "2px 9px",
  fontSize: 13,
  cursor: "pointer",
  color: A.textDim,
  fontFamily: "inherit",
};
