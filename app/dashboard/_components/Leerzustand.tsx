"use client";
import React from "react";

// ---------------------------------------------------------------------
// ARGONAUT OS · Leerzustands-Baustein (Punkt 18)
// Einheitlicher, freundlicher „Noch nichts hier"-Zustand für alle Module.
// Zeigt Icon + Titel + Erklärung, optional eine Aktion und „So geht's"-Schritte.
//
// EINBAU: statt der grauen „Noch keine …"-Zeile:
//   {liste.length === 0 ? (
//     <Leerzustand icon="📄" titel="Noch keine Angebote"
//       text="Hier entstehen deine Angebote …"
//       schritte={["Kunde wählen", "Positionen erfassen", "Als PDF senden"]}
//       aktionText="Erstes Angebot" aktionHref="/dashboard/angebote/neu" />
//   ) : ( … Liste … )}
// ---------------------------------------------------------------------

const C = {
  navy2: "#0F1F33",
  gold: "#C9A84C",
  text: "#FFFFFF",
  textDim: "#8FA3BE",
  border: "rgba(255,255,255,0.08)",
};

export type LeerzustandProps = {
  icon?: string;
  titel: string;
  text?: string;
  schritte?: string[];
  aktionText?: string;
  aktionHref?: string;
  onAktion?: () => void;
};

export default function Leerzustand({
  icon = "✨",
  titel,
  text,
  schritte,
  aktionText,
  aktionHref,
  onAktion,
}: LeerzustandProps) {
  const knopf = aktionText
    ? aktionHref
      ? (
        <a href={aktionHref} style={btn}>
          {aktionText}
        </a>
      )
      : (
        <button type="button" onClick={onAktion} style={btn}>
          {aktionText}
        </button>
      )
    : null;

  return (
    <div style={wrap}>
      <div style={{ fontSize: "clamp(38px, 4vw, 56px)", lineHeight: 1, marginBottom: 14 }}>{icon}</div>
      <div
        style={{
          fontFamily: "var(--font-dm-sans), sans-serif",
          fontWeight: 800,
          fontSize: "clamp(18px, 1.7vw, 26px)",
          color: C.text,
          marginBottom: 8,
        }}
      >
        {titel}
      </div>
      {text && (
        <p style={{ color: C.textDim, fontSize: "clamp(14px, 1.2vw, 19px)", lineHeight: 1.55, maxWidth: 520, margin: "0 auto" }}>
          {text}
        </p>
      )}
      {schritte && schritte.length > 0 && (
        <ol style={{ listStyle: "none", padding: 0, margin: "18px auto 0", maxWidth: 460, textAlign: "left", display: "grid", gap: 10 }}>
          {schritte.map((s, i) => (
            <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", color: C.textDim, fontSize: "clamp(13px, 1.13vw, 18px)" }}>
              <span
                style={{
                  flex: "0 0 auto",
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "rgba(201,168,76,0.15)",
                  color: C.gold,
                  fontWeight: 800,
                  fontSize: 13,
                  display: "grid",
                  placeItems: "center",
                  marginTop: 1,
                }}
              >
                {i + 1}
              </span>
              <span style={{ lineHeight: 1.5 }}>{s}</span>
            </li>
          ))}
        </ol>
      )}
      {knopf && <div style={{ marginTop: 20 }}>{knopf}</div>}
    </div>
  );
}

const wrap: React.CSSProperties = {
  background: C.navy2,
  border: `1px dashed ${C.border}`,
  borderRadius: 16,
  padding: "40px 24px",
  textAlign: "center",
};

const btn: React.CSSProperties = {
  display: "inline-block",
  background: C.gold,
  color: "#0A1628",
  border: "none",
  borderRadius: 10,
  padding: "11px 22px",
  fontWeight: 800,
  fontSize: "clamp(14px, 1.25vw, 19px)",
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: "var(--font-dm-sans), sans-serif",
};
